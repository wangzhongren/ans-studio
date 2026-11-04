---
id: download-requests-b1-supplement-v1
type: change
title: 变更记录：下载文件申请 B1 补证 v1（AC-12/AC-13/AC-14 执行证据）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: implemented-unverified
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 按 E2「证据不足」补 AC-12/13/14 执行证据（只改 test/编排 与 B1 写集内最小测试缝；未 commit/push）
---

# 变更记录：下载文件申请 B1 补证 v1（AC-12/AC-13/AC-14）

- **角色/节点**：编排（Orchestration）/ `2026-11-04-download-requests` / B1 补证（E2 反馈）。
- **状态**：**implemented-unverified**——补证测试与最小测试装配缝已落地；未 commit/push；未改其他角色/桌面/渲染/边界/治理文档。
- **基线**：工作区 `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\download-requests`；HEAD **`d2fc7a3ad4c21b88bfd1c0859300df3ed693f910`**；开工/收尾 `git status --porcelain -- src app test` 仅本补证写集（`04-status-final.txt`）。
- **E2 依据**：`docs/acceptance/download-requests-report-v1.md`（192 行 / `8f356057…`）§3.1–3.3；要求补 AC-12/13/14 的**执行证据**，不以字段齐全代替行为。
- **B1 前置证据**：`2026-11-04_download-requests-B1-implementation.md`（162 行 / `6aa64dfd6e6993c1326e26336c54bdebcd0904a835e6aa7ec1f68866e6ecb034`）；本补证在其上增量，不改变已冻结契约。

## 1. AC-12：rename/写盘失败故障注入

**最小产品改动（B1 写集内，仅测试装配缝）**：
- `src/provider/download/impl/file-sink.ts`：新增 `DownloadSinkHooks`（`rename?` / `beforeWrite?`）与 `createDownloadSink(projectRoot, requestedFileName, hooks?)`；默认路径**不变**（无 hooks 时仍调用共享 `renameReplacingExisting` 与正常 `handle.write`）。
- `src/provider/download/impl/node-http.ts`：`NodeDownloadTransportOptions.fileSinkHooks?`（仅 impl 测试工厂；**生产 `createNodeDownloadTransportProduction()` 无参数、不暴露**）；传给 sink。另把 `end` 与在途 `sink.write` 串行化（`pendingWrite`），避免 commit 与写盘竞态；正常成功/失败语义不变。
- **不弱化生产路径**：公共 `download-provider.ts` 不导出 `DownloadSinkHooks`/`createDownloadSink`；生产 capability 无法注入。

**测试（`test/编排/download-provider.test.ts`）**：
1. `AC-12 故障注入：rename 失败 ⇒ download-write-failed；清理 temp/占位，既有同名文件字节不变`
   - 夹具：`download/file.bin` = `OLD-BYTES`；服务返回 `NEW-BYTES`；注入 `rename` 抛 `EIO`。
   - 断言：`ok:false`、`code:"download-write-failed"`；目录仅 `["file.bin"]` 且内容仍 `OLD-BYTES`；无 `.part`、无 ` (1)` 占位。
2. `AC-12 故障注入：写盘失败 ⇒ download-write-failed；无 .part/占位/半成品`
   - 注入 `beforeWrite` 抛 `EIO`。
   - 断言：`ok:false`、`code:"download-write-failed"`；`download/` 目录为空（无占位/`.part`）。

原始输出见 `02-orchestration-suite.log` / `03-download-tests.log`（测试名逐字）。

## 2. AC-13：`download/` 为 Windows junction ⇒ 拒绝

**测试（`test/编排/download-provider.test.ts`）**：`AC-13：download 为 Windows junction ⇒ download-write-failed，不跟随/不写目标目录`
- 用 `cmd /c mklink /J <project>/download <temp-target>` 创建 junction（Windows 无需特权；本机实测成功，`lstat().isSymbolicLink()===true`）。
- 真实 `createNodeDownloadTransport()`（无文件系统 seam）请求本地 200 服务。
- 断言：`ok:false`、`code:"download-write-failed"`；目标临时目录为空（未跟随写入）；junction 仍为链接（未被替换）。
- 环境不可用 junction 时测试使用普通文件占位并 `t.diagnostic` 如实记录（仅作为非目录拒绝的替代覆盖，不冒充 junction 通过）；本机日志显示 junction 路径已执行（无 diagnostic）。

## 3. AC-14：`forever`/`session` 预授权重复命中

**测试（`test/编排/download-pipeline.test.ts`）**：`AC-14：forever/session 预授权两次下载均命中（无卡片/无消费）；downloads.jsonl 两条/各 by directive+directiveId`
- 真实 `CustomerDirectiveRuntime`（内存 `DirectiveStore` + `downloadEpochStore`）：提交 `domain=forever.example.com until=forever` 与 `domain=session.example.com until=session`（`acknowledged:true` 满足高危）。
- Pipeline 测试工厂注入 `takeDownloadDirective: directives.takeDownloadDirective`；同 host 各下载两次（共 4 次）。
- 断言：4 次全部 `ok:true` 且 `approval.kind==="directive"`；`presenterCalls===0`（无卡片）；`transportCalls===4`；`download.decided` 4 条，均 `by:"directive"`、`presented:false`、无 `requestId`、`directiveId` 为 `d-*`；两个 host 对应两个不同 `directiveId`；`download.completed` 4 条；无 `download.failed`。
- `forever` 未被消费：再次 `takeDownloadDirective` 仍返回同一 `forever` 指令（`scope:"forever"`）。`session` 同两次命中；`once` 的单次语义由既有 `customer-directive.test.ts` 覆盖（本补证不重复）。

## 4. 验证

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | **exit 0**（`01-typecheck.log`） |
| `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | **64 文件 / 803 tests / 802 pass / 1 fail / 0 skipped / 0 todo**（`02-orchestration-suite.log`）；唯一 fail 为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:184`） |
| 四个下载测试文件 | **43 tests / 43 pass / 0 fail / 0 skip**（`03-download-tests.log`） |
| B1 前置对照 | 64 文件 / 799/798/1/0 → 803/802/1/0；新增 4 tests（AC-12 2、AC-13 1、AC-14 1）全部 pass；**新增确定性失败 0、新增 skip 0** |

## 5. 候选哈希（本补证 4 文件）

见 `...-B1-supplement-v1-evidence/05-candidate-hashes.txt`（`git hash-object` + `sha256sum`）：

| 文件 | git hash-object | sha256 |
| --- | --- | --- |
| `src/provider/download/impl/file-sink.ts` | `e0f39cf138f01c2d3e0da04f99975b6dcda1662f` | `24bd9294b73b72688a54fe837f30224b3381071b9852dda144920472bd0000ea` |
| `src/provider/download/impl/node-http.ts` | `488db2cc64506f695ca3789b8c4bccb9c4d544e9` | `a4074481dda97250a728c5c85156a2c7fb51111dbf119cc6e8f7a181faaafa07` |
| `test/编排/download-provider.test.ts` | `95fc37ad89977ce00779422110790b5894586922` | `4e2bf68210e3d9647d77ea9f276339f142d52e279cf77ce86c7d9e5076aad557` |
| `test/编排/download-pipeline.test.ts` | `f89bfb0a64a2607fd26571ebb3bc0ddd11679331` | `07b9e53940d19aa35690094c80673c00d7bd4ab81539398ce8dcbb849eafaaf5` |

证据索引：`...-B1-supplement-v1-evidence/INDEX.sha256`（见目录）。

## 6. 约束与残余

- 未 commit/push；未改 A1/A2/桌面/渲染/其他角色文件、boundary/changelog、`docs/scheduling|acceptance|communication`。
- 生产路径无新增可注入能力：`DownloadSinkHooks` 只在 impl/测试工厂；公共出口不导出。
- 未跑全量 T3/真实 Electron（D1/D2 仍归测试角色）；本补证仅补 AC-12/13/14 的 B1 执行证据。
- **并发污染披露（如实）**：补证过程中一次 `git status --porcelain -- src app test` 捕获到非本角色修改 `test/测试/download-requests-electron-probe.mjs`（测试角色 D2 探针，非本角色写集）；该行保留于 `04-status-transient-concurrent.txt`。**本上下文未读写该文件**；随后的收尾 status/diff 已不含它（当前 `04-status-final.txt` 仅本补证 4 文件）。E1/E2 如需以该探针为候选，应由测试角色确认其时点。
