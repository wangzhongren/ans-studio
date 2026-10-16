---
id: fix-g1-dispatch-required-reading
type: fix
title: G-1／A2 投递侧接线：派发必读块（投递时算哈希、契约缺失拒投、workflow 降级、单一来源收口）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待验证（边界单测全绿、typecheck 0 错；独立验证与真机复验待测试/root）
related: [contract-workflow-dispatch, kanban-fixes-pm-review]
---

# G-1／A2：派发必读块投递侧接线（桌面窗口）

**状态：已实施 / 待验证**（独立验证与真机复验未进行；未 git 提交）。落点（全部本角色 Section 1 内）：`app/desktop/session.ts`（`routeDispatch` 接线 + 删除本地副本 + `filePrint` 哨兵协议注释）、`test/桌面应用/dispatch-delivery.test.ts`（金文本按单一来源整体重写 + 新增 G-1 组 6 例）、`test/桌面应用/dispatch-fresh-enum.test.ts`（断言收敛到单一来源）。**未碰** `src/**`（编排 A1 已落树，本侧只读导入）、`app/renderer/**`、其它角色文件与测试证据目录。

## 一、依据

- **客户 2026-10-16 批准 G-1 实施**；PM 六项裁定见 `角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-1 客户批准与 PM 裁定」（裁定 3：契约缺失 → **拒投**并如实回执（fail-closed）；workflow 缺失 → **降级标注**；裁定 4：A5–A7 不入 V1）。
- 设计 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md` §四（引用格式/哈希只能由代码算/失败语义）、§七.4（必读块组装在 `routeDispatch`：入队定格）、§八（失败模式表）、§九 A2。
- **编排 A1 交回接口**（本批已落树）：`角色卡/编排/docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md` §五——单一来源 = `extractDispatchReadPaths`（提取）/ `planDispatchDelivery`（判据：拒投或定格文本）/ `renderDispatchPrompt`（渲染，`references` + `workflowMissing` 选项）。**桌面侧只做接线**（探测文件、按判据拒投/入队），不得各写一份。

## 二、改动

### 2.1 `app/desktop/session.ts::routeDispatch`

- **删除 `renderDispatchPromptLocal`**（既有登记依赖收口：「落地后必须切换、不得两处并存」——本批兑现；测试以代码级判据钉住不再出现实现/调用）。
- 接线（判据**紧挨去重登记 `activeDispatchKeys.add` 之前**——见 §四）：
  1. 探测：`extractDispatchReadPaths(task)` 逐路径 `filePrint(path.join(projectRoot, p))`——复用既有带 mtime+size 缓存的 sha256 内容指纹；缺失/读失败返回 `<missing>` **原样传入**（判据内非 64hex 天然按缺失处理，投递侧不再映射）；
  2. 判据：`planDispatchDelivery({roleId, task, reason}, probes)`：
     - `action: "reject"` ⇒ `return fail(plan.message, plan.systemRow)`——**不入队、不登记去重键、不开目标会话**；回执逐字进 `DispatchReceipt`（工具如实转达 su）+ 系统行进 su 聊天流；
     - `action: "deliver"` ⇒ 既有去重判/登记照旧；`text: plan.text`（必读块已由**同一单一来源**渲染注入）**入队即定格**。
- `filePrint` 注释补 `<missing>` 哨兵与判据协议（G-1 引用探测同用本函数；注释面）。

### 2.2 测试

- `test/桌面应用/dispatch-delivery.test.ts`：`dispatchTemplate` 改 import 编排单一来源（金文本整体重写——**旧桌面模板是单行内联、单一来源是三行布局**，非标点级 diff）；新增 **G-1 组 6 例**：
  1. **A2-1 必读块+哈希正确+按序+去重**：workflow 第 1、契约按首现序、重复引用恰一条；哈希为测试独立计算的当刻字节 sha256；**单一来源断言**——投递文本与 `renderDispatchPrompt(req, {references})` 逐字一致；
  2. **A2-2 契约缺失拒投**：回执逐字（`派发未受理：引用的契约 <path> 不存在——未投递。`）、系统行含 `**未投递**`、目标**零投递/零开会话/队列零条目**（emitRoleState 捕获）；**补齐后重派同一任务文本必须受理**（钉子：拒投不登记去重键——防「先登记后拒投、键永不释放」误去重）；
  3. **A2-3 workflow 降级**：不拒投、块内如实注「（本项目未提供 workflow.md）」、不指向不在场文件；文本 = 单一来源降级渲染；
  4. **A2-4 不误捕**：产物路径 `temp/…`、普通 `docs/…`、目录式 token（尾 `/`）不产生引用 ⇒ 不注入必读块，文本 = 单一来源旧格式逐字；
  5. **A2-5 哈希定格**：排队期间契约变更 ⇒ 已入队条目按**派发那一刻**的旧哈希投递；送达后同文再派才用新哈希（新版本地址）；
  6. **A2-6 单一来源收口（代码级钉子）**：`session.ts` 无 `renderDispatchPromptLocal(` 实现/调用、无内嵌 `[派发] 来自` 模板、接线走 `extractDispatchReadPaths`/`planDispatchDelivery`。
- `test/桌面应用/dispatch-fresh-enum.test.ts`：首轮寻址断言由旧模板子串改为 `renderDispatchPrompt` 原文等价。

## 三、失败语义矩阵（接线行为；判据本体在编排单一来源）

| 情形 | 行为 | 证据 |
|---|---|---|
| 任务引用 `docs/contracts/**` 且文件存在 | 块内条目 = 路径 + **当刻内容 sha256**；照常投递 | A2-1/A2-5 |
| 任务引用 `docs/contracts/**` 但缺失/不可读 | **拒投**（fail-closed）：不入队/不登记/不开会话；如实回执 + 系统行（`**未投递**`）；su 修正后重派同一文本必须受理 | A2-2 |
| 任务引用 `docs/workflow.md` 但缺失 | **降级标注照投**（「（本项目未提供 workflow.md）」；省略该行） | A2-3 |
| 普通路径（`temp/…`、`docs/其他`、目录 token） | 不注入、不校验（不误捕「将要创建的输出」） | A2-4 |
| 无任何引用 | 文本 = 单一来源旧三行格式**逐字**（不注入块） | A2-4 + 全部既有用例 |
| 排队期间契约文件被改 | 已入队条目**不重算**（重试复用同一定格文本——绑定「派发那一刻的契约版本」） | A2-5 |

## 四、与既有机制的衔接（零行为回归面）

- **去重键不变**：仍 `roleId\0task\0reason`（定格文本不是键）；唯一新增排序要求 = **判据先于去重登记**——桌面去重键在「送达」时才释放（`session.ts` 投递成功分支），若先登记后拒投，键永不释放 ⇒ 契约修好后重派同任务文本会被误去重（A2-2 钉子）。
- **回交与顾客消息零改动**：不经过本段（不受必读块影响）；`renderHandbackPrompt`/客户消息路径不在本批改动面。
- **回执通道不变**：拒投复用既有 `fail(message, row)`（工具回执 + `delivery-note` 系统行）——与「不在本项目」等既有拒绝分支同通道。
- **投递机/定格/重试不变**：`DeliveryItem.text` 入队即定格、失败放回队首复用同一文本；合批/串行/自动开会话等 F-2 语义未动。
- **渲染侧分类器不受影响**：`[派发] ` 前缀与 `来自 X 的` 均保持（tool-rows.js 分类器只依赖这两者；`test/桌面应用/` 全目录 316/316 含该面）。

## 五、测试与证据（实跑，2026-10-16，Node v24.14.0 / Darwin 25.6.0）

- 本角色 23 个边界测试文件：**241/241 全绿**（上一批 235 + G-1 组净增 6）。
- `node --test test/桌面应用/*.test.ts`（含桌面UI 同目录文件）：**316/316**。
- `node --test test/编排/handback.test.ts test/编排/dispatch-reads.test.ts`：**34/34**（A1 单一来源自身用例与既有 H-1 用例相容）。
- `npm run typecheck`：**0 错**（全仓）。
- 全量 `node --test "test/**/*.test.ts"`：**1528 计 / 1525 过 / 2 红 / 1 skip（Windows 专用）**。2 红全部为跨边界陈旧金文本，见 §六.1——非本角色文件、非行为回归；记忆中的 2 条基线红（检出目录名 / macOS 符号链接）在当前 HEAD 未复现。
- 未 git 提交；未碰 `ans-testbed/kanban-live-3`、`/private/tmp` 轮次目录与测试证据目录。

## 六、跨边界发现（如实登记；未越界修改）

1. **`test/测试/kanban-fixes-verify/f2-claim-release.test.ts`（测试角色冻结的独立复验套件）2 例转红**（全量中仅此 2 红）：其 `:32` 的本地 `dispatchTemplate` 仍按**已删除**的桌面旧模板断言（`:125`、`:160` 两处 `deepEqual`）。这是登记依赖「落地后必须切换」的**必然结果**——实际投递文本已是单一来源三行格式（差分证据在案：actual = `[派发] 来自 su 的任务\n<task>\n完成后请交回报告（改了什么/结论/证据）。`）；两例的**行为时序断言未受影响**（跨目标不阻塞 / 同目标排队全程通过，仅末尾金文本比对失败）。**修法一行**：`import { renderDispatchPrompt } from "../../../src/common/编排/handback.ts"` + `const dispatchTemplate = (task: string) => renderDispatchPrompt({ roleId: "A", task })`（该套件自建夹具、不复用实施方断言——更新金文本不改变其独立性）。**请 PM 派测试角色（或授权）更新**；本角色未碰该文件。
2. `app/renderer/tool-rows.js:54` 注释仍写旧模板文案（「固定 `[派发] 来自 <角色> 的任务：…`」）——分类器逻辑不受影响（只依赖前缀 + `来自 X 的`，全部通过）；注释属桌面UI，交其顺手更新（未越界）。
3. `test/桌面应用/renderer.test.ts`（桌面UI）以旧格式**字符串**作为分类器**输入**（非产品输出断言）——不受影响，无需改动（已验证通过）。

## 七、未做 / 依赖（如实）

- **A5**（manifest 留痕）、**A6**（O-1 指纹集扩展）、**A7**（write_file 回执附 sha256）按 PM 裁定 4 **不入 V1**（登记待评估）；本批未做。
- 真机复验（派发文本含必读块、角色动手前实读契约与 workflow、故意引用不存在契约 → 拒投回执可见）属测试/root 轮。
- 已知残余（随 V1，设计 §八末行承袭）：su 仍把契约全文塞进派发文本时无机械拦截；提取为保守正则——漏检即不校验也不拒投（口径以编排单一来源为准，本侧不另立）。
