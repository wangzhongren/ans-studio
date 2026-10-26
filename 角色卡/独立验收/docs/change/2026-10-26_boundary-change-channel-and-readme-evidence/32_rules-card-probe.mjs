import { readFileSync } from "node:fs";
import { governanceRoleOf } from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/common/门禁引擎/governance-roles.ts";

const convener = governanceRoleOf("convener");
const nominator = governanceRoleOf("nominator");
if (convener === undefined || nominator === undefined) {
  console.log("missing role");
  process.exit(1);
}
const c = convener.cardText;
const checks = [
  // 独立复核时机（第一笔规则）
  ["独立复核章节", "## 独立复核时机（必须）"],
  ["复核太晚", "复核太晚"],
  ["不只看状态账本", "不是只看步骤状态 / 账本"],
  ["检查点1 脚手架", "1. **脚手架交付后**"],
  ["真实安装/typecheck/最小测试", "真实执行安装、`npm run typecheck` 与最小测试"],
  ["应用能启动或最小运行", "应用能启动或最小运行"],
  ["检查点2 首个垂直切片", "2. **首个垂直切片 / 首个可玩交付后**"],
  ["关 DEBUG 截图/录屏", "真实运行截图 / 录屏（关 DEBUG）"],
  ["检查点3 每个 delivery", "3. **每个 delivery 交付后、标 `done` 前、派后续依赖前**"],
  ["不先标 done 不先派下游", "不得先标 `done`、不得先派下游"],
  ["检查点4 验收非第一次", "4. **变更包 / 验收阶段仍是最后一关，但不得成为第一次看产物**"],
  ["不是只在验收阶段", "不是只在验收阶段才看产物"],
  ["UI/游戏派发要求", "**UI / 游戏 / 视觉类派发（必须）**"],
  ["截图+验收标准指针", "真实运行截图 / 录屏（关 DEBUG）+ 验收标准指针 + 关 DEBUG 说明"],
  ["不符合立即退回", "不符合立即退回返工"],
  // Gate 规划（第二笔）
  ["Gate 规划章节", "## Gate 规划（规则，必须）"],
  ["四类 gate 固定", "四个固定 gate 节点：**垂直切片、视觉基线、集成 / 性能、最终客户验收**"],
  ["适用矩阵", "**适用矩阵（按风险档 × 产品类型启用；不得默默省略）**"],
  ["矩阵原型档", "| 原型档（任意产品） | 必设 | 仅 UI / 游戏设 | 仅多模块 / 多端设 | 必设 |"],
  ["矩阵生产 UI/游戏", "| 生产档 · UI / 游戏 | 必设 | 必设 | 必设 | 必设 |"],
  ["矩阵生产 CLI/后端", "| 生产档 · CLI / 后端 | 必设 | 不设（写明理由） | 必设 | 必设 |"],
  ["矩阵生产纯库", "| 生产档 · 纯库 | 不设（写明理由） | 不设（写明理由） | 必设 | 必设 |"],
  ["矩阵 T0/纯文档", "| T0 / 纯文档 | 可不设 | 可不设 | 可不设 | 只保留最终验收，或**显式说明不设额外 gate 并写理由** |"],
  ["不得默默省略", "不得默默省略"],
  ["模板章节", "**每个 gate 的模板（必须字段）**"],
  ["模板 gate id", "`gate id`：固定语义 id"],
  ["模板验收标准指针", "`验收标准指针`：指向验收标准 / 提案 / 计划中的可核对条目"],
  ["模板证据清单", "`证据清单`：截图 / 运行输出 / 测试报告 / 性能数据（UI / 游戏注明关 DEBUG）"],
  ["模板负责人不是 Proof", "`负责人`：证据产出的 owner（项目角色），不是 Proof"],
  ["模板独立判定 Proof", "`独立判定`：Proof / 验收"],
  ["模板下游 dependsOn", "`下游 dependsOn`：依赖该 gate 的步骤 id 列表"],
  ["gate 未 done 不派下游", "gate 未 `done` 下游不得派发（沿用现有 `dependsOn` 门禁，不新增检查）"],
  ["game 示例", "**game 项目示例（计划里照此落 gate）**"],
  ["game 垂直切片", "`gate-vertical-slice`（脚手架后首个可玩切片"],
  ["game 每关/Boss", "每关 / Boss 各一个 `gate-visual-level-01`"],
  ["game 集成/性能", "`gate-integration`（集成 / e2e / 性能采样"],
  ["game 最终验收", "`gate-final-acceptance`（最终客户验收"],
  ["失败与返工", "**失败与返工**"],
  ["fail 走返工", "gate `fail` 必须走现有返工路由"],
  ["返工路由", "`flow_step_supersede` / 退回 owner 返工"],
  ["返工后重新复核", "返工完成后**重新复核该 gate**"],
  ["不得直接标通过", "不得直接标记通过"],
  ["不得后续验收补跳", "不允许用「后续验收再补」跳过 gate"],
  ["只有 Proof 独立判断", "**独立判断只由 Proof / 验收做**"],
  ["不自查/不自标通过", "不得自查代替、不得自己标 gate 通过"],
  ["不写自查为 Proof 结论", "不得把自查写成 Proof 结论"],
  ["无新 FlowStepKind/工具/账本", "**不新增 `FlowStepKind` / 工具 / 账本 kind**"],
  ["不引入 request_gate_review/gateKind", "不引入 `request_gate_review`、`gateKind`"],
  ["gate 用现有步骤", "gate 用现有步骤表达（如 `artifact` / `acceptance`）"],
  ["不改变验收语义", "不改变现有验收语义"],
  ["不引入图 schema", "不为 gate 引入图 schema"],
];
let pass = 0;
const misses = [];
for (const [label, needle] of checks) {
  const ok = c.includes(needle);
  if (ok) pass += 1;
  else misses.push(`${label} :: ${needle}`);
}
console.log(`card checks: ${pass}/${checks.length}`);
for (const miss of misses) console.log(`MISS ${miss}`);
console.log("nominator card has Gate 规划:", nominator.cardText.includes("Gate 规划"));
console.log("nominator card has 独立复核时机:", nominator.cardText.includes("独立复核时机"));
console.log("convener entries:", JSON.stringify(convener.entries.map((e) => e.path)));
console.log("convener preauthorizedDirs:", JSON.stringify(convener.preauthorizedDirs));
console.log("convener capabilities:", JSON.stringify(convener.capabilities));
console.log("convener forbiddenWritePaths:", JSON.stringify(convener.forbiddenWritePaths));

const designPath = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md";
const design = readFileSync(designPath, "utf8");
const designChecks = [
  ["design status rules-only", "status: rules-only"],
  ["design v1 rules-only", "只落规则、不实现工具/新 schema"],
  ["request_gate_review 未实施", "未实施、未授权"],
  ["不新增 FlowStepKind/工具", "不新增 `FlowStepKind`/工具"],
  ["设计不改角色卡（设计阶段声明）", "未改任何产品代码、测试、角色卡"],
];
let dpass = 0;
for (const [label, needle] of designChecks) {
  const ok = design.includes(needle);
  if (ok) dpass += 1;
  else console.log(`DESIGN MISS ${label} :: ${needle}`);
}
console.log(`design checks: ${dpass}/${designChecks.length}`);
