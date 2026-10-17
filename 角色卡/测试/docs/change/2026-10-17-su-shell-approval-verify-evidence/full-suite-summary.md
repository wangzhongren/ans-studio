# su 命令审批策略独立验证——全量与环境摘要（2026-10-17，测试角色）

## 全量

| 时点 | 命令 | 计数 | exit |
| --- | --- | --- | --- |
| 上一轮（渲染轮） | `node --test "test/**/*.test.ts"` | 2153 / 2058 pass / 93 fail / 2 skip | 1 |
| 本轮终态 | 同上 | **2215 / 2120 pass / 93 fail / 2 skip** | 1 |

- 计数守恒：+62 测试（本角色 su-shell 套件 36 ＋ 并发属主新增 26），+62 pass；**红数 93 不变**。
- 93 红组成（与上一轮逐类相同，均非本轮 su-shell 引入）：
  - 依赖缺件 75（zod / claude-agent-sdk / mcp sdk / codex）
  - Windows 符号链接 EPERM 8
  - CRLF 源钉 9（renderer.test 4、markdown 1、g2 ×3、g4v2 ×1）
  - 计时竞态 1（runtime-core/tools.test.ts abort-shell，单跑通过）
- 中途曾出现 2 条新红，均为**并发属主已批准变更**导致的本角色测试值钉滞后，已同步（非产品缺陷）：
  - `test/测试/t29-pi-config-roundtrip.test.ts`：Pi 滑块批次（commit b64d619）把
    `ANS_PI_PROMPT_TIMEOUT_MS` 纳入 `PI_PANEL_KEYS` → 面板键钉 5→6（含注释口径 3 必填+3 可选）。
  - `test/测试/g2-verify/r1-desktop-datasource.test.ts`：桌面角色状态呈现消歧（2026-10-17 实机反馈，
    busy 时写「上一轮终局（不表示当前轮）」）→ 断言接受两种如实措辞并校验消歧句。
  同步后终态红数回到 93，组成不变。

## typecheck

- `npm run typecheck` → **85 错 / exit 1**（与上一轮相同）。
- 本批 `test/测试/su-shell-approval-verify/**`、本角色同步的 2 个测试文件：**0 错**。
- 85 错全部为既有依赖缺件（29 条 TS2307 及其级联），分布不变。
