---
id: core-dispatch-task-address-reference
type: fix
title: "G-1/A4：dispatch_task 文案同步——「先落盘再派发」与按地址引用（必读（按序）块）"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [contract-workflow-dispatch, kanban-fixes-pm-review]
---

# A4：dispatch_task 工具描述/指引同步（G-1 V1 最小闭环）

**状态：已实施待验证（未部署）。** 依据：客户 2026-10-16 批准 G-1 按提案实施（PM 评审 §「G-1 客户批准与 PM 裁定」六项裁定采纳提案推荐）+ 设计规格 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md`（§四、§九 A4）；PM 实施派发（同评审 §G-1 节）：运行时核心＝「`dispatch_task` 描述同步」。V1 最小闭环四上下文＝编排（A1）/桌面窗口（A2）/门禁引擎（A3）/运行时核心（A4）。

## 改动文件清单（全部在本角色 boundary.yaml Section 1 内）

| 文件 | 实施内容 |
|---|---|
| `src/provider/runtime/schema.ts` | `dispatch_task` 的注释、`task` 参数英文描述、中文描述与 promptGuidelines 同步（只动文案；无判定/权限/执行路径改动） |
| `test/runtime-core/tools.test.ts` | 新增 1 例文案断言（+35 行），钉住 G-1 新增句与必备语义保留面 |
| 本记录 + `changelog.md` + `memo.md` | dated 记录与导航 |

## 文案摘录（schema.ts 新增句）

描述（`dispatch_task.description`）新增：

- 「多角色/跨角色协作时**先落盘再派发**：先把冻结契约落盘到 `docs/contracts/<name>-v<N>.md`（写盘许可已预置、直接写即可），工作流落盘到 `docs/workflow.md`（写盘经确认制：把路径列入规划确认的 preview），**再**派发任务。」
- 「任务文本**按地址引用**契约与工作流——「依据哪份文档」给项目内路径即可（如 `docs/contracts/<name>-v1.md`），**不内嵌契约全文**；投递时系统会据此自动附上「**必读（按序）**」块（先读完再动手），其中的 sha256 由投递系统在投递当刻计算——**不要自己算或转抄哈希**。」
- 「引用的契约文件不存在时投递会被**拒绝**（回执如实报错；补落盘后重派）；`docs/workflow.md` 缺失（旧项目过渡期）不拒投、必读块如实标注「未提供」。」

promptGuidelines 新增第三条（先落盘再派发＋按地址引用＋必读块/哈希归属＋契约缺失拒投），`task` 参数英文描述扩展（give the project path / don't paste the document's full text / the delivery attaches a required-reading block）。

**既有必备语义逐字保留**（H-1 三条：派发≠授权 / 任务自足（看不到你的上下文）/ 返工带证据；「不能授予或改变对方的写权」「不改变任何角色的写权」原句未动）；**不扩权限**（未授予任何写权、未改「普通操作无需逐次确认」与「扩张边界、治理写集仍由 su 请求客户确认」口径）；**不动判定**（无代码逻辑改动，纯文案）。

## 测试与实测（2026-10-16，Node v24.14.0 / macOS arm64）

- `node --test 'test/runtime-core/**/*.test.ts'`：**96 用例 / 96 通过 / 0 失败**（基线 95 + 本任务新增 1）。
- `npm run typecheck`（全仓）：**0 错误**。
- 消费方回归：`node --test 'test/pi-adapter/**/*.test.ts'` **232/232**——其中既有 `describeTool` 文案用例（正反向断言：`派发 ≠ 授权`/`自足`/`看不到你的上下文`/`返工`/`证据`/`不改变任何角色的写权` + 反向 `已获授权|已放行写盘|授予写权|授权写盘|代为授权成功` 不得出现）**不回归**（该文件属 Pi适配器边界，只读验证，未改）。
- 全量 `node --test 'test/**/*.test.ts'`：**1519 计 / 1518 过 / 0 红 / 1 跳过**（本角色改动定稿后、于工作树最末状态复跑——此时编排 A1、门禁引擎 A3 的并行改动均已落盘）。
- 未 git 提交；未部署；未触碰 `kanban-live-3`、`/private/tmp` 轮次目录与测试证据目录。

## 新增断言清单（test/runtime-core/tools.test.ts）

`schema 文案（G-1/A4）：dispatch_task 钉住「先落盘再派发」与「必读（按序）」按地址引用；必备语义逐字保留`——正向：`先落盘再派发` / `docs/contracts/<name>-v<N>.md` / `docs/workflow.md` / `按地址引用` / `不内嵌契约全文` / `必读（按序）` / `先读完再动手` / `不要自己算或转抄哈希` / `引用的契约文件不存在时投递会被**拒绝**` / `不拒投` / `未提供`；保留面：`派发 ≠ 授权`/`自足`/`看不到你的上下文`/`返工`/`不改变任何角色的写权` + 反向断言（不得暗示派发携带授权）+ 参数形状（required＝`["roleId","task"]`、`executionMode` 为 undefined）不变。断言按实文案钉住，未为变绿放松。

## 口径对齐（与并行上下文，落盘后核对）

- **编排 A1 渲染已实测对齐**（其改动本轮到此时已落 `src/common/编排/handback.ts`，只读核对）：必读块块头逐字为「必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：」——本工具文案只述块名与语义、不复制块头逐字，避免两处漂移；拒投/降级（`planDispatchDelivery`）与提取规则（task 文本中 `docs/workflow.md` + `docs/contracts/*.md` 前缀，其余路径不注入不校验）与本文案描述一致（「投递时系统会据此自动附上」）。无引用时旧三行格式逐字不变（其声明），不影响本文案。
- **门禁引擎 A3（su 卡文本）已在本轮到内落盘并逐句核对一致**（`src/common/门禁引擎/boundary-core.ts`「规划纪律」段 + J-1 扩展段）：同一词汇逐句对齐——「**先落盘再派发**」「**按地址引用**」「**不内嵌契约全文**」「投递时系统自动附「**必读（按序）**」块（先读完再动手；路径 + 由系统在投递时计算的 sha256）」「**不要自己算或转抄哈希**」「引用的契约不存在会被**拒投**（如实回执，补落盘后重派）」。其卡文本另承载冻结不可变（`v1` 冻结后出新版本文件）、契约变更/重派/作废流程与 blocked 纪律——属卡级纪律，与本文案不冲突（本文案不重复、不矛盾）。其注释明确「与…运行时核心 `dispatch_task` 文案『先落盘再派发』同口径」，并对其 `docs/workflow.md` 写盘口径与本文案处理**完全一致**（见下 §如实标注 1）。
- 投递时算哈希/拒投回执的实现属桌面窗口（A2）与本角色无关；本文案不声称哈希计算在本工具层。

## 如实标注（含一处派发前提修正）

1. **任务派发前提修正（跨边界发现，已获同批独立印证）**：派发文本称「落盘位置 docs/contracts/、docs/workflow.md，属 su 预授权目录」——与代码/裁定核对后，**预授权仅 `docs/su/**` + `docs/contracts/**`**（编排 `SU_PREAUTHORIZED_WRITE_DIRS=["docs/su","docs/contracts"]`，客户原话为「契约目录」）；`docs/workflow.md` **不在预授权内**，须走确认制（设计 §六：路径列入规划确认的 `request_confirmation` preview、经 `confirmed:true` 落盘）。本文案按实际口径表述（契约＝已预置直接写；工作流＝确认制 preview），与本角色 `request_confirmation` 文案的「唯一例外＝两棵树」逐字自洽；**同批门禁引擎 A3 卡文本（本轮到内落盘）对同一问题给出同一结论**（其注释与卡文本均写明 `docs/workflow.md` 不属预置两目录、列入同一次规划确认的 preview）——两处口径互证一致。若 PM 裁定应扩预授权至 `docs/workflow.md`，属机制变更（编排/门禁引擎侧），落地后回改本处文案与测试（登记）。
2. **「不内嵌契约全文」无机械拦截（V1 已知残余）**：与设计 §八一致——本工具不校验 task 文本体积/内容，靠本文案与 su 卡文本引导；作为已知残余登记（同设计 §十风险）。
3. **哈希不手算属产品约束**：su 与项目角色都「不会算 hash」（`finalize.ts` 先例），本文案明确「由投递系统在投递当刻计算」，且不要求 su 转抄哈希（设计 §四.2）。
4. 本文案只影响 su 会话（`dispatch_task` 仅给 su 注入），对项目角色不可见（`run-role.ts` 注入范围未动）。

## 跨边界备注（只读定位、未改）

- 消费方冻结面：`DispatchTaskPayload`（`src/model/runtime.ts` 家）未动；`renderDispatchPrompt` 第二参 `opts`（编排 A1 可选扩展）未动；本工具参数 required＝`["roleId","task"]`、`executionMode` undefined 未动（Pi/桌面接线不受影响）。
- `test/pi-adapter/dispatch-task.test.ts` 的文案断言面（H-1 三条 + 反向断言）属 Pi适配器边界：本轮到此时其全部用例保持通过，未改其文件。
