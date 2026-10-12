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
<style>
  #qimin-update{position:fixed;left:50%;bottom:18px;z-index:9999;transform:translateX(-50%);width:min(92vw,420px);padding:0;border:0;background:transparent}
  #qimin-update[hidden]{display:none}
  #qimin-update button{width:100%;min-height:48px;border:0;border-radius:14px;padding:12px 18px;background:#315c49;color:#fff;font:600 15px/1.35 system-ui,sans-serif;box-shadow:0 8px 28px #0004;cursor:pointer}
  .qimin-build-meta{max-width:900px;margin:22px auto;padding:12px 18px;color:#666;font:12px/1.65 system-ui,sans-serif;text-align:center}
  .qimin-build-meta a{color:inherit}
  @media print{#qimin-update,.qimin-build-meta{display:none!important}}
</style>
<!-- qimin-pwa:end -->
`;

  const metadata = {
    name: "我的齐民要术",
    upstream: "eternity4719/HowToLiveBetter",
    commit: version.upstreamCommit,
    shortCommit: version.upstreamShortCommit,
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
  <button type="button">发现新版本，点击更新</button>
</div>
<script>
window.__QIMIN_BUILD__=${safeMetadata};
(() => {
  if (!("serviceWorker" in navigator)) return;
  const notice = document.getElementById("qimin-update");
  const button = notice.querySelector("button");
  let registration;
  let reloadAfterActivation = false;

  const offerUpdate = (worker) => {
    if (!worker) return;
    notice.hidden = false;
    button.onclick = () => {
      reloadAfterActivation = true;
      button.disabled = true;
      button.textContent = "正在更新…";
      worker.postMessage({ type: "SKIP_WAITING" });
    };
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadAfterActivation) location.reload();
  });

  navigator.serviceWorker.register("./sw.js").then((reg) => {
    registration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          offerUpdate(installing);
        }
      });
    });
    reg.update().catch(() => {});
  }).catch((error) => console.warn("PWA离线功能注册失败：", error));

  window.addEventListener("online", () => registration?.update().catch(() => {}));
})();
</script>
<!-- qimin-pwa:runtime:end -->
`;

  let output = html.replace("</head>", `${head}</head>`).replace("</body>", `${body}</body>`);
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
    syncedAt,
    chapters: stats.chapters,
    entries: stats.entries,
  };

  const html = injectPwa(readFileSync(upstreamHtml, "utf8"), version);
  writeFileSync(resolve(stageDir, "index.html"), html);
  writeFileSync(resolve(stageDir, "version.json"), `${JSON.stringify(version, null, 2)}\n`);
  cpSync(resolve(PUBLIC, "manifest.webmanifest"), resolve(stageDir, "manifest.webmanifest"));
  cpSync(resolve(PUBLIC, "icons"), resolve(stageDir, "icons"), { recursive: true });

  const precache = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./version.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
  ];
  const sw = readFileSync(resolve(PUBLIC, "sw-template.js"), "utf8")
    .replaceAll("__CACHE_VERSION__", shortCommit)
    .replace("__PRECACHE_JSON__", JSON.stringify(precache, null, 2));
  writeFileSync(resolve(stageDir, "sw.js"), sw);
  rmSync(upstreamHtml, { force: true });

  rmSync(DIST, { recursive: true, force: true });
  renameSync(stageDir, DIST);
  stageDir = undefined;

  const sizeKb = Math.round(statSync(resolve(DIST, "index.html")).size / 1024);
  console.log(`构建完成：${stats.chapters} 章，${stats.entries} 条，正文 ${sizeKb} KB，上游 ${shortCommit}`);
} finally {
  if (stageDir) rmSync(stageDir, { recursive: true, force: true });
  if (temporaryUpstream && basename(temporaryUpstream).startsWith("qimin-upstream-")) {
    rmSync(temporaryUpstream, { recursive: true, force: true });
  }
}
