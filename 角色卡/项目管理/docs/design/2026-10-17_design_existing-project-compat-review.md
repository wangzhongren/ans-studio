---
id: existing-project-compat-review
type: design
title: 已有角色但无治理记录的项目兼容——项目管理评审与 V1 拆发
created: "2026-10-17"
updated: "2026-10-17"
status: approved
revision: 2
related: [existing-project-compat]
events:
  - date: "2026-10-17"
    kind: reviewed
    summary: 批准按客户裁定的 B+C 实施并拆发 V1；I5 并入 V1（不判断状态的规范式文案）；钉死 ListProjectResult/预览/建立三处契约与守卫；V6 按真实写入语义收窄并新增 V6b
  - date: "2026-10-17"
    kind: amended
    summary: 按测试角色独立验证的两条文案备注修正——acceptance.source 措辞与写入阶段失败消息；仅如实性修正，契约形状、守卫与验收口径不变
---

# 已有角色但无治理记录的项目兼容——项目管理评审与 V1 拆发

**审查对象**：产品提案 [existing-project-compat](../../../产品/docs/design/2026-10-17_design_existing-project-compat.md)（revision 2，客户已批准）。
**客户裁定（逐字，2026-10-17）**：「推进吧，按 B+C 来。」此前已明确：不要自动创世（A），也不要「su 天生有治理写权」（内置常设权限已否决）。
**本轮性质**：跨角色评审与拆发，**不写代码**。本文是实施口径与派发计划，不是实施结果；代码尚未改动、测试尚未新增。

## 一、结论

**批准按 B+C 实施**，V1 范围＝I1 状态检测、I2 显式动作入口、I3 迁移机制（复用 `finalizeBootstrap`）、I4 预览/状态 UI、I5（并入，见 §三）、I8 测试。**不得改道成 A 或内置常设治理写权**；实施中任何「顺手把内置边界改成 accepted」「给 su 加常驻治理目录」都按候选 G 处理，直接拒收。

批准同时附 **3 条实施口径修正**（不改变 B+C 方案，必须执行）：

1. **I5 的真实文字组装点只有一个**：`src/service/gate/resolve-write.ts:120-124` 的 F6 分支。两份 `format-denial.ts`（运行时核心 / Pi适配器）只是把 `reason` 包成「写入被拒绝：…」并追加 `allowedByRoot` 的渲染器副本；**本项不改渲染器**。任务书所述「两个组装点」与代码不符（见 §八-1）。
2. **I1 在门禁引擎侧无代码改动**：治理记录状态可由桌面窗口用共享载入器的 `source.kind` 与 `project.governanceBoundary.path` 直接派生，不需要改 `ProjectListing` 或边界解析。提案 §八 的「门禁引擎 + 桌面窗口」按此收窄为**桌面窗口**；门禁引擎在 I3 只提供种子边界的公共出口，另按 I5 修改 F6 回执文本。
3. **「失败零副作用」只对门禁/前置拒绝成立**：`finalizeBootstrap` 的 `precheck` 只判门禁放行，不保证写入阶段不中断；`gatedAtomicWrite` 在写入阶段抛错时，可能已经落盘治理边界文档或 `.ans`。V6 必须按此收窄，并新增 V6b；UI 不得无条件宣称「未写入任何文件」（见 §六、§七）。

**没有必须返工的方案级问题。** 上述 3 条是实现口径与验收口径的收紧，B+C 的授权、边界与自终止结构均成立。

## 二、V1 范围（逐项「做什么 / 不做什么」）

### I1 状态检测（属主：桌面窗口）

**做什么**：
- `ListProjectResult` 新增 `governanceRecord: { state: "present" | "missing" | "invalid"; reason?: string }`（形状见 §四）。
- 在 `listProject` 内用**既有单一授权链** `buildEffectiveProjectConfig`（`app/desktop/project.ts:169-182`）读取 `.ans`，由 `source.kind` 与 `project.governanceBoundary.path` 派生状态；派生逻辑抽成纯函数（建议 `deriveGovernanceRecord` 放 `app/desktop/project.ts`），便于单测。
- `S1` 判据＝`hasRoles === true` **且** `governanceRecord.state === "missing"`。
- `state === "invalid"` 时 `reason` 如实取载入器的 `downgradeReason`（如 `.ans` 不可解析、`accepted:true` 无 pin）或等价原因；不猜测、不补写。

**不做什么**：
- 不改 `ProjectListing`、不改门禁引擎的枚举与边界解析。
- 不做 pin 逐文件校验（V1 无 `unverified` 态）；`present` 只表示「记录存在、结构上可用」，**不表示 su 当前一定能写**（S4 pin 不符在 V1 仍显示 `present`，见 §七-6）。
- 不在 `listProject` 写任何文件、创建任何目录、触发任何 finalize。

### I2 显式动作入口（属主：桌面窗口）

**做什么**：
- 新增两条 IPC（名字与形状见 §四），由 `app/main.ts` 注册、`app/preload.cjs` 暴露。
- 动作只能由**操作者在预览面板的确认点击**触发：导入、枚举、settle、定时器、模型工具一律不得调用 establish。
- 主进程校验：`projectRoot` 必须是当前已导入项目（`importedProjectRoot`）、`confirm === true`、同项目无进行中的建立。
- 成功后：清该项目的列举缓存、尽量调用 `refreshStaleBoundaries()` 让空闲的 su 会话按新边界重建，并通知渲染侧重新 `listProject`。
- 取消由渲染侧完成，**不调用任何 IPC**。

**不做什么**：
- 不在导入时自动调用、不弹模态、不做自动重试。
- 不把动作做成模型工具，不接 `request_confirmation`。
- 不让渲染侧传任意路径或任意授权来源；一次性边界由编排在机制内部构造。

### I3 迁移机制（属主：编排；门禁引擎提供种子边界公共出口）

**做什么**：
- 在 `src/common/编排/finalize.ts` 增加 `previewGovernanceRecord` 与 `establishGovernanceRecord`（复用同文件既有 `precheck`、`finalizeBootstrap`、`scanRoles`、`isGenesisState`、`finalizeRelPaths`）；**预览与建立共用同一份前置求值代码**，建立时重新求值，不信任预览快照。
- 一次性边界在函数内部构造：条目＝治理种子三普通目录（`角色卡/`、`docs/`、`.ans/`），`acceptance = { accepted: true, source: <操作者动作来源常量> }`；**只在本次调用内存在**，不写 `ProjectConfig`、不缓存、不跨会话复用。
- 种子边界通过门禁引擎新的 **Service 公共出口**取得（同一函数引用，不复制实现）：`src/service/boundary/resolve-boundary.ts` 增 `export { buildGovernanceSeedBoundaryForGate as buildGovernanceSeedBoundary }`。
- 正常 S1 传 `writeGovernanceBoundaryDoc: true`；盘上已有治理边界文档时先校验其可解析且条目非空，再传 `false` 采纳，**不覆盖**。
- `FinalizeResult` 逐字放入返回信封（不重写 `message`、`status`、`wrote`、`pins`、`roles`）。
- 写入阶段抛错必须捕获并如实返回 `phase: "write"`，消息明确「可能已写入部分文件」。
- 进程内按 `projectRoot` 的进行中互斥；`finally` 释放。

**不做什么**：
- 不改 `resolveWrite` 的 F6/F4 判定顺序与条件，不改 pin 生成/校验算法，不改 `repinIfBootstrapped` 的每轮重 pin 行为。
- 不让调用方传入边界、授权来源或写路径清单。
- 不在 S3/S4 上执行「重建」；`.ans` 存在时一律拒绝覆盖（修复模式属 V2）。
- 不新增流水线文件（`src/pipeline/orchestration/` 只允许已有单文件）；公共出口用 `govern-session.ts` 的薄再导出，避免桌面跨角色导入私有 `common/`。

### I4 预览/状态 UI（属主：桌面UI）

**做什么**：
- 项目状态行：`hasRoles === true && state === "missing"` 时显示「本项目有 N 个项目角色，但尚无治理记录（.ans/project.json）。项目角色可按各自边界工作；治理角色暂时无法写入。」＋按钮。
- su 空态：同一状态给出说明、主按钮、`ans govern <项目目录>` 兜底提示；沿用 `primaryRoleId`，**不硬编码 "su"**。
- 预览面板：列出将写路径、将 pin 的路径/角色数、是否采纳既有治理边界文档、授权来源、旧格式 Markdown 提示；明确「不扩大任何角色写边界、不修改任何角色边界文件内容」。
- 成功/失败/取消/重复点击文案按 §四.5；失败逐字显示 `finalize.message`。
- 成功后重新取 `listProject`，状态变 `present`，动作隐藏。

**不做什么**：
- 不弹模态、不在导入时弹确认框、不把点击描述成「授权给角色」。
- 不把旧格式 `boundary.md` 的问题混进 su 的 F6 解释（独立提示）。
- 不做 S3/S4 修复界面（V2）、不做旧格式迁移（V1b）。
- 不新增 `test/桌面应用/e2e/` 下的文件（不在桌面UI边界）；需要真实 Electron 验证时用既有 `test/桌面应用/e2e/uiux-v2.mjs` 或交测试角色。

### I5 F6 回执恢复指引（并入 V1，见 §三）

### I8 测试（属主：测试；各属主同时补自测）

**做什么**：
- 各属主在既有测试文件内补自测（桌面窗口/桌面UI 的单文件测试不得新增文件）；编排与门禁引擎可在自己的 `test/` 目录下新增文件。
- 测试角色在 `test/测试/existing-project-compat-verify/` 建独立夹具与验证套件（S0/S1/S1b/S3/S4 + legacy 形态），做独立验证与证据记录。
- 全量用三层 glob：`node --test "test/**/*.test.ts"`（两层 glob 会静默漏测）。
- 真实 su 会话写入属凭据/模型路径：由客户本人运行；测试角色交付确定性 gate 断言与桌面可观察证据，不代跑凭据命令。

**不做什么**：
- 不以「测试全绿」代替客户现场验证。
- 不为通过测试放松任何判定、删断言或改 F6/F4 语义。

## 三、I5（F6 回执恢复指引）：并入 V1

**决定：并入 V1。** 采用**不判断状态的规范式文案**（任务书选项 a）。

**理由**：
1. V1 的目的就是解除死局。显式入口只在桌面可见；CLI、其他入口与模型转述仍会读到 F6 原文。回执不指出恢复路径，死局在这些面上仍然存在。
2. 成本低、风险小：沿用 F4 已验收的先例（`resolve-write.ts` 的 `F4_DENIAL_GUIDANCE`，保留原头逐字、其后追加指引），判定条件一行不动。
3. `resolveWrite` 确实拿不到 `.ans` 状态；但规范式文案（「若…；若…」）**不需要**状态，也不会把原因说错。状态感知的精确分类（S1/S3/S4 分句）留 V2，与 `governanceRecord` 的可验证状态一起做。
4. 现在并入可避免 V1 交付一个「有按钮但回执仍是死胡同」的半闭环。

**属主与口径**：
- **真实组装点只有一个**：`src/service/gate/resolve-write.ts` 的 F6 分支（属主：门禁引擎）。保留首句逐字：

  ```text
  边界未被接受或缺少证据来源（F6）：拒绝一切写入。
  ```

  其后追加常量式指引（不重复上述整句，避免破坏 `test/编排/shell-gate.test.ts:370` 的整句计数断言）：

  ```text
  可能的恢复路径：若项目已有角色但缺少 .ans/project.json，请由操作者在桌面点击「建立治理记录」，或在终端运行 ans govern <项目目录>（需已配置模型与凭据）；若 .ans/project.json 已存在，请检查它可解析、accepted:true 且 pin 齐全、被 pin 的边界文件未被改动——程序不会自动覆盖或重新接受。
  ```

- **两份 `format-denial.ts` 本项不改**：它们只是渲染器副本（`src/common/runtime-core/format-denial.ts:23` 与 `src/common/pi-adapter/format-denial.ts:23`，分别属运行时核心与 Pi适配器）。指引写在 `reason` 里，两份渲染器会自动带出。**若未来把原因文本移入渲染层，必须两份同步改并由测试同时断言两份输出**（沿用 `test/门禁引擎/f4-denial-guidance.test.ts` 的同构断言先例）。
- 文案纪律：不说「项目角色不受影响」（在 S3/S4 下不成立）；不猜具体状态；不承诺自动修复；不暗示 `ans govern` 不需要凭据。

**不并入的代价（备选未采纳）**：V1 的回执仍只说「未接受」，模型与客户在非桌面入口仍无路可走；这与「回执不得把原因说错、且应可操作」的产品要求不符。

## 四、跨角色契约（钉死形状，避免漂移）

### 4.1 `ListProjectResult` 新增字段

```ts
export type GovernanceRecordState = "present" | "missing" | "invalid";

export interface GovernanceRecordStatus {
  state: GovernanceRecordState;
  /** 仅 state === "invalid" 时给出：载入器降级/不可解析原因原文（不含凭据）。 */
  reason?: string;
}

export interface ListProjectResult {
  // …既有字段逐字不变…
  governanceRecord: GovernanceRecordStatus;
}
```

| 状态 | 判据（桌面窗口） | 含义 | V1 UI |
| --- | --- | --- | --- |
| `present` | `source.kind === "ans"` 且 `source.acceptance.accepted === true` 且 `project.governanceBoundary.path.trim() !== ""` | 治理记录存在且结构上可用。**不声明 pin 逐文件匹配** | 动作隐藏；不写「su 可写」 |
| `missing` | `source.kind === "builtin-fallback"` | 无 `.ans/project.json` | 仅在 `hasRoles === true` 时显示动作 |
| `invalid` | `source.kind === "ans-invalid"`，或 `source.kind === "ans"` 但 `accepted !== true`，或治理边界路径为空 | 记录存在但不可用（S3） | 显示「治理记录不可用」＋`reason`；**不自动覆盖**；修复属 V2 |

- `governanceRecord` 与 `hasRoles` 相互独立；**动作可见谓词固定为 `hasRoles === true && governanceRecord.state === "missing"`**。
- `S1` 的定义即「`hasRoles === true` 且 `governanceRecord.state === "missing"`」，不得在其他层另立判据。

### 4.2 IPC 通道与 preload 方法

| 层 | 名称 | 请求 | 响应 |
| --- | --- | --- | --- |
| IPC | `project:governance-preview` | `{ projectRoot: string }` | `GovernancePreviewResult` |
| IPC | `project:governance-establish` | `{ projectRoot: string; confirm: true }` | `EstablishGovernanceResult` |
| preload | `previewGovernanceRecord(projectRoot: string)` | 同左 | 同上 |
| preload | `establishGovernanceRecord(projectRoot: string)` | 内部固定发送 `{ projectRoot, confirm: true }` | 同上 |

- 两个方法名与通道名**不得再起别名**；`api-spec.md` 由桌面窗口同步。
- `confirm` 是「操作者已看过预览并确认」的意图标记，不是密码学证据；结构性保证是：只有渲染侧的确认按钮会调用 establish，主进程不在导入/枚举/settle/定时器里调用。

### 4.3 预览形状

```ts
export interface GovernancePreview {
  projectRoot: string;
  governanceBoundaryRel: string;        // 预期 "角色卡/governance-boundary.yaml"
  writePaths: string[];                 // 本次将写的项目相对路径（写入顺序）
  pinPaths: string[];                   // 本次将 pin 的项目相对路径（治理文档 + 可 pin 的角色边界）
  roleIds: string[];                    // 将纳入 .ans roles 映射的角色 id（缺件角色不在此列）
  adoptExistingGovernanceDoc: boolean;  // true＝采纳既有治理边界文档，不覆盖
  acceptanceSource: string;             // 将写入 .ans 的操作者动作来源（逐字展示）
  legacyBoundaryRoleIds: string[];      // pin 目标中仍是 legacy boundary.md 的角色（只提示，不迁移）
}

export type GovernancePreviewResult =
  | { ok: true; preview: GovernancePreview }
  | { ok: false; code: GovernancePreviewErrorCode; message: string };

export type GovernancePreviewErrorCode =
  | "invalid-request"        // projectRoot 缺失/不是当前导入项目
  | "already-established"    // .ans 已存在
  | "invalid-record"         // .ans 存在但不可用（V1 不修复）
  | "no-roles"               // hasRoles === false
  | "nothing-to-pin"         // 无任何可 pin 之物（precheck 原样）
  | "unparseable-governance-doc" // 既有治理边界文档不可解析或条目为空
  | "blocked"                // precheck 门禁拒绝（原样 message）
  | "busy";                  // 同项目有进行中的建立
```

### 4.4 建立形状（`FinalizeResult` 逐字嵌套）

```ts
export interface EstablishGovernanceResult {
  ok: boolean;                          // 与 finalize.ok 同值
  phase: "guard" | "precheck" | "write";// guard=未进 finalize；precheck=零写入拒绝；write=已进入写入阶段
  code?: GovernancePreviewErrorCode;    // guard 分支的机器可读原因
  finalize: FinalizeResult;             // 逐字：message/status/wrote/pins/roles 不改写
}
```

- **`phase` 是 UI 判断「是否零副作用」的唯一依据**，不得用 `wrote.length === 0` 推断（写入阶段抛错时 `wrote` 也为空，但可能已落盘部分文件）。
- 成功：`phase === "write" && finalize.ok === true && finalize.status === "completed"`。
- guard 分支合成 `FinalizeResult`，`status` 取既有枚举：`.ans` 已存在 → `not-genesis`；no-roles/busy → `blocked`。`projectJsonRel`/`manifestRel` 按 `finalizeRelPaths` 填。
- 写入阶段抛错：`phase: "write"`、`finalize.status = "blocked"`、`message` 如实说明「写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。」。**不自动重试、不清理已写产物。**（修订 2：不再承诺「重新执行会安全采纳」——`.ans` 已落盘时重试会得到 `already-established`。）

### 4.5 失败 / 取消 / 重复点击语义与文案

| 情形 | 行为 | 文案（逐字或规则） |
| --- | --- | --- |
| 取消预览 | 渲染侧关闭面板，**不调 IPC** | 「已取消，未写入任何文件。」 |
| 重复点击（渲染侧） | 按钮置 disabled | 「正在建立治理记录…」 |
| 并发（主进程/机制） | 第二次调用返回 `busy` | 「上一次建立仍在进行中；本次未写入任何文件。」 |
| guard/precheck 失败 | `phase !== "write"` | 逐字显示 `finalize.message`；可追加「未写入任何文件。」 |
| 写入阶段失败 | `phase === "write"` 且 `ok === false` | 逐字显示 `finalize.message`；**不得**追加「未写入任何文件」；按 message 提示可能部分写入 |
| 成功 | 刷新列举、隐藏动作 | 逐字显示 `finalize.message`；追加「治理角色将在下一轮发送前按新边界重建（若正在运行，下一轮结束后生效）。」 |
| `.ans` 已存在 | 动作隐藏；直接调用也拒绝 | 「治理记录已存在；本次未写入任何文件。」 |
| `.ans` 不可用（S3） | 显示不可用与 `reason` | 「治理记录不可用：<reason>；本版不自动覆盖，修复路径待后续版本。」（V1 不提供修复动作） |

### 4.6 establish 的守卫（按顺序，缺一不可）

1. `projectRoot` 非空且等于桌面当前 `importedProjectRoot`；否则 `invalid-request`。
2. `confirm === true`；否则 `invalid-request`。
3. 进程内同项目无进行中的建立；否则 `busy`。
4. 重新核对 `isGenesisState(projectRoot)`：`.ans/project.json` 必须**不存在**。存在 → `guard`/`not-genesis`（无论其是否有效），**不覆盖**。
5. 重新枚举/复核 `hasRoles === true`；否则 `no-roles`。
6. 若治理边界文档已存在：用门禁引擎公开的 `resolveBoundary` 加一份**探测用** `ProjectConfig`（同路径、`accepted:true`、无 pin）校验；`parseError` 或条目为空 → `unparseable-governance-doc`，**零写入**；通过 → `writeGovernanceBoundaryDoc: false`。
7. 在机制内部构造一次性种子边界（来源常量固定）；调用 `finalizeBootstrap`；捕获写入阶段异常；`finally` 释放互斥。
8. 不自动重试、不自动补写、不在失败后清理已写产物（避免误删用户文件）；已存在的 `.ans` 一律不自动覆盖，修复路径待 V2。

**一次性边界不持久化**：
- 只在单次 `establishGovernanceRecord` 的调用栈内存在；不得写入 `ProjectConfig`、`.ans`、任何缓存或模块级单例。
- **一次性/不持久化的是种子边界对象本身（entries / accepted）**；`.ans` 的 `acceptance.source` 字符串**会持久化**（它是操作者动作的产品证据），固定为「**desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）**」。两者不得混淆，也不能用「本次不持久化」描述该来源字符串。
- `.ans` 中持久化的其余部分是 finalize 写出的**治理边界文档**的 pin-backed acceptance，不是这次的一次性种子边界。
- 代码审查与测试须能证明：重复建立不会复用上一次的边界对象，`.ans` 中没有「创世种子」标记。

**不改 F6/F4/pin**：F6 判定条件与顺序不变（I5 只追加文本）；F4 writeSet 发行不变；pin 的生成/校验算法不变；`repinIfBootstrapped` 的每轮重 pin 不变。

## 五、文件归属与派发顺序

### 5.1 逐文件清单

| # | 属主 | 文件 | 改动 | 测试文件（归属） |
| --- | --- | --- | --- | --- |
| A1 | 门禁引擎 | `src/service/boundary/resolve-boundary.ts` | 新增 `buildGovernanceSeedBoundary` 公共再导出（同一函数引用） | `test/门禁引擎/cold-start-genesis.test.ts`（扩展）或同目录新增 `governance-seed-public-entry.test.ts`（目录授权，可新增） |
| A2 | 桌面窗口 | `app/desktop/project.ts` | 新增 `deriveGovernanceRecord` 纯函数 | `test/桌面应用/project.test.ts`（单文件，扩展） |
| A3 | 桌面窗口 | `app/desktop/interface.ts` | `ListProjectResult.governanceRecord`；`listProject` 内派生（本组只做状态，不含动作处理器） | `test/桌面应用/interface.test.ts`（单文件，扩展） |
| B1 | 编排 | `src/common/编排/finalize.ts` | `previewGovernanceRecord`/`establishGovernanceRecord`/来源常量/守卫/互斥；复用 `precheck` 与 `finalizeBootstrap` | `test/编排/finalize.test.ts`（扩展）或同目录新增 `governance-record.test.ts`（目录授权，可新增） |
| B2 | 编排 | `src/pipeline/orchestration/govern-session.ts` | 对 B1 新 API 与类型的薄再导出（桌面只依赖 Pipeline 公共出口） | 并入 B1 测试或 `test/编排/govern-engine.test.ts`（扩展） |
| C1 | 桌面窗口 | `app/desktop/interface.ts` | 经 B2 接线 B1；preview/establish 处理器；在途互斥、当前项目/confirm 校验、成功后刷新列举与陈旧会话 | `test/桌面应用/interface.test.ts`（单文件，扩展） |
| C2 | 桌面窗口 | `app/main.ts` | 注册 `project:governance-preview`、`project:governance-establish` | `test/桌面应用/ans-wiring.test.ts`（单文件，扩展；真实 Electron 可选走 `e2e/main.mjs`） |
| C3 | 桌面窗口 | `app/preload.cjs` | 暴露 `previewGovernanceRecord`、`establishGovernanceRecord` | 同上 |
| D1 | 桌面UI | `app/renderer/renderer.js` | 状态行、su 空态、预览面板、绑定、刷新、全部文案 | `test/桌面应用/renderer.test.ts`（单文件，扩展） |
| D2 | 桌面UI | `app/renderer/ui-labels.js` | 动作可见谓词/文案常量（可选，按现有模块职责） | 同上 |
| D3 | 桌面UI | `test/桌面应用/e2e/uiux-v2.mjs` | 既有界面回归扩展（可选；不得新增 e2e 文件） | — |
| E1 | 测试 | `test/测试/existing-project-compat-verify/`（新目录） | 独立夹具与验证套件（S0/S1/S1b/S3/S4/legacy） | — |
| E2 | 测试 | `角色卡/测试/docs/design/` 或 `docs/change/` | 独立验证报告与证据 | — |
| F1 | 门禁引擎 | `src/service/gate/resolve-write.ts` | F6 指引常量与追加（I5） | `test/门禁引擎/f6-denial-guidance.test.ts`（目录授权，可新增）；**重跑** `test/编排/shell-gate.test.ts` |
| P1 | 项目管理 | 本文件、`memo.md`、`changelog.md` | 评审与拆发记录 | — |

**边界纪律**：
- `test/桌面应用/` 是**单文件**条目：桌面窗口/桌面UI **只能扩展清单内既有测试文件**，新增文件须先由 Governance 改边界（本轮未授权）。
- `test/编排/`、`test/门禁引擎/`、`test/测试/` 是**目录**条目：可新增测试文件。
- `app/desktop/`、`app/renderer/`、`src/common/编排/` 是目录条目：可在内新增实现文件；本轮建议不新增，避免扩大审查面。
- 桌面窗口**不得**直接导入 `src/common/编排/finalize.ts`（§一.6 禁止跨角色私有 `common`）；经 `src/pipeline/orchestration/govern-session.ts` 的公共再导出使用。

### 5.2 派发顺序与并行

| 组 | 角色 | 任务 | 依赖 | 可并行 |
| --- | --- | --- | --- | --- |
| 1 | 门禁引擎 | A1 种子边界公共出口 | 方案批准 | 与组 2 并行 |
| 2 | 桌面窗口 | A2+A3 I1 状态检测 | 方案批准 | 与组 1 并行 |
| 3 | 编排 | B1+B2 I3 迁移机制 | 组 1 | 与组 4 并行 |
| 4 | 门禁引擎 | F1 I5 F6 指引 | 组 1（同角色串行：A1 → F1） | 与组 3 并行 |
| 5 | 桌面窗口 | C1–C3 I2 接线 | 组 3（+组 2 的类型） | 同角色串行，不与组 2 并行 |
| 6 | 桌面UI | D1–D3 I4 UI | 组 5 的通道/形状（契约已在本文件钉死，可先做静态部分） | 与组 5 部分并行；集成在组 5 后 |
| 7 | 测试 | E1+E2 I8 独立验证 | 组 1–6 全部落地 | 最后 |

**同一角色的任务串行**（一个固定角色上下文内按序）；**不同角色不并发写同一文件**（本清单无重叠）。本轮不启动任何执行上下文；派发以本文件为任务书，各角色先核对自身边界与基线。

## 六、验收口径

### 6.1 提案 §7.1 主路径

| # | 场景 | V1？ | 覆盖与说明 |
| --- | --- | --- | --- |
| V1 | 状态识别 | **V1** | A2/A3 单测 + E1：S1 夹具显示 missing＋动作；导入/列举前后目录树与 mtime 不变 |
| V2 | 成功建立 | **V1** | B1/E1：三产物落盘；`.ans` 可解析、`governanceBoundary.path` 非空、`accepted === true`、pin 覆盖治理文档与全部可 pin 角色边界；manifest 与实算一致 |
| V3 | su 解卡 | **V1（拆分验收）** | 确定性部分：E1 用真实 `resolveWrite` 断言 su 对新治理边界 allowed（或离线 gate）；**真实 su 会话落盘由客户本人运行**（凭据/模型），测试角色不代跑 |
| V4 | 角色不受影响 | **V1** | E1 回归：建立前后项目角色写各自代码/测试路径 allowed，边界外仍拒 |
| V5 | 取消零副作用 | **V1** | D/E：取消不调 IPC；目录树/mtime 与操作前一致 |
| V6 | 失败零副作用 | **V1（收窄）** | **仅门禁/precheck 拒绝**：`phase !== "write"`，零写入；原提案「只读目录」变体**不在此项**，见 V6b |
| V6b | 写入阶段失败（新增） | **V1** | 注入写入错误（如 `docs` 为文件）：`phase === "write"`、`ok === false`、message 明确「可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans」；UI 不得宣称零副作用；**不承诺重试可采纳**（`.ans` 已落盘子场景重试会得 `already-established`，修复属 V2） |
| V7 | 幂等 | **V1** | `.ans` 有效时动作隐藏；preview/establish 直接调用也拒绝且零写入 |
| V8 | 不误用确认卡 | **V1** | E1 独立回归：未接受边界上 `request_confirmation → confirmed:true → 重试` 仍 F6；`.ans` 不因确认卡产生 |

### 6.2 提案 §7.2 负例与状态边界

| # | 场景 | V1？ | 说明 |
| --- | --- | --- | --- |
| N1 | `.ans` 非法 JSON | **V1（检测）/ V2（修复）** | `invalid`＋reason；动作不自动覆盖；修复前零副作用、全只读 |
| N2 | `accepted:true` 无 pin | **V1（检测）/ V2（修复）** | 载入器降级 → `invalid`＋reason；不回退导入授权 |
| N3 | pin 不符（S4） | **V2** | V1 无法区分（共享载入器只查 pin 存在性，不查哈希）；`present` 不等于 su 可写。修复必须显式、显示漂移文件、绝不自动 re-pin |
| N4 | S1b 既有治理边界文档 | **V1（机制）/ V2（修复 UX）** | V1：先校验可解析且条目非空，再 `writeGovernanceBoundaryDoc:false` 采纳、不覆盖；坏文档中止零写入。完整「采纳/差异」修复界面留 V2 |
| N5 | 缺 role-card/边界的角色 | **V1** | `finalize` 扫描跳过；preview 的 `roleIds`/`pinPaths` 如实反映；不凭空造角色 |
| N6 | 无可 pin 之物 | **V1** | `nothing-to-pin`；零写入；回执说明原因 |
| N7 | 空项目 S0 | **V1** | 既有创世逐字不变（`test/桌面应用/genesis-bootstrap.test.ts` 的 `hasRoles ⇒ 无 genesisBootstrap` 断言保持） |
| N8 | CLI `ans govern <目录>` | **V1** | 既有行为逐字不变；作为 S1 兜底恢复写入 UI/README（装配/桌面文案属主各自处理，本 V1 只保证不破坏） |

### 6.3 旧格式（I6/I7）与分期

- **L1–L5、I6、I7 不在 V1**：属 V1b，需独立授权。V1 只在预览中提示 `legacyBoundaryRoleIds`，不迁移、不告警改造、不改解析器。
- **V2**：S1b 完整采纳 UX、S3 显式重建、S4 核对并重新接受（显示差异、绝不自动 re-pin），以及 `governanceRecord` 的 `unverified`/pin 校验态。
- **I5 的精确状态分句**（S1/S3/S4 分别给不同指引）留 V2，与可验证状态一起做；V1 只交付不判断状态的规范式文案。

### 6.4 独立验证

- **测试角色执行**：用与客户同形状的夹具（N 个项目角色、`role-card.md` ＋ 仅 `boundary.md`、无 `.ans`）走 `listProject → preview → establish → 再次 listProject`；记录前后目录树、`.ans`、manifest、pin 哈希、su 的离线 gate 判定。
- **客户本人执行**：真实 su 会话与真实写入（需模型/凭据）；不以确定性测试代替。
- **证据卫生**：截图/日志/哈希绑定当轮基线；不使用旧图或旧基线冒充。

## 七、风险与回滚

1. **预览与实际写入不同源**：预览若自己算路径，会与 finalize 漂移。**缓解**：预览与建立共用同一 `precheck`/目标构建代码；建立时**重新求值**，预览只作展示；不信任预览快照。**回滚**：移除 preview IPC 即可，建立路径不受影响。
2. **一次性边界被误持久化/变成常设权限**：若被塞进 `ProjectConfig`、缓存或 `.ans`，就退化为候选 G。**缓解**：函数内构造、无模块级缓存、无配置字段；测试断言重复调用不复用、`.ans` 无种子标记；代码审查把「给内置边界加 accepted」列为拒收项。**回滚**：删除 establish 入口，已建项目仍按既有 `.ans` 工作。
3. **UI 误报成功/误报零副作用**：`finalizeBootstrap` 写入阶段抛错可能留下部分文件（治理文档、`.ans` 或 manifest 之一）。**缓解**：`phase` 区分 guard/precheck/write；成功只认 `status === "completed"`；失败逐字显示 message；写入阶段禁止「未写入任何文件」。**回滚**：UI 隐藏动作，机制保留但不可达。
4. **`.ans` 竞态/并发**：预览后另一窗口或 CLI 先建立；双击/两个窗口并发。**缓解**：establish 重新核对 `isGenesisState`；进程内按项目互斥；渲染侧禁用按钮。**残留风险**：跨进程（两个桌面实例/CLI）无全局锁；最坏是双方写出同构产物或后写覆盖，不产生额外权限。**回滚**：无数据迁移，`.ans` 仍由既有载入器读取。
5. **旧格式边界被原样 pin**：建立会把 7 份 `boundary.md` 纳入 pin。之后**任何外部修改/删除**都会使 pin 不符 → S4，su 无法 settle 重 pin，形成死局。**缓解**：预览明确列出 `legacyBoundaryRoleIds`；V1b 迁移必须先「新增 `boundary.yaml`、不改不删旧 `boundary.md`」→ 等 su 一次 settle 重 pin → 再清理旧文件；不得直接编辑被 pin 的 `.md`。**回滚**：恢复旧文件字节即可回到建立时状态。
6. **V1 的 `present` 不等于 su 可写（S4 未检测）**：pin 不符时 `governanceRecord.state` 仍为 `present`，su 仍 F6。**缓解**：UI 文案只说「治理记录已存在」，不得说「su 现在可以写」；V2 增加 pin 校验态与修复入口。**回滚**：无（只影响文案与预期，不影响判定）。

**回滚总述**：本功能是**加法**——只新增入口、状态字段与回执文本，不改 F6/F4/pin/重 pin 语义。回滚代码后，已建立的项目仍处于正常的 S2，由既有载入器与门禁继续工作；不会留下需要清理的中间格式。唯一不可逆的是操作者已确认并写出的治理产物，但它们是产品预期资产，不是迁移残留。

## 八、复核中发现的口径偏差（如实记录）

1. **I5 组装点**：任务书称真实文字组装点在两份 `format-denial.ts:23`。复核：两份文件只做 `写入被拒绝：${reason}` 包装与 `allowedByRoot` 渲染（`src/common/runtime-core/format-denial.ts:23`、`src/common/pi-adapter/format-denial.ts:23`，两份逐字同构）；F6 原因文本实际在 `src/service/gate/resolve-write.ts:120-124`。因此 I5 是**单文件、单属主**改动；两份渲染器不改，但测试应同时断言两份输出带出指引。
2. **I1 属主**：提案 §八写「门禁引擎 + 桌面窗口」。复核：状态可由桌面窗口用共享载入器 `source.kind` 与 `governanceBoundary.path` 派生，门禁引擎**在 I1 无代码改动**；门禁引擎在 I3 提供种子边界公共出口、在 I5 修改 F6 文本。按此收窄可减少一处跨角色契约变更。
3. **V6/文案的「零副作用」过强**：提案 §5.2 的失败文案「未写入任何文件（finalize 全有或全无）」与 §7.1 V6 的「只读目录」变体，只在**前置/门禁拒绝**时成立。`precheck` 不检查可写性，`gatedAtomicWrite` 在写入阶段抛错时可能留下治理文档或 `.ans`。已按 §一-3、§四.4、§六 V6/V6b 收窄。
4. **客户项目「只有 boundary.md」的措辞**：若字面理解为「角色目录只有 `boundary.md`、没有 `role-card.md`」，则 `listProject` 不会枚举出这些角色（`resolve-role.ts` 读 `role-card.md` 失败即跳过），`hasRoles` 应为 `false`，状态是 S0 而非 S1。与「7 个项目角色、hasRoles=true」的已核实事实对照，正确含义应是「**边界文件**只有 `boundary.md`（`role-card.md` 存在）」。夹具必须按后者构造；派发前请以客户现场目录再确认一次。
5. **S4 在 V1 不可见**：共享载入器只做 pin 的**存在性与形状**判定，不做逐文件 SHA-256 比对；`present` 会覆盖 pin 不符的情形。这不是提案矛盾（提案已定 V1 不做 `unverified`），但 UI 文案必须受此约束（见 §七-6）。
6. **先建记录再迁移的 pin 次序**：提案 §6.3 推荐「先建记录、再迁移」，但未点明建立后旧 `.md` 已被 pin；直接编辑/删除旧 `.md` 会立即 S4 且 su 无法 settle 重 pin。派发 V1b 时必须写入「新增 YAML → su settle 重 pin → 再清理旧 MD」的顺序（见 §七-5）。

## 九、派发前置检查

- 基线：`main` / `b9d4a3d`（本轮评审时点）。派发前各角色以当轮 HEAD 复核行号与文件内容；行号漂移不影响契约，按符号名定位。
- 边界：本清单不含新增边界条目；`test/桌面应用/` 的单文件条目须以扩展方式使用。任何需要新增该目录测试文件的想法，先停手交 Governance。
- 测试：全量 `node --test "test/**/*.test.ts"`；各角色先跑自己的套件，再由测试角色独立全量。
- 提交：本轮与派发均不自动 git 提交；由客户决定提交时点。

## 十、修订记录

### revision 2（2026-10-17）：测试独立验证的两条文案备注

实施中，测试角色的独立验证提出两条文案备注，编排已按属主修正。**仅如实性修正；契约形状（字段/通道/方法名/返回信封）、守卫顺序与验收范围均不变。**

1. **`.ans` 的 `acceptance.source` 措辞**：旧描述容易被读成「来源也不持久化」。修正为——一次性/不持久化的是**种子边界对象（entries / accepted）**，不是写入 `.ans` 的来源字符串；该字符串会持久化，固定为「**desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）**」。已同步 §四.6。
2. **写入阶段失败消息**：不再承诺「重新执行（会安全采纳既有治理边界文档）」。修正为「写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。」`phase: "write"`、不自动重试、不清理已写产物均不变。已同步 §四.4、§四.6-8、§六 V6b。

**不受影响**：§三的 F6 回执文案（I5）与本次两条备注无关；状态判定、预览/建立契约、一次性边界守卫、V1/V2 范围与全部验收条目均按 revision 1 执行。
