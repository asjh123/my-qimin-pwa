import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createUpdateHistory } from "./update-history.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const PUBLIC = resolve(ROOT, "public");
const UPSTREAM_URL = "https://github.com/eternity4719/HowToLiveBetter.git";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} 执行失败（退出码 ${result.status}）${detail ? `：\n${detail}` : ""}`);
  }
  return (result.stdout || "").trim();
}

function assertUpstream(path) {
  for (const relative of [
    "README.md",
    "LICENSE",
    "LICENSE-CODE",
    "index.html",
    "book",
    "tools/offline/build.mjs",
  ]) {
    if (!existsSync(resolve(path, relative))) {
      throw new Error(`上游结构不完整：缺少 ${relative}`);
    }
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function injectPwa(html, version) {
  if (!html.includes("</head>") || !html.includes("</body>")) {
    throw new Error("官方离线HTML缺少 </head> 或 </body>，无法安全注入PWA外壳");
  }
  if (!html.includes("window.__CORPUS__")) {
    throw new Error("官方离线HTML未包含 window.__CORPUS__，可能不是完整离线版");
  }

  const head = `
<!-- qimin-pwa:start -->
<link rel="manifest" href="./manifest.webmanifest">
<meta name="application-name" content="我的齐民要术">
<meta name="theme-color" content="#315c49">
<style>
  .qimin-start{margin:0 0 22px;padding:18px;border:1px solid var(--divider);border-radius:16px;background:var(--bg-alt)}
  .qimin-start h1{margin:0 0 6px;font:700 22px/1.35 system-ui,sans-serif}.qimin-start p{margin:0 0 14px;color:var(--t2)}
  .qimin-actions{display:flex;flex-wrap:wrap;gap:9px}.qimin-actions button,.qimin-primary,.qimin-secondary{min-height:44px;border:1px solid #315c49;border-radius:10px;padding:9px 14px;background:transparent;color:inherit;font:600 14px/1.3 system-ui,sans-serif;cursor:pointer}
  .qimin-actions .qimin-primary,.qimin-primary{background:#315c49;color:#fff}.qimin-actions button[hidden]{display:none}
  #qimin-toc-nav{width:auto;min-width:52px;padding:0 10px;font:600 14px/1 system-ui,sans-serif}
  #qimin-install-help{margin-top:12px;padding:12px;border:1px solid #315c4970;border-radius:10px;background:var(--bg);font:14px/1.55 system-ui,sans-serif}
  #qimin-install-help[hidden],#qimin-update[hidden]{display:none}
  #qimin-install-help button{float:right;border:0;background:transparent;color:inherit;cursor:pointer}
  #qimin-update{position:fixed;left:50%;bottom:18px;z-index:9999;transform:translateX(-50%);width:min(92vw,430px);border-radius:14px;padding:14px;background:var(--bg);color:var(--t1);box-shadow:0 8px 32px #0005;font:14px/1.45 system-ui,sans-serif}
  #qimin-update strong{display:block;margin-bottom:10px;font-size:16px}.qimin-update-actions{display:flex;gap:8px}.qimin-update-actions button{flex:1}
  .qimin-dialog{width:min(92vw,560px);max-height:min(82vh,720px);border:0;border-radius:16px;padding:0;background:var(--bg);color:var(--t1);box-shadow:0 18px 60px #0006}
  .qimin-dialog::backdrop{background:#0008}.qimin-dialog-head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--divider);background:var(--bg);z-index:1}
  .qimin-dialog-head h2{margin:0;font:700 19px/1.3 system-ui,sans-serif}.qimin-dialog-close{border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer}
  #qimin-toc-list{display:grid;gap:4px;padding:10px;overflow:auto}.qimin-toc-link{display:flex;justify-content:space-between;gap:12px;width:100%;border:0;border-radius:9px;padding:11px 12px;background:transparent;color:inherit;text-align:left;font:15px/1.4 system-ui,sans-serif;cursor:pointer}.qimin-toc-link:hover,.qimin-toc-link:focus-visible,.qimin-toc-link.current{background:#315c4920}.qimin-toc-link.current{box-shadow:inset 3px 0 #315c49}.qimin-toc-link small{white-space:nowrap;color:var(--t2)}
  .qimin-changes-body{padding:16px 18px}.qimin-changes-body textarea{box-sizing:border-box;width:100%;height:min(52vh,430px);resize:vertical;border:1px solid var(--divider);border-radius:10px;padding:12px;background:var(--bg-alt);color:inherit;font:14px/1.65 system-ui,sans-serif}.qimin-changes-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}.qimin-changes-actions a{color:#315c49}
  .qimin-flash{animation:qimin-flash 1.4s ease-out}@keyframes qimin-flash{0%{outline:4px solid #315c4988}100%{outline:4px solid transparent}}
  .qimin-build-meta{max-width:900px;margin:22px auto;padding:12px 18px;color:#666;font:12px/1.65 system-ui,sans-serif;text-align:center}
  .qimin-build-meta a{color:inherit}
  @media(max-width:760px){#qimin-toc-nav{display:inline-flex}.qimin-start{padding:14px}.qimin-actions button{flex:1 1 42%}.qimin-dialog{width:94vw}.qimin-changes-actions{align-items:stretch;flex-direction:column}.qimin-changes-actions .qimin-primary{width:100%}}
  @media print{.qimin-start,#qimin-toc-nav,#qimin-update,.qimin-dialog,.qimin-build-meta{display:none!important}}
</style>
<!-- qimin-pwa:end -->
`;

  const metadata = {
    name: "我的齐民要术",
    upstream: "eternity4719/HowToLiveBetter",
    commit: version.upstreamCommit,
    shortCommit: version.upstreamShortCommit,
    appCommit: version.appCommit,
    appShortCommit: version.appShortCommit,
    releaseId: version.releaseId,
    syncedAt: version.syncedAt,
  };
  const safeMetadata = JSON.stringify(metadata).replaceAll("<", "\\u003c");
  const body = `
<!-- qimin-pwa:runtime:start -->
<div class="qimin-build-meta">
  <strong>我的齐民要术</strong> · 内容来自
  <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener">高性价比人生指南</a>
  · CC BY 4.0 · 本版仅增加安卓PWA外壳 · 同步 ${htmlEscape(version.syncedAt)} · ${htmlEscape(version.upstreamShortCommit)}
</div>
<div id="qimin-update" role="status" aria-live="polite" hidden>
  <strong>发现新版本</strong>
  <div class="qimin-update-actions"><button class="qimin-primary" id="qimin-update-accept" type="button">更新到新版本</button><button class="qimin-secondary" id="qimin-update-later" type="button">稍后再说</button></div>
</div>
<dialog class="qimin-dialog" id="qimin-toc-dialog" aria-labelledby="qimin-toc-title"><div class="qimin-dialog-head"><h2 id="qimin-toc-title">目录</h2><button class="qimin-dialog-close" data-qimin-close-toc type="button" aria-label="关闭目录">×</button></div><nav id="qimin-toc-list" aria-label="章节目录"></nav></dialog>
<dialog class="qimin-dialog" id="qimin-changes-dialog" aria-labelledby="qimin-changes-title"><div class="qimin-dialog-head"><h2 id="qimin-changes-title">本次更新内容</h2></div><div class="qimin-changes-body"><textarea id="qimin-changes-text" readonly aria-label="更新内容"></textarea><div class="qimin-changes-actions"><a id="qimin-changes-compare" target="_blank" rel="noopener">查看 GitHub 完整对比</a><button class="qimin-primary" id="qimin-changes-ack" type="button">我已知晓</button></div></div></dialog>
<script>
window.__QIMIN_BUILD__=${safeMetadata};
</script>
<script src="./qimin-runtime.js"></script>
<!-- qimin-pwa:runtime:end -->
`;

  let output = html.replace("</head>", `${head}</head>`).replace("</body>", `${body}</body>`);
  output = output.replace('<div class="nav-r">', '<div class="nav-r"><button class="icon-btn" id="qimin-toc-nav" data-qimin-open-toc type="button" aria-haspopup="dialog">目录</button>');
  const start = `<section class="qimin-start" aria-labelledby="qimin-start-title"><h1 id="qimin-start-title">我的齐民要术</h1><p>从目录开始，或接着上次读到的位置。</p><div class="qimin-actions"><button class="qimin-primary" id="qimin-continue" type="button" hidden>继续上次阅读</button><button id="qimin-start-first" type="button">从第一章开始</button><button data-qimin-open-toc type="button">查看目录</button><button id="qimin-search" type="button">搜索内容</button><button id="qimin-install" type="button" hidden>安装到手机桌面</button></div><div id="qimin-install-help" tabindex="-1" role="status" aria-live="polite" hidden><button id="qimin-install-help-close" type="button" aria-label="关闭安装说明">×</button>这不是下载文件。请用安卓 Chrome 的右上角菜单选择“添加到主屏幕”或“安装应用”；如果菜单里暂时没有该项，请先正常浏览本页一次并保持联网，然后重试。</div></section>`;
  if (!output.includes('<div class="doc-head">')) throw new Error("官方离线HTML缺少 .doc-head，无法插入开始阅读区域");
  output = output.replace('<div class="doc-head">', `${start}<div class="doc-head">`);
  output = output.replace(/<title>[\s\S]*?<\/title>/i, "<title>我的齐民要术 · 高性价比人生指南</title>");
  return output;
}

function sourceStats(upstream) {
  const bookDir = resolve(upstream, "book");
  const files = readdirSync(bookDir)
    .filter((name) => /^\d{2}-.+\.md$/u.test(name))
    .sort();
  if (!files.length) throw new Error("上游 book/ 中没有找到章节文件");
  let entries = 0;
  for (const file of files) {
    const text = readFileSync(resolve(bookDir, file), "utf8");
    entries += (text.match(/^###\s+\d+\.\s+/gmu) || []).length;
  }
  return { chapters: files.length, entries, files };
}

function readJsonIfPresent(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`无法读取JSON ${path}：${error.message}`);
  }
}

let temporaryUpstream;
let stageDir;
try {
  let upstream = valueAfter("--upstream") || process.env.UPSTREAM_DIR;
  if (upstream) {
    upstream = resolve(upstream);
  } else {
    temporaryUpstream = mkdtempSync(resolve(tmpdir(), "qimin-upstream-"));
    run("git", ["clone", "--depth", "1", "--quiet", UPSTREAM_URL, temporaryUpstream]);
    upstream = temporaryUpstream;
  }
  assertUpstream(upstream);

  const commit = run("git", ["rev-parse", "HEAD"], { cwd: upstream, capture: true });
  const shortCommit = commit.slice(0, 7);
  const commitDate = run("git", ["show", "-s", "--format=%cI", "HEAD"], {
    cwd: upstream,
    capture: true,
  });
  const stats = sourceStats(upstream);
  const syncedAt = new Date().toISOString();
  let appCommit = process.env.APP_COMMIT || "";
  if (!appCommit) {
    try {
      appCommit = run("git", ["rev-parse", "HEAD"], { cwd: ROOT, capture: true });
    } catch {
      appCommit = "local";
    }
  }
  const appShortCommit = /^[0-9a-f]{7,40}$/iu.test(appCommit) ? appCommit.slice(0, 7) : "local";
  const cacheVersion = `${shortCommit}-${appShortCommit}`;
  const releaseId = cacheVersion;

  stageDir = resolve(ROOT, `.tmp-dist-${process.pid}`);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  const upstreamHtml = resolve(stageDir, "upstream-offline.html");
  run(process.execPath, ["tools/offline/build.mjs", upstreamHtml], { cwd: upstream });

  const version = {
    app: "我的齐民要术",
    upstreamRepository: "https://github.com/eternity4719/HowToLiveBetter",
    upstreamCommit: commit,
    upstreamShortCommit: shortCommit,
    upstreamCommitDate: commitDate,
    appCommit,
    appShortCommit,
    cacheVersion,
    releaseId,
    syncedAt,
    chapters: stats.chapters,
    entries: stats.entries,
  };

  const previousVersion = readJsonIfPresent(valueAfter("--previous-version") || process.env.PREVIOUS_VERSION_FILE);
  const previousHistory = readJsonIfPresent(valueAfter("--previous-history") || process.env.PREVIOUS_HISTORY_FILE);
  const updateHistory = createUpdateHistory({
    repository: upstream,
    currentVersion: version,
    previousVersion,
    previousHistory,
  });
  const html = injectPwa(readFileSync(upstreamHtml, "utf8"), version);
  writeFileSync(resolve(stageDir, "index.html"), html);
  writeFileSync(resolve(stageDir, "version.json"), `${JSON.stringify(version, null, 2)}\n`);
  writeFileSync(resolve(stageDir, "update-history.json"), `${JSON.stringify(updateHistory, null, 2)}\n`);
  cpSync(resolve(PUBLIC, "manifest.webmanifest"), resolve(stageDir, "manifest.webmanifest"));
  cpSync(resolve(PUBLIC, "qimin-runtime.js"), resolve(stageDir, "qimin-runtime.js"));
  cpSync(resolve(PUBLIC, "icons"), resolve(stageDir, "icons"), { recursive: true });

  const precache = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./version.json",
    "./update-history.json",
    "./qimin-runtime.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
  ];
  const sw = readFileSync(resolve(PUBLIC, "sw-template.js"), "utf8")
    .replaceAll("__CACHE_VERSION__", cacheVersion)
    .replace("__PRECACHE_JSON__", JSON.stringify(precache, null, 2));
  writeFileSync(resolve(stageDir, "sw.js"), sw);
  rmSync(upstreamHtml, { force: true });

  rmSync(DIST, { recursive: true, force: true });
  renameSync(stageDir, DIST);
  stageDir = undefined;

  const sizeKb = Math.round(statSync(resolve(DIST, "index.html")).size / 1024);
  const latest = updateHistory.records.at(-1);
  const changes = latest ? `${latest.addedEntries.length} 新增 / ${latest.changedEntries.length} 修改 / ${latest.removedEntries.length} 删除` : "首次基线";
  console.log(`构建完成：${stats.chapters} 章，${stats.entries} 条，正文 ${sizeKb} KB，上游 ${shortCommit}，差异 ${changes}`);
} finally {
  if (stageDir) rmSync(stageDir, { recursive: true, force: true });
  if (temporaryUpstream && basename(temporaryUpstream).startsWith("qimin-upstream-")) {
    rmSync(temporaryUpstream, { recursive: true, force: true });
  }
}
