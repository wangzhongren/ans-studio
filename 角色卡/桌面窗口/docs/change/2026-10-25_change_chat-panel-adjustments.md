# 变更记录：治理反馈客户投影（聊天面板调整 A3/A4，2026-10-25）

- 角色：桌面窗口
- 状态：`implemented-unverified`（实现并有单测/真实 Electron 自检；渲染侧消费与真实 UI 验收待桌面UI/独立验收）
- 依据：UI/UX 评审 `角色卡/UIUX设计师/docs/design/2026-10-25_review_chat-panel-details/report.md` §2 A3/A4、§3「桌面窗口」；实施计划 [2026-10-25_plan_chat-panel-adjustments.md](../design/2026-10-25_plan_chat-panel-adjustments.md)
- 客户可见入口：主理聊天中 `[系统·治理反馈]` 注入行（Lead 会话）。此前原样显示「不要转述/不要编辑」等内部指令；现在事件另带结构化客户投影，渲染侧可只显示来源角色/状态/流程/报告位置/客户动作，并把内部原文折叠（UI 消费见桌面UI计划 A3/A4）。

## 改动

- `app/desktop/session.ts`
  - 新增导出 `GovernanceClientProjectionV1`（事件层可选字段，`version:1`）。
  - `mirrorGovernanceFeedback`：向 Lead 投递治理反馈成功后登记投影（Proof：状态四值/unknown + flowIds + reportPath + governancePath + `action:"report-ready"`；非 Proof 内置：`internal-feedback` + `action:"await-lead-summary"`），不伪造状态/路径；内部原文仍只存在于投递任务 `text`。
  - 事件消费循环：`prompt-input` 回显文本逐字命中登记项时，把投影并入外推事件 `detail.clientProjection`；未命中不改事件。
  - `fingerprint`：`sha256(canonical{kind, sourceRoleId, statusCode, flowIds(排序), reportPath, governancePath, textHash})`——同来源/状态/流程/指针/正文相同，供 UI 合并连续状态行（×N）。
  - 登记表有界（128 FIFO）+ 30 分钟 TTL；只在内存、不持久化（恢复/回放回退既有文本归类）。
- `角色卡/桌面窗口/api-spec.md`：新增「2026-10-25 治理反馈客户投影」契约段。
- 未改：`app/main.ts`、`app/preload.cjs`（复用既有 `session:event` 通道，不新增 IPC）、`app/renderer/src`、运行时/服务/Provider、共享 i18n。

## 验证

| 项 | 结果 |
| --- | --- |
| `node --test --test-concurrency=1 test/桌面应用/session.test.ts` | **35/35 pass**（新增投影用例：Proof completed/failed、指纹稳定与变化、内部原文保留、非 Proof internal-feedback、未登记文本不变） |
| `node --test --test-concurrency=1 test/桌面应用/*.test.ts` | **594/594 pass / 0 fail / 0 skip** |
| `node ../../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | **exit 0** |
| Electron e2e（真实主进程 + 预构建 renderer） | **E2E_PASS=true / E2E_FAILURES= / exit 0**；既有 GOVERNANCE_* 全 true |

## 未覆盖 / 风险

- 渲染侧尚未消费投影（桌面UI A3/A4）；未消费前行为与旧版一致（字段可缺省）。
- 投影不持久化：恢复/回放行没有 `clientProjection`，按旧文本归类显示。
- 回显文本与发送文本不一致（如投递计划改写）时查找 miss，事件保持原样（不猜、不伪造）；登记表有界，极端长期排队可能 miss。
- 真实 UI 视觉/合并计数/折叠交互待桌面UI实现后由独立验收复核。
