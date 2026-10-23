# 变更包：治理写卡推进的可重入门禁闭环（governance-advance redispatch）

- 任务 ID：`2026-10-23-governance-advance-redispatch`
- flowId：`governance-advance-redispatch`
- 风险档位：**T3（治理行为与 flow 状态变更）**
- 客户确认：闸门 0/1/2 均确认，记录 `docs/communication/2026-10-23_intent_governance-advance-redispatch.md`
- 方案：`docs/planning/2026-10-23_design_governance-advance-redispatch.md`（299 行，SHA-256 `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341`）
- 团队计划：`docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md`（248 行，SHA-256 `fdd9721a0fc29cac36e0103ecb8ac682bec7245bae4809997ee5a5cea576c82d`）
- 实施前验收标准：`docs/acceptance/governance-advance-redispatch-criteria-v1.md`（743 行，SHA-256 `1ce6e7c77a074085b78b75bcda126d725aa71675c5e8a242ab13e60c3c132e3f`）
- 基线：`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch-baseline.md`（178 行，SHA-256 `c5605c034aecdb2b380d48f03484410808a0627750a4f799063d1c8dca221544`；3661/3633/10/18）
- 状态：**实施与测试完成，待独立验收（S6）**；本变更包不是验收报告，不声称 T3 验收通过。
- 日期：2026-10-23

## 一、候选身份

- 当前 HEAD：`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（main）
- 工作树：未提交、未暂存；候选为工作区内容；`git diff --cached --name-only` 为空。
- 基线：本变更实施前工作树（含 i18n B0/B1–B4 key 契约、目录 v3、人事 flow-state 边界补登）。
- 候选范围：S3 编排 `completeRoleCardsStep`、S4 桌面可重入门禁、S5 全链路 e2e/目标只读复算、S5 缺陷修复、人事 `flow-state.ts` 边界对齐；**不含** i18n/目录 v3 既有改动（它们是本变更的既有上下文，不纳入候选，也不以本变更验收结论背书）。

### 1.1 候选文件与哈希（工作区最终内容）

| # | git hash-object | sha256sum | 路径 | 归属 |
| --- | --- | --- | --- | --- |
| 1 | `467d0925d4f5c687fb1f19787ef8d3dcfe9dd3a5` | `82049e2bf9570e23f3af43ee77654c3f5e8b9b23468518f1d0592cfd85ee514b` | `src/common/编排/flow-service.ts` | 编排 |
| 2 | `729597beba576f710a28c819386215145b793f6b` | `78172c7a760fc5f0df8319763032a0a80175daddf7a4102507feb2850ff08a9a` | `src/pipeline/orchestration/flow-state.ts` | 编排 |
| 3 | `0d28dad9cf2e2daebdb8b47fb44b32163a961e57` | `28d1b9b4cbe2899a0e69202983b92532d99d84af3473f72d918e1aa01f9af680` | `test/编排/flow-service.test.ts` | 编排 |
| 4 | `c3a2adcaf8774f01d2f408f820fcd0344be3b926` | `5f9b05dfa79d14961fdf7efcbf15ce3c2b154921b7c77d74699b1840fe125352` | `app/desktop/interface.ts` | 桌面窗口 |
| 5 | `02fe42fd2ea18b0f305450b3027afb93306670f6` | `9e1b4ebf42a3a07005cf3a62583088f40d48c28cf882e41da16b4d5279bc4fe7` | `app/desktop/governance-advance.ts` | 桌面窗口 |
| 6 | `3118a35b9b4f5598f9fa7c78214a44b3bafcb9a8` | `a97734c3efcc9cc4cf190341bf7a50a0304407e4e483cd022e8371d868b4545a` | `test/桌面应用/interface.test.ts` | 桌面窗口 |
| 7 | `d321afd85bbae8a15ed3a9910c7c1183903e91fa` | `2141841bcc14650ba65d9323d16bbc1b54004a478fc80681adfcd8922257c9e9` | `test/桌面应用/acceptance-dispatch.test.ts` | 桌面窗口 |
| 8 | `cb6f483461815570ef0a18b7fbb251f5cdc0aa5d` | `48fb0aa8467479904a9b2a7b4498b5f6a3cf200b2782f1eee52c76813ec85e3e` | `test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts`（新增） | 测试 |
| 9 | `76cf0dae9aea3612c35b4047dc1a848053da4d8b` | `c14bd78bc5fc6500706f43031e2bd1a5d7c0143a0ee0e9608ec49fdb28df995f` | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 测试 |
| 10 | `54ec1704f19abda5bf5cd98a7ada6df14ddafa44` | `4bbf858785b2cc0918fedade0ef9ec654484bd3b4147b947ccd7440d9cc7e551` | `test/测试/redispatch-target-recompute.ts`（一次性只读复算脚本，不是套件用例） | 测试 |
| 11 | `c998301317c6400f8b827d877d3bdb1141c98e53` | `c6c40b14e88e5e62eff55f1c2202302b369d68cf7254b62e46db58fb426a1c8f` | `角色卡/编排/boundary.md` | 人事（授权文档对齐） |
| 12 | `f586b6efdf97e1f3e9bb8417c237cab9868038db` | `8775a3d076788613742802aef21bcf5fe428ef0691672f5db6f8d7f12a030019` | `角色卡/编排/changelog.md` | 人事（授权文档对齐） |

### 1.2 候选隔离声明

- **i18n B0/B1–B4 key 契约**：`src/common/shared/i18n/**`、`app/renderer/**`、`app/main.ts`、`app/preload.cjs`、`test/桌面UI/**`、`test/项目管理/shared/**` 等为既有上下文，不是本候选；本变更不为其背书。
- **目录 v3**：`src/common/编排/team-plan.ts`、`directory-conformance.ts`、`team-plan`/V12 相关桌面/测试改动为既有上下文；本变更只把 `interface.ts`/`governance-advance.ts`/`interface.test.ts` 的当前字节作为候选，其中包含目录 v3 与 i18n B0 的既有 hunk；目录/v3 验收结论不受本变更影响。
- **人事边界对齐**：`角色卡/编排/boundary.md` 仅补 `flow-state.ts` 单文件条目，YAML 未改；changelog 记录授权依据；不新增权限/角色。
- **管理记录/证据**：`docs/communication|planning|scheduling|acceptance`、角色 `docs/change` 不是产品候选。

## 二、节点 S1–S6

| 节点 | 内容 | 状态 | 证据 |
| --- | --- | --- | --- |
| S1 | 闸门 2 + 实施授权 + 人事 `flow-state.ts` 边界对齐 | 已完成 | 沟通闸门 2 记录；`boundary.md`/`changelog.md` |
| S2 | 实施前 T3 标准 + 基线（标准与基线并行） | 已完成 | 标准 `1ce6e7c7…`；基线 `c5605c03…` |
| S3 | 编排 `completeRoleCardsStep` + 公共出口 + 单测 | 已完成 | 编排变更记录；38/38 |
| S4 | 桌面可重入门禁/刷新探针/收口/文案 | 已完成 | 桌面变更记录；interface 117/117 |
| S5 | 全链路 e2e + T3 全量 + 真实 Electron + 目标只读复算 | 已完成（含缺陷修复复跑） | 测试变更记录 `73f380b4…`；3693/3666/9/18 |
| S6 | 变更包 + 独立验收判定 | **待进行** | 本变更包 |

## 三、实施摘要

- **编排**：新增应用专用 `completeRoleCardsStep`（不注册为角色工具，经 `flow-state.ts` 公共出口导出）。重读六文件 sha256（stale 拒绝）、精确 `role-cards` 步骤、已 done 幂等、四终态拒绝、未知 kind 拒绝；artifact kind 写 `.ans/governance/role-cards/<flowId>/<fingerprint>.json` + `artifact.observed(power=app)`；dispatch kind 对账既有 `dispatch.accepted{stepId:"role-cards"}`；原子写/串行队列/候选 YAML 校验；不写 customer.decision。
- **桌面窗口**：内容指纹（六文件 + 团队计划 + schema，无 mtime）；版本化 Convener 派发键 + 账本锚（通过记录/最近 Crew 写卡；早期无 stepId 派发不算）；反馈按指纹去重；`listProject` 廉价探针 + 250ms 合窗；防自激（只在 listing 签名变化或实际动作时 emitProjectChanged）；validation pass 后调 `completeRoleCardsStepFn`，成功再派 readiness；readiness 文案支持 role-cards done / readiness 已 done。
- **S5 缺陷修复**：同指纹 flow 缺 `role-cards` 步骤反复反馈。修复为“只有收口 + 派发/账本成功后才清空反馈去重”；flow 缺陷/收口失败分支保留去重；去重命中不置 `performedAction`、不 emit。新增回归，临时回退旧逻辑可复现失败。
- **测试**：新增 `l-redispatch-reentrant-gate` 6 例（首次通过后重写再进入、两轮错误→反馈→修正、同内容/刷新/mtime-only 不重复、逆序 boundary、缺步骤、手工刷新）；`i-full-chain` 改用 `parseFlowStateYaml` 结构化断言（更强）；目标项目只读复算脚本。

## 四、验证证据

### 4.1 受影响套件

| 命令 | 结果 |
| --- | --- |
| `node --test test/编排/flow-service.test.ts` | 38/38 pass，exit 0 |
| `node --test test/桌面应用/interface.test.ts` | 117/117 pass，exit 0 |
| `node --test test/桌面应用/acceptance-dispatch.test.ts` | 36/36 pass，exit 0 |
| `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` | 129/129 pass，exit 0 |
| `node --test test/测试/governance-e2e-auto/l-redispatch-reentrant-gate.test.ts` | 6/6 pass，exit 0 |
| `npm run typecheck` / `typecheck:renderer` | exit 0 / 0 |

### 4.2 最终 T3 串行全量

- 命令：串行全量，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`（356 文件）。
- 结果：**3693 tests / 3666 pass / 9 fail / 18 skipped / 0 todo / 0 cancelled**，exit 1，约 320s。
- 9 项失败全部为既有 Windows symlink EPERM（与基线清单逐条一致）；**0 项新增确定性失败；本轮 0 项桌面时序偶发**。
- 对照：基线 3661/3633/10/18 → 最终 3693/3666/9/18；tests +32 = S3/S4 +25 + 测试 e2e +6 + 修复轮 interface +1；fail 10→9（基线偶发本轮未出现、缺陷消除）。
- 证据：`角色卡/测试/docs/change/2026-10-23-governance-advance-redispatch-evidence/final/` 与 `sha256.txt`（97 条校验 OK）。

### 4.3 真实 Electron

- `test/桌面应用/e2e/main.mjs`（既有，未修改）：exit 0、`E2E_PASS=true`、`E2E_FAILURES=` 空、`E2E_DONE=1`。
- 证据边界：真实主进程/preload/渲染进程启动与关键检查；无真实模型/在线会话/凭据。

### 4.4 目标项目只读复算

- `ans-gateway` flow/账本复制到临时根：旧无 stepId app→Convener（索引 16）不再挡；role-cards done + `artifact.observed` 恰 1 + readiness 恰 1；二次刷新不重复；目标 flow/账本/计划/project.json **零写入**（`targetUnchanged=true`）。
- 不声称目标项目已被修复；其现场状态仍以客户/桌面操作为准。

### 4.5 角色记录与证据

- 编排：`角色卡/编排/docs/change/2026-10-23_change_governance-advance-redispatch.md` + 证据目录。
- 桌面窗口：`角色卡/桌面窗口/docs/change/2026-10-23_change_governance-advance-redispatch.md`（含 S5 缺陷修复）+ 证据目录。
- 测试：`角色卡/测试/docs/change/2026-10-23_change_governance-advance-redispatch.md`（最终 159 行，SHA-256 `73f380b42721c314682644870fbf446cea8c7934099af9204d68ef28e980b7de`）+ 证据（97 条）+ 缺陷记录 `…finding-convener-feedback-loop.md`（sha256 `9e6fe728…`）。
- 标准/基线/方案/团队计划：见文首。

## 五、残余风险与已知边界

1. **目标项目未修复**：本变更只改 ans-studio 产品；`ans-gateway` 现场未写入、未迁移；其 flow 仍以客户/桌面后续操作为准。
2. **无真实模型会话**：v3/门禁语义由确定性 e2e + 真实 Electron 启动证明；无在线模型全链路。
3. **role-cards done 后内容再变不自动 reopen**：由 readiness/后续验收/flow supersede 处理，本轮不新增 reopen。
4. **probe 不检测 done 后手工内容变化**：done 且 readiness 已派发后探针不再读六文件；后续手工改坏需 readiness/验收发现。
5. **legacy 跨重启同内容可能再派一次**：无通过记录的 legacy 以最近 Crew 写卡为锚；迁移期可接受成本，已在方案 A2 记录。
6. **`acceptance-dispatch.test.ts` 触发面**：S4 将一处 executor settle 改为既有 `listProject` 触发，原因是新增刷新探针的后台反馈会话可能触发 LRU 回收；判定/标准/档位/报告路径断言逐字保留，属测试夹具适配，不是行为弱化。
7. **既有测试夹具**：7 个 v2/v3 用例补 role-cards flow/六文件夹具，原断言逐字保留；S5 回归新增 interface 1 例；无删除/放宽。
8. **write-sequencing 挂起**：`test/pi-adapter/write-sequencing.test.ts` 已知历史挂起，S2/S5 均排除并记录；终验仍按同一处置列明。
9. **既有上下文**：i18n B0/B1–B4、目录 v3 的改动在工作树；本候选只列本变更文件/字节，不为其背书。
10. **不扩权**：无新角色写权/互派/枚举；Crew 仍只经 appointment-write 写卡；应用是唯一中介与 flow 写者。

## 六、候选复算命令

```bash
git rev-parse HEAD
git hash-object -- <path>   # §1.1 的 12 个路径
sha256sum -- <path>
git diff --cached --name-only   # 应为空
```

验收时请对 §1.1 的 12 个路径逐个复算，并核对工作区内容未变；管理记录/角色证据不作为产品候选哈希。
