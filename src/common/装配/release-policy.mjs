export const SOURCE_REF = 'v1.2.0';
export const SOURCE_SHA = 'ecca2d38500c8626cf2833eecb9d85d59f26c680';
// v1.2.0 overlay：打包/版本/发布面 ＋ 2 项经评审的随版修复（其余产品改动——v3 界面收敛、U1 贴底修复、
// 收束静默 30s 等——均已在冻结 tag 内；v1.1.0 曾按精确路径纳入的 Windows 测试小修已随冻结 tag 吸收）。
// 发布前 CI（run 38879484184）Windows 仅 1 红：test/codex-adapter/session.test.ts 的 EBUSY 清理竞态；
// 根因在产品清理路径（workRoot 删除早于进程 stdio 全闭、Windows 瞬时句柄占用），经评审的修复落在
// src/provider/codex/session.ts（等 stdio close ＋ rm 瞬时重试 retryOnTransient；不放松断言、不放宽行为；
// 测试文件零改动、不列入；先例：v1.0.0 白名单本就按精确路径含此文件）——单文件授权，未列 app//src/ 仍 fail-closed。
// 发布前 CI（run 38881759770）macos-15-intel 2 红（归因更正，2026-10-16）：逐字落点为
// test/测试/kanban-fixes-verify/f1-timeout.test.ts 的镜像 F-1 用例（:40 后续快命令撞同一条 250ms 微小
// 时限、:76 孙进程 pid 未及写盘即被 400ms 时限收口——慢 runner 进程启动开销 >250ms，非产品缺陷）；
// 「测试」对该文件的同口径时序健壮化（不放松断言）经评审随本版 overlay 进构建树——按精确路径列入
// （单文件、不开目录：同目录 f2~f8 及其余 test/ 文件仍 excluded）。test/runtime-core/shell-exec-timeout.test.ts
// 在同 run 7/7 全绿：上一版曾因归因错误列入，本次核实后移除（其同口径硬化调用 fixtures.ts 新增的可选
// 第二参，两文件随发布后 main 常规批次提交、不入本 overlay）。机制同前：不经白名单的 test/ 文件会静默落
// excluded、构建树沿用 tag 旧断言——经评审文件必须显式入列。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml', 'src/provider/codex/session.ts', 'test/测试/kanban-fixes-verify/f1-timeout.test.ts']);
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
