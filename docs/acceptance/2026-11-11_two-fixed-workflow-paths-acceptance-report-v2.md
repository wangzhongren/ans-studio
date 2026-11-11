# B2 最终独立验收报告 v2：两条固定工作流路径（T3）——RR-03 由 RR29 补齐后的改判

- 日期：2026-11-11
- 角色：ANS「独立验收」（B2 最终独立验收，独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 候选：分支 `feat/two-fixed-workflow-paths`，本轮补判时 HEAD `7d78f3e9875f4cf69162af2b96c6897633354b0d`（含 RR29 `7d78f3e` 与协调方裁定 `87fff42`；本报告基于的产品代码仍为 RR28 候选 `8adb8fa` 对应的实现，未再改产品代码）；`src app test` 工作树干净；无 tag、无远端分支、未合 main
- **版本关系（必须读）**：本报告为 **v2**，**整体取代 v1**（`docs/acceptance/2026-11-11_two-fixed-workflow-paths-acceptance-report-v1.md`）的最终结论。v1 保留为历史（逐条矩阵、证据指针、限制清单仍有效）；v2 仅依据 **RR29 新证据**与 **协调方 R9 裁定** 做以下三处改判/闭合，其余 v1 判定逐条保留并复核：
  1. **RR-03：未取证 → 通过**（RR29 真实浏览器六项可玩性验证，本角色独立核验）；
  2. **AC-30：未取证 → 通过**（RR-01…RR-06 现全部通过）；
  3. **EV-06：未取证 → 通过**（真机全链证据含 RR29 可玩性证据）。
  另：v1 的 **L-1（R9 versions 账本口径）** 由协调方裁定 `87fff42` 闭合为解释性口径（AC-23 判据不变、不构成违反）。
- 判定依据：**B1 v1**（197 行 / 33,722 B / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`）；v1.1/v1.2 冻结修订按 v1 报告同口径引用（v1.1 `e2ad4701…`、v1.2 `e04dd864…`）
- 新证据：`角色卡/测试/docs/change/2026-11-11_RR29_RR-03-playability-verification.md`（**c27f7672…**，80 行记录；13 证据文件 + 清单，6 截图）、`docs/acceptance/2026-11-11_ruling_app-ledger-R9.md`（**9d43cc39…**）
- 本报告证据目录：`docs/acceptance/_evidence/2026-11-11_two-fixed-workflow-paths-b2/`（v1 证据 + 本报告新增 `v2-rr29/01-rr29-verification.txt`、`v2-rr29/02-ruling-and-l1.txt`）

---

## 0. 最终结论摘要

**整体：通过（附限制与治理观察）**。

- **AC：30 通过 / 0 不通过 / 0 未取证**（v1 的 AC-30 未取证改判通过；AC-23 按裁定维持通过；AC-26/T-19 的边界 Delta 仍为治理观察 G-1）
- **T：20 通过 / 0 不通过 / 0 未取证**
- **RR：6 通过 / 0 不通过 / 0 未取证**（RR-03 改判通过）
- **EV：8 通过 / 0 不通过 / 0 未取证**（EV-06 改判通过）
- 遗留限制/建议（均不触犯 B1 判据，保留为 B33 候选/治理观察）：R-2、L-2…L-6、G-1（详见 §五）。
- 纪律结论：本轮未改产品代码/测试/角色卡/边界；未 push/合 main/打 tag；未触碰 9222/9223/9224；未读/打印 `.env`。

---

## 一、新证据实测（本角色独立核验，不采信转述）

### 1.1 RR29 记录与证据身份

| 项 | 实测 |
| --- | --- |
| RR29 记录 | `角色卡/测试/docs/change/2026-11-11_RR29_RR-03-playability-verification.md`；**sha256 `c27f76727bea36b77f8346c8dfc9f1aec625d1b14d8e2d4f5d43bf9dd4756705`**（与记录声明 c27f7672…、record-file.json 一致） |
| 记录提交 | `7d78f3e`（15 文件：记录 + 6 截图 + 7 证据文件 + sha256sums；`git ls-files` 实测全部跟踪） |
| 证据清单 | `_evidence/sha256sums.txt` 13 条；`sha256sum -c` → **13/13 OK**；清单 sha256 `aeec843bcc5511d0027aa1af763cceaf97aa71cfe7651c548fad200b6fc393de` |
| 记录文件数口径 | RR29 实为 13 证据文件 + 清单（14 项）与 6 截图；协调方「14 证据文件、6 截图」口径一致；RR28 记录「62 文件」vs 实测 63 的问题仍记于 L-3（RR28 包） |

### 1.2 被游玩产物一致性（本角色亲自重算 target 当前字节）

目标工作树：`C:\Users\51054\Desktop\work\ans-two-fixed-paths-rr28-2026-11-11\target`（`main` 头 `152448a` → `5428a28` → `9ecc566` → `2b9ef04`；`git status` 干净）。

| 文件 | 实测 SHA-256（本轮重算） | 与 RR28 交付/证据副本 |
| --- | --- | --- |
| `index.html`（1,026 B） | `c498a5e63ba69ebc578ef61ccd92f58b3545b4e23b682cb3df6a230379a07de9` | **一致** |
| `src/game.js`（7,661 B） | `407e54d508fc532229f16803cacc7b977b4a00b6ef789f632ca405f589a171d6` | **一致** |
| `src/styles.css`（3,143 B） | `aaa23cf3f17cf4c834ab6574d32c6d830c8389e1877eb1214e758238fe0a8805` | **一致** |

### 1.3 六项真实浏览器可玩性验证（逐项核验记录 + 日志 + 截图）

环境：**Microsoft Edge 157.0.4341.46**（CDP `Browser.getVersion`），`file:///.../ans-two-fixed-paths-rr28-2026-11-11/target/index.html`，CDP 调试端口 **9333**；`browser-info.json` 命令行**未含 `--headless`**；未开 Electron；记录声明未占用 9222/9223/9224、未读/打印 `.env`。验证方式为画布像素探针（400×400 canvas、20×20 格；食物 `#f87171`、蛇头 `#4ade80`、蛇身 `#16a34a`）+ CDP `Input.dispatchKeyEvent` 真实方向键/Space + DOM `#score/#status/#overlay/#final-score`。

| # | 项 | 本角色核验结果 | 证据 |
| --- | --- | --- | --- |
| ① | 页面加载渲染 | **pass**：`01-load.png`（186,317 B / `874a9332…`）实测显示「贪吃蛇」页面、canvas 网格、3 节蛇、红色食物、分数 0、状态进行中；`init` 探针 head=(10,10)、body=[(8,10),(9,10)]、food=(13,8)、canvas 400×400 | `01-load.png`、`playability-summary.json` init |
| ② | 方向键改变方向 | **pass**：`02-direction-before.png`（`78ea28e6…`）水平蛇；`02-direction-after.png`（`50b5e8e7…`）垂直蛇；`drive-playability.jsonl` `direction.result.movedUp=true`，heads 由 (11,10)→(11,8)；真实 ArrowUp | 两截图 + drive |
| ③ | 吃食物得分（≥1） | **pass**：`03-score.png`（`87472a22…`）实测分数 **1**、蛇身增至 4 节、食物换位；`score.reached` attempt=1、head=(13,8)=食物格 | `03-score.png`、drive |
| ④ | 撞墙结束覆盖层 | **pass**：`04-game-over.png`（`44e1f3f2…`，202,062 B，play3 终稿）实测「游戏结束」覆盖层、最终分数 1、重开按钮；`play3-summary.gameOverState` score=1/status=游戏结束/overlayHidden=false | `04-game-over.png`、`play3-summary.json` |
| ⑤ | 重开可用 | **pass**：`05-restart.png`（`c44f8edf…`，186,429 B）实测新局分数 0、覆盖层消失；`restartedState` score=0/status=就绪/overlayHidden=true；`postRestartMoves` 8 条（head (12,10)→(12,9)） | `05-restart.png`、`play3-summary.json` |
| ⑥ | 无控制台报错 | **pass**：`console-log.jsonl` **0 error / 0 exception**；3 条 warning 均为验证探针 `getImageData` 的 Canvas2D `willReadFrequently` 提示（v2 阶段 2 条 + play3 阶段 1 条；记录 §三/§五「2 条」为 v2 阶段口径，轻微文字差，不影响 0 error 结论） | `console-log.jsonl` |

**判定**：六项全部满足、产物哈希与 RR28 交付一致、0 控制台错误 ⇒ **RR-03 由「未取证」改判通过**。RR29 的 tester-side v1 时序问题（首次方向采样/结束截图错位）已在记录 §四披露，终稿证据来自 v2/play3；不构成产品问题。证据文件以 `git add -f` 纳入（根 `.gitignore` 含 `角色卡/**/docs/**/*.png`，治理证据截图默认不入库），属证据保全的显式纳入，非产品/测试改动。

---

## 二、协调方 R9 裁定对 L-1/AC-23 的复判

- 裁定文件：`docs/acceptance/2026-11-11_ruling_app-ledger-R9.md`（24 行 / 1,970 B / **`9d43cc392dd0f1701e79e0583cebb03bda8dc1afc23de77e5f7161099c5b8010`**；提交 `87fff42`）。
- 裁定要点：R9（`.ans/state/versions.jsonl`、`versions.initialized`、`doc-freezes.json`）**属设计要求的应用哈希账本**（设计 v2 §核心原则 2/§一.2；v1.3 行 267）；AC-23「旧账本只读忽略、不写」指 **trunk 时代旧治理机制账本**（`.ans/trunk`/`.ans/runs`/VCA/stable 许可/run pin/stable-write）；versions.jsonl 以应用哈希账本复用同一文件形态，不属禁止清单；**AC-23 判据不变**。
- **B2 v2 复判**：AC-23 维持 **通过**；v1 的 L-1 条件性「字面冲突」提示由裁定闭合为解释性口径，不再作为待裁定项。B1 条目未作任何修改。
- 设计 §6.5/§9.4.5 的文本张力按裁定解释处理；若未来要彻底分离文件名，需另立变更（不在本裁定范围）。

---

## 三、更新后的逐条判定（相对 v1 的变化 + 全量状态）

> 逐条证据锚点与代码/测试指针沿用 v1 报告 §五（该节保留有效）；下表给出 v2 的全量状态与变化说明。

### 3.1 AC（30）

| 编号 | v2 判定 | 变化/说明 |
| --- | --- | --- |
| AC-01…AC-22、AC-24、AC-25、AC-27、AC-29 | **通过** | v1 判定保留；本轮复核无新反证 |
| AC-23 | **通过** | L-1 由协调方裁定闭合：R9 属应用哈希账本；AC-23 判据不变、不构成违反（v1 的「附限制」转为裁定解释） |
| AC-26 | **通过（G-1 治理观察）** | v1 判定保留；边界 Delta `cdbdeb9` 仍为治理观察待裁定（不据此推翻判据） |
| AC-28 | **通过（L-3 证据包限制）** | v1 判定保留；RR29 证据身份已核验，RR28 证据包缺口仍列 L-3 |
| **AC-30** | **通过（改判）** | 原「未取证」因 RR-03 缺口；RR29 补齐六项真实 UI 可玩验证 ⇒ RR-01…RR-06 全部通过 |

### 3.2 T（20）

T-01…T-20 **全部通过**（v1 判定保留；T-18 附 L-6，T-19 附 G-1；确定性矩阵、known-red 逐名 diff、typecheck 均与 v1 相同且未受 RR29/裁定影响——RR29/裁定未改产品代码/测试）。

### 3.3 RR（6）

| 编号 | v2 判定 | 说明 |
| --- | --- | --- |
| RR-01 | **通过** | 隔离实例（全新 target、独立 userData、CDP 9333、真实 Edge；未占 9222/9223/9224） |
| RR-02 | **通过（附 R-2 披露）** | A1–A13 全链、3 卡、归档、合并；A13 客户说明接缝仍为限制 R-2（不触犯判据） |
| **RR-03** | **通过（改判）** | 卡记录/合并回执 + **RR29 真实浏览器可玩验证六项全部满足**；产物哈希一致；0 控制台错误 |
| RR-04 | **通过（附 L-1/L-3）** | 账本/审计完整；R9 应用哈希账本按裁定解释；证据包缺口 L-3 |
| RR-05 | **通过** | 全链无失败；成功 finalize；未合 ans-studio main/未打 tag/未发布 |
| RR-06 | **通过（within budget）** | 预算同 RR28（1 消息/4 卡/21 任务/3 提交+1 merge/约 16.5 分钟），RR29 为补充验证不含新客户卡/任务预算（浏览器验证本地运行） |

### 3.4 EV（8）

| 编号 | v2 判定 | 说明 |
| --- | --- | --- |
| EV-01…EV-05、EV-07、EV-08 | **通过** | v1 判定保留（EV-07 附 G-1；EV-08 为本报告） |
| **EV-06** | **通过（改判）** | RR 日志/截图/账本/预算/隔离证明 + RR29 六项可玩性证据齐全 |

---

## 四、v2 独立核验摘要（测试与哈希）

- 本轮补判未改产品代码/测试，v1 的确定性测试结果继续有效：typecheck exit 0；runtime-core 592/555/33/4、gates 570/564/5/1、orchestration 1378/1352/24/2，失败名与冻结 known-red 逐名一致（diff 为空）；定向 mode-switch+full-chain+b-change-scope 8/8、desktop release/pathb 17/17、roles 285/285、fixed-routing 13/13、star 12/3/9（9 名一致）、VCA 12/3/9（9 名一致）。
- 本轮新增核验哈希：RR29 记录 `c27f7672…`；RR29 清单 `aeec843b…`（13/13 OK）；裁定 `9d43cc39…`；target `index.html c498a5e6…`、`src/game.js 407e54d5…`、`src/styles.css aaa23cf3…`（重算一致）；RR28 记录 `dde4ecce…`；B1 v1 `b607f100…`。

---

## 五、遗留限制与治理观察（v2 复判：均不触犯 B1 判据）

| 编号 | 类型 | 内容 | 是否触犯 B1 条目 | 处置 |
| --- | --- | --- | --- | --- |
| **R-2** | 交付披露限制 | RR28 的 A13「运行期未验证」客户说明未作为独立客户消息送达（merge-main 卡为标准文案；驱动成功信号后 4 秒 finalize 打断幕僚说明回合） | **不触犯**：B1 无 AC/T/EV 要求独立的 A13 客户说明；RR-02 以账本/卡交付为据，RR-03 已由 RR29 真实可玩验证满足 | 保留为 B33：merge-main 卡/close 摘要携带 acceptance note；驱动等待 A13 说明或定义完成标记 |
| **L-2** | 证据链接缝 | 验收归档 `reportSha256=6ddf838f…`（归档时 14,610 B）≠ 最终报告 `deb88ab2…`（14,860 B）；A12b 收口后重复投递会话 11:19:59.418 编辑报告，归档未出 v2 | **不触犯**：AC-09/AC-20 的完成条件在收口时满足（归档按当时字节生成、幂等键正确；A13 前报告字节漂移检查已通过）；属收口后可变性接缝 | 保留为 B33：收口后抑制重复投递/编辑；报告变更出 v2 归档；归档前后重算一致性 |
| **L-3** | 证据包缺口 | RR28 `_evidence/` 未含 basis.jsonl、merge-main/appointment 卡截图（target/运行根有）；RR28 记录 §六「62 文件」vs 实测 63；RR29 证据为 13 文件 + 清单（13/13 OK）+ 6 截图，本身无文件数矛盾 | **不触犯**：RR-04 实质由 target 原件核验（basis/workflows/releases 完整）；RR29 证据清单 13/13 OK | 保留为证据包补全建议（RR28 包） |
| **L-4** | 依据漂移 | 启动计划 B1 表哈希 `08450af1…`（原 blob `160ca2a`）≠ 当前 `a66c47d7…`；`ad22192` 仅改 §五 进展一行 | **不触犯**（已解释；B1 标准本体哈希一致） | 无需动作 |
| **L-5** | 判据版本 | 仓库存在 B1 v1.1/v1.2（v1.2 声明最终 B2 按其全量判定），任务书只引 v1；v1.1/v1.2 逐字保留 v1 条目 | **不触犯**（判据条目一致；本报告按 v1 主体 + v1.1 known-red/v1.2 例外口径） | 后续明确 B2 判据版本引用 |
| **L-6** | 测试限制 | optional-acceptance 独立复跑在 1 fail/2 pass 后 3 个 cancelled 基线用例挂起，未形成完整计数；该文件不在三套件要求内，D1 记录与冻结基线一致 | **不触犯**（known-red 基线，无新增失败） | 由测试角色可控超时复跑留完整 TAP |
| **G-1** | 治理观察（待裁定） | `cdbdeb9` 在 `角色卡/桌面窗口`/`角色卡/运行时核心` boundary.md/yaml 补登 5 个逐文件条目（客户端 B29/B30 授权；4 文件同属其他角色目录级授权），字面触及 AC-26/T-19「不改 `角色卡/**`」 | **不按产品/实现变更判触犯**：boundary delta 为 People-Ops 客户授权补登，非实现角色改功能卡/边界模型；产品/架构/`src/common/gates` 未变 | 保留为治理观察，待协调方裁定（若确认，记录 B1 v1.3 例外；否则回退 Delta） |

---

## 六、最终结论

**整体：通过（附限制与治理观察）**。

- 分组计数：**AC 30 通过 / 0 不通过 / 0 未取证；T 20 / 0 / 0；RR 6 / 0 / 0；EV 8 / 0 / 0**。
- RR-03、AC-30、EV-06 由 v1 的「未取证」改判为**通过**，依据 RR29 真实浏览器六项可玩性验证（本角色独立核验记录/截图/日志/产物哈希，13/13 证据清单 OK，0 控制台错误）与 RR28 交付物哈希一致。
- L-1（R9 账本口径）由协调方裁定 `87fff42` 闭合（AC-23 判据不变，不构成违反）；R-2、L-2…L-6、G-1 均不触犯 B1 判据，保留为限制/建议/治理观察（B33 候选）。
- 据此，T3「两条固定工作流路径」满足 B1 v1（含 v1.1/v1.2 同口径修订）全量判据，**B2 最终判定为通过**；后续合并/发布仍按协调方纪律与客户授权执行（本报告不构成合并/发布授权）。

---

## 七、证据与纪律

- 本报告新增证据：`docs/acceptance/_evidence/2026-11-11_two-fixed-workflow-paths-b2/v2-rr29/01-rr29-verification.txt`（RR29 记录/清单/六项核验/target 重算/浏览器信息/.gitignore -f）、`.../v2-rr29/02-ruling-and-l1.txt`（裁定身份与 L-1 复判）。
- v1 证据目录（`.../2026-11-11_two-fixed-workflow-paths-b2/` 下 `01-basis-hashes.txt`、`02-knownred-and-test-runs.txt`、`03-rr28-target-verification.txt`、`test-runs/`、`screenshots/`）继续有效。
- 纪律：本报告与 v2 证据仅写入 `docs/acceptance/`；未改产品代码/测试/角色卡/边界；未 push/合 main/打 tag；未触碰 9222/9223/9224；未读/打印 `.env`；RR29 证据以 `git add -f` 纳入属测试角色证据保全（已核验提交 7d78f3e）。
