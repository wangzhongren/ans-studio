---
id: download-requests-p1-proposal
type: change
title: 下载文件申请 P1 实现提案（项目管理 A2：i18n key 契约）
created: "2026-11-04"
updated: "2026-11-04"
timezone: Asia/Shanghai
status: proposal-only
related: [download-requests]
events:
  - date: "2026-11-04"
    kind: created
    summary: 写项目管理侧 P1 实现提案（proposal-only；原 37 个 i18n key、精确写集、测试与 AC-19 映射、五份提案的审核准备）
  - date: "2026-11-04"
    kind: revised
    summary: Revision 1：按 P1 审核（needs revision）加 G1 A .gitignore 提示、mechanical 五项、完成回执 finalUrl、删除 downloadStartsNow；39 key / 1092/628/1785
  - date: "2026-11-04"
    kind: revised
    summary: Revision 2：按 P1 复审 R1 删除 mechanical.credentialsAbsent/filenameSafe（C1/B1 三项口径）与 completed 的 {finalUrl}；最终 37 key / ui 1092 / main 626 / 总 1783；保留 gitignoreHint、downloadStartsNow 删除
---

# 下载文件申请 P1 实现提案（项目管理 A2：i18n key 契约）

- **任务 ID / flowId**：`2026-11-04-download-requests` / `download-requests`
- **角色 / 阶段**：项目管理（technical-architecture，`src/common/shared/` 唯一写入者）/ 团队计划 §5.1 **P1（A2 提案；已按 P1 审核与 Revision 1 复审修订；最终复审待统筹通知）**
- **性质 / 状态**：**`proposal-only, no code`**（Revision 2）。本文只冻结 A2 的 i18n key 契约、精确写集、测试与 AC-19 映射；**未改任何产品/测试文件，未运行实施，未 commit/push，未复审其他角色提案，未联系客户，未写复审结论**。
- **P1 审核/复审结果**：审核记录 `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md`（**501 行 / `7f8a3ea58782f74245aa1151ab29805fcafb73ddfa4822c84fb7d48620d99a01`**；原 340 行 / `503aaf34…` 保留），Revision 1 复审结论 **`needs revision`**（R1 A2 Revision 2）；本文件为 Revision 2，旧版 458 行 / `37c74edb…` 哈希不复用。
- **自审披露**：本 A2 提案与 P1 审核/复审由**同一项目管理上下文**完成；A2 的审核评估是**自检**，不是独立审核；不虚构独立审核人/第二个项目管理角色。审核记录已披露作者身份；C1/C2 的只读影响评估未获得时如实记为缺口，不声称其同意。
- **一句话**：为下载申请 A2 冻结 **37 个 i18n key**（35 个 `main.download.*`：卡片 13、回执 5、错误码 17；2 个 `ui.directive.panel.consumer.download*`），复用既有 judge/来源/期限标签 key，只写 3 个文件；同步给出计数/parity/零泄漏验证与修订后的消费方契约。

## 一、输入、基线与授权

### 1.1 冻结输入（2026-11-04 修订时实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 方案 P1.1 正文（唯一实施基线） | `docs/planning/2026-11-04_design_download-requests.md`（`head -n 1017`） | 1017 | `2590b5604d17d67fea7526b0895f7fcef70a92c495fb5828e6782d86fef0d26d` |
| 方案 P1.1 全文 | 同上 | 1018 | `de838c26766e26c9bc2124240e253385e8b95a397e0ff663e98e2893e9cea832` |
| 独立复核 | `docs/planning/2026-11-04_review_download-requests.md` | 135 | `d46502a3495b85237403ce8382c22245e4de42795e34261f59f2911c773e7783` |
| 闸门 0 意图记录 | `docs/communication/2026-11-04_intent_download-requests.md` | 34 | `60225f87f176583c1fa406b4029567a26808d52a874a3320ef2e936745df0cb1` |
| 闸门 1 确认记录 | `docs/communication/2026-11-04_gate1_download-requests.md` | 20 | `6e61894d0fa13ccd5b510e0a4c74291dcf8c5d1653baf583f5f611bdfe0ca7b7` |
| 闸门 2 确认记录 | `docs/communication/2026-11-04_gate2_download-requests.md` | 13 | `d4f00c07a1c44515805a64a0c6e924ec6309e7f5c16bbab8d6d4a57941d8155d` |
| 实施授权（IA）记录 | `docs/communication/2026-11-04_ia_download-requests.md` | 13 | `3250dfd4b5704a188cd01c33365891578d46166f3232fed1205c2fadfd2a8b97` |
| 团队计划 | `docs/scheduling/2026-11-04_team-plan_download-requests.md` | 693 | `d9760755e80aa95cd548fd994ca7a1f448321427002eddfe1957397de4efec8e` |
| B0 基线 v2（已认证） | `角色卡/测试/docs/change/2026-11-04_download-requests-B0-baseline-v2.md` | 239 | `73c660c6356ce0350a26e677d68081c2d03a738475bfad1836874b95224d2b36` |
| 验收标准 V1 | `docs/acceptance/download-requests-criteria-v1.md` | 1056 | `4a7c66ab51b5e1152407b57ce866056500933fb58480ba053c3a7e72c08f8d49` |
| P1 审核 + Revision 1 复审记录（本修订依据） | `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md` | 501 | `7f8a3ea58782f74245aa1151ab29805fcafb73ddfa4822c84fb7d48620d99a01`（原 340 行 / `503aaf34…` 保留） |
| 闸门 2 写集增补 + V1 确认 | `docs/communication/2026-11-04_gate2-writeset-addendum_download-requests.md` | 28 | `aeff744cb852c1e2c3ac718d4640c1803c0628c826a68fbcdb260eeb91f84212` |
| 角色边界（本角色） | `角色卡/项目管理/boundary.md` | 23 | `6f75bee458e672e8b4be78b17e4910ee13ba8f50057ce26e30cee012fba45d5c` |
| 边界 YAML（本角色） | `角色卡/项目管理/boundary.yaml` | 54 | `cfdc7408010bb9da1e3d5e9f723eb7a38956471d13860e8ac5588e7c3693cfff` |
| 工程法案 | `角色卡/项目管理/docs/project-rules.md` | 160 | `362e66c5547c6d678a65bec02cbe92b5a613818ea93237906aeeaf406fa8bfad` |
| i18n zh-CN | `src/common/shared/i18n/messages/zh-CN.ts` | 2188 | `6dafeb5983fac78336063e669aaba44434eabeae06c6c6a511f537d7eb3c3b6a` |
| i18n en-US | `src/common/shared/i18n/messages/en-US.ts` | 2456 | `8c0d15bd40d5bdbb629a75511dfb1b1fe284b1e7d8d8de86e3cea7e24c876602` |
| i18n 计数/parity 测试 | `test/项目管理/shared/i18n.test.ts` | 618 | `62b04e8c42bf1548606e9412c981e42baca073324980e76d23c6eff220e1a80a` |
| i18n 硬编码守卫 | `test/项目管理/shared/i18n-guard.test.ts` | 134 | `91e8d14323628e9a8d16721f6b059258eb6e6aa312fe8b1d1e16125ca7c6c7b6` |
| i18n allowlist | `test/项目管理/shared/i18n-guard-allowlist.ts` | 96 | `6416cb6edb12e64de558b1c7f94a21e4fb8051e8cdc797ff9de71045f2062b5b` |

- 分支 / HEAD：`feat/download-requests` / `c2f163087aaf11616e5be01f80d305bf6f25af57`。
- 写本文前 `git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空（2026-11-04 实测）。
- 与方案快照 `c8a9394` 的差异：`git diff --stat c8a9394..HEAD -- src/common/shared/ test/项目管理/` 为空；PR #57（`f394cfb`）未触 i18n messages，PR #58（`c2f1630`）未触 `src/common/shared/**`。i18n 基线未因基线更新而漂移。

### 1.2 当前 i18n 基线（只读实测）

| 项 | 实测值 | 依据 |
| --- | --- | --- |
| 分区计数 | `ui 1090 / main 591 / shared 62 / preferences 3 = 1746` | `test/项目管理/shared/i18n.test.ts:373-383` |
| 既有 download key | **0**（`grep -n 'download'` 在 zh-CN.ts/en-US.ts 均无命中） | 2026-11-04 实测；新 key 无碰撞 |
| 复用 key 存在性 | `ui.judge.mode.approval`、`ui.request.toCustomer`、`ui.request.toJudge`、`ui.directive.panel.consumer.none`、`ui.directive.panel.until.once/session/forever` 均存在 | zh-CN.ts:918、1953-1954、2102-2110 |
| i18n 守卫基线 | `[i18n-guard] scanned=136 allowlisted=22 violations=0` | B0 v2 证据 `09-suite-pm-shared.log:102` |
| 项目管理套件基线 | 11 文件 / 175 tests / 170 pass / 0 fail / 5 skip | B0 v2 §6（`09-suite-pm-shared.log`） |
| typecheck 基线 | `npm run typecheck` exit 0 | B0 v2 §5（`04-typecheck.log`） |

### 1.3 P1 入口条件与审核状态

| 条件 | 状态（现场实测） | 依据 |
| --- | --- | --- |
| 闸门 2 | **已确认** | `2026-11-04_gate2_download-requests.md`（13 行 / `d4f00c07…`） |
| 实施授权（IA） | **已给** | `2026-11-04_ia_download-requests.md`（13 行 / `3250dfd4…`）；不含提交/推送/合并/发布 |
| H1（B-1..B-4 边界落地） | **已落地（未提交）** | 9 文件 `+38` 行；B0 v2 §4 边界门禁 25/25 pass；现场 `git diff --stat` 复核一致 |
| B0 | **v2 已认证** | `2026-11-04_download-requests-B0-baseline-v2.md`（239 行 / `73c660c6…`）；T3 3665/3638/9/18；新增确定性失败 0、新增 skip 0 |
| V1 验收标准 | **已由沟通 addendum 确认（路径/版本可派发）** | V1 1056 行 / `4a7c66ab…`；`2026-11-04_gate2-writeset-addendum_download-requests.md`（28 行 / `aeff744c…`）§三；文件内「等待沟通确认」字样可按 addendum 忽略/由验收方后续编辑更新 |
| P1 审核（五份提案） | **Revision 1 复审已完成；结论 `needs revision`（R1 A2 Revision 2）** | `2026-11-04_download-requests-P1-review.md`（501 行 / `7f8a3ea5…`；原 340 行 / `503aaf34…` 保留）；本文件为 A2 Revision 2；最终复审待统筹通知 |

> **开放项（修订后）**：V1 入口条件已由 addendum §三确认（路径/版本可作派发依据），不再构成阻断；A2 实施仍须最终复审通过 + 统筹派发。另：V1 文件头引用的 B0 是 v1（`86e25add…`），B0 v2（`73c660c6…`，HEAD `c2f1630`）是更新后的认证基线；以 B0 v2 为准，V1 标准本身不变。

### 1.4 本阶段不产生的授权

- 本文不授权提交、推送、合并、发布；不授权派发 worker；不授权修改写集、边界或档位。
- 本文不复审其他角色提案；复审由统筹另行通知。P1 审核记录已写于 `角色卡/项目管理/docs/change/2026-11-04_download-requests-P1-review.md`（`503aaf34…`）。
- 本文不改变方案 P1.1、G1–G8 A、P1–P9 未选、T3 或任何 AC。

## 二、目标与范围

### 2.1 目标（A2 实施时）

1. 在 `src/common/shared/i18n/messages/zh-CN.ts` 与 `en-US.ts` 成对新增 **37 个 key**（§3.1 表），供 C1（卡片/回执/错误系统行）与 C2（指令面板 consumer 标签/存量指令标注）消费；尽量复用既有 key（§3.2）。
2. 更新 `test/项目管理/shared/i18n.test.ts`：分区计数 `ui 1092 / main 626 / shared 62 / preferences 3 = 1783`、37 key 清单、家族计数、精确文案与占位符断言；保留全部既有断言。
3. `i18n-guard.test.ts` 作为回归只读通过（`violations=0`）；不修改 allowlist。C1/C2 不得硬编码中文；若其实现需要 allowlist 新条目，**停止回报**，属写集增量/闸门 2。

### 2.2 不在 A2 范围

- 不写任何产品代码或产品测试：不改 `app/**`、`src/model/**`、`src/service/**`、`src/provider/**`、`src/pipeline/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/编排/**`、`test/runtime-core/**`、`test/测试/**`。
- 不新增/修改共享组件；不改 `src/common/shared/jsonl-ledger.ts`、`docs/architecture/shared-components.md`、i18n 运行时/类型/格式化实现（`keys.ts`/`types.ts`/`index.ts`/`translate.ts`/`format.ts`）。
- 不实现 P1–P9 选装；不实现 G8 B/C（客户选 A）；不改 shell 闸/写守卫/CLI/构建/发布面。
- 不写 `docs/scheduling|acceptance|communication|planning`、其他角色文件、角色卡/边界/changelog（H1 已由人事完成）。
- 不 commit/push、不启动应用、不跑 Electron E2E。

## 三、i18n key 契约（修订后冻结候选）

> 下列 key 名为 **A2 修订后冻结候选**；消费方（C1/C2）只能按本表消费。若实施需要本表之外的 key，**停止并回报**，由 A2 统一增补并重跑计数/parity，不由消费方自行加 key。

### 3.1 完整 key 清单与文案（37 个）

#### 3.1.1 卡片（C1 `app/desktop/download-request.ts` → `title`/`preview`/`detail`；13 个）

| # | Key | zh-CN | en-US | 占位符 |
| --- | --- | --- | --- | --- |
| 1 | `main.download.card.title` | 下载文件申请 | Download request | — |
| 2 | `main.download.card.role` | 申请角色：{role} | Requesting role: {role} | `{role}` |
| 3 | `main.download.card.purpose` | 用途：{purpose} | Purpose: {purpose} | `{purpose}` |
| 4 | `main.download.card.url` | URL：{url} | URL: {url} | `{url}` |
| 5 | `main.download.card.host` | 主机：{host} | Host: {host} | `{host}` |
| 6 | `main.download.card.resolvedIps` | 已解析 IP：{ips} | Resolved IPs: {ips} | `{ips}` |
| 7 | `main.download.card.resolvedIpsTruncated` | （共 {total} 个，仅显示前 {shown} 个） | (showing the first {shown} of {total}) | `{total}` `{shown}` |
| 8 | `main.download.card.filename` | 预期文件名：{filename}（可能被服务器的 Content-Disposition 覆盖） | Expected filename: {filename} (the server's Content-Disposition may override it) | `{filename}` |
| 9 | `main.download.card.sizePolicy` | 大小策略：≤ {maxMb} MB（实际大小未知，直至收到响应） | Size policy: ≤ {maxMb} MB (actual size is unknown until the response arrives) | `{maxMb}` |
| 10 | `main.download.card.redirectPolicy` | 重定向策略：仅同域跟随；跨域重定向将中止并要求重新申请 | Redirect policy: same-host redirects only; a cross-host redirect stops the download and requires a new request | — |
| 11 | `main.download.card.mechanical.scheme` | 协议校验：通过（{scheme}） | Scheme check: passed ({scheme}) | `{scheme}` |
| 12 | `main.download.card.mechanical.publicHost` | 主机校验：公网地址 | Host check: public address | — |
| 13 | `main.download.card.mechanical.publicIps` | 解析 IP 校验：全部为公网地址 | Resolved IP check: all public addresses | — |

- 说明：第 6/7 项是 §8.3 未单列、但 AC-3/AC-25 要求卡片显示「已解析 IP 与 `resolvedIpsTruncated`/`resolvedIpsTotal`」所必需的闭合 key；第 11-13 项为 C1/B1 冻结的 **mechanical 三项**（scheme/publicHost/publicIps）。`mechanical.credentialsAbsent`/`filenameSafe` 保留在 B1 `DownloadJudgeFacts` 与判断/审计中，**不在客户卡单列、不设 i18n key**（Revision 2 按 PM 复审 R1 收敛；C1/B1 同口径）。
- **文件名来源**：本表不新增 `filenameSource` 值 key；AC-3 只要求「预期文件名」，`filenameSource` 仍保留在 B1 `DownloadJudgeFacts` 与审计中。C1 修订后不得要求客户卡显示来源标签；若 AC-3/验收明确要求客户可见来源，A2 再增补 `main.download.card.filenameSource.*` 值 key（计数增加），不由 C1 自行加 key。

#### 3.1.2 客户回执/系统行（C1；5 个）

| # | Key | zh-CN | en-US | 占位符 |
| --- | --- | --- | --- | --- |
| 14 | `main.download.notice.completed` | 已下载「{host}」→ {path}（{bytes} 字节，sha256 {sha}）；审批来源：{source}。 | Downloaded “{host}” → {path} ({bytes} bytes, sha256 {sha}); approval source: {source}. | `{host}` `{path}` `{bytes}` `{sha}` `{source}` |
| 15 | `main.download.notice.failed` | 未下载（技术 code：{code}）：{reason} | Not downloaded (technical code: {code}): {reason} | `{code}` `{reason}` |
| 16 | `main.download.notice.directiveAllowed` | 客户审批指令 #{id} 已允许此下载（domain={host}，until={until}）。 | Approval directive #{id} allowed this download (domain={host}, until={until}). | `{id}` `{host}` `{until}` |
| 17 | `main.download.notice.directiveSource` | 审批指令 #{id} | Approval directive #{id} | `{id}` |
| 18 | `main.download.notice.gitignoreHint` | 如需忽略已下载文件，请自行将 download/ 加入 .gitignore。 | To ignore downloaded files, add download/ to .gitignore yourself. | — |

- `{source}` 由 C1 用既有 key 组合：客户 ⇒ `ui.request.toCustomer`（客户/customer）；判断 agent ⇒ `ui.request.toJudge`（判断 agent/judge agent）；审批指令 ⇒ 本表第 17 项 `main.download.notice.directiveSource`。**不得**把 judge 代批写成客户本人。
- `{until}` 由 C1 用既有 `ui.directive.panel.until.once/session/forever` 本地化（一次性/本会话/长期有效），不新增 key。
- `{bytes}` 为按当前 locale 格式化的整数字符串；`{path}`/`{sha}`/`{code}` 为机器值，不翻译。**客户成功系统行不含 final URL**（Revision 2 按 PM 复审 R1 删除 `{finalUrl}`）：final URL 仅在 agent-facing 工具成功回执（`request_download` 的 ToolResult message）中，不进共享 i18n、不进客户系统行。
- 第 17 项是 §8.3 未单列、但 AC-21 归属要求（完成回执必须如实写明 directive 来源）所必需的闭合 key；方案 §8.3 的 `notice.completed/failed/directiveAllowed` 三个 key 全部保留。
- 第 18 项是 G1 A 的「完成后提示客户自行添加 `.gitignore`」文案（P1 审核 F7）：独立 key，便于 C1 在完成回执后 best-effort 追加；**不自动修改 `.gitignore`**。若 C1 选择并入 `notice.completed`，则删除本 key 并更新计数（二选一，本提案采用独立 key）。
- **失败回执口径**：第 15 项是客户系统行，只含人话 reason + 技术 code，不含「下一步/谁来做」；模型侧工具回执保持 agent-facing（`request_download：未下载（…）。下一步：…。谁来做：…。[技术 code：…]`），按 i18n 目录约定不收录 agent-facing 文本（P1 审核 F8，逐项写明）。

#### 3.1.3 失败文案（按稳定 code；C1 选择 key；17 个）

| # | Key | zh-CN | en-US | 占位符 | 对应 code |
| --- | --- | --- | --- | --- | --- |
| 19 | `main.download.error.invalidArguments` | 下载申请参数不合法；未发卡、未联网。 | The download request arguments are invalid; no card was issued and no network request was made. | — | `download-invalid-arguments` |
| 20 | `main.download.error.unsafeUrl` | 目标地址不安全：{detail} | The target URL is unsafe: {detail} | `{detail}` | `download-unsafe-url` |
| 21 | `main.download.error.dnsFailed` | 域名解析失败：{host} | DNS resolution failed: {host} | `{host}` | `download-dns-failed` |
| 22 | `main.download.error.deniedByDirective` | 客户审批指令 #{id} 拒绝了此下载。 | Approval directive #{id} denied this download. | `{id}` | `download-denied-by-directive` |
| 23 | `main.download.error.declined` | 审批未通过（客户拒绝或判断拒绝）。 | The download was not approved (declined by the customer or the judge). | — | `download-declined` |
| 24 | `main.download.error.unavailable` | 审批通道不可用，未能取得审批。 | The approval channel is unavailable; no approval was obtained. | — | `download-unavailable` |
| 25 | `main.download.error.factsMissing` | 判断器无法核对申请事实，已转客户确认。 | The judge could not verify the request facts; the request was escalated to the customer. | — | `download-facts-missing` |
| 26 | `main.download.error.rebindingDetected` | 下载连接地址与校验结果不一致（疑似 DNS rebinding），已中止且未写入文件。 | The connection address did not match the verified addresses (possible DNS rebinding); the download was aborted and nothing was written. | — | `download-rebinding-detected` |
| 27 | `main.download.error.redirectCrossHost` | 服务器重定向到其他主机（{target}）；未跟随，请对最终地址重新申请。 | The server redirected to another host ({target}); it was not followed. Request again for the final URL. | `{target}` | `download-redirect-cross-host` |
| 28 | `main.download.error.httpError` | 服务器返回了不支持的响应：{detail} | The server returned an unsupported response: {detail} | `{detail}` | `download-http-error` |
| 29 | `main.download.error.tooLarge` | 文件超过大小上限（{maxMb} MB）。 | The file exceeds the size limit ({maxMb} MB). | `{maxMb}` | `download-too-large` |
| 30 | `main.download.error.unsupportedEncoding` | 服务器使用了不支持的内容编码：{encoding} | The server used an unsupported content encoding: {encoding} | `{encoding}` | `download-unsupported-encoding` |
| 31 | `main.download.error.timeout` | 下载超时（连接、空闲或总时限）。 | The download timed out (connect, idle, or total limit). | — | `download-timeout` |
| 32 | `main.download.error.networkError` | 网络连接失败（连接重置或 TLS 校验失败）。 | The network connection failed (connection reset or TLS verification failure). | — | `download-network-error` |
| 33 | `main.download.error.writeFailed` | 写入 download/ 失败，下载未完成。 | Writing to download/ failed; the download did not complete. | — | `download-write-failed` |
| 34 | `main.download.error.busy` | 同时执行的下载已达上限，请稍后重试。 | Too many downloads are running at once; try again later. | — | `download-busy` |
| 35 | `main.download.error.aborted` | 本轮已中止或应用已关闭，下载已取消。 | The turn was aborted or the app closed; the download was cancelled. | — | `download-aborted` |

- 17 个 key 与方案 §3.3 的 **17 个稳定错误码**一一对应（§8.3 建议清单漏列 `unsupportedEncoding`，本表补齐；这是本提案对 §8.3 的闭合，不是新增需求）。
- 错误码→key 的映射由 C1 在生成客户系统行时完成；B1 只返回稳定 `download-*` code 与已净化参数。模型侧工具回执的「下一步/谁来做」不进入客户系统行（见 §3.1.2 失败回执口径）。
- `{detail}` 只允许已净化的具体原因（如状态码/解析失败摘要），不得含凭据、响应体或项目绝对路径（AC-17）；由 B1/C1 的测试保证。

#### 3.1.4 指令面板（C2；2 个）

| # | Key | zh-CN | en-US | 占位符 | 用途 |
| --- | --- | --- | --- | --- | --- |
| 36 | `ui.directive.panel.consumer.download` | 消费者：下载 | Consumer: download | — | `DirectiveConsumer` 新值 `"download"` 的 consumer 列标签（替换 domain 的「暂无消费者」） |
| 37 | `ui.directive.panel.consumer.downloadLegacyOff` | 不作用于下载（早于下载功能启用） | Does not apply to downloads (created before download support was enabled) | — | G8 A：`createdAt < enabledAt` 的旧 domain 指令标注 |

- 方案 §8.3 的建议名 `ui.directive.consumer.download*` 与既有 `ui.directive.panel.consumer.{shellGate,decisionCard,none}` 家族不一致；A2 冻结为 `ui.directive.panel.consumer.*`，与 `app/renderer/src/stores/directive-store.ts` 的 `CONSUMER_KEYS` 映射和既有 `DirectiveConsumer` 消费方式一致（映射见 §3.2）。C2 修订后必须逐字使用本表两个 key。
- **`downloadStartsNow` 已删除**（P1 审核修订项）：客户选 G8 A，B/C 未实施，该 key 在 A 口径下无消费点；保留会成为死 key 且可能被误读为 B 已实施。若未来客户改选 B/C，按 key 增量补 `ui.directive.panel.consumer.downloadStartsNow` 并更新计数。最终 37 key 不含该 key。
- `downloadLegacyOff` 是 consumer 列的**标注变体**，不新增 `DirectiveConsumer` 枚举值；A1 的枚举仍是 `"shell-gate" | "decision-card" | "download" | "none"`。C2 依据 B1/C1 冻结的 epoch/legacy 视图状态选择该 key；渲染侧不得自判 epoch。

### 3.2 复用与命名决策（修订后）

| 场景 | 方案 §8.3 建议 | A2 冻结 | 理由 |
| --- | --- | --- | --- |
| judge 结果行标签 | `ui.download.judge.group.approval`（或复用 `ui.judge.mode.approval`） | **复用 `ui.judge.mode.approval`**（不新增 key） | 下载卡在 `GOVERNANCE_CARD_GROUP` 中属 `approval` 组；`app/desktop/customer-input.ts:1292,1308` 与 `app/renderer/src/chat/judge.ts:22-25` 已按组消费该 key；C1 §4.5/C2 §3.1 已接受复用 |
| 指令面板 consumer | `ui.directive.consumer.download` | `ui.directive.panel.consumer.download` | 对齐既有 `ui.directive.panel.consumer.*` 家族与 `CONSUMER_KEYS` 映射；C2 逐字消费 |
| 旧指令标注 | `ui.directive.consumer.downloadLegacyOff` | `ui.directive.panel.consumer.downloadLegacyOff` | 同上；consumer 列标注变体 |
| G8 B 标注 | `ui.directive.consumer.downloadStartsNow` | **删除**（不新增） | G8 A 下无消费点；B/C 未实施；避免死 key；未来选 B/C 再按 key 增量补 |
| 审批来源（客户/judge） | 未列 | **复用 `ui.request.toCustomer` / `ui.request.toJudge`** | 已有精确文案（客户 / 判断 agent），归属语义一致 |
| 审批来源（指令） | 未列 | 新增 `main.download.notice.directiveSource` | 完成回执需如实写明 directive 来源（AC-21）；既有 panel 标题是复数/面板语义，英文不匹配 |
| 期限显示 | 未列 | **复用 `ui.directive.panel.until.once/session/forever`** | 同一语义、同一文案 |
| G1 A `.gitignore` 提示 | 未列 | 新增 `main.download.notice.gitignoreHint` | 客户已确认 G1 A「完成后提示客户自行添加」；独立 key 便于 best-effort 追加，且不改 `.gitignore` |
| `mechanical` 安全摘要 | `publicHost/publicIps/scheme` 三项 | **三项**：scheme/publicHost/publicIps | C1/B1 修订版冻结的三项口径；`credentialsAbsent`/`filenameSafe` 保留在 B1 `DownloadJudgeFacts`/判断/审计，不在客户卡单列（Revision 2 按 PM 复审 R1 收敛） |
| 完成回执 final URL | 未列 | **不设 `{finalUrl}`** | C1 §4.5/§8.3 明确客户成功系统行不含 final URL；final URL 仅在 agent-facing 工具成功回执，不进共享 i18n |
| 文件名来源 | 方案 §4.1 提到来源 | **不新增值 key，C1 不显示来源标签** | AC-3 只要求预期文件名；`filenameSource` 留在 facts/审计；避免 4 个值 key 膨胀；若 AC 要求再补 |
| 失败回执 action/owner | 方案 §8.3 示例含 | **客户系统行不含；agent-facing 工具回执保留** | 客户行只显示 reason+code；「下一步/谁来做」属模型可操作回执，按 i18n 目录约定不收录 |
| 通用短词 | 未列 | 不新增 `shared.*`；需要时复用 `shared.common.*` | 目录约定「同一含义只保留一个 key」 |

### 3.3 文案与占位符约束

- **中英成对**：37 个 key 必须在 `zhCN` 与 `enUS` 同时存在；`en-US` 的 `satisfies Record<MessageKey, MessageTemplate>` 会强制齐全。
- **占位符一致**：同一 key 的 `{param}` 集合在 zh/en 必须完全一致；占位符名只用 `[A-Za-z][A-Za-z0-9_]*`（现有提取正则）。
- **英文零 Han**：en-US 所有模板值不得含 Han 字符（既有全局测试覆盖）。
- **机器值不翻译**：`url`、`host`、`ips`、`path`、`sha`、`code`、`bytes`、`maxMb`、`scheme`、`target`、`encoding`、`id`、`detail` 保持机器/数值/已净化原文；`{until}`/`{source}` 例外，用既有 key 本地化。
- **不泄露**：key/文案不含凭据、响应体、项目绝对路径；`{url}`/`{detail}` 的净化是 C1/B1 责任，A2 只在文案层约束。
- **G1 A**：`main.download.notice.gitignoreHint` 只提示客户自行添加，不自动修改 `.gitignore`；C1 best-effort 追加，投递失败不翻转下载结果。
- **文件名来源**：不显示来源标签；C1 不新增/不硬编码来源 key。
- **失败 action/owner**：客户系统行只含 reason+code；模型侧工具回执的 action/owner 不入共享目录。
- **不改写既有 key**：不删除、不改名、不改值既有 key；不新增 `ui.download.` 前缀（避免与 judge 结果行重复）；不新增 `ui.acceptance.`/`ui.gate.` 等旧治理前缀；不保留 `downloadStartsNow`。

### 3.4 计数

| 分区 | 现有 | 新增 | 实施后 |
| --- | --- | --- | --- |
| `ui.*` | 1090 | +2（`ui.directive.panel.consumer.download` / `downloadLegacyOff`） | **1092** |
| `main.*` | 591 | +35（card 13 + notice 5 + error 17） | **626** |
| `shared.*` | 62 | 0 | **62** |
| `preferences.*` | 3 | 0 | **3** |
| **总计** | **1746** | **+37** | **1783** |

- `main.download.*` 合计 35：`card.*` 13、`notice.*` 5、`error.*` 17。
- 与 Revision 1（39 key / ui 1092 / main 628 / 总 1785）的差异：删除 `mechanical.credentialsAbsent`/`filenameSafe`（main -2）；`completed` 去掉 `{finalUrl}`（不增删 key）；保留 `gitignoreHint`、`downloadStartsNow` 删除、panel 前缀/judge 复用。净 -2 key。
- 若实际 key 集与 §3.1 不一致（新增数不是 37、出现非预期前缀、或 `main.download.*` 不是 35），**停止**并在 A2 实施记录说明；不得改计数迁就错误 key 集。

### 3.5 消费方映射（A2 修订后冻结）

| key 家族 | 消费方 | 消费点 | 前置依赖 |
| --- | --- | --- | --- |
| `main.download.card.*` | 桌面窗口 C1 | `app/desktop/download-request.ts` 构造卡片 `title`/`preview`/`detail`（`mainT`）；mechanical 三项逐项展示；不显示文件名来源标签 | A1 的 `DownloadJudgeFacts`/卡片 metadata 形状；A2 key |
| `main.download.notice.completed/failed/directiveAllowed/directiveSource/gitignoreHint` | 桌面窗口 C1 | 成功/失败/预授权系统行（best-effort）；完成回执后追加 `.gitignore` 提示 | B1 的结果/审计事实；A2 key |
| `main.download.error.*` | 桌面窗口 C1 | 失败系统行；按 B1 返回的 code 选 key；客户行只 reason+code | B1 的稳定 code；A2 key |
| judge 结果行标签 | 桌面UI C2 | 复用 `ui.judge.mode.approval`；下载卡 group=`approval` | A1 `GOVERNANCE_CARD_GROUP`；既有 key |
| `ui.directive.panel.consumer.download` / `downloadLegacyOff` | 桌面UI C2 | `app/renderer/src/stores/directive-store.ts` 的 `CONSUMER_KEYS` 与面板标注；面板 `directive-panel.tsx` | B1/C1 冻结的 `consumer`/`downloadApplies` 视图状态；A2 key |

## 四、精确写集与落点

### 4.1 写集（A2 实施时，只有这三个文件）

| 路径 | 变更 |
| --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 新增 37 个 key（§3.1），值为 zh-CN 文案 |
| `src/common/shared/i18n/messages/en-US.ts` | 同 key、同顺序的 en-US 文案 |
| `test/项目管理/shared/i18n.test.ts` | 分区计数 1092/626/62/3=1783；`DOWNLOAD_KEYS` 37 key 清单；家族计数、精确文案/占位符断言；保留全部既有断言 |

### 4.2 插入点与风格

- `zh-CN.ts`：在 `main.directive.error.submitRejected`（约 2092 行）之后插入新注释块 `// ---- 下载申请（2026-11-04 download-requests A2；P1 审核后修订）----`，依次放 `main.download.card.*`（13）、`main.download.notice.*`（5）、`main.download.error.*`（17）；在既有 `ui.directive.panel.consumer.none`（约 2104 行）之后插入 `ui.directive.panel.consumer.download` 与 `downloadLegacyOff`（2）。不重排既有行。
- `en-US.ts`：按相同锚点（`"main.directive.error.submitRejected"`、`"ui.directive.panel.consumer.none"`）插入同 key、同顺序的英文值。
- 双引号字符串、两空格缩进，与现有文件风格一致；除既定注释外不在消息文件新增其他展示文案。
- `MessageKey` 由 `zh-CN.ts` 的 key 自动推导；不改 `keys.ts`/`types.ts`/`index.ts`/`translate.ts`/`format.ts`。

### 4.3 不改项（明确）

- **`src/common/shared/jsonl-ledger.ts` 不改**：下载账本 `downloads.jsonl` 由 B1 复用既有共享组件；A2 不复制、不 fork、不改签名。
- **`docs/architecture/shared-components.md` 不改**：本任务不新增共享组件；i18n messages 是既有目录，不是新组件登记项。实际文件位于 `角色卡/项目管理/docs/architecture/shared-components.md`（P1 审核记录已纠正路径表述）。
- **`i18n-guard-allowlist.ts` 预期不改**：A2 只改 messages（守卫扫描范围排除该目录）与 `i18n.test.ts`；不新增 allowlist 条目。**若 C1/C2 或其实现需要新增条目，停止回报**——该文件增补属写集增量/闸门 2，不得自行添加。
- `i18n-guard.test.ts`、`i18n-guard-scanner.ts`：不修改，只回归运行。
- `src/common/shared/**` 其他文件、其他角色写集、角色卡/边界/changelog、`docs/scheduling|acceptance|communication|planning`、构建/发布配置：均不改。

### 4.4 写集增量的停止条件

出现下列任一情况时停止并回报统筹，不自行扩写集：

1. 需要 §3.1 之外的 key（含 `filenameSource` 值 key、owner/action 标签 key、其它错误码 key、`downloadStartsNow`）。
2. 需要 `i18n-guard-allowlist.ts` 新增/删除条目。
3. 需要改 `jsonl-ledger.ts`、`shared-components.md`、i18n 运行时/类型/格式化实现。
4. 需要写任何 `app/**`、`src/**` 产品代码、其他角色测试或 `test/项目管理/shared/` 之外的测试。
5. 需要改变计数口径或删除/改写既有 key 才能通过测试。

## 五、测试与验证计划（A2 出口）

### 5.1 `test/项目管理/shared/i18n.test.ts` 更新

1. **分区计数**：将既有测试改为 `ui 1092 / main 626 / shared 62 / preferences 3 = 1783`（§3.4）。
2. **新增 `DOWNLOAD_KEYS` 常量**（37 项，`as const satisfies readonly MessageKey[]`），与既有 `SHELL_ESCALATION_KEYS`/`DIRECTIVE_KEYS` 同风格；断言：
   - `DOWNLOAD_KEYS.length === 37`，无重复；
   - 家族计数：`main.download.card.` 13、`main.download.notice.` 5、`main.download.error.` 17、`ui.directive.panel.consumer.download` 前缀 2；
   - 每个 key 同时存在于 `zhCN`/`enUS`；
   - 每个 key 的 zh/en 占位符集合相等；
   - 每个 en-US 模板值零 Han。
3. **精确文案断言**：对 §3.1 的 37 项逐字断言 zh/en 值（至少覆盖回执/错误/卡片关键模板），防止后续改写绕过客户确认；对占位符逐项断言（§3.1 表）；显式断言 `completed` 占位符为 `["bytes","host","path","sha","source"]`（无 `finalUrl`）、mechanical 仅三项、`downloadStartsNow` 零命中。
4. **复用/删除断言**：`ui.judge.mode.approval`、`ui.request.toCustomer`、`ui.request.toJudge`、`ui.directive.panel.consumer.none`、`ui.directive.panel.until.once/session/forever` 均存在；`ui.download.` 前缀零命中（不新建 judge 专用重复 key）；`ui.directive.panel.consumer.downloadStartsNow` **零命中**（锁定删除，G8 B/C 未选）。
5. **保留既有断言**：`B0_KEYS`、`D_RETAINED_KEYS`、`SHELL_ESCALATION_KEYS`、`ACCEPTANCE_RETURN_CARD_KEYS`、`GLOBAL_TASK_STATE_KEYS`、`DIRECTIVE_KEYS`、parity、英文泄漏、旧治理 key 零命中、关键 key 清单全部不变；不新增 skip/todo；不删除既有 key 凑计数。

### 5.2 命令与预期（A2 实施后、同一候选取证）

```bash
node --test "test/项目管理/shared/**/*.test.ts"
npm run typecheck
```

- 记录：命令、cwd、时间、Node/npm/OS、退出码、tests/pass/fail/cancelled/skip/todo、失败原文；逐文件 `git hash-object` + `sha256sum`；`git diff --name-only`/`git status --short`（限三文件）；`git diff --cached --name-only` 为空。
- 预期：项目管理套件 11 文件；既有 175 tests 中 5 项平台条件 skip 不变；新增测试计入（实际计数如实记录，不预设固定总数）；0 fail；`npm run typecheck` exit 0。
- `i18n-guard` 回归：`[i18n-guard] scanned=136 allowlisted=22 violations=0`（A2 不改变扫描范围；若因无关文件增加导致 scanned 变化，如实记录并说明 A2 未新增扫描文件与 allowlist 条目）。
- 若计数/parity/占位符/零泄漏任一失败，按实际失败修复；不得用删 key、放宽断言或改 allowlist 保绿。

### 5.3 AC-19（key 部分）覆盖映射

| AC-19 子句 | A2 证据 | 后续消费方证据 |
| --- | --- | --- |
| 新增 key 在 zh-CN/en-US 均存在 | `DOWNLOAD_KEYS` 37 项成对断言、计数、parity | C1/C2 只按冻结 key 消费；D1 回归 |
| 扫描目录无硬编码中文 | A2 不改扫描范围、不新增中文源码；守卫零违规原始输出 | C1/C2 实现后 D1 守卫零违规；若需 allowlist 新条目即停止 |
| 卡片/回执/错误可切换语言 | zh/en 两套文案齐全 | C1 卡片/system line、C2 面板、D2 语言切换截图 |

- 同时为 AC-14（面板 consumer 显示「下载」）、AC-27（旧指令「不作用于下载」标注）、AC-3/AC-25（卡片字段/截断标记/mechanical 三项）、AC-17/AC-21（归属）、G1 A（`.gitignore` 提示）提供文案 key；实际渲染与截图由 C1/C2/D2 证明。
- **依赖其他角色补字段**：AC-27 的 `downloadLegacyOff` 仍依赖 B1/C1 冻结的 epoch/legacy 视图状态（`consumer:"none"` 或 `downloadApplies:false`/等价字段）；A2 只提供文案 key，不判 epoch。若 B1/C1 不提供，A2 无法单独解决，按 P1 审核记录 F3 由 B1/C1 修订。

### 5.4 i18n guard 零违规

- `test/项目管理/shared/i18n-guard.test.ts` 只读回归，不修改 allowlist；目标 `violations=0`。
- 若 A2 实施后发现守卫因其他角色新增中文而变红，**不得**把其文件加入 allowlist 来「修绿」；按归属回报统筹，由对应角色消费 A2 key 或走闸门 2 增补。

### 5.5 证据清单（A2 实施时）

- 三文件写前/候选 `git hash-object` + `sha256sum`；`git rev-parse HEAD`；`git status --short`。
- 测试与 typecheck 原始输出（命令/退出码/计数/失败原文）。
- `git diff --name-only` 与 `git status --short` 落在 §4.1 三文件；staged 为空。
- 文档状态：`implemented-unverified`（A2 实施后、复审/D1/验收前）；**冻结声明**：key 集合、计数 1783、复用/删除决策与 §3.2 命名映射。

## 六、P1 审核结果与复审准备

> P1 审核已于 2026-11-04 完成（`2026-11-04_download-requests-P1-review.md`，340 行 / `503aaf34…`），结论 **`needs revision`**；本文件是按该记录修订的 A2 版本。**本文件不复审其他角色提案**；复审由统筹另行通知。下列 6.1–6.6 保留为复审参照与检查维度，不预写任何复审结论。

### 6.1 运行时核心（A1：Model/工具契约/运行时透传）

- **写集检查**：`src/model/download.ts`（新，B-1）、`src/model/runtime.ts`、`src/model/directive.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`src/service/runtime/session.ts`、`test/runtime-core/` 相关文件、自身 `docs/change/`；不得写其他角色路径。
- **契约检查**：`RequestDownloadFn`/`DownloadRequestInput`/`DownloadRequestResult`/`DownloadErrorCode`/`DownloadJudgeFacts`/常量；`GovernanceCardKind` 加 `"download"` 且 `GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS` 不变；`GOVERNANCE_CARD_GROUP.download="approval"`；`GovernedToolsOptions.requestDownload?`；`GovernanceJudgeContext/Request.download?`；`request_download` schema 单一来源；注入才注册；CLI/判断会话结构性无工具。
- **测试检查**：AC-1/AC-2/AC-15（工具层）/AC-23；`node --test "test/runtime-core/**/*.test.ts"` + typecheck；候选哈希。
- **AC 映射**：AC-1/2/15/23/25（Model 类型部分）。
- **边界外需求**：新增 `src/model/download.ts` 之外的 Model 文件、改 `GovernanceConfirmCardKind`/`CONFIRM_CARD_KINDS`、改 `src/common/shared/**`、新增 CLI 行为、引入新依赖 → 应停止回报。
- **基线披露**：HEAD `c2f1630`；PR #57 对 `src/model/directive.ts` 同文件加法、需合并并重跑；B0 v2；方案行号以 `c8a9394` 快照为准、实施按符号锚点。
- **开放点披露**：判断归属合成值 `"download"` 的构造点与「不读 flow 文档」保证；`RejectionOwner:"requester"` 的归属；测试缝不进入生产。

### 6.2 项目管理（A2：本提案）

- **写集检查**：§4.1 三文件；allowlist 预期不改；不得写产品/测试源码或其他角色资料。
- **契约检查**：§3.1 的 37 key、§3.2 复用/命名/删除映射、§3.4 计数 1783、§3.5 消费方映射；冻结后 C1/C2 只消费。
- **测试检查**：§5 的计数/parity/零泄漏/占位符/精确文案；guard 零违规；typecheck。
- **AC 映射**：AC-19（key 部分）、AC-14/27（文案）、AC-3/25（卡片字段 key/mechanical 三项）、AC-17/21（归属）、G1 A（`.gitignore` 提示）。
- **边界外需求**：任何 §3.1 之外的 key、allowlist 新条目、共享组件改动 → 停止。
- **基线披露**：HEAD `c2f1630`；i18n 文件未被 PR #57/#58 触碰（`git diff --stat` 为空）；B0 v2；V1 已由 addendum 确认（§1.3）；P1 审核+Revision 1 复审记录 501 行 / `7f8a3ea5…`（原 340 行 / `503aaf34…` 保留）。
- **自审披露**：本提案与 P1 审核由同一项目管理上下文完成；A2 的审核评估是自检，不虚构独立审核人/第二个项目管理角色；审核记录已披露作者身份；C1/C2 的只读影响评估未获得时如实记为缺口。

### 6.3 编排（B1：下载 Provider/Service/Pipeline + 指令消费者 + 判断集成 + G8 A）

- **写集检查**：`src/provider/download/**`（新，B-3）、`src/service/download/**`（新，B-3）、`src/pipeline/orchestration/download-request.ts`（新，B-2）、`customer-directive.ts`、`run-role.ts`、`src/service/directive/impl/directive-service.ts`、`src/common/编排/{mechanical-rejection,governance-judge-facts,governance-judge-prompt,governance-judge,governance-judge-evidence,governance-judge-verdict}.ts`（按需/增补）、`test/编排/` 相关、自身 docs/change；不得写 Model/Provider runtime/桌面/共享 i18n。
- **契约检查**：Provider/Service 公共入口；Pipeline 句柄；`takeDownloadDirective`（deny 优先、allow 补足、`once` durable 消费失败回落、session/forever）；`consumerOf` domain → `"download"`、path 仍 `"none"`；17 个 `download-*` code + `RejectionOwner:"requester"`（或披露回退）；judge rubric/物证分派；G8 A `.ans/state/download-consumer.json` epoch（不可读按无指令且不重写）；审计归属（卡片路径 `request.*`、预授权路径不写 `request.*`）。
- **测试检查**：AC-3（开发侧）/AC-5/AC-7–AC-18/AC-21/AC-23–AC-27/AC-29；安全矩阵（SSRF/IPv6/6to4/Teredo/rebinding/重定向/TLS/大小/超时/状态码）；`node --test "test/编排/**/*.test.ts"` + typecheck；候选哈希。
- **AC 映射**：AC-4/5/7–18/21/23–27/29。
- **边界外需求**：额外 Provider/Service 文件越出 B-3 模块根、改 `src/model/**`/`src/provider/runtime/**`、改共享 i18n、生产路径可注入测试缝、改 shell 闸/写守卫、新依赖 → 停止。
- **基线披露**：PR #57 对 `customer-directive.ts` 同文件不同区域加法、需合并并重跑；HEAD `c2f1630`；B0 v2；方案行号漂移。
- **开放点披露**：测试缝仅测试装配、生产 capability 无法打开；`.ans/state/download-consumer.json` 的 `enabledAt`/不可读/同毫秒边界；`RejectionOwner` 回退条件；`governance-judge-verdict.ts` 的闸门 2 写集增补。

### 6.4 桌面窗口（C1：能力注入/卡片/生命周期/判断闭包/manual 升级/审计归属）

- **写集检查**：`app/desktop/download-request.ts`（新）、`session.ts`、`customer-input.ts`、`interface.ts`、`app/main.ts`、`app/desktop/i18n.ts`（条件）、`test/桌面应用/download-request.test.ts` + `download-decision.test.ts`（B-4）、按需既有精确测试、自身 docs/change；`app/preload.cjs` 预期不改；不得新建第三个 `test/桌面应用/` 文件。
- **契约检查**：能力注入形状；卡片 `metadata`/`judgeContext`（W-3，不设 `unavailableReason`；事实失败省略 `judgeContext` + `judgeNotice` 转客户卡）；presenter/lifecycle；`request.*` 归属（customer/judge）；W-2 闭包条件；W-4 `planJudge` 透传；`settleJudgeOutcome` 下载 manual/`unavailableReason` 防御转客户卡；项目角色仍无 `request_confirmation`；关窗/中止 fail-closed。
- **测试检查**：AC-3/AC-4/AC-5（桌面侧）/AC-6/AC-14（面板数据）/AC-16/AC-17/AC-21/AC-22/AC-24/AC-25/AC-27/AC-28；目标测试 + `node --test` 既有精确文件 + typecheck；候选哈希。
- **AC 映射**：AC-3/4/6/14/16/17/21/22/24/25/27/28。
- **边界外需求**：`app/preload.cjs` 新 IPC、第三个 `test/桌面应用/` 文件、写 `app/renderer/**`、新增设计外能力/卡种 → 停止回报。
- **基线披露**：PR #58 对 `customer-input.ts`（+39 行）同文件不同区域、需合并并重跑；PR #57 对 `session.ts`/`interface.ts`/`app/main.ts` 有改动；HEAD `c2f1630`；B0 v2。
- **开放点披露**：W-1–W-8 逐项测试；judge facts ≤2 KiB；指纹去重只升级一次；manual 不 auto-rework；不消耗预授权；B1 presenter 的 `GovernanceJudgeFacts`/归属键/`factsAvailable` 闭合（P1 审核 F1）；运行时生命周期/`downloadId`/presenter 形状（F2）；G8 面板视图（F3）。

### 6.5 桌面UI（C2：结果行/卡面/面板消费）

- **写集检查**：`app/renderer/src/chat/judge.ts`、`decision-dialog.ts`/`decision-card.ts`（条件）、样式（按需）、`test/桌面UI/download-card.test.ts`（新）+ 按需既有测试、自身 docs/change；不得写 `app/desktop/**`、`src/**`、preload。
- **契约检查**：只按 preload 白名单通道与主→渲染事件消费；不实现 IPC、不判路径/URL、不调用判断器；未知 `cardKind` 的 confirm 回退（优先复用既有渲染）；judge 结果行复用 `ui.judge.mode.approval`；consumer 标签与 G8 标注只消费 A2 key。
- **测试检查**：AC-19（渲染侧）/AC-3（卡面可读）/AC-14（面板标签）/AC-27（标注）；`node --test "test/桌面UI/**/*.test.ts"`、`npm run typecheck:renderer`、`npm run build:renderer`；候选哈希（`dist/` 非候选）。
- **AC 映射**：AC-3/14/19/27。
- **边界外需求**：要求新增 i18n key（须回 A2）、新增 IPC/依赖/构建配置、渲染层硬编码中文、把渲染侧做成第二判定器 → 停止回报。
- **基线披露**：依赖 A2 key 冻结与 C1 卡片/事件形状冻结；B0 v2 的 `typecheck:renderer`/`build:renderer` 基线；若 C1/A2 变更则重跑。
- **开放点披露**：`directive-store.ts` 写集增补（P1 审核 F5）；G8 旧指令视图语义（F3）；A2 panel 前缀名与 `downloadStartsNow` 删除（只消费 §3.1.4 两个 key）。

### 6.6 通用检查清单（复审参照）

1. **需求拟合**：对照方案 P1.1（`2590b560…`）+ AC-1..AC-29 + G1–G8 A + P1–P9 N/A；不扩大、不弱化、不静默偏离。
2. **写集与边界**：每文件在 Section 1 + H1 B-1..B-4 内；无其他角色路径；无 `docs/scheduling|acceptance|communication`；无第三桌测文件/preload 新 IPC/allowlist 增补。
3. **契约**：单一 primary owner、冻结顺序 A1/A2 → B1 → C1 → C2；消费方只按冻结形状；不复制第二套卡队列/判断器/指令账本/下载账本/写门禁。
4. **测试**：层测试 + AC 映射 + T3 口径 + 真实运行截图（适用时）；不弱化断言、不新增 skip、不把计划写成结果。
5. **边界外需求**：发现即列为阻断，回到闸门 2/IA；不自行扩边界。
6. **基线披露**：HEAD `c2f1630`、PR #57/#58 重叠面、B0 v2、H1、V1 状态、方案行号漂移、证据失效/复用；旧证据不得冒充当前候选。
7. **与工程法案对照**：对照 `角色卡/项目管理/docs/project-rules.md` 当前已确认条目；缺失/草案不当作约束；记录冲突/缺口。

### 6.7 审核结论三值（定义，不预写复审结论）

- **`recommend approval`**：提案与 P1.1/AC/团队计划一致；写集在 Section 1 + H1 内；契约完整、可冻结；测试/证据/AC 映射与基线披露齐备；无边界外需求或未披露风险。
- **`needs revision`**：存在可由原角色修订的材料缺口（写集遗漏/越界、契约歧义、测试或 AC 映射缺失、基线披露不全、文案/计数不一致）；修订后按新版本复审。
- **`not ready`**：无法进入实质审核（提案缺失或版本不匹配；V1/B0/H1 未满足；边界外需求需闸门 2/IA；关键依赖未决）；补齐前不进入 A1/A2/B1/C1/C2。

> P1 审核/Revision 1 复审已完成（复审结论 `needs revision`，记录 501 行 / `7f8a3ea5…`；原 340 行 / `503aaf34…` 保留）；本文件为 A2 Revision 2。最终复审由统筹另行通知；复审须使用新行数/SHA-256，旧版本 `37c74edb…` 不复用。

### 6.8 自身提案的审核披露

- 本提案由项目管理上下文撰写；P1 审核也由同一项目管理上下文执行。按 `references/proposal-review.md`，评审自身共享代码/实现提案时接受同等实质检查，但**不虚构独立审核人、不设第二个项目管理角色**；审核记录已披露作者身份，A2 的结论按自检记录，不冒充独立审核。
- C1/C2 作为 A2 key 的消费方，可在统筹安排的独立角色上下文中提供只读影响评估；未获得评估时如实记为缺口，不声称其同意。
- 审核通过（或复审通过）不替代 V1 经沟通确认、实施授权、独立验收或客户闸门；A2 实施仍需复审通过 + V1 确认 + 统筹派发。

## 七、风险、替代与开放点

### 7.1 风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 1 | key 命名与 §8.3 建议名不一致（`ui.directive.panel.consumer.*`） | 消费方按错误名实现、类型失败或文案分叉 | §3.2 显式映射；A2 先冻结；C1/C2 只按 §3.1 消费；若复审要求改回，必须在 A2 实施前统一改名并重跑计数 |
| 2 | `downloadStartsNow` 已删除，未来若客户改选 G8 B/C | 需要新增 key | 当前 G8 A 下无消费点；删除避免死 key；未来按 key 增量补并更新计数，不预先保留 |
| 3 | 计数耦合（37 key → 1783） | 漏/多 key 导致测试失败 | 精确计数断言 + `DOWNLOAD_KEYS` 清单 + 家族计数；实际不符时停止，不改计数迁就 |
| 4 | 需要 allowlist 新条目 | 写集增量/闸门 2 | 预期不改；需要时停止回报，不自行添加 |
| 5 | zh/en 占位符不一致 | 运行时插值缺失/英文显示 `{param}` | 测试逐 key 比较占位符集合 |
| 6 | en-US 含 Han | 英文泄漏测试失败 | 使用 §3.1 英文值；既有全局零 Han 测试 |
| 7 | C1/C2 需要表外 key 或自行加 key（filenameSource/owner/action 等） | 类型失败/文案分叉/审核退回 | §4.4 停止条件；所有新 key 回 A2；§3.2 已冻结文件名来源/action-owner 口径 |
| 8 | `{detail}`/`{target}` 含凭据/响应体/绝对路径 | 泄露/AC-17 失败 | 文案层不提供；B1/C1 负责净化并在测试中断言 |
| 9 | 指令旧标注缺少 B1/C1 视图数据 | C2 无法区分 legacy/new，AC-27 标注缺失 | B1/C1 必须按 P1 审核 F3 冻结 epoch/legacy 视图字段；A2 key 已就绪；未提供则停止回报，不用前端猜 |
| 10 | V1 尚未经沟通确认 | P1 入口条件不完整，A2 不得实施 | §1.3 开放项；等沟通确认与统筹派发 |
| 11 | 基线继续前进 | 哈希/计数/证据失效 | 实施前重跑 §5.2；i18n 未被 PR #57/#58 触碰，但仍以实施时实际基线为准 |
| 12 | 新增测试使项目管理套件计数变化 | 与 B0 v2 的 175 tests 不同 | 如实记录实际 tests/pass/fail/skip；5 项既有平台 skip 不变；不新增 skip |
| 13 | 自审偏差（A2 与审核同一上下文） | 自检可能漏判 | 审核记录已披露作者身份；C1/C2 可经统筹安排只读评估；复审按新版本/Hash；不虚构独立审核人 |
| 14 | G1 A 提示文案/mechanical 三项被消费方忽略 | G1/AC-3 不完整 | §3.2/§3.5 显式映射；C1 修订后必须消费 `gitignoreHint` 与三项 mechanical；复审检查 |
| 15 | `completed` 误留/误传 final URL | 客户行占位符/缺值 | Revision 2 已删除 `{finalUrl}`；`completed` 占位符仅 host/path/bytes/sha/source；测试显式断言 |

### 7.2 替代方案（修订后）

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| A. 卡片标签放 `ui.*`（渲染层） | 否决 | 卡片 `title`/`preview` 由主进程以字符串构造（`customer-input.ts` 直接使用 `request.title`/`preview`），渲染层不负责再翻译；`main.*` 与方案 §8.3 一致，避免重复 key |
| B. 严格使用 §8.3 的 `ui.directive.consumer.download*` | 否决（改用 `ui.directive.panel.consumer.*`） | 既有 consumer 映射（`CONSUMER_KEYS`）与面板 key 家族均为 `ui.directive.panel.consumer.*`；单一家族更易维护；映射已披露 |
| C. 新增 `ui.download.judge.group.approval` | 否决 | `ui.judge.mode.approval` 已按 `approval` 组消费（主进程与渲染层两处）；新增同义 key 属重复 |
| D. 不新增 `main.download.notice.directiveSource`，用既有 panel 标题拼 `#id` | 否决 | 既有 `ui.directive.panel.approvalTitle` 是面板标题（英文复数），不适合完成回执的单数来源标签；新增 1 个 key 更清晰且可测试 |
| E. 失败只给通用 `{detail}`，不建 17 个 per-code key | 否决 | §8.3/AC-19 要求按 code 的稳定人话；per-code key 可冻结、可测试、可本地化 |
| F. 保留 `downloadStartsNow`（G8 B 未选） | 否决（采用删除） | G8 A 下无消费点；保留会产生死 key，且可能被误读为 B 已实施；删除后 37 key 不含该 key；未来选 B/C 再补 |
| G. G1 A 提示并入 `notice.completed` | 否决（采用独立 `gitignoreHint`） | 完成回执字段已多，条件提示独立更清晰；不改变 completed 的语义；C1 best-effort 追加 |
| H. `mechanical` 只保留三项 | **采用三项** | C1/B1 修订版统一 `scheme/publicHost/publicIps`；`credentialsAbsent`/`filenameSafe` 留在 facts/审计；五项会多出无消费死 key（Revision 2 按 PM 复审 R1） |
| I. `completed` 含 final URL | **采用不含** | C1 §4.5/§8.3 明确客户成功系统行不含 final URL；final URL 仅在 agent-facing 工具成功回执；避免客户行缺值/占位符（Revision 2 按 PM 复审 R1） |
| J. 为文件名来源新增值 key | 否决（C1 不显示来源标签） | AC-3 只要求预期文件名；`filenameSource` 留在 facts/审计；避免 4 个值 key 膨胀；若 AC 要求再补 |

### 7.3 开放点（修订后）

1. **V1 经沟通确认**：V1 文件自述「等待沟通核对确认」；A2 实施前须由沟通确认（路径/版本），否则 P1 入口不完整。本提案不自行认证。
2. **`downloadStartsNow`**：已按 P1 审核记录删除（G8 A 无消费点、B/C 未实施）；最终 37 key 不含该 key。若未来客户改选 B/C，按 key 增量补 `ui.directive.panel.consumer.downloadStartsNow` 并更新计数。
3. **`mechanical` 三项**：按 Revision 1 复审 R1 收敛为 `scheme/publicHost/publicIps`；`credentialsAbsent`/`filenameSafe` 保留在 B1 `DownloadJudgeFacts`/判断/审计，不在客户卡单列；C1 修订后逐项展示三项，不硬编码。
4. **文件名来源**：本提案不新增值 key，C1 不显示来源标签；若 AC-3/验收明确要求客户可见来源，A2 增补 `main.download.card.filenameSource.*` 值 key 并更新计数，不由 C1 自行加 key。
5. **`notice.failed` 的 action/owner**：客户系统行只 reason+code；agent-facing 工具回执保留「下一步/谁来做」。若客户/验收要求客户回执也含 action/owner，A2 增补 owner/action key 并更新计数，先回报再增补。
6. **B1/C1 的 legacy 视图字段**：`downloadLegacyOff` 的渲染需要 B1/C1 在 `CustomerDirectiveView` 或面板数据中提供「早于 enabledAt」状态；A2 只提供文案 key，不判 epoch。若 B1/C1 不提供，AC-27 标注无法实现，按 P1 审核 F3 由 B1/C1 修订。
7. **`main.download.error.factsMissing` 等的实际消费点**：部分错误码可能只在 judge manual/内部路径出现、不直接进客户系统行；key 仍作为稳定 code→文案映射保留；若复审要求只保留有消费点的 key，按 §4.4 停止回报并统一裁剪，不由消费方各自判断。
8. **精确测试总数**：新增测试后项目管理套件总数会大于 B0 v2 的 175；本提案不预设最终总数，实施记录如实给出 tests/pass/fail/skip。
9. **复审版本**：本文件为 A2 **Revision 2**（按 Revision 1 复审 R1）；复审须使用新行数/SHA-256（旧版 458 行 / `37c74edb…` 不复用）。最终复审由统筹另行通知；本文件不复审其他角色提案。

## 八、声明

- 本提案**不写任何产品代码或产品测试**；状态 **`proposal-only, no code`**（A2 Revision 2）。未实施、未测试、未验收、未提交、未推送、未合并、未发布。
- 本提案是 P1 审核/Revision 1 复审记录（复审结论 `needs revision`，501 行 / `7f8a3ea5…`；原 340 行 / `503aaf34…` 保留）后的 A2 **Revision 2**；旧版（458 行 / `37c74edb…`）哈希不复用。最终复审由统筹另行通知；本文件不复审其他角色提案。
- **自审披露**：A2 提案与 P1 审核由同一项目管理上下文完成；A2 的审核评估是自检，不虚构独立审核人/第二个项目管理角色；C1/C2 的只读影响评估未获得时如实记为缺口。
- 本提案不改变方案 P1.1、G1–G8 A、P1–P9 未选、T3、AC-1..AC-29、任何角色边界或写集。若实施需要改变 key 契约、写集、边界或方案口径，停止并回报统筹，按技能重开闸门 1/2。
- 本提案不是客户确认、不是实施授权、不是验收标准、不是验收结论；A2 实施须待复审通过 + V1 经沟通确认 + 统筹派发。
