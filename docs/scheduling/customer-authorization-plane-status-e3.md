# E3 放行与状态记录：客户授权平面——两个标记 `@审批` / `@决策`

- **任务 ID / flowId**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane`
- **记录角色**：ANS 统筹调度（Scheduler，技能内置管理角色，独立固定上下文）
- **日期**：2026-11-03
- **风险档位**：**T3**（不降档；客户闸门 0 声明、方案/复核/团队计划一致）
- **状态**：**E3 放行记录已写盘；当前候选已按 V1 判定通过并放行到提交/PR/合并阶段；本记录本身不 commit、不 push、不合并、不发布、不打 tag。**

---

## 一、G2–E2 阶段完成与放行依据

| 节点 | 状态 | 依据 |
| --- | --- | --- |
| G2 闸门 2 | 完成 | 沟通记录「闸门 2 确认记录」（团队计划 v1 653/`37e6bd0d…`） |
| IA 实施授权 | 完成 | 沟通记录「实施授权记录」（不含提交/推送/合并/发布） |
| H1 边界变更 | 完成 | B-1..B-4 共 7 条（运行时核心 +2、编排 +3、桌面窗口 +2），md/yaml 一致；三份 changelog；边界测试 31/31 + 9/9、resolveWrite 放行/拒绝 |
| V1 实施前标准 | 完成 | `docs/acceptance/customer-authorization-plane-criteria-v1.md` 1171 行 / `51ac0f50…` |
| B0 基线 | 完成 | rebase 后 HEAD `4c3a6e4`；T3 393 文件 / 3479 / 3452 / 9 / 18 |
| P1 提案与审核 | 完成 | 五份 Revision 2 提案 + 项目管理复审 397 行 / `3faef8ee…`，`recommend approval` |
| A1/A2/A3 契约冻结 | 完成 | A1 165/`b659c14f…`、A2 88/`c6fa3d2c…`、A3 135/`51dcf2fd…`；A1/A2/A3 定向 typecheck 0；共享 JSONL 采用 A |
| B1 契约冻结 | 完成 | 实施记录 172/`db0ecf35…`；typecheck 0；编排 737/736/1/0（唯一既有 EPERM） |
| C1 桌面接线 | 完成 | 实施记录 208/`966cba43…`；目标 22/22、桌面全套件 522/522、typecheck 0 |
| C2 渲染层 | 完成 | 实施记录 176/`dc8bcca4…`；UI 401/401、phase3b 45/45、phase5a 48/48、探针 20/20；W-1 A 增补 `ConfirmCard.tsx`/`shell.css` |
| C2 窄修复 | 完成 | 面板撤销回执（store 传 `roleId/runtime`）；修复记录 139/`6157181c…`；UI 402/402；D2 探针 64/64 |
| D1 集成/回归 | 完成 | 记录 231/`c4d6ecfe…`；集成 6/6；修复前 T3 保留为历史（已被 D2-fix 取代） |
| D2 真实运行 | 完成 | 记录 459/`df1bebd8…`（原 288/`4752abb0…` 保留首跑 63/64、S5 false 事实；D2-fix 64/64、E2E_PASS=true、30+16 截图） |
| E1 变更包 | 完成 | `docs/scheduling/customer-authorization-plane-change-v1.md` 117 行 / `e3b3ca70…` |
| E2 v1 独立验收 | **证据不足（历史）** | `docs/acceptance/customer-authorization-plane-report-v1.md` 237 行 / `b19a926c…`：0 fail / 7 insufficient / 16 pass / 1 N/A |
| **E2 v2 复判** | **通过（现行）** | `docs/acceptance/customer-authorization-plane-report-v2.md` 87 行 / `029df27d1b54b5037fbc75859f8ee5bfdbcf4d6578af3fcce33ae76ee0ab4592`：**23 pass / 0 fail / 0 insufficient / 1 N/A**（AC-23 整体 N/A；AC-24 仅 O11 子句 N/A） |
| E3 放行 | 本记录 | 当前候选满足 V1；放行到提交/PR/合并阶段（由沟通按客户预授权执行） |

---

## 二、当前候选（冻结对象）

- **代码基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（分支 `feat/customer-authorization-plane`）；工作树未提交产品/测试候选。
- **候选文件**：**54 文件** = 53 产品/测试源 + 1 test-only D2 探针。
- **冻结清单**：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt` **134 行 / SHA-256 `49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a`**；运行后 `17-post-run-candidate-identity-fix.txt` 134 / `71b24533…`；E2 v2 独立复算 **54/54 SHA-256 全匹配、0 unexpected / 0 missing / 0 mismatch**。
- **暂存区**：空；**未 commit/push/merge/release**；HEAD 仍 `4c3a6e4`。
- **忽略/临时产物（非候选）**：`app/renderer/dist/`、`node_modules/`、D2 `probe-run-*/userData`、`e2e-*/userData`、`e2e-pi.env`。

---

## 三、E2 v2 与 v1 的关系、补证路径

- **v1（历史，不修改）**：`docs/acceptance/customer-authorization-plane-report-v1.md` 237 行 / `b19a926c…`，结论 **证据不足**（0 fail / 7 insufficient：AC-1/2/3/6/8/11/16 / 16 pass / 1 N/A）。v1 保留为历史报告，不修改、不覆盖。
- **补证 1（D2 真实运行）**：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-supplement-v1.md` **302 行 / `68e2fe2b…`**；**140/140 checks true**、16 张 1360×860 截图；覆盖近失配/未命中普通投递、空正文面板（确认禁用）、带图标记拒绝、未识别片段（变体）、shell 精确命令 once 放行 + 第二次回落 + **真实 shell 审计 JSONL**（`shell-directive/shell-gate.jsonl` 3 行 / `aef4541b…`：`by:"directive:d-1"` + `directive:{id,scope}`，与 judge/customerGrant 互斥）、真实重启（`app-restart`/`unused-once` 均 expired）、真实坏账本（3 坏行、消费者无指令、主路径不阻塞、不伪造回执）。
- **补证 2（B1 原始账本样例）**：`角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples.md` **200 行 / `ed9076dd…`**；主账本 11 行 / `fbf56b48…`（created ×6 approval/decision、consumed、revoked、expired app-restart/unused-once；seq 1..11、version 1、`d-<seq>`、sessionId、highRisk）；坏行/轮转样例 `badLines=1 / ignoredLines=1 / errors=1`、`takeDirective=undefined`、`list` 不伪造空；独立回放 22/22。
- **v2（现行唯一 B2 结论）**：`docs/acceptance/customer-authorization-plane-report-v2.md` 87 行 / `029df27d…`；7 项 insufficient（AC-1/2/3/6/8/11/16）全部转 **pass**，其余 16 项沿 v1 pass，AC-23 N/A；**总体通过（23 pass / 0 fail / 0 insufficient / 1 N/A）**，仅对当前候选有效。
- **证据复用**：候选未变（54/54），v1 的 T3 全量（D2-fix：403 文件 / 3624 / 3597 / 9 / 18；新增确定性失败 0、新增 skip 0）、双端 typecheck 0/0、受影响套件、D1 集成、D2-fix E2E/探针继续有效；补证只新增真实运行/样例证据，不改产品/测试。

---

## 四、非阻断项与披露项（E2 v2 及 E1 已列，E3 汇总）

1. **AC-3 UX 注记**：`@审批 允许 shell "npm install" 加急` 当前把 `"npm install" 加急` 整体作为命令（方案 §4.2 允许“shell 后全部文本”口径），不列未识别片段、确认可用；`@审批 允许 加急` 变体已验证未识别片段路径。E2 判定不构成 AC-3 fail/insufficient；建议后续 UX 提示客户核对命令全文（不改变本次通过，不改产品）。
2. **面板撤销回执的残余边界**：回执依赖当前选中角色 `roleId/runtime`；无选中角色时不产回执（C2-fix §6.7 披露）；E2 不据此判 fail/insufficient。
3. **A1 `api-spec.md:160` EOF 空行**：`git diff --check` 提示，非产品候选；建议后续编辑性修正（非阻断）。
4. **多引擎**：D2 仅默认 `claude`；其余引擎以共享通道测试覆盖；缺口已披露（团队计划 §10.2 第 9 项允许）。
5. **`write-sequencing.test.ts`**：按 B0/既有记录排除，未运行、行为未验证。
6. **D2 补证普通聊天未驱动真实模型**：只证明走普通路径而非指令路径（探针不接模型运行时）；已披露。
7. **坏账本面板**：仍显示可解析的历史 revoked 行，同时显示错误横幅「指令账本不可用（3 条坏行）；客户指令未生效」；消费者按无指令；不伪造空/不伪造回执；已披露。
8. **W-1 闸门 2 写集增补（§十三）**：C2 `ConfirmCard.tsx`/`shell.css`（`app/renderer/` 既有目录授权，无需 H1）。
9. **i18n allowlist 增补（§十四，W-5 A）**：`test/项目管理/shared/i18n-guard-allowlist.ts` 增加 `app/desktop/directive-input.ts`（输入解析关键字「撤销」，classification §4）；guard 6/6。
10. **PID 35700**：C2 早期探针遗留 Electron 进程，D2 前已终止；当前残留 34404/11492/41000 属 network-monitor worktree，与本任务无关；D2/D2-fix/补证均用全新 userData。
11. **D2 原始 S5 失败 → C2 窄修 → D2-fix 64/64**：D2 原记录保留 63/64、S5 false 历史；C2-fix 只改 4 个 C2 文件（store/panel/Composer/test），C1 未改；D2-fix/补证当前候选 64/64 + S5 回执恢复。
12. **O1–O11 不实施**：Q5 A（联网/外部目录仅记录）、O9 回滚开关未选、O10 结构化禁止 shell 读 `.ans` 未选、O11 随机后缀未选；AC-23 整体 N/A、AC-24 O11 子句 N/A；`@边界` 不解析、无 CLI、指令不进模型上下文、`request.presented.to` 不扩展（W-6）；不授权代码/角色卡/边界。
13. **版本**：P1.1 闸门 1 确认版（1199/`7875ad6a…`）+ P1.2 编辑性等价（1209/`1748ad2d…`，V1 §1.2.1）；团队计划 v1（653/`37e6bd0d…`）+ §十三/§十四（当前 675/`4545d3a5…`）；V1 未改（1171/`51ac0f50…`）；E1 117/`e3b3ca70…`。
14. **无 task_ops / 无录屏 / 无 commit**：未伪造任务令牌、锁、审批或 `docs/verification/`；截图关闭 DEBUG、记录 sha256/窗口尺寸/命令；**未录屏**。

---

## 五、放行与提交/合并授权边界

- **E3 放行含义**：当前候选（HEAD `4c3a6e4` + 54 文件，冻结清单 `49cfc38d…`）**满足 V1**（E2 v2 通过），阶段放行到提交/PR/合并阶段；E3 不是产品发布授权，不是打 tag 授权。
- **客户预授权**：客户已预授权**提交/推送/创建 PR/合并**（**不含发布/打 tag**）；按沟通记录与统筹安排，由**沟通在本轮后执行 commit / PR / merge**；E3 本身及本上下文**不 commit、不 push、不合并、不发布、不打 tag**。
- **执行前提**：E2 v2 通过 + E3 放行（本记录）已满足；提交/PR/合并的具体分组、路径 staging、提交信息与 PR 描述由沟通按团队计划/项目先例执行；不把管理记录混入产品候选以外的无关改动。
- **发布**：发布/打 tag/产物分发**未授权**，另行客户决定；本记录不涉及。

---

## 六、E3 记录状态

- **已放行**：G2–E2 完成；当前候选满足 V1（E2 v2 23 pass / 0 fail / 0 insufficient / 1 N/A）。
- **未执行**：commit、push、PR、merge、release、tag（由沟通按客户预授权在 E3 后执行；本上下文不执行）。
- **未改**：未改产品/测试候选、方案/复核/沟通/验收/角色卡/边界；未改团队计划 v1 语义（§十三/§十四为已确认增补）。
- **证据**：E2 v2 87/`029df27d…`；E1 117/`e3b3ca70…`；候选清单 134/`49cfc38d…`；D2 459/`df1bebd8…`；补证 D2 302/`68e2fe2b…`、B1 账本 200/`ed9076dd…`；T3 403/3624/3597/9/18；E2E_PASS=true；D2 探针 64/64；双端 typecheck/build 0。

**本文件状态：E3 放行记录；当前候选满足 V1（v2）；未 commit/push；提交/PR/合并由沟通按客户预授权执行，发布/打 tag 未授权。**
