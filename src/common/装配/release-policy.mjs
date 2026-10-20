export const SOURCE_REF = 'v1.4.0';
export const SOURCE_SHA = '83eec7ed1966b215d81035cac33d7dda80013f05';
// v1.4.0 overlay：打包/版本/发布面——白名单**重置为基础集**（files＝package.json、package-lock.json、
// .github/workflows/release.yml；dirs＝src/common/装配/、test/装配/）。冻结源 tag v1.4.0 已含**全部产品代码**
// （flow_get / flow_step_update / flow_step_supersede 流程文件方法化、Lead / 主理 兼任工作流管理者、
// 重启自动续跑、聊天 pane 加载占位、验收重派/收口、角色卡写后门控、artifact 补登、排队 UI 清理、
// shell/UI 修复），本版**无生产源码/测试随版修复需求**（**overlay-2 更正**：首跑 CI run 39389502551
// 三平台 Regression tests 失败后，确有 1 项生产修复＋4 项测试/夹具修复随版，见下节）。v1.3.0 曾按
// 精确路径一次性纳入的条目——src/provider/codex/session.ts、6 个平台真值测试文件与
// test/桌面应用/session-rebuild-race.test.ts——均已随本冻结源吸收，**整批移除、不列入**。
// overlay-2（首跑 run 39389502551 后追加；三平台均在 Regression tests 失败）：
//   · 生产（唯一）：src/common/编排/shell-command-guard.ts——Windows 盘符/UNC 路径反斜杠被当 POSIX
//     转义消费，导致 `grep -r foo D:\...\source` 漏判 allow；修复为 Windows 绝对路径按分隔符保留、
//     双引号内仅 POSIX 特殊字符转义、isWidePath 用 path.win32 归一比较。
//   · 测试/夹具 4 条（断言不放宽）：test/编排/shell-command-guard.test.ts（平台无关 Windows 路径回归）、
//     test/编排/flow-service.test.ts（原子写失败用例 Windows 平台真值分支）、
//     test/桌面应用/interface.test.ts（「收尾推进」测试竞态修复，产品零改）、
//     test/桌面应用/runtime-resolution.test.ts（mac arm64 teardown ENOTEMPTY，临时目录清理有界重试）。
//   全部按**精确路径**列入（单文件、不开目录：同目录未列文件仍 fail-closed/excluded）。
// fail-closed 不变：未列名的 app//src/ 变更仍使 prepare 明确失败；
// 未列名的 test/ 文件仍静默落 excluded、不随构建树（机制同前：经评审文件必须显式入列）。
const files = new Set(['package.json', 'package-lock.json', '.github/workflows/release.yml',
  'src/common/编排/shell-command-guard.ts',
  'test/编排/shell-command-guard.test.ts',
  'test/编排/flow-service.test.ts',
  'test/桌面应用/interface.test.ts',
  'test/桌面应用/runtime-resolution.test.ts']);
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
