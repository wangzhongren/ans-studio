---
id: d3-lightweight-permission-repairs-delivery
type: fix
title: D3 轻量权限修复实施与验证记录
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ans-permission-boundary-repairs]
events:
  - date: "2026-10-21"
    kind: created
    summary: 客户确认 D3 并要求分角色实施与测试，开始准备
---

# 修复明确的绕过与权限丢失，保留常用命令免审批

客户已明确指示：“可以，就按 D3 轻量方案，用 ANS 技能安排各角色实施，改完测试一下。”

实施依据为 [D3 方案](../design/2026-10-21_design_permission-boundary-repairs.md)，批准时 SHA-256 为 `a81908e2486f88cacb4efe284dc030cd888e11c99619099def30217771b71e77`，源码基线为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`。D3 保持原文，本记录另记实施事实；工作区原有产品/UI方案文档不是本任务产物。

## 分工与范围

| 固定角色 | 本次范围 | 当前状态 |
| --- | --- | --- |
| 团队组建 | 核心边界表达对齐、独立验收最小定义；不改产品或 .ans | 已完成，边界回归21/21 |
| 独立验收 | 复用 D3 AC1–AC10 建标准，最后核对当前候选和证据 | macOS非UI已执行范围pass；Windows原生missing-evidence |
| 门禁引擎 | resolve-write、classify-shell 及所属测试/说明 | 已实现，当前完整回归覆盖 |
| 项目管理 | atomic-write finalMode、所属测试与共享说明 | 已实现，53/53自测 |
| 运行时核心 | 写前复核、普通权限位保留及所属测试/说明 | 已实现，核心250通过/1平台跳过；当前依赖窄测22/22 |
| 桌面UI | 仅交接修改意见，实施与测试已按客户指令撤出 | 意见已交接 |
| 装配 | README 现行代批说明 | 已完成文档核对 |
| 测试 | 独立真实工具联调与全仓回归 | 联调10/10；最终3396通过/0失败/2平台跳过，类型检查通过 |

由本聊天按客户明确指令作为可信启动端安排固定角色，主上下文仍为项目管理，执行者之间写集隔离。沿现有项目无 task_ops 路线记录真实证据，不生成虚假的机器调度日志、配置批准哈希或验收凭据。独立验收不由 PM 自己承担。

## PM 共享组件变更契约

精确实现范围：`src/common/shared/atomic-write.ts`、`test/项目管理/shared/atomic-write.test.ts`。说明范围为本记录、共享组件目录、PM api-spec 及必要导航。

`AtomicWriteOptions.finalMode?: number` 表示 POSIX 普通权限位（整数 0–0777）。未传时行为保持；传入非法值在创建临时文件前报错。有效值在写完临时文件后通过句柄 chmod 应用，再 fsync/close/rename，避免 umask 收窄并防止提交后 chmod 失败。Windows 不调用 POSIX chmod，保留原文件替换语义。运行时核心仅对 POSIX 已有普通文件传 `mode & 0777`，新文件仍按 mode=0600 创建；其他共享消费者不自动继承权限。

计划验证：真实权限保留与严格 umask 子进程，非法输入零副作用，chmod/fsync/rename/abort 失败不提交及临时文件清理；回归共享 atomic-write、env-file，最后由测试角色验证实际公共工具与完整候选。

## 证据与结论

PM共享已实现：`finalMode` 校验与POSIX提交前 chmod。atomic-write + env-file **53/53**，初次类型检查通过；原始输出及受测文件哈希见 [共享证据](2026-10-21-d3-shared-evidence/manifest.json)。本结果仅覆盖共享组件，尚不代表完整工具修复或跨平台通过。

用户随后明确“UI 不归你管”“你到时候给出意见让别人修改就行了”：本轮撤出UI应用、测试与Electron验证，只保留[交接意见](../../../桌面UI/docs/fix/2026-10-21_fix_d3-approval-copy.md)。独立验收标准已按此形成 [C2](../../../独立验收/docs/design/2026-10-21_design_d3-acceptance-criteria.md)，其他D3标准不变。

团队组建完成核心边界表达对齐和独立验收定义；实际task_ops只读预检因缺`.ans/project.json`而rejected，没有生成配置或凭据。本次按客户明确授权安排固定角色及精确写集，不把人工记录冒充自动门禁通过。后续分别补独立测试与独立验收链接，Windows原生未测如实标记。


## 必要测试范围补充与保留的失败

- 团队组建新增独立验收角色后，真实枚举总数从13变14。门禁所有者获准同步 `test/门禁引擎/role-group-metadata.test.ts` 并新增该角色仅有六项自身文档边界的精确断言；原组字段和归档断言保留。治理侧先前顺带移除核心旧 groupDuty 展示字段，已由原所有者恢复并说明仅为历史展示、不授权限。没有通过删断言掩盖回归。
- 核心新增精确测试为 `test/runtime-core/file-write-safety.test.ts`（11项），在该角色既有测试目录内，替代把长夹具全部堆进 tools.test.ts；生产范围不变。
- 最终独立全量初跑发现 `test/测试/t9-block2-write-landing.test.ts` 仍期望 gate 只调用一次。已授权测试所有者把此单项精确断言更新为预判和写前重判都收到同一绝对路径，其余落盘/拒绝断言保留。这是D3既定两次判定的消费者同步，原失败日志保留并重跑全量。
- 沙箱本地回环监听限制仍会导致26个现有适配器测试出现 `listen EPERM`；独立测试将在允许回环监听后重跑最终候选，不把环境阻断当产品通过或产品缺陷。
- 本轮不修改 `app/`、Model、shell执行环境/身份契约及编排生产文件。同期其他聊天的产品/UI平台化定义和资料不计入本任务成果。


## 当前候选验证（macOS，非 UI）

独立测试角色已在最终配置完成 `node --test "test/**/*.test.ts"`：**3398项，3396通过、0失败、2项win32-only跳过**；`npm run typecheck`退出0。新增真实联调10/10。实际子进程、共享文件写入和三适配器既有离线SDK/MCP/loopback路径均由真实测试执行，未调用线上模型、未运行Electron验证。

原始证据：[当前候选manifest](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/current-config-verification-manifest.json)、[完整输出](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/full-current-config.log)、[类型检查](../../../测试/docs/fix/2026-10-21-d3-lightweight-verification-evidence/typecheck-current-config.log)、[独立测试报告](../../../测试/docs/fix/2026-10-21_fix_d3-lightweight-verification.md)。

此前一次全量虽通过，但检查期间出现其他聊天的UI平台化package/lock/tsconfig变化；未覆盖或回退这些文件。已按当前配置重新完整验证，558个源码/测试/配置/README文件及所记录实际安装依赖、tsc前后稳定。该结果不表示本任务实现或验收了新增UI功能。

两个跳过分别是运行时核心Windows反斜杠边界识别、门禁Windows大小写规范化。Windows junction、原生文件替换和相关执行专项没有本机原生证据，不能计为通过。剩余PATH/隐藏配置/恶意并发替换风险按D3保留。

独立完成判断以 [独立验收报告](../../../独立验收/docs/fix/2026-10-21_verify_d3-lightweight-repairs.md)为准；本记录汇总实现与测试，不代替验收，也不授予提交、发布或部署。应用源码实际只改门禁2文件、核心2文件、共享1文件；没有改UI应用或UI测试。


## 独立审验结论

独立验收已核对原始全量/类型检查日志哈希及558个候选文件，给出 **macOS 非UI的 C2 五阶段和已执行 AC 范围通过（pass）**，未发现未解决返工项。Windows junction、原生执行和原子替换仍为 **missing-evidence**；没有给完整跨平台通过。标准C2未为过测改动。

本轮交付为工作区中的修复、测试、角色证据及UI修改意见；没有提交、推送或发布。UI应用及UI测试未由本任务修改，后续由其他负责人按交接意见处理。
