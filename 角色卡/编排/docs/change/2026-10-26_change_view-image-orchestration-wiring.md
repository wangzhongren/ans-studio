---
id: view-image-orchestration-wiring
type: change
title: view_image 图片查看能力接入角色会话（两轮附件设计）
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [request-gate-review-orchestration-core, decision-card-orchestration]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 编排面能力透传落地并经定向/全量编排测试；桌面侧类型收敛与独立验收未做
---

# 变更记录：`view_image` 接入角色会话（编排侧）

- 角色：编排
- 日期：2026-10-26
- 状态：**implemented-unverified**（编排面实现与测试已跑；桌面侧 `ViewImageFn` 类型收敛、跨角色 e2e、
  独立验收未做，不代表通过）
- 来源：运行时核心 2026-10-26 已落 `view_image` 工具与冻结契约（`src/model/runtime.ts`
  `ViewImageInput`/`ViewImageFn`、`src/provider/runtime/tools.ts` `VIEW_IMAGE_TOOL_NAME`）；客户要求
  角色可查看项目内图片证据，采用**两轮附件**设计（工具本轮只回「已排队」，图片在下一轮以用户提示
  附件提供）。编排任务：把该能力接入角色会话的注入面。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/run-role.ts`
  - `test/编排/view-image.test.ts`（**新增** 3 例）
  - 本记录、`changelog.md`、`feature-map.md`、`api-spec.md`、`memo.md`
- **未改** `src/model/**`、`src/provider/**`、`app/**`、共享 i18n、门禁引擎、其他角色资料；
  未 commit/push、未重启应用、未碰 `demos/`。

## 一、改动（`run-role.ts`）

### 1. `AdapterCapabilities`

新增可选能力位：

```ts
import type { ViewImageFn } from "../../model/runtime.ts";

export interface AdapterCapabilities {
  ...
  /** 图片查看（view_image「注入才注册」）；通用只读能力，项目角色与内置治理角色都注入。 */
  viewImage?: ViewImageFn;
}
```

- 类型**单一来源**＝契约家 `model/runtime.ts`（名字逐字 `viewImage`；错一名 ⇒ 工具静默零注册）。
- **不按角色收窄**：`view_image` 是通用只读能力（不写盘、不联网、不改任何写权），项目角色与内置治理
  角色在调用方提供时都可用——与只给 su/统筹的能力（`dispatchTask`/`requestAcceptance`/
  `requestGateReview` 等）不同；本批**不改**这些能力的既有注入矩阵。
- 未提供 ⇒ 能力缺席（字段不并入 capabilities）⇒ 运行时核心 `buildGovernedTools` 不注册工具
  （结构性 fail-closed，沿 `dispatch_task` 先例）。

### 2. `openRoleSession` 输入

新增同名可选字段 `viewImage?: ViewImageFn`，并**无条件**（不按角色判定）并入 capabilities：

```ts
const capabilities: AdapterCapabilities = {
  ...
  ...(input.viewImage !== undefined ? { viewImage: input.viewImage } : {}),
  ...
};
```

- 只透传同一引用，不做路径/类型/大小校验（校验在工具层：项目相对路径、png/jpg/jpeg/webp/gif、
  ≤10 MB、realpath 根内）；能力侧只负责排队并如实回执。
- 一次性路径 `runRole`（`ans role run`）不涉及（其本就不接受 capabilities，行为不变）。

### 3. `createRuntimeAdapterFactory`

把能力并入运行时选项：

```ts
viewImage: capabilities?.viewImage,
```

- 运行时核心 Service 以 `...options` 透传给 `buildGovernedTools`；`undefined` ⇒ 工具不注册
  （同时覆盖「工厂 options 里误带同名字段」的情况——能力面未给出即显式清空，fail-closed）。

## 二、测试（`test/编排/view-image.test.ts`，3 例）

真实 `openRoleSession` + 假 provider（不触网、不跑真实模型）：

1. **项目角色提供能力 ⇒ 同引用透传 + 工具注册 + handler 端到端**：临时项目写入 1×1 PNG；provider
   在 prompt 轮内调用 `view_image` handler；断言能力收到 `{ path: "docs/images/shot.png",
   image: { type:"image", data:<base64>, mimeType:"image/png" } }`，回执如实含「已读取并排队 /
   下一轮 / 能力 message」。
2. **内置治理角色（su）同样可用；未提供不注册**：su + 能力 ⇒ 注册；su 未给 ⇒ 能力缺席、工具不注册；
   项目角色未给 ⇒ 同样不注册。
3. **不影响其他能力注入矩阵**：su 只给 `viewImage` ⇒ `request_acceptance` 不注册（不隐含）；
   两能力同给 ⇒ 各自同引用、两工具都注册；项目角色即便误给 `requestAcceptance`，`view_image`
   照常可用而 `request_acceptance` 仍不注入（矩阵零放宽）。

## 三、验证（2026-10-26，win32 / Node v24.22.1）

- `node --test "test/编排/view-image.test.ts"` → **3/3 pass**。
- `node --test "test/编排/**/*.test.ts"` → **1007 tests / 1005 pass / 1 fail / 1 skip**；唯一红＝既有
  Windows symlink `shell-authorized-routine.test.ts:103` 创建链接 `EPERM`（基线一致，本批未触碰）。
- `npm run typecheck` → **本批文件零错**；全仓 12 处红**全部在桌面窗口属主文件**（`app/desktop/interface.ts`
  1、`test/桌面应用/*` 5、`test/测试/*` 6），根因＝**契约收敛时刻的预期偏差**：桌面
  `app/desktop/view-image.ts`（其注释自述「运行时核心暂未落契约，先用本地形状，落树后改从契约家只读
  导入」）仍用本地 `ViewImageFn = (request: {path, images: PromptImage[]}, metadata?) => ...`，与本批
  按契约家落地的 `ViewImageInput {path, image}`/异步回执不兼容；本批边界不允许改 `app/**`，故未修。

## 四、跨角色待办（请 pm 转达）

1. **桌面窗口**（必须，类型收敛）：
   - `app/desktop/view-image.ts` 删除本地 `ViewImageFn`/`ViewImageRequest` 形状，改从
     `src/model/runtime.ts` **只读导入** `ViewImageFn`/`ViewImageInput`/`PromptImage`；
   - 投递实现改收 `input.image`（单张 `PromptImage`），返回 `Promise<{ok, message?}>`；既有
     `SessionManager.send` 入队/后台系统提示/失败如实回执的纪律不变；
   - `app/desktop/interface.ts`/`session.ts` 的 `SessionManagerDeps` 同名字段同步换成契约类型。
   完成后 `npm run typecheck` 应回绿（当前 12 红即此一处根因）。
2. **桌面窗口**（功能面）：确认下一轮附件投递路径把图片放入 `PromptOptions.images`（P0-1 原引用语义），
   并在排队回执/失败时按 `{ok:false}` 如实呈现——两轮附件语义不得被桌面改写成「本轮已看到」。
3. **独立验证**：编排侧只证「能力提供 ⇒ 工具注册/透传；未提供 ⇒ 零注册；矩阵不变」；真实模型两轮
   附件（工具排队 → 下一轮图片到达）未验证。
4. **i18n/门禁角色卡**：已由各自属主并行落盘（`main.viewImage.*`/`ui.viewImage.attachmentLabel`、
   `governance-roles.ts` 两轮纪律），本批未改、交由各属主验收。

## 五、未做 / 风险

- 未做：桌面类型/形状收敛、桌面投递端到端、真实模型两轮附件、跨角色 e2e、独立验收、commit/push。
- 风险：本批合入后到桌面收敛前，全仓 typecheck 因上述 12 处桌面文件为红；运行时行为不受影响
  （仅类型层），但 CI 会红。编排侧无已知功能风险：能力缺席时工具结构性不注册；能力异常时工具层
  按「未排队」如实回执，不谎报已提供。
