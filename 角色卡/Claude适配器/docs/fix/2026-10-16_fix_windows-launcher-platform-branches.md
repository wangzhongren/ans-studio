---
id: claude-launcher-windows-platform-branches
type: fix
title: v1.3.0 CI Windows 红（Claude launcher 两件）——平台真值分支判别与落地
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: 已实施待 CI 复验（未 git 提交）
related: [claude-mcp-install-implementation, claude-launcher]
---

# v1.3.0 CI Windows 红：G1a（env 收窄洽等）/ G1d（信号与性态）——逐条判别与平台真值分支

依据：CI run `38924209553`（repo `wangzhongren/ans-studio`）Windows job，`test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts` 两条红（G1a 于 `:83`、G1d 于 `:133`）。纪律：平台适配只做**平台真值分支**（沿 v1.1.0 POSIX 信号名先例与 `shell-exec-timeout.test.ts` 的「Windows 只断言 signal 为空」形态），**断言本体零放宽**；只有产品缺口才动 `mcp-launcher.mjs`。

## 一、逐条判别结论

### G1a：子进程 env「恰等」在 Windows 的十键差量 —— **平台注入，测试豁免适配；零产品缺陷**

CI 实得子进程键＝期望 10 键（基线∩在场 7＋声明 3）＋**十键**：`HOMEDRIVE/HOMEPATH/LOGONSERVER/SYSTEMDRIVE/SystemRoot/TEMP/USERDOMAIN/USERNAME/USERPROFILE/WINDIR`。逐键结论：

| 键 | 结论 | 证据 |
| --- | --- | --- |
| `HOMEDRIVE/HOMEPATH/LOGONSERVER/SYSTEMDRIVE/USERDOMAIN/USERNAME/USERPROFILE` | **平台注入**（登录会话/系统目录真值） | launcher 的转发是**名字驱动**：子进程键 ⊆ 13 基线名 ∪ 滑传名单——这 7 键两者皆无 ⇒ **构造上不可能被 launcher 转发**；且同 CI 中三处互异 spawn 实现（Pi 自持 transport／本 launcher／Codex 端）实得**完全相同**十键集（协调方实证转达）⇒ 平台级真值、与 env 参数/transport 无关。机制＝Windows 侧 libuv `uv_spawn` 的 required_vars 缺则强制补齐（winsock/loader 依赖；[libuv 提交](https://github.com/joyent/libuv/commit/2ce14cfab45eb62017e39017fd156e3cf1cd1060)＋[nubjs 佐证](https://github.com/nubjs/nub/commit/5275f93780a23f9f141660dff979e62cce4bcd91)）——与 macOS `__CF_USER_TEXT_ENCODING` 同类（运行时注入、`env -i` 亦见）。 |
| `SystemRoot/TEMP/WINDIR` | **平台注入**（系统/临时目录真值）；同时属 launcher 基线名 ⇒ 被注入进**启动器自身 env 后按契约转发** | 测试以 `env:` 显式替换启动器 env（不含此三键）⇒ 只在启动器 env 被平台补齐后才可能转发；转发本身＝契约行为（基线名在场即传）。 |
| `HOME/LANG/LOGNAME/SHELL/TMPDIR/USER` | **契约合法**（基线名，launcherEnv 显式在场） | 非差异键（在期望集内；CI 消息全量键表中的「嫌疑」系误读） |
| `TOK/SECOND/LIT` | **契约合法**（声明滑传名单内，意图内抵达） | 断言后置值校验（下次 CI 全绿时全量复核） |
| `ANTHROPIC_API_KEY/AWS_SECRET_ACCESS_KEY/ELECTRON_RUN_AS_NODE/ANS_MCP_LAUNCHER_PASSTHROUGH/NOT_DECLARED` | **零泄漏**（名字驱动过滤，平台中立） | 均不在基线名/滑传名单 ⇒ 构造上不可转发；macOS 实跑与协调方转达（Pi 端同证）同结论 |

**产品缺陷判定：无**。十键系 OS/libuv 级注入（`env` 参数无法阻止；macOS 无此现象的红不成立）；launcher 名字过滤平台中立且正确。**修法＝测试豁免适配**：`PLATFORM_INJECTED` 改为平台条件集（macOS＝`__CF_USER_TEXT_ENCODING`；win32＝上述十键，按大写归一比对——Windows env 名大小写不敏感属平台真值），`unexpected` 断言仍为「恰等 − 文档化平台集」，**本体零放宽**。`mcp-launcher.mjs` **未动**。

### G1d：POSIX 信号语义在 Windows 的真值 —— **平台分支钉真值；无可行产品修法**

- **无信号投递面**：Windows 无 POSIX 信号（`child.kill("SIGTERM")`＝`TerminateProcess`，只达目标进程、不运行其处理器）⇒ **launcher 的 SIGTERM→真命令转发在 Windows 不存在**（也不可能有：被硬杀的进程没有代码可执行；Job Object 非 Node 能力面）。
- 真值实测（CI `:133` 实得 `1 !== null`）：真命令自 `SIGTERM`（TerminateProcess）⇒ 启动器读到 `(code=1, signal=null)` 并**以实得退出码原样回传**（`signal===null` 分支即既有实现，行为正确）。
- 清理通道真值：真命令的处置依赖 (i) **stdin EOF 继承**（MCP 惯例；P0 探针实证生产 dispose 先关 stdin）与 (ii) 调用方（CLI）对进程树的清理；测试 stub 不读 stdin，故「无孤儿」断言的场景在 Windows **原理上不可满足**——分支如实钉「stub 存活＋启动器终止退出码 1＋signal null」，并自行清理 stub，**绝不断言转发成功**。
- 残余（如实登记）：Windows 硬杀路径下，「CLI 只杀启动器且不关 stdin」时忽略 stdin 的第三方 server 可存活到管道关闭——包装器引入的间接层窗口；与本测试无关（stub 场景），正式批如有真机复现再议（Job Object/`taskkill /T` 类侧另有 Pi 先例）。

## 二、改动文件（精确路径，发布 overlay-2 白名单用）

1. `test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts` —— 平台真值分支两处：`PLATFORM_INJECTED` 平台条件集（含注释：libuv required_vars 机制＋十键＋大小写归一）与 G1d `win32` 分支（自 SIGTERM 实得退出码、转发场景真值＋stub 自清理）。
2. `角色卡/Claude适配器/docs/fix/2026-10-16_fix_windows-launcher-platform-branches.md`（本记录）、`changelog.md`、`memo.md`、证据目录 `docs/fix/2026-10-16-windows-platform-evidence/`。

**产品文件改动：无**（`src/common/claude-adapter/mcp-launcher.mjs` 与 `src/provider/claude/session.ts` 均未动）。**未 git 提交。**

## 三、验证

- 本地（macOS，POSIX 分支全保留）：`node --test "test/测试/g4v2-mcp-verify/"*.test.ts` **64/64**；`test/claude-adapter/*.test.ts` **44/44**；`npm run typecheck` **0**；全量 **2110 计 / 2109 过 / 0 红 / 1 skip**（证据目录 `full-suite.txt`）；`git diff --check` 对本批文件干净（全仓快照唯一提示＝`角色卡/Pi适配器/memo.md:74` 行尾空行，属 Pi 属主在飞编辑，非本批）。
- Windows 分支本地不可执行（平台条件代码路径）——**由下一次 CI Windows run 复验**（G1a 十键豁免与哨兵值断言、G1d 两处 win32 断言）。
