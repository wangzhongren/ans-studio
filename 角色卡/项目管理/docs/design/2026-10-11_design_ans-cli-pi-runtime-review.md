---
id: ans-cli-pi-runtime-review
type: design
title: 评审：ANS CLI 用 Pi 作执行层的设计方案
created: "2026-10-11"
updated: "2026-10-11"
timezone: Asia/Shanghai
status: designed
related: [ans-cli-pi-runtime]
events:
  - date: "2026-10-11"
    kind: created
    summary: 完成对设计文档 2026-10-11_design_ans-cli-pi-runtime.md 的实质性评审，唯一结论 needs revision
---

# 评审记录：ANS CLI —— 用 Pi 作执行层的受治理开发命令行

> 被评审对象：`D:\work\code-work\ans-skill\doc\design\2026-10-11_design_ans-cli-pi-runtime.md`（状态：待客户确认）
> 评审角色：项目管理。评审依据：`ans-governed-construction` 技能 `references/proposal-review.md`。
> 本记录只写评审结论与修订请求，不复制原设计正文。

## 唯一结论

**needs revision（需要修订）**

方向成立、值得继续，但**尚不能作为实施依据**。在进入实施授权前，须先做两件事：一是把该方案核心论证所依赖的前提**实测**（V1 尤其关键）；二是修订 §6 的共享接口（`BoundaryEntry` / `resolveWrite` / `accepted` 语义）。另有一项前提级规则改动（§2.6）必须走 ANS Governance 单独流程，本设计不能自行假定其已生效。

不判为 `not ready`：该方案没有证据显示前提不成立——§5.1 的论证只是**尚未验证**，而非已被推翻；方案自身也已如实把 V1/V3/V4 标为"待验证"。因此应返回修订，而不是搁置。

## 总体判断

好的部分：把治理做成**构造**而非事后**拦截**（自己注册受治理工具，让未受治理工具直接不存在），并用**进程边界**把"一个上下文一个角色"从提示词纪律变成机制约束——这两个判断与技能的不变量一致，是正确的方向。§4.5 对"拒绝信息要说清允许路径"的强调，切中可用性要害。

需要修订的部分：三条主线——(A) 核心论证依赖未实测前提；(B) §6 共享接口有具体缺陷；(C) 数处责任归属/文件归属与已验收边界或技能规则冲突。

## 发现

编号稳定，供原方案逐条回应。每条给出依据与影响。

**F1｜核心论证依赖未实测前提（前提级）**  
§5.1「构造优于拦截」的整段论证建立在使用 `noTools`/`excludeTools` 让内置工具**不存在**之上，而这又依赖 §7 的 V1（禁用内置工具后能否注册**同名**的 `write` 覆盖它）。V3（`run_shell` 给不给）同样前提级：若 `run_shell` 必须保留，则"没有那道门，就不需要守门"不成立，路径校验必须能看住 `bash -c 'echo > f'`，整个安全性论证回落到"拦截"，与 §5.1 的结论相反。设计自述这两条"只读过文档和源码文档，没有实际运行过"。→ 论证尚未建立，不能作为已证实前提。**建议先跑 V1、V4（V4 是第二层兜底的存在理由），据结果定调；V3 的取舍单独决策。**

**F2｜§2.6「pm 创建角色」是对 SKILL.md 的未确认改动，且与不变量冲突（前提级）**  
SKILL.md 现行规则是"Project roles … are created by ANS Governance""A role never creates itself""No blanket source/common root or overlapping ownership is allowed"。若 pm 能创建任意角色空间，等于给 pm 一份无枚举的 `角色卡/` 写权限，正好破坏最后这条不变量。设计自己也把"权限已存在"列为未满足前提。→ 这是 §9 开发计划的前置 gate。**必须由 ANS Governance 改 SKILL.md、给 pm 新的 boundary.md Section 1、并经客户确认后，才能按"pm 创建"描述流程。**设计若下放，须同时给出受约束的落法（§2.6 候选 1 枚举子树 / 候选 2 角色空间新边界类型）。

**F3｜CLI 不应直接写 `docs/scheduling/<task-id>.md`**  
§3 与 §4.1 让 CLI（编排层）直接写该记录。但据 `references/task-operations.md`：该文件由 `task_ops`（`coordination_store.py`）维护，是"可读的计划与步骤表 + 有序、hash 链式的机器事件段"，"程序在任何操作前校验事件顺序、hash 与渲染出的人类段"，手工编辑会使机器段失效并**阻断新工作**。CLI 直接写会绕过 task_ops 的校验、锁与恢复，产生一份 task_ops 无法验证的记录。→ 应改为**经 task_ops 写入**（项目管理持有 `coordinatorToken`），或明确 CLI 与 task_ops 的分工与唯一写入者。

**F4｜`resolveWrite` 未纳入 plan/task 的 writeSet 收窄**  
§6 的 `resolveWrite(targetPath, boundary, ctx)` 只比对角色边界。但据 `references/task-operations.md`："A plan's write set can only narrow that role scope … directory ownership does not widen a running assignment."角色边界是**上界**，具体任务的 `writeSet` 是其**子集**。当前接口会放行"在角色边界内、但不在本任务 writeSet 内"的写入。→ 接口需增加任务级收窄输入（任务 writeSet），否则同一角色在不同任务下的最小权限约束失效。

**F5｜`BoundaryEntry` 无法表达内置边界里的 Conditional directory 条目**  
§2.2 的 `BoundaryEntry` 只有 `type: "file" | "directory"`。而 `references/built-in-boundary.md` 的 Section 1 含 4 条 **Conditional directory**（`references/`、`docs/`、`角色卡/<role>/`、装配入口），`references/module-boundary.md` 定义其语义为"仅当任务明确要求创建或重构角色时适用"。当前类型丢失条件语义，会把它解析成**无条件目录授权**，等于越权。→ `BoundaryEntry` 必须能表达条件性，或引入与 Section 1 语义一致的模型。

**F6｜`BoundarySection1.accepted` 的来源未定义**  
§6 用 `accepted: boolean`，§4.4 据此"未确认的边界不得用于启动"。但设计没说 `accepted` 由谁判定、依据什么。技能规则明确不得**自述**客户已确认；task_ops 用的是"客户审核过的配置 + SHA-256 pin"。若 `accepted` 由解析方自行赋值，等于**自授权**。→ 须把 `accepted` 与客户审核的配置 pin / 治理接受证据挂钩，明确其证据来源，不能由程序自填。

**F7｜`resolveWrite` 测试清单缺符号链接/junction 逃逸**  
§6 列出要覆盖"目录授权、精确文件授权、路径穿越（`../`）、大小写、Windows 反斜杠、两根混淆"，未列**符号链接 / junction 逃逸**——Windows 上 junction 常见，文件系统层面仍可经链接写到白名单外。构造模型下工具由我们注册，但若工具集允许创建链接，此路径必须验证。→ 测试清单需补该情形，并交测试角色做回归。

**F8｜项目角色路径被硬编码为 `角色卡/<角色>/`**  
§2.1 把角色卡/边界位置写成固定路径。但技能与 `references/task-operations.md` 都表明：角色目录根名**随项目语言**（中文项目 `角色卡/`，英文 `role-cards/`），且配置里"names each execution role, its **card and boundary paths**"——card/boundary 本身是**配置项**。→ 路径不能硬编码，应由配置提供。

**F9｜§3 的运行时分层与本项目已验收的角色分工不一致**  
§3 把"角色解析（双来源）与 boundary 解析"放进 CLI 编排层。本项目**已验收边界**把它拆开：双来源角色解析与边界解析归**门禁引擎**（Service），Pi 调用归 **Pi 适配器**（Provider），编排只做命令解析与会话生命周期。两者不是一一对应。→ 以已验收边界为准；设计应更新映射，或说明 §3 是 runtime-agnostic 的抽象层并补一张到本项目角色的对应表。

**F10｜拒绝信息里 `allowedPaths` 未区分两个根（次要）**  
§6 `WriteDecision` 的 `allowed: false` 带 `allowedPaths: string[]`。因白名单带 `Root = "skill" | "project"`，跨根时"本角色允许的路径"若混在一起会有歧义（技能根 vs 项目根）。§4.5 的可用性论证依赖精确的允许路径提示。→ 建议 `allowedPaths` 分组或带根。

## 受影响角色

| 角色 | 受影响发现 | 需要它做什么（评审阶段：只读评估；实施阶段：各自修自己文件） |
| --- | --- | --- |
| 门禁引擎 | F4, F5, F6, F7, F8, F9, F10 | §6 的共享类型与 `resolveWrite` 是本次修订核心；它是 `src/model/` 主属主，接口一改，引用方证据失效 |
| Pi适配器 | F1, F9 | V1/V3/V4 三条前提全在它身上；同名工具覆盖与 `tool_call` fail-closed 需实测 |
| 编排 | F3, F8, F9 | 会话编排涉及调度记录归属与角色路径配置来源；分层对应需调整 |
| 装配 | F1, F9 | 构建/依赖配置与启动检查依赖 V3 结论；分层接线需知道最终接口 |
| 测试 | F7 | 符号链接/junction 逃逸的回归用例 |
| 项目管理 | F2, F3, F11 | 持有调度权与 `docs/scheduling/` 属主；§2.6 的越权风险由它守住 |
| ANS Governance（内置 su）| F2 | SKILL.md 规则改动与 pm 边界更新，须其单独处理并经客户确认 |

**过程说明**：以上为项目管理基于技能规则与已验收边界的**实质性评审意见**，非各角色在各自独立上下文出具的评估。按 `references/proposal-review.md` 第 3 步，涉及其他角色接口/行为的，应在实现前取得其独立角色上下文中的评估；本项目当前无自动调度，故记录为待办，不代其表态。

## 未解决问题 / 需要客户决定

1. **§2.6 创建权是否下放？** 若下放，选候选 1（一次性授权 `角色卡/` 枚举子树）还是候选 2（引入"角色空间"新边界类型）？两条都需改 SKILL.md + 给 pm 新 Section 1 + 客户确认。
2. **是否先跑 V1/V3/V4 再定 §5.1？** V1/V4 决定"构造"论证成不成立；V3（`run_shell`）若必须给，是否接受"构造 + 拦截双轨"，还是转入容器优先？
3. **`governanceBoundary` 键能否加入 `.ans/project.json`？** 现有 task_ops 配置 schema（v1）未列该键；新增键可能被忽略或影响 pin。此配置由技能侧 task_ops 校验，其属主不在本项目角色内。
4. **本项目 `.ans/project.json` 由谁、何时建立？** 目前此项目根下**只有 `角色卡/`**，无 `.ans/`、无 `package.json`、无 `.ts` 源码。
5. **修订请求交谁？** 原设计文档位于技能仓库 `doc/design/`，其属主不在本项目已验收角色内。本项目角色只在自己边界内工作，不代改该文档。

## 结论

**needs revision。** 修订清单：F1（先跑 V1/V4，据结果定调论证）、F4/F5/F6（修订 §6 共享接口：任务级 writeSet 收窄、Conditional 目录语义、`accepted` 证据来源）、F3（调度记录唯一写入者）、F7（补符号链接逃逸）、F8（角色路径改为配置项）、F9/F10（分层映射与允许路径分组）。F2 单独走 ANS Governance 流程。修订后重新评审实际版本，再向客户提交审批摘要。
