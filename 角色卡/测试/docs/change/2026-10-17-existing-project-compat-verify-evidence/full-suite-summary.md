# 全量测试独立复跑摘要（2026-10-17，测试角色）

## 命令与结果

| 时点 | 命令 | 计数 | exit |
| --- | --- | --- | --- |
| 基线（未含本批） | `node --test "test/**/*.test.ts"` | **2108 tests / 2014 pass / 92 fail / 2 skip** | 1 |
| 终态（含本批 42 例） | 同上 | **2150 tests / 2055 pass / 93 fail / 2 skip** | 1 |

- 计数守恒：2108 + 42 = 2150；2014 + 42 − 1（并发负载下既有计时用例红）= 2055；92 + 1 = 93。
- 本批 42 例在两次全量中均**全部通过**（失败清单无 `existing-project-compat-verify` 任何条目）。

## 93 红归因（独立复核）

| 类别 | 条数 | 依据 | 是否本轮引入 |
| --- | --- | --- | --- |
| 依赖缺件（zod / @anthropic-ai/claude-agent-sdk / @modelcontextprotocol/sdk / @openai/codex） | 75 | 失败块含 `Cannot find package …` / `… requires @…`；`npm run typecheck` 同源 29 条 `TS2307` | 否（环境未安装依赖；本轮未触碰这些适配器） |
| Windows 符号链接 EPERM | 8 | 失败块含 `EPERM … syscall: 'symlink'`（runtime-core ×3、pi-adapter ×2、g3/g4/编排各 ×1） | 否（Windows 权限；与本轮无交集） |
| CRLF 下 `\n` 锚点正则失配 | 9 | 工作树 `core.autocrlf=true`，未改动文件亦全为 CRLF（`src/index.ts` 478/478、`tools.ts` 1711/1711、`session.ts` 3035/3035）；失败为 `renderer.test.ts` 4 + `markdown.test.ts` 1 + `g2-verify` 3 + `g4v2/k-scope-audit` 1 | 否（检出行尾环境；任务书已列前两类为已知基线） |
| 计时竞态（`runtime-core/tools.test.ts`「abort running shell…」） | 1 | 基线跑通过；全量负载下失败；单独复跑通过（见 `flaky-abort-recheck.txt`） | 否（既有计时用例，本轮未触碰 runtime-core） |

## 与任务书「本机已知基线」的差异（如实登记）

任务书列：renderer.test 4、markdown.test 1、`test/编排/**` 符号链接 EPERM 1。独立复跑实际比该清单多出：
上述依赖缺件 75、EPERM 由 1 扩到 8（跨 5 个目录）、CRLF 源钉 4（g2 ×3、g4v2 ×1）、计时竞态 1。

逐条核查：
- 依赖缺件与 EPERM 的用例**不涉及**本轮 11 个实现文件（app 7 + src 4）中的任何判定逻辑；
- CRLF 类失败均为「源码字面正则依赖 LF」的检查。工作树所有文件（含本轮未改的 `src/index.ts`、
  `src/provider/runtime/tools.ts`、`app/desktop/session.ts`）都是 CRLF（`core.autocrlf=true` 检出）；
  `renderer.js` 的 U1 失败断言（Esc ⇒ false）指向的代码段不在本轮 diff 内，单独复跑同文件其余 U1 断言通过；
- 计时竞态用例（runtime-core）本轮零改动，单独复跑通过。

主因是**本机未安装依赖**与 **Windows/CRLF 检出环境**，不是本轮实现回归。
