# E3 放行记录：运行时门控与角色模块化

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-08
- **状态**：**B2 独立验收判 pass（通过，附明确限制）**；本记录放行到提交/推送/PR/合并（**发布/tag 不在客户委托内**）。本记录不改候选、不改验收结论。

## 一、B2 结论与依据

- **报告**：`docs/acceptance/2026-11-08_runtime-gate-role-modularization-report-v1.md`（**237 行 / 33574 bytes / `8bbeb459bcba8c06511e499eb702952d02718d7533ae084254659b299f9f2dcd`**）。
- **逐项**：E0 9/9、P1–P7 7/7、N 28/28、RR 3/3（RR2 真实 Pi N/A）、E1 7/7、E2 7 pass + E2.7 N/A、E3 12/12、E-A 10/10、D1–D9 9/9；**无 fail / 无 insufficient / 无阻断返工**。
- **候选（冻结）**：97 文件；聚合 **`7bbff9bd1fa12090590d1bc3a42b70effaa86b42b08ff124ed5ff17924d12a95`**；树 `a93fbcd8…`；manifest `5cbdbb94…`（1,066 文件）；T1 三文件只读基线未改。
- **订正记录**：B2 后仅做两处**文字订正**（不改候选）：变更包聚合算法文字（按整行 `LC_ALL=C` 排序）→ `docs/scheduling/2026-11-07_change-package_runtime-gate-role-modularization.md` **70 行 / 12238 bytes / `329dd2c05f1193f91842819e69a3bbbdb614f3e546408ddc334d6088bf754921`**；T3 记录同口径订正 → `角色卡/测试/docs/change/2026-11-07_E3-T3-full-regression.md` **326 行 / 33233 bytes / `d0d67ff45c740ae802a839a31f5e126e718809d825a778e3344566a1b65b442b`**（原 `76872622…`；聚合值 `7bbff9bd…` 不变）。

## 二、B2 限制（必须随放行与 PR 披露）

1. **冻结脏基线口径**：T3 以 B0（198 fail / 1 cancelled / 32 skip + 6 挂起）为对照；新增确定性失败 0、新 skip 0；含 Node 原生崩溃、ENOTEMPTY 清理抖动、post-test 泄漏等非确定性（新增 4 条/既有消失 5 条已逐条披露），**不能表述为单次全绿**。
2. **真实运行范围**：P1-RR 只到「派发父门受理 PASS + 任务创建成功」；任务投递被下游门拒绝（`runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`），**不宣称闭环**；写/发布门（仓库初始化/交付/stable-write/run-stop）未放宽，属另案。
3. **RR2 真实 Pi**：N/A（按 Q11/B1 v1.1；Pi 确定性集成/桩件已测；真实 Pi 未运行）。
4. **非阻塞后续项**（不阻塞本次放行）：`BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE` 待确认；`TRIO_CARD_KINDS.product` 残留（product-code fixture/fallback）；历史零引用导出 3；同形文本 4 组（角色私有数据）；桌面 hub 目标数据化/version-decision preflight（需 Pipeline 公开只读句柄）；Pi 其他 native 方法 legacy 转发；Git-action preflight（Git Service/宿主单元）；`role.*` messageKey 为内部诊断键（i18n 未登记，按 E2 评审决定）；E0.3 §4.2 `intent-entry-contract` 消费者文字陈旧（策划下一版本处理）。
5. **形式缺口**：部分单元 oracle compare 因源码锚点删除不可复跑（只读探针复验 0 差异）；编排全量偶发 post-test 不退出（隔离复跑正常）；`interactive-execution-mode` 非登记 post-test 泄漏（隔离 natural pass）。

## 三、放行范围

- 放行到：**提交（commit）→ 推送（push）→ PR → 合并（merge）**（本变更范围内，依「全权委托」）。
- **不授权**：发布/tag/运行包、跨变更范围改动、候选之外的源码改动。
- 合并后如需改动：候选变化 → 受影响证据失效并按 B1 重取；发布另议。

## 四、提交分组建议（按既往 PR 先例）

> 既往惯例：**原始证据目录（`角色卡/*/docs/change/*-evidence/`）不入库**（e71501c/PR #68 等 0 个 evidence 文件，留工作树）；角色卡文档/变更摘要入库；管理文档按变更留痕入库。建议三组提交（同一 PR 或 PR 内分提交均可）：

| 组 | 内容 | 规模（约） |
| --- | --- | --- |
| **A. 产品/测试候选** | T3 证据 `07-candidate-files.txt` 的 97 文件：`src/common/roles/**`、`src/common/gates/**`、`src/model/{runtime,role}.ts`、`src/service/runtime/session.ts`、`src/service/role/resolve-role.ts`、`src/common/{门禁引擎,codex-adapter,pi-adapter}/**`、`src/provider/{claude/session.ts,runtime/tools.ts}`、`src/pipeline/orchestration/{trunk-runtime,run-role,version-change-runtime,govern-session}.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/common/编排/workflow-preconditions.ts`、`test/**`（roles/gates/编排/runtime-core/adapters/测试） | 97 文件（20 M + 77 ??；45 src + 52 test） |
| **B. 治理记录** | 8 个新角色目录（`角色卡/{chief-code,product-code,rapporteur-code,nominator-code,convener-code,verifier-code,shared-code,gates-code}/`：卡/边界/YAML/changelog + feature-map/memo/functional-description/api-spec + `docs/change/*.md`）；PM/门禁引擎/编排角色卡与边界变更；`角色卡/招募/memo.md`；各角色 change 摘要（**排除**所有 `*-evidence/` 原始目录） | 以 `docs/change/*.md` 摘要为主；原始证据留工作树 |
| **C. 管理文档** | `docs/communication/`：本变更 intent/preauthorization/gate-confirmation/authorization-trunk-verify-gate-fix + memo；`docs/planning/`：P1.6 方案、复核、E0.3 契约 + memo；`docs/scheduling/`：团队计划、派发记录、切换日志、E0/E2 评审、冻结记录、P1/E3 变更包、本放行记录 + memo；`docs/acceptance/`：B1 v1/v1.1、E0 可判性、B2 报告 | 本变更记录（详见排除清单） |

**建议排除（不并入本变更提交）**：
1. **T1 三文件**（属独立 T1 变更）：`src/common/claude-adapter/schema.ts`、`test/claude-adapter/schema.test.ts`、`test/claude-adapter/session.test.ts`。
2. **原始证据目录**：`角色卡/*/docs/change/*-evidence/`（含 E3 T3 日志 ~11MB、扫描 44 文件等）；按既往惯例留工作树；目录内摘要 md 入 B 组。
3. **临时文件**：`.tmp-*`（脚本/截图）、`.pr-body-*`、`.commit-msg-*`。
4. **其它变更的文档**（示例，不属于本变更）：`docs/communication/2026-11-04_*`、`2026-11-05_*`、`2026-11-07_authorization_claude-schema-fix.md`（T1）、`2026-11-07_decision_closeout-suspended.md`、`2026-11-07_intent_real-closed-loop-run.md`；`docs/planning/2026-11-04_*`、`2026-11-05_*`；`docs/scheduling/2026-11-04_*`、`2026-11-05_*`、`2026-11-07_change-package_direct-role-capabilities-closeout.md`、`2026-11-07_owner-write-set-mapping_direct-role-capabilities-closeout.md`、`2026-11-07_fix-routing_claude-schema-if.md`（T1）、`trunk-amendment-model-change-v*.md`；`docs/acceptance/2026-11-07_claude-schema-fix-report-v1.md`、`2026-11-07_direct-role-capabilities-closeout-report-v1.md`、`governance-authority-matrix-*`、`trunk-amendment-model-*`。
5. `.env`（如被改，不入库；忽略规则既有）。

## 五、PR 描述披露要求

1. 分支含**此前未验收的检查点提交 `e71501c`**（“checkpoint Chief workflow and Git role integration”），本 PR 在其上叠加本变更；PR 描述须显式说明，不得把该检查点当作本变更验收对象。
2. 本变更 **B2 结论与限制**（冻结脏基线、非确定性、P1-RR 仅父门+任务创建、下游门另案、RR2 N/A）。
3. 冻结候选身份（聚合 `7bbff9bd…`）与 B2 报告 hash（`8bbeb459…`）。
4. 发布/tag 未授权；合并后发布另议。

## 六、状态

- **E3 放行完成**：B2 pass + 限制已记录；进入提交/推送/PR/合并阶段（由沟通执行）。
- 本记录只写 `docs/scheduling/`；未改源码/测试/角色卡/边界/验收结论；未提交/推送/合并/发布。