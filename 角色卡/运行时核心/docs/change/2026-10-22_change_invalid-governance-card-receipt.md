---
id: invalid-governance-card-receipt
type: change
title: 治理确认卡未发出回执（declined + notPresented）与 schema 字段纪律
created: "2026-10-22"
updated: "2026-10-22"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [invalid-governance-card-guard]
events:
  - date: "2026-10-22"
    kind: implemented
    summary: 按客户确认的严格口径实现本角色 N2/N3/N4；目标测试 9/9、定向 typecheck 0 错；N1（编排守卫）与 N5（门禁角色卡文本）由各自属主随后实施
---

# 治理确认卡未发出回执与 schema 字段纪律

## 背景与范围

客户 2026-10-22 确认按[无效治理卡守卫设计](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)的 **N1–N5 严格口径**实施：五个内置治理角色（liaison / rapporteur / nominator / convener / verifier）的 `request_confirmation` 缺 `flowId` 或 `cardKind` 时，应用在触达客户通道之前拒绝发卡，并把可操作原因回投模型，而不是呈现给客户手动审批。**O1–O7 均未授权，本轮未实施。**

本角色本轮只做契约与回执层：

- **N2**：`CustomerInputOutcome` 的 `declined` 变体新增可选 `notPresented?: true`。
- **N3**：`request_confirmation` 工具在收到 `declined + notPresented:true` 时返回「卡片未发出 / 未向客户呈现」，不再以「未获客户同意」开头。
- **N4**：`request_confirmation` 的 `flowId`/`cardKind` 参数描述与工具说明写明：五个内置治理角色必须始终同时携带两项，缺失会被应用拒绝且不会向客户发卡；普通项目角色与 single/su 仍为可选。

**N1（编排 `governedInput` 的呈现前守卫）与 N5（门禁引擎角色卡文本）不在本角色范围**，由编排与门禁引擎各自实施。在 N1 落地前，本层的「卡片未发出」分支不会被触发，行为与现状一致。

## 改动在哪（位置 → 改动）

1. `src/model/runtime.ts`
   - `CustomerInputOutcome` 的 `declined` 变体由 `{ outcome: "declined"; operatorId?: string; reason?: string }` 扩为可选的 `notPresented?: true`（带注释说明语义与向后兼容）。
   - 未改其他 Model 类型；`CustomerInputRequest` 不变。
2. `src/provider/runtime/tools.ts`
   - 新增私有回执助手 `cardNotPresented(name, reason)`：`ok:false`，文案为
     `「request_confirmation：治理确认卡未发出（未向客户呈现；原因：<具体缺项>）→ 未获任何同意；请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」`（缺 `reason` 时写「原因：未提供」）。
   - `makeRequestConfirmationTool` 的 `declined` 分支先判 `out.notPresented === true`；**常规 `declined`（客户拒绝等未置位）仍走原 `notConsented` 文案，逐字不变**。
   - 更新该工具 JSDoc 的返回语义（第三条回执形态）。
   - `request_choice` 的 `declined` 分支未改（O1 未授权）。
3. `src/provider/runtime/schema.ts`
   - `request_confirmation` 的 `flowId` 与 `cardKind` 参数描述：明确五个内置治理角色必须同时携带两者，缺失或越权会被应用拒绝且不会向客户发卡；普通项目角色与 single/su 仍为可选，旧调用仍可用。
   - 工具 `description` 同步上述纪律；`promptGuidelines` 增加一条内置治理角色的调用准则。
   - **未改字段形状、`required`、枚举值或 `additionalProperties`**；`stepId` 仍为可选。
4. `test/runtime-core/governance-flow-metadata.test.ts`
   - 新增 **T12**：`declined + notPresented:true` → `ok:false`、含「治理确认卡未发出 / 未向客户呈现 / 具体缺项 / 请补齐后重新调用 / 不要写盘 / 不要向客户声称其拒绝或同意」，且不含「未获客户同意」；常规 `declined` 文案逐字断言不变；`request_choice` 的 `declined`（即使带 `notPresented`）文案逐字不变。
   - 新增 **T13**：schema 的 `flowId`/`cardKind` 描述与工具说明含治理角色纪律与「缺失不发卡」；Provider 仍接受不带任何治理字段的旧调用，请求与 metadata 不凭空出现字段。

## 以前怎样 → 现在怎样

- **以前**：任何 `declined` 都变成「未获客户同意（原因：…）→ 不要写盘」。如果拒绝来自应用前置守卫（客户根本没看到卡），模型容易误报「客户拒绝」。
- **现在**：编排以 `declined + notPresented:true` 表示「卡片从未呈现」时，工具回执为「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意；请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」仍是 `ok:false`，模型知道应补齐参数重发，而不是声称客户拒绝或同意。
- **不变**：常规 `declined`（客户拒绝、判断 manual 退回等）文案逐字不变；`request_choice` 行为不变；合法确认卡与 `ok:true` 回执不变；Provider 不做角色级判定（那是编排 N1 的职责），旧调用形状校验不变。
- **schema 可见变化**：模型在工具说明里能看到「内置治理角色必须同时携带 flowId + cardKind；缺失会被拒绝且不发卡」。对普通项目角色、single/su 的旧调用没有新增限制。

## 范围与兼容

- 纯加法：新字段可选；旧生产者不设置时，所有下游行为与文案逐字不变。
- 未改工具名、工具数量、`executionMode`、枚举、`required`、适配器、桌面、Service、门禁或编排。
- 本层不新增角色级校验：Provider 保持「只做形状校验」，角色白名单与呈现前守卫在编排（N1）。

## 验证（Windows 11 / Git Bash / Node v24.22.1）

实际命令与结果：

1. 目标测试（cwd `C:\Users\51054\Desktop\work\ans-studio`）：
   `node --test --test-timeout=120000 test/runtime-core/governance-flow-metadata.test.ts`
   → **9 tests / 9 pass / 0 fail / 0 skip，exit 0**（含新增 T12、T13）。
2. 本角色目录回归：
   `node --test --test-timeout=120000 --test-force-exit "test/runtime-core/"*.test.ts`
   → **284 tests / 277 pass / 3 fail / 4 skip，exit 1**。3 条红均为本机 Windows 无符号链接权限的既有环境红：`file-write-safety.test.ts` 的 D3 链接用例 1 条、`session-store.test.ts` 的 symlink 用例 2 条（均 `EPERM: operation not permitted, symlink`），与本次改动无关，无新增红。
3. 全仓 `npm run typecheck`：
   → **exit 1，共 3 条错误，全部位于另一角色未跟踪目录 `test/测试/background-tasks-e2e-real-model/`**（`OrchestrationEvent` 与 `SessionEvent` 不兼容的既有红，属并行后台任务工作，非本改动范围）；本角色改动文件无错误。
4. 定向 typecheck（与 `tsconfig.json` 同口径选项，显式列出本批四个文件）：
   `npx tsc --ignoreConfig --noEmit --target esnext --lib esnext --module nodenext --moduleResolution nodenext --strict --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --erasableSyntaxOnly --isolatedModules --resolveJsonModule --forceConsistentCasingInFileNames --types node src/model/runtime.ts src/provider/runtime/tools.ts src/provider/runtime/schema.ts test/runtime-core/governance-flow-metadata.test.ts`
   → **exit 0**。

未跑真实模型/凭据/网络；未启动或重启应用；未 git 提交；未触碰 `todo-demo`。

## 未验证项与跨角色依赖

- **N1 未落地**：本层的「卡片未发出」文案分支只有在编排返回 `declined + notPresented:true` 时才会出现；目前无效治理卡仍会被呈现。端到端行为（不发卡、不镜像、不判断、不记账）需 N1 完成后由测试角色验证。
- **N5 未落地**：门禁引擎的五张内置角色卡文本尚未改为「缺失即退回补齐」；与本层 schema 文案同口径的最后核对由门禁引擎属主完成。
- **真实入口未联调**：桌面/CLI 客户通道、三适配器与真实模型轮次均未在本轮验证；本报告只证明 Provider 处理器与 schema 数据。
- **全仓 typecheck 基线红**：`test/测试/background-tasks-e2e-real-model/` 的 3 条错误属其他角色在途工作，本角色未修改，也未将其计为通过。
- **文案衔接提示（需编排配合）**：设计 §4.6 的「原因文案（建议逐字采用）」本身以「请补齐后重新调用。」结尾，而工具模板也会追加同一句。若 N1 把建议文案整段作为 `reason` 传入，最终回执会出现该句重复。建议 N1 传入时不带这句结尾（由工具统一追加），或在 N1 侧自行去重；本层未对 `reason` 做裁剪，以免隐藏编排给出的信息。

## 相关链接

- 权威设计（项目管理）：[无效治理确认卡的应用侧守卫](../../../项目管理/docs/design/2026-10-22_design_invalid-governance-card-guard.md)
- 当前功能与流程：[同一套治理工具与隔离会话](../feature/runtime-core.md)
