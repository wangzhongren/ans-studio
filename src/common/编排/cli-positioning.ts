// src/common/编排/cli-positioning.ts
// P1-4（产品提案 `desktop-ux-improvement-proposal`，2026-10-13 客户批准）：`ans role run` 的
// CLI **产品定位指路文案**——单一来源。
//
// 产品立场：**桌面是主工作台（交互式治理会话），CLI 是一次性执行器**。`ans role run` 走一次性路径
// （`runRole`）：不接 shell 闸（CLI 无确认框 ⇒ `run_shell` 不注册）、不传会话目录（一局即止）——
// 这是登记过的边界（fail-closed 方向正确），但此前**没有任何一处告诉用户「这事该去桌面做」**。
//
// 本句是**如实指路**（只陈述本命令没有的能力，不承诺任何新增能力）：帮助输出
// （`src/interface/cli/run.ts` 的 `-h/--help`）与一次性会话启动提示
// （`src/pipeline/orchestration/run-role.ts` 的 `runRole`）**共用同一句**，防止两处漂移。
// 两点必须写实：① 不提供 shell 与会话保持；② 交互式治理会话请使用桌面应用。
//
// 本轮只做**定位 + 指路**；终端 y/n 确认通道、CLI 会话持久化、CLI 投递机——提案明示**均不做**
// （等定位被确认、且有真实 CLI 用户诉求再立项）。
export const CLI_POSITIONING =
  "本命令不提供 shell 与会话保持（一次性执行）；需要交互式治理会话请使用桌面应用。";
