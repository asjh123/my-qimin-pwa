import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "dist", "sw.js"), "utf8");

function check(value, message) {
  if (!value) throw new Error(message);
}

function environment({ failPrecache = false } = {}) {
  const listeners = new Map();
  const stores = new Map([
    ["qimin-old", new Map([["./index.html", { source: "old" }]])],
    ["other-app-cache", new Map()],
  ]);
  let claimed = false;
  let skipped = false;
  let networkCalls = 0;

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(urls) {
          if (failPrecache) throw new Error("模拟下载失败");
          for (const url of urls) store.set(url, { source: "precache", url });
        },
        async match(key) {
          return store.get(typeof key === "string" ? key : key.url);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(key) {
      const normalized = typeof key === "string" ? key : key.url;
      for (const store of stores.values()) {
        if (store.has(normalized)) return store.get(normalized);
      }
    },
  };

  const self = {
    location: { origin: "http://127.0.0.1:4173" },
    clients: { async claim() { claimed = true; } },
    skipWaiting() { skipped = true; },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };

  runInNewContext(source, {
    self,
    caches,
    URL,
    fetch: async () => {
      networkCalls += 1;
      return { source: "network" };
    },
  });

  return {
    listeners,
    stores,
    get claimed() { return claimed; },
    get skipped() { return skipped; },
    get networkCalls() { return networkCalls; },
  };
}

async function waitable(listener, extra = {}) {
  let promise;
  listener({ ...extra, waitUntil(value) { promise = value; } });
  return promise;
}

const normal = environment();
await waitable(normal.listeners.get("install"));
const namesAfterInstall = [...normal.stores.keys()];
const current = namesAfterInstall.find((name) => /^qimin-[0-9a-f]{7}-(?:[0-9a-f]{7}|local)$/u.test(name));
check(current, "安装阶段没有创建提交编号缓存");
check(normal.stores.get(current).has("./index.html"), "离线首页没有完整预缓存");
check(normal.stores.has("qimin-old"), "安装完成前不应删除旧缓存");

await waitable(normal.listeners.get("activate"));
check(normal.claimed, "激活后没有接管页面");
check(!normal.stores.has("qimin-old"), "激活后没有删除旧版缓存");
check(normal.stores.has("other-app-cache"), "错误删除了其他应用缓存");

normal.listeners.get("message")({ data: { type: "SKIP_WAITING" } });
check(normal.skipped, "点击更新消息没有触发skipWaiting");

let navigationResponse;
normal.listeners.get("fetch")({
  request: { method: "GET", mode: "navigate", url: "http://127.0.0.1:4173/example" },
  respondWith(value) { navigationResponse = value; },
});
check((await navigationResponse).source === "precache", "离线导航没有返回完整缓存首页");
check(normal.networkCalls === 0, "已有缓存时导航不应混用网络版本");

let externalIntercepted = false;
normal.listeners.get("fetch")({
  request: { method: "GET", mode: "cors", url: "https://example.org/paper" },
  respondWith() { externalIntercepted = true; },
});
check(!externalIntercepted, "不应缓存正文中的外部文献链接");

const failed = environment({ failPrecache: true });
let rejected = false;
try {
  await waitable(failed.listeners.get("install"));
} catch {
  rejected = true;
}
check(rejected, "模拟资源下载失败时安装应失败");
check(failed.stores.has("qimin-old"), "新版下载失败时旧缓存必须保留");

console.log("Service Worker测试通过：预缓存、离线导航、受控更新、旧缓存清理、失败回退、外链放行");
