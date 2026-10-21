# ANS Studio

**让 AI 按角色分工，在明确的文件边界内完成代码任务。**

ANS Studio 面向希望在真实项目中使用多个 AI 角色协作的开发者：从需求与授权开始，经过派发、修改和测试，再把执行证据交回检查。提供桌面应用与 CLI；桌面默认使用 Claude，也可切换 Pi 或 Codex，CLI 支持 demo（不调用模型）、Pi、Codex 与 Claude。

## 五个治理角色

新建或空项目默认使用 **三权 · 五角色** 治理模型，界面状态行显示「三权 · 五角色」。三权指提案、组队、统筹三类决定权，沟通与验收不是决定权。五个内置治理角色随应用发布，没有角色目录，文件写入限于治理文件与证据，不承担实现与测试；shell 命令与其他角色一样全部经审批链。内部 roleId 保持稳定，界面显示下列名称。

| 界面名称 | roleId | 职责 | 权力 |
| --- | --- | --- | --- |
| Lead / 主理 | `liaison` | 客户沟通与默认主入口；把客户意图写入 `docs/intents/`；兼任工作流管理者 | 客户沟通 · 工作流管理 · 不拥有最终批准权 |
| Draft / 提案 | `rapporteur` | 形成提案与跨角色契约 | 提案权 · 不拥有最终批准权 |
| Crew / 组队 | `nominator` | 提名项目角色、写角色卡与边界 | 组队权 · 不拥有最终批准权 |
| Steward / 统筹 | `convener` | 编排流程、派发任务 | 统筹权 · 不拥有最终批准权 |
| Proof / 验收 | `verifier` | 独立核对证据、出验收卡 | 验收权 · 不拥有最终批准权 |

`su` 只用于旧模型（single）与兼容路径，不是新项目的默认入口。

## ANS 是什么与学术来源

**ANS Skill** 是一套受 Role-First Software Governance（RFSG）论文启发的角色优先 AI 开发技能；ANS 是名称，不作缩写展开。本仓库的 **ANS Studio** 将这套思路落成可运行的桌面应用与 CLI。

它强调三件事：

- 先明确业务责任，再确定模块和代码归属。
- 按需广泛阅读，在授权范围内修改。
- 发现跨模块问题，交给对应角色处理；理解问题不会自动带来修改权限。

学术来源：Wang, Zhongren. 2026. *Role-First Software Governance: Asymmetric Authority Boundaries for AI-Native Agent Systems*. [DOI: 10.5281/zenodo.22824700](https://zenodo.org/records/22824700)。

![ANS Studio 真实桌面：石墨主题、五角色导航与需求确认卡](角色卡/桌面UI/docs/change/2026-10-20_readme-v1.4-screenshot/desktop-intent-confirm.png)

## 下载与运行

当前版本：**v1.4.0**（2026-10-20 发布）。运行包自带运行环境，启动应用无需另装 Node.js；执行项目的 `npm test`、Git 等命令，仍需安装该项目所需的开发工具链。

| 系统 | 下载 | 校验文件 | 启动方式 |
| --- | --- | --- | --- |
| macOS 13+ · Apple Silicon | [mac-arm64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/ANS-Studio-1.4.0-mac-arm64.zip) | [SHA256SUMS-darwin-arm64.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/SHA256SUMS-darwin-arm64.txt) | 完整解压，打开 `ANS Studio.app` |
| macOS 13+ · Intel | [mac-x64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/ANS-Studio-1.4.0-mac-x64.zip) | [SHA256SUMS-darwin-x64.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/SHA256SUMS-darwin-x64.txt) | 完整解压，打开 `ANS Studio.app` |
| Windows 10/11 · x64 | [win-x64.zip](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/ANS-Studio-1.4.0-win-x64.zip) | [SHA256SUMS-win32-x64.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/SHA256SUMS-win32-x64.txt) | 完整解压，打开 `ANS Studio.exe`，保留同目录资源文件 |

下载后先核对 SHA256：macOS 在下载目录执行 `shasum -a 256 -c SHA256SUMS-darwin-arm64.txt`（Intel 用 `SHA256SUMS-darwin-x64.txt`）；Windows PowerShell 执行 `Get-FileHash .\ANS-Studio-1.4.0-win-x64.zip -Algorithm SHA256`，与 `SHA256SUMS-win32-x64.txt` 对照。[SHA256SUMS-overlay.txt](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/SHA256SUMS-overlay.txt)、[release-provenance.json](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/release-provenance.json) 与 [overlay.patch](https://github.com/wangzhongren/ans-studio/releases/download/v1.4.0/overlay.patch) 记录固定源码与打包适配，来源核验见[发布验收记录](角色卡/测试/docs/change/2026-10-20_change_v1.4-release-verification.md)。

<details>
<summary>v1.4.0 SHA256</summary>

| 产物 | SHA256 |
| --- | --- |
| `ANS-Studio-1.4.0-mac-arm64.zip` | `bc0c5bdd892ad24630c0040ba0d3675e70345ef18ab0f0762c52e743dc4f48e7` |
| `ANS-Studio-1.4.0-mac-x64.zip` | `554a0ad69feabc093fdf850d9e442b331ddd6072563605d6e879cd4ea9f21df9` |
| `ANS-Studio-1.4.0-win-x64.zip` | `cfb1f673c599f0cea89cd5f6ea3fec53cf597e6cd4dc6492b9d69e7fe33a1779` |
| `overlay.patch` | `2f6d6f765e13c2f43aa33e038198ff691bd7e38696d4f7818a7ad80da6776c11` |

</details>

v1.4.0 要点：流程文件方法化（`flow_get` / `flow_step_update` / `flow_step_supersede`，Lead 兼任工作流管理者）；重启后自动续跑；聊天 pane 加载占位；验收重派与通过后自动收口；角色卡写后门控；artifact 补登；排队决定处理后清理 UI 聚合；若干 shell/UI 修复。

运行包尚未签名或公证：macOS Gatekeeper 或 Windows SmartScreen 可能提示来源未验证。请从上述 Release 下载，先核对 SHA256 再运行。

## 第一次使用

1. **导入项目并选择引擎。** 点击左下角「导入项目」。导入前引擎选择不可用；也可以选择一个空文件夹，按默认的五角色开始。在会话顶部选择引擎：默认 Claude，也可切换 Pi、Codex。缺少配置时，点击提示中的「打开设置」按钮；日后也可从左下角「设置」进入。保存成功只表示配置已保存，连接是否可用仍需实际请求验证。
2. **与 Lead 说明需求。** Lead 是默认主入口，负责确认目标、范围与验收标准，并把客户意图写入 `docs/intents/`。写完意图后，Lead 会发起**需求确认**（`confirm` / `revise`）。开启「替我决策」且适用自动判断时，判断 agent 可代选 `confirm`，不能代选 `revise`；其余情况由你回答需求确认卡。确认通过后，意图才会交给 Draft。
3. **确认提案与任命。** Draft 依据意图形成提案，提案卡提供 `accept` / `accept-quick` / `revise` / `reject`。接受后，Steward 写流程单，Crew 提名项目角色并发起任命确认；任命后 Crew 再经写盘确认逐路径写角色卡与边界。提案、任命和写盘确认按下文的代批开关处理。
4. **实施、回交与验收。** 项目角色按各自边界实施、测试并回交；Steward 处理流程与派发。Proof 独立核对交付与回交证据，出验收卡（`accept` / `reject`）。开启「替我决策」且适用自动判断时，判断 agent 可代为接受；其余情况由你决定是否验收。
5. **验收通过即结束。** 没有看护的「收束」提示。内部角色的反馈由 Lead 汇总后告知你，不直接转述原文。

正式任务由 Steward 派发到项目角色，忙碌时进入队列；普通聊天不会自动产生「未报告」回交。「工作概览」可查看待确认项、排队消息与最近回交。输入区使用 **Enter 发送，Shift + Enter 换行**；忙碌时可停止本轮或撤回尚未执行的排队消息，角色和引擎各自保留草稿。详情抽屉支持 Esc 关闭并回到原入口。

### 引擎配置

每个引擎使用独立配置，不会在缺配置时自动切换到其他引擎。

| 引擎 | 必填配置 | 可选配置 |
| --- | --- | --- |
| Pi | `ANTHROPIC_AUTH_TOKEN`、`ANS_PI_BASE_URL`、`ANS_PI_MODEL` | `ANS_PI_CONTEXT_WINDOW`，留空默认 500000；模型/网关实际窗口更小时请覆盖 |
| Codex | `CODEX_API_KEY`（或 `OPENAI_API_KEY`）、`ANS_CODEX_MODEL` | `ANS_CODEX_BASE_URL`，默认 `https://api.openai.com/v1`；自定义端点须兼容 Responses API |
| Claude | `ANTHROPIC_API_KEY` | `ANS_CLAUDE_MODEL`、`ANTHROPIC_BASE_URL`，留空使用 SDK 默认 |

Codex 与 Claude 使用 API key，不使用订阅或 OAuth 登录回退。更多变量说明见 [`.env.example`](.env.example)。

运行包将配置保存在**用户数据目录的 `.env`**，开发启动使用**仓库根 `.env`**，设置面板会显示实际路径。秘密值不回显、不进入运行包，也不应提交到 Git。会话记录保存在项目的 `.ans/sessions/`，本仓库已将其加入忽略规则。

## 角色协作怎样约束修改

- **先分工，再授权。** 角色卡说明职责，`boundary.yaml` 的 Section 1 列出可修改路径；存在已生效的任务写集时，再按任务范围收窄。五个治理角色的边界来自内置注册表，不建角色目录。
- **主理 Lead 是工作流管理者。** Lead 可用 `flow_get` / `flow_step_update` / `flow_step_supersede` 推进或返工流程，也可用 `dispatch_task` 向 Steward 与项目角色派发协调任务。协调与推进不等于客户批准：客户决定仍走判断 agent / 客户卡，Lead 仍不拥有最终批准权。
- **治理写入门禁。** 角色卡/`boundary.yaml`、提案、流程、验收与写盘等在写入前有预览或确认卡；越界写入在产生副作用前被拒绝，并指回正确归属：提案→Draft / 提案，角色卡与提名→Crew / 组队，流程→Steward / 统筹，验收→Proof / 验收，应用治理记录→应用。
- **所有角色都具备 shell 能力。** 五个治理角色与项目角色一样可执行读写与任意 shell 命令，全部走既有审批流程：只读白名单直接执行；risky/review/deny 逐条由客户或判断 agent 审批；拒绝、超时、通道不可用一律不放行。shell 的副作用不受文件写入门禁约束，审批链是唯一控制；文件写入仍优先 `write_file` 并经写盘确认。shell 裁决审计仍落 `docs/audit/shell-gate.jsonl`。
- **按开关代审批与代决策。** 桌面「替我审批」处理 shell 命令与写盘/写卡确认；「替我决策」处理需求确认、提案接受、任命与验收。需求确认仅可代选 `confirm`，不能代选 `revise`。成功代批会标明「judge 代批」，不冒充你本人点击。对适用自动判断且开关开启的请求，证据不足、读取失败、判断不可用、超时或解析失败都按未通过处理：shell 不执行，写入与决策请求退回发起角色修正，不因此自动弹出手动卡。开关关闭、未接入自动判断或不适用的请求仍走原手动路径；治理判断期间关闭开关，原卡可恢复；轮次中止按取消处理。
- **两类判断 agent 各审各的。** 「替我审批」的 shell 判断 agent 只审系统风险——卡死、越界、破坏、资源、敏感外发，不判断业务必要性；项目内非破坏性命令由发起角色自行决定。「替我决策」的决策判断 agent 只审意图漂移——目标、范围、非目标、验收标准与客户已接受的决定，不重复审工程质量、架构与测试；这些由 Proof 在验收阶段核对。
- **判断 agent 只读。** 它只读项目内允许的文本：`.ans/project.json` 与 `.ans/governance/ledger.jsonl` 只读开放，`.ans/sessions/**` 及其他敏感内容仍被拒绝，并给出具体路径与原因。它不写文件、不执行命令、不派发任务。读取预算仍 fail-closed（硬上限可经环境变量调整）；预算不足、证据不足、风险不明或意图缺失时不自动放行，按上述失败处置处理，不猜测。
- **派发与验收分开。** 派发任务不会增加目标角色的写权限。任务报告、历史保存、回交投递和接收方处理分别显示实际状态；报告声明「已完成」不等于独立验收通过。

技术结构与跨角色接口见[项目架构](角色卡/项目管理/docs/architecture.md)。

## 流程状态 YAML

流程状态以 `docs/flows/<flowId>.yaml` 为唯一机器状态，应用只解析它做派发与验收判定。同名的 `docs/flows/<flowId>.md` 仅是人读视图，应用不解析它做判定；Markdown 流程文档仍可保留给人阅读。

顶层字段为 `flowId` / `version` / `qualityTier` / `steps`；步骤字段为 `id` / `title` / `owner` / `kind` / `status` / `evidence` / `supersedes` / `supersededBy`。

```yaml
flowId: todo-list-v1          # 必填；与文件名一致
version: 1                    # 必填；正整数
qualityTier: production       # 必填；prototype | production
steps:                        # 必填；非空
  - id: delivery-server-old   # 被 retake 取代的旧步骤
    title: 服务端交付（旧）
    owner: <项目角色 id>
    kind: dispatch
    status: superseded
    supersededBy: delivery-server
  - id: delivery-server       # 必填；小写 slug；verification / acceptance 为保留 id
    title: 服务端交付
    owner: <项目角色 id>
    kind: dispatch            # dispatch | customer-decision | artifact | acceptance
    status: done              # pending | dispatched | delivered | done | superseded | failed | blocked | aborted
    evidence:                 # done 必填；kind 与步骤 kind 对应，ref 为账本匹配键
      kind: dispatch
      ref: delivery-server
    supersedes: [delivery-server-old]  # 与旧步骤的 supersededBy 双写，同一条关系
  - id: verification
    title: 验收
    owner: app
    kind: acceptance
    status: pending
```

- **`done` 必须有对应证据。** `dispatch` 对账账本 `dispatch.accepted`；`customer-decision` 对账已结算的客户决定；`artifact` 对账 `artifact.observed`；`acceptance` 对账客户验收决定。
- **验收步骤归应用。** `verification` / `acceptance` 是应用自动派 Proof 的验收步骤（`kind: acceptance`，初始 `status: pending`）；Steward 不占用这两个 id、不派发、不标 `done`，执行与证据步骤改用其他 id（如 `verification-evidence`）。
- **取代关系显式记录。** 推荐双写：被 retake 取代的旧步骤标 `status: superseded` 并写 `supersededBy`，新步骤写 `supersedes`；只写一侧也合法。真环（步骤互指或闭环）与两侧矛盾会被拒绝。`failed` / `blocked` / `aborted` 未标 `superseded` 时仍阻塞收尾。
- **非法 YAML 不回退。** YAML 存在但校验失败（未知字段、未知枚举、缺必填、`done` 缺证据等）时，应用 fail-closed 并给出具体路径与原因；仅在 YAML 不存在时，迁移期兼容旧的 Markdown 流程。

## 流程工具（方法化）

应用是 `docs/flows/<flowId>.yaml` 的唯一写者，角色不再直接写流程文件，改用以下工具；初始创建仍走 `schedule-write` 写卡，创建后不再为每次状态更新写文件或发写卡。

- **`flow_get`**：读取流程摘要、步骤与当前角色可更新的步骤，返回 `revision` 与 `canUpdate`；更新前先取最新 `revision`。
- **`flow_step_update`**：按 `expectedRevision` 更新步骤状态。Steward / Lead 可更新全部未终态步骤；其他角色只能更新 owner 为自己的步骤（仅限交付、失败、阻塞等有限迁移）。`done` 必须带账本可对账的 `evidence`；版本冲突返回 `revision-conflict`，证据不足返回 `insufficient-evidence`，按提示重新 `flow_get` 或补证后重试，不伪造证据。
- **`flow_step_supersede`**：Steward / Lead 返工用；旧步骤标 `superseded` 并记 `supersededBy`，新步骤为 `pending`，历史保留不删除。
- **推进不等于批准。** 流程工具推进或返工不代表客户同意；需要客户决定的步骤仍走 `request_choice` / `request_confirmation` 等客户卡或判断 agent。

## 工程质量基线与验收演示

默认按生产级质量推进；客户在意图阶段明确选择原型档时，才可放宽其中不适用的条目。提案、角色卡、流程派发与验收都携带同一份质量基线，不在最后验收时才补。

工程质量基线（默认生产级；客户明确选原型档才可放宽）：
- 正确性：验收标准逐条可演示；无 TODO/占位/假数据；边界与非法输入有明确行为。
- 健壮性：输入校验与上限、错误码一致、失败不破坏已有数据；持久化原子写与重启恢复；并发/重入有明确策略。
- 安全：认证/授权即使简化也要写清边界；防注入/XSS/路径穿越/CSRF；不记录密钥与敏感数据；零第三方依赖时说明理由。
- 可维护性：模块边界清晰、命名一致、只在约束处注释；README 含启动、架构、API、权限、状态机、已知限制与权衡。
- 可观测性：关键失败可诊断（结构化日志/错误信息），不静默吞错。
- 性能与容量：分页/上限/超时明确；不无限增长；给出已知容量边界。
- 前端：加载/空/错误态齐备；键盘可用、标签与对比度等基本可访问性；窄屏可用。
- 测试：单元+集成+端到端矩阵；权限与非法路径必须有负例；测试独立于实现；不得为保绿弱化断言。
- 交付：验收前必须真实启动应用并演示（启动命令、访问地址或截图/录屏）；未真实运行不得建议验收通过。

架构与可扩展性（同一基线的组成部分，提案与验收都核对）：
- 提案必须含架构方案（新项目）或架构影响分析（变更）：模块分解与职责、依赖方向、数据流、扩展点、数据 schema 与 API 版本迁移、横切关注点与权衡。
- 角色写区与架构模块一一对应；验收核对实现与架构声明一致。
- 缺失架构章节或实现偏离声明，不得建议 `accept`。

Proof 出验收卡前逐条核对基线证据；交付未被真实启动并演示时，不得建议 `accept`。演示以实际运行的应用为准：给出启动命令与访问地址，或附截图/录屏；仅有测试输出或代码阅读不算演示。

## 从源码开发

需要 **Node.js 23.6+** 与 npm。

```bash
git clone https://github.com/wangzhongren/ans-studio.git
cd ans-studio
npm ci
npm run app
```

桌面启动后按上面的首次使用流程配置即可。若使用 CLI，可先将 `.env.example` 复制为 `.env`，填写所选引擎配置。

### 常用 CLI 命令

在仓库根目录执行：

```bash
# 自检与帮助
node bin/ans.js doctor
node bin/ans.js --help

# 不调用模型的演示会话
node bin/ans.js role run 编排 --task T-1

# 对已有目录发起治理会话；确认通过终端问答完成
node --env-file=.env bin/ans.js govern /path/to/project --runtime pi

# 运行项目中已登记的角色；替换角色 ID 与任务内容
node --env-file=.env bin/ans.js role run "角色ID" --task "任务内容" --runtime pi
```

`--runtime` 支持 `demo|pi|codex|claude`，优先于 `ANS_RUNTIME` 环境变量。未指定时，`role run` 默认 demo，`govern` 默认 Pi。桌面的默认引擎是 Claude，CLI 保持上述默认。`govern` 的目标目录必须已存在；不提供目录时使用当前工具项目。`ans init` 已移除。

### 检查与打包

```bash
node --test "test/**/*.test.ts"
npm run typecheck
```

测试路径需保留引号，确保覆盖多层目录。部分集成测试需要监听本地回环地址。

发布构建使用 [GitHub Actions 工作流](.github/workflows/release.yml)，在各目标系统与架构上构建、解压并验证实际运行包。维护者的来源核验、构建命令与发布步骤见[桌面打包说明](角色卡/装配/docs/feature/desktop-release-packaging.md)。

## 当前限制

- **请仅打开可信项目。** shell 命令有规则检查与审读流程，但没有操作系统沙箱；获准命令的文件副作用不受 ANS 文件写入门禁约束。CLI 当前未启用 shell 工具。
- **Windows 暂不支持内置来源文档阅读。** 可查看完整摘要和执行记录，来源文件请通过系统编辑器打开。
- **CLI 与桌面能力有差异。** CLI 使用终端确认，暂不提供桌面式任务派发与回交投递、队列界面。多任务依赖的自动调度尚未实现。
- **ZIP 分发暂无安装器和自动更新。** 更新时需自行下载新版本。
- **验证范围有限。** 三平台运行包由原生 CI 构建、回归并做解压启动检查，包内测试不调用在线模型；既有真实验证记录中，在线桌面与代码任务以 Pi 为主，Codex、Claude 的受控/离线整链测试不等于在线模型全链路验收。桌面默认 Claude 只表示默认选择，不表示已获在线验收。

## 深入了解

- [v1.4.0 发布验收与公开下载](角色卡/测试/docs/change/2026-10-20_change_v1.4-release-verification.md)：实际产物、来源与测试证据。
- [v1.3.0 发布验收与公开下载](角色卡/测试/docs/change/2026-10-17_change_v1.3-release-verification.md)：实际产物、来源与测试证据。
- [v1.2.0 发布验收与公开下载](角色卡/测试/docs/change/2026-10-16_change_v1.2-release-verification.md)：实际产物、来源与测试证据。
- [v1.1.0 发布验收与公开下载](角色卡/测试/docs/change/2026-10-16_change_v1.1-release-verification.md)：实际产物、来源与测试证据。
- [v1.0.0 发布与三平台验收](角色卡/测试/docs/change/2026-10-15_change_v1-release-verification.md)：实际产物、来源与测试证据。
- [真实桌面与 Pi 项目验证](角色卡/测试/docs/change/2026-10-15_change_visual-v2-independent-verification.md)：普通聊天、正式任务、工具输出与回交流程。
- [桌面交互设计](角色卡/UIUX设计师/docs/design/2026-10-15_design_visual-convergence.md)：页面结构与交互规范。
- [CLI 接线与行为说明](角色卡/装配/docs/feature/cli-runtime-assembly.md)：运行时选择、配置与命令细节。
- [工程规则](角色卡/项目管理/docs/project-rules.md)：分层、角色边界与协作约束。

本项目采用 [MIT 许可证](LICENSE)。
