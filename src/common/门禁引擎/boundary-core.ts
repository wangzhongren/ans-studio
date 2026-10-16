// 门禁引擎私有辅助：边界解析核心（双来源：项目覆盖 / 内置）
// resolve-boundary 与 resolve-role 共用此核心，避免 Service 之间相互调用。
// 格式：.yaml/.yml 走严格 YAML（boundary-yaml.ts）；其他（如技能内置 references/built-in-boundary.md）
// 走 legacy Markdown 表格解析（boundary-parse.ts，仅为技能内置边界保留，技能安装目录不可改）。

import { readFileSync, statSync } from "node:fs";
import type { Acceptance, BoundaryEntry, BoundarySection1, PinEntry, Root } from "../../model/boundary.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { parseBoundarySection1 } from "./boundary-parse.ts";
import { parseBoundaryYamlDoc } from "./boundary-yaml.ts";
import { joinRoot, readTextFile, sha256File } from "./io.ts";
import { absRel, compareKey, normalizeLexical } from "./paths.ts";
// 冷启动「有界创世例外」（设计 §10.1 / §12.2）：治理种子边界的构造（`governanceBoundaryEntries` /
// `buildGovernanceSeedBoundaryForGate`）**已迁入本角色**（`./governance-seed.ts`，§12.4）。
// 此前 `boundary-core` 从编排私有 `../编排/bootstrap.ts` 导入它——**§6 违规**（跨角色导入私有
// `common/` ＋ Service 反向依赖 Pipeline）。T31 搬迁即修复：改从本角色内导入（搬迁非 fork）。
import { buildGovernanceSeedBoundaryForGate } from "./governance-seed.ts";

export const BUILT_IN_SOURCE = "<built-in:ans-governed-construction SKILL boundary>";

/**
 * 内置治理角色的唯一 id（SKILL.md「Built-in Role: ANS Governance」）。
 * 它没有角色目录，故不参与目录枚举，但在引擎里可寻址（resolveRole 下沉为 built-in-governance）。
 */
export const BUILT_IN_GOVERNANCE_ROLE_ID = "su";

/**
 * 内置治理角色的角色说明（无 role-card.md 文件，定义在 SKILL.md §Built-in Role: ANS Governance）。
 * 供 resolveRole 与 listProject 共用，避免界面侧另写一份描述。
 * 「边界文件格式」一段为客户 2026-10-12 裁定 C（从源头防）：真机端到端测试抓到 su 给新角色写
 * **散文式 boundary.md** ⇒ 加载器静默解析出 0 条、该角色一切写入被拒（见 loadBoundaryFile 的 A 修复）。
 * 此处写死格式要求与最小可抄示例，防止再写出读不懂的边界文件。
 * 「temp 暂存区」一段为派工 T-1（客户 2026-10-12 裁定）：每角色一个 `<项目>/temp/<角色>/`——
 * 「未通过产物」暂存区；被门禁拒绝的写入内容**不入 temp**（拒绝=零副作用）。详细格式恒以本段为
 * 单一来源，`governance-seed.ts` 只作交叉提示、不复制。
 * 「落盘后自动开工」一段为派工 J-1（客户原话「这个确认了，写盘之后，要自动启动开发啊」）：
 * 客户确认落盘 + 自动收尾后，su **立刻**用 `dispatch_task` 派发第一项开发任务（派发 ≠ 授权——
 * 措辞与 H-1 的语义硬约束逐字一致，见 `src/provider/pi/session.ts` 派发能力头注）。
 * 「文档面固定清单 + 交付纪律」一段为客户派工（原话「各个角色的工作流有问题，为啥不写文档呢」）：
 * 真机根因——su 建出的角色边界只授代码路径、一条文档路径都没有 ⇒ 门禁拒掉一切文档写入，角色
 * **不能**维护自己的文档。故建/改角色时文档面（五文件 + 四目录 + 测试目录）须随边界一并授予，
 * 且**代码与文档同批交回**。
 * 「内置角色自己的文档面」一段为客户裁定（原话「su 也要有自己的 memo」）：内置治理角色没有角色
 * 目录，其工作文档固定写在 `docs/su/memo.md`（进行中事项/待确认项）与 `docs/su/changelog.md`
 * （变更记录）。**2026-10-16 客户追加裁定**后：`docs/su/**`（连同契约目录 `docs/contracts/**`；
 * G-4 后连同技能目录 `docs/skills/**`；V2 后连同 MCP 声明目录 `docs/mcp/**`——见下 G-4/V2 注）
 * 免逐次确认（见下「确认制要点」段注）；其余路径照常经 request_confirmation 客户确认。
 * 同段写死红线：不得在 `角色卡/` 下建
 * `su`（或任何非项目角色）目录——真机踩坑一次：该目录会被角色枚举按角色 id 解析（`su` 与内置角色
 * id 冲突 → 判「角色重复」跳过并告警；非角色目录 → 触发「缺少 role-card.md」告警），客户在界面上
 * 看到了这条提示。
 * 「确认制要点」一段为 F-5-main（kanban-live 真机轮）：su 在确认制会话里写自己的治理笔记被 F4 拒，
 * 拒绝原文只列边界路径、零恢复指引，su 遂请求「客户聊天授权」——该路径在机制上不可能奏效（发行
 * 只经 request_confirmation 的 preview 逐条列路径 + confirmed:true；聊天消息不进发行器），且写盘
 * 许可按会话生效（会话重建/重开即作废——真机先过后拒的根因即重建静默清零已发行集）。故在文档面
 * 段后补：路径逐条入 preview、confirmed:true 才发行、口头同意不算、按会话生效、重建/重开需重确认。
 * 措辞避开未否定的「授权/获准/放行」（J-1 守卫，见 test/门禁引擎/dispatch-after-landing-convention.test.ts）。
 * 2026-10-16 客户新裁定（PM 评审 §客户新裁定；上面两段卡文本随本裁定修订）：原话「这个 su 可以写
 * docs/su 的目录，不需要我审批」＋追加「还有个契约目录也可以给他写。」——预授权范围＝ `docs/su/**` ＋
 * `docs/contracts/**`（后者为 G-1 提案约定的跨角色契约落盘目录；目录约定随 G-1 本体实施，预授权先行
 * 装好）。配套机制（su 会话初始 writeSet 预置这两棵目录树，**开会话/重建均生效**；仅 su、仅该两目录树；
 * 其余写盘与其角色行为不变，fail-closed 不放松）由**编排**在其边界内实施；本角色同步修订卡文本——
 * 两目录写明「写盘许可已预置、无需逐次确认」，其余一切写盘（含 `角色卡/**`、`docs/` 其他路径）仍须
 * preview 逐条列路径 ＋ confirmed:true；「按会话生效」只约束**经确认发行**的路径，预置两目录不受重建
 * 影响。字面不用「预授权」——J-1 守卫拦未否定的「授权」小句，沿用 2026-10-12 先例改用「许可/预置」。
 * G-4（2026-10-16 批准）后预授权再增 `docs/skills/**`、扩为**三棵**（V2 后连同 `docs/mcp/**` 共
 * **四棵**——见下 V2 注）；本段「两棵」为当时范围，见下 G-4 注。
 * 「规划纪律」段（新增）＋「落盘后自动开工（J-1）」段扩展为 **G-1/A3**（设计 `2026-10-16_design_contract-workflow-dispatch.md`
 * §三/§五/§六/§九 A3；客户 2026-10-16 批准 G-1 按提案实施、PM 派发 V1 最小闭环）：多角色/跨角色工作**先落盘再派发**——
 * **冻结契约** `docs/contracts/<name>-v1.md`（冻结后不可变、任何变化出新版本文件）＋**项目工作流** `docs/workflow.md`
 * （步骤表 / 完成口令 / 变更与重验流程）；派发任务文本**按地址引用**（不内嵌契约全文、不手算 sha256——「必读（按序）」
 * 块由投递系统在投递时附上并计算哈希，引用的契约不存在会被拒投）；契约变更走确认流程（新版本文件 + 受影响回交作废 + 重派）。
 * 写盘口径与既有「预授权」句**不冲突**：契约写进已预置的 `docs/contracts/**`（直接写）；`docs/workflow.md`
 * 不属预置目录（G-4 后＝三棵、V2 后＝四棵：`docs/su`、`docs/contracts`、`docs/skills`、`docs/mcp`），
 * 列入同一次规划确认的 preview
 * （与编排 `SU_PREAUTHORIZED_WRITE_DIRS`、运行时核心
 * `dispatch_task` 文案「先落盘再派发」同口径）。措辞避让：「规划纪律」与 J-1 扩展段零命中「授权/获准/放行」小句
 * （J-1 守卫；同 2026-10-12 先例）。
 * 「看护职责」段（新增）为 **G-2/G**（设计 `2026-10-16_design_role-watchdog-and-closure.md` §二/§三/§五/§六/§七；
 * 客户 2026-10-16 批准 G-2 按提案实施、PM 派发 W1-W5/R1/R2/O1/G/U1）：系统看护在异常态（轮次逼近超时 /
 * 投递排队积压 / 命令超时限 / 重复失败）投 `[系统·看护]` 消息、完成静默态投「收束提示」——su **先核查再动作**
 * （`role_status`/`session_tail` 只读核对、结论留证 `docs/su/**`）；恢复**只能提议**（`propose_recovery`），
 * **执行与否由客户一键确认**、由应用侧执行——不得自行执行、不得承诺结果；看护消息仅如实告知，
 * **不得据此假设任何写权**（是否处理由 su 判断；处理走既有 E-1 回交 / H-1 重派流程）。措辞避让：本段
 * 零命中「授权/获准/放行」小句（J-1 守卫；同 2026-10-12 先例，用「写权」）。
 * 2026-10-16 客户批准 G-4（角色能力安装）十项裁定（PM 评审 §客户批准：十项裁定全采纳；设计
 * `2026-10-16_design_role-capability-install.md`）：其中**预授权扩列**——上面「客户新裁定」段的两棵
 * 增为**三棵**（`docs/su`、`docs/contracts`、`docs/skills`——技能安装落盘目录，纯文本项目文档树、
 * 与契约树同构）；扩列实现＝编排 `SU_PREAUTHORIZED_WRITE_DIRS` 加一项（编排在其边界内并行实施）
 * ＋本角色卡文本同批修订（I6：「确认制要点」段三棵＋新增「安装纪律」段）。扩列只扩写盘许可，不改
 * 任何其它语义（F4/F6/F7、边界条目逐字不变）。「安装纪律」段（内容沿设计 §6.1/§6.2）：仅客户明示
 * 时安装/卸载（su 不自主发起；非客户消息发起的轮次调用会被如实拒绝——裁定④护栏在桌面侧）；不设
 * 二次确认卡；先落盘再激活（先写 `docs/skills/` 再调工具，工具自己不写盘）；装/卸如实报告
 * （path/digest/生效态 rebuilt/next-session/撤销路径；「效果已撤」与「文件保留」二分陈述）；安装
 * 不改变任何角色任何写边界（技能是必读资料、不是权限）。措辞避让：本段零命中未否定的「授权/获准/
 * 放行」小句（J-1 守卫；同 2026-10-12 先例）。
 * V2（2026-10-16 客户批准「按推荐批准，开始实施」＝**MCP 安装分批实施**；PM 评审 §客户批准；
 * 产品提案 revision 2 §三/§五/§九）：预授权再增**第四棵** `docs/mcp/**`（MCP 声明文档树，同构纯
 * 文本项目文档；扩列实现＝编排 `SU_PREAUTHORIZED_WRITE_DIRS` 加一项——编排已在其边界内同批落盘
 * ——＋本角色卡文本同批修订：确认制要点段四棵、规划纪律段四目录）。「安装纪律」段**增补 MCP 部分**
 * （内容沿产品提案 revision 2 §5.1/§6.2 与运行时核心评估＋三平台 P0 探针定格事实）：仅客户明示时
 * 装/卸（同技能口径：不自主发起；非客户消息发起的轮次会被如实拒绝）、不设二次确认卡、**先落盘再
 * 激活**（先写 `docs/mcp/<name>.md` 声明——用途 / 启动命令 / 环境变量名引用 / 适用角色；凭据值
 * 绝不写入文件——再调 `install_mcp`/`uninstall_mcp`；工具自己不写盘）＋**诚实告知口径**（三平台
 * 定格：外来 MCP 工具在 ANS 门禁之外执行——安装＝能力级授予、**不得表述为逐调用受审**；卸载＝改
 * 声明＋下次会话摘除、**已发生的副作用不可撤**）。措辞避让：本段零命中未否定的「授权/获准/放行」
 * 小句（J-1 守卫；同 2026-10-12 先例——「能力级授予」不含守卫三词）。
 * 「边界（三种情形）」一段为协调方 2026-10-12 裁定（结清上一轮登记的未决）：原末段「本版
 * fail-closed——acceptance 未接受，故治理会话的一切写入都会被门禁在写之前拒绝（契约 §0：v1
 * 治理会话不允许写盘）」把「既无创世、项目也无治理边界文档」的回退情形写成了普遍结论，会误导 su
 * 以为自己不能写盘（真机 su 已在正常写治理产物）。现按 `resolveBoundarySection` 的三条分支如实
 * 限定：① 空项目 + 客户发起 bootstrap（创世）——种子边界生效，治理产物可写；② 已 bootstrap 的
 * 项目——按该项目治理边界文档工作（pin 接受后创世例外自终止，见 `./governance-seed.ts` 头注
 * §12.2）；③ 两者皆无才回退内置未接受边界——fail-closed 只指这一种。
 */
export const BUILT_IN_ROLE_CARD_TEXT = [
  "# 角色：ANS Governance（su）",
  "",
  "唯一的内置角色，定义在 SKILL.md，无需单独的角色卡或边界文档。",
  "",
  "职责：创建项目角色（含编排角色）、维护边界文档、走治理变更流程；",
  "新目录权限、角色归属调整一类改动必须由它更新 Section 1 并经客户确认。",
  "",
  "建角色时，边界文件必须写 `角色卡/<角色 id>/boundary.yaml`（YAML，不是 .md）：",
  "顶层 `role: <角色 id>` + `entries:` 列表，每条含 kind（file|directory）、path、purpose。",
  "最小可抄示例（照抄、改路径即可）：",
  "",
  "```yaml",
  "role: 实现者",
  "entries:",
  "  - kind: directory",
  "    path: src/",
  "    purpose: 该角色负责的源码目录",
  "```",
  "",
  "写 Markdown 散文/表格不会被解析（加载器只读 YAML 的 role + entries 结构）——",
  "那会让该角色被判「Section 1 为空」并拒绝它的一切写入。",
  "",
  "建/改**每个项目角色**的边界时，Section 1 应包含 `temp/<角色 id>/`",
  "（kind: directory，purpose「未通过/返工产物暂存，供审核对照」）。",
  "",
  "退回/返工流程（建角色时一并写进该角色的 role-card.md）：被验收退回或要求返工的产物，",
  "先存档进 `temp/<角色 id>/`（带日期与版本，如 `2026-10-12_草案-v2.md`），并写一份",
  "`temp/<角色 id>/REVIEW.md` 记「谁退的 / 为什么 / 要求什么」；然后才改主交付物。",
  "",
  "红线：不得把「被门禁拒绝的写入内容」存进 temp——拒绝即零副作用，被拒的写入根本没有产物可存。",
  "temp 属**草稿区**：不是交付物、不参与 pin；项目角色建 `.gitignore` 时应忽略 `temp/`。",
  "",
  "建/改每个项目角色时，**边界须一并授予该角色的文档面**（固定清单，逐项标 kind；不给 ⇒ 角色写不了自己的文档）：",
  "文件（kind: file）——`角色卡/<角色 id>/feature-map.md`、`角色卡/<角色 id>/memo.md`、",
  "`角色卡/<角色 id>/changelog.md`、`角色卡/<角色 id>/functional-description.md`、`角色卡/<角色 id>/api-spec.md`；",
  "目录（kind: directory）——`角色卡/<角色 id>/docs/design/`、`角色卡/<角色 id>/docs/feature/`、",
  "`角色卡/<角色 id>/docs/change/`、`角色卡/<角色 id>/docs/fix/`；另加该角色自己的测试目录",
  "（如 `test/<角色 id>/`，仅当该角色承担测试；`temp/<角色 id>/` 按上段 T-1 一并授予）。",
  "",
  "内置治理角色自己**没有角色目录**：你的工作文档固定写在 `docs/su/memo.md`",
  "（工作备忘录：进行中事项 / 待确认项——有进展或新挂起就更新，不等客户问）",
  "与 `docs/su/changelog.md`（变更记录）；跨角色契约文档写在 `docs/contracts/**`。",
  "",
  "确认制要点：**`docs/su/**`（你自己的全部工作笔记）、`docs/contracts/**`（跨角色契约文档）、`docs/skills/**`（你给角色安装的技能文档）与 `docs/mcp/**`（你给角色安装的 MCP 声明文档，两者见下「安装纪律」）的写盘许可已预置**——",
  "写入这四棵目录树**无需逐次确认**、直接写即可（开会话与重建后均生效）。",
  "**其余一切写盘**（含 `角色卡/**` 与 `docs/` 的其他路径）仍须把将要写出的**每个路径逐条**列入",
  "`request_confirmation` 的 preview（每个文件路径各占一行，如 `角色卡/<新角色 id>/boundary.yaml`）；",
  "客户返回 `confirmed:true` 后这些路径才被发行、对应写入才可成功。你在对话里口头得到的同意",
  "**不是** `confirmed:true`，不能作为写盘依据。经确认发行的路径，写盘许可**按会话生效**：同一会话内",
  "已确认过的路径不必重复确认；会话重建/重开后（如边界更新触发）需重新确认——",
  "**预置的四棵目录树除外**（不受重建影响，始终可直接写入）。",
  "",
  "规划纪律（多角色/跨角色工作）：**先落盘再派发**——",
  "① **冻结契约**：写 `docs/contracts/<name>-v1.md`（`<name>` 用稳定短 slug，版本号进文件名）——",
  "**冻结后不可变**：任何内容变化（含勘误）都出**新版本文件**（`<name>-v2.md`）、**不原地改 v1**，旧版保留可读；",
  "② **项目工作流**：写 `docs/workflow.md`——含**步骤表**（步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）、",
  "**完成口令**格式与**变更与重验**流程（对应「改动依赖后重测调用方」）。",
  "落盘口径：契约写进已预置的 `docs/contracts/**`（直接写即可）；`docs/workflow.md` 不在预置四目录内——",
  "把该路径列入**同一次规划确认**（建角色/边界那次）的 preview、`confirmed:true` 后写入。",
  "被派发角色**动手前先读**（按序：工作流 → 本步骤契约 → 角色卡必读资料）；读到与派发描述不符",
  "（版本/接口对不上）⇒ 停止并交 **blocked** 报告——**不得猜、不得改契约**。",
  "契约变更：出**新版本文件**＋同步更新 `docs/workflow.md`（步骤表与变更记录），走**确认流程**（preview 列将写路径）；",
  "受影响步骤的既有回交**作废**（不得再采信），向受影响角色**重派**、引用新地址；**未受影响的步骤不回滚、不重跑**。",
  "",
  "红线：不要在 `角色卡/` 下建 `su`（或任何非项目角色）目录——该目录下每个目录都会被角色枚举",
  "按角色 id 解析：`su` 与内置角色 id 冲突，会被判「角色重复」跳过并告警；",
  "非角色目录会触发「缺少 role-card.md」告警。",
  "",
  "交付纪律：每次交付都要同步自己的文档（功能说明/流程、变更记录、memo、api-spec），",
  "**代码与文档同批交回**；文档缺口不得靠「下次补」。",
  "",
  "落盘后自动开工（J-1）：角色与治理产物落盘（客户经 request_confirmation 确认、写入完成、",
  "自动收尾）之后，**立刻**用 `dispatch_task` 把第一项开发任务派发给对应角色——roleId 用刚建出的",
  "角色，task 文本**自足**（做什么 / 依据哪份文档或契约 / 完成标准）——**不等客户手动转达**。",
  "任务文本对契约与工作流**按地址引用**——「依据哪份文档」给**项目内路径**即可",
  "（如 `docs/contracts/<name>-v1.md`、`docs/workflow.md`），**不内嵌契约全文**；",
  "投递时系统自动附「**必读（按序）**」块（先读完再动手；路径 + **由系统在投递时计算的 sha256**）——",
  "**不要自己算或转抄哈希**；引用的契约不存在会被**拒投**（如实回执，补落盘后重派）。",
  "",
  "派发 ≠ 授权：目标角色的写权仍只来自它自己的 Section 1 与 `request_confirmation` 的 confirmed:true；",
  "不得在任务文本里代授权限（如「已获准写 src/**」）。",
  "",
  "派发失败/被拒（回执「未能派发」）→ 如实告知客户原因，**不得假设已开工**；",
  "若没有可派发的角色，如实说明并停在「待客户指示」。",
  "",
  "安装纪律（技能安装/卸载）：**仅客户明示时**办理——客户在对话里明示让你给某角色装/卸技能，才执行；",
  "**你（su）不自主发起**（**仅在客户消息发起的轮次**里执行——非客户触发的轮次里调用会被如实拒绝）；",
  "客户明示后**直接办理**、**不设二次确认卡**（落盘走已预置的 `docs/skills/**`，安装工具没有确认通道）。",
  "**先落盘再激活**：**先**把技能写进 `docs/skills/`——`docs/skills/<name>/SKILL.md`（技能内容，角色读它）",
  "＋ `docs/skills/<name>/install.md`（安装登记：用途、适用角色列表、状态）——**再**调 `install_skill`/",
  "`uninstall_skill`；工具**自己不写盘**，只校验登记与角色、触发激活（重建目标角色会话）、如实回执——",
  "登记不存在或未含目标角色会被如实拒绝（先落盘再安装）。",
  "装/卸完成后**如实报告**：技能文件路径与内容 sha256（`path`/`digest`，以工具回执为准）、生效态",
  "（`rebuilt`＝已重建该角色会话、即刻生效 ｜ `next-session`＝该角色在跑轮次、不打断、下一会话起生效）、",
  "撤销路径（客户说「卸载 <name>（从 <roleId>）」即可；登记随时可查 `docs/skills/<name>/install.md`）。",
  "卸载＝**先改登记**（从适用角色列表移除该角色条目、或置 `status: uninstalled`）**再**调 `uninstall_skill`；",
  "回执里**「效果已撤」与「文件保留」是两个事实**——本仓没有删除原语，技能文件保留于 `docs/skills/<name>/`，",
  "须**分别如实陈述**，不得合并成「已删除」。",
  "**安装不改变任何角色的任何写边界**——技能是必读资料、不是权限：",
  "装/卸不改边界文档、不改 pin、不增任何角色的写权（写权仍只来自各角色自己的 Section 1 与 `request_confirmation` 的 confirmed:true）。",
  "",
  "安装纪律（MCP 安装/卸载）：与技能**同口径**——**仅客户明示时**办理（客户在对话里明示让你给某角色装/卸某个 MCP server 才执行）、",
  "**你（su）不自主发起**、**仅在客户消息发起的轮次**里执行——非客户触发的轮次里调用会被如实拒绝；",
  "客户明示后**直接办理**、**不设二次确认卡**（落盘走已预置的 `docs/mcp/**`，安装工具没有确认通道）。",
  "**先落盘再激活**：**先**写 `docs/mcp/<name>.md`——MCP 声明（用途 / 启动命令 command＋args / 环境变量**名**引用 / 适用角色列表）——",
  "**凭据值与一切秘密的值绝不写入文件**（只记 `env:NAME` 引用；值由客户在本机环境提供）——**再**调 `install_mcp`/`uninstall_mcp`；",
  "工具**自己不写盘**，只校验声明与角色、触发激活（重建目标角色会话）、如实回执——声明不存在、未含目标角色或 server 名不合规会被如实拒绝（先落盘再安装）。",
  "装/卸完成后**如实报告**：声明文件路径与 sha256（`path`/`digest`，以工具回执为准）、生效态（`rebuilt`/`next-session` 同技能口径）。",
  "**诚实告知口径（必讲、不得省略）**：外来 MCP 工具**在 ANS 门禁之外执行**（不属 `write_file`/`run_shell` 任一受治理面）——",
  "**安装＝能力级授予**：等于给该角色开了一片**门禁之外的新动作面**（动作面边界＝server 自身提供什么），**不得表述为逐调用受审**",
  "（本次安装不改变任何角色的**写边界**——写权仍只来自各角色自己的 Section 1 与 `request_confirmation` 的 confirmed:true）。",
  "卸载＝**先改声明**（从适用角色列表移除该角色条目、或置 `status: uninstalled`）**再**调 `uninstall_mcp`——**下次会话摘除**（在跑不打断）；",
  "**已发生的副作用不可撤**：卸载只保证**后续会话不再装配**该 server——此前已执行调用产生的外部动作与副作用**不在撤销范围内**，回执须如实陈述、**不得暗示已回滚**。",
  "",
  "看护职责：系统看护在异常态（轮次逼近超时 / 投递排队积压 / 命令超时限 / 重复失败）向你投 `[系统·看护]` 消息、",
  "在项目完成静默态投「收束提示」——**收到后先核查、再动作**：用 `role_status`（必要时 `session_tail`）核对事实",
  "（谁忙谁闲 / 队列积压 / 最近轮次结局 / 会话尾部），据实判断，**不得仅凭告警文本下结论**；",
  "核查结论记入你自己的文档面（`docs/su/**`）留证。",
  "",
  "恢复动作（停止本轮 / 重建会话 / 重投任务）你**只能提议**：`propose_recovery` 把提议（带证据）推给客户，",
  "**执行与否由客户一键确认**、由应用侧执行；**不得自行执行、不得承诺结果**——未获确认即未执行，取消亦如实回执。",
  "",
  "看护纪律：看护消息仅如实告知——**不得据此假设任何写权**；是否处理由你判断",
  "（核对后回「状态正常，忽略」是合法结局）：能自解的（澄清 / 重派）走既有 E-1 回交与 H-1 派发，",
  "核对确认卡死后才走 `propose_recovery`。",
  "",
  "边界（三种情形）：① 空项目 + 客户发起 bootstrap（创世）——治理种子边界生效，",
  "`角色卡/`、`docs/`、`.ans/` 三个目录命中即允许写入，你可写治理产物；",
  "② 已 bootstrap 的项目——按该项目的治理边界文档工作（pin 接受后创世例外自终止）；",
  "③ 两者皆无（回退内置、acceptance 未接受）——写入被门禁在写之前拒绝；fail-closed 的本意只指这一种。",
].join("\n");

/** 内置治理边界（源自技能 references/built-in-boundary.md），skill 根；condition 为固定 slug */
function builtInEntries(): BoundaryEntry[] {
  return [
    { root: "skill", path: "SKILL.md", kind: "file", purpose: "治理规则、不变量、检查点" },
    { root: "skill", path: "SKILL.zh.md", kind: "file", purpose: "治理规则（中文）" },
    {
      root: "skill",
      path: "references",
      kind: "conditional-directory",
      condition: "reference-maintenance",
      purpose: "角色卡与边界文档格式的参考文档",
    },
    {
      root: "skill",
      path: "docs",
      kind: "conditional-directory",
      condition: "docs-bootstrap",
      purpose: "design/feature/change/fix 文档脚手架",
    },
    {
      root: "skill",
      path: "角色卡",
      kind: "conditional-directory",
      condition: "role-restructuring",
      purpose: "角色目录（role-card.md / boundary.md / changelog.md）",
    },
  ];
}

/**
 * 内置治理角色的边界（Section 1）。fail-closed：acceptance 恒为未接受，
 * 故 resolveWrite 对其拒绝一切写入——但这**不是**「治理会话一律不能写盘」：只在
 * resolveBoundarySection 回退到本内置边界时成立（既无创世、项目也无治理边界文档）；
 * 创世种子（第 3 步）与项目覆盖（第 1/2 步）各有自己的接受证据，不经过本函数。
 * （口径见 `BUILT_IN_ROLE_CARD_TEXT` 末段「边界（三种情形）」。）
 * 由 resolveBoundarySection 与 listProject 共用，避免两份实现。
 */
export function builtInBoundarySection(): BoundarySection1 {
  return {
    entries: builtInEntries(),
    boundarySource: BUILT_IN_SOURCE,
    acceptance: { accepted: false, source: "" },
  };
}

/** 判断边界文件属于哪个根：先项目根，再技能根，默认项目根 */
function rootOfFile(fileAbs: string, projectRootAbs: string, skillRootAbs: string): Root {
  if (absRel(fileAbs, projectRootAbs) !== null) return "project";
  if (absRel(fileAbs, skillRootAbs) !== null) return "skill";
  return "project";
}

/** 是否为 YAML 边界文件 */
function isYamlPath(p: string): boolean {
  const q = p.toLowerCase();
  return q.endsWith(".yaml") || q.endsWith(".yml");
}

/** 按格式解析条目（+ YAML 的顶层 archived 标记）：YAML 严格；其他走 legacy Markdown（无归档标记）。 */
function parseEntriesDoc(
  text: string,
  sourcePath: string,
  defaultRoot: Root,
): { entries: BoundaryEntry[]; archived?: boolean } {
  if (isYamlPath(sourcePath)) return parseBoundaryYamlDoc(text);
  return { entries: parseBoundarySection1(text, defaultRoot) };
}

/** 统一的"未接受"结果：清空条目、accepted=false、原因写入 parseError（resolveWrite 据此拒一切写）。 */
function unaccepted(boundarySource: string, parseError: string): BoundarySection1 {
  return { entries: [], boundarySource, acceptance: { accepted: false, source: "" }, parseError };
}

/** 校验 pin 形状；非法返回错误说明（非空字符串），合法返回 null。 */
function pinShapeError(pin: unknown): string | null {
  if (!Array.isArray(pin)) return "pin 必须是数组";
  if (pin.length === 0) return "pin 为空数组（accepted=true 需要至少一条可验证证据）";
  for (let i = 0; i < pin.length; i++) {
    const p = pin[i] as Record<string, unknown>;
    if (typeof p !== "object" || p === null) return `pin[${i}] 不是对象`;
    if (typeof p.path !== "string" || p.path.trim() === "") return `pin[${i}] 缺少 path`;
    if (typeof p.sha256 !== "string" || p.sha256.trim() === "") return `pin[${i}] 缺少 sha256`;
  }
  return null;
}

/**
 * SHA-256 pin 校验（F6 升级：把「配置自称 accepted」升级为「可验证证据」）。
 * 仅当 acceptance.pin 存在时启用；缺省则沿用旧的 source 自称来源（向后兼容）。
 * 规则（全 fail-closed）：
 *  - 每条 pin 指向的文件都必须可读，且其 SHA-256（十六进制，大小写不敏感）与声明一致；
 *    **读取失败视为不匹配**（文件不存在/不可读同样 fail-closed）。
 *  - 正在加载的边界文件必须被至少一条 pin 覆盖——否则该边界没有证据，不得凭无关 pin 认可。
 * 通过返回 null；否则返回失败原因，调用方据此返回未接受 + parseError。
 */
async function verifyPins(fileAbs: string, projectRootAbs: string, pins: PinEntry[]): Promise<string | null> {
  const loadedKey = compareKey(normalizeLexical(fileAbs));
  let covered = false;
  for (const p of pins) {
    const targetAbs = joinRoot(projectRootAbs, p.path);
    if (compareKey(normalizeLexical(targetAbs)) === loadedKey) covered = true;
    let actual: string;
    try {
      actual = await sha256File(targetAbs);
    } catch (err) {
      return `pin 指向的文件不可读：${p.path}（${(err as Error).message}）`;
    }
    if (actual !== p.sha256.trim().toLowerCase()) {
      return `边界文件的 SHA-256 与 pin 不符：${p.path}`;
    }
  }
  if (!covered) {
    return `当前边界文件未被任何 pin 覆盖：${fileAbs}`;
  }
  return null;
}

/** 读取并解析一个边界文件；失败（读取、解析或 pin 校验）返回"未接受 + parseError"的边界。
 *  导出供 listProject 复用，避免另写一份解析。
 *  归档标记（客户 2026-10-14 约定）：YAML 顶层 `archived: true` 时，解析成功的结果携带 `archived: true`
 *  ——调用方（listProject / resolveRole）据此静默跳过或拒绝开启；失败路径（unaccepted）不带该标记，
 *  归档判定请走**中性读取**（accepted:false、无 pin），勿依赖接受/pin 状态。 */
export async function loadBoundaryFile(
  boundarySource: string,
  fileAbs: string,
  projectRootAbs: string,
  skillRootAbs: string,
  acceptance: Acceptance,
): Promise<BoundarySection1> {
  let text: string;
  try {
    text = await readTextFile(fileAbs);
  } catch (err) {
    return unaccepted(boundarySource, `读取边界文件失败：${(err as Error).message}`);
  }
  let entries: BoundaryEntry[];
  let archived: boolean | undefined;
  try {
    const parsed = parseEntriesDoc(text, boundarySource, rootOfFile(fileAbs, projectRootAbs, skillRootAbs));
    entries = parsed.entries;
    archived = parsed.archived;
  } catch (err) {
    return unaccepted(boundarySource, (err as Error).message);
  }

  // A（客户 2026-10-12 裁定）：边界文件**存在且被读到**，但 Section 1 解析出 **0 条** → **响亮失败**
  // （记为 parseError），不得静默成空集。真机实测缺陷：su 给新角色写了散文式 Markdown `boundary.md`
  // （「## 允许写入（白名单，仅此）」+ 反引号路径列表），legacy 表格解析器静默产出 0 条、`parseError`
  // 为空 ⇒ 该角色一切写入被拒，而拒写信息只说「未匹配任何边界条目…允许路径：（无）」，完全不提示
  // 「边界文件读不懂」。文案让模型与客户都看懂原因与出路。
  //
  // 边界（合法空集不误伤，测试钉于 `test/门禁引擎/boundary-empty-and-builtin.test.ts`）：
  //  · 仅针对**文件解析路径**（本函数）；**代码合成**的边界（内置 `builtInBoundarySection()`、治理种子
  //    `buildGovernanceSeedBoundaryForGate()`、未接受段 `unaccepted()`）不经此处，天然不受影响。
  //  · YAML（.yaml/.yml）：结构违规在 `parseBoundaryYaml` 一律抛错；能走到这里且 0 条 = 文件**显式**
  //    写了 `entries: []`（按声明格式明确表达空集）→ 保持现状、不算解析失败（客户 2026-10-12 裁定的
  //    O1 角落依赖其仍可枚举，见 `test/测试/cli-genesis-boundary.test.ts`）。
  //  · 其他（.md 等，legacy Markdown 表格解析）：散文/无表格/表格全无效行 → 0 条 = 文件**没有**按
  //    加载器认得的格式表达 → 正是上述缺陷现场 → parseError。
  if (entries.length === 0 && !isYamlPath(boundarySource)) {
    return unaccepted(
      boundarySource,
      `边界文件存在但 Section 1 为空或无法解析：${boundarySource}（本加载器按 YAML 的 role + entries 结构解析边界；Markdown 散文/表格不会被解析——请把该文件改写为 boundary.yaml）`,
    );
  }

  // F6 升级：只在"声称已接受且给出了 pin"时校验可验证证据——在认可 accepted 之前先比对 SHA-256。
  // 不制造中间态：任何一步不过 → 整条边界回落为 accepted=false（下游只看 accepted 真假）。
  if (acceptance && acceptance.accepted === true && acceptance.pin !== undefined) {
    const shapeErr = pinShapeError(acceptance.pin);
    if (shapeErr !== null) return unaccepted(boundarySource, `pin 非法：${shapeErr}`);
    const pinErr = await verifyPins(fileAbs, projectRootAbs, acceptance.pin);
    if (pinErr !== null) return unaccepted(boundarySource, `边界未通过 SHA-256 pin 校验：${pinErr}`);
  }

  return archived === true ? { entries, boundarySource, acceptance, archived: true } : { entries, boundarySource, acceptance };
}

/**
 * **同步重读**盘上边界文件的条目（异步加载的对照版）——仅用于 `resolveWrite` 的「旧快照」线索做
 * **盘上对照**（真机现象：su 已改好盘上边界，但活会话持有开会话时解析的旧快照 ⇒ 写入被拒且不提示）。
 * 不做接受 / pin 校验——对照只看**条目**（条目含不含目标路径与接受证据无关）。
 *
 * **可判定才返回条目**：非文件路径（内置 `<built-in:…>` 标签 / 空串）/ 读取失败 / 解析报错 → `null`。
 * 调用方（`resolve-write.ts`）对 `null` **保持原文案、不得猜测**；线索只是提示，**判定仍是拒绝**。
 *
 * **性能（客户派工：拒写路径的同步读盘加缓存）**：本函数落在「每次落入未匹配分支的写尝试」上——
 * 一轮数百次写尝试时，读取+解析会是主进程的同步阻塞源。故加**模块级缓存**，按 `mtimeMs`+`size`
 * 短路：文件未变 → 只做一次 `stat`，**跳过读取与解析**；变了才重读（内容变更必须仍被检出）。
 * 判定限制（如实）：`mtime+size` 检不出「同尺寸且 mtime 未变」的改动——真实写入都会更新 mtime，
 * 此类碰撞仅可能出现在粗时间粒度的文件系统上；且即便漏检，影响的只是**提示句**（可能未显示/多显示
 * 一次旧快照线索），**判定结果（allowed）从不依赖盘面**。读取失败（stat 成功但读不到）不写缓存，
 * 下次重新判定。缓存条目**只读**（调用方不得改动返回数组），容量有上限（超限整体清空，进程内
 * 边界文件数量级本就很小）。
 */
interface StaleProbeCacheEntry {
  mtimeMs: number;
  size: number;
  /** null = 该内容下不可判定（解析失败），按 mtime+size 记忆，避免对坏文件反复解析。 */
  entries: BoundaryEntry[] | null;
}

/** 测试可注入的盘面读原语（计数桩用；生产恒用真实 node:fs）。 */
export interface StaleBoundaryProbeIo {
  stat: (absPath: string) => { mtimeMs: number; size: number };
  read: (absPath: string) => string;
}

const STALE_PROBE_IO: StaleBoundaryProbeIo = {
  stat: (absPath) => {
    const s = statSync(absPath);
    return { mtimeMs: s.mtimeMs, size: s.size };
  },
  read: (absPath) => readFileSync(absPath, "utf8"),
};

const STALE_PROBE_CACHE_CAP = 256;
const staleProbeCache = new Map<string, StaleProbeCacheEntry>();

export function reloadBoundaryEntriesSync(
  boundarySource: string,
  projectRootAbs: string,
  skillRootAbs: string,
  io: StaleBoundaryProbeIo = STALE_PROBE_IO,
): BoundaryEntry[] | null {
  if (typeof boundarySource !== "string" || boundarySource.trim() === "" || boundarySource.startsWith("<")) {
    return null; // 内置标签 / 空串：不是盘上文件，无法判定（无 I/O）
  }
  const fileAbs = joinRoot(projectRootAbs, boundarySource);
  let st: { mtimeMs: number; size: number };
  try {
    st = io.stat(fileAbs);
  } catch {
    return null; // 读盘失败：无法判定（不猜测）。stat 廉价，不缓存失败——文件可能随时出现
  }
  const hit = staleProbeCache.get(fileAbs);
  if (hit !== undefined && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.entries; // 文件未变：跳过读取与解析（缓存命中即本函数的常规路径）
  }
  let text: string;
  try {
    text = io.read(fileAbs);
  } catch {
    return null; // stat 成功但读取失败（竞态/权限）：本次不可判定，不写缓存（下次重新判定）
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let entries: BoundaryEntry[] | null;
  try {
    entries = parseEntriesDoc(text, boundarySource, rootOfFile(fileAbs, projectRootAbs, skillRootAbs)).entries;
  } catch {
    entries = null; // 新解析报错：对照不可信，无法判定（不猜测）；按 mtime+size 记忆
  }
  if (staleProbeCache.size >= STALE_PROBE_CACHE_CAP) staleProbeCache.clear();
  staleProbeCache.set(fileAbs, { mtimeMs: st.mtimeMs, size: st.size, entries });
  return entries;
}

/**
 * 双来源边界解析（+ 冷启动创世例外）：
 * 1) 项目覆盖（若已接受优先）：项目配置了该角色边界文件，且项目级接受证据已接受；
 * 2) 治理边界覆盖：项目提供了治理边界文档（针对内置治理角色）；
 * 3) **冷启动「有界创世例外」**（设计 §10.1 / §12.2）：空项目（尚无治理边界文档）上，若调用方
 *    显式声明了**操作者发起的 bootstrap**（`project.genesisBootstrap`），对**内置治理角色**返回
 *    「项目根」治理种子边界（**普通目录** `角色卡/`、`docs/`、`.ans/`——`scope: undefined` 下命中即
 *    放行，无需 scope/slug），acceptance = 该操作者指令；
 * 4) 内置：回退内置治理边界，且标记为未接受（resolveWrite 将据此拒绝一切写入）。
 *
 * ⚠️ 「导入即授权」有**两义**，本函数按来源区分，**两者都不是空白支票**：
 *  · **已有角色的项目**：导入 = 授权**每个角色按其自身边界**工作（第 1 步，per-role-boundary，非 blanket）；
 *  · **空项目**：导入并开启内置治理角色 = **有界创世**（第 3 步，仅治理产物）。
 *
 * ⚠️ 第 3 步置于第 2 步**之后** = **自终止**：项目治理边界文档一经写出并经 pin 接受，
 *    `governanceBoundary.path` 非空 ⇒ 第 2 步先命中、第 3 步永不求值——创世授权随之失效
 *    （即便 `genesisBootstrap` 残留亦然；自终止是结构性的，不依赖调用方清除该字段）。
 */
export async function resolveBoundarySection(
  roleId: string,
  project: ProjectConfig,
): Promise<BoundarySection1> {
  const projectRootAbs = project.projectRoot;
  const skillRootAbs = project.skillRoot;
  const gov = project.governanceBoundary;
  const loc = project.roles ? project.roles[roleId] : undefined;

  // 1) 项目覆盖（若已接受）
  if (gov && gov.acceptance && gov.acceptance.accepted === true && loc && loc.boundary) {
    const section = await loadBoundaryFile(loc.boundary, joinRoot(projectRootAbs, loc.boundary), projectRootAbs, skillRootAbs, gov.acceptance);
    // 归档防御（客户 2026-10-14 约定）：角色边界顶层 `archived: true` ⇒ 该角色已冻结归档，其声明的
    // 条目**一律不作为写权来源**——即便有调用方绕过 resolveRole 直接按 id 解析边界，这里也 fail-closed
    // （parseError ⇒ resolveWrite 拒绝一切写入）。开启入口的明示拒绝（「角色 X 已归档，不可开启」）在 resolveRole。
    if (section.archived === true) {
      return unaccepted(section.boundarySource, `角色 ${roleId} 已归档（边界顶层 archived: true），其边界不予采用`);
    }
    return section;
  }

  // 2) 治理边界覆盖
  if (gov && gov.path) {
    return loadBoundaryFile(gov.path, joinRoot(projectRootAbs, gov.path), projectRootAbs, skillRootAbs, gov.acceptance);
  }

  // 3) 冷启动「有界创世例外」（§10.1 / §12.2）：仅对**内置治理角色**、且仅当调用方显式声明操作者 bootstrap 时生效。
  //    种子条目（普通目录 角色卡//docs//.ans/）来自本角色的 governance-seed.ts（单一来源，见文件头 import 注释）。
  //    source 为空串时 F6（resolveWrite）仍会拒绝一切写入——不因「声称创世」而放行无证据的写入（fail-closed）。
  if (
    roleId === BUILT_IN_GOVERNANCE_ROLE_ID &&
    project.genesisBootstrap &&
    typeof project.genesisBootstrap.source === "string"
  ) {
    return buildGovernanceSeedBoundaryForGate(project.genesisBootstrap.source);
  }

  // 4) 内置（未接受）
  return builtInBoundarySection();
}
