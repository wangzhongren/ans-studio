export const SOURCE_REF = 'v1.3.0';
export const SOURCE_SHA = '16963ee3f59acc1f812141709858690f1a24501b';
// v1.3.0 overlay：打包/版本/发布面——白名单**重置为基础集**（files＝package.json、package-lock.json、
// .github/workflows/release.yml；dirs＝src/common/装配/、test/装配/）。冻结源 tag v1.3.0 已含**全部产品代码**
// （G-3 三平台联网搜索＋工具行按轮折叠、G-4 V1 技能安装/V2 外来 MCP 安装、G-5 推理强度、全部修复），
// 本版**无生产源码/测试随版修复需求**（**overlay-2 更正**：首跑 Windows CI 后本条不再成立——确有 1 项
// 生产修复＋6 项测试平台真值分支随版，见下节）。v1.2.0 曾按精确路径一次性纳入的两项——src/provider/codex/session.ts
// （Windows EBUSY 生产修复）与 test/测试/kanban-fixes-verify/f1-timeout.test.ts（慢 runner 时序健壮化）——
// 均已随本冻结源吸收，**整批移除、不列入**。fail-closed 不变：未列名的 app//src/ 变更仍使 prepare 明确失败；
// 未列名的 test/ 文件仍静默落 excluded、不随构建树（机制同前：经评审文件必须显式入列）。
// overlay-2（首跑 Windows CI run 38924209553 后追加；判别结论）：首跑 Windows 8 红已全部处置——**仅 1 处
// 产品修复**，其余 6 处为验证套件**平台真值分支**（G-3/G-4/G-5 批次验证用例首次在 Windows 原生 runner 暴露
// 平台语义差异；断言本体零放宽，仅按平台真值分支/归一）。生产（唯一）：src/provider/codex/session.ts——
// win32 taskkill 清收等待上界 120ms→2000ms（仍为**有界**，真挂起照限如实失败；证据＝同 CI 峰值负载下同
// close 路径姊妹用例以 212ms 通过，120ms 为过紧的假失败源；Codex 属主 fix 记录在案）。测试 6 条（平台真值：
// Windows libuv 注入十键豁免/路径分隔符原生形/POSIX 信号无面/控制字符名不可建盘）：test/pi-adapter/installed-mcp-servers.test.ts、
// test/测试/g4-skill-verify/b-render-double-check.test.ts、test/测试/g4-skill-verify/f-fingerprint.test.ts、
// test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts、test/测试/g4v2-mcp-verify/j-pi.test.ts、
// test/测试/g5-reasoning-verify/h-scope-audit.test.ts。全部按**精确路径**列入（单文件、不开目录：同目录未列文件仍 excluded）。
// overlay-5（第四跑 run 38931760696 Windows 新红）：test/桌面应用/session-rebuild-race.test.ts——首曝期**夹具时序
// 脆性**（等长重写 × filePath 缓存 (mtimeMs,size) 命中 × 平台时间戳粒度合并；受控实验复现＋免疫证明）；修复＝
// 夹具尺寸可判化＋守卫＋免疫回归钉，**产品零改**、原用例本体未动（桌面窗口属主）。按精确路径列入。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml',
  'src/provider/codex/session.ts',
  'test/pi-adapter/installed-mcp-servers.test.ts',
  'test/测试/g4-skill-verify/b-render-double-check.test.ts',
  'test/测试/g4-skill-verify/f-fingerprint.test.ts',
  'test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts',
  'test/测试/g4v2-mcp-verify/j-pi.test.ts',
  'test/测试/g5-reasoning-verify/h-scope-audit.test.ts',
  'test/桌面应用/session-rebuild-race.test.ts']);
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
