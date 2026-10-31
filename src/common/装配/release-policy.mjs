export const SOURCE_REF = 'v1.8.3';
export const SOURCE_SHA = 'c3957d00d19f5a177aeaa2950df394274231b25b';
// v1.8.3 overlay：冻结源 tag v1.8.3 已含全部产品/测试代码（run-change 契约变更通道接线：会话头显式入口、
// 两类保守自动触发、run-change-required 三段式；冻结三模式由客户选择）；白名单保持基础集与历史保留条目，
// 未列名 app//src/ 仍 fail-closed。
// v1.8.2 overlay（历史）：冻结源 tag v1.8.2 已含全部产品/测试代码（D3 选中集记账修复：仅 appointment 卡写角色集，
// 决策/确认/验收卡选项不再被当作项目角色；读侧只认 D3 裁决、历史污染自动忽略）；白名单保持基础集与
// 历史保留条目，未列名 app//src/ 仍 fail-closed。
// v1.8.2 发布阻断修复（tag v1.8.2 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、断言不放宽）：
//   · 测试 4 条：test/桌面应用/chain-enforcement.test.ts、test/桌面应用/run-pin.test.ts、
//     test/桌面应用/application-line.test.ts、test/编排/task-state.test.ts——D3 账本用例清理竞态
//     （stop 后等待后台投递落盘 + fs.rm 重试），macOS arm64 CI 稳定性修复，断言未放宽。
// v1.8.1 overlay（历史）：冻结源 tag v1.8.1 已含全部产品/测试代码（第二波可靠性：§5A 意图入口契约对角色可见、
// P0 投递/会话收尾不变量与停止解楔、P1 请求级超时与 SDK api_retry 诊断、P2 网络状态监听、P3 仅 replay-safe
// 同回合重试、验收卡归属三段式指引、view_image 每轮图片预算移除）；白名单保持基础集与历史保留条目，
// 未列名 app//src/ 仍 fail-closed。
// v1.8.0 overlay（历史）：冻结源 tag v1.8.0 已含全部产品/测试代码（内建角色最小系统与五步雇佣链、模块/名单/拓扑 v2
// 与 roster v3、run 冻结、机械拒绝三段式与 contract_check、证据自洽校验与 evidence_check、桌面缺陷修复）；
// 白名单保持基础集与历史保留条目，未列名 app//src/ 仍 fail-closed。
// v1.8.0 发布阻断修复（tag v1.8.0 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、断言不放宽）：
//   · 生产 1 条：app/desktop/session.ts——升级裁决人工处置日志改为 await 落盘（C-04 Windows 时序）。
//   · 测试 4 条：test/桌面应用/role-log.test.ts（平台原生 fixture）、test/测试/lightweight-permission-repairs.test.ts
//     （短内联 review 口径 + 长内联/sh -c deny 更严断言）、test/测试/t1-pipeline-integration.test.ts（补任务 scope
//     使确认成为唯一写源）、test/编排/workflow-preconditions.test.ts（fileURLToPath）。
//   · 第二轮（arm64 写后即读竞态）：app/desktop/session.ts 增持久化 await（notify 链、投递与拒绝审计行）；
//     test/测试/governance-e2e-auto/i-full-chain.test.ts 以真实可读的 task.delivered 为观测点（断言不变）。
// v1.7.0 overlay（历史）：冻结源 tag v1.7.0 已含全部产品/测试代码（独立验收覆盖所有变更、release 仅可选元数据、
// 验收标准门、任命客户决定自动收口、写卡校验反馈去重/忙时门控、中文角色名、角色根文档、目录级授权、
// i18n、自动推进、验收返工路由、Lead 治理协调）；白名单保持基础集，未列名 app//src/ 仍 fail-closed。
// v1.7.0 发布阻断修复（tag v1.7.0 不可移动，经评审走显式 overlay；按精确路径、单文件不开目录、断言不放宽）：
//   · 生产 1 条：src/common/shared/diagnostics.ts——diagnostics root 输出过度脱敏修复。
//     （原 v1.7.0 overlay 的旧团队计划模块条目随 D 批撤除，已从白名单移除。）
//   · 测试 3 条：test/桌面应用/interface.test.ts（第四轮等待预算 6000→15000）、
//     test/桌面应用/project-document.test.ts（期望补 changelog）、
//     test/桌面应用/acceptance-dispatch.test.ts（自动验收合法发送不再被旧“不派 Proof”断言误伤）。
// 以下历史条目仅作保留。
// v1.6.0 overlay（历史）：冻结源 tag v1.6.0 已含全部产品/测试代码（治理角色粒度、团队计划 v2、
// MapReduce 测试、受治理后台任务、思考行显示修复、验收风险档位）。
// v1.5.0 overlay：打包/版本/发布面——白名单**重置为基础集**（files＝package.json、package-lock.json、
// .github/workflows/release.yml；dirs＝src/common/装配/、test/装配/）。冻结源 tag v1.5.0 已含**全部产品代码**
// （UI 平台化：React/shadcn Nova 渲染层、单入口 app/renderer/dist/index.html、新应用图标、派发投射去重、
// 默认不再 15 分钟自动中止回合、治理角色显示名统一），本版**无生产源码/测试随版修复需求**。
// v1.4.0 overlay-2 的 5 条一次性精确条目（1 项产品修复 src/common/编排/shell-command-guard.ts 与 4 项
// 测试/夹具修复）均已随本冻结源吸收，**整批移除、不列入**；overlay-3 的 test/装配/multi-runtime.test.ts
// 属 test/装配/ 目录白名单，同样随冻结源生效、无需单独列名。
// v1.5.0 overlay 追加（三平台 CI 前置修复，按精确路径、单文件不开目录、断言不放宽）：
//   · 生产（唯一）：src/common/codex-adapter/reasoning-catalog.ts——Windows CRLF 内嵌模型目录读取修复。
//   · 测试/夹具 7 条：test/codex-adapter/reasoning-catalog.test.ts、test/codex-adapter/fixtures.ts、
//     test/桌面UI/source-guard.test.ts（Windows 路径归一）、test/runtime-core/file-write-safety.test.ts
//     （ENOTDIR Windows 真值）、test/测试/g5-reasoning-verify/helpers.ts 与
//     test/测试/g5-reasoning-verify/compatibility-loopback.test.ts（Windows loopback EBUSY 稳定化）、
//     test/测试/governance-e2e-auto/c-appointment-timing.test.ts（Windows 时序可见性修复）。
// fail-closed 不变：未列名的 app//src/ 变更仍使 prepare 明确失败；
// 未列名的 test/ 文件仍静默落 excluded、不随构建树（机制同前：经评审文件必须显式入列）。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml',
  'test/桌面应用/chain-enforcement.test.ts',
  'test/桌面应用/run-pin.test.ts',
  'test/桌面应用/application-line.test.ts',
  'test/编排/task-state.test.ts',
  'app/desktop/session.ts',
  'test/桌面应用/role-log.test.ts',
  'test/测试/lightweight-permission-repairs.test.ts',
  'test/测试/t1-pipeline-integration.test.ts',
  'test/编排/workflow-preconditions.test.ts',
  'test/测试/governance-e2e-auto/i-full-chain.test.ts',
  'src/common/shared/diagnostics.ts',
  'test/桌面应用/interface.test.ts',
  'test/桌面应用/project-document.test.ts',
  'test/桌面应用/acceptance-dispatch.test.ts',
  'src/common/codex-adapter/reasoning-catalog.ts',
  'test/codex-adapter/reasoning-catalog.test.ts',
  'test/codex-adapter/fixtures.ts',
  'test/桌面UI/source-guard.test.ts',
  'test/runtime-core/file-write-safety.test.ts',
  'test/测试/g5-reasoning-verify/helpers.ts',
  'test/测试/g5-reasoning-verify/compatibility-loopback.test.ts',
  'test/测试/governance-e2e-auto/c-appointment-timing.test.ts']);
const directories = ['src/common/装配/', 'test/装配/'];
export function selectOverlay(paths) {
  const selected = [], excluded = [];
  for (const name of paths) {
    if (files.has(name) || directories.some(dir => name.startsWith(dir))) selected.push(name);
    else if (name.startsWith('app/') || name.startsWith('src/')) throw new Error(`Unreviewed production overlay: ${name}`);
    else excluded.push(name);
  }
  return { selected, excluded };
}
