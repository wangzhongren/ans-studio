# convener-code B28 记录：fixed 生产/评审任务禁止 shell（含 mkdir）（T3 两条固定工作流路径）

- 日期：2026-11-11
- 角色：ANS「convener-code」（独立固定上下文；B28 写集）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths` 的 **B28**（RR25 失败修复）
- 基线 HEAD：`59d24c6`（RR25 记录提交）
- 依据：RR25 记录 `6e857f20…`（review 角色 `cmd /c mkdir docs\acceptance` ⇒ shell 审批卡；A12a 未绑定模块）

## 实施

`src/common/roles/convener/index.ts` `convener-fixed-production-line` 段新增一条：

- **所有 fixed 生产/评审任务文本：不得要求或建议 worker 运行任何 shell 命令（含 `mkdir`/`cp`/`mv` 等目录/文件操作）**；`write_file`/`edit_file` 会自动创建目录；`docs/acceptance/` 归档由应用完成；任何 `run_shell` 都会触发 shell 审批卡（RR25 实测：review 角色 `cmd /c mkdir docs\acceptance` ⇒ shell 门早停）。

legacy 三段、fixed 其它段与 card.text 未改。

## 验证

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| `test/roles/convener/convener-fixed.test.ts`（新增 B28 用例：所有生产/评审任务禁 shell、mkdir/cp/mv、write_file 自动建目录、docs/acceptance 应用归档） | 含在受影响集 **117/117 pass** | `角色卡/门禁引擎/docs/change/2026-11-11_B28_two-fixed-workflow-paths_evidence/b28-02-affected.tap` |
| `npm run typecheck` | exit 0 | 同目录 `b28-01-typecheck.txt` |

## 候选

| 文件 | 状态 | 字节/行 | SHA-256（raw） | numstat |
| --- | --- | --- | --- | --- |
| `src/common/roles/convener/index.ts` | M | 48,438 / 826 | `1d7e60eef341df514f9b55cac869a195a91a525287db74cdc5e08a8a96cf64c9` | +1/−0 |
| `test/roles/convener/convener-fixed.test.ts` | M | — | `d2a0681bc0e639dbfd03276e25ca738a9e96993de7c466d3725dac2ef03fa5d4` | +20/−0 |

## 限制

- 只改 fixed 静态文本；未运行真实模型/Electron，不声称 RR/B2 通过；真实效果待 RR26 行使。
