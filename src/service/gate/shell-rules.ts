// src/service/gate/shell-rules.ts
// Service 公开出口：shell 闸 (c) 层规则集的公开再导出（编排 I-1 `assembleProjectShellGate` 的合法注入源）。
//
// 单一来源：实现与数据恒在门禁引擎私有 `src/common/门禁引擎/classify-shell.ts`——本文件**逐字转出**
// （同一函数引用），不复制实现、不另立第二份规则集；跨角色只可经此处（Service 公开出口）消费——
// 他角色导入本角色**私有** `common/` 不合法（§6），编排侧 `shell-arming.ts` 头注登记的「合法注入源」
// 即本文件（客户 2026-10-12 确认边界后落地）。
//
// 形状（与编排 `ClassifyShellFn` 逐字可注入，无需适配器）：
//   classifyShell(argv: string[], rules: ShellRules): ShellClass
//   defaultShellRules(): ShellRules
//   matchRoutineShellCommand(argv: string[]): { id: string } | undefined
//     —— 例行命令确定性白名单谓词（2026-10-31，方案 v1.3 §5.3）：分类器与写守卫的**唯一实现**；
//        编排/委托策略（`routine-shell-policy`）经本出口消费同一函数引用，不复制形状判定。
//        命中 id 稳定（`allow:routine:<id>`）；委托策略只接受原委托三 id（npm-test / npm-run-typecheck / node-test）。

export { classifyShell, defaultShellRules, matchRoutineShellCommand } from "../../common/门禁引擎/classify-shell.ts";
