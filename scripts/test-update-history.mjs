import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSnapshots, mergeHistory, snapshotFromTexts } from "./update-history.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function check(value, message) {
  if (!value) throw new Error(message);
}

function fixture(name) {
  const dir = resolve(ROOT, "scripts", "fixtures", name, "book");
  return snapshotFromTexts(Object.fromEntries(readdirSync(dir).map((file) => [
    `book/${file}`,
    readFileSync(resolve(dir, file), "utf8"),
  ])));
}

const diff = compareSnapshots(fixture("update-before"), fixture("update-after"));
check(diff.changedEntries.map((item) => item.number).join() === "1", "正文修改识别错误");
check(diff.addedEntries.map((item) => item.number).join() === "3,4", "新增或重命名识别错误");
check(diff.removedEntries.map((item) => item.number).join() === "2,3", "删除或重命名识别错误");

const record = (releaseId) => ({ releaseId, complete: true, addedEntries: [], removedEntries: [], changedEntries: [] });
let history = mergeHistory(null, record("v1"));
history = mergeHistory(history, record("v2"));
history = mergeHistory(history, record("v2"));
check(history.records.map((item) => item.releaseId).join() === "v1,v2", "相同版本产生了重复记录");
for (let index = 3; index <= 55; index += 1) history = mergeHistory(history, record(`v${index}`));
check(history.records.length === 52 && history.truncated, "更新历史截断规则错误");
check(history.records.at(-1).releaseId === "v55", "更新历史顺序错误");

console.log("更新历史测试通过：修改、新增、删除、重命名、去重与52版截断");
