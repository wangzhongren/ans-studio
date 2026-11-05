# 变更记录：治理权力矩阵 T2（T3 全量回归 + typecheck）— 2026-11-05

- 任务 ID：`2026-11-05-governance-authority-matrix`
- 节点：**T2**（团队计划 §5.1：T3 全量回归计数/失败分类 + `npm run typecheck`；判据基线 = **B0 v3（0418746）**）
- 角色：测试（独立固定工作上下文；按 `角色卡/测试/role-card.md` 与 `boundary.md` Section 1 工作）
- 日期：2026-11-05
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；未切换目录）
- 纪律：**本轮只写本记录**；不改生产代码/其他角色测试；未 commit/push/暂存；未启动应用/Electron；未跑截图/录屏。
- 性质：T2 证据层结论，不是独立验收结论；不授权提交/推送/合并/发布。

## 1. 候选与环境

| 项 | 实测值 |
| --- | --- |
| 分支 | `feat/governance-authority-matrix` |
| `git rev-parse HEAD` | `0418746ae9f2ed20f389c26da34ef55840febfe6`（`Merge pull request #67 from wangzhongren/fix/d04-schema-allowlist`） |
| 本地 `origin/main` | 同 HEAD；`git rev-list --left-right --count origin/main...HEAD` = `0 0` |
| 实现候选状态 | 工作树未提交实现候选：`git status --porcelain -uall -- src app test` = **29 个文件（12 M + 17 ??）**（未展开目录时 24 条）；快照 `sort` 后 SHA-256 = `839b922fa5c553a27bd7f058bf70310c01619b33d18c658f91c5e7ebe80aab43` |
| 暂存区 | `git diff --cached --name-only` 为空（0 条） |
| 本角色 T1 测试 | `test/测试/governance-matrix-integration.test.ts`：1392 行 / SHA-256 `f1b98dc8804ed4685e435ffac859b46d78c848dbed45a6230ae540cb9def9c86`（git hash-object `527e9084be299fd117e1583e6008d31a484b6246`） |
| C3 修复确认 | `test/编排/governance-matrix-injection.test.ts`：793 行 / SHA-256 `1b8c4b564c9b6c217cc008160037cc1515109ac6238c5feb56ffe7c7aceda589`（`grep -c probe` = 0） |
| Node / npm | `v24.22.1` / `11.19.1` |
| `node_modules` | 已安装：顶层 377 项，`node_modules/.package-lock.json` 存在 |
| 测试文件集 | `find test -name "*.test.ts"` = **457**；排除 `test/pi-adapter/write-sequencing.test.ts` 后 **456**（10 个目录 glob 覆盖非 pi 目录 416 个 + pi 显式 **40** 个） |

## 2. 命令与结果

### 2.1 typecheck

```bash
npm run typecheck
```

- **exit 0**；输出 `> ans-cli@1.9.2 typecheck` → `> tsc --noEmit`，无诊断（仅 npm 版本提示，非错误）。
- 原始输出：`/tmp/b0v2-ebbc2fc/t2-typecheck.log`。

### 2.2 T3 全量回归

```bash
node --test --test-concurrency=1 \
  "test/claude-adapter/**/*.test.ts" "test/codex-adapter/**/*.test.ts" \
  "test/runtime-core/**/*.test.ts" "test/桌面UI/**/*.test.ts" \
  "test/桌面应用/**/*.test.ts" "test/测试/**/*.test.ts" \
  "test/编排/**/*.test.ts" "test/装配/**/*.test.ts" \
  "test/门禁引擎/**/*.test.ts" "test/项目管理/**/*.test.ts" \
  <test/pi-adapter 的 40 个显式 .test.ts 文件；排除 write-sequencing.test.ts>
```

- **exit 1**（由 9 项既有 Windows symlink `EPERM` 解释）。
- 窗口：约 `2026-11-05T11:19:23+08:00 → 11:24:02+08:00`（以 `duration_ms` 为准）；`duration_ms` **278,954.5**。
- **计数：tests 4,130 / pass 4,103 / fail 9 / cancelled 0 / skipped 18 / todo 0**。
- 文件集：**456**（457 − 1）；10 个目录 glob 覆盖全部非 pi 测试目录，pi-adapter 用 40 个显式文件（含新增 `governance-matrix-context.test.ts`），无重复/遗漏。
- 原始输出：`/tmp/b0v2-ebbc2fc/t2-t3-full.log`。

## 3. 失败清单（逐名）与分类

| # | 文件:行 | 用例 | 分类 |
| --- | --- | --- | --- |
| 1 | `test/claude-adapter/session.test.ts:639` | native symlink and storage runtime mismatch fail before SDK query | 既有 Windows symlink `EPERM` |
| 2 | `test/codex-adapter/session.test.ts:351` | native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary | 既有 Windows symlink `EPERM` |
| 3 | `test/pi-adapter/injected-runtime.test.ts:185` | store validate callback rejects directory symlink before Pi parse or new native write | 既有 Windows symlink `EPERM` |
| 4 | `test/pi-adapter/injected-runtime.test.ts:193` | Pi storage refuses file symlink and role/runtime mismatch without touching other storage | 既有 Windows symlink `EPERM` |
| 5 | `test/runtime-core/file-write-safety.test.ts:97` | D3 linked workspace root remains usable; linked target itself is not replaced | 既有 Windows symlink `EPERM` |
| 6 | `test/runtime-core/session-store.test.ts:46` | store: traversal, mismatched scope and symlinked runtime directories rejected | 既有 Windows symlink `EPERM` |
| 7 | `test/runtime-core/session-store.test.ts:58` | store: native validation stays lazy and native symlink is rejected before effects | 既有 Windows symlink `EPERM` |
| 8 | `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` | 读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛 | 既有 Windows symlink `EPERM` |
| 9 | `test/编排/shell-authorized-routine.test.ts:184` | node test外指符号链接路径不获委托；项目内测试路径获委托 | 既有 Windows symlink `EPERM` |

- 错误码取证：**9/9** 均输出 `EPERM: operation not permitted, symlink …`（`errno: -4048`、`code: 'EPERM'`、`syscall: 'symlink'`）。
- **D-04**：`test/测试/entry-role-minimal-d.test.ts:253` 在本轮 T3 中为 **✔ pass**（未复现，符合 B0 v3 的已声明改进）。
- **C3 `.probe` 审计修复已生效**：`test/编排/governance-matrix-injection.test.ts` 793 行 / SHA-256 `1b8c4b56…`（`grep -c probe` = 0）；T3 中 `test/测试/g4-skill-verify/h-scope-audit.test.ts` 通过（无该审计失败）。
- 未出现任何 AssertionError/其它非 EPERM 失败；未出现 skip 变化。

## 4. 与 B0 v3 对照结论

| 判据（B0 v3） | 期望 | T2 实测 | 结论 |
| --- | --- | --- | --- |
| 既有失败 | 恰 9 项 Windows symlink `EPERM`（v2 清单去掉 D-04） | 9 项，逐名同 B0 v3 清单 | **一致** |
| D-04 复现 | 不得复现（复现即停止） | 未复现（✔ pass） | **一致（已声明改进）** |
| 新增确定性失败 | = 0 | 0（无其它失败/形态变化） | **通过** |
| skip | = 18；新增 = 0 | 18，新增 0 | **通过** |
| todo | = 0 | 0 | **通过** |
| write-sequencing | 排除、未运行、未验证 | 排除 | **一致** |
| tests / pass | 无固定值（基线 4,036 / 4,009；实现新增测试应计入） | 4,130 / 4,103（+94 / +94） | 计入本特性新增测试（9 个新测试文件 + `list-project.test.ts` 增量）；失败/跳过不变 |

**T2 结论（证据层）**：`typecheck exit 0`；T3 全量失败集合恰为 B0 v3 的 9 项既有 Windows `EPERM`；**新增确定性失败 = 0、新增 skip = 0**；D-04 未复现。T2 通过（证据层，最终判定归独立验收 E2）。

## 5. 候选文件 SHA-256（29 项）

命令：`sha256sum <下列文件>`（工作区；未暂存）。`git hash-object` 抽样见 §1/§6。

| 文件 | SHA-256 |
| --- | --- |
| `src/common/门禁引擎/governance-roles.ts` | `f5eb643509196cfa6cc5ee6c97b7c90fdc7b8adb7ec7eb6d8fe2db9227a536d1` |
| `src/common/pi-adapter/real-adapter.ts` | `7e0a2c0a39072bba5df0172ac466411d07d05746b63f2182d028ae1d15b6deb1` |
| `src/model/runtime.ts` | `20af24789bcdcd4d2f2f26d3d0bb648a6a8a6ca9fab18935455e77b2a7fd99bd` |
| `src/pipeline/orchestration/run-role.ts` | `22a292dba48227d1e35a029e2a403254514b4cfc11e345ef96072d340efe28ce` |
| `src/provider/claude/session.ts` | `6db0c08448c43867a8c1bc742e89bc6d850b1bd468548dd96ff2de183aa3abbe` |
| `src/provider/codex/session.ts` | `4cdfe6f87ea03dc05e5a73316f903f6120f0e6eae4116e71e2922d6d526141b4` |
| `src/provider/pi/session.ts` | `d5421cd9b878e6a8f399517b2fd7c060e64ad03447aa20722fdd497d6a5b96bb` |
| `src/provider/runtime/schema.ts` | `34ae96fff8a08809f9873b42fd6006b4d270c570a91b4fa9cd7d45e467ccc52d` |
| `src/provider/runtime/tools.ts` | `5418f8ff8dcddb61b3ed1c9331cfe7e58ddc8e619261103927112aaa9ee52fca` |
| `src/service/role/resolve-role.ts` | `9c169797ff017f8c8b6b69ff133c6fa179b142ff3cddd3b123964a2e534f27fd` |
| `src/service/runtime/session.ts` | `23228c82c4e299146bfe6588c718813747460a00e8c0cc7326effb51f67ed950` |
| `src/common/门禁引擎/role-card-sections.ts` | `7e489100e29bf69fa529f80f4b3e415202941c1d4b6ed3ddcb7d50144d909e90` |
| `src/model/governance-matrix.ts` | `882670e83260b6fe5d51a857ccb87017c5abd68a8423f96e29b50d6c31b3eace` |
| `src/service/governance-matrix/impl/builder.ts` | `eff87299f6c9ee61f12ffebba8ae75299e5b3b0832863b1842fc973aba79989c` |
| `src/service/governance-matrix/impl/limits.ts` | `e8222cbe67fb1f45905d755599c2b30288f38483728c88638429fae3f41e677e` |
| `src/service/governance-matrix/impl/renderer.ts` | `98b160bbc607cff5f65519e1a48fe555b416acc6fc422c6dac78f151ee0e10ee` |
| `src/service/governance-matrix/impl/routing.ts` | `ad3d2d53eed1fe0139b88d354f986f2e724900a7815a9ebe3d28eee4efbc7946` |
| `src/service/governance-matrix/impl/sanitize.ts` | `243b11bd6599564f4f592d8122daa576850dd24a12e7af67560a0f8cdd745918` |
| `src/service/governance-matrix/public.ts` | `d02250c1c29dd329d93a0e6a936dcc0d9421a38a5ebafdd64dcee03705f3c73e` |
| `test/门禁引擎/list-project.test.ts` | `74abf4c4bdb26c4ee1320b67e477d765f88526c33561e5283937a4ecf5828d8e` |
| `test/测试/governance-matrix-integration.test.ts` | `f1b98dc8804ed4685e435ffac859b46d78c848dbed45a6230ae540cb9def9c86` |
| `test/编排/governance-matrix-injection.test.ts` | `1b8c4b564c9b6c217cc008160037cc1515109ac6238c5feb56ffe7c7aceda589` |
| `test/门禁引擎/governance-matrix-service.test.ts` | `b9cd0a97759e5d860f25bdf3a31d08d21db070aaf1e6ff2b8f13f8cb64b60716` |
| `test/门禁引擎/governance-matrix.test.ts` | `8154b101c7c2ed7fa9b6fd8dd1612428554a463fc44ff6947d3830dd91be42a5` |
| `test/门禁引擎/role-card-sections.test.ts` | `b7254d80b687058ef8f68264af05fdea59a964075082c9b54d345538b2735de2` |
| `test/claude-adapter/governance-matrix-context.test.ts` | `947c55522eedd626b2cfbebf4bae7e581949d86a41b72391a5994a942fc481f3` |
| `test/codex-adapter/governance-matrix-context.test.ts` | `1a00e70bb404d64c8f378e93473717892ee95dbf77727e6afcb242740a633b69` |
| `test/pi-adapter/governance-matrix-context.test.ts` | `2ecb4fbf05d300313e5a9d42475e7a8f41b4315309d0786ee5079ba7f0634611` |
| `test/runtime-core/governance-matrix-tool.test.ts` | `d3bcb5b5b6ecb59d10e3b9b0c3cad03e68ca05d0ae14ff18ebccd7323f198c73` |

`git hash-object`（关键文件）：`test/测试/governance-matrix-integration.test.ts` = `527e9084be299fd117e1583e6008d31a484b6246`；`test/编排/governance-matrix-injection.test.ts` = `ba16015aa05f9af5f2056af8ed2c6b0f67762c7a`；`src/model/governance-matrix.ts` = `1b1f6fdbb11bc96454ed0845124157f89c90276b`；`src/service/governance-matrix/public.ts` = `132b31bb51a180fb5659c0bfc78eb5a274038d77`；`src/pipeline/orchestration/run-role.ts` = `f8ae4e869a7d3df67140c4bf16b70dde4cac949b`；`src/provider/runtime/tools.ts` = `693b2562dd9ba99b9c08a7c640b7236e17e0f48d`；`src/provider/runtime/schema.ts` = `60df628e72e9711485c673e6a1d950b53bf6e723`；`src/service/role/resolve-role.ts` = `053688ee870cc7c463fdda3a1f96e22a6946a14e`；`src/model/runtime.ts` = `3ac2b8e0e40d5607280904d2a185af1a7b306b92`。

## 6. 证据位置与限制

- 原始日志（本机临时目录，不入库）：
  - `/tmp/b0v2-ebbc2fc/t2-typecheck.log`
  - `/tmp/b0v2-ebbc2fc/t2-t3-full.log`
  - 候选状态快照：`/tmp/b0v2-ebbc2fc/t2-status-src-app-test.txt`（SHA-256 `839b922f…`）
- 本记录不是验收结论；T2 通过仅表示当前候选在 T3 口径下满足 B0 v3 判据与 typecheck。E2 由内置独立验收按 V1 判定。
- 候选为**未提交工作树**；若 T2 后任何 `src/ app/ test/` 文件变化，受影响证据失效，需重跑。
- 未使用截图/录屏（本特性无 UI 变更；截图非必需、禁止录屏）。
