---
id: v1.9.2-release-prepare-20261104
type: change
title: v1.9.2 发布准备：输入区按钮精简与幕僚回复去折叠
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: released
related: []
events:
  - date: "2026-11-04"
    kind: created
    summary: 客户决定发布 1.9.2 版（补丁版）；版本 1.9.1→1.9.2；README 当前版本/下载表/要点 → v1.9.2
  - date: "2026-11-04"
    kind: verified
    summary: 本地预检 npm run typecheck 0、typecheck:renderer 0、装配测试 88/88 通过；完整 T3 串行回归 3636 tests / 3609 pass / 9 fail（仅既有 Windows symlink EPERM）/ 18 skip（既有平台基线）
  - date: "2026-11-04"
    kind: updated
    summary: PR #54 合并（1eba711，含 prepare f2a34f1）；annotated tag v1.9.2 已打并推送（tag 对象 a63b67f，指向 1eba711）
  - date: "2026-11-04"
    kind: verified
    summary: pipeline 钉版本轮完成并本地验证——node --test 装配 88/88、npm run typecheck 0
  - date: "2026-11-04"
    kind: verified
    summary: 发布 run 41782510931 三平台 build 与 release job 全 success；Release v1.9.2 已创建并上传 12 资产（公开、非草稿、非预发布）
  - date: "2026-11-04"
    kind: updated
    summary: README 中英 SHA256 表回填（5 项）；本记录 status→released
---

# v1.9.2 发布准备

客户已授权发布 **1.9.2 版（补丁版）**（同前几轮形态：未签名 ZIP）。本轮只做发布准备：版本标识、README 发布说明与本记录，并按 v1.9.1 阻断教训执行发布前全量预检（双端 typecheck + 装配测试 + 完整 T3 串行回归）。打 tag、流水线钉版与发布 workflow 在后续轮次完成。prepare PR 合并提交与 tag SHA 待下一轮回填。

## 版本与冻结源

- 版本 1.9.1 → **1.9.2**（patch / 补丁版）。`package.json` 与 `package-lock.json` 仅根两处版本字段（`package-lock.json` 的根 `version` 与 `packages[""].version`），依赖与锁结构零变动。
- 发布源（冻结源）：`origin/main` 当前 **`70ebb3e29023b7570b6d5216e0567adddce34881`**（`Merge pull request #53 from wangzhongren/release/v1.9.1-assets`），包含自 v1.9.1 以来的两项 UI 修复：
  - PR #51 `fix/composer-buttons`（提交 `28b41e85a6640db2407ab7d434ad63986639ba5d`，文档 `911939fce814d0881b7f11654971fa76d35e1bac`，合并 `4ce987cd64614f900bf121067d0f4ef0639a9412`）：输入区按钮精简——移除发送按钮（Enter 发送保留），停止本轮改为纯图标按钮；
  - PR #52 `fix/unfold-reply`（提交 `645c2222c54d4d2e7b438b648830c7b42f79de72`，文档 `a335dfbafb7ac2cc0ea8e004667af492f4d43870`，合并 `add6559bc59f6cca5da26f6cc9005bd7947d19a0`）：幕僚回复去折叠——settled 与回放均原文直显，task-request 折叠保留。
- prepare PR #54 合并提交 **`1eba7118b46cc9a279c42351a8511e3c9fcc12b7`**（含 prepare 提交 `f2a34f1976a9d182ceb3d8e5a41e395b56e803dc`）；annotated tag **`v1.9.2`**（tag 对象 **`a63b67f7a172bff83b10802b0365ed2ffa21fb5f`**）已打并推送，指向 `1eba711`，此后不可移动。
- 发布准备提交：**`f2a34f1`**（`chore(release): prepare v1.9.2`，PR #54）；流水线切换提交：`ci(release): point pipeline at v1.9.2`（本轮）。

## 本轮变化（相对 v1.9.1）

- **输入区按钮精简**（PR #51）：移除输入区「发送」主按钮（Enter 发送、Shift+Enter 换行保留；发送失败提示、拒发恢复草稿、指令抑制、会话补开等 `send()` 全链路不变）；「停止本轮」由文字按钮改为 28×28 纯图标按钮（方块图标，title/aria-label 复用既有「停止本轮」文案；空闲隐藏、进行中可见、请求中禁用语义不变）；零新增 i18n key、零主进程/preload/src 改动（渲染层 Composer/test-driver 与冒烟脚本，+51/−33 含新增测试）。证据见 `角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-implementation.md`（typecheck 0、build 0、UI 404/404、phase4b smoke 69/69、真实 Electron 探针 before 16/16 → after 16/16）。
- **幕僚回复去折叠**（PR #52）：删除 `applyFoldToRow` 的 assistant 折叠分支（不再生成 `details.reply-original` 与「本轮交付处理回复原文（展开）」行）；settled 与会话回放一律原文直显；user 行 task-request 折叠、报告卡/交付卡/证据/回执/工具组折叠不变；`reply-original` 历史渲染与 i18n 常量保留以兼容旧快照。证据见 `角色卡/桌面UI/docs/change/2026-11-04_unfold-reply-implementation.md`（typecheck 0、build 0、UI 403/403、phase4b smoke 72/72、探针 before 6/6 → after 6/6）。
- 其余能力与 v1.9.1 相同。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.9.1 → 1.9.2。
- `README.md`、`README.en.md` 发布区：当前版本 v1.9.2（2026-11-04 发布）；下载/校验链接指向 v1.9.2 资产；SHA256 表按先例留待发布后回填（中文「发布后回填」、英文 "filled in after release"，不预填、不虚构）；要点补充上述两项内容；发布记录链接指向本文件。
- 本文件。
- 流水线钉版（本轮）：`.github/workflows/release.yml`、`src/common/装配/release-policy.mjs`、`src/common/装配/release-policy.d.mts`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-11-04，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.2-prepare`（基于 `70ebb3e` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.9.2`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `node --test "test/装配/**/*.test.ts"` | 0 | 88 tests / 88 pass / 0 fail / 0 skip（duration ≈ 6.1s） |
| 完整 T3 串行回归（405 个 `.test.ts`，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`） | 1（仅既有失败） | 3636 tests / 3609 pass / 9 fail / 0 cancelled / 18 skip / 0 todo（duration ≈ 268.1s） |

T3 全量口径与排除方式：按验收标准以 `node --test --test-concurrency=1` 串行覆盖全部 405 个测试文件，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`（文档化挂起项，不得静默跳过）。本机以字面目录 glob 分片（10 个目录）加 `test/pi-adapter/` 除该文件外的 39 个显式文件清单传入同一命令（替代 `$(find ...)` 运行时替换的等价写法），文件集合与排除口径不变、可复现。

失败分类说明：9 项失败全部为既有 Windows symlink `EPERM`（`fs.symlinkSync` 在 Windows 无符号链接权限时失败，与最近基线 9 项名单一致；涉及 native/Pi 存储 symlink 校验、D3 链接工作区、读取器对抗用例与 shell-authorized-routine 外指链接用例）；18 项 skip 为既有平台条件跳过（与基线约 18 项一致）。**新增确定性失败 0、新增 skip 0**，满足进入 PR/tag 的门槛。装配测试中的 `release-packaging.test.ts` 在 prepare 轮仍断言当时流水线的 `SOURCE_REF='v1.9.1'`（pipeline 轮切换，见下），prepare 轮如常通过，无预期失败；未删除测试、未放宽断言。

## 流水线钉版（本轮，基于 tag v1.9.2 / 1eba711）

2026-11-04，Node v24.22.1 / npm 11.19.1，工作树 `release/v1.9.2-pipeline`（基于 `1eba711` 加本轮改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node --test "test/装配/**/*.test.ts"` | 0 | 88 tests / 88 pass / 0 fail / 0 skip |
| `npm run typecheck` | 0 | `ans-cli@1.9.2`，`tsc --noEmit` 无诊断 |
| `grep -n "1\.9\.1" .github/workflows/release.yml` | 0（1 行匹配） | 仅命中发布 notes 中按要求保留的对照句「其余能力与 v1.9.1 相同」；source_ref 默认、并发组、`gh release view/create/upload/edit` 引用均已切到 v1.9.2，无其他 v1.9.1 字面量 |

说明：发布 notes 按发布说明需要保留「其余能力与 v1.9.1 相同」对照句，因此该 grep 仅命中 notes 一行；source_ref 默认、并发组与全部 `gh release` 引用等管线字段均无 v1.9.1 字面量。`release-policy.mjs` 的 `SOURCE_REF`/`SOURCE_SHA`、声明字面量与打包测试均随本轮切到 v1.9.2；overlay 重置为基础集（无产品/测试条目；v1.9.1 阻断修复的 i18n allowlist 条目随冻结源吸收、归档为「历史」注释）。`release-policy.d.mts` 字面量同步；打包测试中 v1.9.1 阻断修复用例按先例改为「已随冻结源吸收、回到 excluded」，断言不放宽。

## 发布配方（本轮实际做法）

- `release-policy.mjs`：`SOURCE_REF='v1.9.2'`、`SOURCE_SHA=<tag 合并提交 SHA>`；overlay 重置为基础集（无产品/测试条目；v1.9.1 阻断修复的 i18n allowlist 条目随冻结源吸收，归档为「历史」注释）。fail-closed/excluded 机制不变。
- `release-policy.d.mts`：`SOURCE_REF`/`SOURCE_SHA` 字面量同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.9.2；v1.9.1 阻断修复用例按先例改为「已随冻结源吸收、回到 excluded」，断言不放宽。
- `.github/workflows/release.yml`：source_ref 默认、并发组、`gh release` 引用、标题与 notes → v1.9.2；`publish` 默认保持 `false`。

## 证据边界

- prepare 轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer`、装配测试与完整 T3 串行回归；pipeline 轮只改发布策略/声明、打包测试、release workflow 与本记录，并运行本地装配测试与 `typecheck`。两轮均未运行 `build:renderer`、未做 prepare 预演，未在本地触发 CI。
- 两项修复的产品验证证据沿用（不重跑），见上文各自实施记录；完整回归与三平台构建由发布 workflow 作为独立门执行，结果见下节。

## CI、资产与 SHA（已回填）

- **发布 run**：`41782510931`（https://github.com/wangzhongren/ans-studio/actions/runs/41782510931），conclusion success；三个 build job（macos-15 arm64 / macos-15-intel x64 / windows-2025 x64）与 release job 全 success。备注：`gh run watch` 两次因 GitHub API 网络 EOF 中断，随后以单次状态查询确认 run success；run、tag 与产物不受影响。
- **Release**：https://github.com/wangzhongren/ans-studio/releases/tag/v1.9.2（公开、非草稿、非预发布）。
- **资产（12）**：`ANS-Studio-1.9.2-{mac-arm64,mac-x64,win-x64}.zip`、`manifest-{darwin-arm64,darwin-x64,win32-x64}.json`、`SHA256SUMS-{darwin-arm64,darwin-x64,win32-x64,overlay}.txt`、`release-provenance.json`、`overlay.patch`。
- **SHA256（与 Release SHA256SUMS 逐字一致，README 已回填）**：
  - mac-arm64 zip `fabe55a62848fdab25be0759e4c6cf0ade71aaa392c7cbe9c1ec2313f79c6322`；
  - mac-x64 zip `9039b9ba241622d2a060e2b69654ae6d11e94fb88fa50f04577289a51e6293ff`；
  - win-x64 zip `b1bc3c3d52a757799a53d1ef9ba6d9804b4bcc6256ae37553a59f8d91cab7df4`；
  - overlay.patch `b5cf42415fa1a69ea9e525594c73f34c3bc878e78aa2e989fc1eac99c879c0a9`；
  - release-provenance.json `fbc3453aa50038fa2f54624d5fc032c0d38731c8a6c37948ac143baf39303592`。
