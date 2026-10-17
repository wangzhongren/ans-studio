# 到点检查 + 1 小时兜底独立验证——全量与环境摘要（2026-10-17，测试角色）

## 全量

| 时点 | 命令 | 计数 | exit |
| --- | --- | --- | --- |
| 上一轮（su 审批轮） | `node --test "test/**/*.test.ts"` | 2215 / 2120 pass / 93 fail / 2 skip | 1 |
| 本轮终态 | 同上 | **2245 / 2144 pass / 99 fail / 2 skip** | 1 |

- +30 测试（本角色 turn-watch 套件 15 ＋ 并发属主 15），+24 pass，+6 fail。
- 99 红组成：
  - 依赖缺件 **76**（+1：Codex适配器新增 `inspect timeout never aborts…` 用例，因
    `@modelcontextprotocol/sdk` 未安装而在 bind 前红——环境缺件，非产品缺陷）
  - Windows 符号链接 EPERM **8**（既有）
  - CRLF 源钉 **9**（既有）
  - 计时竞态 **1**（既有，单跑通过）
  - **桌面窗口属主测试 5 条未同步新默认**（属主 `test/桌面应用/`，本角色不可改）：
    - `session.test.ts` 4 条 G-2/W1：仍按 demo 检查时限 **120s** 断言（新默认按评审 §3.1/§5.7
      为 **300000ms**，实现正确；测试标题/边界需属主同步）。
    - `multi-runtime.test.ts` 1 条「档位字段（choices＋choiceLabels）…」：并发 Pi 滑块批次
      （choiceLabels/500k）后旧断言未同步（非本项）。
- 本角色边界内旧断言已同步并全绿：`t1-pipeline-integration.test.ts`（4 条旧红→8/8）、
  `g2-verify/w1-signals.test.ts`（14/14）、`g2-verify/scope-audit.test.ts`（ratio 1.0）。

## typecheck

- `npm run typecheck` → **85 错 / exit 1**（与上一轮相同，全部既有依赖缺件）。
- 本批 `test/测试/turn-watch-verify/**` 与同步的 3 个测试文件：**0 错**。

## 真实偏差（已报属主，不修）

1. **功能性**：`resolveRuntimeTimeouts` 对非 Pi runtime **不读** `ANS_PI_PROMPT_TIMEOUT_MS`
   （评审 §3.1/§3.3/§5.9 要求所有运行时读取）。
   实测：`env={ANS_PI_PROMPT_TIMEOUT_MS:"60000"}` → pi **60000**、claude **300000**、codex **300000**
   （证据 `cross-runtime-env-deviation.txt`）。属主：运行时核心（或 PM 收窄评审口径）。
2. **文案**：设置 `ANS_PI_PROMPT_TIMEOUT_MS` 的 help 实际为
   「到点只通知治理角色检查是否卡死，不中止本轮；1 小时为最后兜底；单位 ms；下一次开启会话时应用。」，
   与评审 §3.3 逐字文本不一致（缺「若仍在推进则不动作」「留空＝系统默认（5 分钟）」）。
   属主：项目管理（或更新评审）。核心语义（不中止/1 小时兜底）在位。
3. **建议未采纳**：`turn-deadline` 解除时仍投「看护恢复」行（评审 §3.2 建议不投；若保留须写明
   「到点检查已解除（本轮已结束）」）。实际为通用「看护恢复：轮次到点检查…已解除」——未声称故障，
   但非建议文案。属主：桌面窗口。不阻塞验收。
