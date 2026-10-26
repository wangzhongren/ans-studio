# 变更记录：decision 卡（材料性选择）渲染层标识接线（桌面UI）

- **日期**：2026-10-26
- **角色**：桌面UI（渲染前端）
- **状态**：**implemented-unverified**（渲染层实现、单测与 `typecheck:renderer` 完成；未跑真实 Electron e2e / 未截图核验；应用未重启，运行中的实例仍是旧构建）
- **授权依据**：
  - 客户 2026-10-26 decision 卡规则：主理发现材料性选择不得自定，交统筹发 `request_choice(cardKind="decision")`；卡内恰一个推荐项；customer 手选/判断默认推荐；decision 卡独立于提案/任命/验收，不是客户批准。
  - 规则与文案契约：`角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md` §一/§二；共享 i18n 由项目管理登记（`ui.decisionCard.title` / `ui.decisionCard.notApprovalBadge` / `ui.decisionCard.recommended`）。
  - 主进程实现（本批只读消费）：`角色卡/桌面窗口/docs/change/2026-10-26_change_decision-card-desktop.md`（发卡前 fail-closed 校验、确定性默认推荐、`recommended` 原样透传）。
- **写集**：只改 `app/renderer/`、`test/桌面UI/` 与本角色文档；**未改** `app/desktop/**`、`src/**`（含共享 i18n 文案）、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/**`、`demos/**`；未 commit/push；未重启/关闭应用。

---

## 一、契约核对：`options[].recommended` 从主进程到渲染层的路径

结论：**IPC 没有丢字段**；渲染层此前只是未消费该字段。

| 环节 | 事实 | 位置 |
| --- | --- | --- |
| 工具层 | `request_choice` 的 `readOptions` 对每项 `recommended` 只透传布尔（`undefined` 不补默认值、不校验个数） | `src/provider/runtime/tools.ts::readOptions` |
| 桌面发卡 | `payload.request = req`（原样请求对象，不重建 options）；校验通过后 `recommended` 保留 | `app/desktop/customer-input.ts::customerInput`（`request: req, anchorKey: ...`） |
| IPC 发送 | `win.webContents.send("session:operator-request", payload)`（Electron structured clone 保留普通布尔字段） | `app/main.ts` |
| preload | `onOperatorRequest: (cb) => { const listener = (_event, payload) => cb(payload); ... }`（payload 原样回调） | `app/preload.cjs` |
| 渲染 store | `appendOperatorRequest` 把整个 `record` 存入 `payload`（不裁剪 `request.options`） | `app/renderer/src/chat/chat-store.ts` |
| 渲染类型 | `payload` 在 `lib/platform.ts` 为 `unknown`；卡内 options 读作 `Record<string, unknown>[]` —— **无字段级类型需要补** | `app/renderer/src/chat/ChatRow.tsx::OperatorRow` |

跨角色观察（只读、未改）：`app/preload.cjs` 的 `onOperatorRequest` 注释只列 `options[{id,label,description?}]`，未提到 `recommended`；注释不参与运行时，字段实际原样透传。若后续要收紧文档口径，由「桌面窗口」属主更新。

## 二、实现内容

| 文件 | 改动 |
| --- | --- |
| `app/renderer/src/chat/decision-card.ts`（新增） | decision 卡面单一映射：`decisionCardView(request, locale)` 只在 `request.cardKind === "decision"` 时产出固定标题（`ui.decisionCard.title`）、「非客户批准」标识（`ui.decisionCard.notApprovalBadge`）、推荐标识文案（`ui.decisionCard.recommended`）与原问题文本（`request.title` / `request.question`）；`decisionOptionBadge(view, option)` 仅 decision 卡且 `recommended === true`（严格布尔）返回「推荐」。非 decision 卡返回冻结空视图——标题/徽标/推荐标识全不出现，`recommended` 字段忽略（与桌面窗口「非 decision 卡忽略 recommended」同口径）。不校验收发卡结构、不做第二份 `cardKind→分组` 映射（校验唯一来源在主进程）。 |
| `app/renderer/src/chat/ChatRow.tsx` | `OperatorRow` 接入上述映射：`op-badges` 行增加 `.op-decision-badge`（仅 decision 卡）；`op-title` decision 卡显示固定标题，其它卡种仍走原 `request.title → 「选择/确认」` 回退；decision 卡新增 `.op-question`（`request.title`）与 `.op-note`（`request.question`）保留材料性选择问题；选项行在 `recommended === true` 时追加 `.op-recommended-badge`。选项 `input` 的 `type/name/value/checked/onChange` 逐字未动；非 decision 卡分支 DOM 不变。 |
| `app/renderer/src/shell/phase4b.css` | 新增 `.op-decision-badge`（中性描边，区别于治理决定琥珀徽标）、`.op-recommended-badge`（琥珀、右对齐）、`.op-question`（原问题行）；只被 decision 卡使用，其它卡种样式零变化。 |
| `test/桌面UI/decision-card-view.test.ts`（新增，9 例） | zh/en 三处文案与共享目录逐字一致；推荐标识严格布尔且不改选项 id/请求对象；原问题不丢、坏类型回退空串；普通 choice/proposal/appointment/appointment-write/schedule-write/acceptance/intent-confirm/write/`"Decision"`/空 `cardKind` 全零回归；decision 卡不套用提案/任命/验收权力徽标（三类治理卡仍保持原分类）；ChatRow 源码接线守卫（标题优先序、两个徽标、问题行条件、选项契约不变、无第二份 `cardKind` 判据、code 面无中文硬编码）；映射模块共享 key/严格布尔/零中文；CSS 钩子存在。 |

## 三、卡面行为（用户可见）

- **decision 卡**：顶部显示「非客户批准」徽标；标题固定「决策卡 · 材料性选择」；下方显示统筹写入的 `request.title`（要决定什么）与可选 `request.question`；选项带 `recommended: true` 的一项右侧显示「推荐」；提交/取消按钮、单选/多选、选中态与返回的选项 id 不变。
- **其它卡种（普通 choice、提案、任命、验收、写盘卡等）**：标题、徽标、选项、交互与改动前逐字一致；即使选项带 `recommended: true` 也不显示推荐标识。
- **语言**：遵循渲染层当前 locale（zh-CN 默认、en-US 同 key），文案只在共享目录维护。

## 四、验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新增测试 | `node --test "test/桌面UI/decision-card-view.test.ts"` | **9/9 pass** |
| 桌面UI 套件 | `node --test "test/桌面UI/**/*.test.ts"` | **296/296 pass / 0 fail**（含既有全部守卫与新增 9 例） |
| 渲染层 typecheck | `npm run typecheck:renderer` | **exit 0**（无输出） |

未执行：真实 Electron e2e / 截图（应用按要求未重启，生产入口仍运行旧构建）；构建产物未重建。未验证真实模型发出 decision 卡的端到端链路（属桌面窗口/测试角色的独立验收范围）。

## 五、残余与风险（如实登记）

1. **客户手选回执文案未接线**：`main.decisionCard.selectedRecommended` / `selectedOther` 仍未被产品代码引用（任务明确可留残余；不为此改主进程）。当前客户手选的可见性依赖 `request_choice` 工具回执与卡面「非客户批准」徽标；判断代选已有 `session:operator-judge` 结果行（渲染侧按既有通用卡片呈现，`cardKind=decision` 属 generic 分类，本批未改 judge 结果行）。
2. **渲染侧不做结构校验**：缺唯一推荐项/多推荐项/非法 flowId 等由主进程发卡前 fail-closed；若未来有旁路把非法 decision 卡推到渲染层，本侧会按卡面呈现（不补校验、不代选）——安全边界仍在主进程。
3. **`recommended` 非布尔**：渲染只认 `=== true`；字符串 `"true"`、数字 `1` 等不显示「推荐」（工具层已保证布尔透传）。
4. **未做真实视觉核验**：新增徽标/问题行的间距、换行与 1360/960/200% 布局未截图；样式沿用既有 token（`--warning-border/bg`、`--border-strong`、`--radius-micro`），无新色值。
5. **未提交**：工作树候选，未 commit/push/暂存。

## 六、候选文件哈希

本文件写盘后可用 `git hash-object` 复核；本批未生成独立证据目录（单测输出见上表）。
