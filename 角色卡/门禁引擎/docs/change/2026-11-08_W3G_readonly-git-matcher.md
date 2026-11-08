# W3-G 变更证据：只读 Git 精确白名单 matcher / 规范体 / 分类器与写守卫收窄 / 规则集 v4

- 日期：2026-11-08；记录角色：门禁引擎（独立固定上下文）。
- 任务：`2026-11-08-session-admission-approval`（flowId `session-admission-approval-based`）W3-G；派发记录 `docs/scheduling/2026-11-08_dispatch-log_session-admission-approval.md` §二 I0 / §三 W3-G。
- 设计基准：P1.3 `docs/planning/2026-11-08_design_session-admission-approval-based.md`（855 行 / 130013 bytes / SHA-256 `2553b97ac2338c786f17c860153c1b30abc874c4ffc84392954a5d7f949166e3`）§2.4.3、§4.1、§4.3、§4.5、§6.1。
- 复核记录：`docs/planning/2026-11-08_review_session-admission-approval-based.md`（F5/F13、R4/R5/R7 及其关闭状态）。
- B1 冻结标准：`docs/acceptance/2026-11-08_session-admission-approval-criteria-v1.md`（AC-6/AC-14/AC-16/AC-22/AC-29/AC-30；§3.2/§3.3）。
- 代码基线：worktree `.claude/worktrees/trunk-amendment`，HEAD `a1b2f662bf951ad039365bbbfe64caad9283fcd1`；工作树另有 T1（Claude schema 窄修复）未提交差异（`src/common/claude-adapter/schema.ts`、`test/claude-adapter/session.test.ts`），只读、不属本写集、未被本批次修改。并行批次 W1（shared-code）也在同一 worktree 落地 `src/common/shared/shell-approval-binding.ts` 及其测试/证据（同样不属本写集、未被本批次修改或导入；本批次前后两次门禁引擎套件对照的失败集合与计数同名同数，见 §三）。
- 纪律：本批次未 commit / 未 push / 未暂存 / 未合并 / 未发布；未改本写集外任何文件（含 `test/编排/`）；未判验收。

---

## 一、写集与逐文件 SHA-256（候选实测）

| 文件 | 行数（前→后） | SHA-256（本批次候选） |
| --- | --- | --- |
| `src/common/门禁引擎/classify-shell.ts` | 1878 → 2223 | `60cef0394653086eda03136d6c7af6e974271162fc856a3a93454499910ea723` |
| `src/common/门禁引擎/shell-write-guard.ts` | 756 → 772 | `579964dd57074ebda5fa4e95ccb2271ada131c878d244b431a4b10514d671e11` |
| `src/service/gate/shell-rules.ts` | 21 → 31 | `0ea4729b014d25dc21a3d3196b9db253a22ce62a72607485f2d4847fc48aa3c7` |
| `test/门禁引擎/classify-shell.test.ts` | 685 → 698 | `362950de1b937e5f25c86ab150f0de157f9a2dea3368d2c29bd632a13bb18aa0` |
| `test/门禁引擎/shell-write-guard.test.ts` | 341 → 383 | `8f7524a629c825fc92c3cf958081209ebd0c5770160931a4701ffe20c78895ff` |
| `test/门禁引擎/git-shell-acl.test.ts` | 886 → 893 | `be8f31be786c9faba9411771c212a55c3184fbadce1e40c0ff50e37c07e04706` |
| `test/门禁引擎/shell-rules-public-reexport.test.ts` | 51 → 72 | `5b35413e74de0ec5acd1a29efac37faacd28dac05b2c3ecc670be68e02a70ae4` |
| `test/门禁引擎/readonly-git-matcher.test.ts`（新增） | 0 → 372 | `3d7caed4ee0da18633d73e64fbc17edaaa8715322d41b6e20415592ea11e6343` |

`git diff --stat`（不含新增/证据文件）：7 files changed, 516 insertions(+), 61 deletions(-)。`git status --porcelain` 覆盖确认：本批次改动全部落在 `src/common/门禁引擎/`、`src/service/gate/shell-rules.ts`、`test/门禁引擎/`、本证据目录内。

## 二、实施内容

1. **单一来源 matcher/规范体**（`classify-shell.ts`）
   - 新增 `ReadonlyGitTemplate`（10 子命令）与 `ReadonlyGitMatch`（`{id,template,target?,other?,paths,limit?,oneline?,display?,catFileMode?,lineStart?,lineEnd?}`）。
   - `matchReadonlyGit(argv)`：纯函数；`git` 后第一项必须是子命令（任何全局选项/`-c`/`-C`/`--git-dir`/`--work-tree`/`--version` 等一律拒绝）；每子命令只接受 §2.4.3 精确 flag/参数，未列即拒；路径须字面项目相对路径（非空/非绝对/无 `..`/`.`/空段/`.git` 段/通配/`:(…)` magic/反斜杠/NUL 控制字符）；OID 必须完整 40/64 hex，`HEAD` 仅允许 `log` 目标、`rev-parse --verify`、`ls-tree` 目标、`merge-base` 参数位置；`log` 无目标默认 HEAD（不是 `--all`）、`-N` 1..100；`blame -L` 行号 1..2000、跨度 ≤2000。
   - `buildReadonlyGitBody(match)`：规范 argv 体单一来源（status/log/diff/show/rev-parse/ls-files/ls-tree/merge-base/blame/cat-file）。
   - `gitQueryBody` 加 `export` **仅供同仓测试差分对照**；未在 `shell-rules.ts` 再导出（不扩大公共出口）。
2. **分类器**（`classifyShellDetailed`）：删除「所有裸 Git 无条件硬拒」，改为「`matchReadonlyGit` 命中 ⇒ `allow`，ruleId `allow:readonly:git:<id>`；未命中 ⇒ 保留 `deny:raw-git-controlled-tools-required`」。判定位置仍在 `hardDeny`/`denyTokens`/`risky`/`readonly` 分支**之前**；分类器不区分入口（allow 供 run_shell；后台入口由写守卫拒绝）。
3. **写守卫**（`shell-write-guard.ts`）：与分类器**同一函数引用**使用 `matchReadonlyGit`；`ShellWriteGuardInput` 新增可选 `entry?: "run_shell" | "start_background_task"`（既有调用方不传仍编译/行为兼容）；`entry !== "start_background_task"` 且命中 ⇒ `pass`，其余 Git 维持 `shell-write-hard-deny`；删除已不可达的 `READONLY_GIT_SUBCOMMANDS` 与 `opaqueWriteCapableReason` 的 git 分支（消除第二份宽松白名单）。注释写明「接 (a) 的装配路径必须注入本守卫；只读档不接 (a)、`c=deny` 即终结」。
4. **Service 公共出口**（`src/service/gate/shell-rules.ts`）：逐字再导出 `matchReadonlyGit`、`buildReadonlyGitBody` 与类型 `ReadonlyGitMatch`/`ReadonlyGitTemplate`（同一函数引用，不复制实现）；头注更新（编排 trunk `executeReadonlyGit`/运行时路由的合法注入源；私有实现不经此出口）。
5. **规则集 v4（I0-5）**：删除 `defaultReadOnly()` 中不可达 `readonly:git` 条目；`SHELL_RULES_VERSION` `"3"`→`"4"`；规则集 id `ans-default-v3`→`ans-default-v4`；版本注释记录迁移理由。**不兼容读 v3**：`validateRules` 只认常量版本，v3 规则集/项目级 pin 一律整条拒绝（fail-closed，不静默放宽）。迁移理由：删除死条目属于规则数据变化；保留不可达条目会被误读为仍生效并形成双口径（设计 §4.4 推荐方案）。
6. **测试**：更新 `classify-shell.test.ts`（只读 Git allow / 非白名单仍 deny / ruleId 口径固定 / v4+id 断言）；`shell-write-guard.test.ts`（git status 仅非后台入口 pass；clean/checkout/restore 等 deny；`entry=start_background_task` 时只读 Git deny）；`git-shell-acl.test.ts`（只读精确形态 allow/pass、别名/写形态/全局选项仍硬拒）；`shell-rules-public-reexport.test.ts`（matcher/规范体同一引用）；新增 `readonly-git-matcher.test.ts`（全形态 + 攻击矩阵 + 边界 + 差分）。

## 三、受影响套件实施前后对照

命令（前后一致）：`node --test "test/门禁引擎/**/*.test.ts"`（Node v24.22.1，Windows 11）。

| 阶段 | tests | pass | fail | skipped | 备注 |
| --- | --- | --- | --- | --- | --- |
| 实施前（HEAD `a1b2f66` + 既有工作树） | 426 | 420 | 5 | 1 | 5 个失败全部为**既有红**，与本任务无关（角色卡文本/listProject 类） |
| 实施后（本批次候选） | 449 | 443 | 5 | 1 | 失败与基线**同名同数**；新增确定性失败 = 0，新增 skip = 0 |

既有红（实施前后一致，非本批次引入）：
1. `test/门禁引擎/convener-workflow-write.test.ts`「卡文本：运营负责落盘工作流，幕僚不再被暗示为写者」
2. `test/门禁引擎/convener-workflow-write.test.ts`「渲染过滤：section=roles/routing 与注册表展示字段出现在文本中」
3. `test/门禁引擎/list-project.test.ts`「listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告」
4. `test/门禁引擎/list-project.test.ts`「listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留」
5. `test/门禁引擎/view-image-cards.test.ts`「D-10：质检卡保留可选质量核对与截图上限，不要求录屏」

跨角色受影响套件（只读运行，未修改其文件；用于记录迁移状态）：

| 文件 | 结果（实施后） | 与设计 §4.5 对照 |
| --- | --- | --- |
| `test/编排/shell-readonly.test.ts` | 9/9 pass | **既有红转绿**（原 8 pass/1 fail，`git status` 放行断言） |
| `test/编排/shell-gate.test.ts` | 35/35 pass | **既有红转绿**（原 readonly 裁定 A 的 `git status` 放行断言） |
| `test/编排/shell-risky-order.test.ts` | 20/20 pass | 该文件注入 stub classifier（`() => "risky"` 等），不经 `validateRules`；硬编码 `version:"3"` 为惰性夹具，故未如设计 F6 预期失败。仍列编排同步项（口径一致性，见五） |
| `test/测试/lightweight-permission-repairs.test.ts` | 4 pass / 6 skip / 0 fail | 其 `git status/diff/log → allow` 断言（POSIX 段）在新规则下成立；本机按既有条件 skip |

## 四、typecheck

`npm run typecheck`（`tsc --noEmit`，含 `src`/`test`/`app`）在源码与测试改动后运行两次，均以退出码 0 结束、无诊断输出。

## 五、攻击矩阵与差分记录

### 5.1 §2.4.3 攻击矩阵（逐条落在 `test/门禁引擎/readonly-git-matcher.test.ts`，全部断言 `matchReadonlyGit === undefined` 且分类器 `deny:raw-git-controlled-tools-required`）

- 全局选项/改变目录或仓库：`git -c core.fsmonitor=helper status`、`--config-env=…`、`-C <other>`、`--git-dir`、`--work-tree`、`--exec-path`、`--namespace`、`--bare`、`--no-pager`、`--literal-pathspecs`、`--version`、`--help`、裸 `git`。
- 写盘/外部程序 flag：`status --output=x`、`log --output x`、`log -o x`、`diff/log --ext-diff`、`show/blame --textconv`、`cat-file --filters`、`show --open-files-in-pager=…`、`show -O …`、`log --paginate`。
- 任意路径/远程/网络：`diff --no-index <a> <b>`、`diff --submodule=…`、`fetch --upload-pack=…`、`push --receive-pack=…`、`ls-remote`、`status; rm -rf .`、`log --all`。
- 路径攻击：`../`、绝对路径、盘符路径、`.git/config`、`.GIT` 段、`:(glob)**`、`*`/`?`/`[]`、反斜杠、`:`、空路径、`.`、`src/../a.ts`、`-x`、控制字符；`show <oid>:../../etc/passwd`、`show <oid>:.git/config`、`show <oid>:docs/*.ts`、`show <oid>:`。
- 行号/数量上限：`blame -L 1,999999999`、`-L 0,10`、`-L 10,5`、`-L 1,2001`、`-L 1,+10`；`log -0/-101/-1234/-05`、重复 `--oneline`、双目标、`diff` 三个 OID、`--porcelain=v2` 等。
- 边界：OID 短 SHA/39/41/63/65 位、`HEAD~1`、分支名、`head` 小写；`HEAD` 仅 `log`/`rev-parse`/`ls-tree`/`merge-base` 位置；路径必须位于 `--` 之后。
- 入口（AC-22）：`entry=start_background_task` 时上述 10 种只读形态在写守卫**全部 deny**（`shell-write-hard-deny`），`run_shell`/缺省 ⇒ pass。

### 5.2 与 `gitQueryBody` 的差分（`readonly-git-matcher.test.ts` 末尾两组测试）

- **重叠模板同一规范 argv**（逐条 deepEqual）：status、log（显式目标+limit）、diff（无显示 flag）、show、rev-parse、ls-files、ls-tree（显式目标）、merge-base。
- **允许的分叉（逐条记录）**：
  1. `log` 无目标：只读 shell 规范体默认 `HEAD`（F1/Q1/Q2 客户可见权衡）；结构化 `gitQueryBody` 仍默认 `--all`。
  2. `log --oneline`：只读 shell 路径支持的显示 flag；结构化模板无此形态。
  3. `diff` 显示类 flag（`--stat`/`--name-only`/`--name-status`）：只影响输出，规范体原样保留；结构化模板不带。
  4. `ls-tree` 无目标：只读 shell 规范体默认 `HEAD`；结构化模板要求显式 target（无 target 返回 undefined）。
  5. `blame`/`cat-file`：结构化模板清单（`src/model/trunk.ts:476-478`）不含，属新增 shell 只读面（受 §2.4.3 参数约束），无对应模板可差分。
- 除上述分叉外，未发现第三份无测试的模板实现。

## 六、I0 接口约束确认（本批次适用项，偏差=0）

| # | 结论 | 本批次执行情况 |
| --- | --- | --- |
| I0-4 | 只读 Git 路由采用注入能力对象；matcher 经 `shell-rules` 公共出口同一函数引用；不得出现第二份 matcher/规范体 | `matchReadonlyGit`/`buildReadonlyGitBody` 单一实现于门禁引擎，经 `shell-rules` 逐字再导出（同一引用）；`ReadonlyGitMatch` 类型经 `shell-rules` 类型再导出。`GovernedToolsOptions.readonlyGit`/`executeReadonlyGit` 属运行时核心/编排写集，未在本批次实现（见跨角色待办） |
| I0-5 | `SHELL_RULES_VERSION` 3→4、`ans-default-v3`→`ans-default-v4`、删除死 `readonly:git`、同步夹具/断言、不兼容读 v3 | 已全部执行；本角色测试夹具/断言已同步 v4；`test/编排/shell-risky-order.test.ts:39` 为编排写集、未改（该用例如上仍通过，但口径需同步）。全仓搜索：src 内无 v3 pin/持久规则集读写点；`test/roles/product/fixtures/product-differential-fixtures.ts:333` 的 `version:"3"` 属 `baseTrunk` 夹具，与 shell 规则集无关 |
| I0-7 | 审计 `by` 以 `ruleset:allow:readonly:git:<id>` 为前缀；`readonlyGit.canonicalArgv` 与实际执行体一致（单一来源 `buildReadonlyGitBody`） | ruleId 固定 `allow:readonly:git:<id>`（`shell-gate` 既有 `byTagged` 会加既有档位后缀，符合前缀口径）；规范体单一来源已就绪。`ShellAuditRecord.readonlyGit` 字段属编排 `shell-audit.ts` 写集（见跨角色待办） |
| I0-9 | 依赖方向：`ReadonlyGitMatch` 具体类型由门禁引擎定义并经 `shell-rules` 类型再导出；model 侧能力接口对 match 保持不透明；不得第二份定义 | 已按此实现；`src/model/` 未改动；`shell-rules` 为唯一公共类型出口，未出现第二份定义 |

## 七、偏差与实施判定记录

- **I0 偏差 = 0**；设计 P1.3 语义与写集内要求全部落地。无写集外文件改动；无阻塞。
- 实施判定（非偏差，记录口径）：
  1. 写守卫入口判定按派发口径 `entry !== "start_background_task"` ⇒ pass（而非严格 `entry === "run_shell"`），与「可选 `entry`、既有调用方兼容」一致；分类器不区分入口。
  2. 程序名按 basename 归一（`git`/`git.exe`/带路径），与既有裸 Git 检测同一判据；N12 要求执行层不按 PATH/cwd 解析（固定传输），模型提供的程序名只用于匹配——`git-shell-acl.test.ts` 已断言带路径只读形态 allow/pass、带路径写形态 deny。
  3. 路径允许目录尾斜杠（如 `src/`）、拒绝空段/`.`/`..`/`.git` 段；与既有 `gitPath` 口径一致并更严格（另拒控制字符）。
  4. `log` 的 limit/`--oneline`/目标顺序按集合解析（至多各一次），不是严格按表内顺序；形态集合与 §2.4.3 等价。
  5. `risky:git-output-write`/`risky:git-write` 保留为数据纵深并注明默认规则集下不可达（派发只要求删除 `defaultReadOnly()` 的死条目；保留不构成放行依据）。

## 八、跨角色待办（不属本写集，均未执行）

1. **编排（W1b/W2b/W3b）**：`test/编排/shell-risky-order.test.ts:39` 的 `version:"3"`/规则集 id 夹具同步为 v4 口径（当前因 stub classifier 不经 `validateRules` 而仍通过；属一致性问题，非本批次新增失败）。
2. **编排（W1b/W2b/W3b）**：在 `shell-gate`/`run-role` 的 `run_shell` 与 `start_background_task` 两条路径向 `evaluateShellWriteTargets` 注入真实 `entry`；接 (a) 的装配路径（项目三层链/内置角色审批档）必须携带 writeGuard 并加注入断言（AC-14/AC-30）。
3. **编排（trunk Provider）**：新增固定传输只读入口 `executeReadonlyGit(projectRoot, match, budgets)`（绝对可执行 + 固定 config/env + `buildReadonlyGitBody`），经 `src/provider/trunk/public/trunk-store.ts` 导出（I0-4）。
4. **运行时核心（W2-R/W4-R）**：`GovernedToolsOptions.readonlyGit` 能力注入与 `run_shell` 路由（命中 matcher ⇒ `execute`；能力缺席/未命中 ⇒ `readonly-git-runner-unavailable`，绝不回退通用 spawn，I0-4）。
5. **编排（shell-audit）**：`ShellAuditRecord.readonlyGit:{id,canonicalArgv}` 必做字段与 `by` 前缀口径（I0-7）；本批次已保证 ruleId/规范体可供消费。
6. **测试（D1/E3）**：`test/编排/shell-readonly.test.ts`、`test/编排/shell-gate.test.ts` 的既有红已转绿（本批次只读复跑证据见 §三）；`test/测试/lightweight-permission-repairs.test.ts` 的 POSIX 段未在本机执行（skip），需在 POSIX 环境复核。
7. **测试/验收**：真实运行与 `readonlyGit.canonicalArgv` 对照、AC-6/AC-16/AC-22/AC-29/AC-30 的跨角色集成证据由 D1/E3 汇总。

## 九、结论

W3-G 的写集内实现、测试与证据已完成：只读 Git matcher/规范体为单一来源并经 `shell-rules` 同引用再导出；分类器与写守卫收窄符合 §2.4.3；规则集 v4 已迁移且不兼容读 v3（fail-closed）；受影响套件实施前后对照无新增确定性失败；typecheck 绿；I0 偏差=0。未 commit/push/merge/发布，未判验收。
