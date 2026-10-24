export const SOURCE_REF = 'v1.7.0';
export const SOURCE_SHA = '358cde9152584be29eff3a7564c99d9dd53463d8';
// v1.7.0 overlay：冻结源 tag v1.7.0 已含全部产品/测试代码（独立验收覆盖所有变更、release 仅可选元数据、
// 验收标准门、任命客户决定自动收口、写卡校验反馈去重/忙时门控、中文角色名、角色根文档、目录级授权、
// i18n、自动推进、验收返工路由、Lead 治理协调）；白名单保持基础集，未列名 app//src/ 仍 fail-closed。
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
