---
id: v1.8.1-release-prepare-20261031
type: change
title: v1.8.1 发布准备：冻结源 888cd86、版本与发布说明切换
created: "2026-10-31"
updated: "2026-10-31"
timezone: Asia/Shanghai
status: preparing
related: []
events:
  - date: "2026-10-31"
    kind: created
    summary: 客户决定发布 1.8.1（未签名 ZIP，同 v1.8.0 形态）；版本 1.8.0→1.8.1；README 当前版本/下载表/要点 → v1.8.1
  - date: "2026-10-31"
    kind: verified
    summary: 本地预检 npm run typecheck 0、npm run typecheck:renderer 0、装配测试 86/86 通过
  - date: "2026-10-31"
    kind: updated
    summary: PR #26 合并（72454c7）；annotated tag v1.8.1 已打并推送；release-policy/workflow/打包测试切到 v1.8.1
---

# v1.8.1 发布准备

客户决定发布 **1.8.1**、**未签名 ZIP**（同 v1.8.0 形态）。本轮准备发布源、版本标识与发布说明；`release-policy`、`.github/workflows/release.yml` 与 `test/装配/release-packaging.test.ts` 的流水线切换在 tag 确定后的后续提交完成（`ci(release): point pipeline at v1.8.1`）。本记录随发布进展更新；最终 CI/资产/SHA 在完成后填入。

## 版本与冻结源

- 版本 1.8.0 → **1.8.1**（patch）。`package.json` 与 `package-lock.json` 仅根两处版本字段，依赖与锁结构零变动。
- 发布源（冻结源）：**`888cd86`**（`fix(governance): make card-kind rejections actionable and clarify acceptance-card ownership`，即 v1.8.0 之后第二波可靠性改进的收尾提交；自 v1.8.0 tag `6211e08` 起 27 个提交，含 §5A/P0/P1/P2/P3、图片预算移除与该收尾修复）。
- annotated tag **`v1.8.1`**：已打并推送，指向 PR #26 合并提交 **`72454c77a930f0231ea58ca8235043b03fe117b3`**。
- 发布准备提交：**`2b413cb`**（`chore(release): prepare v1.8.1`，PR #26）；流水线切换提交：`ci(release): point pipeline at v1.8.1`（本轮）。

## 本轮变化（相对 v1.8.0）

- **意图入口契约可见（§5A）**：四卡（chief/product/rapporteur/nominator）与只读 `contract_check` 暴露 frontmatter 模板与 `docs/intents/<intentId>.md` 命名规则；任命/申请路径显式携带 intentId（请求→提案→产品→flow-id 回落且如实标注 source）；产品/提案冲突与请求显式冲突 fail-closed（`intent-ambiguous`）；拒绝文案附同源模板。
- **投递与会话收尾不变量（P0）**：turn lease/origin 不被失败投递覆盖；settled 按 turnId 兜底清 busy（迟到旧 turnId 保护）；`delivery.end|failed` 恰一次；idle-busy 自愈；**停止强制解开 target-busy 楔死**；队列 `ageMs/headKind/blockedReason/activeTurnId` 可见；看护告警 UI-only 旁路；重启恢复持久队列恰投一次。
- **请求级超时与 SDK 诊断（P1）**：首字节 90s / 流空闲 300s（可注入；交互/工具/abort/离线期间暂停计时）；SDK `api_retry` 接入诊断且期间 ANS 不并发重试；超时终态 `failed` + `request-timeout-first-byte|idle` + 人话系统行。
- **网络状态监听（P2）**：主进程 `net.isOnline` 权威 + 5s 采样；`powerMonitor`（锁屏≠离线）；1s 稳定窗口/连续 2 次离线防抖；离线安全暂停（P1 deadline）与 5min 恢复窗口，超窗 `network-offline-timeout`；队列 `blockedReason:"network"`；会话头状态行；探针异常保持已知状态（三态 unknown 不迁移）。
- **仅 replay-safe 同回合重试（P3）**：仅在无文本/thinking/工具/客户交互时重试；3 attempts、1s/2s/4s、10min 预算（发起前与退避后双护栏）、取消优先；耗尽 `MODEL_REQUEST_RETRY_EXHAUSTED` + 人话短报；整轮恰一条 settled/handback；离线不重试。
- **验收卡归属与三段式指引**：验收卡只由质检（verifier）发起；运营/幕僚等其他角色越权发卡时拒绝文案给出卡种→发起角色映射与改派方式（`888cd86`）；chief/convener 角色卡措辞同步明确。
- **图片预算移除**：`view_image` 取消每轮 4 张/20MB 预算（保留单图 10MB/Claude 5MB 上限），同轮多图不再被运行时预算拒绝。
- 旧 v1/v2/v3 计划、流程与角色卡仅作历史兼容。

## 本轮改动文件

- `package.json`、`package-lock.json`：仅版本字段 1.8.0 → 1.8.1。
- `README.md`、`README.en.md` 发布区：当前版本改为 v1.8.1（2026-10-31 发布）；下载表与校验链接全部指向 v1.8.1 资产；SHA256 改为「发布后由 SHA256SUMS 回填」；要点更新为本版内容；发布记录链接指向本文件。
- 本文件。
- 未改（按任务留给下一轮）：`src/common/装配/release-policy.mjs`、`release-policy.d.mts`、`.github/workflows/release.yml`、`test/装配/release-packaging.test.ts`。

## 本地预检

2026-10-31，Node v24.22.1 / npm 11.19.1，工作树 `release-v1.8.1`（`888cd86` 加本轮未提交改动）。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run typecheck` | 0 | `ans-cli@1.8.1`，`tsc --noEmit` 无诊断 |
| `npm run typecheck:renderer` | 0 | `tsc -p app/renderer/tsconfig.json` 无诊断 |
| `npm run test:assembly`（`node --test "test/装配/**/*.test.ts"`） | 0 | 86 tests / 86 pass / 0 fail / 0 skip |
| `npm run build:renderer` | — | 未执行（同 v1.8.0 准备轮口径） |
| `node src/common/装配/release-prepare.mjs`（prepare 预演） | — | 未执行（tag v1.8.1 尚未创建，下一轮执行） |

## 发布配方（下一轮）

- `src/common/装配/release-policy.mjs`：`SOURCE_REF='v1.8.1'`、`SOURCE_SHA=<tag v1.8.1 指向的合并提交 SHA，下一轮填入>`；白名单保持基础集与历史保留条目，未列名 `app/`/`src/` 仍 fail-closed。
- `src/common/装配/release-policy.d.mts`：字面量与 `.mjs` 同步。
- `test/装配/release-packaging.test.ts`：`SOURCE_REF`/`SOURCE_SHA` 断言切到 v1.8.1 与对应 SHA；v1.8.0 批次用例保留为历史；断言不放宽。
- `.github/workflows/release.yml`：workflow_dispatch `source_ref` 默认、并发组、`gh release view/create/upload/edit`、标题与 notes 全部 → v1.8.1；未签名沿用 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`；`publish` 默认仍为 false（draft）。
- 上述切换已随本轮提交完成（tag v1.8.1 = `72454c7`）；prepare 预演（overlayPaths/actualTree/overlayPatchSha256）以 CI 构建产生的 provenance 为准，随发布回填。

## CI、资产与 SHA（待回填）

- 三平台 CI run：**待触发/待回填**；不编造 run id。
- 资产：`ANS-Studio-1.8.1-mac-arm64.zip`、`ANS-Studio-1.8.1-mac-x64.zip`、`ANS-Studio-1.8.1-win-x64.zip`，以及各平台 `SHA256SUMS-*.txt`、`SHA256SUMS-overlay.txt`、`release-provenance.json`、`overlay.patch`；SHA256 在构建完成前未知，**未预填**，发布后由 Release 校验文件回填/核对。
- 三平台运行包**未签名、未公证**（同 v1.8.0 形态）。

## 证据边界

- 本轮只做版本字段、README 发布说明与本记录，并运行本地 `typecheck`、`typecheck:renderer` 与装配测试；未运行全量测试、`build:renderer`、prepare 预演，未触发 CI，未下载或启动 ZIP。
- 第二波全量与波终态验收证据见 `docs/acceptance/2026-10-30_wave2-turn-retry-network-watch-final-acceptance-report-v1.md`（77 行 / `e6d51526…`）等；三平台构建 / 解压 / 启动 smoke 仍由 CI 原生 runner 执行。
