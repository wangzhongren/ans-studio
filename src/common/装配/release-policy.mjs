export const SOURCE_REF = 'v1.5.0';
export const SOURCE_SHA = '35cca0bd2ed373c8ed5984dea45a76a608f4e502';
// v1.5.0 overlay：打包/版本/发布面——白名单**重置为基础集**（files＝package.json、package-lock.json、
// .github/workflows/release.yml；dirs＝src/common/装配/、test/装配/）。冻结源 tag v1.5.0 已含**全部产品代码**
// （UI 平台化：React/shadcn Nova 渲染层、单入口 app/renderer/dist/index.html、新应用图标、派发投射去重、
// 默认不再 15 分钟自动中止回合、治理角色显示名统一），本版**无生产源码/测试随版修复需求**。
// v1.4.0 overlay-2 的 5 条一次性精确条目（1 项产品修复 src/common/编排/shell-command-guard.ts 与 4 项
// 测试/夹具修复）均已随本冻结源吸收，**整批移除、不列入**；overlay-3 的 test/装配/multi-runtime.test.ts
// 属 test/装配/ 目录白名单，同样随冻结源生效、无需单独列名。
// fail-closed 不变：未列名的 app//src/ 变更仍使 prepare 明确失败；
// 未列名的 test/ 文件仍静默落 excluded、不随构建树（机制同前：经评审文件必须显式入列）。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml']);
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
