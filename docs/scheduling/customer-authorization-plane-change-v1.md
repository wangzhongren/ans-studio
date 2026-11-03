# 变更包：客户授权平面——两个标记 `@审批` / `@决策`

- **任务 ID / flowId**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立固定上下文）
- **日期**：2026-11-03
- **风险档位**：**T3**（客户闸门 0 声明；方案 §11.3 与复核一致；共享 Model/公共契约/权限与审计语义）
- **状态**：**E1 变更包已写盘；E2 独立验收未判；未 commit/push/merge/release**。本包是变更事实与证据索引，不是验收结论，不代替 E2，不授权提交/推送/合并/发布。
- **当前候选**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（分支 `feat/customer-authorization-plane`）+ 未提交产品/测试候选（54 文件 = 53 产品/测试源 + 1 test-only D2 探针；详见 §一）。
- **输入基线**：
  - 闸门 0/1/2 + 实施授权记录：`docs/communication/2026-11-03_intent_customer-authorization-plane.md` **199 行 / SHA-256 `31d3064a99739b61e452321d3c73ba43429db419ea490f877cdb48a97cefbd32`**（含闸门 2、实施授权、P1.2 注记、W-1=A、W-5=A、提交/合并预授权；V1 写盘时引用的 120 行 / `e0b89c26…` 为历史快照）。
  - 方案：闸门 1 确认版 **P1.1 1199 行 / `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`**；盘上 **P1.2 1209 行 / `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`**（R1/R2 编辑性收口，V1 §1.2.1 语义等价；冲突以 P1.1 为准）。
  - 复核：`docs/planning/2026-11-03_review_customer-authorization-plane.md` **132 行 / `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`**。
  - P1 审核：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md` **397 行 / `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`**（初版 193/`65f888a6…` + Revision 1 复审 306/`8427ff02…` + Revision 2 复审；结论 `recommend approval`）。
  - 团队计划：v1 **653 行 / `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`** + §十三（W-1 A，C2 写集增补）+ §十四（W-5 A，i18n allowlist）；当前文件 **675 行 / `4545d3a5f3c94cc8476bba1197a17e3d6c3028850acd9dd2ae0ccaea0a75f671`**。
  - V1：`docs/acceptance/customer-authorization-plane-criteria-v1.md` **1171 行 / `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`**。
  - B0：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-B0-baseline.md` **239 行 / `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441`**（rebase 后 HEAD `4c3a6e4`；T3 基线 393 文件 / 3479 / 3452 / 9 / 18）。

---

## 一、当前候选身份（冻结对象）

- **代码基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；分支 `feat/customer-authorization-plane`；工作树未提交产品/测试候选。
- **候选文件**：**54 文件** = **53 产品/测试源文件**（A1 6、A2/A3 5、allowlist 1、B1 20、C1 11、C2 9、D1 集成 1）+ **1 个 test-only D2 探针**（`test/测试/customer-authorization-plane-d2-probe.mjs`）。
- **逐文件清单/哈希（冻结依据）**：
  - `角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt` **134 行 / SHA-256 `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`**（54/54 文件 `git hash-object` + SHA-256，unexpected 0 / missing 0 / mismatch 0）。
  - 运行后同清单：`.../17-post-run-candidate-identity-fix.txt` **134 行 / `71b24533d714c5a26d98213df26a4734ca03221cdb91a75536b73e74ce76fcf1`**（复查仍 0/0/0）。
- **候选树/快照口径**：本 worktree 的 worktree 命令守卫拒绝临时 index/write-tree 形式；E1 以**逐文件清单哈希**（上述 `09-candidate-identity-fix.txt` + 54/54 匹配）作为候选冻结依据；候选文件在 D2-fix 运行前后逐字一致。`app/renderer/dist/`、`node_modules/`、D2 `probe-run-*/userData`、`e2e-*/userData`、`e2e-pi.env` 为忽略/临时产物，**非候选**。
- **D1 后变化的 5 个文件**（C2 修复 + D2 探针）：`app/renderer/src/stores/directive-store.ts`、`chat/directive-panel.tsx`、`shell/Composer.tsx`、`test/桌面UI/directive-panel.test.ts`、`test/测试/customer-authorization-plane-d2-probe.mjs`；其余 49 个 D1 候选逐字未变。

### 1.1 逐角色候选清单与关键哈希

| 角色/节点 | 文件数 | 关键候选哈希（SHA-256；完整表见候选清单） |
| --- | ---: | --- |
| 运行时核心（A1） | 6 | `src/model/directive-marker.ts` 59/`7e522722b93a8815430b9c77e949ca5c1543683ecced8f23b8c29c8b584351c0`；`src/model/directive.ts` 276/`2172bdecd3648da3d1f4bd8c1b177db8b687b1e8ac2b07119c787c44bd652699`；`src/model/runtime.ts` 2769/`911c617920e11bd2b61c851c9f39817fea4a4c59cfeab3366b640082bc4004c5`；`src/model/project-state.ts` 420/`7075d76b266699ae394062720534b277d9873f722ffe8144d86c1a07bafaa430`；`test/runtime-core/directive-marker.test.ts` 132/`d3d28fe9df246d5eb19d096a053ab4707c00c9824b2f00e388b928009af7658e`；`directive-contract.test.ts` 643/`f7f4db3071b11f23f6c1554dad7be73167708127cd120fc94d7f4b5e0c060e2f` |
| 项目管理（A2/A3） | 5 | `src/common/shared/jsonl-ledger.ts` 229/`c9fd3066f1985c1b8ae850ab9b67845dcf320e7f38779de4121687cdcdd62e5f`；`jsonl-ledger.test.ts` 343/`3aa6154db2cd353b4ad924803113d3861cfb01fcba77acbd8050dc02972bbb8e`；`zh-CN.ts` 2188/`6dafeb5983fac78336063e669aaba44434eabeae06c6c6a511f537d7eb3c3b6a`；`en-US.ts` 2456/`8c0d15bd40d5bdbb629a75511dfb1b1fe284b1e7d8d8de86e3cea7e24c876602`；`i18n.test.ts` 618/`62b04e8c42bf1548606e9412c981e42baca073324980e76d23c6eff220e1a80a` |
| 项目管理（allowlist，§十四） | 1 | `test/项目管理/shared/i18n-guard-allowlist.ts` 93/`f31c0b07c639c5bcb83ebe9780e1b6c155eca4eef62b341fc00b4a1a54d2180a` |
| 编排（B1） | 20 | `src/pipeline/orchestration/customer-directive.ts` 705/`601cf960932a841282cc187008fd68b8f8e3e64a336db1d99c5ddd4b7321aeb8`；`src/common/编排/shell-gate.ts` 1478/`f3a6e74b2302d8e67a9031693b869e4b69e90449b26abbd6eab1be18d2c5496f`；`task-state.ts` 790/`39f178d99f341c873dbadbca4eb8ad94a0b557775173405e5921bbb4db85d672`；`version-decision.ts` 512/`21505daab1e97e5687867b140d221fbbaa8aa1c964ca889be7c6323854d3b007`；`run-manifest.ts` 888/`2a397ef4c80c7c9d33054128159f866cfb160e9c72183f7d1cdc1aad5f996f97`；provider/service 6 新文件 + 其余编排/测试文件见清单 |
| 桌面窗口（C1） | 11 | `app/desktop/directive-input.ts` 812/`914868d83015e331b412fda9a6c86040fc20a6f1e5dbc22b75c706728d6f4caa`；`interface.ts` 2719/`6c3108e394acd9802b5445618b798d5865e55a0d5b5c0c07c585765aca547955`；`session.ts` 8827/`7650676a91b426e8312e5bf4f24482f705c627eee7b045d559c58f12edbb0885`；`customer-input.ts` 2271/`7cd7d8f844bab5dbd85ca9e3f79cde561741dfb988a60a0e2ce47c3577936c50`；`requirement-change.ts` 422/`d0bb3ba7f467f89de79a8b492d84e308610392578ef74243ad19ac3fbbcc8787`；`app/main.ts` 1222/`c62da4560690d57ca043f2e75b14a011799ebdb844d762cf42c7dfcbea1c16d8`；`app/preload.cjs` 495/`684c0d96ab2bf870ac980c36147778f28e105d9c4a902738aa8349206cefabb0`；`test/桌面应用/directive-input.test.ts` 720/`ffb3210e9ec575101b7669917cf489940520f7a7776da07cbdba53d83a6bb924`；`directive-decision.test.ts` 351/`1206365325c436a2fb88f27266a6b472543f0d92ac6fa60e2f33a2bdd5174478`；`run-change.test.ts` 224/`3487dd55957b86dc1b47da87d00ebfd026f6de3bdd5f88e525c345086e1a60b9`；`version-decision.test.ts` 796/`52fcd189386ba832807027e7d1c2858f3b9d3622937b5ddc68fd9c88a578fdb2` |
| 桌面UI（C2，含修复） | 9 | `chat/ipc.ts` 613/`5d7ff9e66f7966554d9d23b0674a37d13b7124577ef7a89383f0d8b3cee518af`；`shell/Composer.tsx` 1011/`972b5779685b0943f7391b5aae2b2ca2a199dd7c1671bc06115b8b2fbb2aa1f8`；`shell/ConfirmCard.tsx` 945/`e997aa3c44e2dd1f72a30e9167042682d57d4670be0b37248b4ec2e3d9e21011`；`shell/shell.css` 3883/`a188012d0e0feaedc767de9f348afd03c8f8d26543119750d0236d3c0c3760d8`；`stores/directive-store.ts` 1080/`edb7eefb9c758e1200ab8701a9df9d0cf171c3603b488257a4c0ecdf1f7e29e9`；`chat/directive-dialog.tsx` 262/`897223a08b3e2b1c8f90d5df37289dd9e797c277b593b21b62167a69cb4527d7`；`chat/directive-panel.tsx` 320/`9861abd673aa432ba0595f2b1846ea34f42b91a24fefc36f4c6872d1e2db82ba`；`test/桌面UI/directive-dialog.test.ts` 396/`51547abf05888cd1ee422b732819dc71725aba19cfc9e55109bb775658d62962`；`directive-panel.test.ts` 490/`f51e232144e2dde9707ee1e95cc7d24c61d9dbc80722c3d9464b229a2fb607c0` |
| 测试（D1 集成） | 1 | `test/测试/customer-authorization-plane-integration.test.ts` 726/`57b3b9d94390f218dcb84d50f8b917bc25a55f179f7c967acb48b640f85bc899` |
| 测试（D2 test-only 探针） | 1 | `test/测试/customer-authorization-plane-d2-probe.mjs` 954/`a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427` |

---

## 二、阶段节点与证据索引（G2–E1）

| 节点 | 内容 | 证据 |
| --- | --- | --- |
| G2 / IA | 闸门 2 确认 + 实施授权（客户「确认闸门 2」「同时授权实施」，不含提交/推送/合并/发布） | 沟通记录当前 199/`31d3064a…` |
| H1 | B-1..B-4 共 7 条边界条目落地（运行时核心 +2、编排 +3、桌面窗口 +2）；边界 md/yaml 一致；三份 changelog；边界测试 31/31 + 9/9、resolveWrite 放行/拒绝（统筹核验） | 各角色 boundary.md/yaml/changelog |
| A1 | 运行时核心 Model/解析器/高危谓词/Q9 字段；契约冻结 | 实施记录 `角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-implementation.md` **165 行 / `b659c14f7139ec53d2fdb4a062d3a069ada615fba05bf7f8a0bd0b60d6bf9ebd`**；runtime-core 309/302/3/4（+27/+27；3 既有 EPERM、4 skip）；A1 定向 typecheck 0 |
| A2 | 共享 JSONL 辅助（追加/轮转 `.N` 最旧 `.1` 最新/旧→新/坏行/串行/limits） | `...A2-implementation.md` **88 行 / `c6fa3d2cc6f518d77c995c56fd38d1eb9eb628c428d72de5e71d6b487d186447`**；`jsonl-ledger.test.ts` 16/16；shared-components 登记 |
| A3 | i18n 104 新 key（总计 1746；GLOBAL 98；`ui.directive.cardEntry.*` 14） | `...A3-implementation.md` **135 行 / `51dcf2fdc0ce9a90e9ab59c89e66a8e2223e482d6ae3f4b7babff589ccaa2367`**；i18n 11/11；全组 11 文件/175/170/0/5（+17/+17） |
| allowlist（§十四） | `app/desktop/directive-input.ts` 输入解析关键字「撤销」加入 i18n allowlist（classification §4） | `角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-i18n-allowlist-amendment.md` **91 行 / `a92aa7da7c2ccf95d2f931d8e7172445ca4e943b302f13703c78787dc16c3ca2`**；guard 6/6（scanned=136 allowlisted=21 violations=0） |
| B1 | Provider/Service/Pipeline + task-state 迁移 + Q9 + shell gate/audit + run-role/govern-session/shell-arming 接线；契约冻结 | `...B1-implementation.md` **172 行 / `db0ecf35…`**；typecheck 0（关闭 `version-decision.ts:435`）；编排 737/736/1/0（+43/+43；唯一既有 EPERM）；一次 TS-go checker panic 复跑 0（已披露） |
| C1 | Interface 拦截/指令 IPC/面板/main/preload/decision 消费者/Q9 桌面读者；IPC/preload 冻结 | `...C1-implementation.md` **208 行 / `966cba43dff59d127c86602981da6ee170e6447ab4a4b8df6f0dfbee469fefc6`**；目标 22/22、受影响既有 26/26、桌面全套件 522/522、typecheck 0；recovery-channel 未改 |
| C2 | Composer 回显抑制/确认对话框/指令面板/store/ConfirmCard 卡内入口（W-1 A）/shell.css；冻结 | `...C2-implementation.md` **176 行 / `dc8bcca40631985a32cfe7e7a4b9b50323c4bc4580e18432779e78b8ab1481ba`**；typecheck/typecheck:renderer/build 0；UI 401/401；phase3b 45/45、phase5a 48/48、探针 20/20 |
| C2-fix | 面板撤销回执修复（store 传 roleId/runtime；panel/Composer 透传；测试断言） | `...C2-fix-revoke-receipt.md` **139 行 / `6157181cfe88aa8285081ed95c7496f25e3a6e483d2abeeeed9131127cf11b5b`**；UI 402/402；D2 探针 64/64（S5 receipt 恢复）；typecheck/typecheck:renderer/build 0；C1 未改 |
| D1 | 跨层集成 + 受影响 + T3 全量 + 双端 typecheck + build（修复前历史） | `...D1-regression.md` **231 行 / `c4d6ecfe105a9a218fd720e55b7bcc84761326cbc361148864e96d5160c7a9ad`**（不含末行 `e56bf336…`）；集成 6/6；T3 3623/3596/9/18（修复前，受影响路径已被 D2-fix 取代） |
| D2 | 真实运行：既有 e2e + 指令探针（原始 63/64，S5 false）；修复后 D2-fix 复验 | `...D2-real-run.md` **459 行 / 全文件 `df1bebd883cf42e9d0be9aebd023e6fc3f7673f1810b19a95de571da34c1faf6`**（不含末行 `e7b0488b…`；原 288/`4752abb0…` 保留 63/64 事实 + 追加 D2-fix；当前候选 64/64、E2E_PASS=true、30+16 截图）；证据索引 `18-evidence-hashes-revision1.txt` **159 行 / `998daccd4d0515bf8c430ff2b54ba2ea01b1d0823392c0f47fe886add40df4f5`**（156 文件） |
| E1 | 本变更包 | 本文件 |

---

## 三、当前候选验证摘要（T3）

### 3.1 全量回归与静态门（D2-fix 当前候选）

| 检查 | 结果 |
| --- | --- |
| T3 全量 | **403 文件 / 3624 tests / 3597 pass / 9 fail / 0 cancelled / 18 skipped / 0 todo**，exit 1，约 4 分 21 秒；9 fail 与 18 skip 的 file:line/名称与 B0 逐条相同（全部既有 Windows symlink EPERM/平台 skip）；**新增确定性失败 0、新增 skip 0**；`test/pi-adapter/write-sequencing.test.ts` 排除、未运行、行为未验证 |
| 受影响套件 | 216 文件 / **2151 / 2138 / 4 / 9**；4 失败均既有 EPERM（runtime-core 3 + 编排 1）；桌面UI 402/402、桌面应用 522/522、编排 737/736/1/0、runtime-core 309/302/3/4、项目管理 shared 175/170/0/5、guard 6/6 |
| 跨层集成 | `test/测试/customer-authorization-plane-integration.test.ts` 6/6（当前候选复跑） |
| 静态/构建 | `npm run typecheck` 0；`typecheck:renderer` 0；`build:renderer` 0（2799 modules） |
| 与 B0 对比 | B0 393/3479/3452/9/18 → 当前 403/3624/3597/9/18（+10 文件 / +145 tests / +145 pass；fail/skip 条目相同） |

### 3.2 真实运行证据（D2-fix 当前候选）

- **既有 E2E（当前候选复跑）**：`ANS_E2E_OUTDIR=<…>/e2e-fix-out node_modules/.bin/electron test/桌面应用/e2e/main.mjs`；**E2E_PASS=true**、`E2E_FAILURES=` 空、`E2E_DONE=1`、exit 0、约 86s、30 张 1360×860 截图；report 512 行 / `f0807a8e…`；日志 `12-e2e-fix.log` 199 行 / `d55df407…`。
- **指令平面探针（当前候选）**：**64/64 checks true**、exit 0、16 张 1360×860 截图、0 console error/0 CSP；**`S5_PANEL_REVOKE_RECEIPT=true`**（「已撤销审批指令 #d-1」）；覆盖：`@审批` 面板/回执、forever 高危勾选、`@决策 选推荐项`（Q7 A 高危）代选、冲突/不匹配系统行与客户卡、指令面板两分区/撤销、项目切换取消、AC-22 shell 卡卡内入口共存。report `probe-run-3/report.json` 876 行 / `c1468699…`；账本 `9e582f1f…`；日志 `11-d2-probe-fix.log` 98 行 / `5bb6479c…`；截图清单 `11b-probe-screenshot-hashes-fix.txt` 18 行 / `726f8b82…`。
- **截图规则**：关闭 DEBUG、记录 sha256/候选/窗口尺寸/拍摄命令；**未录屏**。`probe-run-*/userData`、`e2e-*/userData`、`e2e-pi.env`、`dist/` 为临时/构建产物，非候选。

### 3.3 证据复用与失效

- **复用**：B0 对未受影响路径；A1/A2/A3/B1/C1/C2 各层证据（其候选文件在后续阶段逐字未变）；D1 集成测试（当前候选复跑 6/6）。
- **失效并重跑**：C2 修复改动 `directive-store.ts`/`directive-panel.tsx`/`Composer.tsx`/`directive-panel.test.ts` 后，D1 的受影响套件/T3 与 D2 原始探针/E2E 证据不再代表当前候选；D2-fix 已在当前候选上重跑受影响套件、T3 全量、E2E、探针、双端 typecheck/build。D1/D2 修复前数字仅作历史对照，**E2 应以 D2-fix 当前候选证据为准**。
- A1/A2/A3/B1/C1 的 49 个候选文件在 D2-fix 前后逐字一致（`09/17-candidate-identity-fix.txt` 54/54）。

---

## 四、披露项（E2 必读）

1. **W-1 闸门 2 写集增补（C2）**：客户选择 A；C2 写集增补 `app/renderer/src/shell/ConfirmCard.tsx`（按需 `shell.css`），实现 AC-22 shell 卡待答时卡内指令入口；`app/renderer/` 已在 C2 既有目录授权内，无需人事 H1。已记团队计划 §十三。
2. **i18n allowlist 增补（W-5 A）**：客户授权 `test/项目管理/shared/i18n-guard-allowlist.ts` 增加 `app/desktop/directive-input.ts`（输入解析关键字「撤销」，classification §4，非用户可见 UI；展示文案已 key 化）；guard 6/6、violations=0；已记团队计划 §十四。allowlist 为文件级，也覆盖该文件内开发者断言/detail 的中文（不进入客户 UI，已核对 `interface.ts:2416-2422` 丢弃 message）。
3. **PID 35700**：C2 早期探针遗留 Electron 进程；D2 前已 `taskkill /F` 终止；D2/D2-fix 均用全新 userData；当前残留 34404/11492/41000 属 network-monitor worktree，与本任务无关。
4. **A1 `api-spec.md:160` EOF 空行**：`git diff --check` 提示（非产品候选，未修；E2 可忽略或要求后续编辑性修正）。
5. **客户提交/合并预授权**：沟通记录（199/`31d3064a…`）含「修完后自动提交合并」预授权；本上下文**未执行任何 commit/push/merge/release**，由统筹在 E2 通过 + E3 放行后统一执行。
6. **D2 原始 S5 失败与修复**：D2 首跑 63/64（面板撤销无系统行）；C2 窄修后 D2-fix 64/64（S5 receipt 恢复）。D2 原记录保留原始事实，当前候选以 D2-fix 节为准；该修复属本轮返工，不改变契约/写集/闸门。
7. **D2 未覆盖场景**（如实披露，交 E2 判证据是否充分）：重启失效、坏账本、shell 精确命令放行与 shell 审计样例、带图/`@边界`/空正文/近失配、多引擎逐一真实运行、未选角色时的面板撤销回执边界。其中模块级/D1 集成已覆盖的项目见 D1/D2 记录；未真实运行的部分不冒充已覆盖。
8. **不做项**：O1–O11 全部不实施（Q5 A：联网/外部目录仅记录；O9 回滚开关未选；O10 结构化禁止 shell 读 `.ans` 未选；O11 随机后缀 ID 未选）；`@边界` 不解析；无 CLI 入口；指令不进模型上下文；`request.presented.to` 不扩展（W-6）；不授权代码/角色卡/边界。
9. **边界陈旧条目**：`test/桌面应用/session.test.ts` 在桌面窗口 boundary 中列出但磁盘不存在（既有漂移）；本任务不创建、未顺手修；Q9 SessionManager 断言放 B-4 新测试/既有 `run-change.test.ts`/`version-decision.test.ts`。
10. **版本**：P1.1 为闸门 1 确认版；盘上 P1.2 仅 R1/R2 编辑性收口（V1 §1.2.1 语义等价）；团队计划 v1 + §十三/§十四；V1 未改。
11. **A2 共享 JSONL**：采用设计推荐 A（`jsonl-ledger.ts`），未采用退路 B；`task-state.ts` 等价迁移已通过既有/新增测试；`limits()` 读取时机与旧实现差异仅在 env 静态时一致（B1 披露）。
12. **一次 TS-go checker panic**：B1 期间一次 `tsc` 内部 panic（exit 2，无诊断）；原命令复跑 exit 0，未改类型绕过（B1 证据 `07-failure-classification.txt` 披露）。
13. **临时/忽略产物非候选**：`app/renderer/dist/`、`node_modules/`、D2 `probe-run-*/userData`、`e2e-*/userData`、`e2e-pi.env`；D2 探针为 test-only 支持文件。
14. **既有测试排除**：`test/pi-adapter/write-sequencing.test.ts` 按 B0/既有记录排除，未运行、行为未验证；无新增 skip。

---

## 五、E1 结论与下一步

- **E1 交付**：本变更包 + 上述证据索引；候选 54 文件 / 53 产品/测试源 + 1 test-only 探针；当前候选 T3 全量 403/3624/3597/9/18、E2E_PASS=true、D2 探针 64/64、双端 typecheck/build 0；新增确定性失败 0、新增 skip 0。
- **E2**：由统筹启动唯一独立验收主上下文，按 V1（1171/`51ac0f50…`）判定当前候选；本包不判通过/返工/证据不足。
- **提交/推送/合并/发布**：未授权、未执行；客户提交/合并预授权由统筹在 E2 通过 + E3 放行后统一执行。本上下文不 commit、不 push。
- **状态**：E1 已写盘；E2 未判；工作树产品/测试候选保持未提交；未改沟通/方案/复核/验收/角色卡/边界。

**本文件状态：E1 变更包；T3；E2 未判；未 commit/push。**
