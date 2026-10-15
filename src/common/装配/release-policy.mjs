export const SOURCE_REF = 'v1.0.0';
export const SOURCE_SHA = '83445ebcf24454c6107838cb7f2221882c6638ea';
const files = new Set(['package.json', 'package-lock.json', 'electron-builder.yml', '.github/workflows/release.yml',
  'app/renderer/index.html', 'app/renderer/renderer.js', 'app/main.ts', 'app/desktop/pi-config.ts', 'app/desktop/packaged-smoke.ts', 'src/provider/codex/session.ts',
  'test/桌面应用/pi-config.test.ts', 'test/桌面应用/boundary-refresh.test.ts', 'test/桌面应用/interface.test.ts', 'test/桌面应用/project-document.test.ts', 'test/pi-adapter/tool-display-projection.test.ts', 'test/测试/t1-real-cli.test.ts', 'test/测试/p1p7-document-integration.test.ts']);
const directories = ['src/common/装配/', 'test/装配/', 'test/codex-adapter/'];
export function selectOverlay(paths) {
  const selected = [], excluded = [];
  for (const name of paths) {
    if (files.has(name) || directories.some(dir => name.startsWith(dir))) selected.push(name);
    else if (name.startsWith('app/') || name.startsWith('src/')) throw new Error(`Unreviewed production overlay: ${name}`);
    else excluded.push(name);
  }
  return { selected, excluded };
}
