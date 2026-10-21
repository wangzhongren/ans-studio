---
id: d3-lightweight-repairs-acceptance
type: fix
title: D3 C2 轻量修复独立审验
created: "2026-10-21"
updated: "2026-10-21"
status: macos-non-ui-pass-windows-missing-evidence
---

# macOS 非 UI 范围通过，Windows 原生证据不足

目录链接绕过角色写区、显式程序路径/rg 预处理被免审批，以及编辑后丢失执行权限，是本次已经批准修复的问题。独立验收已核对当前生产差异、原所有者报告、测试源码和最终原始日志，结论如下：

- **macOS 非 UI 的 C2 范围：通过（pass）**。共享、门禁、核心、README/UI 意见交接及完整非 UI 集成均有当前证据，没有未解决的返工项。
- **Windows 原生：证据不足（missing-evidence）**。junction、原生程序执行与文件替换未验证；两项 Windows 条件跳过不能计为通过。因此不作无保留的完整跨平台通过结论。
- **UI：本任务仅交接意见**。不声称 UI 已修改、已验证或 Electron 已运行；同期 UI 平台化实现与依赖不属本任务验收。

本报告由固定独立验收上下文形成。没有代跑全套、修改生产或测试，也没有代签发布批准。

## 批准依据与实际候选

依据 [D3 方案](../../../项目管理/docs/design/2026-10-21_design_permission-boundary-repairs.md)（SHA-256 `a81908e2486f88cacb4efe284dc030cd888e11c99619099def30217771b71e77`）及 [C2 标准](../design/2026-10-21_design_d3-acceptance-criteria.md)。C2 按用户“UI 不归你管”“你到时候给出意见让别人修改就行了”撤出 UI 实施、UI 测试和 Electron 验证；AC8 只核对 README 与 UI 意见交接。本次审验没有改变 C2。

基线 HEAD 为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`；实际为未提交候选。独立验收两次重新计算以下文件摘要，均与所有者及最终测试候选一致：

| 文件 | SHA-256 |
| --- | --- |
| `src/common/shared/atomic-write.ts` | `8d750702a2bf66e82974c0b2e987d7ed07e9d14d2cf834d2d497e1c9f4ddadd2` |
| `src/common/runtime-core/fs-write.ts` | `67eff321977bad8095654d741bd287e2f436f6e702de2c870e4eb52e763ba37b` |
| `src/provider/runtime/tools.ts` | `7229da117f6b50ab9e360d771e7dbd42b98a6132c4e5d79a1b92d84f3768c61f` |
| `src/service/gate/resolve-write.ts` | `e662417ad0dd331d7b818b5b4783499df3134c887541c0688059ae0f6599ca35` |
| `src/common/门禁引擎/classify-shell.ts` | `65706e7d26bb1b99f59e2a9eafbf993a2b16a782b510fa68d5b36ee7a9126163` |
| `README.md` | `e7a89fdcfce60327bc7d592021397f20702cf796dc2b721e06a558bf281531a7` |

五个生产文件及 README 均由对应角色 Section 1 覆盖。新增核心和独立测试分别位于其专属测试目录；共享/门禁测试由原所有者修改。团队组建对核心边界表达与独立验收定义的配套调整已核对，不把治理定义当作业务实现或虚构 task_ops 预检通过。

[最终候选前置快照](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/candidate-current-config-before.json)记录 558 个 src/app/test/配置/README 文件。测试角色记录运行前后 0 变化、0 新增，实际依赖与 tsc 入口也未变化；独立验收再次对这 **558 个文件逐一计算 SHA-256，当前差异仍为 0**。最终全量及 typecheck 日志摘要已独立复算，与 [最终 manifest](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/current-config-verification-manifest.json)一致。

同期其他聊天修改了 package.json、package-lock.json、tsconfig.json，增加 UI 开发依赖和 renderer 配置。第一轮完整通过后发现这些变化，因此测试角色重新验证了当前稳定配置。根 typecheck 当前排除 app/renderer；D3 五生产文件仍在检查范围，本结论不覆盖 renderer。相关配置变化仅作为本次执行环境记录，不纳入 D3 实施所有权或新增 UI 功能验收；其他产品/UIUX 文档、平台化边界和记录同样排除。

## 证据与阶段判断

环境为 macOS/Darwin arm64，Node v24.14.0、npm 11.9.0、ripgrep 15.2.0，实际 TypeScript 7.0.2。SDK 及其入口摘要见候选快照。测试角色使用真实公共 handler、门禁、临时文件与无害哨兵，三适配器采用真实适配器接线和离线 SDK/MCP/loopback 夹具；不代表线上模型轮次。

| 阶段 | 证据 | 独立结论 |
| --- | --- | --- |
| 共享 | [PM 记录](../../../项目管理/docs/fix/2026-10-21_fix_d3-lightweight-permission-repairs.md)、[共享原始日志](../../../项目管理/docs/fix/2026-10-21-d3-shared-evidence/shared-tests.txt) 53/53，最终全量再次覆盖 finalMode/原调用/失败清理 | macOS 范围通过 |
| 门禁 | [门禁记录](../../../门禁引擎/docs/fix/2026-10-21_fix_lightweight-permission-repairs.md)窄测 79 过、1 Windows 跳过；最终全量覆盖双路径授权、分类及角色元数据回归 | macOS 范围通过 |
| 核心 | [核心记录](../../../运行时核心/docs/fix/2026-10-21_fix_d3-file-write.md)当前门禁下 22/22，核心套件此前 250 过、1 跳过；最终全量重新覆盖实际写入链路 | macOS 范围通过 |
| 文档/意见 | [README 修复记录](../../../装配/docs/fix/2026-10-21_fix_d3-approval-copy.md)与 Model/customer-input/operator-channel 真实分支核对；[UI 意见](../../../桌面UI/docs/fix/2026-10-21_fix_d3-approval-copy.md)已明确仅交接、未改未测 | C2 范围通过 |
| 完整集成 | [独立测试报告](../../../测试/docs/fix/2026-10-21_fix_d3-lightweight-verification.md)、[最终完整日志](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/full-current-config.log)、[最终 typecheck](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/typecheck-current-config.log)：3398 项，3396 过、0 失败、2 跳过，两个命令退出均为 0；新增 10 组联调全部通过 | macOS 非 UI 范围通过；Windows 缺证 |

最终全量日志 SHA-256：`5f23f6838991993bed22c9c790f28c7b36a815c314618f818d8dc1c6e9f64edb`；typecheck 日志 SHA-256：`6540d00ab4c2c686b6351a1ac075f5272c5b7f7ea191645a2e091dc6962c08d8`。仅见既有 npm 用户配置警告。

## 首次失败与两处消费者断言

失败历史已保留在原报告和日志中，没有用后来的成功掩盖：

- 全量首跑 27 个失败中，26 个为沙箱禁止监听 127.0.0.1；允许本地回环后真实重跑，最终均通过。
- `test/测试/t9-block2-write-landing.test.ts` 原断言 gate 只调用一次。可信启动端精确授权原所有者改为 `[targetAbs, targetAbs]`，要求预判与写前重判都收到相同目标；原落盘/拒绝断言保留。已独立核对单行 diff 及最终通过记录。
- `test/门禁引擎/role-group-metadata.test.ts` 因新建独立验收角色，将角色数量由 13 改为 14，并新增独立验收六项自身工作文档权限的精确断言。原组别/归档断言保留；核心历史展示 groupDuty 由团队组建恢复，未赋予派发权。最终角色元数据测试均通过。这两处是批准行为和真实角色定义的消费者同步，不是放宽安全要求。
- 准备阶段 `rg -e --pre data.txt` 被既有有界搜索守卫拒绝。测试保留其真实分类器 allow 断言，真实 handler 场景增加既有 `--max-depth 1` 前提，不修改生产守卫；最终真实 rg 场景通过。
- UI 意见文档初稿仍写待本轮实施；已回交原所有者修正为仅意见交接，并再次核对。该文档问题已关闭，没有因此实施 UI。

## AC1–AC10 最终分项

| 标准 | 当前观察及结论 |
| --- | --- |
| AC1 | 词法/真实目标复用同一边界与 writeSet 规则，不 realpath 扩大边界条目；覆盖、新建、编辑及真实 writeSet 缺项被拒，未授权目标不变。macOS 通过 |
| AC2 | 普通路径、完整授权别名、合法链接项目根成功；根外和文件本身链接拒绝。macOS 通过；Windows junction 为 missing-evidence |
| AC3 | 相对/绝对/Windows 形状与脚本后缀不凭 basename 免审批；真实 cat 拒绝无哨兵、批准才执行。macOS 与纯分类通过；Windows 原生执行为 missing-evidence |
| AC4 | 真实 rg 两种 --pre 交原审批，模式/文件参数不误报；普通 cat/ls/rg 与只读 git 基线保留。macOS 通过 |
| AC5 | 四种模式保持现行差异，deny/risky 不降级；拒绝/不可用/超时/中止无执行副作用。macOS 通过 |
| AC6 | write/edit 保留 0755/0644/0600；严格 umask 独立进程通过；新文件及未传 finalMode 调用保留安全策略，特殊位不复制。macOS 通过；Windows 不要求 POSIX 权限等价 |
| AC7 | 仅 ENOENT 当作新文件，stat/chmod/fsync/rename/abort 失败可追到断言和最终执行；二次 gate/父目录变化拒绝，原文件保持，合法空目录可留。macOS 通过；Windows 原生替换为 missing-evidence |
| AC8 | README 对需求确认代批、失败退回及人工路径与现实现一致；UI 仅意见交接且实际政策未动。C2 范围通过，未验证 UI |
| AC9 | Pi 的实际 Service→adapter→注入 SDK 公共工具、Codex 动态工具/MCP callbacks、Claude 实际 MCP shell/write/edit handler 均在最终全量运行。已读取对应测试源码和日志，非三个名字重复分类桩。macOS 离线接线通过，未声称线上模型验证 |
| AC10 | 五生产文件无来源信任/执行哈希/最小环境框架或新 shell 身份契约，无全面 Windows 或裸白名单收紧；PATH、隐藏配置、恶意替换和 shell 副作用边界保持 D3 已接受取舍。通过 |

## 剩余证据与结论使用

唯一仍阻止完整跨平台通过的必要证据是 Windows 原生 junction、程序执行及原子替换回归。两个实际 skipped 分别是核心 Windows 反斜杠角色边界路径和门禁 Windows 大小写不敏感用例；它们仍未通过。应由具备 Windows 环境的测试角色补证，不能用 macOS 或字符串测试代替。

本次 macOS 非 UI C2 分项可以交付；没有待返工的 D3 生产或文档事项。以后相关候选、依赖或规则变化，受影响结论需重新审验。本报告不授权提交、推送、发布或部署。
