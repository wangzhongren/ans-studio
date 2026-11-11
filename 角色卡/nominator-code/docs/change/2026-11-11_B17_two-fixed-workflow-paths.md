# nominator-code B17 记录：fixed A8 激活 path-only 提示（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS 固定角色「nominator-code」（独立固定上下文；B17 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 T3 后续批次 **B17**（RR12 失败修复）
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 分支：`feat/two-fixed-workflow-paths`；基线 HEAD：`d35e2de`（RR12 记录提交）

## 一、依据

- RR12：nominator 已写出 6 个角色文件（B16 生效），但无法取得 roster/三文档应用侧 SHA-256；`activate_role_documents` v2 校验不通过/拒绝猜 hash，0/2 `role.activated`。
- 协调方 B17：fixed A8 只传 path；hash 由应用在激活前按实际字节计算并回填；不得猜 hash、不得用 shell。

## 二、实施内容

### 2.1 `nominator-fixed-activation` 段（`src/common/roles/nominator/index.ts`，M）

- 名单处理改为：`docs/proposals/<flowId>-roster-vN.md` **只传 path**；roster hash 由应用在激活时按实际字节计算。
- 激活调用改为：`activate_role_documents` v2（targetRoleId、`roster{path}`、`documents{card,boundaryMd,boundaryYaml}`，**只传 path**）；roster/三文档 hash 由应用在激活前按实际字节计算并回填，模型不猜 hash、不得用 shell 计算；应用复核 roster 与 A6 documentRefs 一致性并记录真实 `role.activated`。
- legacy context 逐字未改；fixedCards/tools/capabilities 未改。

### 2.2 测试（`test/roles/nominator/nominator-fixed.test.ts`，M）

- 更新 fixed context 口径断言：`只传 path`、`hash 由应用在激活前按实际字节计算并回填`、`不猜 hash、不得用 shell 计算`、`A6 documentRefs 一致性`；移除旧 `activation-hash-drift` 文本断言（服务层语义未变，仅提示改为应用回填）。

## 三、验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `test/roles/nominator/nominator-fixed.test.ts` | 含在受影响集 **109/109 pass** | `角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/b17-02-affected.tap`（`be8bbf40…`） |
| `npm run typecheck` | exit 0 | 同目录 `b17-01-typecheck.txt` |

## 四、候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/nominator/index.ts` | M | 41,658 / 910 | `54bcba2f6b92128a1da9fa747010422458d05ef73f587235a201645f8f1314ec` | +2/−2 |
| `test/roles/nominator/nominator-fixed.test.ts` | M | 11,807 / 201 | `4125920112d5f20ddaf87fb6a12b45671e0759c56c3ddd5478607ec183499825` | +5/−1 |

## 五、限制与披露

- 本批只改 fixed context 静态文本与测试；legacy 未改；未运行真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR13。
