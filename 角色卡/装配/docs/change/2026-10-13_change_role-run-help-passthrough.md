---
id: role-run-help-passthrough
type: change
title: P1-4 配套：`role run` 位形放行 `-h`/`--help`（裸 --help 的真实入口堵点）
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [cli-positioning]
events:
  - date: "2026-10-13"
    kind: implemented
    summary: parseInvocation 在 role run 位形见 -h/--help（--task 有无均可）时照常返回 role-run、整段 argv 放行给命令层；test/装配/cli-parse.test.ts +2 例（放行矩阵 + 防放宽过度）
  - date: "2026-10-13"
    kind: verified
    summary: test/装配 54/54；typecheck 0 错；全量 950/947/2/1（两红=既有基线红）；真实入口实测四条位形（--help 退 0 含指路句；无 help 缺 --task 仍退 2）
---

# P1-4 配套：`role run` 放行 `-h`/`--help`

> 来源：编排 P1-4（`角色卡/编排/docs/change/2026-10-13_change_cli-positioning.md`）「跨角色登记（归装配——裸 `--help` 的真实入口路由）」一节，**经编排转达**。客户已批准的定位提案（P1-4 CLI 定位指路）的配套改动，本角色独立落地。

## 问题（实测复现）

**改前**（`node bin/ans.js`，本机实测）：

```text
$ ans role run --help        # 无 --task
错误：缺少 --task：用法 ans role run <角色> --task <任务>
（+ 全局 USAGE）
exit=2
```

根因：真实入口 `main` 先过本角色 `src/common/装配/cli-parse.ts::parseInvocation`；`role run` 位形把 `--task` 缺失判为 `unknown` ⇒ stderr + 全局 USAGE、退 2——`-h`/`--help` 到不了 `runRoleCommand`（命令层第 0 步的 help 分支已由编排就位，退 0、含指路句）。

## 改动（一处，只加一个分支）

`src/common/装配/cli-parse.ts::parseInvocation`：`role run` 位形里出现 `-h`/`--help`（`--task` 缺失/存在均可）时**照常返回 `role-run`**，整段 argv（`role run` 之后）**原样透传**给命令层 `runRoleCommand`——帮助文本与退码归命令层（`src/interface/cli/run.ts` 第 0 步）。

- 令牌集与命令层**一致**：仅 `"-h"`/`"--help"`；裸 `"help"` 不放行（命令层不认它）。
- 角色 id 检查**仍在**放行分支之前：`role run`（无角色）仍判「缺少角色 id」。
- 其余解析/退码路径**逐字未动**（diff 只有新增行 + 顶部约定注释加一行）。
- `roleId`/`taskId` 字段为尽力取值（如 `role run --help` 的 `roleId` 是 `"--help"` 字面量、`taskId` 为 `""`）——现有消费方 `src/index.ts` 的 `role-run` 分支只读 `invocation.argv`，help 流程完全由命令层按 argv 决定，这两个字段在该位形下不被消费。

## 测试（`test/装配/cli-parse.test.ts`，52 → 54 例）

1. **放行矩阵**：`--help` / `-h` / `装配 --help` / `编排 --task T-1 --help` 四种位形 → `role-run`；argv `deepEqual` 原样透传；有 `--task` 的位形字段逐字不变。
2. **防放宽过度**：`编排`（无 help、缺 --task）→ 仍 `unknown` 且消息含「缺少 --task」（消息级断言）；`编排 help`（裸 help 令牌）→ 仍 `unknown`。

## 证据（2026-10-13 实测）

- `test/装配/` → **54/54**（改前 52）。
- `npm run typecheck` → **0 错**（exit 0）。
- 全量 `node --test "test/**/*.test.ts"`（**引号带**）→ **950 tests / 947 pass / 2 fail / 1 skipped**——2 红 = **既有基线红**（`test/桌面应用/pi-config.test.ts:43` 仓库目录名断言；`test/项目管理/shared/path-primitives.test.ts:251` macOS `/var` 符号链接）；比编排 P1-4 记录的 948 计恰 +2 = 本次新增例数。
- **真实入口实测**（`node bin/ans.js`，逐条）：
  - `ans role run --help` → **退 0**；stdout 含用法行与指路句「本命令不提供 shell 与会话保持（一次性执行）；需要交互式治理会话请使用桌面应用。」（改前退 2「缺少 --task」）；
  - `ans role run -h` → 同上，退 0；
  - `ans role run`（无参）→ 仍退 2「缺少角色 id：用法 ans role run <角色> --task <任务>」——改前实测即此（任务简报口径写作「缺 --task」，实际消息是「缺少角色 id」，**改前改后一致**，如实记录）；
  - `ans role run 编排`（无 help、缺 --task）→ 仍退 2「缺少 --task」（防放宽过度，真实入口级验证）；
  - `ans role run 编排 --task T-1 --help` → 退 0，与改前**逐字相同**（既有可达位形不变）。
- 环境：Node v24.14.0、Darwin 25.6.0、HEAD 4b69afb（工作区未提交）。未 git 操作、未重启桌面应用（在飞批次未打扰）、未发真实模型请求、未读 `.env`。

## 未决与风险

1. **help 放行以「角色位参数非空」为前提**：`ans role run "" --help`（空角色位）仍判「缺少角色 id」——按任务口径只放宽 `--task`（「`--task` 缺失/存在均可」），未动角色检查、防放宽过度；如将来要让 help 压过一切位形错误，须另行评估（命令层自身的优先级是 help 最前，放宽到解析层是个有理的候选，但超出本次口径）。
2. **可补真实入口断言**：编排 P1-4 文档建议落地后在 `test/测试/real-entry.test.ts` 加一条真实入口断言——归**测试角色**，本角色未动其目录，仅登记。
3. `roleId`/`taskId` 在 help 位形下为尽力取值、当前不被消费（见上）；若未来出现新的 `role-run` 消费者读取这两个字段，须先明确 help 位形的字段语义。
