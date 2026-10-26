import { governanceRoleOf } from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/common/门禁引擎/governance-roles.ts";

const convener = governanceRoleOf("convener");
if (convener === undefined) { console.log("missing role"); process.exit(1); }
const c = convener.cardText;

const positive = [
  ["新章节", "## 证据完整性与 gate 协调（必须）"],
  ["不再实质复核", "统筹**不再做实质性独立复核**（重复且越权）"],
  ["只查证据与 gate", "只做**证据完整性检查与 gate 协调**"],
  ["不判断质量", "不对画面 / 实现质量下结论"],
  ["质量只由 Proof", "质量判断只由 Proof 的 gate 复核做"],
  ["不能只看状态账本", "不能只看步骤状态 / 账本"],
  ["证据缺失不得 done", "证据缺失不得当 `done`"],
  ["退回补证", "退回补证"],
  ["脚手架证据", "1. **脚手架后**"],
  ["安装/typecheck/最小测试日志", "安装 / `npm run typecheck` / 最小测试日志"],
  ["启动记录", "应用能启动的记录"],
  ["不判断质量（脚手架）", "**不判断质量**"],
  ["gate 存在/done", "gate 步骤是否存在、是否 `done`"],
  ["证据清单", "证据清单（关 DEBUG 截图 / 运行输出 / 测试报告 / 性能数据）"],
  ["路径有效", "路径是否有效"],
  ["gate 未 done 不派下游", "gate 未 `done` 不派下游"],
  ["最终验收 Proof/客户", "仍由 Proof / 客户决定"],
  ["最终验收 request_acceptance", "最终验收用 `request_acceptance`"],
  ["不代替 Proof", "不代替 Proof、不写客户决定"],
  ["UI/游戏派发要求", "**UI / 游戏 / 视觉类派发（必须）**"],
  ["截图+验收标准指针", "真实运行截图 / 录屏（关 DEBUG）+ 验收标准指针 + 关 DEBUG 说明"],
  ["派发前只核对证据/gate", "派发下游前只核对证据是否齐备与 gate 是否 `done`"],
  ["质量由 Proof gate 判", "画面 / 实现质量由 Proof 的 gate 复核判定"],
  ["不得自查代替 Proof", "不得自查代替 Proof"],
  ["不得伪造 done", "不得伪造 `done` 证据"],
  // Gate planning unchanged
  ["四类 gate 固定", "四个固定 gate 节点：**垂直切片、视觉基线、集成 / 性能、最终客户验收**"],
  ["适用矩阵", "**适用矩阵（按风险档 × 产品类型启用；不得默默省略）**"],
  ["模板 gate id", "`gate id`：固定语义 id"],
  ["模板验收标准指针", "`验收标准指针`：指向验收标准 / 提案 / 计划中的可核对条目"],
  ["模板证据清单", "`证据清单`：截图 / 运行输出 / 测试报告 / 性能数据（UI / 游戏注明关 DEBUG）"],
  ["模板负责人非 Proof", "`负责人`：证据产出的 owner（项目角色），不是 Proof"],
  ["模板独立判定 Proof", "`独立判定`：Proof / 验收"],
  ["模板下游 dependsOn", "`下游 dependsOn`：依赖该 gate 的步骤 id 列表"],
  ["game 示例", "**game 项目示例（计划里照此落 gate）**"],
  ["fail 返工", "gate `fail` 必须走现有返工路由"],
  ["返工后重新复核", "返工完成后**重新复核该 gate**"],
  ["不得后续验收补跳", "不允许用「后续验收再补」跳过 gate"],
  ["无新工具", "**不新增 `FlowStepKind` / 工具 / 账本 kind**"],
  ["不引入 request_gate_review", "不引入 `request_gate_review`、`gateKind`"],
];
let pass = 0; const misses = [];
for (const [label, needle] of positive) {
  if (c.includes(needle)) pass += 1; else misses.push(`${label} :: ${needle}`);
}
console.log(`positive checks: ${pass}/${positive.length}`);
for (const m of misses) console.log(`MISS ${m}`);

const legacy = [
  "## 独立复核时机（必须）",
  "亲自看产物与证据",
  "亲自核对画面 / 输出是否符合验收标准",
  "不符合立即退回返工",
  "不合格立即退回返工",
  "复核只做判断与退回",
  "不等 Proof",
  "复核太晚",
  "统筹本来就有独立复核职责",
  "视为复核失职",
  "DOM / CLI 输出与验收标准逐条对照",
  "确认真实可玩 / 可用",
];
let absent = 0;
for (const phrase of legacy) {
  if (!c.includes(phrase)) absent += 1;
  else console.log(`LEGACY STILL PRESENT :: ${phrase}`);
}
console.log(`legacy phrases absent: ${absent}/${legacy.length}`);

console.log("convener entries:", JSON.stringify(convener.entries.map((e) => e.path)));
console.log("convener preauthorizedDirs:", JSON.stringify(convener.preauthorizedDirs));
console.log("convener capabilities:", JSON.stringify(convener.capabilities));
