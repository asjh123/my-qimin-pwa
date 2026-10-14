import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function pngDimensions(path) {
  const data = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  check(data.subarray(0, 8).equals(signature), `${path} 不是有效PNG`);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function sourceStats(upstream) {
  const bookDir = resolve(upstream, "book");
  check(existsSync(bookDir), `验证指定的上游缺少 book/：${upstream}`);
  const files = readdirSync(bookDir).filter((name) => /^\d{2}-.+\.md$/u.test(name));
  let entries = 0;
  for (const file of files) {
    entries += (readFileSync(resolve(bookDir, file), "utf8").match(/^###\s+\d+\.\s+/gmu) || []).length;
  }
  return { chapters: files.length, entries };
}

for (const relative of [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "version.json",
  "update-history.json",
  "qimin-runtime.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
]) {
  check(existsSync(resolve(DIST, relative)), `缺少构建产物：dist/${relative}`);
}

const htmlPath = resolve(DIST, "index.html");
const html = readFileSync(htmlPath, "utf8");
const manifest = JSON.parse(readFileSync(resolve(DIST, "manifest.webmanifest"), "utf8"));
const version = JSON.parse(readFileSync(resolve(DIST, "version.json"), "utf8"));
const history = JSON.parse(readFileSync(resolve(DIST, "update-history.json"), "utf8"));
const sw = readFileSync(resolve(DIST, "sw.js"), "utf8");
const runtime = readFileSync(resolve(DIST, "qimin-runtime.js"), "utf8");

check(statSync(htmlPath).size > 200_000, "dist/index.html 过小，可能不是完整离线版");
check(html.includes("window.__CORPUS__"), "页面没有内联官方离线正文");
check(html.includes('id="q"') && html.includes('type="search"'), "页面缺少搜索功能");
check(html.includes('id="sidebar"') && html.includes('data-dim="grade"'), "页面缺少章节或证据筛选");
check(html.includes('id="theme"'), "页面缺少明暗模式");
check(/@media\s+print/u.test(html), "页面缺少打印样式");
check(html.includes('rel="manifest" href="./manifest.webmanifest"'), "页面未正确引用Manifest");
check(runtime.includes('register("./sw.js")'), "页面未注册Service Worker");
check(html.includes("发现新版本") && html.includes("更新到新版本") && html.includes("稍后再说"), "页面缺少受控新版提示");
check(html.includes('id="qimin-install"') && html.includes("安装到手机桌面"), "页面缺少安卓安装按钮");
check(runtime.includes('addEventListener("beforeinstallprompt"'), "安装按钮没有接入浏览器安装事件");
check(html.includes("这不是下载文件") && html.includes("安卓 Chrome"), "安装事件不可用时缺少准确指引");
check(runtime.includes('worker.postMessage({ type: "SKIP_WAITING" })'), "更新按钮未通知新Service Worker激活");
check(runtime.includes("if (reloadAfterActivation) location.reload()"), "新版激活后页面不会刷新");
check(html.includes('id="qimin-toc-nav"') && html.includes('id="qimin-toc-dialog"'), "页面缺少明确目录入口");
check(html.includes("继续上次阅读") && html.includes("从第一章开始") && html.includes("搜索内容"), "页面缺少开始阅读操作");
check(runtime.includes('document.getElementById(saved?.entryId)') && runtime.includes("qimin-reading-position-v1"), "阅读位置没有使用稳定锚点记录与恢复");
check(runtime.includes('$$("#list .sec-block")') && runtime.includes('$$(".card", section)'), "目录没有从实际章节DOM动态生成");
check(runtime.includes("text.value =") && !runtime.includes("innerHTML"), "更新内容必须通过安全文本方式渲染");
check(html.includes("我已知晓") && runtime.includes("qimin-acknowledged-release-v1"), "页面缺少更新确认机制");
check(html.includes("我的齐民要术"), "页面缺少项目名称");
check(html.includes("CC BY 4.0"), "页面缺少CC BY 4.0署名");
check(html.includes(version.upstreamCommit), "页面缺少完整上游提交编号");
check(!/Unlicense|公有领域/iu.test(html), "页面仍包含过期的Unlicense或公有领域说明");
check(!/<script\b[^>]*\bsrc=["']https?:/iu.test(html), "页面包含远程JavaScript");
check(!/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']https?:/iu.test(html), "页面包含远程CSS");
check(!/@font-face[\s\S]{0,300}url\(["']?https?:/iu.test(html), "页面包含远程字体");

check(manifest.name === "我的齐民要术", "Manifest名称错误");
check(manifest.start_url === "./" && manifest.scope === "./", "Manifest必须使用相对start_url和scope");
check(manifest.display === "standalone", "Manifest display必须为standalone");
check(manifest.orientation === "portrait-primary", "Manifest方向必须为portrait-primary");
check(Array.isArray(manifest.shortcuts) && manifest.shortcuts.some((item) => item.url === "./?action=toc") && manifest.shortcuts.some((item) => item.url === "./?action=search"), "Manifest目录或搜索快捷方式无效");
check(Array.isArray(manifest.icons) && manifest.icons.length === 3, "Manifest必须声明三个图标");
for (const icon of manifest.icons) {
  check(icon.src.startsWith("./") && !icon.src.startsWith("/"), `图标路径必须兼容仓库子目录：${icon.src}`);
}

for (const [file, expected] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
]) {
  const dimensions = pngDimensions(resolve(DIST, "icons", file));
  check(dimensions.width === expected && dimensions.height === expected, `${file}尺寸错误`);
}

check(version.cacheVersion === `${version.upstreamShortCommit}-${version.appShortCommit}`, "版本文件中的缓存版本错误");
check(version.releaseId === version.cacheVersion, "发布编号与缓存版本不一致");
check(history.schemaVersion === 1 && history.currentReleaseId === version.releaseId, "更新历史与当前版本不对应");
check(Array.isArray(history.records) && history.records.length <= 52, "更新历史格式或保留数量错误");
check(new Set(history.records.map((item) => item.releaseId)).size === history.records.length, "更新历史存在重复版本");
for (const record of history.records) {
  check(record.releaseId && typeof record.complete === "boolean", "更新记录缺少版本或完整性标志");
  for (const key of ["addedEntries", "removedEntries", "changedEntries"]) {
    check(Array.isArray(record[key]), `更新记录 ${key} 不是数组`);
    for (const entry of record[key]) {
      check(Object.keys(entry).every((name) => ["section", "number", "chapter", "title"].includes(name)), "更新记录包含正文或非必要字段");
      check(JSON.stringify(entry).length < 500, "更新记录疑似泄漏完整正文");
    }
  }
}
check(sw.includes(`qimin-${version.cacheVersion}`), "Service Worker缓存版本与上游及应用提交不一致");
check(sw.includes('event.data?.type === "SKIP_WAITING"'), "Service Worker缺少受控更新消息");
check(!/https:\/\//u.test(sw), "Service Worker不应缓存或请求外部地址");
for (const asset of ["./index.html", "./manifest.webmanifest", "./version.json", "./update-history.json", "./qimin-runtime.js", "./icons/icon-192.png"]) {
  check(sw.includes(asset), `Service Worker未预缓存${asset}`);
}

const upstream = valueAfter("--upstream") || process.env.UPSTREAM_DIR;
if (upstream) {
  const actual = sourceStats(resolve(upstream));
  check(actual.chapters === version.chapters, `章节数不一致：上游${actual.chapters}，产物${version.chapters}`);
  check(actual.entries === version.entries, `条目数不一致：上游${actual.entries}，产物${version.entries}`);
}

const automationText = [
  readFileSync(resolve(ROOT, "scripts/build.mjs"), "utf8"),
  readFileSync(resolve(ROOT, "scripts/update-history.mjs"), "utf8"),
  readFileSync(resolve(ROOT, "public/qimin-runtime.js"), "utf8"),
  readFileSync(resolve(ROOT, ".github/workflows/update-pages.yml"), "utf8"),
].join("\n");
check(!/api\.openai\.com|anthropic\.com|generativelanguage\.googleapis\.com/iu.test(automationText), "自动更新流程包含AI接口");

const workflow = readFileSync(resolve(ROOT, ".github/workflows/update-pages.yml"), "utf8");
check(!workflow.includes("\t"), "GitHub Actions YAML不能包含Tab缩进");
check(/schedule:\s*[\s\S]*cron:/u.test(workflow) && /workflow_dispatch:/u.test(workflow), "工作流缺少每周或手动触发");
check(/^permissions:\s*\n\s{2}contents: read$/mu.test(workflow), "构建任务的全局权限必须仅为contents: read");
check(/deploy:[\s\S]*?permissions:\s*\n\s{6}pages: write\s*\n\s{6}id-token: write/u.test(workflow), "部署任务缺少Pages最小权限");
check(/concurrency:[\s\S]*?group: qimin-pages/u.test(workflow), "工作流缺少部署并发控制");
check(!/\bgit\s+(?:push|commit)\b/u.test(workflow), "工作流不应自动提交生成文件");
check(!/^\s*uses:\s*[^\s@]+@v\d+/mu.test(workflow), "GitHub Action必须固定到完整提交SHA");
for (const sha of [
  "d23441a48e516b6c34aea4fa41551a30e30af803",
  "249970729cb0ef3589644e2896645e5dc5ba9c38",
  "7b1f4a764d45c48632c6b24a0339c27f5614fb0b",
  "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
]) {
  check(workflow.includes(`@${sha}`), `工作流缺少已核查的Action提交：${sha}`);
}

console.log(`验证通过：${version.chapters} 章，${version.entries} 条，上游 ${version.upstreamShortCommit}`);
