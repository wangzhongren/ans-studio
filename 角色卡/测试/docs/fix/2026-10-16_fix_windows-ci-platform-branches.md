# v1.3.0 CI Windows 红修复——验证套件平台适配（测试角色）

**来源**：v1.3.0 发布 CI run `38924209553`（workflow_dispatch）Windows job（`windows-2025`）Regression tests 8 红，其中 **test/测试/** 面 6 红（本角色验证套件）。批准口径＝协调回交单：修 `test/测试/**` 全绿、全量 0 新红、typecheck 0；**平台适配只做平台真值分支、断言本体不许放宽**；产品侧问题只报告不修。日志原件：`gh run view 38924209553 --repo wangzhongren/ans-studio --log-failed --job 117051498349`（本机 `/tmp` 留档，未入仓）。

## 一、逐条判别结论（测试适配 vs 产品修复）

| # | CI 红（test at） | 现象 | 判别 | 处置 |
| --- | --- | --- | --- | --- |
| 1 | `test\测试\g4-skill-verify\b-render-double-check.test.ts:78` 双向核 | `ENOENT mkdir '…\docs\skills\ctl^Aname'`——夹具目录名含控制字符 `0x01` | **测试适配（平台真值）**：Windows 文件系统禁止 `0x00–0x1F` 文件名（mkdir 直接 ENOENT）；产品读取器的 `name-invalid` 判据**先于盘面**（`loadRegistration` 首行名检查），两平台均可经直调名覆盖——产品无缺陷 | win32 分支：不建该夹具目录；读取器侧直调名断言**保留**；渲染器枚举面该格在 Windows 不可达（枚举自盘面）⇒ 诊断集期望按平台真值扣该条（注释如实） |
| 2 | `test\测试\g4-skill-verify\f-fingerprint.test.ts:26` 三触发 | 实得 `docs\skills\k1\SKILL.md`（反斜杠）vs 期望 `docs/skills/k1/SKILL.md` | **测试适配（平台真值）**：产品如实点名按 `changed` 原样插值＝**平台原生分隔符**；同属主（桌面窗口）自有测试 `test/桌面应用/boundary-refresh.test.ts` 已用 `path.join("docs","skills","lint","SKILL.md")` 冻结同口径并**在 Windows CI 通过**；产品 `isSkillChange` 分支判定处已自行归一只用于分类、展示保持原生 ⇒ 非产品侧 | 期望值改为 `path.join("docs","skills","k1","SKILL.md")`（平台原生形，断言本体不变） |
| 3 | `test\测试\g5-reasoning-verify\h-scope-audit.test.ts:45` H2 | 键出现面恰等断言失败 | **测试适配（自分隔符归一）**——`path.relative` 在 Windows 产出反斜杠相对路径，与登记面正斜杠形不匹配；**无第四处直读**（同清单、仅分隔符差）——修复后任何真第四处仍将判红 | 扫描面 `path.relative(...).split(path.sep).join("/")` 归一；`path.win32` 变换证明见 §三 |
| 4a | `test\测试\g4v2-mcp-verify\g-claude-launcher.test.ts:59` G1a | 子进程环境多出十键（HOMEDRIVE/HOMEPATH/LOGONSERVER/SYSTEMDRIVE/SystemRoot/TEMP/USERDOMAIN/USERNAME/USERPROFILE/WINDIR） | **测试适配（平台真值）**：Windows 上 libuv/OS 对自定义环境块强制补齐的十键（loader/winsock 依赖，env 参数无法阻止）——**同一 CI 三处互异 spawn 实现**（本 launcher / Pi 自持 transport J3 / Pi适配器自有套件）**实得完全相同十键集** ⇒ 平台级真值，非泄漏面（哨兵/NOT_DECLARED/PASSTHROUGH/ELECTRON 全数不泄漏断言在 Windows 均通过） | 平台注入允许集扩为 win32 十键（大小写归一）；断言本体（恰等−平台真值集）零放宽。**该文件由 Claude适配器角色并发修复**（fix 记录 `角色卡/Claude适配器/docs/fix/2026-10-16_fix_windows-launcher-platform-branches.md`）；本角色复核内容并本地验证（见 §四） |
| 4b | 同文件 `:125` G1d | `selfKill.code` 实得 1 ≠ null；POSIX 信号面在 Windows 不存在 | **测试适配（平台真值）**：Windows 无信号投递面——`process.kill(pid,'SIGTERM')`＝无条件终止（TerminateProcess，退出码 1、signal null）；启动器的信号转发机制在 Windows 不参与（真命令生命期归调用方进程树清理，MCP 惯例 stdin EOF）。**非 G-5/本批回归**（G-4 V2 既有 POSIX 语义套件首上 Windows） | win32 分支：自击⇒如实钉「退出码 1、signal null」＋转发段「启动器被无条件终止、stub 如实存活并自行清理」（绝不断言转发成功）；POSIX 断言原样保留 |
| 4c | `test\测试\g4v2-mcp-verify\j-pi.test.ts:212` J3 | 同上十键 | 同 4a（测试适配／平台真值） | 平台注入允许集同款 win32 十键分支（**本角色修**） |

**产品修复需求：零。** 以上 6 红全部为验证套件平台适配；产品面（启动器/传输/渲染/判据）行为均已由桌面窗口属主测试与三处独立实现互证为平台真值口径。

## 二、改动文件清单（精确路径，供发布 overlay-2 白名单）

本角色本轮改动（4 个测试文件＋本记录＋角色记录）：

1. `test/测试/g4-skill-verify/b-render-double-check.test.ts`——双向核控制字符夹具 win32 分支（+ 读取器直调名覆盖保留注释）
2. `test/测试/g4-skill-verify/f-fingerprint.test.ts`——通知点名期望改平台原生 `path.join` 形
3. `test/测试/g4v2-mcp-verify/j-pi.test.ts`——J3 平台注入允许集 win32 十键分支（大小写归一）
4. `test/测试/g5-reasoning-verify/h-scope-audit.test.ts`——H2 扫描面分隔符归一
5. `角色卡/测试/docs/fix/2026-10-16_fix_windows-ci-platform-branches.md`（本文件）
6. `角色卡/测试/changelog.md`、`角色卡/测试/memo.md`（各追加一条）

同域但**非本角色本轮**（并发修复，白名单亦需包含、归属另报）：

7. `test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts`——G1a/G1d 平台分支（Claude适配器角色；fix 记录见其 `docs/fix/2026-10-16_fix_windows-launcher-platform-branches.md`）

**非本角色写权面**（只报告，不修）：`test/pi-adapter/installed-mcp-servers.test.ts`（同类平台注入；Pi适配器角色在飞修复）、`test/codex-adapter/web-search.test.ts`（「Codex Windows process cleanup timed out」——疑似产品清理路径，Codex适配器角色在飞修复 `src/provider/codex/session.ts`＋fix 记录 `2026-10-16_fix_ci-win-taskkill-bound.md`）。

## 三、平台真值证明与仿真

- **H2 分隔符归一**（`path.win32` 变换证明）：`path.win32.relative("C:\repo","C:\repo\src\common\runtime-core\reasoning.ts")` → `"src\common\runtime-core\reasoning.ts"`；`.split("\\").join("/")` → `"src/common/runtime-core/reasoning.ts"`（与登记面逐字相等）；POSIX 侧为恒等（no-op）。
- **b-render win32 分支进程内仿真**：本机以 `Object.defineProperty(process,"platform",{value:"win32"})`＋TEMP 垫片（避 `os.tmpdir()` 平台分支干扰）直载测试模块执行——7/7 全过（`controlCreatable=false` 路径：不建控制字符目录、读取器直调名仍返回 undefined、诊断集扣 ctl 条后恰等）。POSIX 实跑 7/7（原路径不变）。
- **f-fingerprint**：两侧（产品插值/测试期望）在**同一平台**均取 `path.join` 产物 ⇒ 平台一致性成立（同桌面窗口属主 boundary-refresh 先例，其 Windows CI 通过为实证）；本机 POSIX 实跑 5/5。
- **j-pi J3**：win32 允许集为构造性平台真值（与 G1a 同集，来源为 CI 三实现互证）；POSIX 实跑原断言不变。

## 四、复跑（本角色本机，macOS）

- 四改动文件＋并发修复文件（launcher）联跑：**24/24 绿**（b-render 7、f-fingerprint 5 单独复跑 12/12；j-pi、g5 h-scope 一并）。
- `node --test "test/测试/**/*.test.ts"` → **502/502 / 0 fail / 0 skip**（437 既有＋本角色 G-5 65）。
- `node --test "test/**/*.test.ts"`（全量，当前共享树：G-5 已入 main＋v1.3.0 overlay＋各角色在飞修复）→ **2110 tests / 2109 pass / 0 fail / 1 skip**（1 skip＝既有 Windows-only）。较 G-5 验证批的 2112 少 2：来自其间落树的三枚提交（`bb83ff2`/`16963ee`/`74a34c9`）与共享树并发变化，**非本批改动**（本批 4 文件测试计数不变）。
- `npm run typecheck` → **0 错**。
- **Windows 终验仍以 CI 重跑为准**（本机无 Windows 运行时；win32 分支经进程内仿真与构造性证明覆盖，其余依赖既有平台分支先例）。

## 五、纪律与边界

- 只写 `test/测试/**` 与 `角色卡/测试/**`；未碰产品文件与探针；未 git 提交。
- 断言本体零放宽：所有平台分支仅替换「平台真值」值面（不可创建的控制字符夹具／原生分隔符／OS 注入集／无信号面），核心判据（恰等、泄漏否定、点名、无孤儿等）逐条保留在各自平台分支。
- 并发注意：`g-claude-launcher.test.ts` 由 Claude适配器角色于本批窗口内并发修复（23:42），本角色仅复核未改写；overlay-2 白名单需含该文件（归属另报）。
- G-5 独立验证报告已入 main（`16963ee`）；本批对 `test/测试/g5-reasoning-verify/h-scope-audit.test.ts` 的 Windows 适配是在其之上的**如实再修订**（非静默漂移，冻结面变动记录于此）。
