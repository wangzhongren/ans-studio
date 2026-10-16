export const SOURCE_REF = 'v1.2.0';
export const SOURCE_SHA = 'ecca2d38500c8626cf2833eecb9d85d59f26c680';
// v1.2.0 overlay：纯打包/版本/发布面；全部产品改动（v3 界面收敛、U1 贴底修复、收束静默 30s 等）已在冻结 tag 内，
// 生产源码与测试零改动——v1.1.0 曾按精确路径纳入的 Windows 测试小修已随冻结 tag 吸收，本次不必再列。
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
