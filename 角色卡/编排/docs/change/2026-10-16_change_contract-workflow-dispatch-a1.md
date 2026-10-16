---
id: change-contract-workflow-dispatch-a1
type: change
title: G-1 / A1——派发「必读（按序）」引用块单一来源（renderDispatchPrompt 扩展 + 提取/判据纯函数）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [contract-workflow-dispatch, kanban-fixes-pm-review, handback, dispatch-receipt-queue]
---

# G-1 / A1：派发文本「必读（按序）」块的**单一来源**（渲染 + 提取规则 + fail-closed 判据）

**状态：已实施 / 待验证**（独立验证与真机复验未进行；未 git 提交）。全部落点在**编排**角色 `boundary.yaml` Section 1 内：`src/common/编排/handback.ts`（H-1 节扩展为 H-1+G-1 共用件）、`test/编排/dispatch-reads.test.ts`（新增 14 例）。**不碰 `app/**`**——桌面侧的接线（探测文件、拒投回执入流、删除本地副本）由**桌面窗口**实施，接口说明见 §五。

## 一、来源与权限

- 客户 2026-10-16 批准 **G-1 按提案实施**（`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-1 客户批准与 PM 裁定」；六项裁定全采纳提案推荐）。设计规格为 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md`（下称「设计」），本轮实现其 **§四（派发文本引用格式 + 哈希计算约束 + 失败语义）** 与 §九 表 **A1** 行（属主＝编排）。
- PM 实施派发（同评审文）：A1「`renderDispatchPrompt` 必读块单一来源渲染」。裁定 3 明确失败口径：**契约缺失 → 拒投 + 如实回执（fail-closed）**；**workflow 缺失 → 降级标注**。
- 关键设计约束（设计 §四.2）：**哈希只能由代码算**——su 与项目角色都「不会算 hash」（`finalize.ts:2-3` 先例）。分工：**投递时**由投递侧代码（桌面 `filePrint`，带 mtime+size 缓存）算哈希；本角色提供**提取规则 + 渲染 + 判据**三件纯函数（不算哈希、不触盘）。

## 二、结论

派发文本的三件事——「哪些路径算必读」「缺失了怎么办」「怎么渲染」——此前分别是**无、无、桌面本地副本**（`renderDispatchPromptLocal`，落点注释登记「落地后必须切换、不得两处并存」）。本批把三者收进 `handback.ts` 一处（与 `renderHandbackPrompt` 同址模式）并钉上 14 例离线单测；桌面窗口改为只做**接线**（探测文件 → 调判据 → 拒投或按定格文本入队）。**改动方向零放行面扩大**：纯文本渲染与回执措辞，不触任何判定链、不新增写权语义（文案反向断言继续钉「不得夹带授权语义」）。

## 三、改了什么（`src/common/编排/handback.ts`，单一文件）

### 3.1 `renderDispatchPrompt(req, opts?)` 扩展（**渲染**）

- **无引用时旧格式逐字不变**（既有 3 行；`opts` 缺省/空引用同）——多数派发未引用契约/工作流，「加块」不重排旧格式；既有断言（`handback.test.ts` H-1 例）零改动、去重键（`roleId\0task\0reason`）语义不受影响。
- **有引用时**按设计 §四.1 示例渲染（哈希由调用方算好、**逐字注入**）：

  ```text
  [派发] 来自 su 的任务（原因：…）
  必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：
    1. docs/workflow.md（sha256:<64hex>）
    2. docs/contracts/<name>-v1.md（sha256:<64hex>）
  任务：<su 原文>
  完成后请交回报告（改了什么 / 结论 / 证据；完成口令见 workflow.md 第 2 节）。
  ```

- 两个**条件化**口径（如实登记，理由在此）：
  - **完成句**：仅当引用里**有** `docs/workflow.md` 时用「…完成口令见 workflow.md 第 2 节」变体（设计 §五.2 的完成口令协议在 workflow.md 第 2 节）；否则保持旧句——**不指向不在场的文件**。
  - **降级标注**：`workflowMissing`（任务引用了 `docs/workflow.md` 但文件缺失）→ 块内如实标注 `  （本项目未提供 workflow.md）`（措辞**照设计 §四.3 原文**）、省略该行、**不拒投**（V1 过渡期老项目向后兼容）。
- **矛盾输入（同路径既在 references 又标缺失）→ 引用为准**（references 是探测后的事实）——抑制标注、照常渲染该行（测试钉住）。

### 3.2 `extractDispatchReadPaths(task)`（**提取规则**，固定）

- 只认 `docs/workflow.md`（稳定文件名）与 `docs/contracts/` 前缀的 `.md`（长度守卫 `docs/contracts/.md` 名空不捕获；契约目录**整树**含子路径都属契约空间）；其余路径**不注入、不校验**（产物路径 `temp/…`、`src/…` 等——§四.3 第 3 条，避免把「将要创建的输出」误判为必读输入）。
- token 剥离**复用**既有保守提取 `extractPathCandidates`（同角色 `confirmed-writes.ts`；反引号/markdown/中文标点分隔、URL/绝对路径/目录式排除、去重——**不另写正则**，与 A-3 预览提取同源）。
- 保序：**`docs/workflow.md` 置首**（§五.3 阅读序：1) 本文件 2) 契约），契约按**首现序**。

### 3.3 `planDispatchDelivery(req, probes)`（**判据**，fail-closed 单一来源）

- 输入 `probes: ReadonlyMap<path, sha256|undefined>`——投递侧对提取出的路径逐个探测的**当刻哈希**（桌面 `filePrint` 的 `<missing>` 等非法值**直接传入即可**：非 64 位小写 hex 一律按「不存在」处理——fail-closed，不注入可疑哈希）。
- 语义（§四.3）：
  - 契约路径探测值缺失/非法 → `{ action:"reject", message, systemRow }`——**不产生任何可投递文本**（拒投结论结构上无 `text` 字段；「目标会话零投递」由接线侧照 fail-closed 执行）；多个缺失报**首现序第一个**；**拒投优先于降级**（契约缺失 + workflow 缺失 → 报契约）。
  - `docs/workflow.md` 缺失 → 降级放行（块内标注；契约照常、**编号重排**）。
  - 未引用的路径不参与判据（多余探测项忽略）。
- 回执（照 §四.3 措辞 + 桌面 `fail()` 两段式惯例）：
  - `message`（工具回执，su 直读）：`派发未受理：引用的契约 <path> 不存在——未投递。`
  - `systemRow`（聊天系统行）：`派发未受理：引用的契约 <path> 不存在——**未投递**（不静默；su 修正后重派）。`
- **放行文本必须出自同一 render**：`planDispatchDelivery` 内部调 `renderDispatchPrompt`（测试断言两者逐字一致——**无第二份渲染**）。

### 3.4 其他

- 新增导出：`DispatchReadRef`、`DispatchDeliveryPlan`、`DispatchPromptOptions`（类型）与 `extractDispatchReadPaths`、`planDispatchDelivery`（函数）；`renderDispatchPrompt` 签名只加**可选**第二参——既有调用零改动。
- 文件头/节注释写明：本模块是「必读块」单一来源（提取/判据/渲染都在此），前端只做接线、**不得各写一份**；哈希不在本层计算。

## 四、测试（`test/编排/dispatch-reads.test.ts`，新增 14 例；纯函数、不触盘）

1. 提取：workflow 置首/契约首现序/去重；契约整树（含 `sub/` 嵌套）；产物路径、其它 `docs/`、非 `.md`、目录式、URL、绝对路径、`docs/contracts2/` 前缀、CJK 紧贴、`docs/contracts/.md` 均**不捕获**；句尾 ASCII 标点剥离；空文本空。
2. 渲染：无引用逐字旧格式（含 `{}`/空引用两对照组）；workflow+契约**逐行金文本**（编号缩进/哈希逐字/完成口令指向）+ **授权语义反向断言**；仅契约（编号 1、旧完成句、多行 task 逐字）；workflow 缺失降级（标注措辞/省略行/编号重排/不指向不在场第 2 节）；矛盾输入引用为准。
3. 判据：全齐放行且文本与 render 逐字一致（**单一来源复用断言**）；契约缺失 6 种探测值（未探测/空串/`<missing>`/非 hex/63 位/大写 hex）一律拒投 + 回执逐字对照 + **结构上无投递文本**；多契约缺失报首个、拒投优先于降级；仅 workflow 缺失降级放行、恢复后完成口令指向回场；未引用任何必读 → 旧文案逐字、多余探测忽略；保序编号（workflow 文本后段出现也恒为第 1 条）。

**结果**：`node --test "test/编排/"*.test.ts` → **288/288**（274 + 14）全绿；`npm run typecheck` → **全仓 0 错**。既有用例零改动、未为变绿放松断言。环境：Node v24.14.0、Darwin 25.6.0。

## 五、给桌面窗口的接口说明（跨边界；改动由桌面实施，本角色不碰 `app/**`）

**导入**（与现有 `renderHandbackPrompt` 同一模块、同一风格路径）：

```ts
import { extractDispatchReadPaths, planDispatchDelivery, renderDispatchPrompt } from "../../src/common/编排/handback.ts";
```

**接线（`app/desktop/session.ts::routeDispatch`，替换现有 `renderDispatchPromptLocal` 调用）**——探测与判据必须在**去重登记（`activeDispatchKeys.add`）之前**：桌面现有去重键在「送达」时才释放（`session.ts:1830`），若先登记后拒投，键永不释放 ⇒ 修好契约后重派**同一任务文本**会被错误去重掉。判据在前、登记在后，拒投**不登记、不入队**：

```ts
const readPaths = extractDispatchReadPaths(task);
const probes = new Map<string, string | undefined>();
for (const p of readPaths) probes.set(p, await filePrint(path.join(projectRoot, p))); // filePrint 的 <missing> 原样传入即可
const plan = planDispatchDelivery({ roleId: targetRoleId, task, reason }, probes);
if (plan.action === "reject") return fail(plan.message, plan.systemRow);   // 复用既有 fail()：回执 su + 系统行；**不入队、不登记去重键、不开会话**
// …既有去重判/登记照旧…
this.enqueueDelivery(projectRoot, targetRoleId, { kind: "dispatch", ..., text: plan.text, ... }); // 文本入队即定格
```

要点：

1. **删除 `renderDispatchPromptLocal`**（既有登记依赖：落地后必须切换、不得两处并存）；`test/桌面应用/dispatch-delivery.test.ts` 的 `dispatchTemplate(...)` 本地模板同步改 import 本模块——切换后文本布局随之收敛为**本模块旧格式**（三行：首行含原因段、任务独占一行、末句带句号；与桌面旧单行内联模板**不是**同布局，该测试的金文本需按本模块重写）。
2. **契约缺失拒投**：走 `plan.action === "reject"` 分支——如实回执（`fail(plan.message, plan.systemRow)`：message 进 `DispatchReceipt` 给 su、systemRow 放 su 聊天流），**不投递**；`dispatch_task` 语义上这是一次**未受理**（对照现有「不在本项目」分支）。
3. **workflow 缺失降级不是错误**：`plan.action === "deliver"` 照常入队（文本块内已如实标注）。
4. **哈希**：复用既有 `filePrint`（投递时算、带缓存；重试用同一份定格文本——绑定「派发那一刻的契约版本」，语义正确）；`renderDispatchPrompt`/`planDispatchDelivery` **不会**碰文件系统。
5. **去重键不受影响**：仍 `roleId\0task\0reason`（定格文本不是键）；唯一排序要求＝**判据先于去重登记**（上文已写明理由——拒投不登记，`activeDispatchKeys` 无残留）；位置/回执文案 `formatDispatchReceipt` 不变。
6. **CLI/其它前端**：将来复用同一三件套（本模块注释已写明「前端只做接线、不得各写一份」）。

## 六、未做与残余（如实登记）

1. **A3/A4**（su 卡文本、`dispatch_task` 工具描述改「按地址引用」）归**门禁引擎/运行时核心**——本项只备好收文本侧的能力；su 仍把契约全文塞进派发文本时**无机械拦截**（设计 §八表末行：V1 已知残余）。
2. **A2 剩余**（桌面窗口）：投递时算哈希 + 拒投回执接线 + 删除本地副本；**A5**（manifest 留痕）**A6/A7**（O-1 指纹扩展 / write_file 回执附 sha256）按 PM 裁定 4 不入 V1。
3. **报价措辞的选择**：完成句变体与「任务：」前缀照设计 §四.1 示例（引用块在场时）；旧格式（无引用）逐字不变——两种形态并存是「加块不重排」的如实取舍，如需统一排版是后续设计决定。
4. 真机复验（kanban-live 同型：派发文本无契约全文、角色动手前实读契约、故意引用不存在契约 → 拒投可见）属测试/客户跑。

## 七、边界声明

只写本角色 Section 1 内文件（`src/common/编排/handback.ts`、`test/编排/dispatch-reads.test.ts`、本记录与 changelog/memo/api-spec）。**未碰** `app/**`、`src/provider/**`、`src/common/shared/**`、其它角色文件与测试证据目录；未 git 提交；未重启桌面应用；未发真实模型请求；未跑真实项目。未动 kanban-live-3 / `/private/tmp` 下轮次目录。相关导航见[编排功能导航](../../feature-map.md)。
