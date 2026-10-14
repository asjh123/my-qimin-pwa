import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const EDGE = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 4187;
const DEBUG_PORT = 9337;
const site = mkdtempSync(resolve(tmpdir(), "qimin-browser-site-"));
const profile = mkdtempSync(resolve(tmpdir(), "qimin-edge-profile-"));
cpSync(resolve("dist"), site, { recursive: true });

const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(PORT), SERVE_DIR: site },
  stdio: "ignore",
});
const edge = spawn(EDGE, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const pause = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
async function poll(url, options) {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
    } catch { /* wait for process */ }
    await pause(100);
  }
  throw new Error(`服务未就绪：${url}`);
}

function check(value, message) {
  if (!value) throw new Error(message);
}

let socket;
let nextId = 0;
const pending = new Map();
const events = new Map();
function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolvePromise, reject) => pending.set(id, { resolve: resolvePromise, reject }));
}
function once(method, timeout = 15000) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待浏览器事件超时：${method}`)), timeout);
    const list = events.get(method) || [];
    list.push((params) => { clearTimeout(timer); resolvePromise(params); });
    events.set(method, list);
  });
}
async function evaluate(expression, awaitPromise = false) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "浏览器脚本执行失败");
  return result.result.value;
}
async function loaded(url) {
  const event = once("Page.loadEventFired");
  await command("Page.navigate", { url });
  await event;
}
async function waitEval(expression, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch { /* 页面切换期间执行上下文会短暂消失 */ }
    await pause(100);
  }
  throw new Error(`等待页面状态超时：${expression}`);
}

try {
  await poll(`http://127.0.0.1:${PORT}/`);
  const target = await poll(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://127.0.0.1:${PORT}/`, { method: "PUT" }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.onopen = resolvePromise;
    socket.onerror = reject;
  });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler?.reject(new Error(message.error.message));
      else handler?.resolve(message.result);
      return;
    }
    const listeners = events.get(message.method) || [];
    events.set(message.method, []);
    for (const listener of listeners) listener(message.params);
  };
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" });
  await command("Emulation.setDeviceMetricsOverride", { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  await loaded(`http://127.0.0.1:${PORT}/`);
  await evaluate("new Promise((resolve,reject)=>{const end=Date.now()+30000;(function wait(){if(document.querySelectorAll('#list .sec-block').length)resolve(true);else if(Date.now()>end)reject(new Error('reader timeout'));else setTimeout(wait,50)})()})", true);

  const basics = await evaluate(`(() => ({
    width: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    sections: document.querySelectorAll('#list .sec-block').length,
    tocLinks: document.querySelectorAll('#qimin-toc-list .qimin-toc-link').length,
    start: !!document.querySelector('.qimin-start'),
    installVisible: !document.querySelector('#qimin-install').hidden,
    tocVisible: document.querySelector('#qimin-toc-nav').getBoundingClientRect().width > 0,
    continueHidden: document.querySelector('#qimin-continue').hidden
  }))()`);
  check(basics.width && basics.sections === basics.tocLinks && basics.start && basics.tocVisible, "安卓视口、开始区或动态目录验证失败");
  check(basics.installVisible && basics.continueHidden, "安装按钮或首次阅读状态错误");

  const firstId = await evaluate("document.querySelector('#list .sec-block .card').id");
  await evaluate("document.querySelector('#qimin-start-first').click()");
  await waitEval(`location.hash === '#${firstId}'`, 3000);

  await evaluate("document.querySelector('[data-qimin-open-toc]').click()");
  check(await evaluate("document.querySelector('#qimin-toc-dialog').open"), "目录没有打开");
  await evaluate("document.querySelectorAll('#qimin-toc-list .qimin-toc-link')[1].click()");
  await waitEval("!document.querySelector('#qimin-toc-dialog').open && location.hash === '#e-2-1'", 3000);
  await evaluate("window.dispatchEvent(new Event('scroll'))");
  await waitEval("Boolean(localStorage.getItem('qimin-reading-position-v1'))", 3000);
  check(await evaluate("JSON.parse(localStorage.getItem('qimin-reading-position-v1')).entryId.startsWith('e-')"), "阅读位置没有保存稳定锚点");
  check(await evaluate("Boolean(document.querySelector('#qimin-toc-list .qimin-toc-link.current'))"), "当前章节没有高亮");
  const savedId = await evaluate("JSON.parse(localStorage.getItem('qimin-reading-position-v1')).entryId");
  const readingReload = once("Page.loadEventFired");
  await command("Page.reload");
  await readingReload;
  await waitEval("document.querySelectorAll('#list .sec-block').length > 0", 10000);
  check(!(await evaluate("document.querySelector('#qimin-continue').hidden")), "有阅读记录时没有显示继续阅读");
  await evaluate("document.querySelector('#qimin-continue').click()");
  await waitEval(`location.hash === '#${savedId}'`, 3000);
  await evaluate("document.querySelector('#qimin-search').click()");
  check(await evaluate("document.activeElement.id === 'q'"), "搜索入口没有聚焦原搜索框");
  await evaluate("const q=document.querySelector('#q');q.value='安全带';q.dispatchEvent(new Event('input',{bubbles:true}))");
  await pause(250);
  check(await evaluate("Number(document.querySelector('#cnt').textContent) < Number(document.querySelector('#tot').textContent)"), "搜索没有筛选正文");
  await evaluate("document.querySelector('#reset2').click();document.querySelector('.chips[data-dim=grade] .chip').click()");
  await pause(100);
  check(await evaluate("document.querySelectorAll('#list .card[hidden]').length > 0"), "证据筛选没有生效");
  await evaluate("document.querySelector('#reset').click()");
  const oldTheme = await evaluate("document.documentElement.className");
  await evaluate("document.querySelector('#theme').click()");
  check((await evaluate("document.documentElement.className")) !== oldTheme, "明暗模式没有切换");
  await command("Emulation.setEmulatedMedia", { media: "print" });
  check(await evaluate("getComputedStyle(document.querySelector('.qimin-start')).display === 'none'"), "打印样式没有隐藏PWA工具");
  const pdf = await command("Page.printToPDF", { printBackground: true });
  check(pdf.data.length > 1000, "打印输出失败");
  await command("Emulation.setEmulatedMedia", { media: "screen" });

  await evaluate("navigator.serviceWorker.ready.then(()=>true)", true);
  const oldVersion = JSON.parse(readFileSync(resolve(site, "version.json"), "utf8"));
  const newRelease = `${oldVersion.upstreamShortCommit}-browser2`;
  const nextVersion = { ...oldVersion, appCommit: "browser-test-2", appShortCommit: "browser2", cacheVersion: newRelease, releaseId: newRelease, syncedAt: new Date().toISOString() };
  writeFileSync(resolve(site, "version.json"), `${JSON.stringify(nextVersion, null, 2)}\n`);
  const history = JSON.parse(readFileSync(resolve(site, "update-history.json"), "utf8"));
  history.currentReleaseId = newRelease;
  history.records.push({ releaseId: newRelease, publishedAt: nextVersion.syncedAt, upstreamFrom: oldVersion.upstreamCommit, upstreamTo: oldVersion.upstreamCommit, appFrom: oldVersion.appCommit, appTo: nextVersion.appCommit, chaptersBefore: oldVersion.chapters, chaptersAfter: oldVersion.chapters, entriesBefore: oldVersion.entries, entriesAfter: oldVersion.entries, addedEntries: [], removedEntries: [], changedEntries: [], changedFiles: ["public/qimin-runtime.js"], commitMessages: [], compareUrl: "", complete: true });
  writeFileSync(resolve(site, "update-history.json"), `${JSON.stringify(history, null, 2)}\n`);
  const oldIndex = readFileSync(resolve(site, "index.html"), "utf8");
  writeFileSync(resolve(site, "index.html"), oldIndex.replace(`\"releaseId\":\"${oldVersion.releaseId}\"`, `\"releaseId\":\"${newRelease}\"`));
  const oldSw = readFileSync(resolve(site, "sw.js"), "utf8");
  writeFileSync(resolve(site, "sw.js"), oldSw.replace(`qimin-${oldVersion.cacheVersion}`, `qimin-${newRelease}`));

  await evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())", true);
  await waitEval("!document.querySelector('#qimin-update').hidden", 15000);
  await evaluate("document.querySelector('#qimin-update-accept').click()");
  await waitEval("document.querySelector('#qimin-changes-dialog')?.open", 20000);
  check((await evaluate("document.querySelector('#qimin-changes-text').value")).includes("产品功能或兼容性更新"), "更新说明没有显示应用变更");
  await evaluate("document.querySelector('#qimin-changes-ack').click()");
  await pause(150);
  const reloadEvent = once("Page.loadEventFired");
  await command("Page.reload", { ignoreCache: true });
  await reloadEvent;
  await pause(500);
  check(!(await evaluate("document.querySelector('#qimin-changes-dialog').open")), "已知晓的版本重复显示");
  const cacheNames = await evaluate("caches.keys()", true);
  const qiminCaches = cacheNames.filter((name) => name.startsWith("qimin-"));
  check(qiminCaches.length === 1 && qiminCaches[0].includes(newRelease), "旧缓存没有删除");

  await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const offlineLoad = once("Page.loadEventFired");
  await command("Page.reload", { ignoreCache: true });
  await offlineLoad;
  await waitEval("document.querySelectorAll('#list .sec-block').length > 0", 10000);

  console.log(`浏览器测试通过：412×915、目录、搜索、阅读位置、主题、打印、离线、更新提示、确认与缓存切换（${basics.sections}章）`);
} finally {
  socket?.close();
  edge.kill();
  server.kill();
}
