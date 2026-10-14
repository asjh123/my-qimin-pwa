import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BOOK_FILE = /^book\/\d{2}-.+\.md$/u;

function runGit(repository, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args[0]} 执行失败：${(result.stderr || result.stdout || "未知错误").trim()}`);
  }
  return result.status === 0 ? result.stdout.trim() : null;
}

export function parseChapterMarkdown(text, path = "") {
  const heading = /^#\s+(\d+)\.\s+(.+)$/mu.exec(text);
  if (!heading) throw new Error(`${path || "章节"}缺少“# 数字. 标题”章节标题`);
  const section = heading[1];
  const title = heading[2].trim();
  const matches = [...text.matchAll(/^###\s+(\d+)\.\s+(.+)$/gmu)];
  const entries = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const bodyEnd = matches[index + 1]?.index ?? text.length;
    const body = text.slice(match.index, bodyEnd).replace(/\r\n/g, "\n").trim();
    entries.push({
      key: `${section}-${match[1]}`,
      section,
      number: match[1],
      chapter: title,
      title: match[2].trim(),
      digest: createHash("sha256").update(body).digest("hex"),
    });
  }
  return { section, title, path, entries };
}

export function snapshotFromTexts(files) {
  const chapters = Object.entries(files)
    .filter(([path]) => BOOK_FILE.test(path.replaceAll("\\", "/")))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => parseChapterMarkdown(text, path));
  if (!chapters.length) throw new Error("没有找到章节 Markdown");
  const entries = new Map(chapters.flatMap((chapter) => chapter.entries.map((entry) => [entry.key, entry])));
  return { chapters, entries };
}

export function snapshotFromDirectory(repository) {
  const book = resolve(repository, "book");
  const files = {};
  for (const name of readdirSync(book).filter((value) => /^\d{2}-.+\.md$/u.test(value)).sort()) {
    files[`book/${name}`] = readFileSync(resolve(book, name), "utf8");
  }
  return snapshotFromTexts(files);
}

export function snapshotFromRevision(repository, revision) {
  const names = runGit(repository, ["-c", "core.quotepath=false", "ls-tree", "-r", "--name-only", revision, "--", "book"])
    .split(/\r?\n/u)
    .filter((path) => BOOK_FILE.test(path));
  if (!names.length) throw new Error(`提交 ${revision} 中没有章节文件`);
  return snapshotFromTexts(Object.fromEntries(names.map((path) => [path, runGit(repository, ["show", `${revision}:${path}`])])));
}

function publicEntry(entry) {
  return { section: entry.section, number: entry.number, chapter: entry.chapter, title: entry.title };
}

export function compareSnapshots(before, after) {
  const addedEntries = [];
  const removedEntries = [];
  const changedEntries = [];
  for (const [key, current] of after.entries) {
    const previous = before.entries.get(key);
    if (!previous) addedEntries.push(publicEntry(current));
    else if (previous.title !== current.title) {
      removedEntries.push(publicEntry(previous));
      addedEntries.push(publicEntry(current));
    } else if (previous.digest !== current.digest) changedEntries.push(publicEntry(current));
  }
  for (const [key, previous] of before.entries) {
    if (!after.entries.has(key)) removedEntries.push(publicEntry(previous));
  }
  const order = (a, b) => Number(a.section) - Number(b.section) || Number(a.number) - Number(b.number);
  addedEntries.sort(order);
  removedEntries.sort(order);
  changedEntries.sort(order);
  return { addedEntries, removedEntries, changedEntries };
}

export function mergeHistory(previous, record, limit = 52) {
  const source = Array.isArray(previous?.records) ? previous.records : [];
  const records = [...source.filter((item) => item.releaseId !== record.releaseId), record];
  const truncated = Boolean(previous?.truncated) || records.length > limit;
  return {
    schemaVersion: 1,
    currentReleaseId: record.releaseId,
    truncated,
    records: records.slice(-limit),
  };
}

export function createUpdateHistory({ repository, currentVersion, previousVersion, previousHistory }) {
  const releaseId = currentVersion.releaseId;
  if (!previousVersion?.upstreamCommit || !previousVersion?.appCommit) {
    return {
      schemaVersion: 1,
      currentReleaseId: releaseId,
      truncated: false,
      records: [],
    };
  }
  const record = {
    releaseId,
    publishedAt: currentVersion.syncedAt,
    upstreamFrom: previousVersion.upstreamCommit,
    upstreamTo: currentVersion.upstreamCommit,
    appFrom: previousVersion.appCommit,
    appTo: currentVersion.appCommit,
    chaptersBefore: previousVersion.chapters ?? 0,
    chaptersAfter: currentVersion.chapters,
    entriesBefore: previousVersion.entries ?? 0,
    entriesAfter: currentVersion.entries,
    addedEntries: [],
    removedEntries: [],
    changedEntries: [],
    changedFiles: [],
    commitMessages: [],
    compareUrl: previousVersion.upstreamCommit === currentVersion.upstreamCommit
      ? ""
      : `https://github.com/eternity4719/HowToLiveBetter/compare/${previousVersion.upstreamCommit}...${currentVersion.upstreamCommit}`,
    complete: true,
  };

  if (previousVersion.upstreamCommit !== currentVersion.upstreamCommit) {
    try {
      const before = snapshotFromRevision(repository, previousVersion.upstreamCommit);
      const after = snapshotFromRevision(repository, currentVersion.upstreamCommit);
      Object.assign(record, compareSnapshots(before, after));
      record.chaptersBefore = before.chapters.length;
      record.entriesBefore = before.entries.size;
      record.chaptersAfter = after.chapters.length;
      record.entriesAfter = after.entries.size;
      record.changedFiles = (runGit(repository, ["-c", "core.quotepath=false", "diff", "--name-only", previousVersion.upstreamCommit, currentVersion.upstreamCommit]) || "")
        .split(/\r?\n/u).filter(Boolean).slice(0, 200);
      const subjects = runGit(repository, ["log", "--format=%s", `${previousVersion.upstreamCommit}..${currentVersion.upstreamCommit}`], { allowFailure: true });
      if (subjects === null) record.complete = false;
      else record.commitMessages = subjects.split(/\r?\n/u).filter(Boolean).slice(0, 50);
    } catch {
      record.complete = false;
    }
  }
  return mergeHistory(previousHistory, record);
}
