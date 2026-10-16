export const SOURCE_REF = 'v1.3.0';
export const SOURCE_SHA = '16963ee3f59acc1f812141709858690f1a24501b';
// v1.3.0 overlay：打包/版本/发布面——白名单**重置为基础集**（files＝package.json、package-lock.json、
// .github/workflows/release.yml；dirs＝src/common/装配/、test/装配/）。冻结源 tag v1.3.0 已含**全部产品代码**
// （G-3 三平台联网搜索＋工具行按轮折叠、G-4 V1 技能安装/V2 外来 MCP 安装、G-5 推理强度、全部修复），
// 本版**无生产源码/测试随版修复需求**。v1.2.0 曾按精确路径一次性纳入的两项——src/provider/codex/session.ts
// （Windows EBUSY 生产修复）与 test/测试/kanban-fixes-verify/f1-timeout.test.ts（慢 runner 时序健壮化）——
// 均已随本冻结源吸收，**整批移除、不列入**。fail-closed 不变：未列名的 app//src/ 变更仍使 prepare 明确失败；
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
