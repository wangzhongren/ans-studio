# 角色直接能力：桌面UI最小消费提案 U0
- 日期：2026-11-05；固定角色：桌面UI；状态：待P短核，未实施、未测试、非验收。
- 候选：`feat/plan-escalation-card`，基线 HEAD `77945d943ed3c7fdcd9097df2b7bb8d49f8cc5e3`＋既存差异；本轮仅写本文。
- 依据：根P3.1／T1／B1及项目管理C0-P1；已读本人role-card与boundary.md Section 1，当前派单仅授权本人change/memo。
- 用户可见入口：冻结清单原因标签；`src/model/version-change.ts:179` 已新增 `role-direct-applied`。
- 真实缺口：`app/renderer/src/chat/version-change-view.ts:354` 的 `Readonly<Record<DocFreezeReason, MessageKey>>` 穷尽映射缺该项。
- U1拟仅在该映射增加 `"role-direct-applied": "ui.freeze.reason.roleDirectApplied"`；保留旧枚举映射、label函数及未知原因兜底，不加string cast。
- P已提供中英键，实际位于 `src/common/shared/i18n/messages/zh-CN.ts:2320`、`en-US.ts:2588`；本角色不重复维护文案。
- 验证拟复用 `test/桌面UI/version-change-view.test.ts` 与 `npm run typecheck`、`npm run typecheck:renderer`；不新增低影响形式测试。本轮未执行这些检查。
- 后继顶部唯一“替我决策”从Composer移到ChatHeader，消费既有IPC与confirm-store的主进程权威状态及待W冻结的revision；关闭人工、开启真实chief，不在渲染侧代选或增加第二开关。
- U0不实施后继UI；待W冻结状态契约后再提具体消费改动。本提案与C0接口/路径无分歧，无源码、测试、启动应用/模型、commit或push。

## U1实际结果
- 统筹据P2 recommend approval放行本映射；复用同合同，C0 SHA256 `3431B667D46E54D043B3279E7AD8CB292806563D499EDF7B8641C38E4E550519`。下述记录取代U0的“未实施”当前状态，U0保留为提案历史。
- 实际生产改动仅 `app/renderer/src/chat/version-change-view.ts:355` 一行新增映射；保持穷尽Record、全部旧项和label函数，无新增cast。未改测试或其他生产文件。
- 生产源SHA256：`77D46340FB2EE8FE8D2C6958B8F2410DE883C663471A52E84F88DCE61E634D4B`；候选仍为上述HEAD＋既存及并行差异，环境Windows PowerShell／Node `v24.22.1`。
- `node --test test/桌面UI/version-change-view.test.ts`：exit 0，16/16通过；`npm run typecheck:renderer`：exit 0。
- `npm run typecheck`：exit 1；当前诊断为O并行范围 `src/provider/version-change/abstract/freeze-cache.ts(38,12)` 缺 `DocFreezeReason`，`src/provider/version-change/impl/guard-freeze-registry.ts(132,10)`、`(651,10)` 重复函数实现；无本映射诊断，未越权修改O。
- 当前结论：映射已实施且上述定向检查通过；主类型检查尚未通过，非全仓绿、非独立验收。后继顶部UI未实施；未构建、启动应用/模型、commit或push。

## U2 Mutation Contract
- 统筹正式续派：沿P3.1/C0/P2消费W1/W1b既有三IPC方法及真实 `revision`、`chief-delegated` actionSource；不改主进程/Model/共享i18n或决策规则。
- 用户入口：Composer的 `#judge-decision-toggle` 唯一迁至ChatHeader顶部；保持原DOM id与shell审批入口，状态只采主进程响应/push，不乐观开关或代选。
- 最小生产写集：`Composer.tsx`、`ChatHeader.tsx`、`shell.css`、`stores/confirm-store.ts`、`chat/judge.ts`（均在已派U清单）；必要时才使用已授ipc/types/judge-row-view，不扩路径。结果通过既有ChatRow消费view，保留来源与请求证据，历史judge不改标签。
- 实际W暂未发处理中phase给renderer；仅enabled不展示“幕僚处理中”，真实judgeNotice原文可见并给关闭接管入口，不合成busy/source/revision。真正新接口落点先回统筹。
- 验证：现有judge/composer-layout与direct-role-capabilities有效测试、双typecheck、授权build:renderer；输出dist归本owner。无真实模型、发布或commit；实体UI验收交Q。

### U2当前checkpoint（待P文案键后构建）
- 已实施：唯一 `#judge-decision-toggle` 仅chief的ChatHeader显示，Composer保留 `#auto-approve-toggle`；非chief禁用 `#inp-message`、选图及发送handler，保留 `#btn-halt`，不改变内部dispatch/报告/专业能力。新增文案键由P补齐，未越权写共享i18n。
- confirm-store只采主进程真实非负整数revision；缺revision不启用，初始读取/推送/set共享解析，迟到或同revision冲突不得倒退，IPC在途不乐观改enabled。shell状态逻辑保留。
- `governanceJudgeResultView`共享Model校验真实chief来源，保留 `view.actionSource` 与 `view.details.actionSource` 全部字段、原origin/request/base/revision；真实选择用source.selected，reject/revise不套旧“接受提案”标题，退修显示未获批准且不等于任务取消。旧judge无actionSource仍按原标签。
- 定向：`node --test test/桌面UI/judge.test.ts test/桌面UI/composer-layout.test.ts test/桌面UI/direct-role-capabilities.test.ts` exit 0，13/13；覆盖revision乱序/缺失、真实来源三处置及非chief发送guard结构。只是纯逻辑/源码结构证据，不替代真实切角色UI验收。
- `npm run typecheck:renderer` exit 1，仅缺P待补 `ui.composer.customerEntryChiefOnly`（Composer三处）；`npm run typecheck` exit 1，仅Q旧 `test/测试/trunk-stable-write-integration.test.ts:594` 两条workflow可能undefined。未改其源/断言。build:renderer待P键落地后续验。
- 源SHA256：Composer `4EB42609C69EB95F0A33D32584582A0FF4BED4D779394315FE1E356A5810FF50`；ChatHeader `D96FE7DE930E7394495FE53CD40E85381CCC7BF3A6436CF8B8C915F16C6ACE48`；shell.css `443BF57A4ADFE7F7AEE24FB487FF5449AE0FBB62113DD10ACBD6BA4C2E41FC63`；judge.ts `F15306FAC84B4EBEF82F35F30E2848304D9FD15C48AFEFBD4C4B5FC4F77A6AF9`；confirm-store `5CA80F973BAB79E7D30F0F35F7B90F677CAE21B0A52B2AC0536EEEFF002C6C8F`。
- 当前限制：W未push可见处理中phase，未据enabled/activeRoleBusy伪造chiefDeciding；主进程实际judgeNotice原文经卡与顶部status可见。未启动Electron/模型、构建或commit；等待P键后交W/Q构建及DOM锚点，尚未声称UI验收。

### U2b续验（P5键已落）
- U五源hash保持上节不变；本轮未改生产源或测试。三U文件13/13、`npm run typecheck:renderer`、`npm run build:renderer` 均exit 0；构建仅保留既有大chunk/混合静态动态import提示。未启动应用/模型，未claim UI验收。
- dist入口 `index.html` SHA256 `B23980B997FDE1FAD3057B51182A7B066573A2F84E14FF7F0D33546C23E3E0FE`；引用JS `assets/index-PO755GqA.js` hash `01E687CBAB9ADB8F2B83C655E221DEFA3E7B80B84446F36DB8DDC1A6C4E2E36D`，CSS `assets/index-sr7o4Da4.css` hash `CF07A5AB3511B3D7810A593C403F4637A38706FC8E56F9F390499BD4567A234F`。
- Q实际检查锚点：chief `#judge-decision-toggle`／`#judge-decision-label`／`#judge-decision-status` 与父级data-revision；其他角色 `#inp-message:disabled`、`#btn-attach-image:disabled`，真实发送handler拒绝非chief；`#btn-halt`及 `#auto-approve-toggle`保持。真实chief结果既有 `.governance-judge-card` 标题/来源为幕僚，详情source保原request/origin/revision。
- 兼容停点已报统筹：`src/model/role.ts:11–17`规定single旧su默认兼容，`app/desktop/project.ts:116`按权威primaryRoleId；当前chief字面输入guard会锁死single唯一su。最小候选为仅single使用主进程给且确在roles中的primaryRoleId，trio仍chief、其他角色仍禁用，不增加客户多入口；本轮未擅改源，等统筹续派。
