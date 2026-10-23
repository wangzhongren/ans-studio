**风险档位：T3（治理行为与 flow 状态变更；治理/权限变更即使只改文档也不压成 T0/T1/T2）｜判定依据：客户闸门 0/1/2 与实施授权记录 `docs/communication/2026-10-23_intent_governance-advance-redispatch.md`；客户在闸门 1 确认的策划方案 v1 `docs/planning/2026-10-23_design_governance-advance-redispatch.md`（299 行；SHA-256 `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341`）；实施前验收标准 v1 `docs/acceptance/governance-advance-redispatch-criteria-v1.md`（743 行；SHA-256 `1ce6e7c77a074085b78b75bcda126d725aa71675c5e8a242ab13e60c3c132e3f`）；技能 `references/testing.md` 的 T3 定义；变更包标注 T3，档位与改动相符｜选定检查：候选身份复算（12 个候选文件 `git hash-object` + `sha256sum`、HEAD、暂存区、工作区稳定性）、受影响套件（`flow-service` 38、`interface` 117、`acceptance-dispatch` 36）、治理全链路 e2e 129、新增可重入 e2e 6、T3 串行全量（356 文件，排除已知挂起 `write-sequencing`；3693/3666/9/18）、`npm run typecheck` / `typecheck:renderer`、真实 Electron `E2E_PASS`、目标项目 `ans-gateway` 只读复算；验收另独立复跑 `flow-service` 38/38、`interface` 117/117、`acceptance-dispatch` 36/36、`l-redispatch-reentrant-gate` 6/6、目标复算｜复用证据：S5 最终候选原始日志（同候选、同命令；证据目录 `sha256.txt` 97 条校验 OK；最终候选 `worktree-hashes-start/end` 53 个 `src/app/test` 文件一致）；验收独立复跑结果见 §五；未复用任何 i18n/目录 v3 的验收结论｜全量回归：**已执行**（S5 测试角色对当前候选执行；验收核对原始日志、候选哈希与失败分类，未重跑全量；理由：同候选、同命令、同夹具的原始输出完整且 97 条证据哈希校验通过，按 testing.md 证据复用规则复用；9 项失败全部为既有 Windows symlink EPERM，零确定性新增、本轮零桌面时序偶发）**

# 验收报告：治理写卡推进的可重入门禁闭环（governance-advance-redispatch，T3）

- 任务 ID / 产品 flowId：`2026-10-23-governance-advance-redispatch` / `governance-advance-redispatch`
- 风险档位：**T3（治理行为与 flow 状态变更）**；变更包档位与改动相符，验收不降档。
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（299 行；SHA-256 `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341`；blob `9223448f823bd30ef01c9d11d51385c3aeff9fef`）；上位依据为闸门 0 意图记录（SHA-256 `5288ef63e45be1e0ac52b87065377765171a7a6370e8afe8278c508f4c8a0d5c`；blob `4942d84321a5302b87fc52d54580d628f5462d58`）。
- 范围/写集输入：闸门 2 团队计划（248 行；SHA-256 `fdd9721a0fc29cac36e0103ecb8ac682bec7245bae4809997ee5a5cea576c82d`；blob `d4e4f1b97bdc3ab02cf531a6ea2931b1c53fb080`）；只作范围与写集依据，不是标准来源。
- 验收标准：`docs/acceptance/governance-advance-redispatch-criteria-v1.md`（743 行；SHA-256 `1ce6e7c77a074085b78b75bcda126d725aa71675c5e8a242ab13e60c3c132e3f`；blob `7f73aaa38bc51020c98902f4a8f73634af79ce2b`）；本标准 v1 先于实施写盘（mtime 2026-10-23 13:25:27；基线 13:28、编排实现 13:32、桌面修复 14:34 均在其后）。
- 实施前基线：`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md`（178 行；SHA-256 `c5605c034aecdb2b380d48f03484410808a0627750a4f799063d1c8dca221544`；3661/3633/10/18）。
- 变更包：`docs/scheduling/governance-advance-redispatch-change-v1.md`（123 行；SHA-256 `e23c0bf52387158e46ad22f273dd8b4210a66825ea388cf62597160b0d81934d`；blob `f5bb1be38c2fd1efe710f0afa53d40e96f798d4f`）。
- 候选身份：分支 `main`，HEAD `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`；工作区未提交、未暂存；12 个候选文件哈希与变更包 §1.1 逐项一致（§二）。
- 判定日期：2026-10-23。
- **结论：通过（当前候选满足验收标准 v1）。** 无 fail、无 insufficient evidence；证据边界与残余风险见 §六。该结论只对当前候选有效，不授权提交、推送、合并、发布；不声称目标项目已修复；不为 i18n B0/B1–B4 或目录 v3 背书。

---

## 一、结论摘要与判定条件

### 1.1 总体结论

**通过。** P1–P12 全部适用行 pass，G1/G2 流程核对行 pass；候选哈希与证据一致；T3 全量回归对当前候选执行且无本次新增确定性失败；真实 Electron `E2E_PASS=true`；目标项目只读复算通过且零写入。未发现 fail 或 insufficient evidence。

### 1.2 本结论成立的核对要素

| 要素 | 结果 |
| --- | --- |
| 风险档位 | T3，变更包标注与改动相符；未降档 |
| 候选身份 | HEAD `ee59296…`；12/12 候选文件哈希与变更包一致；暂存区为空 |
| 工作区稳定 | S5 最终候选 `worktree-hashes-start/end` 53 个 `src/app/test` 文件 SHA-256 一致；验收复算 12 个候选文件仍一致 |
| 受影响套件 | flow-service 38/38、interface 117/117、acceptance-dispatch 36/36、governance-e2e-auto 129/129（S5 最终日志；验收独立复跑前三者与新增 e2e 6/6 均全绿） |
| T3 全量 | 3693 tests / 3666 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled；9 失败均为既有 Windows symlink EPERM；零确定性新增；本轮零桌面时序偶发；排除 `test/pi-adapter/write-sequencing.test.ts` 并记录 |
| 类型检查 | `npm run typecheck` exit 0；`npm run typecheck:renderer` exit 0 |
| 真实 Electron | 既有 `test/桌面应用/e2e/main.mjs` 未改；exit 0；`E2E_PASS=true`；`E2E_FAILURES=` 空；`E2E_DONE=1` |
| 目标项目只读复算 | 旧无 stepId app→Convener（索引 16/entry 17）不挡；role-cards done、`artifact.observed` 1、readiness 1；二次刷新不重复；`targetUnchanged=true` |
| 结论边界 | 通过只表示当前候选满足标准 v1；不授权提交/推送/合并/发布；目标项目未写入、未修复；i18n/目录 v3 不在本结论内 |

---

## 二、候选身份与哈希复算

### 2.1 候选清单复算（12/12 一致）

验收在只读状态下对变更包 §1.1 的 12 个路径逐个执行 `git hash-object` + `sha256sum`，结果与变更包逐项一致：

| # | 路径 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| 1 | `src/common/编排/flow-service.ts` | `467d0925d4f5c687fb1f19787ef8d3dcfe9dd3a5` | `82049e2bf9570e23f3af43ee77654c3f5e8b9b23468518f1d0592cfd85ee514b` |
| 2 | `src/pipeline/orchestration/flow-state.ts` | `729597beba576f710a28c819386215145b793f6b` | `78172c7a760fc5f0df8319763032a0a80175daddf7a4102507feb2850ff08a9a` |
| 3 | `test/编排/flow-service.test.ts` | `0d28dad9cf2e2daebdb8b47fb44b32163a961e57` | `28d1b9b4cbe2899a0e69202983b92532d99d84af3473f72d918e1aa01f9af680` |
| 4 | `app/desktop/interface.ts` | `c3a2adcaf8774f01d2f408f820fcd0344be3b926` | `5f9b05dfa79d14961fdf7efcbf15ce3c2b154921b7c77d74699b1840fe125352` |
| 5 | `app/desktop/governance-advance.ts` | `02fe42fd2ea18b0f305450b3027afb93306670f6` | `9e1b4ebf42a3a07005cf3a62583088f40d48c28cf882e41da16b4d5279bc4fe7` |
| 6 | `test/桌面应用/interface.test.ts` | `3118a35b9b4f5598f9fa7c78214a44b3bafcb9a8` | `a97734c3efcc9cc4cf190341bf7a50a0304407e4e483cd022e8371d868b4545a` |
| 7 | `test/桌面应用/acceptance-dispatch.test.ts` | `d321afd85bbae8a15ed3a9910c7c1183903e91fa` | `2141841bcc14650ba65d9323d16bbc1b54004a478fc80681adfcd8922257c9e9` |
| 8 | `test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts`（新增） | `cb6f483461815570ef0a18b7fbb251f5cdc0aa5d` | `48fb0aa8467479904a9b2a7b4498b5f6a3cf200b2782f1eee52c76813ec85e3e` |
| 9 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | `76cf0dae9aea3612c35b4047dc1a848053da4d8b` | `c14bd78bc5fc6500706f43031e2bd1a5d7c0143a0ee0e9608ec49fdb28df995f` |
| 10 | `test/测试/redispatch-target-recompute.ts`（一次性只读复算脚本） | `54ec1704f19abda5bf5cd98a7ada6df14ddafa44` | `4bbf858785b2cc0918fedade0ef9ec654484bd3b4147b947ccd7440d9cc7e551` |
| 11 | `角色卡/编排/boundary.md`（人事授权文档对齐） | `c998301317c6400f8b827d877d3bdb1141c98e53` | `c6c40b14e88e5e62eff55f1c2202302b369d68cf7254b62e46db58fb426a1c8f` |
| 12 | `角色卡/编排/changelog.md`（人事授权文档对齐） | `f586b6efdf97e1f3e9bb8417c237cab9868038db` | `8775a3d076788613742802aef21bcf5fe428ef0691672f5db6f8d7f12a030019` |

### 2.2 仓库状态

- `git rev-parse HEAD`：`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（与变更包、S5 最终候选一致）。
- `git diff --cached --name-only`：空（无暂存）。
- 工作区未提交；`git status --short` 含既有 i18n B0/B1–B4、目录 v3 与人事边界补登的上下文，以及本变更候选；变更包 §1.2 已声明隔离。
- S5 最终候选 `worktree-hashes-start.txt` vs `worktree-hashes-end.txt`：53 个 `src/app/test` 改动/新增文件 SHA-256 逐字节一致；验收复算 12 个候选文件仍与变更包一致（无并发改动）。

### 2.3 候选隔离与证据性质

- 12 个候选文件为工作区最终字节；其中 `interface.ts`、`governance-advance.ts`、`interface.test.ts` 等共享文件包含**既有 i18n/目录 v3 上下文**。变更包 §1.2 已明确这些既有 hunk 不纳入本变更、也不为本变更背书；S4 入口基线哈希记录在 `角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md` §二。
- 由于相关文件尚未提交，hunk 级独立分离无法从 git 历史重建；验收以变更包与基线记录的归属声明、候选文件哈希和角色记录交叉核对。此项作为证据边界记录（§六），不影响本轮产品行为判定。
- 管理记录（`docs/communication|planning|scheduling|acceptance`、角色 `docs/change`、证据目录）不作为产品候选哈希。

### 2.4 基线与证据哈希

| 文件 | SHA-256 / 说明 |
| --- | --- |
| 验收标准 | `1ce6e7c77a074085b78b75bcda126d725aa71675c5e8a242ab13e60c3c132e3f`（743 行；blob `7f73aaa3…`） |
| 实施前基线 | `c5605c034aecdb2b380d48f03484410808a0627750a4f799063d1c8dca221544`（178 行） |
| 变更包 | `e23c0bf52387158e46ad22f273dd8b4210a66825ea388cf62597160b0d81934d`（123 行；blob `f5bb1be3…`） |
| 证据总清单 | `角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-evidence/sha256.txt`：97 条；验收执行 `sha256sum -c` **全部 OK** |
| S5 测试记录 | `73f380b42721c314682644870fbf446cea8c7934099af9204d68ef28e980b7de`（159 行） |
| S5 缺陷记录 | `9e6fe728f93874ce54c237ee4b81e3282194637e7be77f400d347f5afa3eb23a` |

---

## 三、验收表（P1–P12 + G1–G2）

> 判定均基于当前候选上的实际执行输出或只读复算；源码阅读只用于定位与解释。证据路径均为仓库相对路径；证据目录缩写 `TESTS-EV = 角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-evidence`，`DESK-EV = 角色卡/桌面窗口/docs/change/2026-10-23_change_governance-advance-redispatch-evidence`，`ORCH-EV = 角色卡/编排/docs/change/2026-10-23_change_governance-advance-redispatch-evidence`。

| ID | 标准（摘要） | 实际证据（路径/哈希） | 结果摘要 | 验收判断 |
| --- | --- | --- | --- | --- |
| P1 | 可重入门禁：appointment-write（含修正重写）、settle、刷新均可进入校验；无永久运行期键挡重写；同内容不重复 | `TESTS-EV/final/new-e2e.log`（6/6，sha `d3dac1c5…`）；`TESTS-EV/final/affected-interface.log`（117/117，sha `4efc1c61…`）；`TESTS-EV/final/governance-e2e-auto.log`（129/129，sha `e501bf5d…`）；验收独立复跑 e2e 6/6、interface 117/117 | e2e 用例 1「首次通过后内容变化重写 ⇒ 第二次 readiness」、用例 2「两轮不同错误 ⇒ 两次反馈；修正后 role-cards 恰一次 done、readiness 恰一次」、用例 5/6（缺步骤/刷新）均 pass；interface「可重入门禁」用例第四轮成功派发后重写仍再次派发；同内容重复 settle/刷新不重复 | **pass** |
| P2 | 内容指纹（六文件+团队计划+schema；无 mtime）变化才重新反馈/派发；同内容不重复；早期无 stepId 派发不挡；跨重启账本锚正确 | `TESTS-EV/final/new-e2e.log` 用例 1/3；`TESTS-EV/final/affected-interface.log` 中「指纹去重：mtime-only…」「跨重启账本锚 A/B/C」；`TESTS-EV/final/target-recompute.log`（sha `e9f1609d…`）；验收独立复跑 e2e/目标复算 | mtime-only 不触发；团队计划内容变化（问题集相同）重新反馈；夹具 A（早期无 stepId 派发）新实例仍派 readiness；夹具 B（通过记录后有 readiness）跳过；夹具 C 放行；目标项目旧索引 16 不挡、二次刷新不重复 | **pass** |
| P3 | blocker ⇒ 按来源反馈、按指纹去重；不写 flow、不派 Convener、不弹客户卡、不写 customer.decision；Crew 重写可再进入 | `TESTS-EV/final/new-e2e.log` 用例 2（两次不同错误 ⇒ 两次反馈）；`TESTS-EV/final/affected-interface.log`「可重入门禁」用例；`TESTS-EV/final/governance-e2e-auto.log` 129/129 | 反馈逐文件列出；不合格期间 Convener 0 派发、readiness 账本 0、role-cards 未 done、`customerCalls=0`、`customer.decision` 数不变且无 app 写入；修正后再次进入并收口 | **pass** |
| P4 | 应用专用 `completeRoleCardsStep`：artifact/dispatch；done/幂等/终态/stale/越界；证据可核对；不写 customer.decision、不伪造批准；非角色工具 | `TESTS-EV/final/affected-flow-service.log`（38/38，sha `8ec5719a…`）；`ORCH-EV/artifact-record-and-ledger-sample.txt`（sha `095ca4e4…`）；`ORCH-EV/directed-flow-service.log`（sha `4d7afe3a…`）；验收独立复跑 38/38 | 14 个新用例覆盖 artifact/dispatch、缺账本证据、缺步骤、幂等、四终态、未知 kind、stale、越界 8 类、输入非法、原子写失败重试、并发一完成一幂等、不注册角色工具；记录 JSON 含 schema/flowId/at/roleIds/appointmentArtifactPath/teamPlan(null)/fingerprint/files/result/semantic/disclaimer；`artifact.observed` power=app；无 customer.decision | **pass** |
| P5 | 合格后 role-cards 恰一次 done、readiness 恰一次派发、账本恰一条；readiness 已 done 文案不重做；旧调用文案逐字不变 | `TESTS-EV/final/affected-interface.log`「可重入门禁」「readiness 文案兼容」；`TESTS-EV/final/new-e2e.log` 用例 1/2；`TESTS-EV/final/target-recompute.log`；验收独立复跑 interface 117/117 | role-cards done 恰一次、`artifact.observed` 1、readiness 派发/账本 1；消息含「应用已在结构校验通过后把 role-cards 标为 done」「只推进 role-readiness」「不要重写角色卡」；`roleReadinessAlreadyDone` 文案含「不要重做角色就绪复核」；未传新选项时旧 v1/v2/v3 文案为扩展前缀（逐字不变）；目标项目 readiness done 形态复算 1 次 | **pass** |
| P6 | listProject 廉价探针 + 250ms 合窗；手工改文件后刷新可重新校验；无自激/循环；仅签名变化或实际动作 emitProjectChanged | `TESTS-EV/final/affected-interface.log`「项目刷新探针」「防自激」「S5 回归」；`TESTS-EV/final/new-e2e.log` 用例 3/6；验收独立复跑 interface 117/117、e2e 6/6 | 无 Crew 事件仅刷新 ⇒ 不合格反馈、修正后收口；10 次稳定刷新不新增派发/反馈/`project:changed`；S5 回归同指纹连续 6 轮 settle/refresh 反馈仍 1 条、`projectChanged` 不再增长；探针诊断 `advance.post-write.probe` 仅诊断 | **pass** |
| P7 | boundary 条目逆序仍通过；新增回归测试锁定；缺条目负例仍报告 | `TESTS-EV/final/affected-interface.log`「顺序无关」；`TESTS-EV/final/new-e2e.log` 用例 4；验收独立复跑 e2e 6/6 / interface 117/117 | 逆序合格通过并收口 role-cards + readiness 1 次；逆序缺 `api-spec` 条目被逐项报告；e2e 逆序用例 0 反馈、readiness 1 次 | **pass** |
| P8 | 不新增 `角色卡/` 写权、不放开互派、不新增 cardKind/FlowStepKind/Power/Decision；应用唯一 flow 写者；人事仅补 flow-state 文档漂移 | 12 个候选哈希（§2.1）；`git diff HEAD -- 角色卡/编排/boundary.md` 仅新增 `flow-state.ts` 一行；`boundary.yaml` diff 为空；`flow-service.test.ts`「不注册为角色工具」用例；`flow-state.ts` 枚举仍为 dispatch/customer-decision/artifact/acceptance | 无新角色写权/互派/枚举；`completeRoleCardsStep` 仅经公共出口由桌面调用，`run-role.ts`/`model/runtime.ts` 无该能力；人事对齐与 YAML 一致、未重复添加；`OBSERVE_SKIP_SEGMENTS` 未变 | **pass** |
| P9 | legacy/v2：旧行为/旧文案/旧最低校验逐字保留；v2/v3 缺步骤反馈 Convener；现有测试零放宽 | `TESTS-EV/final/affected-interface.log` 117/117；`TESTS-EV/final/governance-e2e-auto.log` 129/129；`git diff HEAD -- test/桌面应用/interface.test.ts` 无删除的 `assert.`/`test(` 行；`git diff HEAD -- test/桌面应用/acceptance-dispatch.test.ts` 仅将一处 `executor.settle()` 替换为既有 `listProject` 触发；`git diff HEAD -- test/测试/governance-e2e-auto/i-full-chain.test.ts` 中 5 条文本正则替换为 `parseFlowStateYaml` 结构化断言（更强）；无 `test.skip`/`todo` | legacy e2e「正常写卡」「五种失败修正」「Crew 修正后重新写卡」全 pass；旧 appointment 文案逐字断言保留；7 个 v2/v3 用例补 role-cards/验收标准夹具且无删除断言；`acceptance-dispatch` 判定/标准/档位/报告路径断言保留；`i-full-chain` 结构化断言更强；无放宽 | **pass** |
| P10 | ans-gateway flow/账本复制到临时夹具；旧 entry 17 不挡、当前指纹放行；不写目标项目；不声称已修复 | `TESTS-EV/final/target-recompute.log`（sha `e9f1609d…`）；验收独立复跑 `node test/测试/redispatch-target-recompute.ts C:/Users/51054/Desktop/work/ans-gateway`；目标 flow `70c0e544…`、ledger `af7d7a26…`、project `b8a5ea50…` 前后一致；目标角色目录最新 mtime 为 2026-10-23 12:50（早于 S5 最终轮与验收复跑）；目标 `.ans/governance/role-cards` 不存在 | `firstPass`: roleCardsDone=true（artifact）、recordFiles 1、artifactObserved 1、readinessDispatches 1、corrections 0、oldNoStepIdDispatchIndex 16；`secondRefresh`: readiness 1、artifact 1；`targetUnchanged=true`；目标零写入、未迁移；报告措辞未声称已修复 | **pass** |
| P11 | 候选哈希、原始命令/退出码/计数/失败原文、T3 全量（排除 write-sequencing）、typecheck、Electron E2E_PASS、目标复算、失败分类 | §2.1 候选复算；`TESTS-EV/final/full-regression-serial-excluding-write-sequencing.log`（sha `7de6cc96…`；3693/3666/9/18，exit 1）；`TESTS-EV/final/typecheck.log`（sha `c0849782…`，exit 0）、`typecheck-renderer.log`（sha `21d7d1c5…`，exit 0）；`TESTS-EV/final/e2e-main/report.txt`（sha `87d398c9…`，E2E_PASS=true）；`full-regression-excluded-file-list.txt` 356 文件、0 write-sequencing；基线 3661/3633/10/18 | 9 项失败全部为既有 Windows symlink EPERM，与基线清单逐类一致；零确定性新增、零本轮桌面偶发；18 skip 与基线相同；write-sequencing 挂起排除并记录；Electron exit 0/E2E_PASS=true/E2E_DONE=1；typecheck 双 0；验收独立复跑 38/117/36/6 与目标复算 | **pass** |
| P12 | 标准先于实施；实现完成 `implemented-unverified`；未验收不写 verified；标准/报告分离；不与 i18n/目录 v3 合并 | 标准 mtime 13:25:27、基线 13:28、编排实现 13:32、桌面修复 14:34；编排/桌面角色记录状态 `implemented-unverified`；测试记录 `verified-by-tests-only` 并明确「不是验收通过」；本报告独立于标准；变更包 §1.2 声明 i18n/目录 v3 上下文 | 标准先于实施；实现文档未写 `verified`；测试记录是 S5 测试阶段结论、不是验收结论；报告/标准分离；候选隔离声明完整；未合并 i18n/目录 v3 判定 | **pass** |
| G1 | 变更包完整、候选身份可复算（流程核对行） | 变更包 123 行 / `e23c0bf5…`；§1.1 12 个哈希；HEAD `ee59296…`；`git diff --cached` 空；证据总清单 97 条校验 OK | 任务 ID/flowId/T3/方案/团队计划/标准/基线/候选/节点 S1–S6/证据链接齐全；候选与只读复算一致；管理记录未混入产品候选 | **pass** |
| G2 | 写集与授权（流程核对行） | 12 个候选路径均在团队计划 §4.1–§4.3；`test/桌面应用/` 无新建文件（只改既有 `interface.test.ts`/条件 `acceptance-dispatch.test.ts`）；`test/桌面应用/e2e/main.mjs` 未纳入本候选（工作树改动属既有上下文）；人事对齐仅 `boundary.md` 一行 + `changelog.md`；`git diff --cached` 空；无 commit/push | 无越界；未改 `app/main.ts`/`preload.cjs`/`renderer/**`（工作树改动属既有 i18n 上下文，候选隔离声明已覆盖）；未改 `src/model/**`/`src/common/shared/**`/枚举/构建配置；worker 未写顶层 `docs/scheduling|acceptance` | **pass** |

### 3.1 逐项判定理由（补充）

- **P1/P2/P3**：三组核心行为分别由 e2e 用例 1–3、5–6 与 interface 的「可重入门禁」「指纹去重」「跨重启账本锚」用例覆盖；验收独立复跑 e2e 6/6 与 interface 117/117，结果与 S5 最终日志一致。S5 首轮曾发现「缺 role-cards 步骤时同指纹反复反馈」缺陷（finding `9e6fe728…`）；修复后 e2e 6/6、interface 117/117，且 S5 回归在 interface 中保留。缺陷的旧逻辑失败有 S5 首轮原始日志（`governance-e2e-auto-final.log`：129/128/1，20 条重复反馈）作为复现证据；修复后同指纹反馈恰一次、无重复 `projectChanged`。
- **P4/P5**：编排 14 个新用例逐项覆盖方案 §8.2；真实调用样本（`artifact-record-and-ledger-sample.txt`）可核对记录 JSON、flow YAML 与 `artifact.observed` 条目；桌面用例验证 role-cards 恰一次 done、readiness 恰一次、账本恰一条，且 readiness 已 done 文案不要求重做。旧文案兼容用例验证新选项只追加、旧文案为前缀；`governance-advance.ts` 的差异显示旧文本未被本变更改写（v3 差异属既有目录 v3 上下文）。
- **P6/P7**：刷新探针用例证明无 Crew 事件仅 `listProject` 即可反馈/推进；10 次稳定刷新与 S5 回归证明不循环、不重复 `projectChanged`；逆序 boundary 正/负例均通过。
- **P8/P9**：权限/枚举为结构性核对（diff/grep + 工具面测试）；测试文件 diff 无删除断言、无 skip/todo；7 个 v2/v3 用例只补夹具；`i-full-chain` 的 5 条文本正则被结构化解析断言替代（更强）；`acceptance-dispatch` 仅将触发面由 `executor.settle()` 改为既有 `listProject`，断言未改。legacy e2e 与旧文案断言全部通过。
- **P10/P11**：目标项目只读复算由独立脚本执行并复跑，输出 JSON 与当前目标哈希一致；全量回归、typecheck、Electron 原始日志与证据总清单哈希校验通过；失败分类与基线逐类对照。
- **P12/G1/G2**：标准先于实施（mtime + 变更包/基线记录）；实现文档状态 `implemented-unverified`，测试记录 `verified-by-tests-only` 且明确非验收；报告独立；候选/写集核对完成。

---

## 四、失败分类与全量回归对照

### 4.1 最终 T3 全量（S5 最终候选）

| 项 | 值 |
| --- | --- |
| 命令/方式 | `node --test --test-concurrency=1 <356 个文件>`；`find test -name '*.test.ts'` 排除 `test/pi-adapter/write-sequencing.test.ts`（357 → 356）；清单见 `TESTS-EV/final/full-regression-excluded-file-list.txt`（356 行，`write-sequencing` 0 次） |
| 结果 | **3693 tests / 3666 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled；exit 1；约 320 s** |
| 原始日志 | `TESTS-EV/final/full-regression-serial-excluding-write-sequencing.log`（SHA-256 `7de6cc962dffeb61389aeae3536e21841764f6c0ea015af5ec1acdc65c2dc378`） |

### 4.2 9 项失败分类（全部既有 Windows symlink EPERM）

| # | 失败用例（原文摘要） | 类别 |
| --- | --- | --- |
| 1 | `native symlink and storage runtime mismatch fail before SDK query` | claude-adapter EPERM |
| 2 | `native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary` | codex EPERM |
| 3 | `store validate callback rejects directory symlink before Pi parse or new native write` | pi-adapter injected-runtime EPERM |
| 4 | `Pi storage refuses file symlink and role/runtime mismatch without touching other storage` | pi-adapter injected-runtime EPERM |
| 5 | `D3 linked workspace root remains usable; linked target itself is not replaced` | runtime-core EPERM |
| 6 | `store: traversal, mismatched scope and symlinked runtime directories rejected` | file-write-safety EPERM |
| 7 | `store: native validation stays lazy and native symlink is rejected before effects` | runtime-core EPERM |
| 8 | `读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛` | g4-skill-verify EPERM |
| 9 | `node test外指符号链接路径不获委托；项目内测试路径获委托` | 编排 `shell-authorized-routine` EPERM |

- 基线（`c5605c03…`）：**3661 / 3633 / 10 / 18**；10 项 = 9 项既有 EPERM + 1 次桌面时序偶发（`interface.test.ts` readiness/ledger 兄弟用例，隔离复跑全绿）。
- 最终：**3693 / 3666 / 9 / 18**；tests +32 = S3/S4 新增 25 + 测试新增 e2e 6 + 修复轮 interface +1；fail 10→9 = 基线偶发本轮未出现、S5 缺陷消除；skip 18 不变。
- **零确定性新增失败；本轮零桌面时序偶发；`write-sequencing` 挂起排除并记录。** 不把 EPERM 或挂起写成通过。

### 4.3 真实 Electron

- 命令：`ANS_E2E_OUTDIR=<TESTS-EV>/final/e2e-main ./node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（既有脚本未修改）。
- 结果：exit 0；`E2E_PASS=true`；`E2E_FAILURES=`（空）；`E2E_DONE=1`；报告 `TESTS-EV/final/e2e-main/report.txt`（SHA-256 `87d398c96da95bb580e67f2ca4e187b6112225a2531cf627f1a052828a2ba468`）与截图清单存在；时间 14:48:33，属最终候选窗口。
- 证据边界：真实主进程/preload/渲染进程启动与既有检查通过；无真实模型/在线凭据（脚本桩）。该 Electron 自检不直接复演本变更新治理链路；新链路由 e2e/桌面测试与目标复算覆盖。

### 4.4 类型检查

- `npm run typecheck`：exit 0，0 错误（`TESTS-EV/final/typecheck.log`，SHA-256 `c08497827403fc979bc87f35710644044167d6e4d93511f69d7d6d0d47a7371e`）。
- `npm run typecheck:renderer`：exit 0，0 错误（`TESTS-EV/final/typecheck-renderer.log`，SHA-256 `21d7d1c5d9837ab795ba83f795a6390a10d260df19cb39fb9a7f07948f961b09`）。

---

## 五、验收独立复跑记录

为核对最终日志与当前候选一致，验收在只读产品代码、不改测试的前提下独立复跑了受影响检查（Node v24.22.1；Git Bash；Windows 11 Pro 10.0.26300；HEAD `ee59296…`；`export PATH="/c/Users/51054/AppData/Local/Programs/nodejs:$PATH"`）：

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `node --test test/编排/flow-service.test.ts` | **38 / 38 pass**，exit 0，约 0.7 s |
| 2 | `node --test test/桌面应用/interface.test.ts` | **117 / 117 pass**，exit 0，约 32.9 s |
| 3 | `node --test test/桌面应用/acceptance-dispatch.test.ts` | **36 / 36 pass**，exit 0，约 19.2 s |
| 4 | `node --test test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` | **6 / 6 pass**，exit 0，约 4.9 s；6 条用例全绿 |
| 5 | `node test/测试/redispatch-target-recompute.ts "C:/Users/51054/Desktop/work/ans-gateway"` | 通过；`firstPass` roleCardsDone=true、artifactObserved=1、readinessDispatches=1、corrections=0、oldNoStepIdDispatchIndex=16；`secondRefresh` 1/1；`targetUnchanged=true` |

- 复跑未修改任何产品/测试/方案/计划/沟通记录/角色卡/边界；测试只写系统临时目录。
- 复跑结果与 S5 最终日志的计数一致；未重跑 T3 全量（理由见首行与 §4.1；原始日志 97 条哈希校验通过）。
- 复跑后再次复算 12 个候选文件哈希：与 §2.1 一致；`git diff --cached` 仍为空；目标项目 flow/ledger 哈希仍为 `70c0e544…` / `af7d7a26…`，未被写入。

---

## 六、证据边界与残余风险

1. **目标项目在 S5 首轮与最终轮之间发生变化。** S5 记录 §三列出的目标 flow/ledger 哈希（`81526ed6…` / `f8f5e1aa…`）与最终 `target-recompute.log`（`70c0e544…` / `af7d7a26…`）不同；最终日志与**验收复跑时**的目标哈希一致，且脚本内 `targetUnchanged=true`。推断为客户/桌面在两次 S5 之间操作了目标项目；最终 P10 结论只基于最终复制内容，不依赖 §三旧哈希。此为记录不一致，不是产品行为失败。
2. **目标项目未修复。** 本变更只改 ans-studio 产品；`ans-gateway` 现场 flow 仍为 `role-cards: dispatched`（最终复算复制时），未被写入、未迁移。复算证明「该账本形态可被新逻辑放行」，不等于目标已恢复。
3. **候选 hunk 级隔离依赖声明与基线哈希。** `interface.ts`、`governance-advance.ts`、`interface.test.ts` 等共享文件含既有 i18n/目录 v3 改动；因工作区未提交，无法从 git 历史独立重建 hunk 级 diff。变更包 §1.2、基线 §二与角色记录已声明归属；候选文件哈希与 S5 工作区哈希一致。本报告不将这些既有改动纳入本变更，也不为其背书；若后续要求逐 hunk 审计，需先提交/冻结基线。
4. **S5 缺陷的「临时回退旧逻辑」复现步骤没有单独的日志文件。** 原始复现证据是 S5 首轮 e2e 失败日志（`TESTS-EV/governance-e2e-auto-final.log`：129/128/1，同指纹 20 条重复反馈）与缺陷记录 `9e6fe728…`；修复后 e2e 6/6、interface 117/117。该边界不影响 P1/P3/P6 的最终行为判定。
5. **测试记录状态字符串。** 测试角色记录使用 `verified-by-tests-only`（测试阶段结论，明确「不是验收通过」），编排/桌面记录为 `implemented-unverified`；没有产品文档写 `verified`。该字符串不是验收结论；本报告是唯一验收结论。
6. **无真实模型会话。** S5 e2e/桌面验证使用脚本桩；真实 Electron 只验证既有启动/交互检查，不覆盖在线模型全链路。
7. **role-cards done 后内容再变不自动 reopen。** 终态不可回退；后续由 readiness/验收/flow supersede 处理（方案 §10.6，本轮不新增 reopen）。
8. **探针不检测 done 后手工内容变化。** role-cards done 且 readiness 已派发后探针不再读六文件（方案 §10.2）；后续手工改坏由 readiness/验收发现。
9. **legacy 跨重启同内容可能再派一次。** 无通过记录的 legacy 以最近 Crew 写卡为锚；方案 A2 已接受为迁移期成本。
10. **记录 `teamPlan: null`。** `completeRoleCardsStep` 的记录 schema 允许 `teamPlan: {path,version,sha256} | null`；当前输入契约不携带团队计划（桌面指纹已把团队计划内容计入 `fingerprint`），`null` 表示「未单独提供」，不是「无团队计划」。
11. **环境差异。** 测试文档记录 Node v24.22.1；Electron 报告内 `NODE=24.21.0`（Electron 自带/内置版本显示），两者不构成候选差异；验收复跑使用 v24.22.1。
12. **工作区未提交。** 候选是工作区内容，未 commit/push/merge；本结论不改变此状态，也不授权这些操作。
13. **P3「不写 flow」的证据形式。** 现有行为用例断言不合格期间 role-cards 未 done、Convener 0 派发、readiness 账本 0、无客户卡/客户决定，且随后成功收口必须经过真实 `completeRoleCardsStep`；未单独记录 blocker 前后 flow YAML 的字节哈希。按可观察状态与收口路径判定为未写；若后续要求字节级直接证据，可补一条 blocker 前后 flow 哈希断言（不影响本轮 P3 的行为判定）。

---

## 七、判定结论与效力

- **结论：通过（当前候选满足 `governance-advance-redispatch-criteria-v1`）。** P1–P12 全部适用行 pass，G1/G2 pass；无 fail、无 insufficient evidence。
- 通过依据：候选哈希与证据一致；T3 全量对当前候选执行且无确定性新增失败；真实 Electron `E2E_PASS=true`；目标只读复算零写入；P1–P12 的正/负例、文案、权限、legacy、目标复算均有原始证据。
- 通过只表示**当前候选**满足标准 v1；**不授权提交、推送、合并、发布或任何对外操作**。候选、夹具、依赖、方案或共享文件变化时，受影响证据失效，需按标准 §2.3 重取并重新判定。
- 本报告不与 i18n B0/B1–B4 或目录 v3 合并；不引用其结论替代本变更证据，也不为其背书。
- 目标项目 `ans-gateway` 现场仍未修复/未写入；本变更只证明产品候选满足标准，不声称目标项目已恢复。
- 本报告是独立验收结论，不是客户确认记录；客户确认仍以 `docs/communication/` 为准。
