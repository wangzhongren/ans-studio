---
id: contract-schema-query-p1-csq-02
type: change
title: contract schema query P1-CSQ-02 补测：contract_check topic 超长截断专用用例
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related: [contract-schema-query]
events:
  - date: "2026-11-03"
    kind: implemented
    summary: 在 rejection-copy.test.ts 追加 topic 超长注入截断用例（+17 行）；17/17 通过；未 commit/push
---

# contract schema query P1-CSQ-02 补测：contract_check topic 超长截断专用用例

- **任务 / flowId**：`2026-11-03-contract-schema-query` / `contract-schema-query`（P1-CSQ-02 / A2-5）
- **角色**：桌面窗口（Desktop Window），独立上下文；只承担本角色
- **日期**：2026-11-03
- **状态**：**implemented-unverified**。测试已落地并本地通过；**未 commit/push**，未做独立验收，未改 src 与既有用例。
- **一句话：** 工具层 topic 分支的超长截断此前只有 E2 探针佐证、无仓库内专用测试（验收报告 §六.8 记为非阻断待补）；本记录补上 `rejection-copy.test.ts` 的 topic 专用截断用例，锁定 `\n…（已截断）` 标记且不落到 legacy `run manifest` 标记。

## 1. 来源依据（只读核对）

- PM P1 审核记录 `角色卡/项目管理/docs/change/2026-11-03_contract-schema-query-P1-review-approved-recovered.md`：§二 A2 行「P1-CSQ-02：`rejection-copy.test.ts` 用超长注入 `fn` 验证 topic 专用截断标记 `\n…（已截断）`（不是 `run manifest` 标记）」；§8.3 A2-5 同口径（建议补防御性测试，非 AC）。
- 验收报告 `docs/acceptance/contract-schema-query-report-v1.md` §六.8 / §七.4：仓库现有 `rejection-copy.test.ts:193-207` 只覆盖 legacy 超长，topic 分支行为已由 E2 独立探针验证；V1 未把该测试列为 AC/K 通过条件，记为非阻断过程提示，建议统筹安排补测。
- 实现位置 `src/provider/runtime/tools.ts:2473-2475`（只读核对，本次未改）：`input.topic !== undefined` 时截断标记为 `\n…（已截断）`，否则为 legacy `\n…（已截断，完整规则见 run manifest）`；`CONTRACT_CHECK_MAX_BYTES = 4096` 不变。

## 2. 改动

- 写前基线（与验收报告附录 A 一致）：`test/桌面应用/rejection-copy.test.ts` **410 行** / sha256 `71388f9f734309074a8e6bd8a3c5a14853def4309a656b2878274e9c65d3cb91` / blob `b372d88b`。
- 写后：**427 行** / sha256 `c272f843f60be3798f3232939c55de3a6d62229d11a328bcdb55406605cc2792` / blob `6b8da27c`。
- `git diff --stat`：`1 file changed, 17 insertions(+)`；`git diff -U0` 仅一个 hunk `@@ -208,0 +209,17 @@`（紧接既有 legacy 截断用例 `:193-207` 之后插入），**无删除行**，既有用例与断言未改。
- 新用例「contract_check topic 输出超长由工具层截断：topic 专用标记、不含 run manifest（P1-CSQ-02）」与既有「contract_check 输出超长由工具层截断到 4KB 内」同构：
  - 注入 `contractCheck: () => "x".repeat(10_000)`，调用 `tool.handler({ args: { topic: "roster" } })`；
  - 断言 `result.ok === true`；
  - 断言 `Buffer.byteLength(result.message, "utf8") <= 4096`；
  - 断言输出包含 topic 专用标记 `\n…（已截断）`（该串不是 legacy 标记的子串：legacy 在「已截断」后是「，完整规则见 run manifest」）；
  - 断言输出不含 `run manifest`（不得落到 legacy 标记）。
- 测试确定性：同步注入、无网络、无临时文件写入、无新增依赖；未改 `src/`、`package.json`、其他文件。

## 3. 测试证据

- 环境：worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\flow-improvements-wave1`；Windows 11 Pro / Git Bash；Node **v24.22.1**；HEAD `55a4916`。
- 命令：`node --test test/桌面应用/rejection-copy.test.ts`
- 结果：**17 tests / 17 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**（改动前该文件 16 tests，本次 +1），退出码 0，`duration_ms 214.5482`。关键输出（节选）：

```text
✔ contract_check 输出超长由工具层截断到 4KB 内 (0.3908ms)
✔ contract_check topic 输出超长由工具层截断：topic 专用标记、不含 run manifest（P1-CSQ-02） (0.2856ms)
...
ℹ tests 17
ℹ pass 17
ℹ fail 0
ℹ skipped 0
ℹ todo 0
```

- 测试只证明它实际跑过的：本记录只覆盖 `rejection-copy.test.ts` 受影响套件；未跑 typecheck、T3 全量或 E2E（V1 未要求，验收报告已按 T3 复用 D1 证据）。

## 4. 边界与声明

- 写集仅 2 个文件：`test/桌面应用/rejection-copy.test.ts`（boundary.md Section 1 已列单文件）与本记录 `角色卡/桌面窗口/docs/change/2026-11-03_contract-schema-query-P1-CSQ-02.md`（已列目录 `角色卡/桌面窗口/docs/change/`）。未写 `src/**`、其他测试、其他角色资料、角色卡/边界。
- 未 commit/push/merge/release；未启动应用；未接触客户。本记录不构成独立验收结论。
- 后续若实施方改动 `tools.ts` 的 topic 截断标记或 `CONTRACT_CHECK_MAX_BYTES`，本用例证据随之失效，需重跑本套件。
