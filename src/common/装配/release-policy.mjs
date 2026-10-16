export const SOURCE_REF = 'v1.2.0';
export const SOURCE_SHA = 'ecca2d38500c8626cf2833eecb9d85d59f26c680';
// v1.2.0 overlay：打包/版本/发布面 ＋ 1 项经评审的随版生产修复（其余产品改动——v3 界面收敛、U1 贴底修复、
// 收束静默 30s 等——均已在冻结 tag 内；v1.1.0 曾按精确路径纳入的 Windows 测试小修已随冻结 tag 吸收）。
// 发布前 CI（run 38879484184）Windows 仅 1 红：test/codex-adapter/session.test.ts 的 EBUSY 清理竞态；
// 根因在产品清理路径（workRoot 删除早于进程 stdio 全闭、Windows 瞬时句柄占用），经评审的修复落在
// src/provider/codex/session.ts（等 stdio close ＋ rm 瞬时重试 retryOnTransient；不放松断言、不放宽行为；
// 测试文件零改动、不列入；先例：v1.0.0 白名单本就按精确路径含此文件）——单文件授权，未列 app//src/ 仍 fail-closed。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml', 'src/provider/codex/session.ts']);
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
