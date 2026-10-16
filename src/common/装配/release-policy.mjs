export const SOURCE_REF = 'v1.1.0';
export const SOURCE_SHA = 'e4556cc43311adf7bda056fe071b9a389a85cf40';
// v1.1.0 overlay：打包/版本/发布面 ＋ 经评审的单个测试文件小修；全部产品修复已在冻结 tag 内，生产源码零改动。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml',
  // 发布前 CI 检查：该文件 3 条断言假定 Unix 信号名语义、Windows 平台失败（产品行为无缺陷），
  // 运行时核心角色的平台自适应小修经评审随本版 overlay——显式列入，避免被静默排除后构建树沿用旧断言在 Windows 再红。
  'test/runtime-core/shell-exec-timeout.test.ts']);
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
