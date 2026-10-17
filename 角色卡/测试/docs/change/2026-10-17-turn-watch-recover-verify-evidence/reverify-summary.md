# 复审（reverified）摘要 — 三项偏差修复后（2026-10-17，测试角色）

## 修复内容（属主回交）

1. **运行时核心**：`resolveRuntimeTimeouts` 的 `promptTimeoutMs` 改为**所有运行时**读
   `ANS_PI_PROMPT_TIMEOUT_MS`（`options.promptTimeoutMs ?? readTimeoutMs(env, PROMPT_TIMEOUT_ENV, 300000)`）。
2. **项目管理**：设置 help 补齐「仍在推进则不动作」「留空＝系统默认（5 分钟）」。
3. **桌面窗口**：5 条旧断言用显式注入（`promptTimeoutOverrideMs`/`turnLastResortOverrideMs`）同步；
   `turn-deadline` 解除**不再投「看护恢复」行**（仅诊断 `watchdog.recovery`）。

## 复审结果

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 独立套件 `turn-watch-verify` | **15 / 15 pass** | `reverify-verify-suite-output.txt` |
| 非 Pi runtime 读检查 env | **通过**：env=60000 → pi/claude/codex **均 60000** | `reverify-cross-runtime-env.txt`（pi 60000 / claude 60000 / codex 60000） |
| 设置 help 补齐 | **通过**：含「仍在推进则不动作」「留空＝系统默认（5 分钟）」「1 小时为最后兜底」「不中止本轮」 | C2 用例 |
| `turn-deadline` 解除无恢复行 | **通过**：A1 与 `w1-signals` 身份更替用例均断言零「看护恢复」 | A1 / W1 |
| 本角色同步 `w1-signals` 身份更替用例 | 旧「投恢复行」→「不投恢复行、新一轮独立告警」 | 29/29（w1 14 + turn-watch 15） |

## 全量

| 命令 | 上一轮 | 本轮复审 |
| --- | --- | --- |
| `node --test "test/**/*.test.ts"` | 2245 / 2144 pass / 99 fail / 2 skip | **2246 / 2150 pass / 94 fail / 2 skip** |

- **桌面窗口 5 条红全部消失**（清单见 `full-suite-summary.md` 中的 5 条：session.test 4 + multi-runtime 1）。
- 94 红 = **既有 93**（依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1）
  ＋ **Codex适配器新增用例 1 条**（`inspect timeout never aborts…`，因 `@modelcontextprotocol/sdk`
  未安装——环境缺件）。
- 与既有 93 红集合逐条对比：**无其他新增/消失**；`+1 测试`为并发属主新增用例。
- `npm run typecheck` → **85 错**（与上轮相同，全部既有依赖缺件）；本批/同步文件 0 错。
