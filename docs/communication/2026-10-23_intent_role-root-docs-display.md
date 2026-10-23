# 意图确认：角色根文档在详情面板展示（v1.7.0）

- 日期：2026-10-23
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认**（客户明确回复「展示 feature-map.md、functional-description.md、api-spec.md；memo.md 默认不展示 这个排期，进 1.7」）
- 目标版本：**v1.7.0**；i18n 全部收口后启动方案/闸门/实施，发布前完成独立验收。
- 独立变更：只做角色详情展示与只读文档索引；不与 i18n、目录 v3、治理写卡门禁、验收返工路由合并验收。

## 客户原话

> 现在这个changgelog，要不要也无所谓，看来。
>
> 展示 feature-map.md、functional-description.md、api-spec.md；memo.md 默认不展示 这个排期，进 1.7

## 闸门 1 确认记录（2026-10-23）

- **客户原话**：「确认 Q9 A：v1.7.0 先只列三个文件名，Windows 点开显示既有不支持提示；正文可读留待后续。其余 Q1–Q12 按推荐。」
- **确认对象**：`docs/planning/2026-10-23_design_role-root-docs-display.md` **方案 v1**（1023 行；SHA-256 `9b69a7864112eb3df0c1da86b6ce653bb9235d4c655ac4d6f3b979e29080c26d`）。
- **确认结论**：Q1–Q12 均按推荐 A；Q9 明确选 **A（Windows 只列文件名，点开显示既有 `UNSUPPORTED_ENVIRONMENT` 提示；正文可读留待后续，不修改 Windows 受限读取 Provider，不把本变更升 T3）**。Q1 三文件固定顺序、Q2 根文档/docs 两组、Q3 `memo.md` 永不展示、Q4 `changelog.md` 可选且不补写、Q5 `docs/` 现有遍历不变、Q6 有内容才渲染/全空才空态、Q7 三文件精确白名单与路径安全、Q8 `api-spec` 的 `not-applicable` 当普通文本、Q10 点击直接打开、Q11 T2/受影响检查+真实 Electron、Q12 v1.7.0/独立验收。
- **确认边界**：本次只确认方案 v1，**不等于实施授权**；不授权改代码/测试/角色卡/边界/flow/账本或动目标项目。下一步由统筹写团队计划并走闸门 2（角色/写集/顺序/验收安排）；实施前由内置独立验收冻结 T2 标准，实施授权另行取得；发布前完成独立验收。方案实质性变更（尤其改 Windows 读取模型/升 T3）需重开闸门 1。

## 闸门 2 确认记录（2026-10-23）

- **客户原话**：「确认团队计划 v1 的角色、写集、无新增角色/边界、T2/S1–S7；在冻结未提交基线 + S1 哈希隔离上实施；实施授权另行取得。」
- **确认对象**：`docs/scheduling/2026-10-23-role-root-docs-display-team-plan.md` **团队计划 v1**（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`；blob `98f41bd0be9c16e1b5556509acc4c581a2c0818c`）。
- **确认结论**：参与角色为桌面窗口、桌面UI、项目管理、测试 4 个现有 worker + 内置独立验收 + 统筹；精确写集按团队计划 §三；**无新增角色、无边界变更**；`src/model/project-document.ts`/Service/Pipeline/Provider 均在桌面窗口 Section 1，`src/provider/project-document/**` 按 Q9 A 零改动；`test/桌面应用/` 不新建文件，`e2e/main.mjs` 仅既有单文件最小追加；T2、S1–S7；Windows 只验列名 + 不支持提示，POSIX 实读另记；独立验收标准先于实施。
- **基线选择**：客户确认在 **i18n、目录 v3、治理写卡、验收返工路由四项已验收但未提交的冻结基线 + S1 逐文件哈希隔离** 上实施；本变更只列相对 S1 基线的增量，不替上游背书、不合并验收。上游提交不在闸门 2 内，需另行明确授权。
- **确认边界**：闸门 2 只确认角色、写集、顺序、验收安排与基线隔离，**不等于实施授权**；不授权派发、改代码/测试/角色卡/边界/flow/账本或动目标项目。实施授权另行取得；若角色、写集、顺序或档位实质变化，重开闸门 2。

## 实施授权记录（2026-10-23）

- **客户原话**：「授权角色根文档展示按团队计划 v1 与 T2 标准 v1 实施 S2–S7；不包含 commit/push/发布/目标写入。」
- **授权对象**：团队计划 v1（488 行；SHA-256 `8ec6e0d7f264a89bad3cb081371079dca8e2785750f29df9769704342f895fa8`）+ T2 标准 v1（784 行；SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`）。
- **授权范围**：按团队计划 §三写集与 S2–S7 实施；桌面窗口、桌面UI、项目管理、测试 4 个现有 worker；无新增角色/无边界变更；`src/provider/project-document/**` 按 Q9 A 零改动；`test/桌面应用/` 不新建；Windows 只列名 + 既有 `UNSUPPORTED_ENVIRONMENT`，POSIX 实读另记；使用 artifact 修复后重冻的 S1 上游快照 `36ae8c046bf61ec8d87b0c18983c2bc725db184343eacd0eea294f3297a3ec5c`。
- **明确排除**：不授权 commit、push、合并、发布或对外操作；不授权写 `ans-gateway` 或任何目标项目；不授权改角色卡/边界/枚举/依赖、Provider/preload/IPC 形状；不授权超出团队计划写集的文件。实施完成后交内置独立验收按标准 v1 判定；验收通过不自动授权提交或发布。
- **变更控制**：实施中若需改方案、角色、写集或顺序，停止并重开对应闸门；不得以实施授权替代闸门。

## 现象与根因（只读）

- 点击角色后，详情面板的“变更记录”和“文档”为空。
- `app/desktop/project.ts::readRoleDocsIndex` 只索引角色目录下的 `changelog.md` 与 `docs/` 子目录；不索引角色根文档。
- 目标项目角色目录通常只有 `role-card.md`、`boundary.yaml`、`feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md`，没有 `changelog.md`/`docs/`，所以两栏必然空。
- `role-card.md`/`boundary.yaml` 已有专门栏；“文档”栏没有入口展示其余根文档。

## 意图理解

1. 在角色详情的“文档”区增加**角色根文档**，展示：
   - `feature-map.md`（功能导航）
   - `functional-description.md`（模块视图/代码位置）
   - `api-spec.md`（接口/实现报告；`not-applicable` 也可读）
2. `memo.md` **默认不展示**（角色私有续接备忘，不是客户文档）。
3. `changelog.md` 保持可选：有则继续在“变更记录”显示；没有不要求补写，也不作为文档索引。
4. `role-card.md` 与 `boundary.yaml` 保持现有专门栏；不重复塞进“文档”列表。
5. 只读展示；不改变角色权限、边界、验收要求、文档归属或文件内容；路径必须做项目内安全校验。

## 非目标

- 不要求每个角色新增 `changelog.md` 或 `docs/`；不把 changelog 当 docs 索引。
- 不展示 `memo.md`；不把内部备忘当客户文档。
- 不修改角色卡/边界/模板/验收标准；不迁移现有角色。
- 不复制/搬运文档内容到第二个位置；不新增重复文档。
- 不把本变更与 i18n/目录 v3/治理写门禁/验收返工路由合并。

## 风险档位建议

**T2**：角色详情只读索引与渲染层展示，涉及桌面 `project.ts`/`interface.ts`、渲染层 `ProfilePanel`/`DocumentView` 及文档读取候选；不改变治理/权限/角色边界。若实施发现需改文档归属或写权，停止并重开闸门。

## 技术注意（供方案）

- `readRoleDocsIndex`/`RoleDocsIndex` 需扩展角色根文档条目或新增独立索引；`DocsIndexEntry` 路径/类型要区分“角色根文档”与 `docs/` 子目录。
- `projectDocumentCandidates` 与文档读取 scope 需允许这些只读路径；保持路径穿越/项目外/敏感路径拒绝。
- `ProfilePanel` 文档区分组展示；`DocumentView` 可读；空态不再把“有根文档但无 docs/”显示成完全空。
- 测试覆盖：有/无根文档、`api-spec` 为 `not-applicable`、memo 不展示、changelog 可选、路径安全、旧 docs 索引不回归；真实 Electron 点击角色可读。

## 下一步（i18n 后，v1.7.0 发布前）

1. 策划/项目管理写方案与验收标准。
2. 统筹团队计划、闸门 2；独立验收先于实施。
3. 实施、测试（含真实 Electron）、独立验收。
4. 与 i18n、目录 v3、治理写卡门禁、验收返工路由一起纳入 v1.7.0；本变更验收通过后再准备发布。
