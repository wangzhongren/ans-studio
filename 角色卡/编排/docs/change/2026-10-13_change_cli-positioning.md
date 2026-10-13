---
id: cli-positioning
type: change
title: CLI 产品定位（P1-4）：`ans role run` 帮助与启动提示如实指路（只做定位，不做能力补齐）
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [desktop-ux-improvement-proposal]
events:
  - date: "2026-10-13"
    kind: designed
    summary: 产品提案 desktop-ux-improvement-proposal P1-4 客户批准；裁定本轮只做定位 + 指路；终端 y/n 确认通道 / CLI 会话持久化 / CLI 投递机——明示不做
  - date: "2026-10-13"
    kind: implemented
    summary: 指路句单一来源（common/编排/cli-positioning.ts）；run.ts 增 -h/--help 帮助（含指路句，退 0、不开会话）；run-role.ts 一次性启动行同句；新增 6 例测试
  - date: "2026-10-13"
    kind: verified
    summary: test/编排 188/188（182+6）；typecheck 全仓零错；全量 945 计/941 过，3 红 = 2 既有基线红 + 1 桌面在飞快照红（P1-1/P1-2，非本角色）
---

# P1-4 CLI 产品定位：定位 + 指路

> 依据：产品提案 `角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md` §P1-4，客户 2026-10-13 批准。**本轮只做定位 + 指路，不做任何能力补齐**。

## 问题与立场

`ans role run` 走一次性路径（`runRole`）：不接 shell 闸（CLI 无确认框 ⇒ `run_shell` 不注册，`run-role.ts:157` 调 `deps.createAdapter(gate)` **不传任何 capabilities**；fail-closed 方向正确）、不传会话目录（一局即止）。CLI 用户跑项目角色时凡需执行命令的任务直接缺能力——但此前**没有任何一处告诉用户「这事该去桌面做」**。

本改动的产品立场：**桌面是主工作台（交互式治理会话），CLI 是一次性执行器**——如实指路，不承诺本命令没有的能力。

## 改在哪里（位置 → 改动）

1. **`src/common/编排/cli-positioning.ts`（新增）**——指路句**单一来源**常量 `CLI_POSITIONING`：
   `本命令不提供 shell 与会话保持（一次性执行）；需要交互式治理会话请使用桌面应用。`
   帮助输出与启动提示**共用同一句**，防止两处漂移；两点必须写实（① 不提供 shell 与会话保持；② 桌面应用）。
2. **`src/interface/cli/run.ts`**——新增 `-h` / `--help` 帮助：任一出现即打印用法 + 指路句、**退 0**（`EXIT_OK`）——不触配置、不开会话（测试钉「适配器工厂零调用」、缺 project/scope 注入也可用）。用法行：`ans role run <角色> --task <任务> [--runtime demo|pi]`。既有解析/退出码路径**逐字未动**（帮助检查在最前，`parseRoleRunArgs` 与错误路径不变）。
3. **`src/pipeline/orchestration/run-role.ts`**——一次性会话启动提示处（既有「受治理工具集已建立」行之后）加**轻量一行**：`record({ kind: "message", summary: CLI_POSITIONING })`。每次会话至多一次（测试钉「恰出现一次」）；不改变任何能力与判定（shell 本就不 arm、会话本就不持久）。**用法错误路径不打印指路**（只在真正开跑时出现——「常规提示不打扰」，测试钉住）。
4. **不做（提案明示，登记备查）**：终端 y/n 确认通道、CLI 会话持久化、CLI 投递机——**均不做**，等定位被确认、且有真实 CLI 用户诉求再立项。

## 报错路径结论（P1-4「能力缺席报错」——结构上不可改，如实登记）

- **现状核实**：一次性路径 `runRole` 调 `deps.createAdapter(gate)` **不传 capabilities** ⇒ `shellGate` 缺席 ⇒ Pi 适配器据「注入才注册」**根本不注册 `run_shell`**（`src/provider/pi/tools.ts::buildGovernedTools` 的结构性保证）。模型侧**没有该工具**，也就不存在「调用 run_shell 失败」这一事件可由编排/Interface 层改写；用户侧观感 = 模型以自然语言说明没有执行命令的能力。
- **能否改**：硬要「报错指路」只有三条路——① 注册恒败桩 `run_shell`（伪造能力面，破坏「能力缺席 = 最强 fail-closed」的结构性保证）；② 会话提示词注入硬编码提示（造机制）；③ 改 Pi适配器扩展层文案（跨角色、且其 `shellKillSwitch` 的「run_shell 未 arm…」面向的是另一场景）。① ② 即任务书明示的「不要为此硬造机制」；③ 不在本角色边界且未被要求。
- **结论**：**编排/Interface 层结构上不可改，不做**；「定位 + 指路」由帮助输出与启动提示承担，缺口如实登记于此。

## 跨角色登记（归装配——裸 `--help` 的真实入口路由）

`ans role run --help`（**无 `--task`**）经真实入口 `node bin/ans.js` 实测**到不了本命令**：装配 `src/common/装配/cli-parse.ts::parseInvocation` 把 `role run --help` 位形判为「缺少 --task」的 `unknown` ⇒ stderr 报错 + 全局 USAGE、退 2（help 令牌未放行）。**装配侧最小改动**：`role run` 位形见到 `-h`/`--help` 时照常返回 `role-run`（放行整段 argv 给 `runRoleCommand`）——本命令层已就位，放行后即端到端生效。

**已可达位形（无需装配改动，实测）**：`ans role run <角色> --task T-1 --help` → 经既有路由到 `runRoleCommand` → 帮助 + 退 0。

## 测试（`test/编排/cli-positioning.test.ts`，6 例）

① 文案两点写实（不提供 shell/会话保持；桌面应用；一次性执行）；② `--help` 与 `-h` 各一例：退 0、stdout 含用法行与指路句、**适配器工厂零调用**（不开会话）；③ `--help` 不依赖注入（缺 project/scope 也可用）；④ 一次性会话启动打印 `[message]` 指路行（与既有「受治理工具集已建立」行同在）且**每场恰一次**；⑤ 用法错误路径**不**打印指路（stdout 无该句）。

**测试手法登记（给后续维护者）**：`captureStdout` 补丁**必须转发 + 记录、绝不吞掉写入**——`node --test` 的子进程结果上报协议帧同样经 `process.stdout.write` 走（V8 序列化帧与文本交错），吞掉写入会让测试计数被吞（实测：6 例只被计入 2 例；本文件已按「转发 + 记录」实现并有注释说明）。

## 如何确认（实际结果）

- `test/编排/` **188/188**（基线 182 + 6）；连跑 3 次稳定。
- `npm run typecheck` **全仓零错**。
- 全量 `node --test "test/**/*.test.ts"`（**引号带**）**948 计 / 945 过 / 2 红 / 1 skipped**——2 红均为**既有基线红**（① `test/桌面应用/pi-config.test.ts` 面板键目录名；② `test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接）。**本角色零红。**（首次全量运行曾另见 1 条 `test/桌面应用/queue-withdraw-lru.test.ts`（P1-2）红——桌面 P1-1/P1-2 在飞批次所致〔该文件与 `app/desktop/session.ts` 当日 13:30/13:32 在改〕，复跑已自愈，与本改动零交集。）
- 真实入口实测：`ans role run 编排 --task T-1 --help` → 退 0、含指路句；`ans role run 编排 --task T-1`（演示）→ 启动第 4 行为指路行、其余输出逐字不变、退 0；裸 `ans role run --help` → 仍被装配拦（见上节跨角色登记）。
- 环境：Node v24.14.0、Darwin 25.6.0。未 git 操作、未重启桌面应用、未发真实模型请求、未真跑命令。

## 未决与风险

1. 裸 `--help` 的装配路由未放行前，`ans role run --help` 的**产品验收口径**（「帮助输出含该句」）只在命令层与带 `--task` 的入口位形成立——请 pm 转达装配（最小改动见上节），落地后 `test/测试/real-entry.test.ts` 可加一条真实入口断言（归测试角色）。
2. 「任务涉及执行命令而能力缺席」的**模型侧回执文案**不可从本层改写（结论见上）——用户看模型自己怎么说；若将来要产品级收口，须新裁定（本改动不做）。
3. 启动行是每次 `ans role run` 一行的固定提示；若客户实际使用后认为多余，撤掉是一行删除（帮助输出不受影响）。
