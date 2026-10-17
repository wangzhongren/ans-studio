---
id: existing-project-compat-verify
type: change
title: 2026-10-17 已有角色但无治理记录的项目兼容（B+C V1）独立验证报告（测试角色）
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: verified
revision: 3
related: [existing-project-compat, existing-project-compat-review]
events:
  - date: "2026-10-17"
    kind: verified
    summary: B+C V1 独立验证完成——整体通过（0 不通过 / 7 备注）；自建 42 例独立套件全绿（状态/预览/建立/不变量/契约接线/权限审计）；全量 2150/2055/93红/2skip（93 红全部归因既有环境：依赖缺件 75、Windows EPERM 8、CRLF 源钉 9、计时竞态 1，均与本轮实现无交集）；typecheck 85 错全部为既有依赖缺件（本批/本轮实现文件 0 错）；40 个改动/新增文件逐条落在属主 boundary.yaml 内，零越界
  - date: "2026-10-17"
    kind: reverified
    summary: 编排按备注②/⑤修正两处文案（来源常量改为「操作者点击确认」；写入中断消息改为「请核对现场；不会自动覆盖已存在的 .ans」且不承诺重试）——复审：独立套件 42/42 仍全绿（B5/B12 按新文案更新并加反向断言），全量 2150/2055/93红/2skip 与修正前逐位相同（93 红无新增、归因不变），typecheck 85 错不变，冻结复算 24/24
  - date: "2026-10-17"
    kind: reverified
    summary: 渲染轮复审（助手消息即时 Markdown）——全量 2153/2058/93红/2skip（较上轮 +1 测试、红数 93 与归因不变）；uiux-v2 e2e 原失败点「routine collapsed; failure direct; assistant untouched」已通过，仅剩既有「virtual visible nonempty」（:1044）——用 HEAD renderer（7d18858b）隔离 A/B 独立复现同点同失败，证明非本轮引入；独立 Electron 探针 6/6（appendAssistant 恒 mdReady:true、未 settled 即 `<h2>/<table>`、旧安全网在位、settled 不重复/不回退）
---

# 2026-10-17 已有角色但无治理记录的项目兼容（B+C V1）独立验证报告（测试角色）

**验证对象**：工作树中**未提交**的「已有角色但无治理记录的项目兼容（B+C V1）」实现——
门禁引擎（A1 种子边界 Service 公共出口、I5 F6 恢复指引）、编排（I3 `previewGovernanceRecord` /
`establishGovernanceRecord` / B2 薄再导出）、桌面窗口（I1 状态派生、I2/C1 IPC 与守卫）、桌面UI
（I4 状态行/su 空态/预览面板/文案）。批准口径＝客户 2026-10-17「推进吧，按 B+C 来」；
实施与验收口径＝PM 评审 [`2026-10-17_design_existing-project-compat-review.md`](../../../项目管理/docs/design/2026-10-17_design_existing-project-compat-review.md)
§二–§六（V1–V8、V6b、N1–N8、§6.4）；产品提案 [`2026-10-17_design_existing-project-compat.md`](../../../产品/docs/design/2026-10-17_design_existing-project-compat.md) §四/§七。

**整体结论：通过（0 项不通过；7 项备注/未覆盖边界，均如实列明，不影响 V1 批准范围的落地判定）。**

**复审（reverified）**：编排已按本报告备注②/⑤修正两处文案（语义与契约不变，见 §⑤-④/⑤）。
独立套件重跑 **42/42 全绿**；全量 **2150/2055/93红/2skip** 与修正前逐位相同（93 红无新增、归因不变）；
typecheck **85 错**不变；冻结复算 **24/24**。复审证据见证据目录 `reverify-*`。

本报告全部原始证据落在
[`2026-10-17-existing-project-compat-verify-evidence/`](2026-10-17-existing-project-compat-verify-evidence/)
（下称「证据目录」）；独立用例＝
[`test/测试/existing-project-compat-verify/`](../../../../test/测试/existing-project-compat-verify/)
（**42 例** 5 个用例文件 + 1 个夹具文件）。**独立构造**：夹具、断言、SHA-256 复算、目录树快照全部由本角色自建；
对实施方测试文件**零 import**（只读导入产品公开面与源码字面）；不复用实施方断言。
全程只写 `test/测试/` 与 `角色卡/测试/`；未改任何产品文件与他方文件；**未 git 提交**；
**未运行任何需要真实凭据/模型的 su 会话**（真实 su 落盘按口径交客户本人）。

---

## ① 冻结绑定（本结论对应哪一版工作树）

- HEAD＝`b9d4a3d`（branch `main`）；本轮改动**全部未 commit**、停在**工作树**。
- 冻结集＝`git status --short` 快照（35 改 + 5 新增，见证据 `git-status-short.txt`）；
  关键实现/测试文件 sha256 见证据 `sha256-freeze.txt`（24 条目，含本批 6 个新文件）。
- **复审绑定**：编排修正文案后重新冻结——`reverify-sha256-freeze.txt`（24/24 逐字节一致，2026-10-17）。
  自该冻结后本轮产品文件与测试文件未再变化；本报告 §④/§⑤ 的复审结论绑定该冻结。
- 关键指纹（sha256 前 16；复审后）：

| 文件 | sha256（前 16） | 备注 |
|---|---|---|
| `src/common/编排/finalize.ts` | `4344840c7bfafca8` | I3 预览/建立、一次性种子边界、互斥；**复审更新**：来源常量改为「（操作者点击确认）」、写入中断消息改为「请核对现场；不会自动覆盖已存在的 .ans」 |
| `src/pipeline/orchestration/govern-session.ts` | `52bb4a69ed276e98` | B2 薄再导出 |
| `src/service/boundary/resolve-boundary.ts` | `30ead8003d79a4cc` | A1 同一函数引用再导出 |
| `src/service/gate/resolve-write.ts` | `ae82227dd857ba50` | I5 F6 指引（首句逐字保留） |
| `app/desktop/project.ts` | `ca9280c73d3a1cc4` | `deriveGovernanceRecord` 纯派生 |
| `app/desktop/interface.ts` | `b9ccf4247692158a` | IPC 守卫 + `governanceRecord` |
| `app/renderer/renderer.js` | `05190e214afb3e8f` | 状态行/空态/预览面板 |
| `app/renderer/ui-labels.js` | `890a0afce2d24d69` | 可见谓词/文案纯函数 |

> 指纹用于把本结论绑定到当轮工作树；未来任何字节变化都需重新验证。

## ② 独立夹具（与客户现场同形状）

`fixture.ts` 自建：

- **S1 夹具**：临时项目根 + N 个角色目录（缺省 `alpha/beta/gamma`），每目录 `role-card.md` +
  **仅** `boundary.md`（旧版 Markdown 表格式 Section 1），**无** `.ans/project.json`。
  依据 PM 评审 §八-4：客户「只有 boundary.md」指**边界文件**，`role-card.md` 必须存在。
- **混合形态**：可选角色用 `boundary.yaml`（验证 `legacyBoundaryRoleIds` 只列 `.md`）。
- **S1b**：S1 + 既有 `角色卡/governance-boundary.yaml`（三普通目录）。
- **N5 变体**：额外 `delta`（只有 role-card）与 `epsilon`（只有 boundary）。
- **S2/S3/S4 检测面**：结构可用 `.ans`（pin 形状合法）/ 非法 JSON / `accepted:true` 无 pin /
  篡改被 pin 文件 / 伪造 pin 哈希。
- **树快照**：相对路径 + 文件大小 + mtime（含目录），用于「零写入/零副作用」前后逐条比对。
- 真实判定链：`listProject` → `buildEffectiveProjectConfig` → `resolveBoundarySection` → `resolveWrite`；
  机制经 **Pipeline 公共出口**（`govern-session.ts`）调用，与桌面接线同源。

## ③ 逐项验收结果

### 3.1 主路径（PM 评审 §6.1）

| # | 场景 | 结果 | 独立证据（用例 / 事实） |
|---|---|---|---|
| V1 | 状态识别 | **通过** | A1/A12：S1 → `governanceRecord.state="missing"` + `hasRoles=true`；空项目 → `missing` + `hasRoles=false`（两字段相互独立）；列举前后目录树 + mtime 完全一致（零写入） |
| V2 | 成功建立 | **通过** | B1：三产物落盘（顺序 `角色卡/governance-boundary.yaml` → `.ans/project.json` → `docs/bootstrap-manifest.md`）；`.ans` 可解析、`governanceBoundary.path` 非空、`acceptance.accepted===true`、`acceptance.source` 逐字＝机制常量；pin 覆盖治理文档 + 全部可 pin 角色边界，**逐条独立实算 node:crypto SHA-256 比对一致**；manifest 的「路径 \| 哈希」表与实算一致；`finalize.status="completed"` |
| V3 | su 解卡（确定性拆分） | **通过** | B2：建立后真实 `resolveBoundarySection("su")` = accepted、恰 3 条治理目录；真实 `resolveWrite("docs/su/memo.md")` **allowed**；`src/alpha.ts` **仍拒**。真实 su 会话落盘＝客户本人（未跑） |
| V4 | 角色不受影响 | **通过** | B3：建立前后每个项目角色写自身边界内 `src/<id>.ts` 均 allowed、写他人边界均拒；判定逐条相等 |
| V5 | 取消零副作用 | **通过** | A5/A6/B4：预览/采纳预览前后目录树 + mtime 一致；`cancelGovernancePreview` 函数体内无任何 `d.*` IPC 调用（源码级），文案「已取消，未写入任何文件」 |
| V6 | 失败零副作用（收窄） | **通过** | B6：guard 四态（already-established / invalid-record / no-roles / 桌面 invalid-request）全部零写入；B6b：precheck 层（`finalizeBootstrap` 直调）`nothing-to-pin` 与门禁拒 `blocked` 均零写入、全有或全无 |
| V6b | 写入阶段失败（新增） | **通过** | B5：注入 `docs` 为文件 → `phase==="write"`、`ok===false`、`finalize.status="blocked"`、message 含「写入中断／可能已写入部分文件」且**不含**「未写入任何文件」；实证治理文档 + `.ans` 已部分落盘、manifest 未写；文案层 `governanceFailureView("write")` 同样**绝不**追加「未写入任何文件」 |
| V7 | 幂等 | **通过** | A9/B7：`.ans` 有效时 preview/establish 均拒绝（`already-established`），树快照与 `.ans` mtime 不变；动作谓词 `canEstablishGovernance(..., "present")===false`；`.ans` 无效 → `invalid-record`（不覆盖） |
| V8 | 不误用确认卡 | **通过** | C2：未接受边界上用真实 `createConfirmedWriteIssuer` + `confirmed:true` 确认 `docs/su/memo.md` → 发行集合为空（F6 先于 F4）；带 writeSet 重试仍 F6；`.ans` 未产生 |

### 3.2 负例与状态边界（PM 评审 §6.2）

| # | 场景 | 结果 | 独立证据 |
|---|---|---|---|
| N1 | `.ans` 非法 JSON | **通过（检测面）** | A3：`state="invalid"` + 非空 `reason`（含「不可解析/fail-closed」）；不自动覆盖、零写入 |
| N2 | `accepted:true` 无 pin | **通过（检测面）** | A4：载入器终态规则降级 → `state="invalid"` + reason（含「未提供 pin」）；不回退导入授权 |
| N3 | pin 不符（S4） | **V2 范围（本版不检测）** | A13 钉住文档化限制：pin 哈希不符的 `.ans` 仍显示 `present`，但真实边界解析未接受、写入被拒——`present ≠ su 可写` 成立 |
| N4 | S1b 既有治理文档 | **通过** | A6：`adoptExistingGovernanceDoc=true`、写路径不含治理文档、pin 含该文档；A7/A7b：`entries: []` 与 YAML 语法错误均 `unparseable-governance-doc` 且零写入；B9：采纳后内容不被覆盖 |
| N5 | 缺 role-card/边界的角色 | **通过** | C4：`delta`（缺边界）/`epsilon`（缺角色卡）不进 `roleIds`/`pinPaths`、不被 pin、`.ans.roles` 不含 |
| N6 | 无可 pin 之物 | **通过（precheck 层）** | B6b：`finalizeBootstrap` 直调 → `nothing-to-pin`、零写入。**备注①**：经 preview/establish 入口结构性不可达（详见 §⑤） |
| N7 | 空项目 S0 | **通过** | C5：空项目 `hasRoles=false` 且桌面配置带 `genesisBootstrap`、su 获三目录种子；**有角色 ⇒ 无 `genesisBootstrap`**（既有断言保持）、su 仍 F6 |
| N8 | CLI `ans govern <目录>` | **通过** | C5：未建立 S1 目录 → `loadInjection` 仍注入有界创世授权（`roles={}`、`gov.path=""`）；建立后 → `source.kind="ans"`、不再注入。既有兜底路径未被破坏 |

### 3.3 不变量（提案 §四）

| 不变量 | 结果 | 证据 |
|---|---|---|
| F6 fail-closed；首句逐字保留 | **通过** | C1：未接受边界拒一切写；reason 以 `边界未被接受或缺少证据来源（F6）：拒绝一切写入。` 开头且**恰出现一次**；两份 `format-denial`（runtime-core / pi-adapter）输出逐字相同且都带出完整指引 |
| 指引文案纪律 | **通过** | C1：含「建立治理记录」「ans govern <项目目录>」「需已配置模型与凭据」「程序不会自动覆盖或重新接受」；**不含**「项目角色不受影响」；不猜 S1/S3/S4 |
| 一次性边界不持久化 | **通过** | B1：`.ans` 无 `genesisBootstrap`、无 `genesis`/「创世种子」标记；B9：删 `.ans` 后重新建立采纳既有治理文档、新 pin 反映当刻字节；B11：预览后改动边界 → 建立 pin = 建立当刻字节（不信任预览快照）；C8：连续预览等价且零写入 |
| pin 生成/校验算法不变 | **通过** | B1：pin 与 node:crypto 独立实算逐条一致（生成）；C3：改被 pin 文件字节 / 伪造 pin 哈希 → su 边界退回未接受、`parseError` 指向 SHA-256（校验） |
| 不 blanket / 有界 | **通过** | B10：Service 再导出与门禁引擎私有实现**同一函数引用**；种子条目恰 `角色卡/`、`docs/`、`.ans/`（不含 `src/**`）；B2 su 写 `src/**` 仍拒 |
| 程序不得自判 accepted | **通过** | A/B 全链：无自动调用；establish 仅由确认按钮触发（E4：`renderer.js` 中 establish 调用点恰 1 处、无计时器）；C1 未建立时 su 仍 F6 |
| 桌面授权链单一来源 | **通过** | 代码核对 `interface.ts::listProject` 走 `buildEffectiveProjectConfig`（`.ans` 优先/回退/ fail-closed），未复制第二份 `.ans` 读取 |

### 3.4 契约接线（PM 评审 §四.2/§4.6）

| 项 | 结果 | 证据 |
|---|---|---|
| IPC 通道名/signature | **通过** | E1：`project:governance-preview`、`project:governance-establish` 在 `main.ts` 注册；preload 暴露同名方法；establish 固定 `{ projectRoot, confirm: true }`；无别名通道 |
| 渲染侧消费 | **通过** | E2/E4：仅经 `window.desktop` 方法；无 `ipcRenderer`；`governanceRecord` 只认三态；establish 调用点唯一、零计时器 |
| 桌面守卫 1–3 | **通过** | A10/B6：非当前导入项目 → `invalid-request`；`confirm!==true` → `invalid-request`；同项目并发 → 机制内 `busy`（本层不造第二份互斥） |
| 成功后刷新 | **通过（代码核对）** | `establish` 成功后 `refreshStaleBoundaries()` → 清列举缓存 → `emitProjectChanged`；刷新异常不回写已成功回执（`try/catch`） |
| 并发不双写 | **通过** | B8：同项目两次 establish → 恰一次 `ok`、一次 `busy`；pin 集恰一份、逐条实算一致 |

## ④ 全量与 typecheck（独立复跑）

| 命令 | 基线（未含本批） | 终态（含本批 42 例） | 复审（文案修正后） |
|---|---|---|---|
| `node --test "test/**/*.test.ts"` | **2108 / 2014 pass / 92 fail / 2 skip**（exit 1） | **2150 / 2055 pass / 93 fail / 2 skip**（exit 1） | **2150 / 2055 / 93 / 2**（exit 1；与修正前逐位相同） |
| `npm run typecheck` | **85 错**（exit 1） | **85 错**（exit 1；本批与本轮实现文件 **0** 错） | **85 错**（不变） |
| 本批独立套件 | — | **42/42 pass**（5 文件 + 夹具；`verify-suite-output.txt`） | **42/42 pass**（`reverify-verify-suite-output.txt`） |

**93 红归因（逐类核对，均非本轮引入；详见证据 `full-suite-summary.md`）**：

| 类别 | 条数 | 依据 |
|---|---|---|
| 依赖缺件（zod / claude-agent-sdk / mcp sdk / codex） | 75 | `Cannot find package …` / `… requires @…`；typecheck 同源 29 条 TS2307 |
| Windows 符号链接 EPERM | 8 | `EPERM … syscall: 'symlink'`（runtime-core ×3、pi-adapter ×2、g3/g4/编排 ×1） |
| CRLF 下 `\n` 锚点失配 | 9 | `core.autocrlf=true`：未改动文件亦全 CRLF；含任务书已列 renderer.test 4 + markdown 1，另 g2 ×3、g4v2 ×1 |
| 计时竞态（`runtime-core/tools.test.ts` abort-shell） | 1 | 基线通过、全量负载下失败、单独复跑通过（`flaky-abort-recheck.txt`） |

> 任务书「已知基线」只列 6 条；本机实际环境红更多（未安装依赖 + Windows/CRLF）。逐条核对后：
> 依赖缺件/EPERM 用例不涉及本轮 11 个实现文件；CRLF 类均为「源码字面正则依赖 LF」检查，
> `renderer.js` 的 U1 失败断言指向的代码段不在本轮 diff 内；计时竞态用例属未改动的 runtime-core。
> 未发现任何一条红由本轮实现引入。

## ⑤ 未覆盖项、备注与原因（如实登记）

1. **真实 su 会话/真实模型落盘**：按项目纪律由客户本人运行（凭据/网络），本报告只交付确定性
   `resolveBoundarySection + resolveWrite` 证据（V3 拆分口径）。
2. **真实 Electron/桌面端到端**（状态行、su 空态、预览面板的实际渲染与点击）：本轮未运行。
   `test/桌面应用/e2e/` 不在测试角色边界；已用「纯函数 + 源码契约 + 真实 Interface 流程」覆盖其判定面
   （A/B/E 套件），实际像素/交互观感仍属桌面UI 的 e2e 回归范畴。
3. **备注①（N6 / precheck 分支结构性不可达）**：`previewGovernanceRecord`/`establishGovernanceRecord`
   先判 `hasRoles`，再在机制内部构造种子边界；种子恒覆盖三条写路径，故 `nothing-to-pin` /
   `blocked` 经这两个入口**不可达**（死分支但方向 fail-closed）。底层 precheck 语义经
   `finalizeBootstrap` 直调验证（B6b）。
4. **备注②（V6b 文案与 `.ans` 已落盘子场景）——已由编排修正（复审）**：旧 message 承诺
   「请重新执行（会安全采纳既有治理边界文档）」，而 `.ans` 已落盘时重跑会得到 `already-established`。
   编排已改为逐字：`写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），
   请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。`——不再承诺重试、明示不覆盖；
   `phase:"write"`、`ok:false`、不自动重试、不清理已写产物均不变。本批 B5/B12 已按新文案更新
   （含「不得出现『重新执行』」反向断言），复审 42/42 全绿。
5. **备注③（跨进程并发）**：进程内互斥成立（B8）；两个桌面实例/CLI 无全局锁（设计 §七-4 已登记），
   最坏写出同构产物、不产生额外权限。本机未做跨进程实测。
6. **备注④（`present` 语义）**：`present` 只表结构可用，不校验 pin 逐文件哈希（A13 实证）；
   UI 文案「治理记录已存在」不得读成「su 现在可以写」——属 V1 文档化限制（V2 增加 pin 校验态）。
7. **备注⑤（acceptance.source 措辞）——已由编排修正（复审）**：旧常量
   `desktop-app:…（仅本次，不持久化）` 会被逐字写入 `.ans` 的 `acceptance.source`，与持久化事实冲突。
   编排已改为 `desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）`；
   一次性的是**种子边界对象**（常量注释已如实区分）。本批 B1 引用常量、无硬编码，复审自然通过。

**未发现需要返工的真实缺陷。**

## ⑥ 权限边界审计（本轮 `git status` 逐文件）

- 清单：35 个修改 + 5 个新增（含产品/PM 评审文档），逐一匹配属主 `boundary.yaml` 的
  file / directory / conditional-directory 条目 → **40/40 落在属主 Section 1 内，零越界**
  （用例 D1；证据 `git-status-short.txt` + 属主边界文件）。
- 分解：桌面窗口 11（app 4 + `test/桌面应用` 3 + 角色卡 4）、桌面UI 8（app/renderer 3 +
  测试 1 + 角色卡 4）、编排 7（src 2 + 新测试 1 + 角色卡 4）、门禁引擎 7（src 2 + 新测试 2 +
  角色卡 3）、产品 4、项目管理 3。测试角色自身新增 6 文件全在 `test/测试/` 目录条目内（D2/D3）。
- 未发现任何文件落在未授权路径，也未发现测试文件被产品代码引用。

## ⑦ 复跑方式

```bash
node --test "test/测试/existing-project-compat-verify/*.test.ts"   # 本批 42 例
node --test "test/**/*.test.ts"                                    # 全量（必须三层 glob）
npm run typecheck
```

证据目录：`sha256-freeze.txt`（24 文件指纹）、`git-status-short.txt`（工作树快照）、
`verify-suite-output.txt`（42/42）、`flaky-abort-recheck.txt`（计时竞态单跑通过）、
`full-suite-summary.md`（全量计数与 93 红归因）、`typecheck-summary.md`（85 错分布）。

**复审（reverified）证据**：`reverify-sha256-freeze.txt`（24/24 逐字节一致）、
`reverify-verify-suite-output.txt`（42/42）、`reverify-full-suite-counts.txt`
（2150/2055/93/2，分类同前）、`reverify-flaky-abort-recheck.txt`（计时竞态单跑通过）、
`reverify-summary.md`（两处文案修正与断言更新说明）。

## ⑧ 渲染轮复审（助手消息即时 Markdown，2026-10-17）

**范围**：桌面UI 的渲染改动（`appendAssistant` 恒 `mdReady:true`；旧行升级仅作安全网）及
`test/桌面应用/e2e/uiux-v2.mjs` 两处 `.trim()` 断言修订。本轮**只验证**、不修改产品代码。

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 全量 | **2153 / 2058 pass / 93 fail / 2 skip**；较上轮 2152/2057/93/2 仅 +1 测试（并发属主），**红数 93 与组成不变** | `renderer-round-summary.md` |
| e2e 当前 renderer | exit 1，**仅** `virtual visible nonempty`（:1044）；其前全部通过，**含原失败点 `routine collapsed; failure direct; assistant untouched`（:964）** | `renderer-round-e2e-current.txt` |
| e2e HEAD renderer 独立 A/B | exit 1，**同点同观测** `virtual visible nonempty`（:1044）——隔离副本 `test/测试/.tmp-e2e-head-arm`（运行后删除），renderer = `git show HEAD:`（sha256 前 8 `7d18858b`，与桌面UI 自报一致） | `renderer-round-e2e-head-arm.txt` |
| 新语义抽查 | 独立 Electron 探针 **6/6**：源码字面 `mdReady:true`；未 settled 的助手消息即 `<h2>/<table>`、内容保留、无 `is-streaming`；settled 不重复插行、不回退；旧行安全网（`upgradeStreamingMarkdown` 仅升级 `mdReady:false`、settled 仍调用）在位 | `renderer-round-md-probe.txt` + `renderer-round-md-probe-report.json` |

**结论**：渲染改动未新增任何红；原失败点已修复；剩余 `virtual visible nonempty` 经独立 A/B 证明
**先于本轮存在**（桌面UI 自报属实），非本轮引入，不判返工；建议由桌面UI/桌面窗口后续独立定位。
（新渲染进程内无 `mdReady:false` 旧行，安全网运行期不可达——如实登记，源码面已验证仍在位。）
