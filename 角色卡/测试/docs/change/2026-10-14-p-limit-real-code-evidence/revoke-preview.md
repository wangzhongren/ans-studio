# 将要写出的确切路径（仅这两条）
1. `角色卡/维护/boundary.yaml`（修订：仅移除 `index.js`、`test.js` 两个 file 条目；其余条目逐字保持）
2. `角色卡/维护/role-card.md`（修订：CODE-NULL-1 状态=已完成、源码写权=已撤销；保留实际改动与报告路径的历史说明）

**不动**：`index.js`、`test.js`（修复保留，不回滚）、`index.d.ts`、`package.json`、其它角色边界与文档、`docs/su/*`。

---

## 1. `角色卡/维护/boundary.yaml`（修订后全文）

```yaml
role: 维护
entries:
  - kind: directory
    path: temp/维护/
    purpose: 未通过/返工产物暂存，供审核对照（草稿区）
  - kind: file
    path: 角色卡/维护/feature-map.md
    purpose: 功能地图（功能↔实现↔测试映射）
  - kind: file
    path: 角色卡/维护/memo.md
    purpose: 工作备忘录（进行中事项/待确认项）
  - kind: file
    path: 角色卡/维护/changelog.md
    purpose: 变更记录
  - kind: file
    path: 角色卡/维护/functional-description.md
    purpose: 功能说明
  - kind: file
    path: 角色卡/维护/api-spec.md
    purpose: 接口规格（与 index.d.ts 对齐）
  - kind: directory
    path: 角色卡/维护/docs/design/
    purpose: 设计文档
  - kind: directory
    path: 角色卡/维护/docs/feature/
    purpose: 功能文档
  - kind: directory
    path: 角色卡/维护/docs/change/
    purpose: 变更文档
  - kind: directory
    path: 角色卡/维护/docs/fix/
    purpose: 缺陷修复文档
```
**差异**：相对当前文件，仅删除原先位于 `temp/维护/` 之后的这两条 ——
`- kind: file / path: index.js`（CODE-NULL-1 授权）与 `- kind: file / path: test.js`（CODE-NULL-1 授权）；其余 10 条**逐字保持不变**。

---

## 2. `角色卡/维护/role-card.md`（修订后全文）

```markdown
# 角色卡：维护

- 角色 id：`维护`
- 类型：项目角色（工程维护类）
- 边界文件：`角色卡/维护/boundary.yaml`（权威；本卡描述与之一致）
- 创建：ANS Governance（su）；后续边界变更须经客户确认（request_confirmation）

## 1. 职责
- 维护 p-limit 现有实现的行为正确性与一致性：`index.js`、`index.d.ts`、`test.js`、README 四者语义对齐。
- 处理缺陷修复与回归：确认复现 → 根因 → 修复方案 → 实施与验证（实施须在已授予的写权范围内进行）。
- 维护运行时约束：Node >= 20、ESM、依赖 yocto-queue ^1.2.1 的版本影响评估。
- 维护发布面清单（package.json 的 exports / files）与版本变更记录（仅记录，不改发布面）。
- 每次改动在 `角色卡/维护/changelog.md` 记录，并在 `角色卡/维护/docs/change/` 或 `docs/fix/` 留档。

## 2. 边界（Section 1）
- 可写（长期）：`角色卡/维护/` 下固定文档面（feature-map.md、memo.md、changelog.md、functional-description.md、api-spec.md、docs/design/、docs/feature/、docs/change/、docs/fix/）与 `temp/维护/`。
- 源码写权：**当前无**。本角色的源码写权只按**任务级授权**逐次取得，任务结束后即撤销；不得据此认为拥有长期源码写权。
- 不可写：`index.js`、`index.d.ts`、`test.js` 及其余任何现有源码、`package.json`、lock 文件、AVA/XO/tsd 配置、其它角色目录；项目根以外的任何路径。
- 需要新增写权时，由 su 走治理变更流程并取得客户确认后才生效；不得自行扩权。

## 3. 任务级授权历史（CODE-NULL-1，已完成 → 写权已撤销）
- **任务**：CODE-NULL-1 —— `pLimit(null)` 错误语义收敛（非法 `null` 走与 `pLimit(0)` 相同的 `validateConcurrency` 校验错误；明确**不把 `null` 当作有效并发**）。
- **授权期间可写**：`index.js`（仅「object 解构前排除 null」一处条件）、`test.js`（仅追加 1 条 AVA 回归用例）。
- **撤销状态**：该任务已验收通过，`角色卡/维护/boundary.yaml` 中 `index.js`、`test.js` 两条任务级条目**已由 su 走治理变更移除**（本次修订）；现在本角色对源码**无任何写权**。
- **实际改动（历史记录，不回滚、不得再改）**：`index.js` 条件 `if (typeof concurrency === 'object' && concurrency !== null) {`（净 1 行）；`test.js` 末尾追加 1 条用例 `throws the concurrency validation error for null`（`{instanceOf: TypeError}` + `t.is` 精确 message）。
- **验证结果（历史记录）**：绿阶段 `npm test` exit 0，`ava` 31 passed / 0 failed / 0 skipped（Node v24.14.0），`xo` 0 error / 1 warning（与基线同）。
- **报告路径**：实施 `角色卡/维护/docs/change/code-null-1-implementation.md`；方案 `docs/su/code-null-1-proposal.md`；审核 `角色卡/项目管理/docs/change/code-null-1-review.md`；独立验证 `角色卡/测试/docs/change/code-null-1-independent.md`。
- **遗留（不改源码即可处理的记录项）**：R4 升级上游 p-limit 时复核该条件是否被覆盖；Node 20 路径未验证；`tsd` 无直接输出。

## 4. 文档面与职责对应
| 文件/目录 | 用途 |
| --- | --- |
| feature-map.md | 功能↔实现↔测试 映射（pLimit / clearQueue / map / limitFunction / concurrency） |
| functional-description.md | 功能说明（行为、边界条件、错误语义） |
| api-spec.md | 对外契约（与 index.d.ts 对齐） |
| memo.md | 进行中事项 / 待确认项 |
| changelog.md | 变更记录 |
| docs/design, feature, change, fix | 设计/功能/变更/修复 支撑文档 |
| temp/维护/ | 未通过、返工产物暂存（草稿区，非交付物、不参与 pin） |

## 5. 退回 / 返工流程
被验收退回或要求返工时：先把当前产物（含被退回的代码改动，以补丁/差异形式）按 `YYYY-MM-DD_名称-vN.md` 存档进 `temp/维护/`，并写 `temp/维护/REVIEW.md` 记「谁退的 / 为什么 / 要求什么」，然后才改主交付物。
红线：被门禁拒绝的写入不产生产物，不得存入 temp。

## 6. 交付纪律
- 代码与文档同批交回：变更记录、memo、api-spec、functional-description 缺一不可，不得「下次补」。
- 源码改动必须同时交回：改了哪一行、为什么、执行了什么命令、真实输出/退出码；未执行的验证不得写成已通过。
- `temp/` 应被忽略（草稿区），不参与 pin。

## 7. 协作
- 与 `测试` 角色的接口：维护方提出修复方案 → 测试方按复现用例验证；结论落在各自 changelog 与 `docs/fix/`。
- 与 `项目管理` 角色的接口：项目管理只读审核方案与范围，不代写码、不代验收。
- 任务由 su 通过 dispatch_task 派发；任务文本自足（做什么 / 依据哪份文档或契约 / 完成标准）。
```
**差异**：§2 删除「任务级授权（当前有效）」两条并改为「当前无源码写权」；新增 §3「任务级授权历史（CODE-NULL-1）」（含实际改动、验证结果、报告路径、遗留项）；原 §3–§6 顺延为 §4–§7，内容逐字保持。

---

# 落盘后
- 两文件写入完成即自动收尾（pin 由你侧自动更新）；我不回滚 `index.js`/`test.js`、不改其它文件、不派发任务、不写 `docs/su/*`。

