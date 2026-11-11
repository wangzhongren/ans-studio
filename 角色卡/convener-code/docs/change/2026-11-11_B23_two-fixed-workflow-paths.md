# convener-code B23 记录：fixed 权威哈希来源与自身 shell 禁令（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「convener-code」（独立固定上下文；B23 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B23**（RR19 失败修复）
- 基线 HEAD：`e45c706`（RR19 记录提交）
- 依据：RR19 记录 `ec4da98d…`（A9 convener `certutil -hashfile docs/proposals/snake-game-roster-v1.md SHA256` 触发 shell 审批卡，deny/未执行，驱动失败即停）

## 实施

`src/common/roles/convener/index.ts`（仅 fixed 段；legacy 三段与 card.text 逐字不变）：

- `FIXED_EVIDENCE_SECTION` 新增一条：需要文档/名单/模块权威哈希（如团队计划 `modules`/`roster` 字段）时，**只取应用机器记录**——`project_state` 的 `[versions]` 行（`sha256=`，应用按真实字节计算）或 `.ans/state/versions.jsonl`；**convener 自身同样禁止**用 `run_shell`、`certutil`、`Get-FileHash`、PowerShell 等计算/核验 hash（会触发 shell 审批卡，属 fixed 卡预算之外的额外门，RR19 实测）。
- `FIXED_BASELINE_SECTION` 新增一条：团队计划中的 `modules`/`roster` 哈希取应用记录（`project_state` `[versions]` 的 `sha256=` 或 `.ans/state/versions.jsonl`）；不得用 `run_shell`/`certutil`/`Get-FileHash` 等 shell 计算或核验。

## 验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `test/roles/convener/convener-fixed.test.ts`（含新增 B23 用例：evidence/baseline 段应用来源与自身 shell 禁令；B9.1/B13.2/legacy 断言保持） | 含在受影响集 **166/167**（唯一失败为冻结 known-red TM-5） | `角色卡/编排/docs/change/2026-11-11_B23_two-fixed-workflow-paths_evidence/b23-02-affected.tap` |
| `npm run typecheck` | exit 0 | 同目录 `b23-01-typecheck.txt` |

## 候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | 47,519 / 824 | `465ec788bf6329bfb247a1321df17e902627ef6512dccb7f20bae333e9be6d68` | +2/−0 |
| `test/roles/convener/convener-fixed.test.ts` | M | — | `c6556ebcc865ad58b20ff8f3479c5e22021fe69a5d4c5ff701236f5b6362eeea` | +20/−0 |

- 编排侧候选（project-state/doc-format-specs）与共同 D1 证据见 `角色卡/编排/docs/change/2026-11-11_B23_two-fixed-workflow-paths.md` 及其 `_evidence/`。

## 限制

- 只改 fixed 静态文本；未运行真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR20 行使。
