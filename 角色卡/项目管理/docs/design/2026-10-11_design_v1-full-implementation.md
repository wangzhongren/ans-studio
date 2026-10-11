---
id: ans-cli-v1-full-implementation
type: design
title: V1 完整实现方案：bootstrap/创建权、写入落盘、其余占位项与 V3 shell 审核机制
created: "2026-10-11"
updated: "2026-10-11"
timezone: Asia/Shanghai
status: designed
related: [ans-cli-v1-prototype-contract, ans-cli-pi-runtime-review]
events:
  - date: "2026-10-11"
    kind: designed
    summary: 客户选定三块全做（bootstrap/创建权、写入落盘、其余占位项含 V3）；项目管理出实施方案（归属、授权路径、顺序、验收、风险），不含实现
  - date: "2026-10-11"
    kind: designed
    summary: V3 客户裁定「shell 应让 pm 审核才能运行」——§7 由「列选项」改为设计 shell 审核机制（安全实质、审核主体 (a)/(b)/(c)/(d) 选项与代价、落点、fail-closed、留痕、与 GOVERNED_WRITE_TOOLS 关系）
  - date: "2026-10-11"
    kind: designed
    summary: 客户/协调方定案——创建权按 su（pm 创建留「未正名的偏离」不实现）；V3 审核主体定 (c)+(b)+(a) 并写死先后、翻案问题与 fail-closed 三退路；init --force 默认拒绝覆盖；调度记录唯一写入者 task_ops；.ans/ 纳入本项目（Section 1 由 Governance 更新装配边界给出）；新增「派发清单」
  - date: "2026-10-11"
    kind: changed
    summary: 客户裁定「调度权归 pm」——T6/§3.4 归属由编排改为 pm（机制留编排、权力归 pm），新增 §3.6「pm 的运行时功能」；据此 T6 无需新授权
  - date: "2026-10-11"
    kind: changed
    summary: 并入 Governance 已完成的 G-1a/G-1b 授权（客户批准）——装配 .ans/(condition project-init)、pm docs/audit/(condition shell-gate)；T4 须声明 project-init、T7 审计须声明 shell-gate（漏则被条件门拒）
  - date: "2026-10-11"
    kind: changed
    summary: 补缝——调度「执行」路径（S1：pm 产 DispatchPlan→编排解析→逐条 openRoleSession）明确不在 V1（取选项 B，§3.7）；T6 重定性为「使用约定、非产品代码任务」；§4 与 §3.6 改为不再读作「V1 已能派发」
  - date: "2026-10-11"
    kind: designed
    summary: T1 落地后裁决 pin 终态规则——`.ans/project.json` 存在时 accepted:true 必须带 pin，无 pin 即未接受（fail-closed，由装配 T2 强制）；桌面导入运行期同意与 CLI 演示配置为两个显式登记的非-pin 例外，且桌面须「有 .ans 优先用」（新增 T10）；写入 T2/T4 规格与 §5.3
  - date: "2026-10-11"
    kind: designed
    summary: T3 落地后并入——§3.8 显式记录写入层的隐式第二边界（writeRoot=projectRoot 硬收窄：门禁放行 skill 根写、写层仍拒；授权唯一来自 Section 1 的主张受此限定但仍成立）；§3.9 裁决桌面 V1 保持「只判不写」（UI 须明示），真实写入列二期 S2；T10 补「只判不写」提示
  - date: "2026-10-11"
    kind: changed
    summary: T7 落地后修正 §7 的顺序缺陷与票据缺陷——已核实 Pi 的 on("tool_call") 早于 execute，故审核整条移到唯一 spawn 点 execute（结构性保证），扩展层退为能力级 kill-switch；删除 T7c 的可重算 token（bindShellToken）与 ShellReviewResult.token；新增 §7.9 env 凭据剥离、§7.10 argv/shell:false 对 (c) 规则集前提；同步 §7.1/§7.2/§7.3/§7.5/§7.7 与 T7/T8 规格
  - date: "2026-10-11"
    kind: changed
    summary: T10 落地后并入——§3.9 更正「只判不写」仅为 demo 路径属性（pi 路径真实写入、受门禁，合客户导入=授权模型），界面文案按运行时如实；§3.10 新增 .ans 载入器共享化（落 src/common/shared/，pm 属主，搬迁非 fork；装配去重、桌面接线）；新增 T11/T12/T13
  - date: "2026-10-11"
    kind: designed
    summary: 客户推翻固定模板 init——bootstrap 改为 su 对话式（放桌面）、废 ans init。新增 §10：有界创世例外（空项目 su 写权限 = 项目根治理种子边界 + 操作者 bootstrap acceptance，双重有界+自终止+留痕 ⇒ 非 blanket）、listProject 空目录不抛错、桌面未-bootstrap 状态+左树刷新、T4 产物去向（删 init / 复用 bootstrap.ts / manifest 改由 su 会话触发）、保留 ans govern 并与桌面 su 同一引擎；T4 作废并入 T16；新增 T14–T18
  - date: "2026-10-11"
    kind: designed
    summary: 客户追加定调并入 §10——su 为默认入口与主路径、其他角色降为次级（保留可聊；左树置顶/默认选中、primaryRoleId 由 listProject 给、渲染不硬编码 su）；角色完成后结果交回 su（TaskHandback：搬证据不搬身份/写权，V1 事件+界面呈现、自动路由=S1）；并入 T14/T16/T17 规格
  - date: "2026-10-11"
    kind: changed
    summary: 客户确认「桌面 shell 闸 V1 不 arm」——记入 §8 已定项（桌面不提供 shell；对话框通道已建未消费；是 V1 范围非欠账；无需实现改动）；新增 T19（桌面应用：changelog 措辞由「待客户拍板」改「客户已确认：V1 不 arm」）
  - date: "2026-10-11"
    kind: changed
    summary: 全仓盘点 §6 逼出的跨角色镜像并裁决收敛——§3.11：operator 三型挪 src/provider/pi/session.ts（冻结契约家）；PI_CREDENTIAL_ENV_VARS/RuntimeKind/resolveSkillRoot/toPosix 收敛到 src/common/shared/；fs-write.ts 路径镜像（安全相关，高优先）收敛到 shared 路径原语；新增 T20–T25
  - date: "2026-10-11"
    kind: changed
    summary: 追加 §3.11 行 7——normalizeArgv（审计↔展示须同源）收敛到 shared；并对全量声明重名复核：跨角色语义镜像仅此一处，errText/reasonOf（平凡同义）、resolveRuntime（同名不同义）、renderSystemPrompt（同角色）、HERE/USAGE（偶合）均显式排除
  - date: "2026-10-11"
    kind: designed
    summary: 客户新增跨角色需求「桌面 Pi 配置界面 → 保存 .env」——新增 §11：红线改写（凭据可写指定 .env、绝不入库/回显，归 Pi适配器）、配置来源与落点（仓库根 .env，指定写入者=共享 env-file 模块，Governance 记录动作 G-2）、配置到达适配器（不扩 createPiAdapterFactory 签名，桌面经 shared 把 .env 载入 process.env，resolvePiProviderConfig 原样复用）、写入纪律（只改相关键/掩码/原子/失败显式）、与 runtime 选择器关系；新增 G-2 + T26–T29
  - date: "2026-10-11"
    kind: changed
    summary: 真实端到端 bootstrap 缺口修正（客户「不预建，全由 su 对话决定」）——新增 §12：三处缺口（su 无 scope 写不了 / 桌面没接 genesisBootstrap / 无路径指向空文件夹）；核心裁决＝把门口放「边界选择」层（genesisBootstrap + 种子边界改普通目录 + scope:undefined，hasRoles 自动切回，仍非 blanket）；ans govern 接受目标目录；退役 SCAFFOLD_ROLES/writeGovernanceSkeleton、种子边界迁入门禁引擎（消除 §6 违规 import）；验收按用户入口重写（确定性 vs 客户跑）；新增 T30–T35
  - date: "2026-10-11"
    kind: changed
    summary: bootstrap 完成方式重定（客户）——推翻 §12.5：完成＝su 提议→客户确认→才 finalize（新增 §13）。su 主动＝finalize_bootstrap 工具（语义为「挂起提议、等确认」，复用 shell 闸 OperatorChannel 不造第二套，仅创世态注册、非创世态拒、同样过门禁）；自终止松绑（finalize 后 su 边界＝项目治理边界文档角色卡/governance-boundary.yaml，三普通目录条目、非 blanket）；pin 首次在确认时、其后每轮 settle 自动刷新（加角色不过时）；按钮不删、改造为 su 提议确认面；新增 T36–T39
  - date: "2026-10-11"
    kind: changed
    summary: shell 闸 (c) 判定重定（客户）——新增 §14：ShellClass 增第四档 risky（危险但有正当用途→过 b→必过 a，pm 非终审）；次序与终结规则写死（risky：b allow 仍过 a、b deny 终结、a 拒/超时/不可用→拒）；硬拒名单重划（re-shell/eval/LOLBin/提权/系统破坏仍硬拒；rm/sed -i/dd/wrapper/构建等改 risky）；sh -c 的洞＝re-shell 类仍硬拒（放行即绕过门禁），只放「程序名在 argv 可见」的危险命令；arm 建议 V1 不接、如实登记；新增 T40–T43
---

# V1 完整实现方案：bootstrap/创建权、写入落盘、其余占位项与 V3 取舍

> **状态**：**方案（design）**，供客户判读与确认后派发实施。本文件**不写代码、不改任何角色文件**；它回答「谁做、在哪做、按什么顺序、做成的判据是什么、风险在哪、V3 怎么选」。
> **本文件与已接受契约 `2026-10-11_design_ans-cli-v1-prototype.md`（下称「契约」）的关系**：契约把三块中的两件事**明确划为非范围**——§0 的「F2：§2.6 创建权不下放」与「不做治理 `ans govern` 完整 bootstrap」，以及 §4 的「原型阶段不真正落盘」。客户本次指令**显式推翻**这两处非范围，故本方案是契约范围的一次**经客户点头的扩展**；契约其余部分（分层、冻结接口、F4–F10）仍全部有效，本文件不改动它们。
> **凡本文件与契约冲突之处以本文件为准**；本文件未重述的契约条款继续有效。

## 0. 场景与目标

今天的原型能「在写入发生之前拒绝越界写」，但两处关键能力是空的：

1. **`ans init` / `ans govern` 是占位**——`init` 只打印一行说明、不建任何东西；`govern` 因缺配置注入通道直接以码 2 结束（`src/interface/cli/init.ts`、`govern.ts`）。**从零创建一个受治理项目的角色结构与边界**，今天只能靠人（或顶层会话）手工落盘。
2. **受治理工具不真落盘**——`src/provider/pi/tools.ts` 的 `write_file` / `edit_file` 在获准后只回一句「原型阶段未真正落盘」（该文件只 `import` 了 `readFile`）。**一个受治理会话无法真正改代码**，因此无法「真实开发一个项目」。

本次要把它补成一条能真正跑起来的链路：`ans init <dir>` 建出项目骨架与边界 → `ans govern`（治理会话）拥有创建/重构角色的权力 → 受治理角色会话能**真正改盘**且越界写仍在写之前被拒 → `.ans/project.json` 的 SHA-256 pin 与 acceptance 链、调度记录落盘、以及 V3（客户已裁定：**给 shell，但执行前必须过 pm 审核**）各有机制（见 §7）。

一个具体例子（目标形态）：

```
ans init ./orders-service            # 在空目录建出 7 角色骨架 + 边界 + .ans/project.json(pin)
ans govern ./orders-service          # 治理会话：可创建/重构角色、维护边界（受项目治理边界约束）
ans role run 编排 --task T-1         # 受治理会话真正把改动写进 orders-service 的盘
```

## 1. 归属分配（谁做什么）

底层归属沿用契约 §1（层↔角色的既定映射），此处只列**本次三块各落在谁的边界内**。所有新增**源码**尽量放进各角色已授权的**目录**条目下（`module-boundary.md`：已接受目录内增删文件不需逐条改边界），以避免为每块新文件都申请 Section 1。

| 块 | 子项 | 归属角色 | 落点（源码） |
| --- | --- | --- | --- |
| **块2 落盘** | `write_file`/`edit_file` 真写盘、写根、原子写与写前复检 | **Pi适配器** | `src/provider/pi/tools.ts`、`src/common/pi-adapter/` |
| **块1 创建权** | `ans init` 骨架生成 + 项目治理边界种子 | **编排**（CLI+Pipeline） | `src/interface/cli/init.ts`、`src/pipeline/orchestration/govern-session.ts`、`src/common/编排/` |
| | `ans govern` 治理会话产出创建/重构写入 | **编排** | 同上 |
| | bootstrap 的**目标写授权判定**（对项目治理边界求值） | **门禁引擎** | `src/service/gate/`、`src/common/门禁引擎/` |
| | `.ans/project.json` 的**加载 / pin 校验 / acceptance 生成**（配置读） | **装配** | `src/index.ts`、`src/common/装配/` |
| **块3 pin** | SHA-256 pin 与 acceptance 链的**校验算法与 Model 形状** | **门禁引擎** | `src/model/`、`src/common/门禁引擎/` |
| | 调度记录落盘（`docs/scheduling/<task-id>.md`） | **项目管理**（承载；写入器仍 `task_ops`） | `docs/scheduling/`（已在 pm 边界内，无需新授权） |
| **块3 V3** | `run_shell` 工具 + 命令级闸接线（**不**打开内置 bash） | **Pi适配器** | `src/provider/pi/tools.ts`、`src/common/pi-adapter/real-adapter.ts` |
| | shell 确定性规则引擎 (c) | **门禁引擎** | `src/service/gate/`、`src/common/门禁引擎/` |
| | `ShellGate` 装配：(b) 问 pm 角色 + (a) 操作者通道 + 审计 | **编排** | `src/common/编排/`（(b) 经 `openRoleSession`） |
| | 操作者确认通道 (a) | **Interface / 桌面应用** | `src/interface/cli/`、`app/` |
| | shell 审计记录（落盘**以 pm 授权**，conditions 须声明 `shell-gate`） | **项目管理** | `docs/audit/`（已在 pm 边界内，condition `shell-gate`） |
| — | 独立跨角色验收 | **测试** | `test/测试/` |
| — | 方案/协调/验收、`docs/` 维护 | **项目管理** | 本角色边界内 |

**写集仍互不重叠**；任何角色只写自己 Section 1 内的文件。

## 2. 新增路径 / 全新项目目录的授权问题（重点）

这是本方案唯一的**硬问题**，必须说清，且我有明确判断。

### 2.1 事实

1. **`.ans/` 目前无任何角色认领**：`grep` 全仓，`.ans/project.json` 只在设计稿文字里出现，`src/`、`app/` 无任何代码读它，`.ans/` 目录实际不存在。
2. **bootstrap 的目标是一个全新项目目录**：`ans init <dir>` 要在 `<dir>` 下建 `角色卡/<角色>/`、`.ans/project.json`、`docs/`。这些目标路径**不在任何角色的 Section 1 内**——它们属于**目标项目**，不属于 ans-cli 本项目。
3. **技能规则**（`SKILL.md` / `module-boundary.md`）：未列即只读；新增目录权限须由 **Governance 更新 Section 1 并经客户确认**；**禁止 blanket 授权**；**角色由 ANS Governance 创建**、「角色从不创建自己」；边界改动与代码改动受同样的证据/接受门。
4. **技能安装目录不可改**：`C:\Users\MLoong\.claude\skills\ans-governed-construction` 是 symlink → `D:\work\code-work\ans-skill`；`boundary-core.ts` 注释明写「技能安装目录不可改」，内置边界 `references/built-in-boundary.md` 只作 legacy 回退读取。
5. **§2.6「角色由 pm 创建」是对 SKILL.md 的未确认改动**（`docs/project-rules.md` §四、`memo.md` 多行、设计评审均记录），与 SKILL.md「角色由 Governance 创建」冲突。

### 2.2 判断一：`ans govern` 的创建权**可以在 ans-cli 内落地**，无需改 SKILL.md

关键事实：SKILL.md 的 built-in-boundary **自身**就写明了「项目可用**它自己的治理边界文档**覆盖 Section 1，此时以项目本地文档为准」（`references/built-in-boundary.md` §Governance）。也就是说，Governance 的写权限**不必**来自技能内置边界，而可以来自**项目本地、挂靠项目根**的治理边界文档。

而 `boundary-core.ts::resolveBoundarySection` 已经实现了这条优先级链：**项目覆盖（若已接受）> 治理边界覆盖 > 内置（未接受）**。当前内置边界对一切写入 fail-closed（`acceptance.accepted===false`），且条目 `root:"skill"`（技能根），所以对**目标项目**根本命中不了。

**因此我判断：`ans govern` 的创建权应由「项目本地、root=project 的治理边界文档 + 客户 pin 的 acceptance」承载，而不是去改 SKILL.md。** 这不是绕过规则，而是 SKILL.md 明示允许的项目覆盖机制：

- 该治理边界文档以 **project 根**声明条件目录：`角色卡/`（`condition: role-restructuring`）、`docs/`（`condition: docs-bootstrap`）、`.ans/`（新增 `condition: project-init`）。条件语义复用现有 F5 机制——**bootstrap 只在任务显式声明该条件时才放开**，不做 blanket。
- 它的 `acceptance` 由 `.ans/project.json` 提供（见 §4.3），`source` = 客户 pin 说明，且以 **SHA-256 pin** 把「接受了哪个版本的边界」钉死（篡改即失效，fail-closed）。
- `resolveWrite` 已有的判定链（parseError → F6 → 根归属/F7 → 匹配条目 → F4）**原样复用**，只是这次求值的边界是**项目根**而非技能根。

这直接兑现客户 item 1「让 `ans govern` 真的拥有创建权」，且**满足 SKILL.md 全部约束**（角色由 Governance 创建、新目录权限由 Governance 定义、无 blanket、无越改技能目录）。

### 2.3 判断二：§2.6「pm 创建角色」**在现有规则下走不通**——替代路径如下

「改在哪里」的硬答案：**§2.6 要改的规则文本在 SKILL.md 里，而技能安装目录不可改**。所以这笔改动**无法在 ans-cli 内落地**——它只能在**技能仓库**（`D:\work\code-work\ans-skill`，本方案范围外，由技能归属方）改 SKILL.md 后重装。在 ans-cli 里假装改了、或靠边界「偷偷」给 pm 创建权而不留痕，都是把失败伪装成成功，不做。

**客户决定（2026-10-11）——按 su 创建**：

- **V1 由内置治理角色 su（ANS Governance）创建角色**，用 §2.2 的项目治理边界机制落地——**不改 SKILL.md、不登记偏离**。这兑现客户「让 ans govern 拥有创建权」的实际目标。
- **「pm 创建角色」不作为 V1 的能力**，**不实现**。它只在文档里如实留一条「**未正名的偏离**，待改技能仓库时正名」（与已有的「`boundary.yaml` 格式偏离技能约定」同类，同为**待正名的偏离**）：即「§2.6 提出 pm 创建」与 SKILL.md「角色由 Governance 创建」冲突，而我们**在本项目内无法改 SKILL.md**（技能安装目录不可改），故此项**搁置、不落地**，仅登记在案，等技能仓库侧正名时一并处理。
- **为何不在 ans-cli 内以边界手段实现 pm 创建**：机制上虽可（Governance 给 pm 加条件目录条目 + 客户确认），但那会引入一个**与 SKILL.md 文字冲突却已生效**的权限；客户已决定**不这么做**——V1 保持合规、干净。记录这一取舍，避免日后有人误以为「pm 创建」已经想过、做过了。

### 2.4 bootstrap 的「创世」性质（必须显式说明的例外）

> **2026-10-11 更新：创世证据由「`ans init` 指令」改为「操作者发起的 su bootstrap」——见 §10.1（有界创世例外）。** 本节其余思路（逐路径留痕、su 冷启动、目标不在任何 Section 1 内）仍适用；`ans init` 已废。

`ans init` 的目标是**空目录**，此时**没有**任何已接受的边界可供 `resolveWrite` 求值——bootstrap 正是在**创建**这些边界本身。故：

- **`ans init` 的写授权不是 `resolveWrite` 对既有边界的判定**，而是**创世操作**：其授权证据是**客户的 bootstrap 指令**（对应 SKILL.md bootstrap「候选交客户接受」那一步），其产物是后续会话要检查的边界与 pin。这一点必须在 `init` 的代码与文档里**显式声明**，并对**每一个创建出的路径**留下可审计记录（写日志 + `init` 打印创建清单）。
- **`ans govern`（init 之后）** 则回到正常门禁：其 gate = 对**项目治理边界**求值；越出 `角色卡//docs//.ans/` 的写入（如去改 `src/`、或写到项目根之外）**在写之前被拒**。
- 目标项目内的 `docs/` 与 `角色卡/` 是**治理产物**（SKILL.md：治理产物由 Governance 创建），与各能力角色的 Section 1 是**不同层级**的两套边界：前者是「Governance 在目标项目里能建什么」，后者是「目标项目的各角色各自能改什么」。二者不重叠，因为它们是**不同项目**的边界表。

### 2.5 新增路径的归属结论（ans-cli 本项目内）

- **`.ans/project.json`（+`.ans/`）**：归 **装配**（它是配置，与 `package.json` / `tsconfig.json` 同类）；**加载与 pin 校验**归装配，**pin 的算法与 Model 形状**归门禁引擎。
- **ans-cli 自己也要有 `.ans/`（客户已定：纳入）**：ans-cli 现在是一个**真实的受治理项目**，它自己也该有 `.ans/project.json`（pin 住本轮七个角色的 `boundary.yaml`，作为本项目的 acceptance 证据）。
  - **归属**：`.ans/` 是**配置**，归 **装配**。
  - **谁给 Section 1 条目、以什么形式**：`.ans/` 是**新增目录**，按 SKILL.md「新增目录权限须 Governance 更新 Section 1 并经客户确认」——由 **Governance（su）以「更新 `角色卡/装配/boundary.yaml`，增加一条 `kind: conditional-directory, path: .ans/, condition: project-init`（root project）」的形式给出**，**经客户确认**后生效；随后**装配**才可写入 `.ans/project.json`。（`.ans/` 目录内的 pin 目标——各角色 `boundary.yaml`——仍各自归其角色，`pins` 只**读**它们算 hash，不改。）**（已于 2026-10-11 由 Governance 完成该授权、客户批准，见 `docs/change/2026-10-11_change_governance-section1-grants.md`。）**
  - **写入条件（硬要求）**：`ans init` 写 `.ans/project.json` 时，**必须在 `TaskScope.conditions` 里声明 `project-init`**；否则门禁以「命中条件目录但缺少条件」在写入前拒绝（Gov 已自证缺失条件即被拒）。
  - **为何用条件目录**：条件 slug 使「.ans/ 的写入」只在**显式声明 `project-init` 条件**时才放开（F5 机制），不做 blanket。
- **目标项目的 `docs/scheduling/`**：内容唯一写入者是调度角色 / `task_ops`（见 §4.4）；目录本身在 bootstrap 时由 su 按项目治理边界创建。

## 3. 实现设计（按块）

### 3.1 块2：写入真正落盘（Pi适配器）

**目标**：`buildGovernedTools` 的 `write_file` / `edit_file` 在 `gate(path).allowed===true` 时**真正改盘**；`allowed===false` 时**零副作用**。

**改动点**（`src/provider/pi/tools.ts`，本角色边界内）：

- 新增 `writeRoot`（经 `GovernedToolsOptions` 注入，**必须等于 `projectRoot`**）。写类工具在调 gate 前，把 `path` 解析为绝对路径 `abs = isAbsolute(path) ? path : resolve(writeRoot, path)`，**并把 `abs` 传给 gate**；写入也用**同一个 `abs`**。这与 `resolveWrite` 把相对路径按项目根解释的既有行为一致（`resolve-write.ts` 第 108–111 行）。
- `write_file`：`allowed` 后 `mkdir -p` 父目录 → **原子写**（同目录临时文件 + `rename`）。
- `edit_file`：读原文件 → 以 `old_string`/`new_string` 做替换（`old_string` 不存在 → 返回 `ok:false`，**不写**）→ 原子写回。保留 BOM/EOL 策略需明确（见 §6 风险）。
- 保留 `read_file` **不过写门禁**的现状（读是调查动作，不是写边界威胁面）。

**待核实/需注意**：`real-adapter.ts` 的 `toPiTool` 已把参数 JSON-Schema 定为含 `path/content/old_string/new_string`，落盘实现可直接消费；`readTargetPath` 已容忍 `path/file_path/filePath` 三命名，保持。

### 3.2 块1：bootstrap / 创建权（编排 + 门禁引擎 + 装配）

> **⚠️ 2026-10-11 更新：本节大半已被 §10 推翻。** `ans init`（骨架生成）**作废**，bootstrap 改为 **su 对话式**（§10）。本节仅**两点仍保留**：①「装配为 `init`/`govern` 补**配置注入通道**」（`govern` 部分仍需要 → T2）；②「bootstrap 的**目标写授权判定**归门禁引擎」（→ 冷启动边界求值，**T15**）。`init` 相关的骨架生成、条件 slug 声明等，以 §10 为准。

- **编排**：`initCommand` 由占位改为**骨架生成器**——按模板建 `角色卡/<角色>/{role-card.md, boundary.yaml, memo.md, docs/{design,feature,change,fix}}`、`docs/`、`.ans/project.json`（种子，见 §4.3）。`governCommand` / `runGovernSession` 由占位改为**真治理会话**：`scope` 不再恒为 `{writeSet:[]}`，而是按项目治理边界的条件目录给出可写集（或走「无 scope、仅按边界」），其 gate = 对**项目治理边界**求值。
- **门禁引擎**：新增 bootstrap 的**目标写授权判定**——本质是把 `resolveWrite` 用于「项目治理边界 + project 根」情形；若现有 `resolveWrite` 已能直接服务（它已是纯函数、ctx 传 skillRoot/projectRoot），则**优先复用、不新增接口**，只在需要时补 Model 字段。
- **装配**：`src/index.ts` 为 `init` / `govern` 补**配置注入通道**（当前 `governCommand(argv)` 冻结签名不接收配置，是占位码 2 的根因）；由装配**加载 `.ans/project.json`**（装配读配置）并注入。
- **新增文件的边界纪律**：Pipeline 的 `run-role.ts` / `govern-session.ts` 是**逐个列出的文件**，若新增 `src/pipeline/orchestration/bootstrap.ts` 需 Governance 加条目；**建议**把 bootstrap 逻辑放进**已授权的目录** `src/common/编排/`（目录条目，增删文件免改边界），避免不必要的新授权。

### 3.3 块3a：`.ans/project.json` 的 SHA-256 pin 与 acceptance 链（门禁引擎 + 装配）

> **2026-10-11 更新（T1 落地后裁决）**：T1 已实现 `pin?: PinEntry[]`（`{path, sha256}` 列表）与 `verifyPins`，但**仅当 `acceptance.pin` 存在时启用**（opt-in，向后兼容）——**漏写 pin 即绕过**。据协调方指出，这与本方案目标「accepted 必须能追到固定 hash」有实质落差。以下是**终态裁决**，已写入 T2/T4 规格。

- **Model（门禁引擎，T1 已落）**：`Acceptance` 增可选 `pin?: PinEntry[]`（`{ path, sha256 }`，逐文件列表）。
- **校验（门禁引擎，T1 已落）**：`loadBoundaryFile` 在 `accepted:true` 且 `pin` 存在时，逐条比对边界文件 SHA-256（含「正在加载的边界文件须被至少一条 pin 覆盖」）；任一不符 → **未接受 + parseError**（fail-closed）。
- **装配（T2）**：加载 `.ans/project.json`，把 `roles` / `governanceBoundary` / `pins` / `acceptance` 注入命令；缺文件 → 回退现有内置（未接受）路径，行为**不放松**。

**终态规则与例外（项目管理裁决 2026-10-11）**：

- **`accepted:true` 必须二选一**：**(a) pin-backed**，或 **(b) 属于「登记的非-pin 来源」**。**没有第三档。**
- **`.ans/project.json` 存在时，其 acceptance 必须 pin-backed。** 无 `pin` → **该来源视为未接受（fail-closed）**。**由载入方（装配，T2）强制**（认可 accepted 之前先查 pin 是否存在）；引擎的 hash 比对（T1）在其上再加一层。
- **「登记的非-pin 来源」仅两个，且须在代码与文档里写死理由**：
  1. **桌面应用：导入项目即授权（运行期同意）** —— 它是**人在导入时就本次会话作出的实时授权**，不是**预先钉住的产物**；pin 的语义（对预钉产物做篡改检测）对它**不适用**，硬加 pin 是假的。
  2. **CLI 演示内嵌配置（`src/index.ts` 的 `DEMO_ACCEPTANCE`）** —— 原型演示替身，已登记为已知偏离。
- **桌面应用须「有 `.ans` 就优先用它」**：项目带 `.ans/project.json` 时，桌面**优先加载它（pin 生效）**，仅在**无 `.ans`** 时才回退到运行期同意——使桌面**不再无条件绕过 pin**。
- **为何不取 (i)「桌面也补 pin」**：桌面信任模型是**实时同意**（客户已定「导入即授权、无弹窗」），补 pin 与之冲突且语义虚假。**为何不取 (iii)「维持 opt-in 并改措辞」**：那等于承认 §3.3 目标落空。**故取 (ii) 的强化版**：pin 强制于 config 路径 + 桌面/演示两个**显式登记例外**（+ 桌面改为优先 `.ans`）。

### 3.4 块3b：调度记录落盘（pm 承载，经唯一写入者）

- 契约 §0 的 F3 偏离（本期不建调度记录）**本次取消**。**约束不变**：`docs/scheduling/<task-id>.md` 含 hash 链式机器段，**唯一写入者是 `task_ops`**（技能 `scripts/task_ops.py`）。
- **归属（客户裁定「调度权归 pm」）**：调度记录由 **项目管理（pm）承载**——pm 是**发起/承载方**，`task_ops` 仍是**唯一写入者**（pm 不另写一份）；**编排不得直接写**（F3、`project-rules.md` §四「调度记录归属」、`docs/architecture.md`）。此条**修正**本方案早期写法「编排调用 `task_ops`」——把调度**权力**归回 pm，只保留**机制**在编排。
- **pm 的运行时功能**（调度权落在哪、是否需新授权、与编排的职责边界）见 §3.6。

### 3.5 块3c：V3（`run_shell`）——给 shell，执行前须过 pm 审核

客户已裁定：**给 shell，但任何执行前必须过 pm 审核，审核不放行就绝不执行**。机制设计见 §7（安全实质、审核主体 (a)/(b)/(c) 的选项与代价、落点、fail-closed、留痕、与 `GOVERNED_WRITE_TOOLS` 的关系）。**(a)/(b)/(c) 的具体信任模型交客户定**；本方案给机制骨架与推荐组合。

### 3.6 pm 的运行时功能（调度权）

**客户裁定：「调度权力还是归项目主管把」——调度权归项目管理（pm），不归编排。** 这与 SKILL.md **自洽**：SKILL.md 的调度交接方向是 su →「项目调度/主管角色」，且写明「**the project scheduler routes coordinated execution to the correct accepted role before dispatch**」——**路由执行的正是主管角色，不是通用管线**。故客户这条**不是新增偏离，而是回到技能原本的设计**。

**机制 vs 权力（必须分清，这是本节的要害）**：

- **机制**（谁提供「打开一个受治理角色会话」的执行能力）→ **编排**：`runRole` / `openRoleSession` 在 `src/pipeline/orchestration/`，归编排，**无争议**。
- **权力**（谁决定**派给谁**）→ **pm**：决定「哪个任务、派给哪个角色、什么 `scope`、什么顺序」是**调度权**，归 pm。**客户裁定的是权力，不是机制。**

**pm 的运行时功能到底是什么**（它运行时站得住的依据，而非只是设计与记录的 owner）：

1. **派发决定（power）**：pm 在其**角色会话**里，依角色卡与工程法案，产出**一份派发计划**——`taskId → [{ roleId, scope, deps }]` 及顺序。这是 pm **作为角色在运行时的判断产出**，**不是新 pipeline 代码**。
2. **调度记录（power 的留痕）**：pm 把派发计划与状态写入 `docs/scheduling/<task-id>.md`（**其边界已含 `docs/scheduling/`**）；机器段经 **`task_ops`（唯一写入者）** 落盘。**pm 是发起/承载方，`task_ops` 仍是唯一写入者**——**不新增第二份写入者**。
3. **机制调用**：pm 的派发计划由**编排的机制**实际启动（`openRoleSession` 打开目标角色会话）。**pm 决定派发，编排执行派发。**

**职责边界（防两角色互踩）**：

| | pm（权力） | 编排（机制） |
| --- | --- | --- |
| 决定派给谁 / 顺序 / scope | ✅ | ❌ |
| 写 `docs/scheduling/` | ✅（经 `task_ops` 落机器段） | ❌（F3：编排不得直接写） |
| 提供 `runRole` / `openRoleSession` | ❌ | ✅ |
| 打开并管目标角色会话 | ❌ | ✅ |
| 改 `src/pipeline/`、`src/interface/` | ❌ | ✅ |

**数据接口**：派发计划（结构化：`taskId → [{ roleId, scope, deps }]`）+ 调度记录路径。**若**把「计划 → 执行」的胶水**代码化**，该胶水代码归**编排**（机制执行者），pm 只提供数据。

**是否需要新授权？**

- **调度记录落盘：不需要。** pm 的 Section 1 **已含 `docs/scheduling/`**；写入器仍是 `task_ops`（唯一写入者），pm 只**发起**。
- **pm 的派发决定本身：按「模型在上下文里决定」不占任何 `src/` 路径，不需授权**——pm 写出的只有 `docs/scheduling/`（已在边界内）。
- **仅当**客户要 pm 的派发决定**代码化、且代码放在 pm 名下**时，才需**新增 pm 的 Section 1**（如 `src/common/项目管理/`），那要走 **Governance + 客户确认**。**我建议避免**：让这段「计划 → 执行」代码归**编排**（机制侧），pm 只出数据——**不新增授权、职责最清**。

**对依赖图 / 派发清单的影响**：T6 归属由「编排」改为 **pm**（位置未变，`T4 → T6` 仍在）；但 **T6 的性质变了**——它**不是产品代码 dev 任务**，而是**使用约定**（pm 依角色指引、借 `task_ops` 落调度记录；`docs/scheduling/` 已在 pm 边界内，**无新授权**）。**「pm 产出计划 → 编排逐条开会话」的执行路径不在 V1**，见 §3.7。

### 3.7 范围边界：调度「执行」路径不在 V1（如实登记）

**缝已确认（指出得对）**：T1–T9 里**无一条**建「按 pm 的计划开会话」这条路——T5 是 `ans govern` 治理会话、T6 是调度记录落盘，都不是「按计划派生角色会话」。为避免把「调度权归 pm」写成一句**纸面 assignment**，明确取**选项 (B)：调度执行路径不纳入 V1**。

- **V1 只做到**：pm 的**权力归属落纸面** + 调度记录的**使用约定**（pm 依角色指引，经 `task_ops` 落记录）。**「pm 产出计划 → 解析 → 逐条 `openRoleSession`」这条执行链，V1 不实现。**
- **V1 演示到此为止**：`ans init` 建项目骨架 + 边界 + `.ans` pin；`ans govern` 创建/重构角色；一个受治理角色会话**真正落盘改代码**且越界写在**写前被拒**；`.ans` pin 篡改即失效；V3 shell 闸 (c)+(b)+(a)。**不演示多任务派发**（pm 规划任务图并启动多个角色会话）。
- **为何**：**客户授权的三块里本来就不含「派发引擎」**（主因）；另加一条如实的**操作约束**：验证「pm 用其模型产出计划」需要**真实模型轮次**，而按项目当前的操作约束，那**必须由客户本人运行**（含凭据的命令在本环境被拦、不代跑），故 V1 内**不宜把它列为可自动验收项**。故留二期。

**二期（未纳入 V1）：派发执行任务 S1**（胶水代码归**编排**，与「不新增 pm 授权」一致）——数据格式**定成确切形状**（非示意）：

```ts
// pm 产出、编排解析执行的派发计划（二期）
interface DispatchPlan { taskId: string; stages: DispatchStage[]; }   // stages 有序
interface DispatchStage {
  id: string;                 // 阶段 id，计划内唯一
  roleId: string;             // 目标角色，须在 project.roles 或 builtInRoles 内
  scope?: TaskScope;          // 收窄（writeSet/conditions）；缺省 = 仅按角色边界
  deps: string[];             // 前置阶段 id；须全部 done 才放行
  runtime?: "demo" | "pi";
}
```

- **谁解析**：**编排**——校验 `roleId` 在册、`deps` 已满足、无环。
- **谁执行**：**编排**——按拓扑序逐条 `openRoleSession({ roleId, project, taskId, scope })`，`send` 该阶段任务 → 收事件 → `dispose`。**pm 决定派发，编排执行派发**（§3.6）。
- **验收（二期）**：给定计划 → 依 `deps` 顺序开会话；`roleId` 不在册 / `deps` 未满足 / **成环 → 拒绝且不开任何会话（fail-closed）**。
- **依赖（二期）**：T3（会话真落盘）、T5（治理会话路径）、V3（若 pm/角色需 shell 调 `task_ops`）。

### 3.8 写入层的隐式第二边界（`writeRoot` 硬上限）——显式记录

**背景（T3 带回）**：`src/provider/pi/tools.ts` 的写入层，`writeRoot` **恒为 projectRoot**；T3 如实标注：**「gate 放行的 skill 根写入也会被写层拒绝（有意收窄）」**。

**这意味着存在两层范围**：

- **门禁判定范围**：由 `boundary.yaml` 的 `root: project | skill` 决定（`resolveWrite` 对 skill/project **两根都判**）。
- **写入层落盘范围**：**恒为 projectRoot**——一道**不在任何 `boundary.yaml` 里表达**的硬编码上限。

**同一个写，可能「门禁放行、写层拒绝」。** 这是**有意的纵深防御**：内建治理边界全部 `root: skill`，这道收窄正好把「治理会话不该写技能安装目录」**在写层再兜一遍**——即便门禁因某配置错误放行了技能根写，写层仍不会真写进技能目录。

**哪些场景会「门禁说行、写层说不行」**：

- 目标落在 **skill 根**（如技能安装目录 `~/.claude/skills/ans-governed-construction/…`）且门禁因**条件目录被激活**（如 `reference-maintenance` / `role-restructuring`）而放行 → 写层仍拒。
- 任何**绝对路径指向 skill 根**的放行写入。

**对 V1 的影响**：

- `ans govern` 在**目标项目**里建角色，写的是 `<目标>/角色卡/…`（在 projectRoot 内）→ **不受影响**。
- su 对**技能安装目录**的写入 → **被写层拒**（与契约 §0「v1 治理会话不写盘」方向一致；技能目录本就不可改）。
- 这是**在门禁之上多一道兜底**，**不放松**任何既有守卫。

**对「Section 1 是唯一授权来源」这一主张的限定**：写入的**授权**仍**唯一**来自 Section 1（门禁）；写入层的 `writeRoot` 是**额外的、只紧不松的落盘上限**——它**不会**让 Section 1 之外的写入通过（只可能让 Section 1 之内的 skill 根写入被二次拒绝）。故主张仍成立，但须**显式记这条收窄**。

**记录要求（不留成隐含行为）**：本条须写进 ① 本方案（本节）；② **`docs/architecture.md`**（运行时段落补一句「写层有一道 `writeRoot=projectRoot` 的硬收窄」）——**项目管理**维护，本方案据此更新；③ 列为**一处已知的、有意的收窄**（与「容器/OS 沙箱未做」同列，如实标注）。

**验收（T3 侧）**：单元——门禁对某 **skill 根**路径判 `allowed:true`（构造条件激活的边界）+ 该路径**不在 projectRoot 内** → **写层拒绝落盘、无文件产生**（证明第二边界真的生效，且是「放行后仍拒」）。

### 3.9 桌面应用的写入能力（V1 裁决：按运行时路径区分，2026-10-11 更正）

**背景（T3/T10 带回）**：`app/desktop/chat-adapter.ts` 调 `buildGovernedTools(gate)` **未传 `writeRoot`** → **demo 路径**写层 fail-closed **只判不写**。但**桌面的真实 Pi 路径**（界面 runtime 切 `pi`）走**编排的 `createPiAdapterFactory` → 真实适配器**，T3 给它设的是 **`writeRoot = projectRoot`**——**那条路径会真的把文件写进被导入的项目**。故「只判不写」**并非桌面整体属性，而是 demo 路径的属性**。此前 §3.9 把它当整体属性、界面又加了「V1 桌面：只判不写」文案，**与 pi 路径冲突**（当前因 `ANS_PI_CONTEXT_WINDOW` 必填、客户 `.env` 未设而**碰巧不可达**——客户一旦补上即暴露）。

**裁决（V1 更正）：「只判不写」= demo 路径的属性；Pi 路径真实写入（受门禁约束）。**

- **demo 路径**（桌面 runtime = `demo`）：**只判不写**（无 `writeRoot` → 写层 fail-closed）。安全：演示不会改真实仓库。
- **Pi 路径**（桌面 runtime = `pi`）：**真实写入**，写入**被导入项目的 `projectRoot`**，且**受门禁约束**（角色边界 Section 1 + acceptance 链，与 CLI 同一套 `resolveWrite`）。**这与客户既定的桌面模型一致**——「导入项目 = 授权该角色按其完整边界工作；门禁静默执行」。前提：需凭据 + `ANS_PI_CONTEXT_WINDOW`。
- **为何不取「pi 也收窄成不落盘」**：那要主动**掐掉一条已工作、且受门禁约束的路径**，与桌面「真实客户端」的定位及客户模型相悖；且收窄点跨 `编排` / `Pi适配器` 两角色，为 V1 徒增耦合。**（这是可翻转的产品决定——若客户要 V1 桌面整体只读，明示即可，届时改收窄 pi 路径。）**
- **界面文案与文档必须一致**：文案**不得**再写「V1 桌面：只判不写」；改为**按运行时如实**，如「demo：只判不写；pi：受边界约束真实写入（需凭据）」。**不留「文档说不写、代码会写」。**

**验收（T10 补）**：① 桌面 demo 路径写入**不落盘**（既有断言保持）；② 桌面 pi 路径**能真写**（受门禁；越界仍被拒）；③ 界面文案与**各运行时**一致（demo / pi 分别如实）。

**二期（未纳入 V1）：S2 桌面 demo 路径真实写入**（如需）——给 demo 线程 `writeRoot`，**测试/演示用临时沙箱副本**（绝不指向 ans-cli 仓库）。**注**：**pi 路径的真实写入不是二期，V1 即生效**。

### 3.10 `.ans` 载入器共享化（裁决）——落 `src/common/shared/`

**背景（T10 带回，阻塞）**：裁定要求桌面「**带 `.ans` 优先加载（pin 生效），无 `.ans` 回退运行期同意**」。但载入器 `loadEffectiveConfig` / `enforcePinBackedAcceptance` 在**装配私有** `src/common/装配/config-loader.ts`；**工程法案 §6 禁止跨角色导入他人私有 `common/`**；`src/common/shared/`（pm 属主）无相应入口；渲染侧自写又是明令禁止的「第二份实现」。三条规则叠加 → **正当通路为零**。T10 如实报阻塞、**未复制第二份、未越界改**，处理正确。

**裁决：采纳「共享模块」方案。** 落点 **`src/common/shared/`**（pm 属主，跨角色共享）。

- **搬迁（非 fork）**：把 `loadEffectiveConfig` / `enforcePinBackedAcceptance` **整体搬迁**到 `src/common/shared/config-loader.ts`，**保持单一实现**（不复制）。
- **装配改为从共享模块导入**（去重）：`src/common/装配/config-loader.ts` 改为 re-export / 直接 import 共享模块，**删除本地重复**。
- **桌面也从共享模块导入**：兑现裁定——**有 `.ans` 用其 pin-backed acceptance；无 `.ans` 回退运行期同意**。
- **消费方更新规则（`common/shared/`，§6）**：一并记录——`common/shared/` 由 **pm 唯一写入**；消费方（**装配、桌面应用**）**只读导入**；该模块登记入 **`docs/architecture/shared-components.md`**（技能要求的共享组件文档，pm 维护）。这是**本项目首个共享组件**（此前 `architecture.md` 记「尚无共享组件」，须更新）。

**新任务**：**T11（项目管理）** 建共享模块 + 维护 `shared-components.md`；**T12（装配）** 改导入去重；**T13（桌面应用）** 接线（带 `.ans` 用 pin、无则回退）。依赖：**T11 → { T12, T13 }**。

### 3.11 跨角色重复盘点：§6 逼出的镜像与收敛（2026-10-11）

§6「不得导入他人私有 `common/`」逼出了若干**镜像**（各角色自持一份）。已暴露两处，现**全仓盘点**（`grep` 全量导出名 + 语义镜像注释），一次收敛。

| # | 重复物 | 现址（各持一份） | 类别 | 落点（裁决） | 优先级 |
| --- | --- | --- | --- | --- | --- |
| 1 | `OperatorPrompt` / `OperatorOutcome` / `OperatorChannelFn` | 编排 `src/common/编排/shell-gate.ts` ↔ 桌面 `app/desktop/operator-channel.ts` | 冻结契约型 | **`src/provider/pi/session.ts`（§4 冻结契约家，Pi适配器）** | 中 |
| 2 | `PI_CREDENTIAL_ENV_VARS` | 装配 `src/common/装配/runtime.ts` ↔ Pi适配器 `src/provider/pi/tools.ts` | 共享常量 | **`src/common/shared/`** | 中 |
| 3 | `RuntimeKind`（`"demo" \| "pi"`） | 编排 `args.ts` ↔ 装配 `runtime.ts` ↔ 桌面 `session.ts`（**3 处**） | 共享类型 | **`src/common/shared/`** | 低 |
| 4 | `resolveSkillRoot` | 装配 `src/index.ts` ↔ 桌面 `project.ts` | 共享 helper | **`src/common/shared/`** | 低 |
| 5 | `toPosix` | 门禁引擎 `src/common/门禁引擎/paths.ts` ↔ 桌面 `project.ts` | 共享原语 | **`src/common/shared/`** | 低 |
| 6 | **路径规范化语义镜像**（`normalizeLexical`/`compareKey`/`absRel` 等价、`realResolveAsync`） | Pi适配器 `src/common/pi-adapter/fs-write.ts` ↔ 门禁引擎 `paths.ts` | **安全相关原语** | **`src/common/shared/` 路径原语（单一来源）** | **高** |
| 7 | `normalizeArgv`（非导出函数） | 编排 `src/common/编排/shell-gate.ts` ↔ 桌面 `app/desktop/operator-channel.ts` | 共享函数（**审计↔展示須同源**） | **`src/common/shared/`** | 中 |

**裁决一（行 1）：采纳——挪到 `src/provider/pi/session.ts`。** 理由：那是 §4 **冻结契约家**（Provider 边界），且**编排已把** `ShellGate`/`ShellReviewRequest`/`ShellReviewResult` 放在那；operator 三型同属 shell 闸契约。**三处（编排 / 桌面 / 桌面测试）收敛为单一来源**：Pi适配器加定义；编排改导入、删本地；桌面（含 `test/桌面应用/operator-channel.test.ts`）改只读导入、删逐字镜像。

**裁决二（行 2）：采纳——移入 `src/common/shared/`。** 由 **pm** 建共享模块并登记 `shared-components.md`；装配与 Pi适配器改只读导入、删各自副本。

**裁决三（行 3–6）：一并收敛到 `src/common/shared/` 的「共享原语」。**

- 行 3/4/5 是**小**重复、优先级低，但同属 §6 逼出的镜像，一并归置。
- **行 6 安全相关、优先级高**：Pi适配器写入层与门禁引擎**各持一套路径规范化**——而**「gate 认为在根内」与「写入层认为在根内」必须一致**（设计 §6 风险 2–3「写根与 gate 同源」）。**收敛为共享路径原语（单一来源）**：门禁引擎与 Pi适配器都从中导入；**词法原语（`toPosix`/`normalizeLexical`/`compareKey`/`absRel`/`isUnderOrEqual`）逐字同源**；realpath（sync/async）可各自实现但**须复核一致**。

**为何不能各角色直接互相导入**：门禁引擎 `paths.ts` 明写「仅本角色使用，不导出给其他角色」，§6 又禁止跨角色导入私有 `common/`——故**唯一正当落点是 `src/common/shared/`（pm 属主）或 §4 冻结契约家**，这正是收敛方向。

**裁决四（行 7，2026-10-11 追加）：`normalizeArgv` → `src/common/shared/`（共享函数）。**
- **风险**：编排用它**构造写进审计记录的内容**，桌面用它**展示给操作者**——两边漂移则「**操作者看到的 argv**」与「**落进 `docs/audit/shell-gate.jsonl` 的 argv**」可能不是同一个东西，而审计的全部意义就是「审的什么原文」可查。与行 6 同类（gate↔写层同源），风险低一档。
- **落点体例**：`session.ts` 是 §4 **冻结契约（类型）家**（`OperatorPrompt` 类型在那）；`normalizeArgv` 是**跨角色共享的纯函数**（无 Provider 耦合），按 §3.11 既有体例（行 6 路径原语同样落 shared）→ **放 `src/common/shared/`**。（若团队偏好「类型与其规范化同址」，`session.ts` 亦可接受；**我取 shared**，保持契约文件以类型为主、共享行为集中在 shared。）
- **派人**：**pm（T23）** 在 shared 建 `normalizeArgv`；**编排（T21）** 删 `shell-gate.ts` 本地副本、改导入；**桌面（T22）** 删 `operator-channel.ts` 本地副本、改导入。**行为逐字不变**（影响审计内容与操作者所见，零语义漂移）。

**复核（2026-10-11，全量声明扫描，非仅导出名）**：对全仓**全部** `function/const/type/interface/class` 声明做重名扫描后，**跨角色的语义镜像只剩行 7 这一处**。其余同名均**非同类**，逐一裁定如下（**不是遗漏，是显式排除**）：
- `errText`（编排内 4 文件）/ `reasonOf`（编排 2 + Pi适配器 1 + 桌面 1）——都是 **`err instanceof Error ? err.message : String(err)` 这一行的同义反复**，跨角色重复但**极其平凡**。**裁决：不合并**（把 1 行 utility 提到 shared，耦合成本大于收益）。**如实登记为「有意保留」**，避免日后被当遗漏再揪。
- `resolveRuntime`（装配 `runtime.ts` ↔ 编排 `run.ts`）——**同名不同义**（装配做完整 argv+env 解析，编排只是个 `"pi" else "demo"` 兜底），**非镜像**。
- `renderSystemPrompt`（Pi适配器 `session.ts` ↔ `real-adapter.ts`）——**同角色内**，非 §6 跨角色问题。
- `HERE` / `USAGE`——**通用写法/各命令自有文案**，偶合命名，非抽象。

**任务（T20–T25）**：

- **T20（Pi适配器）**：`session.ts` 加 operator 三型（无依赖）；`tools.ts`/`fs-write.ts` 消费共享原语、**删 `PI_CREDENTIAL_ENV_VARS` 副本与路径镜像**（后者的部分依赖 T23）。
- **T21（编排）**：operator 三型改从 `session.ts` 导入、删本地。
- **T22（桌面应用）**：operator 三型改从 `session.ts` 导入（含其 test）；`project.ts` 的 `toPosix`/`RuntimeKind`/`resolveSkillRoot` 改从 shared 导入、删镜像。
- **T23（项目管理）**：建 `src/common/shared/` 模块（凭据常量、路径原语、`RuntimeKind`、`resolveSkillRoot`）+ 登记 `shared-components.md`。
- **T24（装配）**：`runtime.ts`/`index.ts` 消费 shared、删副本。
- **T25（门禁引擎）**：`paths.ts` 路径原语改从 shared 导入、删 `toPosix` 副本。

**排序**：与 §10 的 T14/T15 **不冲突**（不同文件）；**待 T8b/桌面收工后与 §10 一并发**。**T23（建 shared）** 与 **T20 前半（session.ts 契约）** 是各消费方任务的前提：`T23 → {T22, T24, T25, T20 后半}`，`T20 前半 → T21`。

## 4. 顺序与依赖

三块**不是**同一条串行链，可部分并行：

```
块3a(pin/acceptance 基底)  ──►  块1(bootstrap/创建权)  ──►  块3b(调度记录使用约定，pm 承载)
块2(写入落盘)  ── 与上面并行（只依赖已冻结的 gate 契约）
块3c(V3)  ── 已定组合 (c)+(b)+(a)；T7(第一步) 可与主线并行，T8 接 T7
（二期）S1 派发执行  ── 不在 V1（见 §3.7）
```

- **前提**：**块3a 是块1 的前提**——没有「acceptance 链 + pin」这一基底，bootstrap 无处安放「客户接受了哪份边界」，块1 只能退回到「配置自称 accepted」的旧偏离。
- **块1 内部**：`ans init`（骨架）不依赖块2（init 用自己的代码写盘，不经 Pi 工具层）；`ans govern` 的**会话**要真写盘才可端到端演示，故块1 的**演示验收**依赖块2（见 §5.1）。
- **可并行**：块2 与块3a 归属不同角色、写集不重叠、接口已冻结，可同时开工。
- **块3b 依赖块1**（运行期记录场景）：先有 bootstrap 建出的项目（含 pm 的 `docs/scheduling/`）。**块3b 归属 pm**（调度权，见 §3.6）；编排只提供 `runRole`/`openRoleSession` 机制，不写调度记录。**T6 是使用约定、非产品代码任务**（§3.6）。
- **块3c 已定**：组合 (c)+(b)+(a)（§7.3）；T7（(c)+fail-closed+审计）可与主线并行，T8（(b)+(a)）接 T7。
- **不在 V1**：**调度执行路径**（pm 产计划 → 编排逐条开会话，任务 S1）**不纳入 V1**（见 §3.7）；故 V1 **不演示多任务派发**，只到「单角色受治理会话真落盘 + bootstrap/创建权 + `.ans` pin + shell 闸」为止。

## 5. 验收标准（可判定）

### 5.1 块2（写入落盘）

- **单元（Pi适配器自测 `test/pi-adapter/tools.test.ts` 扩写）**：
  - `write_file` + 允许路径 → **盘上文件存在且字节等于 content**（读回调断言）；`edit_file` + `old_string` 命中 → 回写后**内容等于预期**。
  - 拒绝路径 → **文件不存在**；对已存在文件 → **内容与 mtime 不变**。
  - `old_string` 不存在 → `ok:false` 且**文件不变**。
  - gate 抛错 → **无文件创建**（写前 fail-closed）。
  - 符号链接/junction 目标逃逸出 `writeRoot` → 拒绝且**链接目标未被触碰**。
  - **第二边界（§3.8）**：门禁对某 **skill 根**路径判 `allowed:true`（条件激活的边界）且该路径在 projectRoot **之外** → **写层拒绝、无文件产生**（证明「门禁放行、写层仍拒」）。
- **记录**：命令、代码版本、环境、输入、所用规则（技能 testing 要求）。

### 5.2 块1（bootstrap/创建权）

- **`ans init <空目录>` 实际创建**：跑完后 `listProject(<dir>)` 枚举出预期角色且**无 `parseError`**；`.ans/project.json` 可解析，且**每个边界文件的实际 SHA-256 与其 pin 一致**（校验脚本对每项打印 `MATCH`）。
- **拒绝覆盖**：对已含 `.ans/` 的目录再跑 `init` → **非 0 退出**、不覆盖既有文件（除非显式 `--force`，属产品决定，须客户确认）。
- **`ans govern` 建角色**：治理会话创建 `角色卡/X/` → `listProject` 能枚举到 X；**负例**：治理会话试图写到**项目治理边界之外**（如目标项目的 `src/`、或项目根以外）→ **写之前被拒**。
- **fail-closed 负例**：pin 定后**手改**某 `boundary.yaml` → SHA-256 不匹配 → acceptance 失效 → **一切写入被拒**（命令打印不匹配原因）。

### 5.3 块3

- **pin**：pin 与文件不符 → 拒一切写；**无** `.ans/project.json` → 回退内置（未接受）→ 拒一切写（现状保持）；**`.ans` 存在但 `accepted:true` 无 pin → 载入方置为未接受 → 拒一切写（终态规则 §3.3）**。
- **调度记录**：跑一个任务后 `docs/scheduling/<task-id>.md` 存在且含**机器段**；hash 链校验通过；**由指定唯一写入者写入**（非指定角色/直接手写无法过校验）。

### 5.4 V3（待客户裁定后才有验收项）

- 选「不给」：`run_shell`/`bash` **不在工具集**、探针显示 `bash` 被拒。
- 选「给（受治理）」：**允许的只读命令能执行**、**含写命令对越界目标在写前被拒**（探针用例）。
- 选「给（原样）」：**如实登记为「构造优于拦截」失效**，且不得对外宣称「越界写在发生前被拒」（见 §7）。

## 6. 风险

**首要风险来自块2——让写入真落盘后，门禁的 fail-closed 必须依然严密。以下环节因此变得关键：**

1. **TOCTOU（判定与写入之间的时间窗）**：gate 判定用的是「词法 + `realResolve`」，若写入时再经一次符号链接解析，可能写到判定之外的**新目标**。**必须在写入前紧邻处再解析一次真实父目录并复核仍在 `writeRoot` 内**；原子写（同目录 temp+rename）避免半写。
2. **写根 ≠ 读根**：`read_file` 有意不过写门禁、默认根是 `process.cwd()`；而**写根必须恒等于 `projectRoot`**。二者若被混用（写用读根），相对路径会写到错误基准。**单一 writeRoot**，且与 gate 解释相对路径的基准（项目根）**同源**。
3. **路径解析基准漂移**：`resolveWrite` 把相对路径按项目根解释；工具层若按 `cwd` 解析 → **判定路径与写入路径不一致**，可能出现「判的是 A、写的是 B」。**共享同一个根**（§3.1）。
4. **Windows 逃逸面**：junction/reparse point（`realResolve` 已用 `realpathSync.native`，保留）、大小写不敏感（已处理）、**尾点/尾空格规范化**、**保留设备名**（`CON/PRN/NUL/AUX/COM1…`）、**NTFS 备用数据流**（`file.txt::$DATA` / `file.txt:stream`）、**8.3 短名**、UNC。词法+realpath 未必看得见 `::$DATA`；**写层须拒绝含 `:` 的非法名并规范化尾点/空格**。
5. **零副作用的拒绝**：`allowed:false` 时必须**不建目录、不 touch、不 open**——`mkdir -p` 只能出现在 `allowed` 分支、且在 gate 之后。
6. **`edit_file` 语义**：读-改-写的**原子性**与**编码/EOL/BOM 保真**；大文件；并发（桌面多角色同写一文件）需明确串行或加锁策略。
7. **第二层拦截的边界**：`real-adapter.ts` 的 `GOVERNED_WRITE_TOOLS` 是**固定工具名集合**（`write/edit/write_file/edit_file`）。**任何不经这些名字的写路径都绕过它**——正是 V3 的命门（§7）。
8. **bootstrap 的创世例外**（§2.4）本身是风险点：`ans init` **故意**不做 resolveWrite 判定，故其「客户指令」证据必须**留痕可审**，否则会成为一个无守卫的写路径。

## 7. V3：给 shell，但执行前必须过 pm 审核（机制设计）

### 7.0 客户的裁定

V3 不再是「给/不给」的二选一。客户已裁定：**shell 应让 pm 审核才能运行**——即**给 shell，但任何执行前必须过 pm 审核，审核不放行就绝不执行**。本节据此**设计机制**（不再只是列选项）。

### 7.1 安全的实质：为什么这是一道真闸，不是装饰

写类拦截今天靠固定工具名集合 `GOVERNED_WRITE_TOOLS = {write, edit, write_file, edit_file}`（`src/common/pi-adapter/real-adapter.ts`）+ 扩展 `on("tool_call")` + **路径判据**（`resolveWrite`）。而 shell 里 `echo x > 路径` 的写入**根本不经过 `resolveWrite`**——它是一次工具调用**内部的副作用**，路径判据**看不到**它。所以 shell 需要一道**判据不同**的闸：不是「路径是否在边界内」，而是「**这条命令是否被允许执行**」。

这道闸之所以是**真的**，靠的是**结构性**保证，而非「看起来被审过了」或「一枚票据」：

1. **能力构造（唯一 shell 入口）**：我们**不启用** Pi 内置 bash（`noTools:"builtin"` 有意保留），**能跑 shell 的唯一路径就是我们自己注册的 `run_shell` 这个 `customTools` 项**——没有第二个入口。这正是把「构造优于拦截」用在 shell 上：**没有那道门，就不需要守门**；现在有门，就把它做成唯一的门。
2. **审允许门 = 唯一的 spawn 点（结构性保证）**：`run_shell` 的 `execute()` 是**唯一 spawn 子进程的地方**，且**只有审核链（c→b→a）返回 `allow` 才 spawn**；`deny` / 抛错 / 超时 / 未 arm → **在任何 `spawn` 之前返回**，子进程**从不启动**。**「审核」与「落盘（spawn）」同址于 execute**——保证来自**同址**，不靠任何跨层票据。
3. **扩展层不是「凭 token 放行的兜底」——原设计此处是错的，已修正**：~~扩展 `on("tool_call")` 对 `run_shell` 默认 block、仅当该次调用携带与 `toolCallId` 绑定的 allow-token 才放行~~。**经核实**（`pi-coding-agent/dist/core/agent-session.js` 的 `_beforeToolCall` ↔ `pi-agent-core/dist/agent-loop.js` 的 `beforeToolCall` 调用点）：**Pi 的 `on("tool_call")` 触发在工具执行之前**，**在 `execute` 里签发的 token 扩展层根本看不到**。故「审核放 execute、扩展凭 token 放行」只有两条结局：**要么默认 block 掉每一次正常 `run_shell`（保证成立、功能不可用）**；**要么用一枚「可重算」的 token 自欺**——T7c 的 `bindShellToken = sg1:<toolCallId>:<sha256(toolCallId\0command)>` 就是后者：它**由公开输入确定性推导**，扩展层「token 一致」只证明「调用方会算这个哈希」，**不证明审核发生过**（方案写在代码与文档里，模型照抄即可伪造）。
   **正确做法：审核整条放在唯一 spawn 点 `execute`（结构性成立）；扩展层退为「能力级粗闸」**——它**不再做每调用 token 校验**，只在**策略禁 shell / 未 arm** 时整只 block `run_shell`（见 §7.5）。**这条修正一并要求删除可重算的 token 机制**（见 §7.4 落点、T8）。

**残留缺口（必须如实说明）**：若审核的**唯一**来源是 (b) pm 模型的判读，那它**不是安全边界**——它是**政策审读**，可能被**提示注入**说服。故稳健组合必须含一道**确定性硬底线**（(c)）与一道**人兜底**（(a)），(b) 只在二者之间做增量判断（见 §7.3）。**仅靠 (b) 会给出「好像被审过」的假安全**，不推荐。

### 7.2 机制骨架（三层共用，固定）

无论客户最终选哪种审核主体，以下骨架不变，仿照现有 `WriteGate` 的**注入**模式（判定源与工具**解耦**）：

- **新闸类型（无 token）**：`ShellGate = (req: { command: string; argv: string[]; cwd: string; toolCallId: string }) => Promise<ShellReviewResult>`，其中 `ShellReviewResult = { allow: true; by: string } | { allow: false; reason: string; by: string }`——**不含 token**（票据机制已废，见 §7.1 第 3 条）。由**编排**装配、**注入** Pi适配器——Pi适配器**不含任何审核策略**，只调用它（与工具层「任何路径判定都不在这里进行」的既有纪律一致）。
- **工具（审核与 spawn 同址）**：`run_shell` 在 `src/provider/pi/tools.ts` 的 `buildGovernedTools` 内新增（与 `write_file`/`edit_file` 并列）。`handler` 顺序：取 `command` → 规范化为 `argv`（§7.10）→ **`await shellGate(req)`（审核链 c→b→a 在此发生）** → **仅 `allow:true` 才 `spawn(shell:false)`** → 收集 stdout/stderr/exit code。**不经过 `resolveWrite`**（见 §7.7）。**审核就在这个唯一 spawn 点；扩展层不参与每调用判定**（见 §7.1 第 3 条）。
- **执行环境收窄**：`cwd` 钉在 `projectRoot`；`env` **剥离凭据**（§7.9）；即便某条命令被误放行，爆炸半径也被二者限制。

### 7.3 「pm 审核」的形态：已定——组合 (c) 硬地板 + (b) 增量 + (a) 兜底

| 选项 | 机制 | 优点 | 失效模式 / 代价 |
| --- | --- | --- | --- |
| **(a) 操作者确认** | shell 调用被**挂起**；人在界面/终端看到**命令原文**后点放行/拒绝 | **真正的安全边界（人）**；不受提示注入 | 打断操作者；批量时烦；**误点放行**；无人值守时不可用 → 只能拒绝 |
| **(b) pm 角色模型审读** | 把命令交 pm 角色的**模型**判读，返回放行/拒绝 | 自动、可规模化；能理解语义 | **不是安全边界**：命令文本/文件内容可含**提示注入**说服它放行；同族模型；判定不稳定、不可复现；**覆盖不到**它没想到的破坏方式 |
| **(c) 确定性规则/白名单** | 命令按规则匹配：只读命令白名单自动放行；危险模式（重定向 `>`、`sed -i`、`git` 写子命令、`rm`、管道到 shell、`$(...)`、反引号、`eval`、`node -e`、`npm run`…）硬拒 | 确定、可测、可审计；**硬底线**不受注入影响 | **覆盖不全**：`npm run`/`make` 目标/`node -e` 可**间接执行任意程序**；shell 语法（别名、`$()`、here-doc、env 展开、多命令）**极难穷尽**；过宽则漏、过窄则天天误杀 |
| **(d) 组合**（推荐） | (c) 作**硬地板** → 未命中白名单且非硬拒者交 (b) 增量判读 → (b) 不确定/不可用 → (a) 人兜底（不可用即拒） | 确定性拦住已知危险；(b) 处理规则未覆盖的常规命令；(a) 兜底高风险；每层都有 fail-closed 出口 | 实现与维护成本最高（规则引擎 + 接 pm 会话 + 接操作者通道 + 审计） |

**客户已定（2026-10-11）——采用 (d) 组合。** 三层职责与**先后**写死如下（判定顺序即交互顺序）：

1. **(c) 确定性规则/白名单 —— 第一闸，硬地板，绝对否决。** 命令先过 `classifyShell(argv)`：
   - 命中**白名单**（如只读命令）→ **直接放行**，不再经 (b)/(a)；
   - 命中**硬拒**（重定向 `>`、`sed -i`、`rm`、管道到 shell、`$()`、反引号、`eval`、`node -e`、`npm run` 等危险模式）→ **直接拒绝，终结**；
   - 两者都不命中（记 `review`）→ 交下一闸。
2. **(b) pm 角色模型审读 —— 第二闸，增量。** 把**命令原文**交 pm 角色的模型判读：
   - 判「放行」→ 放行（**仅限 (c) 划定的可讨论区间**——(c) 的硬拒永不可达此处）；
   - 判「拒绝」→ 拒绝，终结；
   - **拿不准 / 无 pm 会话 / 超时 / 报错** → 交 (a)。
3. **(a) 操作者确认 —— 第三闸，兜底。** 仅当 (b) 拿不准或不可用时，才**挂起并叫人**看原文点放行/拒绝；无人值守 → 拒绝。

**回答两个关键问题**：

- **(c) 否决能否被 (b)/(a) 翻案？不能。** 硬地板就是**绝对否决**：一旦 (c) 判「硬拒」，**进程立即终结，不进入 (b)/(a)**。(b)/(a) 只作用于 (c) 判为「review（两者都不命中）」的命令——即 (c) **只在它未明令禁止的区间里**给 (b)/(a) 留判断余地。理由：若允许 (b)/(a) 推翻 (c)，等于把人/模型置于确定性规则之上，规则集就白写了，也正落进提示注入诱导的口子——**确定性规则必须握有最终否决权**。
- **(b) 与 (a) 谁先？(a) 是「(b) 拿不准时才叫人」，不是「每条都要人点」。** 自动优先（(b) 先）、人兜底（(a) 后）：(b) 明确放行/拒绝即终结；只有 (b) **不确定或不可用**时才升级到 (a)。这样高频的普通命令不打断操作者，只有 (b) 没把握的才叫人。

**(a)/(b)/(c) 各自的失效模式**（选择 (d) 的代价，如实记录）：(a) 打扰操作者、误点放行、无人值守只能拒；(b) **非安全边界**、可被提示注入说服、不可复现；(c) 覆盖不全（`npm run`/`make`/`node -e` 间接执行、shell 语法难穷尽）。三者叠合正是为了互补：唯一不依赖模型的一层 (c) 握绝对否决，人的 (a) 兜住 (b) 被攻破的情形。

**前提修正（`argv` / `shell:false`，2026-10-11）**：Pi适配器把 `command` 拆成 `argv` 且 `spawn(..., {shell:false})`——**命令不经 shell 解释**。因此 (c) 规则集里「重定向 `>`、管道到 shell、`$()`、反引号」这类**shell 元字符模式在本执行模型下永不出现**，作为硬拒项是**空转的**（会给假安全感）。**规则集须按「程序 + `argv`」重述**（见 §7.10）：按 `argv[0]`（哪个程序）与其参数（危险 flag、写目标）分类，而非按 shell 语法。**此规则集与 `shell:false` 强耦合**——一旦改用原始 shell 字符串或 `shell:true`，元字符规则必须恢复。

### 7.4 落点（实现归属）

- **`run_shell` 工具本身**：**Pi适配器**——`src/provider/pi/tools.ts`（`buildGovernedTools` 内新增）+ 接线 `src/common/pi-adapter/real-adapter.ts`（`customTools` + 扩展 handler）。**必须是我们的 `customTools` 项，绝不打开内置 bash**。
- **规则引擎 (c)**：**门禁引擎**——判定核心归它（`src/service/gate/` 或 `src/common/门禁引擎/`，纯函数 `classifyShell(argv, rules) => "allow" | "deny" | "review"`）。
- **审核装配 (b)+(a) 决策**：**编排**——`ShellGate` 在 Pipeline 构造：(b) 经 `openRoleSession(项目管理, …)` 问 pm 角色；(a) 经注入的**操作者通道**（CLI 打印 + 读 stdin / 桌面弹层）取放行；按 §7.3 顺序串联后注入 Pi适配器。
- **操作者通道 (a)**：**Interface**——`src/interface/cli/` 的交互提示；桌面端 `app/` 的对话框。经 `deps` 注入编排。
- **审计记录落盘**：**项目管理（pm）**——pm 的 Section 1 含 `docs/audit/`（`conditional-directory`，condition **`shell-gate`**）；记录**以 pm 授权**写入（见 §7.6）。
- **删除可重算 token**：`src/common/编排/shell-gate.ts` 的 `bindShellToken`（确定性 `sha256(toolCallId\0command)`）**在新设计下必须删除**——它证明不了「审核发生过」（§7.1 第 3 条）。`shell-gate.ts` 保留「审核链 c→b→a + 审计」职责，但**不再产出 token**；并**去掉 `ShellReviewResult` 的 `token` 字段**（`src/provider/pi/session.ts`，Pi适配器）。归 **T8**。

### 7.5 fail-closed：三条退路 + 结构性保证

**三条退路**（每层不可用时都必须落到「不执行」，且**只往更严的层退**）：

| 层 | 不可用情形 | 退路 |
| --- | --- | --- |
| **(c) 规则集** | 规则/白名单**加载失败**、解析报错、版本未知 | **整条命令拒绝**——`review` 都拿不到 → 视为**硬拒**；**绝不**「规则没了就当没有、一律放行」。等价于「规则集不存在 ⇒ 命令级闸不存在 ⇒ `run_shell` 不注册 / 一律拒」。 |
| **(b) pm 会话** | **无 pm 会话**、pm **超时**、pm **报错**、判定 JSON 不合法 | **不视为放行**，**升级到 (a)**；若 (a) 也不可用 → **拒绝**。 |
| **(a) 操作者** | **无人值守**、通道不可用、确认超时 | **拒绝**。 |

**结构性保证**（保证上面三条退路真的生效）：

1. **缺审核者 → 工具根本不存在**：未注入 `ShellGate` 时，`buildGovernedTools` **不注册 `run_shell`**——能力缺席是最强 fail-closed。
2. **默认拒绝**：`execute()` 只在 `shellGate` 返回**恰好 `allow:true`** 才 `spawn`；返回 `deny` / `undefined` / **抛错** / **超时** → **不 spawn**，回 `ok:false` + 原因。审核函数用**超时包装**（仿 `timeout.ts`），**超时 = 拒绝**。
3. **失败不降级**：任一环失败**不退回**「无审核直接跑」，也**不退回**「只靠 (c)」——唯一下降方向是**往更严的层退**（c→拒；b→a；a→拒）。
4. **扩展层 = 能力级粗闸（不是每调用票据）**：`on("tool_call")` 对 `run_shell` 只做**同步粗判**——**策略禁 shell / 未 arm `ShellGate`** 时整只 `{block:true}`；**arm 了即放行、交 execute 细审**。它**不做**每调用 token 校验（票据已废，§7.1 第 3 条）。**如实说明**：因「唯一 shell 入口 = 我们的自定义工具」，扩展层对 `run_shell` **不再是独立的第二道审**——它的独立价值仅剩「能力级 kill-switch」，**真正的每调用保证在 execute**（与第 1、2 条同源）。

**「未走完审核链就绝不执行」具体靠什么成立（直接回答）**：靠**同址的两条结构性 fail-closed**，**不靠任何票据，也不靠「默认 block」**：

- **① 未 arm → 工具不存在**：没有 `ShellGate` 时 `buildGovernedTools` **不注册 `run_shell`**（能力缺席）；
- **② 唯一 spawn 点在审核之后**：`run_shell.execute` 是**唯一** `spawn` 处，且**只在审核链返回 `allow` 之后** spawn；链上任一步 `deny` / 报错 / 超时 / 不可用 → **不 spawn**（只往更严的层退）。

两条**都不阻断正常调用**（arm 且审核通过即执行）——即**既保证、又可用**，无需「默认 block 掉一切」。

### 7.6 留痕（放行/拒绝都要记）

每条 shell 审核记录含：**谁审的**（a 的操作者标识 / b 的 pm 会话+模型判读 / c 命中的规则 id）、**审的什么原文**（command 逐字 + 规范化 argv + cwd）、**结论**（allow / deny / 超时 / 报错）、**触发分支**（命中 c 白名单 / c 硬拒 / b / a）、**时间戳**、**执行结果**（exit code 或「未执行」）。**追加式**日志。

**归属与写入条件**：审计记录归**项目管理（pm）**——pm 的 Section 1 已含 `docs/audit/`（`conditional-directory`，condition **`shell-gate`**），记录追加为 `docs/audit/shell-gate.jsonl`（沿用「目录归 pm、内容由指定写入者写」的既有模式，如 `docs/scheduling/` 归 pm、内容由 `task_ops` 写）。**（已由 Governance 完成授权、客户批准，见 `docs/change/2026-10-11_change_governance-section1-grants.md`。）**

**硬要求**：shell 闸在写审计记录时，**必须在 `TaskScope.conditions` 里声明 `shell-gate`**；否则门禁以「命中条件目录但缺少条件」**在写入前拒绝**（Gov 已自证：同样路径、conditions 不含 `shell-gate` → `allowed:false`）。这不是形式要求，漏了会真被拒。

### 7.7 与 `GOVERNED_WRITE_TOOLS` 的关系：**不要把 `run_shell` 加进去**

分析：若把 `run_shell` 加进写类集合，扩展 handler 会调 `gate(extractCallPath(input))`；而 `run_shell` 的 input 是 `{command}`，**没有 `path`** → `extractCallPath` 返回 `undefined` → 现有逻辑**直接放行**（`real-adapter.ts` 第 252–253 行：`if (path === undefined) return undefined`）。**加了等于没加**。更糟：若为了「有 path」而从命令字符串里**解析**一个路径喂给 `resolveWrite`，那是把**启发式解析器**当安全判据——shell 语法（重定向、管道、`$(...)`、多命令）**无法可靠**反推真实写入目标，**漏解析 → 误放行；误解析 → 误拦**。

**结论**：`run_shell` **不加**入 `GOVERNED_WRITE_TOOLS`；它走**自己的命令级闸**（`ShellGate`），判据是「命令是否被允许」而非「路径是否在边界内」。理由：**路径判据描述的是一次已知目标文件的写；shell 命令的效果是命令级的、可能多目标、可能运行时才决定**——判据不同，混用只会制造「路径看着没问题」的假安全。`run_shell` 的扩展 handler **不做每调用 token 校验，也不喂 `resolveWrite`**——它只做**能力级 kill-switch**（§7.5 第 4 条）；**不用任何「可重算」的 token**（§7.1 第 3 条）。

### 7.8 落地建议

- **已定 (d) 组合**：按 §7.3 的**先后**实现三层（c → b → a）。
- **V1 分两步**：**第一步**先实现 **(c) 硬地板 + fail-closed 三条退路 + 审计**（确定性、可测、**不依赖模型**即可完成「放行/拒绝/拒绝」的完整判定）；这一步完成即满足「审核不放行就绝不执行」的骨架。**第二步（T8）**接上 **(b) pm 审读**与 **(a) 操作者通道**，并**同批删除可重算 token**（`bindShellToken` + `ShellReviewResult.token`，见 §7.4）。

### 7.9 执行环境：`env` 凭据剥离（裁决）

**问题**：`run_shell` 的子进程默认**继承 `process.env`**，其中含凭据——`PI_CREDENTIAL_ENV_VARS = [ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY, GEMINI_API_KEY, PI_API_KEY]`（`src/common/装配/runtime.ts`）。

**裁决**：**spawn 时必须剥离凭据变量**——构造**过滤后的 `env`**，**至少排除上述 `PI_CREDENTIAL_ENV_VARS`**；**目标态**为**收窄的白名单 `env`**（只透传构建/测试所需的最小子集）。

**归属**：属**执行环境收窄**（`run_shell` 的 spawn 点，Pi适配器），**不归审核层**——审核决定「**是否**允许运行」，`env` 决定「**以什么环境**运行」，二者**正交**。

**验收**：一条命令（如 `node -e "console.log(process.env.ANTHROPIC_AUTH_TOKEN)"`）执行后，其输出**不含**任一 `PI_CREDENTIAL_ENV_VARS` 的值（证明剥离生效）。

### 7.10 命令解释模型：`argv` + `shell:false` 对 (c) 规则集的前提

如 §7.3「前提修正」所述，本执行模型**不经 shell**（`command` 拆 `argv`、`spawn(shell:false)`）。故：

- **(c) 规则集按「程序 + `argv`」分类**：`argv[0]` 白/黑名单（`ls` / `git status`… vs `rm` / `mv` / `dd` / `tee` / `sed -i`…）、危险 flag、写目标参数。**不按 shell 元字符**（那些在此模型下不会出现）。
- **不因「无 shell」而安全**：程序自身仍可写（`tee` / `dd of=` / `cp` / `node -e "fs.…"` / `git checkout`）——规则集必须覆盖**程序语义**，不能只看「有没有重定向」。
- **`argv` 拆分须明确**：建议 `run_shell` 入参用**显式 `argv: string[]`**（而非模糊的 `command` 字符串 + 空格拆分），避免引号/空格歧义；若坚持 `command` 字符串，须在工具描述里写死拆分规则。
- **耦合记录**：此前提**绑定 `shell:false`**；若未来改回原始 shell 字符串或 `shell:true`，**元字符规则必须恢复**（否则会漏掉 `>` / `|` / `$()`）。

## 8. 已定项（客户 / 协调方 2026-10-11）

以下曾是待裁定项，现已定，作为实施前提：

1. **创建权：按 su 创建（已定）。** V1 由内置治理角色 su 创建角色，**不改 SKILL.md、不登记偏离**；**「pm 创建角色」不作为 V1 能力，不实现**（仅留「未正名的偏离，待改技能仓库时正名」，见 §2.3）。
2. **V3 审核主体：组合 (c)+(b)+(a)（已定）。** (c) 硬地板绝对否决 + (b) pm 模型增量 + (a) 操作者兜底；先后与交互见 §7.3，三条 fail-closed 退路见 §7.5。
3. **`ans init --force`：默认拒绝覆盖已存在目录（已定）**，与项目整体 fail-closed 取向一致；只有显式 `--force` 才允许覆盖。`init` 在遇到已含 `.ans/` 或已含 `角色卡/` 的目录时**非 0 退出**。
4. **调度权归 pm（已定）**：pm 决定**派发给谁 / 顺序 / scope** 并**承载**调度记录（经 `task_ops` 唯一写入者落盘）；**编排只提供 `runRole`/`openRoleSession` 机制、不写 `docs/scheduling/`**。机制与权力之分、职责边界见 §3.6；`docs/scheduling/` 已在 pm 边界内，**无需新授权**。**（注：调度「执行」路径不在 V1，见 §3.7；V1 不做派发引擎、不演示多任务派发。）**
5. **`.ans/` 纳入 ans-cli 本项目自身（已定）**。ans-cli 现在是真实的受治理项目，自己也应有一份 `.ans/project.json`。**给 `.ans/` Section 1 条目的形式**：由 **Governance（su）更新 `角色卡/装配/boundary.yaml`，加一条 `conditional-directory: .ans/`（`condition: project-init`，root project）并经客户确认**；随后**装配**写入 `.ans/project.json`（详见 §2.5）。**（G-1a/G-1b 两项授权已于 2026-10-11 由 Governance 完成、客户批准；`docs/audit/` 的 condition = `shell-gate`。见 `docs/change/2026-10-11_change_governance-section1-grants.md`。）**
6. **桌面 shell 闸：V1 不 arm（客户已确认，2026-10-11）**。桌面应用 T8b 时**刻意不接线**（`DESKTOP_SHELL_GATE_ARMED=false`；`main.ts` 接了**表现层**但**不构造、不注入**对话框通道），并如实交回 arm/不 arm 的判断。客户拍定 **不 arm**。**含义**：V1 桌面**不提供 shell 能力**——角色在被导入的项目里**不能跑命令**；**对话框通道代码保留但未被消费**（如实标注，别让它看起来像在用）。**这是客户确认的 V1 范围，不是欠账**，**无需实现改动**（桌面那份实现本就按不 arm 落）。CLI 侧与此无关、按各自现状。**`ans govern`/规则引擎 (c)**（§7）在**有 arm 的入口**（如未来 CLI 或二期桌面）才生效，桌面 V1 不接。**（2026-10-11 更新：那条 (a) presenter 代码现由 finalize 的客户确认消费——见 §13.1/§13.4；故它不再「未被消费」。）**

## 9. 本方案未做 / 未验证（如实标注）

- **未实现任何代码**；本文件仅为设计。
- **未实测**：块2 落盘后的 fail-closed 在真实 Pi 会话中的端到端行为。**真实模型轮次可以做得到，只是属操作约束**：按项目当前约定，跑带凭据的命令须**由客户本人运行**（本环境拦截含凭据的 shell、不代跑），故 V1 内不列为可自动验收项。另有前置——`ANS_PI_CONTEXT_WINDOW` 现为**必填**（Pi适配器 fail-closed 策略），客户 `.env` 尚未设它，真实轮次前需客户补上。
- **未定**：`.ans/project.json` 的精确 JSON schema、pin 的具体字段名（本方案只给约束，交门禁引擎在实现时定）。
- **未实现（V3 机制）**：`run_shell` 工具、`ShellGate`、规则引擎 (c)、pm 审读 (b)、操作者通道 (a)、审计写入器**均未落地**；§7 仅为设计（机制已定，见 §8）。
- **无遗留裁定项**：原待裁定五项均已定，见 §8。

## 10. bootstrap 形态重定：su 对话式（客户 2026-10-11；**推翻 §3.2 与 §2.4 的固定模板 init**）

> **本节推翻 §3.2「`ans init` 骨架生成」**（`ans init` 作废）**，并修正 §2.4 的创世结论**。客户决定（两条 bootstrap + 两条定位）：
> 1. **su 对话式 bootstrap 放桌面**：导入**空文件夹**（或无角色目录的文件夹）时**不报错、直接显示 su**；用户与它对话，它据此把角色建出来，左树随之长出来。
> 2. **`ans init` 废掉**——建项目只保留 **su 对话**这一条路。
> 3. **su 是默认入口与主路径**；**其他角色保留可聊但降为次级**（查看/调试用）——**是收窄，不是推翻**「每角色可聊」。
> 4. **角色完成后把结果交回 su**（由 su 汇总向客户汇报）——见 §10.8。
>
> 客户原话「这个 su 应该也能对话吧，不然怎么知道创建哪些角色呢，面对一个空文件夹」戳中的是：原设计**先摊固定 7 角色模板、再 `ans govern` 调整**——**「该建哪些角色」从头到尾没有 su 参与**，而这是 SKILL.md 里 Governance 的职责、也是客户最初链路（客户只与 su 对话 → su 启动 pm → pm 创建角色）。**我们做反了**；本节把它**正过来**：**由 su 对话决定建什么**，模板退为 su 可用的建议。

### 10.1 硬问题一（核心）：空项目上 su 的写权限从哪来，且**不是 blanket**

**现状为何写不了**：su 会话的 gate 对**项目治理边界**（`governanceBoundary.path`）求值；该边界原是 `ans init` 的种子。`ans init` 一废，空项目上 `gov.path` 为空 → 回退**内置治理边界**（`root: skill` 且 acceptance 未接受）→ **su 一个字都写不了**（`boundary-core.ts` 优先级链末端）。

**裁决：采用「有界的创世例外」，由两件东西共同构成，均不越 SKILL.md 红线。**

1. **工具提供的「项目治理种子边界」**（不落进项目，只作 gate 的求值对象）：把内置治理边界里那几条**条件目录**按 **project 根**求值——
   `角色卡/`（`condition: role-restructuring`）、`docs/`（`condition: docs-bootstrap`）、`.ans/`（`condition: project-init`）。
   （T4 已在 `bootstrap.ts` 里做出 `buildGovernanceSeedBoundaryForGate` / `governanceBoundaryEntries` 这一内容，**改造复用**，见 §10.4。）
2. **「操作者发起的 bootstrap」作为 acceptance**：桌面**导入空文件夹并开启 su 对话**这一动作，就是操作者的 bootstrap 指令——它提供 acceptance（`source` 如实记录，如 `desktop:导入空项目=发起 bootstrap（操作者指令）`），**并逐路径留痕**（`docs/bootstrap-manifest.md`，见 §10.4）。

**为什么这不是 blanket 授权（逐条）**：

- **写集有界**：只允许 su 创建**治理产物**——`角色卡/<role>/…`、`docs/…`、`.ans/project.json`、以及**项目治理边界文档本身**。**不含** `src/`、不含项目内任意文件。这与内置边界已声明的条件目录**逐条对应**，不是「随便写」。**不覆盖任意文件。**
- **条件有界**：F5 条件目录**仅在任务显式声明对应 slug**（`role-restructuring`/`docs-bootstrap`/`project-init`）时才激活——不声明即被门禁在写前拒。
- **自终止**：**一旦项目自己的治理边界文档写出并经 pin 接受**，`resolveBoundarySection` 的**项目覆盖**分支生效，su 后续写入改由**项目边界**治理，**创世授权不再适用**。
- **可审计**：每个创建路径进 manifest。

> 四者叠加 ⇒ 它授权的是「**一次性、有界、条件化地创建治理骨架**」，**不是**「su 可以往这个项目里任意写」。

**「导入即授权」到底授权了哪两件事（分清）**：

- **对已有角色的项目**：导入 = 授权**每个角色按其自身边界**工作（per-role-boundary，**非 blanket**）——既有桌面模型。
- **对空项目**：导入并开启 su = 上述**有界创世授权**（仅治理产物）。

两者都**不是**空白支票；共同上界仍是「**Section 1 / 治理产物集**」。**归门禁引擎（T15）**。

### 10.2 硬问题二：`listProject` 对无角色目录的文件夹不再抛错（门禁引擎）

现状 `src/service/role/resolve-role.ts:114-116`：无 `角色卡/` 即抛「项目根下未找到角色目录」→ 桌面导入空文件夹只显示「导入失败」，**连 su 都看不到**。

**改**：无角色目录时**不抛错**——返回 `{ roles: [内置 su], warnings: ["项目根下无角色目录；仅内置治理角色 su 可用（可发起 bootstrap）"], hasRoles: false }`。（项目根不存在/不是目录**仍抛错**——那是真错误。）**归门禁引擎（T14）**。

### 10.3 硬问题三：桌面「未 bootstrap」一等状态与左树刷新（桌面应用）

- **状态**：导入空文件夹 → 左树显示 **su**（据 §10.2）+ 一条「**项目尚未 bootstrap：与 su 对话，让它创建角色**」提示（据 `hasRoles===false` 派生）。
- **刷新时机**：现渲染侧是**一次枚举、静态列表**（`renderer.js::loadProject` 只调一次 `listProject`，`state.roles` 不再更新）。改为**可刷新**：su 会话每轮 **settle** 时，主进程发 `project:changed`（或渲染侧重调 `project:list`）；可选对项目根 `角色卡/` 做 `fs.watch`。渲染侧重取列表后，**左树随之长出来**。
- **归桌面应用（T17）**。

### 10.4 硬问题四：既有产物的去向（如实处理，别装作没发生）

- **`ans init` 命令面**（`src/interface/cli/init.ts`）：**删除**（客户决定废掉）。
- **`src/common/编排/bootstrap.ts`**（`serializeBoundaryYaml`/`serializeMemo`/`serializeRoleCard`/`sha256Hex`/`buildProjectJson`/`buildGovernanceSeedBoundaryForGate`/`SCAFFOLD_ROLES`…）：**改造复用，不删**。理由：它已把「**遍历建目录 + 算 SHA-256 pin + 逐路径留痕 + 序列化边界 YAML**」这套**已验证**的能力做出来了——这正是新形态下 **su 的治理写路径**要用的：su 建角色时写 role-card/boundary/memo、算 pin、登记 manifest，**都复用这些纯函数**。**决定：保留为库（可改名 `governance-writes.ts`），从 su 的写路径调用**；命令行壳（`init.ts`）删除。**归编排（T16）**。
- **「创世留痕」**（`docs/bootstrap-manifest.md` + 逐路径创建清单）：**思路保留**，**触发点从「一条命令」改为「su 会话」**——由 su 的写路径在每次创建治理产物时追加。**落在**：项目内 `docs/bootstrap-manifest.md`（su 建，属治理产物；与 `角色卡/`/`docs/` 同属 su 的冷启动写集）。
- **`test/编排/init.test.ts`**：随 `ans init` 作废——**编排删除/重写**（T16）。
- **`test/测试/real-entry.test.ts` 的 init 断言**：属**测试角色边界**，**回报不改**——列为 T18（测试作废该断言 + 补 su-bootstrap 集成）。
- **T4 任务本身**：**命令面作废、库面改造复用**（见派发清单标注）。

### 10.5 硬问题五：`ans govern`（CLI）的去留——**保留，且与桌面 su 同一个引擎**

客户只废 `ans init`，**未动 `ans govern`**。裁决：**保留 `ans govern`**，并明确它与桌面 su 聊天**是同一个治理会话机制的两个前端**：

- **一个引擎**：Pipeline 的**治理会话入口**（现为 `runGovernSession`；桌面 su 经 `openRoleSession`）。两者**收敛到同一个 Pipeline 入口**，CLI 与桌面都调它——**杜绝两份实现**（本项目硬规矩）。
- **两个前端**：CLI `ans govern`（终端）；桌面 su 聊天（UI）。
- 二者的 gate 与写集**同源**（§10.1 的冷启动授权 / 项目边界）。**归编排（T16）**。

### 10.6 硬问题六：排序（本轮**只出方案**）

**现在有两个实现任务在跑**：T8b 编排（shell 三层链）与桌面应用（操作者确认对话框）。本次设计**与它们重叠**（`init.ts`/`bootstrap.ts` 归编排；`app/` 归桌面应用）。故：

- **本轮只出方案与派发清单，不实现**。
- **新任务（T14–T18）的开工顺序**：**待 T8b 与桌面对话框收工后再排**（避免撞车），它们分别动 `src/common/编排/` 与 `app/`。

### 10.7 su 为主路径、其他角色次级（界面 / IPC）

客户澄清：**不是推翻「每角色可聊」，而是收窄——保留可聊，但默认收窄到 su**。落地：

- **左树**：**su 置顶、作主入口/推荐**；**导入后默认选中并高亮 su**（现渲染侧 `state.selectedRoleId = null`、不自动选中 → 改）。其他角色**保留、可点、可聊**，但**定位降为次级**（如分组「**主入口 · su**」/「**其他角色（查看/调试）**」，或给次级角色一个弱化标注）。
- **主 CTA**：空聊天区给一个**「开始与 su 对话」的主按钮**（su 为默认主路径），不必自动开会话（避免每次导入都起会话），但**一眼可见 su 是入口**。
- **IPC**：`listProject` 结果加 **`primaryRoleId`**（= 内置 su 的 id，由**门禁引擎**枚举给出，**渲染侧不硬编码 `"su"`**——与本项目「不硬编码角色 id」的既有纪律一致）。渲染侧据此把 su 设为主位/默认选中。
- **归桌面应用（并入 T17）**；`primaryRoleId` 由门禁引擎随 `listProject` 提供（并入 **T14**，与「空目录也返回 su」同处）。

### 10.8 角色完成后把结果交回 su（回交，如实设计）

客户原话**「其他的角色完成了要返回给 su」**。设计：

- **形态**：角色会话**完成一个任务**时，产出一份**结构化回交** `TaskHandback`：
  `{ roleId, taskId?, status: "completed" | "blocked", summary, evidence: string[], at }`
  ——**交回 su**（治理会话），由 **su 汇总向客户汇报**。
- **与 SKILL.md 一致**：跨角色**转移的是「任务与证据」，不是「身份或写权」**。故回交**只搬证据**（产物路径 / 变更 / 测试结论），**角色不因回交获得 su 的权限，su 也不因此获得角色的写权**。
- **触发与路由**：角色会话 **settle**（或显式「完成」）→ 编排发一个 `handback` 事件。
  - **V1 可做**：**事件 + 界面呈现**——在该角色聊天里显示一张**「回交 su」卡片**；**若 su 会话开着**，把该回交**镜像进 su 的聊天流**（「来自 \<role> 的报告」）。
  - **自动多角色派发-回收**（su 派给多个角色、逐一收回、汇总）= 依赖 **S1（派发执行，二期）**。
- **落点**：`TaskHandback` 类型与「settle → handback 事件」归**编排（并入 T16）**；卡片渲染与镜像进 su 归**桌面应用（并入 T17）**。

### 10.9 对既有章节/任务的推翻与更新（汇总）

- **推翻**：§3.2（`ans init` 骨架生成）；§2.4 的「创世证据 = `ans init` 指令」→ 改为**操作者发起的 su bootstrap**；§5.2 的 `init` 相关验收作废。
- **任务**：**T4 命令面作废、库面改造复用**（并入 T16）；**新增** **T14（门禁引擎：`listProject` 空目录不抛错 + 提供 `primaryRoleId`）**、**T15（门禁引擎：冷启动治理边界求值）**、**T16（编排：su 写路径 + 废 init + 统一治理会话入口 + `TaskHandback` 事件）**、**T17（桌面：未-bootstrap 状态 + 左树刷新 + su 主位 + 回交呈现/镜像）**、**T18（测试：作废 init 断言 + su-bootstrap 集成）**。
- **T9（独立总验收）** 范围更新：**T4 不在范围内**；新增覆盖 **su 对话 bootstrap 线（T14–T17）**。其他角色「次级但可聊」及**回交**亦在验收内。

## 11. 桌面 Pi 配置界面 → 保存到 `.env`（跨角色；客户 2026-10-11）

> 客户：Pi 配置应能在**页面**里设置，并**保存到 `.env`**。
> **前提（比需求本身更重要，必须先讲）**：**桌面的 pi 路径今天根本不可达**，两个原因叠加——(1) `package.json` 的 `"app": "electron app/main.ts"` **无 `--env-file`**，故 Electron 进程的 `process.env` 里**没有** `ANS_PI_*` 与 token；(2) 桌面**没有通道**把 Pi 配置交给适配器。⇒ **本需求不只是「好用」，它是让桌面 pi 路径可用的前提。**

### 11.1 红线改写（归 Pi适配器；本文不改该文件）

`src/common/pi-adapter/provider-config.ts` 头部原红线：「**绝不把凭据写入任何文件**」。**客户已确认改写为**：

> **凭据可写入指定的本地配置 `.env`（已 gitignore、不入库）；但绝不可写入任何入库文件，也绝不可被打印/回显到日志或界面之外。**

原措辞**记为「已被本决定取代」**（保留原文 + 就地标注取代）。**该文件归 Pi适配器（T27）；我不改它。**

### 11.2 配置的来源与落点

- **哪个 `.env`**：**仓库根 `.env`**（装配 Section 1 已列、`.gitignore` 忽略）——与 CLI 的 `--env-file=.env` **同一文件**。
- **界面纳入的键**：**机密** `ANTHROPIC_AUTH_TOKEN`（掩码）；**非机密** `ANS_PI_BASE_URL` / `ANS_PI_MODEL` / `ANS_PI_PROVIDER` / `ANS_PI_CONTEXT_WINDOW`（客户起点正是 `ANS_PI_CONTEXT_WINDOW` 要手查手填）。可选 `ANS_PI_ALLOW_REAL` / `ANS_RUNTIME`。
- **落点正当形式（"目录归 X、内容由指定写入者写"）**：`.env` **仍归装配**（Section 1 不动）；**指定写入者 = 共享模块 `src/common/shared/env-file.ts`（pm 属主）**，由**桌面**在运行时调用——与 `docs/scheduling/`（pm 的目录、`task_ops` 写）**同形**。因写入逻辑落 `src/common/shared/`（pm 边界）且 `.env` 归属不变，**无需 Section 1 授权**；但**须 Governance 记录**该指定写入者安排 → **G-2（Governance 记录动作，须客户确认）**。

### 11.3 配置怎么到达适配器（裁定：**不扩签名**）

- **裁定：不改 `createPiAdapterFactory` 签名。** 改为**桌面在启动时，经共享 `env-file` 模块把 `.env` 载入 `process.env`**（补上缺失的 `--env-file`）。此后 `createPiRuntimeAdapter` 内的 **`resolvePiProviderConfig(opts, process.env)` 原样复用**——它**优先 `opts`、否则读 `ANS_PI_*`**，并做**凭据存在性检查**。**单一来源，无第二份读取逻辑。**
- **为何不扩签名（也是为何不"由桌面构造注入 opts"）**：凭据（token）**无论如何都要进 `process.env`**（`pi-ai` 的 anthropic auth 运行时读 `ANTHROPIC_AUTH_TOKEN`，见 `real-adapter.ts` 注释）——既然环境里得有它，**非机密项一并走 env 最统一**（否则两条来源、易漂移）。**故 `createPiAdapterFactory` / `resolvePiProviderConfig` 都不动**；变的只是「桌面把 `.env` 载进 env」。
- **保存后**：`savePiConfig` 写 `.env` 成功后**重新 `loadEnvFileInto(process.env)`**，使**下一会话**用新值。

### 11.4 写入纪律（客户红线的落地）

- **只改相关键**：`savePiConfig(envPath, partial)` **逐行**解析，只**替换匹配键的值**（缺失则追加）；**保留注释、空行、未知键**——**绝不重写整份**。
- **token 不回显**：读/写/错误信息**一律不含 token 值**；界面**默认掩码**（可选「显示」需显式操作）；日志/异常**只记键名，不记值**。
- **原子写**：同目录 **temp + `rename`**，避免半写坏 `.env`。
- **失败显式**：权限/磁盘错误**明确报错**（IPC 返错给界面），**不静默**。
- **落点**：`src/common/shared/env-file.ts`（纯逻辑）+ 桌面 UI 呈现（`app/`）。

### 11.5 与既有 runtime 选择器的关系

- 桌面已有 `runtime`（demo/pi）选择器。**新面板 = `pi` 运行时的配置**，归**桌面应用**（Interface）——放在 runtime 选择器**旁边/之下**（「Pi 设置」），或点 `pi` 时展开。语义分工：**选择器**决定「用哪个 runtime」；**面板**提供「`pi` runtime 的配置」。**选 `pi` 而未配置 → 明确报错（既有 fail-closed）**，面板即补救入口。

**任务**：**G-2（Governance 记录动作）** + **T26（pm：建 shared `env-file`）** + **T27（Pi适配器：红线改写）** + **T28（桌面：面板 + 载入/保存）** + **T29（测试：往返与写入纪律）** —— 见派发清单。**装配无改动**（`.env` 归属不变、`package.json` 不改）。

## 12. 真实端到端 bootstrap 的缺口修正（客户「不预建，全由 su 对话决定」；2026-10-11）

> 客户要做**真实端到端测试**（空文件夹用产品建项目），核实发现**今天不通**。客户同时决定：**不预建、全由 su 对话决定**——**不摊任何角色骨架**，su 从空文件夹起、按对话决定建哪些角色、**直接用工具写出**；门禁只在旁约束「允许写什么」。此决定**否定** `writeGovernanceSkeleton` / `SCAFFOLD_ROLES` 作为 bootstrap 路径。

### 12.1 三处缺口（逐条有出处）

1. **su 一个字也写不了**：`src/service/gate/resolve-write.ts:24-30` 的 `isActive`——**条件目录须由 `scope.conditions` 声明才激活**；`scope` 缺失 → `conds=[]` → **条件目录恒不激活**。而**创世可写条目全是条件目录**（`角色卡/`、`docs/`、`.ans/`）⇒ 桌面开会话传 `scope: undefined` ⇒ **su 一切写入被拒**。界面那句「项目尚未 bootstrap：与 su 对话，让它创建角色」（`renderer.js:469`）是**空头支票**。
2. **桌面根本没接创世**：`app/desktop/project.ts:82-88` 的 `ProjectConfig` **没有 `genesisBootstrap`**（全仓只有 `boundary-core.ts` 读它、`model/role.ts` 定义它，**无一处设置**）；su 走 `openRoleSession`（`app/desktop/session.ts:227`），**不是**带 bootstrap 的治理会话入口。
3. **没有路径能指向任意空文件夹**：`resolveProjectRoot()` = ans-cli 自己（`src/index.ts:46`）；`governCommand` 明确「**不取目标目录**」（`src/interface/cli/govern.ts:33`）——CLI 连「对某个空文件夹做 bootstrap」的能力都没有。

### 12.2 核心裁决：空项目上 su 的写（两全做法）

**裁决：把创世的「门口」放在「边界选择」这一层，`su` 的 `scope` 保持 `undefined`（普通聊天）。**

- **做法**：未 bootstrap 的项目的 `ProjectConfig` 设 **`genesisBootstrap`**（→ 门禁引擎对内置治理角色返回**项目根治理种子边界**，此机制已存在）+ **将种子边界条目由 `conditional-directory` 改为普通 `directory`**。于是 `scope: undefined` 下：命中目录 → **直接 `allowed`**；`src/**` 不匹配 → **拒**。**无需 scope、无需 slug。**
- **为何不用「创世 scope」（协调方设想的方案）**：`resolve-write` 的 F4 里 `writeSet` 是**精确集合**（`writeSetContains` 逐项 `compareKey` **相等**），**无法表达「`角色卡/<对话中才定的未来角色>/…`」**；而**空 `writeSet` 的既有语义是「拒一切」**（旧治理占位 `{writeSet:[]}` 正是用它 deny-all）。故「创世 scope」要么**改 F4 语义**（与 deny-all 用法碰撞）、要么**枚举未知路径**（不可能）。**把门放在边界选择层最干净。**
- **有界性不变（仍非 blanket）**：种子边界**只含** `角色卡/`、`docs/`、`.ans/`（**不含 `src/`、不含项目内任意文件**），且**仅在 `genesisBootstrap` 被显式设**时出现（操作者发起）。
- **自动切回普通聊天**：由 **`hasRoles`** 驱动——项目一旦有角色（或已有自己的治理边界），桌面**不再设 `genesisBootstrap`** ⇒ su 用**项目边界**（项目覆盖）⇒ 普通聊天。**且** `boundary-core` 的自终止是**结构性**的（项目覆盖先命中，genesis 分支永不求值），**双保险**。

### 12.3 CLI 侧：`ans govern` **接受目标目录**

**裁决：接受。** `ans govern [<目录>]`（或 `--dir <path>`）——否则 CLI 连「对任意空文件夹 bootstrap」都办不到（现状只作用于 ans-cli，见 12.1-3）。签名以**可选目标目录**扩展（`governCommand(argv, deps)` 已收 argv）；**装配**据它设 `project.projectRoot`。**归编排（解析）+ 装配（配置注入）**。

### 12.4 `writeGovernanceSkeleton` / `SCAFFOLD_ROLES` 的去向

**裁决：退役（删除）**——客户「不预建」直接否定其用法。

- **删除**：`SCAFFOLD_ROLES`（硬编码角色表）、`writeGovernanceSkeleton`（自动骨架），以及**仅供骨架用的**序列化（`serializeRoleCard`/`serializeMemo` 等）。
- **迁移（不删）**：**种子边界构造** `governanceBoundaryEntries` / `buildGovernanceSeedBoundaryForGate` **迁入门禁引擎**。理由：① 它本质是**边界/门禁**概念（一个 `BoundarySection1`）；② **现状 `boundary-core.ts` 从编排私有 `bootstrap.ts` 导入它**（`import { buildGovernanceSeedBoundaryForGate } from "../编排/bootstrap.ts"`）——**这是 §6 违规**（跨角色导入私有 `common/` ＋ Service 反向依赖 Pipeline），**必须消除**。迁入门禁引擎即修复。
- **既有的 pin/manifest 能力**：不留在已删骨架里——见 12.5。

### 12.5 创世留痕与 pin（取舍）

- **su（模型）不会算 hash**，故 **pin 必须由代码在 su 写完「之后」算**。
- **推荐保留**：su 会话 **settle 后**由 **finalize 机制**（编排/门禁引擎）扫 `角色卡/*/boundary.yaml` + 项目治理边界 → 算 SHA-256 → 写 `.ans/project.json`（pin）+ `docs/bootstrap-manifest.md`（逐路径留痕）。
- **替代（更简）**：不要自动 pin/留痕，以 su 的会话记录为凭。**此取舍交客户**（见 T33 标注）。

### 12.6 验收方法的更正（**必记**）

**T9 结论「未发现自证与实际不符」是实话，但验错了对象**：它验的是编排的 `openGovernanceSession`（那条确实通），**没验桌面这条链**。**根因＝范围划窄（我方责任）**；暴露的方法漏洞——**验收要按「用户实际会走的那条路」来验，不能按「哪层有测试就验哪层」。** 写入本方案，并作为 **T35** 的要求。

- **确定性部分（可自动验收，无需模型）**：空文件夹 `listProject` 返回 su；`genesisBootstrap` 下 su 的 gate **允许 `角色卡/<任意>/…`、`docs/…`、`.ans/…`**、**拒绝 `src/**` 与项目根外**；写出项目边界后**自终止**（项目覆盖生效）。
- **模型依赖部分（**本机不可自动验收，须客户本人跑**）**：su **真的据对话决定并建出角色**——需真实模型轮次（凭据 + `ANS_PI_CONTEXT_WINDOW`）；**按项目当前操作约束须客户本人运行**。→ 标记为「**客户跑**」，**不列入自动验收**。

### 12.7 任务

见派发清单 **T30–T35**：T30（桌面接线创世）、T31（门禁引擎：种子边界迁入 + 改普通目录）、T32（编排：退役骨架 + `ans govern` 接受目标目录）、T33（创世 finalize：pin+留痕；**取舍交客户**）、T34（装配：目标目录→`projectRoot`）、T35（测试：**用户入口**确定性验收）。**吸收/取代**：早前 T15 的种子边界工作并入 **T31**；T16「su 写路径 + 废 init」的骨架部分并入 **T32**。

## 13. bootstrap 完成方式重定：su 提议 → 客户确认 → 完成；完成后 su 可继续增改（客户 2026-10-11）

> **推翻 §12.5 的「显式（由用户）finalize」**。客户：**「完成 bootstrap 应该是 su 主动觉得差不多了来完成；后面 su 可以动态增加和修改」** + **「当然需要客户确认了」**。
> **正确形态＝中间那层**：**su 判断得差不多 → 提议「可以收口了」→ 界面把这件事摆给客户 → 客户确认 → 才 finalize**。既不是「su 自己说了算」，也不是「客户记着点一个一直挂着的按钮」。

### 13.1 su 的「主动」＝一个工具，语义是「提议收口、等待确认」

- **工具**：`finalize_bootstrap`（受治理）。语义**不是「立即完成」**，而是**「提出收口、挂起等客户确认」**——**与 shell 闸的 (a) 操作者确认同构：没有确认就不执行**。
- **确认通道＝复用 shell 闸的 `OperatorChannel`（同一套，不造第二套）**：`OperatorPrompt`/`OperatorOutcome` 已在 §4 冻结契约家 `src/provider/pi/session.ts`（T20–T22 已收敛）；finalize 的「提议」是**一种 `OperatorPrompt`**。**复用既有 (a) presenter 代码**（`app/desktop/operator-channel.ts`）。
- **与 shell 闸 V1 不 arm 的关系**：§8-6 的「不 arm」**只针对 shell 闸**；**finalize 的确认在 V1 桌面必须接线**（否则无法完成 bootstrap）。二者**同一机制、不同实例**：既有的 (a) presenter 代码**由「未消费」变为「被 finalize 确认消费」**（§8-6 表述随之更新）。
- **确认不可用 / 超时 / 拒绝 → 不完成（fail-closed）**，并**反馈 su**（如「收口未获确认」），su 可继续工作或稍后再提议。
- **非创世态调用 → 拒绝**（不是静默）：工具**仅在创世态注册**（**能力注入才注册，同 `run_shell` 的「未注入 ShellGate 即不注册」先例**——**不是一直注册着**）；另加**显式守卫**：非创世态调用即拒。
- **它同样过门禁**：工具触发的写（`.ans`、治理边界文档）**每一笔先经 `resolveWrite`**（`finalize.ts` 已如此：命中即拒则整批中止、零副作用）——**不因是「完成」而绕门**。

### 13.2 自终止的松绑：finalize 后 su 的边界＝项目的治理边界文档

- finalize 确认通过后写出 **`角色卡/governance-boundary.yaml`**（`GOVERNANCE_BOUNDARY_REL`）——`.ans` 的 `governanceBoundary.path` 指向它。此后 `resolveBoundarySection` 走**项目覆盖**分支 ⇒ su 的边界＝**这份文档**（创世分支不再求值；自终止仍是结构性，但**不再是终点**）。
- **那份文档应有的条目（具体）**（root 恒 `project`；**普通目录、无需 slug**——以便 su **随时**增改）：

  ```yaml
  role: 治理边界
  entries:
    - { kind: directory, path: 角色卡/, purpose: 角色目录：新建/修改角色（role-card/boundary/memo/docs）与治理边界文档自身 }
    - { kind: directory, path: docs/,   purpose: 项目文档 }
    - { kind: directory, path: .ans/,   purpose: .ans/project.json（acceptance/pin 更新） }
  ```
- **为什么不是 blanket**：**写集有界**（只这三个目录，**绝不含 `src/`、不含项目内任意文件**）；它是**项目工件**（一份具体文档，**经客户确认并 pin**）；它表达的是 **Governance 角色的常设授权**——管理**治理产物**，与「每个角色有自己的常设 Section 1」同理，**不是「随便写整个项目」**。

### 13.3 pin 的更新时机（最要紧）

- **首次 pin**：**在 finalize 确认通过时**（写 `.ans`）。**在此之前不写 `.ans`**——否则项目会在客户确认前就「变成正式态」，确认就失去意义。
- **其后刷新**：**每轮 su 会话 settle 后自动重新 pin**（**仅在已 bootstrap / 非创世态**）——重扫 `角色卡/*/boundary.yaml` + 治理边界 → 更新 `.ans` 的 pin + manifest。
- **⇒ 客户加一个角色，pin 不会过时**：该角色写入的那一轮 settle 后，pin **自动纳入**新的/变更的 `boundary.yaml`。
- **「半成品」概念现已不成立**：「完成」是「su 提议 + 客户确认」的**语义里程碑**（项目从**创世态**进入**正式态**）——**不是**「此后不再变」的承诺（**恰恰相反，此后 su 还能加/改**）。pin 每轮刷新，不存在「pin 到一个再不会变的状态」的假设。
- **如实标注的取舍**：pin 自动刷新 ⇒ 「**上一轮结束时的盘面**即被接受」；对**外部（非 su 会话）**的边界改动，**下一次 su settle 会吸收**——tamper 检测窗口＝到下一次 su settle 为止。（可选加强：仅重 pin su 本轮实际写过的路径。）

### 13.4 用户那个「完成 bootstrap」按钮：**不删，改造**

- 改造为 **「su 提议的确认面」**：**仅在 su 已提议时出现/激活**（不一直挂着）；**su 的提议本身在聊天流里可见**（一条系统行/卡片「su 提议：可以收口了（完成 bootstrap）」+ `[确认完成]` / `[暂不]`）。
- **与「聊天无确认弹窗」不冲突**：客户先前定的「无弹窗」**针对普通聊天消息**；**这次是一次性的、把项目从「创世态」推进到「正式态」的动作**，客户**明确要确认**。**两者不对立。**

### 13.5 可自动验收 vs 须客户本人跑

- **可自动验收**（无需模型）：工具**仅在创世态注册 / 非创世态不存在**；**调用它 → 挂起等确认（不立即完成）**；**确认通过 → finalize**（写治理边界文档 + `.ans` + manifest）；**拒绝/超时/通道不可用 → 不完成**；**非创世态调用 → 拒绝**；工具触发的写**同样过门禁**、失败 fail-closed；**pin 刷新**（加边界后 settle → pin 更新）；治理边界文档条目使 su 能写 `角色卡/`。
- **须客户本人跑（模型行为，本机不可自动验收）**：**su 是否提议**、**提议得对不对**、**是否据对话建出角色**——需真实模型轮次（凭据 + `ANS_PI_CONTEXT_WINDOW`）。

### 13.6 任务

见派发清单 **T36–T39**。**吸收/取代**：§12.5「显式（用户）finalize」被本节取代；**T33（finalize 机制）由 T37 改造**；T37 的 UI 面由 T38 承担。

## 14. shell 闸 (c) 判定重定：增第四档 `risky`；硬拒不再「危险即拒」（客户 2026-10-11）

> **本节的裁定部分推翻 §7.3 的「硬拒不分类、危险即终结」**。客户：**危险命令（`rm` / `sh -c` 这类）不再一概终结**——「**先过 (b) pm 审读，而且无论 pm 怎么判，都还要过 (a) 你本人看原文确认**」；即**「pm 不是终审，你才是」**。理由：**`rm` 不是永远错的**（删自己刚生成的临时文件完全合理），一概硬拒即设计自认的「**过宽则天天误杀**」；同时**保留「模型不能单独放行」**（加了 (a) 人这一层）。

### 14.1 第四档：`ShellClass` 增 `"risky"`

- **`ShellClass` 由三态扩为四态**：`"allow" | "deny" | "risky" | "review"`（`src/model/decision.ts`，门禁引擎 Model；`ShellVerdict.ruleId` 相应加 `risky:program:<id>`）。
  - `allow` = 白名单（只读，直接放行）；
  - `deny` = **仍硬拒终结**（**无可正当用途**或**放行即等于门禁被绕过**；不可被 (b)/(a) 翻案）；
  - **`risky` = 危险但有正当用途 → 必须过 (b)；(b) 判「放行」后仍须过 (a)**；
  - `review` = 中性未知 → 过 (b)（`allowed` 即终结；拿不准/不可用 → (a)）。
- **取舍**：用**新枚举值**而非「`review` + `requiresHuman` 标志」——① 让**次序与终结规则**显式、可测（`risky` 与 `review` 的唯一差别就是「b 判放行后是否仍强制过 (a)」）；② 避免「调用方忘了检查 flag」类 bug；③ 与既有「冻结契约返回一个标注值」风格一致。**代价**：改动 `ShellClass`（Model）＋ `SHELL_RULES_VERSION` bump。

### 14.2 三层次序与终结规则（**写死**）

| (c) 判出 | 进 (b) pm？ | (b)=allow | (b)=deny | (b) 拿不准/不可用 | 进 (a)？ | 终结规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `allow` | 否 | — | — | — | 否 | **放行**（不打扰人） |
| `deny` | 否 | — | — | — | 否 | **拒绝、终结**（不可翻案） |
| `review` | 是 | **→ 放行（终结）** | **终结：拒** | → (a) | 仅当 b 拿不准/不可用 | b 明确即终结；否则 (a) 定 |
| `risky` | 是 | **→ 仍过 (a)** | **终结：拒** | → (a) | **必过 (a)** | **无论 b 怎么说都过 (a)**；(a) 放行→放行；(a) 拒/超时/不可用→拒 |

- **pm 判「拒绝」→ 不打扰人**（对 `review`/`risky` 皆然，**终结**）——已确认。
- **(a) 拒绝/超时/不可用 → 拒绝**（fail-closed，§7.5 不变）。
- **「哪些档位打扰人」小结**：`allow` 不打扰；`deny` 不打扰（直接拒）；`review` **条件性**打扰（b 拿不准/不可用时才叫人）；`risky` **总要打扰**（必过 a）——**唯独 b 判拒时不打扰**。

### 14.3 (c) 硬拒名单重划（原则：**只拒「没有任何正当用途」或「放行即绕过门禁」的**）

> **注意 §7.10 前提仍成立**：命令**不经 shell 解释**（`spawn(shell:false)`），故元字符（`>`/`|`/`$()`…）那批**本来就是空转**，**不作为**下列任何一条的理由。

**A. 仍硬拒、终结（不可翻案）**——两类：

1. **「程序/代码藏在参数 string 里」的 re-shell/求值形态**（**放行=门禁被整体绕过**，见 §14.4）：
   `sh`/`bash`/`zsh`/`dash`/`ash`/`ksh`/`fish`/`cmd`/`powershell`/`pwsh`（含 `-c`/`/c`）；`eval`/`exec`/`source`/`command`/`.`；**内联求值** `node -e`/`python -c`/`perl -e`/`ruby -e`/`php -r`/`lua -e`/`deno eval`/`bun -e`/`ts-node -e`；`awk`（可 `system()`）。
   **理由**：其 `argv` 里**没有可读的程序名**（真命令是那段 string），(c) 无法分类、**门禁无法约束其内部写入** ⇒ 放行即失去边界。**这一类没有「有界的正当用途」**。
2. **无可正当用途的滥用形态**：**提权** `sudo`/`doas`/`su`/`runas`/`pkexec`；**系统级破坏/控制** `mkfs`/`format`/`diskpart`/`wipefs`/`fdisk`/`shutdown`/`reboot`/`halt`/`poweroff`；**Windows 脚本宿主/LOLBin** `mshta`/`wscript`/`cscript`/`rundll32`/`regsvr32`/`msiexec`/`installutil`/`regasm`/`regsvcs`/`javaws`/`msdt`/`forfiles`/`certutil`/`bitsadmin`。
   **理由**：在受治理的开发会话里**没有正当用途**（提权、毁系统、典型攻击宿主）。

**B. 改判 `risky`（危险但有正当用途 → 过 b+a）**：

- **删除**：`rm`/`rmdir`/`del`/`erase`/`rd`/`shred`/`truncate`/`dd`（删临时文件等**正当**）。
- **就地编辑**：`sed -i`/`perl -i`/`ruby -i`。
- **编辑器**：`vi`/`vim`/`nvim`/`nano`/`emacs`/`ed`/`ex`/`notepad`。
- **进程/服务**：`kill`/`killall`/`taskkill`/`systemctl`/`service`/`sc`/`net`/`reg`/`regedit`/`schtasks`/`at`/`crontab`/`launchctl`。
- **网络**：`curl`/`wget`/`fetch`/`aria2c`/`scp`/`sftp`/`ftp`/`rsync`/`telnet`/`nc`/`ncat`/`netcat`/`ssh`/`psexec`。
- **间接执行器（程序在 argv 里可见）**：`xargs`/`env`/`nohup`/`nice`/`ionice`/`timeout`/`stdbuf`/`watch`（**与 A-1 的区别**：这里被执行的**程序名以可读 argv 元素出现**，人能在原文里看懂；A-1 是**藏在 string 里**）。
- **构建**：`make`/`gmake`/`just`/`rake`/`gradle`/`gradlew`/`mvn`/`mvnw`/`ant`/`msbuild`/`dotnet`/`cargo`/`go`。
- **包管理**：`npm`/`yarn`/`pnpm`（`install`/`run` 形态）/`npx`/`corepack`。
- **`git` 写子命令 / `--output`**（`git checkout`/`clean`/`reset`/… 及 `git log --output=x`）。

**理由**：这些**单个程序的语义可判**、且**在开发里有正当用途**；风险交给 **(b) 审读 + (a) 人看原文**兜。

**关于「写目标逃出受治理根」**：**这不是 (c) 的判据**——`(c)` **不解析路径**（把启发式路径解析塞进 (c) 正是 §7.7 否掉的「把解析器当判据」）。路径由 `resolveWrite` 在其**自身范围**判；**但** `run_shell` 的进程写入**不经 `resolveWrite`**（§7.1），故对 **shell 介导的写**，「逃出根」**在门禁侧无强制**（见 §14.4 的诚实结论）。

### 14.4 `sh -c` 的洞（**核心**，正面答复）

- **事实**：`run_shell` 以 `spawn(argv[0], argv.slice(1), {shell:false})` 执行。但 **`sh -c "…"` 里的 `sh` 自己会解释那段 string** ⇒ **该命令的一切影响（含写入）发生在子进程内，完全不经过 `resolveWrite`**。
- **⇒ 若放行 `sh -c`（或其同类 `eval`/`node -e`），shell 闸与写边界对那条命令就整体失效**——(b) 是模型（可被注入说服）、(a) 人会看到原文，但**门禁对「那段 string 会写什么」一无所知、也无法约束**。
- **裁决：re-shell/内联求值形态（§14.3-A1）仍硬拒终结，不改判 `risky`。** 理由：它们**不是「有界的危险命令」而是「任意代码」**——放行等于**取消边界**；这正是本项目「越界写在发生前被拒」价值主张的反面。**只有「程序名在 argv 里可见、语义可判」的危险命令（`rm`/`sed -i`/`dd`/…）才改判 `risky`**——因为 (a) 人能在原文里**看懂它的效果**。
- **若客户坚持把 `sh -c` 也放入 `risky`**：**必须如实登记**——那种命令的**写边界不由门禁强制**，**(a) 人看原文确认即唯一边界**；审计记录须带 **`effects-not-gated`** 标记；且**不得对外宣称「越界写在发生前被拒」对 shell 介导的写仍成立**。（**我不推荐**此路。）

### 14.5 入口是否 arm（**这条链今天从任何入口都到不了**）

- **现状**：桌面**不 arm**（`DESKTOP_SHELL_GATE_ARMED===false`，刻意不注入）；**CLI（`src/index.ts`）从来没人注入过 `ShellGate`** ⇒ **今天产品里模型在任何地方都不能跑 shell**。故 §14.1–14.4 改得再对，**当前也是空转**。
- **选项**：(i) **CLI arm**——`ans govern`/`run` 注入 `ShellGate`，则 (a) 就是**终端里打印命令原文问 y/n**（**那套 (a) 代码已有、只是没接**）；(ii) **两个入口都不 arm**——**在文档与代码注释里如实登记「V1 未接线」**，别让它看起来像在生效。
- **我的建议**：**V1 取 (ii)**——**不 arm、如实登记**。理由：一旦 arm，`run_shell` 的进程写**不受 `resolveWrite` 约束**（§7.1/§14.4），而 **V1 未做 OS 沙箱**，风险大；且 arm 与否是**客户的决定**。**(i) 是可选项、改动很小**（代码已在），交客户定。

### 14.6 与既有裁定的一致性（免得后人读成打架）

- **桌面选「不 arm」** 说的是「**装不装**」shell 能力（不给角色 shell 能力）；
- **本节改 (c) 判定** 说的是「**装了怎么判**」。
- **两者不矛盾**：一个管「能力开关」，一个管「判定链」。**当前 state = 装了怎么判已设计好、但没装（§14.5-(ii)）。**

### 14.7 任务

见派发清单 **T40–T43**：T40（门禁引擎：`ShellClass` 加 `risky` + 硬拒名单重划 + 版本 bump）、T41（编排：三层次序改造，`risky` 必过 (a)、b deny 终结）、T42（编排/装配：**arm 接线 or 如实登记「未接线」**）、T43（测试：`risky` 次序/终结、新硬拒名单、`sh -c` 仍硬拒）。

## 派发清单

按 §4 的顺序与依赖拆成可派发的角色任务。**每项只动该角色 Section 1 内的文件**；跨角色的先决条件（G-1）须先完成。**本清单是施工顺序，不是实现**。**V1 范围**：本清单**不含「派发执行」（S1，见 §3.7）**——V1 不演示多任务派发，演示到「单角色受治理会话真落盘 + bootstrap/创建权 + `.ans` pin + shell 闸」为止。

**前置（Governance / su）——✅ 已完成**

G-1a / G-1b 已由 Governance 完成、客户批准（2026-10-11；全量测试 229/229 通过；见 `docs/change/2026-10-11_change_governance-section1-grants.md`）：

| 任务 | 归属 | 产出 | 验收（已通过） |
| --- | --- | --- | --- |
| **G-1a ✅** 装配 `.ans/` 权限 | **Governance（su）** | `角色卡/装配/boundary.yaml` 增 `conditional-directory: .ans/`（condition `project-init`，root project） | 装配身份 + 声明 `project-init` 对 `.ans/project.json` → `allowed`；**缺条件 → 拒** |
| **G-1b ✅** pm `docs/audit/` 权限 | **Governance（su）** | `角色卡/项目管理/boundary.yaml` 增 `conditional-directory: docs/audit/`（condition `shell-gate`，root project） | pm 身份 + 声明 `shell-gate` 对 `docs/audit/shell-gate.jsonl` → `allowed`；**缺条件 → 拒** |
| **G-2** 记录 `.env` Pi 键的指定写入者 | **Governance（su）** | 治理变更记录（§11.2） | `.env` 归属**不变**（装配）；指定写入者 = 共享 `env-file` 模块（pm 属主），桌面运行时调用；**经客户确认** | 无 |

**主体任务**

| 任务 | 归属 | 改哪些文件 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- |
| **T1** `.ans` pin + acceptance 链 | **门禁引擎** | `src/model/boundary.ts`（`Acceptance` 加 pin 形状）、`src/common/门禁引擎/boundary-core.ts`（`loadBoundaryFile` 前置 SHA-256 校验）、`test/门禁引擎/` | pin 匹配→accepted；不匹配→未接受→**拒一切写**；无 `.ans`→回退内置（未接受）仍拒写 | 无（与 T3 并行） |
| **T2** `.ans` 加载 + init/govern 配置注入 | **装配** | `src/index.ts`、`src/common/装配/` | `ans doctor` 打印 pin 来源；缺 `.ans` 不崩、走回退；`init`/`govern` 收到注入配置（不再码 2）；**终态规则（§3.3）：`.ans` 声明 `accepted:true` 而无 `pin` → 载入方置为未接受（fail-closed）**；pin 与文件 hash 不符 → 未接受 | T1 |
| **T3** 写入真落盘 | **Pi适配器** | `src/provider/pi/tools.ts`、`src/common/pi-adapter/`、`test/pi-adapter/tools.test.ts` | §5.1 全项：允许写**字节相等**、拒绝**零副作用**、gate 抛错**无文件**、symlink 逃逸**拒绝**、`edit_file` 缺 `old_string`**不写**、写根恒=projectRoot | 无（与 T1 并行） |
| **T4** ~~`ans init` 骨架~~ **【作废：命令面删除；库面并入 T16（§10.7）】** | 编排 | 见 §10.4 / T16 | —— | —— |
| **T5** `ans govern` 治理会话 | **编排**（+门禁引擎复用 `resolveWrite`） | `src/interface/cli/govern.ts`、`src/pipeline/orchestration/govern-session.ts`、`src/common/编排/` | §5.2：治理会话所建 `角色卡/X/` 可被 `listProject` 枚举；越界写（目标项目 `src/`、项目根外）**写前被拒**；改边界致 pin 失配→**拒写** | T4、T3 |
| **T6**（**使用约定，非产品代码**）调度记录落盘 | **项目管理** | pm 边界内文档（`角色卡/项目管理/docs/`：派发决定 → 记录的使用约定）；记录由 **`task_ops`（技能现成脚本）** 落 `docs/scheduling/<task-id>.md` | **无产品代码可写**（`task_ops` 现成、`docs/scheduling/` 已在 pm 边界内）；验收 = 一条 `task_ops` 记录示例 + pm 使用约定成文 | 无（约定即可写；运行期记录场景依赖 T4） |
| **T7** V3 第一步：(c) 硬地板 + fail-closed + 审计 | **Pi适配器**(工具) + **门禁引擎**(`classifyShell` 规则引擎) + **编排**(`ShellGate` 仅接 (c)) + **项目管理**(审计落盘) | `src/provider/pi/tools.ts`（`run_shell`：**审核在 execute（唯一 spawn 点）**、`spawn(shell:false)`、**env 剥离凭据 §7.9**、未 arm 不注册）、`src/common/pi-adapter/real-adapter.ts`（customTools + 扩展**能力级 kill-switch，非 token**）、`src/service/gate/`（规则集：**按 argv，非 shell 元字符 §7.10**）、`src/common/编排/` | §7.5：白名单放行、硬拒拒绝、`review` 在 (b)/(a) 未接时**默认拒绝**、规则集加载失败→拒绝、**无 `ShellGate`→`run_shell` 不注册**、**审核链未返回 allow → 绝不 spawn**；**env 不含任一 `PI_CREDENTIAL_ENV_VARS` 值**；审计写 `docs/audit/shell-gate.jsonl` 须声明 `shell-gate` | （G-1b 已完成） |
| **T8** V3 第二步：(b) pm 审读 + (a) 操作者通道 | **编排**(接 pm 会话 + 操作者通道) + **Interface**(提示/对话框) + **桌面应用**(`app/`) + **门禁引擎**(审计合并分支) | `src/common/编排/`（`shell-gate.ts`）、`src/interface/cli/`、`app/`、`src/service/gate/`、`src/provider/pi/session.ts` | §7.3：`review` →(b) 明确放行/拒绝终结；(b) 超时/无会话→**升级 (a)**；(a) 放行/拒绝；(b)、(a) 不可用→**拒绝**；审计含 by/branch；**同批删除可重算 token**（`bindShellToken` + `ShellReviewResult.token`，§7.4） | T7 |
| **T9** 独立跨角色验收 | **测试** | `test/测试/` | 覆盖块1/2/3 端到端与 fail-closed 负例；复跑全量通过；**范围更新（§10.7）：T4 不在内，新增 su 对话 bootstrap 线（T14–T17）** | 相应任务完成后 |
| **T10** 桌面 acceptance 例外 + 界面文案更正 | **桌面应用** | `app/desktop/session.ts`、`app/renderer/`、`test/桌面应用/` | §3.3：运行期同意的 acceptance **代码注释 + 文档写死为「登记的非-pin 例外」及理由**；**§3.9：界面文案按运行时如实**（demo 只判不写 / pi 会写），**不得再写「V1 桌面：只判不写」** | T2 |
| **T11** 共享 `.ans` 载入器 | **项目管理** | `src/common/shared/config-loader.ts`（搬迁 `loadEffectiveConfig`/`enforcePinBackedAcceptance`）、`docs/architecture/shared-components.md` | §3.10：**搬迁非 fork**（保持单一实现）；登记本项目首个共享组件 | 无 |
| **T12** 装配去重导入 | **装配** | `src/common/装配/config-loader.ts` 及相关引用 | §3.10：改为从共享模块导入、**删除本地重复**；**行为不变、全量测试通过** | T11 |
| **T13** 桌面接线共享载入器（原 T10 第 2 件） | **桌面应用** | `app/desktop/project.ts`、`app/desktop/session.ts`、`test/桌面应用/` | §3.10/§3.3：**有 `.ans` → 用 pin-backed acceptance（pin 生效、篡改即拒写）；无 `.ans` → 回退运行期同意**；**不得第二份实现** | T11、T12 |
| **T14** `listProject` 空目录不抛错 + `primaryRoleId` | **门禁引擎** | `src/service/role/resolve-role.ts`、`test/门禁引擎/` | §10.2/§10.7：无 `角色卡/` → **返回 su + warning + `hasRoles:false`，不抛错**（根不存在/非目录**仍**抛错）；结果**含 `primaryRoleId`**（内置 su 的 id，供主入口用；渲染侧**不硬编码**） | 无 |
| **T15** 冷启动治理边界求值（有界创世例外） | **门禁引擎** | `src/common/门禁引擎/`、`src/service/`、（如需）`src/model/`、`test/门禁引擎/` | §10.1：空项目上 su 的 gate 对**项目根**的条件目录（`角色卡/`/`docs/`/`.ans/`）求值；acceptance = 操作者 bootstrap 指令；**边界外/非治理产物一律拒**；写出项目边界后**项目覆盖生效、创世授权自终止** | 无（与 T14 同角色） |
| **T16** su 治理写路径 + 废 `ans init` + 统一治理会话入口 + `TaskHandback` | **编排** | `src/interface/cli/init.ts`（**删**）、`src/common/编排/bootstrap.ts`（**改造复用**为治理写库，可改名）、`src/pipeline/orchestration/govern-session.ts`、`src/common/编排/`、`test/编排/`（含删 `init.test.ts`） | §10.4/§10.5/§10.8：su 建角色/边界/**manifest 留痕**复用现成库；**CLI `ans govern`** 与**桌面 su** 收敛到**同一治理会话入口**（无两份实现）；角色会话 settle 产 **`TaskHandback`** 事件（V1 仅事件，自动路由=S1）；端到端可跑 | T15 |
| **T17** 桌面：未-bootstrap 状态 + 左树刷新 + su 主位 + 回交呈现 | **桌面应用** | `app/desktop/interface.ts`、`app/desktop/session.ts`、`app/renderer/renderer.js`、`test/桌面应用/` | §10.3/§10.7/§10.8：导入空文件夹 → 显示 su + 「尚未 bootstrap」提示；**su 默认选中、作主入口**（其他角色次级可聊）；**su 轮次 settle 后左树刷新**；**回交卡片 + 镜像进 su**；su 建出角色后**左树随之长出** | T14、T16 |
| **T18** 测试：作废 init 断言 + su-bootstrap 集成 | **测试** | `test/测试/` | §10.4/§10.7：**作废 `real-entry.test.ts` 的 init 断言**；新增 su 对话 bootstrap 端到端/回归；复跑全量通过 | T16、T17 |
| **T19** 桌面 shell 闸不 arm：变更记录措辞 | **桌面应用** | 本角色 `changelog.md`、`app/desktop/main.ts`（注释） | §8-6：changelog 由「**待客户拍板**」改为「**客户已确认：V1 不 arm**」；代码/文档**如实标注对话框通道「已建但未消费」**；**无需实现改动** | 无 |
| **T20** 冻结契约加 operator 三型 + 消费共享原语 | **Pi适配器** | `src/provider/pi/session.ts`（加 `OperatorPrompt`/`OperatorOutcome`/`OperatorChannelFn`）、`src/provider/pi/tools.ts`、`src/common/pi-adapter/fs-write.ts` | §3.11-1/6：`session.ts` 成 operator 三型**单一来源**；`tools.ts` 删 `PI_CREDENTIAL_ENV_VARS` 副本、`fs-write.ts` 删**路径镜像**并改从 shared 导入；行为不变 | T23（消费 shared 部分） |
| **T21** 编排消费 operator 三型 + `normalizeArgv` | **编排** | `src/common/编排/shell-gate.ts`、`src/common/编排/operator-channel.ts` | §3.11-1/7：改从 `session.ts` 导入 operator 三型、**删本地定义**；**删本地 `normalizeArgv`**、改从 shared 导入；**行为逐字不变 + 全量 448/448 + typecheck 零错** | T20、T23 |
| **T22** 桌面消费 operator 三型 + shared 原语 | **桌面应用** | `app/desktop/operator-channel.ts`、`app/desktop/project.ts`、`app/desktop/session.ts`、`test/桌面应用/` | §3.11-1/3/4/5/7：operator 三型改从 `session.ts` 导入（含 test）、**删逐字镜像**；`toPosix`/`RuntimeKind`/`resolveSkillRoot`/`normalizeArgv` 改从 shared 导入；**行为逐字不变 + 全量 448/448 + typecheck 零错** | T20、T23 |
| **T23** 建 shared 原语模块 | **项目管理** | `src/common/shared/`（凭据常量、路径原语、`RuntimeKind`、`resolveSkillRoot`、`normalizeArgv`）、`docs/architecture/shared-components.md` | §3.11-2/3/4/5/6/7：**共享单一来源**；登记 `shared-components.md` | 无 |
| **T24** 装配消费 shared | **装配** | `src/common/装配/runtime.ts`、`src/index.ts` | §3.11-2/3/4：`PI_CREDENTIAL_ENV_VARS`/`RuntimeKind`/`resolveSkillRoot` 改从 shared 导入、**删副本**；行为不变 | T23 |
| **T25** 门禁引擎消费 shared 路径原语 | **门禁引擎** | `src/common/门禁引擎/paths.ts` | §3.11-5/6：路径原语改从 shared 导入、删 `toPosix` 副本；**词法与 Pi适配器同源** | T23 |
| **T26** 共享 `env-file` 模块 | **项目管理** | `src/common/shared/env-file.ts`、`docs/architecture/shared-components.md` | §11.2/11.4：`parse` / `merge`（**只改相关键**、保留注释与未知键）/ `atomicWrite`（temp+`rename`）/ `loadEnvFileInto`；**不打印值**；登记 `shared-components.md` | 无 |
| **T27** provider-config 红线改写 | **Pi适配器** | `src/common/pi-adapter/provider-config.ts` | §11.1：红线**如实改写**（凭据可写**指定的** `.env`；绝不写入库文件/绝不回显）；**原措辞保留 + 标注「已被取代」**；`resolvePiProviderConfig` **原样复用、不改**；凭据**不打印** | 无 |
| **T28** 桌面 Pi 配置面板 + 载入/保存 | **桌面应用** | `app/main.ts`（启动 `loadEnvFileInto`）、`app/desktop/`（面板逻辑 + IPC）、`app/renderer/`、`app/preload.cjs` | §11.3/11.5：启动载 `.env`→env（补 `--env-file`）；面板可设/存 `.env`（**只改相关键**、**token 掩码**、**原子**、**失败显式**）；**保存后重载**；选 `pi` 未配置 → **明确报错** | T26 |
| **T29** 测试：env-file 往返与写入纪律 | **测试** | `test/测试/` | §11.4：合并**只改相关键/保留其余**、**原子**、**无值回显**；桌面存取往返（**不调真实模型**）；复跑全量通过 | T26、T28 |
| **T30** 桌面接线创世 | **桌面应用** | `app/desktop/project.ts`、`app/desktop/session.ts`、`app/desktop/interface.ts` | §12.2：`!hasRoles` 时 ProjectConfig 设 **`genesisBootstrap`**；su 会话经**统一治理会话入口**（`openGovernanceSession`）；`scope: undefined`；**有角色后不再设**（靠 `hasRoles` 自动切回） | T31 |
| **T31** 种子边界迁入门禁引擎 + 改普通目录 | **门禁引擎** | `src/common/门禁引擎/boundary-core.ts`（移入）、`src/common/编排/bootstrap.ts`（移出） | §12.2/12.4：种子边界（`角色卡/`/`docs/`/`.ans/`）**由条件目录改普通 `directory`**、**迁入门禁引擎**、**消除对编排 `bootstrap.ts` 的 §6 违规 import**；`scope:undefined` 下**允许** `角色卡/*`/`docs/*`/`.ans/*`、**拒** `src/**` 与根外 | 无 |
| **T32** 退役骨架 + `ans govern` 接受目标目录 | **编排** | `src/common/编排/bootstrap.ts`（删 `SCAFFOLD_ROLES`/`writeGovernanceSkeleton` 及仅其用的序列化）、`src/pipeline/orchestration/govern-session.ts`、`src/interface/cli/govern.ts` | §12.3/12.4：**删除骨架代码（无死代码残留）**；`openGovernanceSession` 不再预建骨架（改由 su 写）；**`ans govern [<dir>]` 接受目标目录** | T31 |
| **T33** 创世 finalize（pin + 逐路径留痕） | **编排 / 门禁引擎** | `src/common/编排/`、`src/common/门禁引擎/` | §12.5：su settle 后扫 `角色卡/*/boundary.yaml` + 治理边界算 SHA-256 → 写 `.ans/project.json`（pin）+ `docs/bootstrap-manifest.md`；**取舍（保留 vs 省略自动 pin/留痕）交客户** | T31、T32 |
| **T34** 装配：目标目录 → `projectRoot` | **装配** | `src/index.ts`、`src/common/装配/` | §12.3：`ans govern <dir>` 的 `projectRoot` 取该目录；缺省仍 ans-cli | T32 |
| **T35** 测试：**用户入口**确定性验收 | **测试** | `test/测试/` | §12.6：**从用户入口出发**；确定性项（su 允许 `角色卡/*` 拒 `src/**`、空文件夹 `listProject` 返 su、写出边界后自终止）；**模型依赖项标记「客户跑」、不入自动验收**；复跑全量通过 | T30–T34 |
| **T36** `finalize_bootstrap` 工具 | **Pi适配器** | `src/provider/pi/tools.ts`、`src/common/pi-adapter/real-adapter.ts` | §13.1：工具**仅在创世态注册**（能力注入才注册，**同 `run_shell` 先例**）；**非创世态不注册 + 显式守卫拒绝**；handler 调注入的 finalize；**同样过门禁** | T37（能力形状） |
| **T37** finalize 改造：提议→确认→完成 + 自动重 pin | **编排** | `src/common/编排/finalize.ts`、`src/pipeline/orchestration/govern-session.ts` | §13.1–13.3：finalize 语义＝**挂起等确认**（经 **`OperatorChannel`**，复用 shell 闸 (a)、**不造第二套**）；确认通过→写 **`角色卡/governance-boundary.yaml`（三目录条目）** + `.ans`（pin+acceptance）+ manifest；**拒/超时/不可用→不完成**；**每轮 settle 自动重 pin（非创世态）**；暴露 finalize 能力供注入 | T31 |
| **T38** 桌面：su 提议的确认面 | **桌面应用** | `app/renderer/renderer.js`、`app/renderer/index.html`、`app/desktop/session.ts`、`app/desktop/operator-channel.ts`、`app/main.ts` | §13.4：按钮**仅 su 提议时出现/激活**；**提议在聊天流可见**；接线 `OperatorChannel`（**复用既有 (a) presenter 代码**）供 finalize 确认；确认不可用/超时→不完成 | T36、T37 |
| **T39** 测试：finalize 提议/确认自动验收 | **测试** | `test/测试/` | §13.5：工具注册条件（创世/非创世）、挂起/确认/拒绝/超时、非创世态拒、过门禁、**pin 刷新**；复跑全量通过 | T36–T38 |
| **T40** `ShellClass` 加 `risky` + 硬拒名单重划 | **门禁引擎** | `src/model/decision.ts`、`src/common/门禁引擎/classify-shell.ts`、`test/门禁引擎/` | §14.1/14.3：`ShellClass` 增 `"risky"`；`classifyShell`/`ShellVerdict` 产出；**硬拒重划**（re-shell/eval/LOLBin/提权/系统破坏 **仍 deny**；`rm`/`sed -i`/`dd`/wrapper/**构建**… **改 risky**）；bump `SHELL_RULES_VERSION` | 无 |
| **T41** 三层次序改造（`risky` 必过 (a)） | **编排** | `src/common/编排/shell-gate.ts`、`src/common/编排/operator-channel.ts` | §14.2：`risky` **必过 (a)**（b 判 allow 亦过 (a)）；b deny→**终结**；review 保持「b 明确即终结」；fail-closed 三退路保持 | T40 |
| **T42** arm 接线 **或** 如实登记未接线 | **编排 / 装配** | `src/index.ts`、`src/common/编排/`（注释）、`README.md` | §14.5：**取 (ii)＝如实登记「V1 未接线」**（文档 + 代码注释，别让它看起来生效）；**(i) CLI arm 为可选项**（`src/index.ts` 注入 `ShellGate`，用既有 (a) 终端 y/n）——**交客户定** | 无（交客户） |
| **T43** 测试：`risky` 次序/终结 + `sh -c` 仍硬拒 | **测试** | `test/测试/` | §14：`risky` 次序/终结（**b allow 仍过 (a) / b deny 终结**）、新硬拒名单、**`sh -c`/`eval`/`node -e` 仍硬拒**、放行 risky 后的审计；复跑全量通过 | T40、T41 |

**依赖图（简）**：`G-1a ✅`、`G-1b ✅`（前置已完成，不再阻塞）；`T1` ─► `T2` ─► ~~`T4`~~（**作废，并入 T16**）─► `T5`；`T2` ─► `T10`；~~`T4→T6`~~ → **`T16` ─► `T6`**；`T3` ─► `T5`（端到端）；`T7` ─► `T8`；`T11` ─► `{T12, T13}`；**`T15` ─► `T16` ─► `{T17, T18}`**；`T14` ─► `T17`；**`T19` 独立（无依赖）**；**`T23` ─► `{T20, T22, T24, T25}`，`T20` ─► `T21`**；**`T26` ─► `{T28, T29}`，`T28` ─► `T29`**；**`T31` ─► `{T30, T32, T33}`，`T32` ─► `{T34, T35}`**；**`T37` ─► `T36`，`{T36, T37}` ─► `T38`，`{T36, T37, T38}` ─► `T39`**；**`T40` ─► `T41` ─► `T43`**；`{T3, T1}` 可先并行；`T9` 收口。**（二期）S1（派发执行）、S2（桌面 demo 路径真实写入）不在 V1。**
**可并行组**：{T3, T1}；{T6, T7}；{T4→T16, T11}；`T2→T5` 与 `T14/T15→T16→T17/T18` 为主线。

**（二期，不在 V1）S1 派发执行** —— 见 §3.7：pm 产 `DispatchPlan` → 编排**解析**（校验 roleId 在册/deps/无环）→ 按拓扑序逐条 `openRoleSession` 打开目标角色会话。胶水代码归**编排**；依赖 T3、T5、（必要时）V3。**V1 范围外，故不入上表施工序**——这样「调度权归 pm」在 V1 只落到**纸面归属 + 使用约定（T6）**，**执行留二期**，不假装 V1 已能派发。

**（二期，不在 V1）S2 桌面 demo 路径真实写入** —— 见 §3.9：给 demo 线程 `writeRoot`（测试/演示用**临时沙箱副本**，**绝不**指向 ans-cli 仓库）。**注**：**pi 路径的真实写入 V1 即生效**（不受 S2 影响），S2 仅覆盖 demo 路径。

## 变更记录

- 2026-10-11：首次建立。客户选定三块全做；项目管理出实施方案（归属、授权路径、顺序、验收、风险、V3 取舍），不含实现。来源：客户指令 + 本项目代码与技能规则通读。
- 2026-10-11：并入客户/协调方决定——**创建权按 su**（pm 创建仅留「未正名的偏离」，不实现）；**V3 审核主体定为组合 (c)+(b)+(a)**（§7 重写为机制：先后、翻案问题、fail-closed 三退路）；**`init --force` 默认拒绝覆盖**；**调度记录唯一写入者 `task_ops`**；**`.ans/` 纳入本项目**并写明其 Section 1 由 Governance 更新装配边界给出。新增 `## 派发清单`（初版 11 条：G-1a、G-1b 两项 Governance 前置 + T1–T9 九项主体；后加 T10 桌面例外，现共 12 条）。来源：协调方转达客户决定。
- 2026-10-11：并入客户裁定「**调度权归 pm**」——**T6 / §3.4 归属由编排改为 pm**（机制 `runRole`/`openRoleSession` 留编排、**权力**归 pm），新增 **§3.6「pm 的运行时功能」**（机制 vs 权力之分、pm 决定派发/编排执行、职责边界表、数据接口、是否需新授权）。结论：**T6 无需新授权**（`docs/scheduling/` 已在 pm 边界内，写入器仍 `task_ops`）；`T4→T6` 依赖仍在。来源：协调方转达客户裁定。
- 2026-10-11：并入 Governance 已完成的两项授权（**G-1a/G-1b**，客户批准，见 `docs/change/2026-10-11_change_governance-section1-grants.md`）——装配 `.ans/`(condition `project-init`)、pm `docs/audit/`(condition `shell-gate`)；**T4 写 `.ans/project.json` 须声明 `project-init`、T7 写审计须声明 `shell-gate`**（漏则被条件门拒，Gov 已自证）。派发清单里 G-1a/G-1b 标记为 ✅ 已完成。来源：协调方转达。
- 2026-10-11：**补缝**——指出 T1–T9 无一条建「派发执行」路，取**选项 (B)**：**调度执行路径（S1）不在 V1**（新增 §3.7，含 `DispatchPlan`/`DispatchStage` 确切形状、谁解析/谁执行/二期验收/依赖）。**T6 重定性为「使用约定、非产品代码任务」**（`task_ops` 现成、`docs/scheduling/` 已在 pm 边界内 → 无代码可写）。§4 与 §3.6 同步改为不再读作「V1 已能派发」，并写明 V1 演示到此为止。回答：**T6 位置未变**（`T4→T6` 仍在），但**性质变**（非 dev 任务）。来源：协调方指出缝。
- 2026-10-11：**更正一处与事实不符的理由**——§3.7 原写「pm 用其模型产计划依赖真实模型轮次（本机无 API key、未验证）」，**事实错误**（本机 `.env` 有真实凭据、真实 Pi 会话此前已跑通；「不看 `.env`」是本任务的**操作要求**，非环境事实）。已改为**真实且成立**的理由：主因是**客户授权的三块不含派发引擎**；并如实记**操作约束**——验证需**真实模型轮次**，须**由客户本人运行**（含凭据的 shell 在本环境被拦、不代跑），故 V1 内不列为可自动验收项；其前置为 `ANS_PI_CONTEXT_WINDOW` 现必填、客户 `.env` 未设。§9 同处一并更正。来源：协调方指正。
- 2026-10-11：**T1 落地后裁决 pin 终态规则**——T1 的 `verifyPins` 是 **opt-in**（`acceptance.pin` 存在才校验），与 §3.3 目标「accepted 必须能追到 hash」有落差（漏写 pin 即绕过）。裁决：**`.ans/project.json` 存在时 `accepted:true` 必须带 pin，无 pin → 载入方（装配 T2）置为未接受（fail-closed）**；**登记的非-pin 例外仅两个**——桌面导入运行期同意、CLI 演示内嵌配置；**桌面须「有 `.ans` 优先用」**。取 (ii) 的强化版（不取 (i) 补 pin 与其实时同意模型冲突；(iii) 维持 opt-in 等于承认目标落空）。写入 §3.3「终态规则与例外」、§5.3、T2/T4 规格，并**新增任务 T10（桌面应用）**，派发清单共 12 条。来源：协调方指落差。
- 2026-10-11：**T3 落地后并入两条**——(1) **§3.8 显式记录写入层的隐式第二边界**：写入层 `writeRoot` 恒为 projectRoot（**不在任何 `boundary.yaml` 里**），门禁放行的 **skill 根**写会被写层拒（有意收窄 = 纵深防御）；对「Section 1 是唯一授权来源」的主张**加限定**（授权仍唯一来自 Section 1；writeRoot 是只紧不松的落盘上限）；要求记入 `docs/architecture.md`。(2) **§3.9 裁决桌面 V1 = 只判不写**（`chat-adapter` 未传 `writeRoot` → T3 fail-closed；V1 保持，UI 须明示「只判不写」）；**真实写入列二期 S2**（writeRoot=导入项目根，测试用沙箱）。T10 补「只判不写」提示；§5.1 加「门禁放行 skill 根写、写层仍拒」负例。来源：协调方转达 T3 回报。
- 2026-10-11：**T7 落地后修正 §7 的顺序缺陷与票据缺陷**——**已核实**（`pi-coding-agent/dist/core/agent-session.js` `_beforeToolCall` ↔ `pi-agent-core/dist/agent-loop.js` `beforeToolCall`）：**Pi 的 `on("tool_call")` 早于 `execute`**，故原设计「execute 签发 token、扩展层凭 token 放行」**不可行**；而 T7c 的 `bindShellToken`（`sha256(toolCallId\0command)`）**可由公开输入重算**，扩展层的「token 一致」**证明不了审核发生过**（兜底退化为装饰）。**修正**：审核整条**放在唯一 spawn 点 `execute`**（结构性保证）；扩展层退为**能力级 kill-switch**（非每调用票据）；**删除可重算 token**（`bindShellToken` + `ShellReviewResult.token`）。**Q2 回答**：「未走完审核链就绝不执行」靠**未 arm 不注册** + **唯一 spawn 点在审核之后**两条**同址结构性 fail-closed**，**不靠默认 block**（可用）。新增 **§7.9（env 凭据剥离裁决）**、**§7.10（argv/`shell:false` 对 (c) 规则集前提：元字符规则空转、须按程序+argv 重述）**。同步 §7.1/§7.2/§7.3/§7.5/§7.7/§7.8 与 T7/T8 规格（T8 含删 token）。来源：协调方转达 T7 回报 + T7c 票据问题。
- 2026-10-11：**T10 落地后并入两条**——(1) **§3.9 更正**：核实「只判不写」**只是 demo 路径属性**；桌面 **pi 路径**（`createPiAdapterFactory` → 真实适配器，`writeRoot=projectRoot`）**会真写被导入项目**。裁决：**demo 只判不写、pi 真实写入（受门禁约束，合客户「导入=授权」模型）**；**界面文案与文档按运行时如实**（删「V1 桌面：只判不写」）；`pi` 写入**不是二期**，S2 缩为「demo 路径真实写入」。(2) **§3.10 新增**：`.ans` 载入器**共享化**——搬 `loadEffectiveConfig`/`enforcePinBackedAcceptance` 到 **`src/common/shared/config-loader.ts`**（pm 属主、搬迁非 fork），装配去重导入、桌面接线（有 `.ans` 用 pin、无则回退同意）；记录 `common/shared/` 消费方更新规则 + `shared-components.md`。**新增 T11（pm）/T12（装配）/T13（桌面）**。来源：协调方转达 T10 回报（一处阻塞 + 一处定时炸弹）。
- 2026-10-11：**bootstrap 形态重定（客户推翻固定模板 init）**——客户两条决定：**su 对话式 bootstrap 放桌面**、**`ans init` 废掉**。新增 **§10**：§10.1 **有界创世例外**（空项目上 su 的写权限 = 工具提供的**项目根**治理种子边界 + **操作者发起的 bootstrap** acceptance，**写集/条件双重有界 + 自终止 + 逐路径留痕 ⇒ 非 blanket**）；§10.2 `listProject` 空目录**不抛错**（返回 su + warning）；§10.3 桌面**未-bootstrap 状态 + 左树刷新**；§10.4 **T4 产物去向**（`ans init` 删除、`bootstrap.ts` 改造复用、manifest 触发点改为 su 会话）；§10.5 **保留 `ans govern`** 并与桌面 su 收敛到**同一治理会话引擎**（一个引擎两个前端）；§10.6 本轮只出方案（等 T8b/桌面对话框收工）。**§2.4/§3.2/§5.2 标推翻**。**T4 作废（并入 T16）**；**新增 T14（门禁引擎 listProject）/T15（门禁引擎 冷启动边界）/T16（编排 su 写路径+废 init+统一入口）/T17（桌面 未-bootstrap+刷新）/T18（测试 作废 init 断言+su-bootstrap 集成）**。派发清单共 **20 条**（G-1a/G-1b + T1–T18；T4 作废）。来源：协调方转达客户定调。
- 2026-10-11：**客户追加定调并入 §10**——**su 为默认入口与主路径**、**其他角色降为次级**（**收窄，非推翻**：保留可聊，供查看/调试）；**角色完成后结果交回 su**。设计：**§10.7**（左树 su 置顶 + **默认选中** + 主 CTA；`listProject` 加 **`primaryRoleId`**，**渲染侧不硬编码 `"su"`**）、**§10.8**（**`TaskHandback`** = `{roleId,taskId?,status,summary,evidence,at}`；**只搬证据不搬身份/写权**，合 SKILL.md；**V1 = 事件 + 界面呈现**（回交卡片 + 镜像进 su），**自动多角色派发-回收 = S1**）。并入 **T14**（加 `primaryRoleId`）、**T16**（加 `TaskHandback` 事件）、**T17**（加 su 主位 + 回交呈现/镜像）。来源：协调方转达客户（澄清后）定调。
- 2026-10-11：**客户确认「桌面 shell 闸 V1 不 arm」**——记入 **§8-6**：桌面 T8b 刻意不接线（`DESKTOP_SHELL_GATE_ARMED=false`；`main.ts` 接触表现层但不构造/不注入对话框通道），客户拍定**不 arm**。含义：V1 桌面**不提供 shell**（角色不能在导入项目跑命令）；**对话框通道已建但未消费**（如实标注）；**是客户确认的 V1 范围、非欠账**，**无需实现改动**。**新增 T19（桌面应用）**：changelog 由「待客户拍板」改「客户已确认：V1 不 arm」+ 标注通道未消费（**派给桌面应用，不代改**）。派发清单共 **21 条**（G-1a/G-1b + T1–T19；T4 作废）。来源：协调方转达客户确认。
- 2026-10-11：**全仓盘点 §6 逼出的跨角色镜像并裁决收敛（新增 §3.11）**——导出名扫描 + 语义镜像注释得 **6 处**：① operator 三型（编排↔桌面）② `PI_CREDENTIAL_ENV_VARS`（装配↔Pi适配器）③ `RuntimeKind`（3 处）④ `resolveSkillRoot` ⑤ `toPosix` ⑥ **路径规范化语义镜像**（Pi适配器 `fs-write.ts` ↔ 门禁引擎 `paths.ts`）。**裁决**：① 挪 **`src/provider/pi/session.ts`**（冻结契约家）；②–⑥ 收敛到 **`src/common/shared/`**；**⑥ 安全相关、高优先**（gate↔写层须同源）。**新增 T20–T25**（Pi适配器/编排/桌面/pm/装配/门禁引擎）。依赖 `T23→{T20,T22,T24,T25}`、`T20→T21`。派发清单共 **27 条**。来源：协调方转达两笔被迫重复 + 我方全仓盘点。
- 2026-10-11：**§3.11 追加行 7（`normalizeArgv`）**——桌面 T22 自查报出（**非导出函数**，故上轮导出名扫描漏掉）：编排 `shell-gate.ts` ↔ 桌面 `operator-channel.ts` 同形；风险＝**审计记录 argv ↔ 操作者所见 argv 须同源**。**裁决：收敛 `src/common/shared/`**；派人 **T23 建 / T21 编排删 / T22 桌面删**；**行为逐字不变 + 全量 448/448 + typecheck 零错**。**另对全仓「全部声明」重名复核**：跨角色语义镜像**仅此一处**；`errText`/`reasonOf` **裁决不合并**（1 行同义反复，**登记为有意保留**）、`resolveRuntime`（同名不同义）、`renderSystemPrompt`（同角色）、`HERE`/`USAGE`（偶合）**显式排除**。**这是最后一处**。来源：协调方转达桌面自查 + 复扫。
- 2026-10-11：**客户新增跨角色需求：桌面 Pi 配置界面 → 保存 `.env`**，新增 **§11**。**前提（关键）**：**桌面 pi 路径今天不可达**——`package.json` 的 `"app"` **无 `--env-file`**（Electron 进程无 `ANS_PI_*`/token）+ **桌面无通道**把配置交给适配器；**本需求是让桌面 pi 可用的前提**。**设计**：§11.1 **红线改写**（`provider-config.ts` 原「绝不把凭据写入任何文件」→「**可写指定的本地 `.env`（gitignore）；绝不写入库文件、绝不回显**」；原措辞标注取代；归 **T27**）；§11.2 **来源与落点**——**仓库根 `.env`**（与 CLI `--env-file` 同文件），界面纳入 `ANTHROPIC_AUTH_TOKEN`(掩码) + `ANS_PI_BASE_URL/MODEL/PROVIDER/CONTEXT_WINDOW`；**正当形式**：`.env` 仍归**装配**、**指定写入者 = 共享 `env-file` 模块（pm）**（同 `docs/scheduling/` 模式）→ **G-2（Governance 记录，须客户确认）**；§11.3 **到达适配器**——**不扩 `createPiAdapterFactory` 签名**，桌面经 shared 把 `.env` **载入 `process.env`**，`resolvePiProviderConfig` **原样复用（单一来源）**，保存后重载；§11.4 **写入纪律**（只改相关键/保留注释未知键、token 掩码不回显、temp+rename 原子、失败显式）；§11.5 与 runtime 选择器关系。**任务**：**G-2** + **T26（pm：shared `env-file`）/T27（Pi适配器：红线）/T28（桌面：面板+载入保存）/T29（测试）**；装配无改动。派发清单共 **32 条**（G-1a/G-1b/G-2 + T1–T29；T4 作废）。来源：协调方转达客户需求。
- 2026-10-11：**真实端到端 bootstrap 缺口修正 + 客户「不预建」决定（新增 §12）**——三处缺口（**su 无 scope 写不了** / **桌面没设 `genesisBootstrap`** / **无路径指向空文件夹**）；**核心裁决**＝把创世门口放**边界选择层**（`genesisBootstrap` + **种子边界改普通目录** + `scope:undefined`；`hasRoles` 自动切回；仍**非 blanket**），**不用「创世 scope」**（F4 精确集合无法表达未来角色名）；**`ans govern` 接受目标目录**；**退役 `SCAFFOLD_ROLES`/`writeGovernanceSkeleton`**、**种子边界迁入门禁引擎**（顺带**修复 `boundary-core` §6 违规导入**）；创世 pin/留痕＝su settle 后 finalize（取舍交客户）；**验收方法更正**（按**用户入口**验，非按层验）；确定性 vs 模型依赖分列（后者**客户跑**）。**新增 T30–T35**；T15/T16 相应部分并入 T31/T32。派发清单共 **38 条**（G-1a/G-1b/G-2 + T1–T35；T4 作废）。来源：协调方转达核实缺口 + 客户决定。
- 2026-10-11：**bootstrap 完成方式重定（客户；新增 §13，推翻 §12.5）**——客户：**「完成 bootstrap 应该是 su 主动觉得差不多了来完成；后面 su 可以动态增加和修改」** + **「当然需要客户确认了」**。**正确形态＝中间层**：**su 提议收口 → 界面摆给客户 → 客户确认 → 才 finalize**。设计：§13.1 **su 主动＝`finalize_bootstrap` 工具**（语义=**挂起提议、等确认**，非立即完成；**复用 shell 闸 `OperatorChannel`、不造第二套**；**仅创世态注册**（同 run_shell「注入才注册」先例）、非创世态**显式拒绝**；**同样过门禁**）；§13.2 **自终止松绑**：finalize 后 su 边界＝**项目治理边界文档 `角色卡/governance-boundary.yaml`**，条目＝**三普通目录**（`角色卡/`/`docs/`/`.ans/`，**无 src/、非任意文件 ⇒ 非 blanket**）；§13.3 **pin 时机**：**首次在确认通过时**（此前不写 `.ans`，否则确认失去意义）、**其后每轮 settle 自动刷新**（**加角色不过时**）；「半成品」概念**不再成立**（完成=语义里程碑，非「此后不再变」承诺）；§13.4 **用户按钮不删、改造**为「su 提议的确认面」（仅 su 提议时激活，**提议在聊天流可见**）；与「聊天无确认弹窗」**不对立**（后者针对普通消息）。§8-6 的 (a) presenter **现由 finalize 确认消费**（不再「未消费」）。**新增 T36（Pi适配器 工具）/T37（编排 finalize 改造）/T38（桌面 确认面）/T39（测试）**。派发清单共 **42 条**（G-1a/G-1b/G-2 + T1–T39；T4 作废）。来源：协调方转达客户裁定 + 补充。
- 2026-10-11：**shell 闸 (c) 判定重定（客户；新增 §14，部分推翻 §7.3「危险即硬拒终结」）**——客户：**危险命令（`rm`/`sh -c`）不再一概终结**，「先过 (b) pm 审读，**无论 pm 怎么判都还要过 (a) 你本人**」=**pm 非终审**；理由：`rm` 有正当用途（删自建临时文件），一概硬拒=「过宽则天天误杀」，同时保留「模型不能单独放行」。**设计**：§14.1 `ShellClass` **增第四档 `"risky"`**（新枚举值，非 `review`+flag——次序/终结显式可测）；§14.2 **次序与终结写死**（`allow` 放行不扰人、`deny` 终结不扰人、`review` b 明确即终结否则 (a)、**`risky` 必过 (a)：b allow 仍过 a / b deny 终结 / b 拿不准→(a) / (a) 拒超时不可用→拒**）；§14.3 **硬拒名单重划**（原则「只拒无正当用途或放行即绕过门禁的」）——**仍硬拒**：re-shell/内联求值（`sh -c`/`eval`/`node -e`/`awk`）、提权（`sudo`…）、系统破坏（`mkfs`/`shutdown`…）、Windows LOLBin；**改 risky**：`rm`/`sed -i`/`dd`/编辑器/进程/网络/**间接执行器（程序在 argv 可见）**/构建/包管理/`git` 写子命令；**无意元字符**（§7.10 仍成立）。§14.4 **`sh -c` 的洞**：`sh -c "…"` 的 `sh` 自行解释 string ⇒ **其写入在子进程内、不经 `resolveWrite`** ⇒ 放行即**整体绕过门禁** ⇒ **re-shell/内联求值仍硬拒**（只把「程序名在 argv 可见」的危险命令改 risky，因 (a) 人能在原文看懂）；若客户坚持 `sh -c`→risky，须**如实登记「写边界不由门禁强制、(a) 即唯一边界」+ 审计 `effects-not-gated`**。§14.5 **arm**：桌面不 arm + **CLI 从未注入 `ShellGate`** ⇒ **今天模型在任何地方都不能跑 shell**（改动空转）；**建议 V1 取「不 arm、如实登记未接线」**，**CLI arm 为可选**（用既有 (a) 终端 y/n）。§14.6 与「桌面不 arm」**不矛盾**（装不装 vs 装了怎么判）。**新增 T40（门禁引擎）/T41（编排 次序）/T42（arm or 登记）/T43（测试）**。派发清单共 **46 条**（G-1a/G-1b/G-2 + T1–T43；T4 作废）。来源：协调方转达客户裁定。
