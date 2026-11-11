# RR 执行计划：两条固定工作流路径（空项目→贪吃蛇，2026-11-10）

- **任务 ID**：`2026-11-10-two-fixed-workflow-paths`
- **状态**：**待协调方批准预算与 3 项预 RR 确认后执行**；未批准前不启动。
- **候选**：`feat/two-fixed-workflow-paths`，代码候选 `79e16a1`（B2 复判通过确定性范围；之后仅 docs 提交 `95f9cdb`，代码零差异）。RR 使用当前 HEAD（代码同 `79e16a1`），记录候选 hash。
- **B1**：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.1.md`（`e2ad4701…`）；RR-01…RR-06 为唯一未取证项。
- **纪律**：只在隔离目标项目内验证；**不合并 ans-studio main、不打 tag、不发布产物、不请求客户放行**；客户仅回答 3 张确认卡 + 1 张 merge-main 高风险卡；失败即停、不自动重试。

## 一、环境（隔离）
- **目标项目**：全新空目录（仓库外），例如 `%USERPROFILE%\Desktop\work\ans-rr-two-fixed-paths-2026-11-10\target`；不触碰既有贪吃蛇 target/roots。
- **Electron**：真实 Electron 主进程/渲染；独立 `userData`/session 目录（目标项目内或独立临时目录）；**不使用 9222/9223**；远程调试仅在必要时用隔离端口（如 9334），或不开；独立 `ANS_E2E_OUTDIR`。
- **模型**：真实模型（不伪造）；模型 provider/凭据由运行环境提供，不读取/打印 `.env`；预算单独报告。
- **Git**：目标项目内普通 git；`git init -b main`/任务分支/本地合并；不 push/tag；不操作 ans-studio 仓库。

## 二、预算（申请值，以协调方批准为准）
- 客户消息 **1** 条（贪吃蛇需求）；客户卡 **≤4**（意图/方案/任命 + merge-main）。
- 派发 **≤20**；幕僚 ≤8、运营 ≤4、产品/策划/人事/验收各 ≤4、实现写任务 ≤4；Git add/commit ≤12。
- 墙钟 **≤90 分钟**；失败即停、不重试、不追加。
- 模型轮次/费用单独报告；本计划不含预算批准。

## 三、步骤（RR-02，路径 A）
1. 导入空项目 → 打开幕僚 → 客户需求「做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）」。
2. 幕僚判断路径 A，发 A1 阶段请求；运营派产品 → `docs/product/snake-intent-v1.md` → 意图卡（客户 confirm）。
3. 运营派策划 → proposal/modules/roster/architecture/contract → 方案卡（客户 accept）。
4. 运营派人事 → 角色卡/边界/激活（env-bootstrap 或合法省略）；运营写团队计划 + A9 基线（git init -b main、`.gitignore` 托管、文档 hash 入账、团队计划结构校验、任务分支）。
5. 任命卡（客户确认）→ A10 完成 → A11 stage-request → 运营派实现角色；实现角色在 `ans/task/<workflowId>` 真实 add/commit。
6. 幕僚派验收：A12a criteria（先于 A11 或按 B1 口径）→ A12b report；应用生成 `docs/acceptance/snake-acceptance-v1.md`；不通过返工。
7. 运营汇总 → 应用自动呈 merge-main 客户卡 → **客户本人确认**（judge 不可代批）→ 应用本地合并 main（不 push/tag）→ 客户可玩/可开。
8. 检查：`.ans/state/workflows/basis/releases` 事件完整；`.ans/trunk`/`.ans/runs` 未写；`docs/audit/shell-gate.jsonl` 有 git 审计；`.gitignore` 托管块生效；3 张卡各一次 + merge-main 一次；无额外客户门；无 judge 冒充客户。

## 四、路径 B（如时间/预算允许，RR-02 后）
- 在目标项目内对贪吃蛇做一次小修改：B1 专业影响面 → B2 scope → B3 实现（写集∩roster/边界）→ B4 发布（不要求 A12b）→ merge-main 客户确认。
- 若预算不足，路径 B 由确定性测试 T-12 覆盖并披露；不伪造 RR 通过。

## 五、证据
- 会话日志/截图、卡片记录、账本导出、`git log`/`git status`、`docs/acceptance` 文件、shell-gate 审计行、模型轮次/费用。
- 候选 hash（代码 HEAD/全部实现提交）、隔离环境证明、无 9222/9223、ans-studio 未合并/未发布。
- 失败即停：保留现场/日志/账本，按真实错误回报；不重试、不绕过、不上报成功。

## 六、预 RR 确认（待协调方）
1. `89e0ed6` 的 chief/product `api-spec/memo/feature-map` 属角色自有记录：B1 v1.2 明确为记录（H1=0、纯文档）或移除。
2. TM-5 同名 known-red 字面量 5→7（无新增失败）按 known-red 披露接受。
3. RR 不做治理文档修正；`amendBasis` 无生产调用点；如需服务调用须书面授权、不得绕过 basis 账本。

## 七、出口
- RR-01…RR-06 全部 pass → 最终 B2（同一候选）→ 交付报告；仍不合并 ans-studio main、不发布/tag；合并 ans-studio main 需客户逐 PR 确认。
- 任一 RR fail/阻塞 → 停止、保留证据、回报；不伪造通过。
