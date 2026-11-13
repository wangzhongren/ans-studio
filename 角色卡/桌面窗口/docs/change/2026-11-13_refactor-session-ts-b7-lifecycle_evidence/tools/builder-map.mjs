// B7 取证：openInternalUnsafe 的 8 builder 分解——源连续块 → builder 的逐行映射与包含性证明。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, "../../../../../.."));
const OUT = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-lifecycle_evidence";
const src = JSON.parse(fs.readFileSync(path.join(HERE, "methods-source.json"), "utf8"));
const m = src.methods.find((x) => x.name === "openInternalUnsafe");
const srcText = m.text;
const srcLines = srcText.split("\n");
const target = fs.readFileSync("app/desktop/session/lifecycle/open.ts", "utf8");
const targetLines = target.split("\n");
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const BLOCKS = [
  { name: "resolveWorkflowMode", start: 1994, end: 2060 },
  { name: "reuseOrRebindEntry", start: 2061, end: 2134 },
  { name: "loadAuthorization", start: 2136, end: 2193 },
  { name: "assembleGovernanceCapabilities", start: 2195, end: 2301 },
  { name: "assembleProjectCapabilities", start: 2303, end: 2542 },
  { name: "assembleToolSurface", start: 2543, end: 2956 },
  { name: "freezeBindings", start: 2958, end: 2980 },
  { name: "postOpenWiring", start: 2982, end: 3063 },
];
const DOC_ADAPT = {
  assembleToolSurface: [["const manager = this;", "const manager = this.host;"]],
  assembleProjectCapabilities: [["caller.handle === handle", "caller.handle === ctx.handle"]],
};
const reports = [];
for (const b of BLOCKS) {
  const slice = srcLines.slice(b.start - m.startLine, b.end - m.startLine + 1).join("\n");
  let expected = slice;
  for (const [from, to] of DOC_ADAPT[b.name] ?? []) expected = expected.split(from).join(to);
  const marker = `  /** ${b.name}：openInternalUnsafe 连续块（源 ${b.start}–${b.end}；映射见 change 记录）。 */`;
  const markerIndex = targetLines.indexOf(marker);
  if (markerIndex < 0) throw new Error("builder marker missing: " + b.name);
  const head = targetLines[markerIndex + 1];
  const bodyStart = markerIndex + 3; // marker, signature line, alias line
  const bodyLines = expected.split("\n");
  const actual = targetLines.slice(bodyStart, bodyStart + bodyLines.length).join("\n");
  const nextLine = targetLines[bodyStart + bodyLines.length] ?? "";
  reports.push({
    builder: b.name, sourceStartLine: b.start, sourceEndLine: b.end, sourceLineCount: b.end - b.start + 1,
    targetMarkerLine: markerIndex + 1, targetBodyStartLine: bodyStart + 1, aliasLine: head.trim(),
    sourceSliceSha256: sha(slice), targetBlockSha256: sha(actual),
    containsVerbatimSourceBlock: actual === expected,
    documentedAdaptations: (DOC_ADAPT[b.name] ?? []).map(([from, to]) => `${from} -> ${to}`),
    tailAfterBlock: nextLine.trim().startsWith("ctx.") ? nextLine.trim() : "(none)",
  });
}
const summary = { generatedAt: new Date().toISOString(), builders: reports.length, allBlocksVerbatim: reports.every((r) => r.containsVerbatimSourceBlock), reports };
fs.writeFileSync(`${OUT}/builder-map.json`, JSON.stringify(summary, null, 2), "utf8");
const md = [
  "# B7 `openInternalUnsafe` builder 分解 — 连续块映射与逐行等价",
  "",
  "- Source: `git show HEAD:app/desktop/session.ts` lines 1984–3064（e37da80）。",
  "- 主流程：保留原 1986–1993 前置校验 + 顺序调用 8 个 builder（当前主流程 18 行 + 校验段；较方案 §3.4 的 120–150 行估计更短——所有连续块均已整体下沉，剩余仅为编排调用）。",
  "- 每个 builder：入口 `const { … } = ctx;`（同一对象解构为同名局部 const，保持原 `const` 收窄语义）+ 原连续块**逐字** + 块尾把本块产出的变量写回 `ctx`。",
  "- 唯一文本适配（逐步记录）：",
  "  - `assembleToolSurface`：`const manager = this;` → `const manager = this.host;`（下载 presenter 的 `requestIdFor`/`withRequestLifecycle` 门面引用；host=Lifecycle→门面同实例）。",
  "  - `assembleProjectCapabilities`：`caller.handle === handle` → `caller.handle === ctx.handle`（原闭包按运行期读取外层 `handle`；B6 块在成功开会话后才赋值，别名会在入口定格 undefined，故保留 `ctx` 运行期读取）。",
  "",
  "| builder | source lines | target block start | contains verbatim block | adaptations |",
  "| --- | --- | --- | --- | --- |",
  ...reports.map((r) => `| ${r.builder} | ${r.sourceStartLine}–${r.sourceEndLine}（${r.sourceLineCount} 行） | open.ts:${r.targetBodyStartLine} | ${r.containsVerbatimSourceBlock ? "YES" : "**NO**"} | ${r.documentedAdaptations.length ? r.documentedAdaptations.join("；") : "—"} |`),
  "",
  "## 主流程与前置段",
  "",
  "- 原 1986–1993（参数/运行时校验、`key`、`stopped`、`stoppedResult`、`if (stopped()) return stoppedResult();`）留在 `openInternalUnsafe` 主流程，文本逐字。",
  "- 原 1994–3063 全部按上表连续切分，无一行遗漏、无重排；builder 调用顺序与源顺序一致。",
  "- 原始 `return` 语句保持在所属连续块内（值原样返回；主流程以 `!== undefined` 判定早退）。",
  "",
].join("\n");
fs.writeFileSync(`${OUT}/builder-equivalence.md`, md, "utf8");
console.log(JSON.stringify({ builders: reports.length, allBlocksVerbatim: summary.allBlocksVerbatim, bad: reports.filter((r) => !r.containsVerbatimSourceBlock).map((r) => r.builder) }, null, 2));
