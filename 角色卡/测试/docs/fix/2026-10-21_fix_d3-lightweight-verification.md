---
type: fix
title: D3 轻量权限修复独立测试记录
created: "2026-10-21"
updated: "2026-10-21"
status: tested-macos
---

# 本轮验证什么

测试上下文固定绑定测试角色，依据已批准的 [D3](../../../项目管理/docs/design/2026-10-21_design_permission-boundary-repairs.md) 和独立验收 [C2](../../../独立验收/docs/design/2026-10-21_design_d3-acceptance-criteria.md)。已完成当前候选的 macOS 非 UI 独立测试与完整 Node 回归。本报告提供测试事实，独立验收结论由验收角色给出；Windows 原生证据不足。

新增测试文件为 [lightweight-permission-repairs.test.ts](../../../../test/测试/lightweight-permission-repairs.test.ts)。使用真实公共 buildGovernedTools handler、真实 resolveWrite、createShellGate 和 classifyShell，临时目录内执行无害哨兵。测试不修改生产代码或其他角色测试，不启动 Electron；UI 应用/测试修改和 UI 结论不在本轮范围。

## 用例与证据

十组测试覆盖：跨角色目录链接与真实目标 writeSet、完整授权别名和链接项目根、根外逃逸和文件链接拒绝、mkdir 后再次调用真实 gate、Windows 形状字符串分类、自定义 cat 拒绝/批准/超时/不可用/中止、真实 rg 两种 --pre 用法与正常读取、既有四种审批模式、write/edit 权限保留及独立子进程 umask、chmod/fsync 失败与 abort 不提交。Windows 形状分类不是 Windows 原生执行证明。

准备阶段 `npm run typecheck` 退出 0。首轮 8 组为 7 通过/1 失败，第二轮补齐用例后 10 组为 9 通过/1 失败，原始日志保留于 [证据目录](2026-10-21-d3-lightweight-verification-evidence/)。失败命令 `rg -e --pre data.txt` 被既有 `preblock:unbounded-search` 拒绝，尚未进入 D3 分类器；只读核对既有 `shell-command-guard.ts` 发现短 `-e` 没有设置 patternFromOption，长 `--regexp` 已设置。这不是 D3 新增拒绝，不能为本轮扩大修改范围。测试保留原 argv 的真实分类器 allow 断言，并在完整 handler 命令中显式加 `--max-depth 1` 满足既有有界要求；没有修改或绕开生产守卫。

准备运行命令：

```sh
node --test test/测试/lightweight-permission-repairs.test.ts
```

合并就绪后已执行当前候选的 typecheck、新套件、受影响三适配器公共接线及全量 Node 测试。三适配器优先复用各自已有真实离线 SDK/MCP/loopback 测试，不以引擎名字循环调用分类桩代替接线。不运行 Electron；全量 Node 命令已有 UI 测试仅记录既有结果，不声称验证 UI 修改。

## 范围和待补证据

最终结果及候选清单见下文。同期产品/UI 平台化改动不属于本任务。macOS 结果不得代替 Windows junction/原生替换/执行；Windows 原生证据当前缺失。PATH、隐藏配置、程序替换和恶意并发竞争保持 D3 已接受风险。历史 fc1a39c 基线及此前 /tmp 缺陷复现不记作本轮通过。

## 最终结果：macOS 已执行范围通过

环境：Darwin arm64，Node `v24.14.0`，npm `11.9.0`，ripgrep `15.2.0`，实际安装 TypeScript `7.0.2`、yaml `2.9.0`；Pi SDK `1.1.0`、Codex `0.162.1`、Claude SDK `0.3.299`。实际包 JSON、可用主入口和 tsc 可执行入口摘要见 [当前候选前置快照](2026-10-21-d3-lightweight-verification-evidence/candidate-current-config-before.json)。未读取或记录凭据。

| 检查 | 实际结果 | 原始证据 |
| --- | --- | --- |
| 新增独立非 UI 套件 | 10/10 通过，0 跳过；最终全量再次覆盖 | [定向日志](2026-10-21-d3-lightweight-verification-evidence/targeted-candidate.log) |
| 首次全量，受限沙箱 | 3398 项：3369 通过、27 失败、2 跳过。26 项为 `listen EPERM 127.0.0.1`，1 项旧单次门禁断言不匹配 D3 | [保留首红](2026-10-21-d3-lightweight-verification-evidence/full-sandbox.log) |
| 消费者断言更新后，允许回环的全量 | 3398 项：3396 通过、0 失败、2 跳过。后置发现并发 UI 配置变化，因此不把此轮写成整个工作区冻结证明 | [首个完整通过](2026-10-21-d3-lightweight-verification-evidence/full-loopback-enabled.log) |
| 当前配置补跑全量，允许回环 | **3398 项：3396 通过、0 失败、2 跳过，退出 0** | [最终完整日志](2026-10-21-d3-lightweight-verification-evidence/full-current-config.log) |
| 当前配置 `npm run typecheck` | **退出 0**；仅已有 npm 用户配置警告 | [最终类型检查](2026-10-21-d3-lightweight-verification-evidence/typecheck-current-config.log) |

最终运行前后核对 **558 个 src/app/test/配置/README 文件**：0 变化、0 新增；记录的实际已安装依赖包及入口摘要无变化，tsc 入口摘要无变化。机器结果见 [最终证据清单](2026-10-21-d3-lightweight-verification-evidence/current-config-verification-manifest.json)。HEAD 为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`，实际候选包含未提交修改，因此以文件摘要及 [本任务 diff](2026-10-21-d3-lightweight-verification-evidence/d3-tracked-code-tests-readme.diff) 辨识，不能只凭 HEAD 认定版本。

两项跳过均为平台条件：`test/runtime-core/boundary-write-guard.test.ts` 的 Windows 反斜杠角色边界路径；`test/门禁引擎/resolve-write.test.ts` 的 Windows 大小写不敏感。它们不是已通过。Windows 原生 junction、程序执行与文件替换仍需对应平台证据；macOS 的字符串与注入测试不补齐该缺口。

## 首红处理与范围审计

全量首红的 `test/测试/t9-block2-write-landing.test.ts:264` 原断言只允许 gate 收到一次目标路径。D3 明确要求预判与写前复判，实际收到两次相同路径。启动端明确授权将该**单条断言**更新为 `[targetAbs, targetAbs]`，同时保留该文件原有落盘、拒绝等断言。此项属于既定行为的消费者契约更新，不减少断言、不放开写权限；第二轮及最终全量均实际执行通过。

本测试角色仅写：新增 `test/测试/lightweight-permission-repairs.test.ts`、上述旧测试的单条断言、本报告与证据目录。未修改生产代码、其他角色测试、UI、配置或治理定义，未提交 Git。

本任务生产范围恰 5 文件：`resolve-write.ts`、`classify-shell.ts`、`src/provider/runtime/tools.ts`、`src/common/runtime-core/fs-write.ts`、`src/common/shared/atomic-write.ts`。README、各属主测试、独立验收定义与测试角色交付分别登记在快照的 `source` / `d3_tests` / `readme` / `acceptance_governance` 字段；它们不等于测试角色自己的写集。其他治理元数据可能同时包含角色边界修订，不能整份归为 D3 自有产物。

并发 UI 平台化修改了 package.json / package-lock.json / tsconfig.json：新增 renderer 脚本与 React/Vite 等开发依赖、根 typecheck 排除 app/renderer。测试角色没有改写或回退。只读 [锁文件对比](2026-10-21-d3-lightweight-verification-evidence/concurrent-lock-comparison.json) 记录旧条目版本与 integrity 全部不变、新增 97 项；当前配置补跑时前后均稳定。新增 UI 依赖行为不在 D3 测试结论内，同期产品/UI 设计和治理文档也不计为本任务交付。

## C2 覆盖与限制

| 标准 | 当前证据 |
| --- | --- |
| AC1–AC2 | 新套件真实 handler + resolveWrite：跨角色别名、真实 writeSet 缺项均拒绝且未改目标；完整授权别名、普通路径和链接项目根成功；根外与文件本身链接拒绝。Windows 原生项缺证。 |
| AC3–AC5 | 自定义相对/绝对 cat 与真实 rg 两种 --pre 产生审批；拒绝/超时/不可用/中止无哨兵，批准后真实产生哨兵；正常 cat/ls/rg 免批，原 git 分类与 deny/risky 保留；普通、operator-only、advisory、readonly 差异实测。 |
| AC6–AC7 | write/edit 保留 0755/0644/0600，严格 umask 独立进程，新文件安全创建；真实 gate 二次调用，mkdir 后撤销 writeSet 不提交且允许合法空目录保留；chmod/fsync 注入与 abort 保留旧文件和权限。全量同步执行核心 lstat ENOTDIR、父目录改变与共享 finalMode/rename/abort 原子失败测试。 |
| AC8 | 只读核对 README 的两处代批说明与 Model `GOVERNANCE_CARD_GROUP`、customer-input 通道/现有测试：intent-confirm 属 decision，仅 confirm 可代选；manual/失败当次拒绝退回，不自动弹卡；开关关闭等走现有人工路径。UI 文案建议已由原属主改为仅交接，见 [意见文档](../../../桌面UI/docs/fix/2026-10-21_fix_d3-approval-copy.md)。本轮 UI 零修改、Electron 未运行。 |
| AC9 | 全量实际运行既有 Pi `injected-runtime.test.ts`、`tool-display-projection.test.ts`（Service → 真实 Pi adapter → 注入 SDK，公共 shell handler 真实进程事实）；Codex `session.test.ts` 真实动态工具/MCP callback 的 gate 拒绝/抛错/写入；Claude `session.test.ts` 的真实 MCP shell/write/edit handler。另有真实 Pi 本地 loopback 协议测试通过。SDK/引擎传输为离线夹具，不能表述为线上模型调用。 |
| AC10 | 当前生产 diff 无 Model/shellGate/audit 合同变更，无来源信任/执行哈希/最小环境框架；未全面收紧 Windows 或原只读白名单。D3 剩余风险保留，不能宣称恶意程序隔离。 |

测试角色结论限于上述 **macOS 非 UI 已执行范围通过**；完整跨平台结论仍缺 Windows 原生证据。独立验收角色根据 C2 与这些证据另行判断，不由本测试报告替代。
