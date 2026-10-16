export const SOURCE_REF = 'v1.1.0';
export const SOURCE_SHA = 'e4556cc43311adf7bda056fe071b9a389a85cf40';
// v1.1.0 overlay 仅限打包/版本/发布面：全部产品修复已在冻结 tag 内，生产源码零改动。
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
