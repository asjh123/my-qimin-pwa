(() => {
  "use strict";

  const BUILD = window.__QIMIN_BUILD__ || {};
  const STORAGE = {
    reading: "qimin-reading-position-v1",
    acknowledged: "qimin-acknowledged-release-v1",
    pendingFrom: "qimin-update-from-release-v1",
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const safeGet = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const safeSet = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* 存储被禁用时仍可阅读 */ }
  };
  const safeRemove = (key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  };

  function waitForReader() {
    return new Promise((resolve, reject) => {
      const ready = () => $("#list .sec-block .card");
      if (ready()) return resolve();
      const list = $("#list");
      if (!list) return reject(new Error("上游阅读器缺少 #list"));
      const observer = new MutationObserver(() => {
        if (!ready()) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(list, { childList: true, subtree: true });
      window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("上游阅读器未能生成章节"));
      }, 30000);
    });
  }

  function navigateTo(element, id) {
    if (!element) return;
    if (id) history.pushState(null, "", `#${id}`);
    element.scrollIntoView({ block: "start", behavior: "smooth" });
    element.classList.add("qimin-flash");
    window.setTimeout(() => element.classList.remove("qimin-flash"), 1500);
  }

  function openDialog(dialog, focusTarget) {
    if (dialog.open) return;
    dialog.showModal();
    history.pushState({ ...(history.state || {}), qiminDialog: dialog.id }, "");
    window.setTimeout(() => focusTarget?.focus(), 0);
  }

  function requestDialogClose(dialog) {
    if (!dialog.open) return;
    if (history.state?.qiminDialog === dialog.id) history.back();
    else dialog.close();
  }

  function wireDialog(dialog, closeButtons) {
    for (const button of closeButtons) button.addEventListener("click", () => requestDialogClose(dialog));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      requestDialogClose(dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) requestDialogClose(dialog);
    });
    addEventListener("popstate", () => {
      if (dialog.open && history.state?.qiminDialog !== dialog.id) dialog.close();
    });
  }

  function currentReadingTarget() {
    const cards = $$("#list .card").filter((card) => card.offsetParent);
    const headerBottom = $("header.nav")?.getBoundingClientRect().bottom || 0;
    let selected = cards[0] || null;
    for (const card of cards) {
      const top = card.querySelector(".card-h")?.getBoundingClientRect().top ?? card.getBoundingClientRect().top;
      if (top <= headerBottom + 80) selected = card;
      else break;
    }
    return selected;
  }

  function installReadingTools() {
    const sections = $$("#list .sec-block");
    if (!sections.length) throw new Error("没有从上游页面识别到章节");
    const firstSection = sections[0];
    const firstCard = $(".card", firstSection);
    if (!firstCard?.id) throw new Error("第一章缺少稳定条目锚点");

    const continueButton = $("#qimin-continue");
    const startButton = $("#qimin-start-first");
    const tocDialog = $("#qimin-toc-dialog");
    const tocList = $("#qimin-toc-list");
    const tocOpeners = $$("[data-qimin-open-toc]");
    const saved = (() => {
      try { return JSON.parse(safeGet(STORAGE.reading) || "null"); } catch { return null; }
    })();
    const savedEntry = saved?.entryId && document.getElementById(saved.entryId);
    const savedSection = saved?.sectionId && document.getElementById(saved.sectionId);
    continueButton.hidden = !(savedEntry || savedSection);

    startButton.addEventListener("click", () => navigateTo(firstSection, firstCard.id));
    continueButton.addEventListener("click", () => {
      const target = document.getElementById(saved?.entryId) || document.getElementById(saved?.sectionId) || firstSection;
      const id = target.classList.contains("card") ? target.id : $(".card", target)?.id;
      navigateTo(target.classList.contains("card") ? target : target, id);
    });
    $("#qimin-search").addEventListener("click", () => {
      const input = $("#q");
      input?.focus();
      input?.scrollIntoView({ block: "center" });
    });

    for (const section of sections) {
      const heading = $(".sec-h h2", section);
      const cards = $$(".card", section);
      const first = cards[0];
      if (!heading || !first?.id || !section.id) throw new Error("章节DOM缺少标题或锚点");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "qimin-toc-link";
      button.dataset.section = section.id;
      const title = document.createElement("span");
      title.textContent = heading.textContent.trim();
      const count = document.createElement("small");
      count.textContent = `${cards.length} 条`;
      button.append(title, count);
      button.addEventListener("click", () => {
        requestDialogClose(tocDialog);
        window.setTimeout(() => navigateTo(section, first.id), 30);
      });
      tocList.appendChild(button);
    }

    const openToc = () => openDialog(tocDialog, $(".qimin-toc-link", tocDialog));
    for (const button of tocOpeners) button.addEventListener("click", openToc);
    wireDialog(tocDialog, $$("[data-qimin-close-toc]", tocDialog));

    let timer = 0;
    const highlight = (section) => {
      for (const link of $$(".qimin-toc-link", tocList)) {
        link.classList.toggle("current", link.dataset.section === section?.id);
        link.setAttribute("aria-current", link.dataset.section === section?.id ? "true" : "false");
      }
    };
    const saveAndHighlight = () => {
      timer = 0;
      const card = currentReadingTarget();
      if (!card) return;
      const section = card.closest(".sec-block");
      safeSet(STORAGE.reading, JSON.stringify({ entryId: card.id, sectionId: section?.id || "" }));
      continueButton.hidden = false;
      highlight(section);
    };
    addEventListener("scroll", () => {
      if (timer) return;
      timer = window.setTimeout(saveAndHighlight, 500);
    }, { passive: true });
    highlight(currentReadingTarget()?.closest(".sec-block"));
    const action = new URLSearchParams(location.search).get("action");
    if (action === "toc") openToc();
    if (action === "search") $("#q")?.focus();
  }

  function installPwaPrompt() {
    const button = $("#qimin-install");
    const help = $("#qimin-install-help");
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isStandalone = matchMedia("(display-mode: standalone)").matches;
    let promptEvent;

    button.hidden = !isAndroid || isStandalone;
    addEventListener("beforeinstallprompt", (event) => {
      if (!isAndroid || isStandalone) return;
      event.preventDefault();
      promptEvent = event;
      button.hidden = false;
      button.dataset.ready = "true";
    });
    button.addEventListener("click", async () => {
      if (!promptEvent) {
        help.hidden = false;
        help.focus();
        return;
      }
      button.disabled = true;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      promptEvent = undefined;
      button.disabled = false;
      if (choice.outcome === "accepted") {
        button.hidden = true;
        button.textContent = "已安装到桌面";
      }
    });
    $("#qimin-install-help-close").addEventListener("click", () => { help.hidden = true; });
    addEventListener("appinstalled", () => {
      promptEvent = undefined;
      button.hidden = true;
      help.hidden = true;
    });
  }

  function formatChange(record) {
    const delta = (after, before) => {
      const value = Number(after || 0) - Number(before || 0);
      return `${after ?? "?"}（${value > 0 ? "+" : ""}${value}）`;
    };
    const list = (label, items) => {
      if (!items?.length) return `${label}无`;
      return `${label}${items.map((item) => `${item.section ? `第${item.section}章 ` : ""}${item.title || item}`).join("；")}`;
    };
    const lines = [
      `更新时间：${record.publishedAt || "未知"}`,
      `内容版本：${String(record.upstreamTo || "未知").slice(0, 7)}`,
      `应用版本：${String(record.appTo || "未知").slice(0, 7)}`,
      `章节变化：${delta(record.chaptersAfter, record.chaptersBefore)}`,
      `条目变化：${delta(record.entriesAfter, record.entriesBefore)}`,
      list("新增：", record.addedEntries),
      list("修改：", record.changedEntries),
      list("删除：", record.removedEntries),
    ];
    if (!record.addedEntries?.length && !record.changedEntries?.length && !record.removedEntries?.length) {
      if (record.upstreamFrom !== record.upstreamTo) lines.push("说明：上游维护更新，正文条目无变化。");
    }
    if (record.appFrom !== record.appTo) lines.push("说明：产品功能或兼容性更新。");
    if (!record.complete) lines.push("说明：完整差异暂时无法生成。");
    if (record.commitMessages?.length) lines.push(`上游提交：${record.commitMessages.join("；")}`);
    return lines.join("\n");
  }

  async function showUnacknowledgedUpdates() {
    const current = BUILD.releaseId;
    if (!current) return;
    const acknowledged = safeGet(STORAGE.acknowledged);
    const pendingFrom = safeGet(STORAGE.pendingFrom);
    if (!acknowledged && !pendingFrom) {
      safeSet(STORAGE.acknowledged, current);
      return;
    }
    const baseline = pendingFrom || acknowledged;
    if (baseline === current) {
      safeRemove(STORAGE.pendingFrom);
      return;
    }
    let historyData;
    try {
      const response = await fetch("./update-history.json", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      historyData = await response.json();
    } catch {
      return;
    }
    const records = Array.isArray(historyData.records) ? historyData.records : [];
    const baselineIndex = records.findIndex((record) => record.releaseId === baseline);
    let unseen = baselineIndex >= 0 ? records.slice(baselineIndex + 1) : records.filter((record) => record.releaseId === current);
    unseen = unseen.filter((record) => record.releaseId !== baseline);
    if (!unseen.length) return;

    const dialog = $("#qimin-changes-dialog");
    const text = $("#qimin-changes-text");
    const compare = $("#qimin-changes-compare");
    const prefix = baselineIndex < 0 && historyData.truncated ? "较早记录已超出保留范围；以下仅显示最近记录。\n\n" : "";
    text.value = prefix + unseen.map((record, index) => `更新 ${index + 1}/${unseen.length}\n${formatChange(record)}`).join("\n\n──────────\n\n");
    const latest = unseen.at(-1);
    if (latest?.compareUrl) compare.href = latest.compareUrl;
    else compare.hidden = true;
    $("#qimin-changes-ack").onclick = () => {
      safeSet(STORAGE.acknowledged, current);
      safeRemove(STORAGE.pendingFrom);
      requestDialogClose(dialog);
    };
    openDialog(dialog, $("#qimin-changes-ack"));
  }

  function installServiceWorkerUpdates() {
    if (!("serviceWorker" in navigator)) return;
    const notice = $("#qimin-update");
    const accept = $("#qimin-update-accept");
    const later = $("#qimin-update-later");
    let registration;
    let reloadAfterActivation = false;

    const offer = (worker) => {
      if (!worker) return;
      notice.hidden = false;
      accept.onclick = () => {
        safeSet(STORAGE.pendingFrom, BUILD.releaseId || "unknown");
        reloadAfterActivation = true;
        accept.disabled = true;
        accept.textContent = "正在更新…";
        worker.postMessage({ type: "SKIP_WAITING" });
      };
      later.onclick = () => { notice.hidden = true; };
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadAfterActivation) location.reload();
    });
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) offer(installing);
        });
      });
      reg.update().catch(() => {});
    }).catch((error) => console.warn("PWA离线功能注册失败：", error));
    addEventListener("online", () => registration?.update().catch(() => {}));
  }

  installPwaPrompt();
  installServiceWorkerUpdates();
  wireDialog($("#qimin-changes-dialog"), []);
  waitForReader()
    .then(() => installReadingTools())
    .then(() => showUnacknowledgedUpdates())
    .catch((error) => console.warn("齐民要术增强功能初始化失败：", error));
})();
