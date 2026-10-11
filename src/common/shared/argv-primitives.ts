// 跨角色共享 argv 原语（**单一来源**）：规范化 argv `normalizeArgv`。
//
// **属主：项目管理**（`src/common/shared/` 的唯一写入者）。**消费方：编排、桌面应用**
// ——只读导入，**不得复制第二份实现**（工程法案 §一.5、`docs/architecture/shared-components.md`）。
//
// **来历（T23，设计 §3.11 行 7，全仓最后一处跨角色镜像）**：此前**同一套 argv 规范化语义**
// 被两处**各自维护**：
//   · **编排** `src/common/编排/shell-gate.ts`——拿规范化后的 argv **写进审计记录**
//     （`docs/audit/shell-gate.jsonl` 的 `argv` 字段）；
//   · **桌面应用** `app/desktop/operator-channel.ts`——拿同一结果**展示给操作者**
//     （`describeShellCommand` 的逐项 argv 行）。
// 二者**必须逐字同源**——否则「**落进审计的 argv**」与「**操作者所见到的 argv**」可能漂移，
// 而审计的意义正是「**审的什么原文**」可查；两处漂移即等于审计与所见**不是同一个**。故：
// **整体搬迁**到此（搬迁，非 fork），两处旧本地副本由 **T21（编排）/ T22（桌面）** 改为从本模块
// 导入并删除。收敛前处于**过渡性「两处并存窗口」**（两份逐字相同、行为不分叉）。
//
// **本层只做纯值规范化，不做任何治理判定**——「命令是否危险」唯一由门禁引擎判、「语义是否放行」
// 唯一由 pm 审读判；本函数只把不可信入参整理成 `string[]`，不含任何分类/白名单/规则逻辑。
//
// 行文依据：设计稿 `docs/design/2026-10-11_design_v1-full-implementation.md` §3.11 行 7。

/**
 * 规范化 argv：**过滤非字符串项**（对不可信输入保持稳健，与编排/桌面两侧口径一致）。
 *
 * 逐字搬迁自编排 `shell-gate.ts` 与桌面 `operator-channel.ts`（两处**逐字相同**）。行为：
 *  · 入参**非数组** → 返回 `[]`（`null`/`undefined`/标量/对象一律视作空）；
 *  · **仅保留** `typeof === "string"` 的项，其余（数字/布尔/`null`/`undefined`/对象/嵌套数组）**丢弃**；
 *  · **不**去重、**不**裁剪空白、**不**转义——**保序、逐字保留**每项（含空串、含引号/空格/反斜杠的项、
 *    Windows 与 POSIX 路径原样）；
 *  · **绝不**抛错（任何输入都返回值），因为消费方拿它写审计（编排）与呈现给操作者（桌面），
 *    两者都不能因畸形输入而中断。
 */
export function normalizeArgv(argv: unknown): string[] {
  if (!Array.isArray(argv)) return [];
  return argv.filter((x): x is string => typeof x === "string");
}
