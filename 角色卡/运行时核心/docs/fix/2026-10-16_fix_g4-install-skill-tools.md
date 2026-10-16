---
id: core-g4-install-skill-tools
type: fix
title: "G-4 V1 I1/I2：技能安装/卸载工具面（install_skill / uninstall_skill schema + maker + 能力位）"
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [role-capability-install, kanban-fixes-pm-review, core-g2-status-tools-recovery]
---

# G-4 V1 I1/I2：技能安装/卸载工具面（运行时核心实施记录）

**状态：已实施待验证（未部署）。** 依据：客户 2026-10-16「都按推荐批准」；设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`（§3.2 签名/回执、§3.3 失败文案、§6.4 护栏）；PM 派发「运行时核心＝I1/I2」。客户口径已钉：**无二次确认卡**（客户会话指令即授权）、**仅客户明示时安装**、工具＝**校验＋激活＋回执、不写盘**。**本记录只覆盖 I1（schema）＋I2（maker＋能力位）**；I3 桌面 handler（校验/激活/系统行/诊断）、I4 会话开局注入、I5 预授权扩列、I6 su 卡文本、I7 行样式由其属主各自实施。

## 冻结符号（逐名清单；`src/model/runtime.ts` 为**单一来源**，桌面窗口与三适配器按此接线）

| 符号 | 形状 |
|---|---|
| `InstallSkillPayload` | `{ roleId: string; name: string }`（技能名＝稳定短 slug，落点 `docs/skills/<name>/`） |
| `InstallSkillReceipt` | `{ ok:true; action:"installed"\|"uninstalled"; roleId; name; path; digest; effective:"rebuilt"\|"next-session"; note? } \| { ok:false; reason: string; message: string }`（**形状冻结**） |
| `InstallSkillFn` | `(payload: InstallSkillPayload, metadata?: ReportHandbackMetadata) => Promise<InstallSkillReceipt>` |
| `UninstallSkillFn` | 同上（`action` 为 `uninstalled`；卸载专有两钉：先改登记再卸载 / 文件保留） |
| `GovernedToolsOptions.installSkill?` / `.uninstallSkill?` | 两个可选能力位（**注入才注册**，各自独立；旧调用方逐字兼容） |
| 工具名常量 | `INSTALL_SKILL_TOOL_NAME = "install_skill"` / `UNINSTALL_SKILL_TOOL_NAME = "uninstall_skill"`（`tools.ts` 导出） |

`reason` 建议机读枚举（JSDoc 登记，不设 TS 联合——形状冻结为 string）：`not-registered` / `role-not-listed` / `role-not-found` / `not-customer-turn`（护栏）/ `registration-unchanged` / `rebuild-failed`。

## 改动文件清单（全部在本角色边界内）

| 文件 | 实施内容 |
|---|---|
| `src/model/runtime.ts` | 上表全部符号＋docs 注释（纪律：工具不写盘；校验/激活在能力侧；失败 fail-closed 零副作用；安装不改变任何角色写边界） |
| `src/provider/runtime/schema.ts` | `describeTool` 增 `install_skill` / `uninstall_skill` 两块：parameters 必填 `{roleId,name}`；description/promptGuidelines 写死「**仅客户明示时安装/卸载（不得自主发起）**／**先落盘再激活**（卸载＝**先改登记再卸载**）／工具**不写盘**只校验+激活+回执／**不改变任何角色写边界**」；失败文案枚举沿设计 §3.3 逐字（技能未登记／登记未含角色／角色不存在或为 su 自身／登记仍含角色拒绝），含护栏拒绝 `not-customer-turn`＝`本动作仅可在客户消息发起的轮次执行——未执行。`；**另（PM 并入本轮的机械同步）**：`request_confirmation` 描述与 guideline[0] 的预授权目录陈述「两棵」→「**三棵**」（`docs/su/**`、`docs/contracts/**`、`docs/skills/**`，逐字与门禁引擎 I6 新卡文本同口径；只动目录陈述，该工具语义零变化） |
| `src/provider/runtime/tools.ts` | 两工具名常量；`skillReceiptOf`（回执形状归一，含 action 与工具一致性校验；契约外 fail-closed）；`makeSkillReceiptTool` 共用实现＋`makeInstallSkillTool` / `makeUninstallSkillTool` 两 maker（**只路由 `{roleId,name}` 载荷、如实转达回执、绝不写盘**）；`buildGovernedTools` 两处「注入才注册」；`abortedToolResult` 两条中止文案（「未能安装/未能卸载——不要当它已安装/已卸载」） |
| `test/runtime-core/install-skill-tools.test.ts` | 新增 6 用例（注入才注册与形状／两组文案钉住＋负向断言／ok:true 三态呈现与载荷路由／失败如实含 not-customer-turn 与契约外 fail-closed／参数校验不触达／metadata＋预中止） |
| `test/runtime-core/tools.test.ts` | 「注入才注册」全量注入用例扩到 **14 工具**（12→14；两新能力加入注入面）；`request_confirmation` 文案断言同步**三棵**（含 docs/skills/** 点名、写入句按三棵计数、旧「两棵」计数防回退负向断言） |
| 本记录 + `changelog.md` + `memo.md` + `feature-map.md` + `api-spec.md` | dated 记录与导航 |

## 行为钉点（测试逐条钉住）

- **注入才注册**：缺省三工具；仅注入 `installSkill` ⇒ 只 `install_skill`；仅 `uninstallSkill` ⇒ 只 `uninstall_skill`；未注入 ⇒ 模型无法请求（结构性 fail-closed，沿 dispatch_task 先例）。
- **参数**：`roleId`（容忍 `role_id`/`role` 别名）与 `name` 非空字符串；非法/缺失 ⇒ 拒绝且**不触达能力**（零副作用）。
- **ok:true 呈现**：`技能「<name>」已安装/已卸载 → 角色「<roleId>」`＋`path`＋`sha256 <digest 前 12 位>`＋生效态（`rebuilt`＝已重建该角色会话、即刻生效；`next-session`＝该角色正在运行轮次（不打断）——新会话起生效）＋`note` 如实附上＋**重申「本次安装/卸载未改变任何角色的写边界」**；卸载呈现「**效果已撤；文件保留于 <path>**」二分陈述；延迟态不得称「即刻生效」。
- **失败如实**：`ok:false` ⇒ `ok:false`＋`reason`＋回执 `message` 原文＋「零副作用」＋「不要当它已安装/已卸载」；`not-customer-turn` 护栏文案逐字转达；**绝不**出现「技能「…」已安装/已卸载」式的伪成功。
- **能力抛错** ⇒ 「技能**未能安装/卸载**（原因）——不要当它已安装/已卸载」；**契约外回执**（缺失／`{ok:true}` 缺字段／action 与工具不符／旧字符串形状）⇒ fail-closed「未返回明确回执——按未执行处理」。
- **metadata** 沿 dispatch_task 先例：入口捕获 `{turnId, roleId, runtime}`；无轮次归一单参调用；预中止不调能力且不称已装（`abortedToolResult` 专条）。
- **工具层全程不写盘**：handler 只解析参数→调注入能力→转达回执（无任何 fs 调用面）。

## 跨上下文对齐（本批并行实施，落盘后核对）

1. **门禁引擎 I6（su 卡「安装纪律」段＋预授权「三棵」，其文件）** 与本 schema 文案**同口径**（落盘后逐句核对）：仅客户明示、不自主发起、**仅客户消息发起的轮次**、不设二次确认卡、**先落盘再激活**、工具自己不写盘、`rebuilt`/`next-session` 生效态、脱落「效果已撤」与「文件保留」二分、**安装不改变任何角色写边界**——一致。**「两棵→三棵」机械同步（PM 并入本轮）**：`request_confirmation` 描述/guideline 的预授权目录陈述按已批准事实（裁定①＋I5 扩列 `docs/skills`）同批改为三棵（逐字与门禁引擎新卡文本同口径），`test/runtime-core/tools.test.ts` 对应断言同步（含旧「两棵」计数防回退负向断言）；**该工具语义零变化**（写盘仍一律先经本工具确认；preview 逐条列路径；`confirmed:true` 唯一凭据）。
2. **编排在途**：`SU_PREAUTHORIZED_WRITE_DIRS` 已含 `docs/skills`（其 I5，工作树在途）＋新 `src/common/编排/installed-skills.ts`（其 I4）——本层未触碰；能力透传（`AdapterCapabilities`/注入端 `suppressHandback` 判据）待编排/桌面按其批次落，本层经 `GovernedToolsOptions` 同名字段即为接线点（`RuntimeSessionOptions` 经 `Omit` 继承＋`...options` 自动透传，无需再改 service）。
3. **桌面窗口 I3 接口点**（实现 `InstallSkillFn`/`UninstallSkillFn`）：校验（角色存在且非 su／登记文件存在／登记含目标角色→`role-not-listed`／卸载前登记确已撤销→`registration-unchanged`；护栏：仅客户消息发起的轮次→`not-customer-turn`）→激活（复用既有重建；在跑不打断 ⇒ `next-session`）→回执（含 `path` 与运行期算的 `digest`；失败零副作用）。**工具不写盘、不弹卡、不改变任何写权**。

## 实测（本机 macOS arm64 / Node v24.14.0）

`test/runtime-core/**` **113/113**（基线 104＋本批 A 3＋B 6）；`test/pi-adapter/**＋claude＋codex` **330/330** 不回归；`npm run typecheck` **0 错**；全量 `test/**/*.test.ts`（与并行角色在途改动同工作树）**1799 计 / 1794 过 / 4 红 / 1 skip**——4 红逐条归属：①`test/测试/g3-search-verify/pi-loopback-verify.test.ts` L255＝本批 A 的**已声明预期红**（测试角色同轮翻转）；②-④`test/测试/g1-verify/g1-copy-and-nails.test.ts` 三条＝**编排/门禁引擎并行在途改动**对旧钉子的红（非本批），未触碰。

## 未验边界

- I3 桌面 handler 未落 ⇒ 未注入 ⇒ **两工具当前不注册**（结构性 fail-safe toward 现状；端到端可用性待桌面 + 独立验证/真机 E2E）。
- 未做真机装-看-用-撤 E2E（设计 §十观测项，待 I3/I4 齐后与其验收批合并）；MCP（V2）未动、未承诺；未 git 提交；未触碰 `test/测试/**`、在飞他方改动（编排/门禁引擎/桌面）与真机轮目录。
