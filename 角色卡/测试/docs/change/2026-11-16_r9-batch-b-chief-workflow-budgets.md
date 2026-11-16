# R9 批 B：chief-workflow 发布回合预算（turnLastResortMs 按变体放宽 + 用例预算同步）

- 日期：2026-11-16（文件名按批次日；实际执行于 2026-11-17 00:05–00:20）
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9b`（分支 `fix/test-debt-r9b`，起点 `da805ec` = `origin/main`）
- 写区：**仅** `test/桌面应用/chief-workflow.test.ts`（单文件；20 insertions / 3 deletions）
- 依据（权威归因）：
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan-r9-update.md` §3.3、§4 批 B
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan_r9-evidence/03-error-bodies.md` §3、`05-chief-workflow-trace-labels.md`
  - R9 三平台 CI run **43887939365**（`main @ 77d3505`，三平台工件）
- 边界：未改产品 `src/**`、`app/**`、`.github/**`、release-policy、main；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占用 9222/9223/9224。测试产生的临时目录已清理，未提交任何生成物。

## 1. 根因引用（不重开归因，只引用）

- 共享失败断言 `test/桌面应用/chief-workflow.test.ts:1945`：
  `Actual publication/notice turns must settle and creator basis arrive`——要求 `closeBasis !== undefined`。
- `closeBasis` 由 `:1786-1789` 收到 `[工作结果] ... W21 publication completed` 时写入；R9 trace 证明该完成回交被替换为
  `[工作结果] ... 状态：failed ... 本轮执行超时`（`src/common/编排/handback.ts:543`，仅 `timed_out` 产生），
  `timed_out` 仅由夹具注入的 `turnLastResortMs` 产生。
- 夹具在 `:1813` 注入 `turnLastResortMs: 4500`；x64/Windows 慢 runner 上真实发布回合
  （version-upgrade Git 应用 + 通知入队 + 完成回交）>4.5s 被中止 → `closeBasis` 永不产生。
  arm64 同名用例 7.2–9.2s 全绿、Windows「W30 连续写入后」10.5s 绿 ⇒ **产品行为正确，纯夹具预算问题**。
- W34 x64 叠加预算矛盾：用例预算 18000ms（`:1703`）< 通知等待 20000ms（`:1934`），测试级超时先发生。
- W35 x64 是 W34 超时后 product 会话 `disposing` 滞留的级联（`waitForCoreRegistryQuiescent` pre-open 15s 抛出）。

## 2. turnLastResortMs 审计表

文件内全部注入点（行号为改前基线 `da805ec`）：

| 行 | 值 | 用例 | 是否依赖超时/4.5s 语义 | 处置 |
| --- | ---: | --- | --- | --- |
| `:756` | 5000 | W3 默认 Core→CodexChat 本地 HTTP 查询 | 否——真实 git_query 快速回合的惰性上限 | 保留 |
| `:932` | 5000 | W5 专字段 workSourceRef（6 变体） | 否——初始化/派发快速回合（门闩由测试 promise 控制，非定时器） | 保留 |
| `:1089` | 5000 | W10 required 来源准备 | 否——快速来源回合 | 保留 |
| `:1127` | 5000 | W10 四模式回调 | 否——快速安装/拒绝回合 | 保留 |
| `:1251` | 4000 | W14/W23/W22 冻结/拒绝矩阵 | 否——真实拒绝路径，回合自然结束 | 保留 |
| `:1650` | 4000 | W20 产品真实报告落账（普通/竞争） | 否——写文件+报告回合（非 Git 发布）；R9 三平台均绿 | 保留 |
| `:1813` | 4500 | **W21 家族 loop（14 变体共享 makeDesktop）** | **是（根因）**——W29 系列/W30×2/W34 的真实发布回合被中止 | **放宽**：`W21_TURN_LAST_RESORT_MS = documentChange ? 30_000 : 4_500` |
| `:2195` | 5000 | W36 五 builtin 准备 | 否——只读准备/拒绝回合 | 保留 |
| `:2415` | 8000 | W47 忙 Chief 独立判定 | 否——主回路由 release promise 控制；上限仅兜底 | 保留 |
| `:2494` | 6500 | W48 controller 停止矩阵 | 否——快速准备/拒绝回合 | 保留 |

补充审计结论：

1. **本文件不存在“刻意验证「本轮执行超时」替换回交”的用例**：对 `本轮执行超时`/`timed_out` 的全文搜索只命中注释；没有任何断言依赖该终态或文案。
   `terminal-fallback` 断言（W19 `:1509`、W21 `:1977`）属于「回合结束但无显式报告时的终态回退」机制，与 `turnLastResortMs` 无关，未触碰。
2. 因此没有“必须保留 4500”的超时语义用例；W21/W28 也含真实发布回合，但 R9 三平台该类全绿（发布均在该 runner 的 4.5s 内完成），按 R9 建议保留 4500，属保守不动而非断言需要。
3. **teamPlanning/W34 走同一发布回合路径（代码判定）**：teamPlanning 属 `documentChange`；其发布由同一 `:1782` 派发分支进入
   product 的 `:1784` `ans_submit_version_change` + `:1785` `ans_submit_report`，并复用同一 `makeDesktop` 的同一 `runtimeOptions`
   （`:1813`），仅文档集合在 `:1793` 替换。R9 证据（Windows W34 trace：`[26] DISPATCH role=product → [27] NOTICE role=chief`、
   无 `w34-close-publication`；与 W29 同形态）与代码一致 ⇒ **按同一根因放宽**。

## 3. 改动清单（单文件）

`test/桌面应用/chief-workflow.test.ts`：

1. `:1702` 后新增命名常量（含 CI 证据注释）：
   - `W21_TURN_LAST_RESORT_MS = documentChange ? 30_000 : 4_500`
     ——仅真实发布变体（W29×3、W29 missing-confirmation、W30×2、W33、W34、W35）放宽到 30s；W21×2、W28×2 保留 4.5s。
   - `W21_CASE_TIMEOUT_MS = documentChange ? 60_000 : 12_000`
     ——去除 teamPlanning 18000 < 通知等待 20000 的自相矛盾；满足 R9 建议 documentChange ≥45s、teamPlanning 45–60s（取 60s）。
   - `W34_PUBLICATION_CLOSE_WAIT_MS = 20_000`
     ——W34 的 `:1915` 等待覆盖「提案回交 → 真实发布回合（放宽后兜底 30s）→ 原创建者关闭」整链；旧默认 6500ms 小于放宽后的回合兜底，
     慢 runner 上会先于产品回合完成而到期。只放宽有界等待窗口，谓词与失败信息不变（同 x64fu 对 `:1933` 通知等待 6.5→20s 的既有口径）。
2. `:1703` 用例预算：`{ timeout: teamPlanning ? 18000 : documentChange ? 30000 : 12000 }` → `{ timeout: W21_CASE_TIMEOUT_MS }`。
3. `:1813` `turnLastResortMs: 4500` → `turnLastResortMs: W21_TURN_LAST_RESORT_MS`。
4. `:1915` teamPlanning 等待显式传 `W34_PUBLICATION_CLOSE_WAIT_MS`。

保持不变（逐项确认）：B1b 夹具句柄释放/有界清理/文件级 server 兜底；B4/B6.1/B7.1 legacy 夹具与断言；W19/W33 语义与断言；
x64fu 的 `waitForCoreRegistryQuiescent`（15s 有界，pre-open 抛诊断、teardown 只记录）及 `:1933` 20s 通知等待全部原样保留。
**零断言文本/语义改动、零删测试、零跳过。**

## 4. 验证（本机 Windows 11，Node v24.22.1）

命令（同 x64fu 既有调用方式，per-test 600s = 当前 CI development-feedback 口径）：

```
node --test --test-concurrency=1 --test-timeout=600000 "test/桌面应用/chief-workflow.test.ts"
```

- **3× 全绿**：`tests 66 / pass 66 / fail 0 / skipped 0`，EXIT=0；总耗时 69.8s / 64.4s / 66.2s。
- 目标家族耗时（3 轮范围）：
  - W29 document-change 6.04–6.69s；wrong-flow 5.71–6.43s；source-loss 5.63–6.05s；missing-confirmation 2.25–2.49s
  - W30 连续写入后 6.23–6.76s；真实重启迁移后 6.41–6.82s
  - W34 teamPlanning 6.50–7.12s；W35 2.05–2.12s
  - 对照保持项：W33 2.23–2.39s；W21 1.38–1.70s；W28 ~0.97–1.04s
- `npm run typecheck` EXIT=0。
- 本机无法复现 4.5s 中止（本机发布回合远快于阈值），以上验证证明**无回归**；x64/Windows 慢 runner 的转绿以第九轮 CI 为准。
- 清理：删除本机 3 轮运行后由晚到异步写重建的 8 个 1–5KB 残余夹具目录；无仓库内生成物；`git status` 仅上述单文件修改。

## 5. 风险与第九轮验收点

### 风险 / 披露

1. **W34 `:1915` 等待放宽为本次主动补充**（R9 最小修法只列了 turnLastResortMs 与用例预算）：若不放宽，`turnLastResortMs` 放宽后
   真实发布回合可在 6.5s 窗口之后才完成，W34 会以同一失败名再红。该改动是**有界等待预算**（谓词/断言不变），与 x64fu 已有口径一致；请复核者确认接受。
2. `:1945` 等待默认窗口（documentChange 6500ms）**未改**：完成路径中 `[工作结果] ... publication completed`（closeBasis）在通知投递之前到达
   （R9 失败 trace 同序：WORKRESULT → NOTICE），该窗口只需覆盖通知确认回合的 settle，6500ms 足够；如 CI 仍红再按 trace 升级。
3. 若 x64/Windows 真实发布回合仍 >30s，`turnLastResortMs` 会再次中止并以同一失败名报告；按 R9 证据（失败整例 14–21s、arm64 绿例 7.2–9.2s）
   30s 约有 1.5–4× 余量。**不要**在无新证据时继续抬预算，按平台候选记录。
4. W21/W28 保留 4500：若第九轮这两族新红，属新观测（R9 未出现），应单独归因而非归入本批。
5. 未发现产品缺陷；所有 W 家族失败均可用夹具预算解释（`handback.ts:543` 为设计内的 `timed_out` 路径）。

### 第九轮验收点（批 B 相关）

1. x64/Windows 上 7 名转绿：W29 document-change / wrong-flow / source-loss、W30 连续写入后 / 真实重启迁移后、W34 teamPlanning、W35（级联消失）。
2. 保持绿：W29 missing-confirmation（三平台）、W33（三平台）、W35 Windows、W21×2、W28×2；x64fu 已绿项（W33、missing-confirmation、task-restart）零回退。
3. 零断言放宽、零删测试：以三平台工件失败名逐名核对；本批若引入新红名，按新残差处理，不得静默排除。
4. 合并宇宙/known-red 口径按 R9 §5 执行（需 A/C/D 批同时合入才可期望 0/0/0）。
