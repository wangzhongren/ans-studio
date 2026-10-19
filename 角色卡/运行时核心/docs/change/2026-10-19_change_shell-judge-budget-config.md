---
id: shell-judge-budget-config-runtime-core
type: change
title: shell judge 读取预算 env 可覆盖并放宽默认值 + 会话内读取缓存
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [shell-judge, judge-read-range-runtime-core, governance-judge-p1-runtime-core]
---

# shell judge 读取预算可配置 + 会话内读取缓存

## 背景（真机问题）

Proof 复核时判断 agent 连续执行 shell（curl 等）并读取验证文件，很快报「读取预算已用尽」回落手动，自动代批无法完成判断。

根因：预算原为**编译期常量**——8 次调用 / 单文件 64KiB / 总量 192KiB（PM 评审 §五/§七原定值）。验证场景下读几个文件（如 `package.json`、curl 输出、日志、源文件）即耗尽；且宿主机无法按场景调整，只能改代码。

判断 agent 的读取预算本身是 fail-closed 的安全边界（预算耗尽 ⇒ `manual`），不能简单取消；本次做两件事：
1. 默认值适度放宽到 12 次 / 单文件 128KiB / 总量 512KiB（仍为有限值），并允许部署侧用环境变量在上下限内覆盖；
2. 增加**单次判断会话内**的读取缓存：同一路径＋同一范围重复读取复用首次结果，避免模型反复读同一文件时重复读盘。

## 改动在哪（位置 → 改动）

1. `src/common/runtime-core/shell-judge/policy.ts`
   - `SHELL_JUDGE_DEFAULT_BUDGET`：`maxCalls: 12`、`maxFileBytes: 128 * 1024`、`maxBytes: 512 * 1024`；`maxScanBytes` 仍 8MiB。
     **放宽理由**：一次典型 Proof 复核要读 4–10 个验证文件（锁文件/源文件/命令输出落盘），原 8 次、64KiB 单文件在读到第二个大文件时即截断或耗尽；12 次覆盖「4 个满额文件 + 少量小范围抽查」，512KiB 总量 = 4×128KiB。仍是有限预算，超过即 fail-closed 转手动，不引入无限读取。
   - 新增环境变量（**只在工厂构造判断会话时读取**，不进入工具 schema/模型上下文）：
     - `ANS_SHELL_JUDGE_MAX_CALLS`
     - `ANS_SHELL_JUDGE_MAX_BYTES`
     - `ANS_SHELL_JUDGE_MAX_FILE_BYTES`
   - `SHELL_JUDGE_BUDGET_LIMITS` 钉住上下限：`maxCalls` 1..64、`maxFileBytes` 1024..4MiB、`maxBytes` 1024..16MiB。env 值必须为**纯十进制正整数**；空串/符号/小数/科学计数/越界一律**回落缺省**（不静默夹取），防止误配获得无界读取能力。
   - `resolveShellJudgeBudget(explicit?, env?)`：优先级 **显式 `budget` 字段 > env > 缺省**。显式注入（测试/宿主）不被环境变量意外覆盖；未提供字段才看 env。`maxScanBytes` 无 env 覆盖，保持缺省/显式注入。
   - `resolveBudget` 重构为共享 `positiveFloor`，行为逐字不变（非正/非有限数回落缺省）。
   - **会话内读取缓存**：新增 `JudgeReadCache`/`createJudgeReadCache()`，`JudgeReadInput.cache?` 可选传入；仅 `buildShellJudgeTools` 的每次构造创建一个（随闭包销毁，不跨请求/不跨角色）。
     - 键＝请求路径的项目相对形式＋规范化范围参数（`none`/`bytes:offset:limit`/`lines:startLine:endLine`）；不同范围是不同读取。
     - 只缓存**成功且已完成**原始路径/敏感/realpath/项目根/二进制检查的结果；**拒绝不缓存**（无负缓存，会话中途新建的文件仍可读到）。
     - 命中仍经过 `consumeCall`（调用次数照计），并按首次读取的 `bytes`/`truncated` 补齐 `readBytes`/`truncatedReads`/`budgetExceeded`/`readPaths`——**预算与统计口径不变**，重复读取不会变成免费读取，既有验收断言不被放宽。
     - 剩余总预算小于缓存结果字节数时**不使用缓存**，回落真实读取按 `remaining` 截断，总预算上限不可被缓存绕过。
     - 缓存有界：最多 24 条 / 4MiB，超出按插入顺序淘汰（防止长判断会话内存无界）。
     - 已知取舍：会话内文件被外部改写或符号链接被重定向时，同键重复读取返回首次内容；判断会话通常只持续数秒，且首次内容已通过全部策略检查。敏感/二进制/根外检查在缓存路径上不被放宽（拒绝不缓存，请求路径敏感检查每次仍执行）。
2. `src/common/runtime-core/shell-judge/tools.ts`
   - `buildShellJudgeTools` 构造时调用 `resolveShellJudgeBudget(options.budget)`（env 只读一次）并创建会话缓存；`judge_read_file` 传入 `budget`＋`cache`，`judge_list_dir` 传入已解析 `budget`。
   - **没有**新增工具/参数/能力位；三只只读工具与模型可见 schema 结构不变。
3. `src/provider/runtime/schema.ts`
   - `judge_read_file` 描述里的旧上限数字（64KB 单文件 / 192KB 总量 / 8 次调用）同步为缺省 128KB / 512KB / 12 次；env 机制与具体生效值**不写入**模型可见文案（只标「缺省」）。
4. `src/model/runtime.ts`
   - `ShellJudgeToolOptions.budget` / `GovernanceJudgeToolOptions.budget` 注释更新为新默认值；前者注明三个 env 与「显式优先、只在构造时读取」。
5. 测试（`test/runtime-core/`）
   - 新增 `shell-judge-budget-config.test.ts`（9 例）：默认值放宽且第 13 次仍 fail-closed；三个 env 覆盖生效；env 非法/越界回落缺省（逐变量正反例）；显式预算优先于 env；缓存同路径同范围复用结果且仍计预算；缓存按会话隔离；剩余预算不足时缓存不绕过；拒绝不进负缓存；缓存条目上限淘汰。
   - `shell-judge.test.ts`、`judge-read-range.test.ts` 中硬编码旧默认值（8 次/64KiB/192KiB、70KiB 大文件）的**数值**同步为新默认；语义断言（budget 独立原因码、不计 `deniedReads`、截断计数、敏感/二进制/realpath 不可绕过）逐条保留，未放宽。

## 以前怎样 → 现在怎样（触发场景）

- **以前**：Proof 复核读第 9 个验证文件（或读第 2 个 >64KiB 文件）⇒ `manual/budget`（「读取预算耗尽」）⇒ 自动代批失败。
- **现在**：默认 12 次 / 128KiB 单文件 / 512KiB 总量覆盖典型复核；仍不足时部署侧可设 `ANS_SHELL_JUDGE_MAX_CALLS` 等（受 64 次 / 4MiB / 16MiB 上限），非法值安全回落缺省。
- **仍然不变**：预算耗尽仍是 `manual`（`budgetExceeded` 优先判 `budget`）；单文件/总量/调用计数语义、截断与 `truncatedReads`、敏感路径、二进制、realpath/项目根检查全部照旧；不带范围时的整文件回执逐字不变。

## 验证（真实输出）

- `node --test "test/runtime-core/**/*.test.ts"`：**223 计 / 222 过 / 0 红 / 1 跳过**（跳过＝`boundary-write-guard` 的 Windows 平台条件用例，darwin 按设计 skip）。
- `npm run typecheck`：**exit 0（0 错）**。
- 跨角色只读复跑：`node --test test/编排/shell-judge.test.ts`：**34/34 过**（含「读取损伤：allow 一律降 manual（budget 优先）」）；`node --test test/测试/shell-judge-verify/f-readonly-sandbox.test.ts`：**4/4 过**。
- 未跑真实模型/凭据/网络；未 git 提交。

## 跨角色影响

- 编排 `src/common/编排/shell-judge.ts::createShellJudge` **未改**：其构造的 `ShellJudgeToolOptions` 不含 `budget`，因此 env/新默认在运行时核心工厂 `buildShellJudgeTools` 内生效，无需编排/桌面/适配器改动，也无新增能力位或模型可见面。
- 治理 judge（`governance-judge/tools.ts`）复用同一 `SHELL_JUDGE_DEFAULT_BUDGET`，因此默认值同样放宽为 12/512KiB/128KiB；但三个 `ANS_SHELL_JUDGE_*` env 本次只接入 shell judge 工厂（治理 judge 无对应 env 覆盖，如需另行授权）。治理 judge 无会话缓存（按任务范围只做 shell judge）。
- **边界外测试需其属主同步（本角色未改）**：`test/测试/shell-judge-verify/c-manual-flow.test.ts` 有两例把旧默认写死——
  - 「allow + 读取预算耗尽」循环读 8 次并要求第 9 次被拒（第 145–148 行）：新默认 12 次后第 9 次成功，模拟脚本内的断言抛出 ⇒ 判 `manual/unavailable` 而非 `manual/budget`；
  - 「allow + 读取截断」用 70KiB 文件（第 168 行）：新单文件 128KiB 后不再截断 ⇒ 同样断言抛出。
  这两例是**测试钉点**而非行为回归（预算耗尽→manual、截断→manual 的驱动逻辑未变，`test/编排/shell-judge.test.ts` 34/34 覆盖）；建议其属主把循环改为 12 次/第 13 次拒绝、大文件改为 130KiB（或显式注入小预算）。

## 残余风险

- env 是进程级配置，设置后对所有新构造的 shell judge 会话生效；非法值静默回落缺省（不报错），排障时需查看生效预算来源。
- 缓存是「同一判断会话内」的一致性取舍：外部改写文件后重复读取会得到首次内容；不影响首次读取后的策略检查，也不会把拒绝变成放行。
- 缓存上限 24 条 / 4MiB 是按默认预算估算；env 放宽到上限（4MiB 单文件）时缓存仍受 4MiB 总字节上限约束，命中率可能下降，但不会越界。
- 预算仍可能被极端验证场景耗尽（64 次/16MiB 为 env 上限）；届时仍按既有 fail-closed 转手动，这是有意的安全边界。
