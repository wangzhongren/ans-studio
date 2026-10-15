# 将要写出的具体路径（写盘许可仅限这 6 条）
1. `docs/su/code-null-1-proposal.md`（新建：方案与证据）
2. `角色卡/维护/boundary.yaml`（修订：新增 index.js / test.js 两个精确 file 条目，其余条目保持不变）
3. `角色卡/维护/role-card.md`（修订：移除本次这两文件的禁止项，标注授权范围与撤销条件）
4. `角色卡/项目管理/role-card.md`（新建）
5. `角色卡/项目管理/boundary.yaml`（新建）
6. `角色卡/项目管理/memo.md`（新建）

**不改动**：`index.js`、`test.js`（本轮不实现）、`index.d.ts`、`package.json`、lock、配置、其它角色目录、`角色卡/测试/*`。

---

## 1. `docs/su/code-null-1-proposal.md`（全文）

```markdown
# CODE-NULL-1 方案（治理准备；本轮不实现代码）

- 目标对象：当前 p-limit 隔离副本 `/private/tmp/ans-real-p-limit-20261014`（p-limit@7.3.3）
- 性质：**治理准备与方案审核材料**；su 未执行任何命令、未修改任何源码
- 允许改动的代码面（仅两文件）：`index.js`、`test.js` —— 均由本方案配套的边界修订显式授予 `维护`

## 1. 问题（客户已复现）
- `pLimit(0)` → 抛并发参数校验错误（`TypeError`，固定 message `Expected \`concurrency\` to be a number from 1 and up`）。
- `pLimit(null)` → 却抛 `Cannot destructure ... null`。

**静态根因（su 读取 index.js 所得）**：`index.js` 开头为
```js
let rejectOnClear = false;

if (typeof concurrency === 'object') {
	({concurrency, rejectOnClear = false} = concurrency);
}

validateConcurrency(concurrency);
```
而 JS 语言语义 `typeof null === 'object'` 恒为真（静态事实）。因此 `pLimit(null)` 会**先进入解构分支**，在 `null` 上解构属性 → 抛 `TypeError: Cannot destructure property 'concurrency' of 'null' as it is null.`，**根本走不到 `validateConcurrency`**，故 message 与 `pLimit(0)` 不一致。

对照（同一逻辑链）：`pLimit({})` 解构合法（对象非 null）→ `concurrency` 为 `undefined` → 落到 `validateConcurrency` → 抛固定 message。即 `null` 是唯一被解构提前拦截的入参。

## 2. 最小条件修改（一行条件表达式）
```diff
-	if (typeof concurrency === 'object') {
+	if (typeof concurrency === 'object' && concurrency !== null) {
```
- 语义：**在 object 解构之前排除 null**。`null` 于是不再进入解构分支，落到 `validateConcurrency(null)`：
  - `Number.isInteger(null)` → `false`；`null === Number.POSITIVE_INFINITY` → `false`
  - ⇒ 抛 `TypeError('Expected \`concurrency\` to be a number from 1 and up')`，与 `pLimit(0)` **同一错误类型、同一 message**。
- 不改动任何其它语句、不改 `validateConcurrency` 本身、不改解构写法。
- **不改 `index.d.ts`**：其签名为 `concurrency: number | Options`，本就把 `null` 排除在契约外；本次是运行时错误路径收敛，不涉及契约变更。
- 附加确认：`pLimit({concurrency: null})` 解构合法 → `concurrency` 为 `null` → 同样由 `validateConcurrency` 抛固定 message，**当前已符合目标**，无需额外修改（可选的补充断言见 §3）。

## 3. 测试（新增 1 条 AVA 回归用例，追加进现有 `test.js`）
```js
test('throws the concurrency validation error for null', t => {
	const error = t.throws(() => {
		pLimit(null);
	}, {instanceOf: TypeError});

	t.is(error.message, 'Expected `concurrency` to be a number from 1 and up');
});
```
- 判据：**`TypeError` 实例**（`{instanceOf: TypeError}`）**且 message 精确等于固定串**（`t.is` 全等，不是只匹配子串、不是只看 `name`）。
- 放入现有 `test.js`，**不新建测试文件**（避免 AVA 发现规则不确定性，也避免触碰 `package.json`）。
- 现有用例 `throws on invalid concurrency argument` 覆盖 `0 / -1 / 1.2 / undefined / true / {} / {concurrency: 0}`，**不含 `null`** —— 这正是新用例要补的缺口。

## 4. 代码范围（仅 `index.js` + `test.js`）
| 文件 | 允许的改动 | 明确禁止 |
| --- | --- | --- |
| `index.js` | 仅上述 1 处条件表达式（1 行） | 改 `validateConcurrency`、改解构、任何其它行为/格式改动 |
| `test.js` | 仅追加上述 1 条用例 | 改现有用例、改测试脚本、新增测试文件 |
| 其它一切 | —— | `index.d.ts`、`package.json`、lock 文件、AVA/XO/tsd 配置、`scripts/`、README 一律不得改 |

## 5. 预期验证（由实施方执行；su 本轮未执行）
- 命令：`npm test`（= `xo && ava && tsd`，与 `package.json` 一致）。
- 预期：`ava` **31 tests passed**（原 30 条 + 新 1 条）、0 skipped；`xo` 0 error；`tsd` 静默 exit 0；整体退出码 0。
- 基线依据：`角色卡/测试/docs/change/desktop-npm-test.md` 记录的真实执行结果为 `30 tests passed / 0 skipped`、整体 exit 0（Node v24.14.0），故「原 30 + 新 1」可判定回归与否。
- 判据：新用例通过 + 原 30 条不回归 + 整体退出码 0。**若 `xo` 因新代码报 error，必须如实报告，不得为过检而修改 xo 配置。**

## 6. 证据与未取证部分（如实区分）
**已取证（静态，有出处）**
1. `index.js` 实际读取内容：上方 §1 引用的条件与解构代码（su 读取；`typeof null === 'object'` 为语言语义）。
2. `test.js` 实际读取内容：`throws on invalid concurrency argument` 的入参清单中**无 `null`**。
3. 测试计数基线 30：来自 `角色卡/测试/docs/change/desktop-npm-test.md` 的真实执行记录。

**未取证 / 未执行**
4. su **未运行** `pLimit(null)`、未运行任何 node/npm 命令 —— `Cannot destructure ... null` 的错误文本来自**客户复现描述**，非 su 观察。
5. 未核上游 p-limit 是否也有此行为（无联网核实）。
6. 未验证 `xo` 对新条件的 lint 反应（如 `unicorn` 规则），只能是「预期」。

## 7. 风险与开放问题
1. **对外行为变更**：`pLimit(null)` 的错误 message 由「解构错误」变为「并发校验错误」。类型上两者都是 `TypeError`，但**文本变化**；若有下游按 message 匹配该特例，会受影响（判断：概率极低，且方向是「收敛到统一校验」）。
2. **是否应收敛 `pLimit(null)` 之外的同类入参**：`pLimit()`（undefined）、`pLimit(true)` 等已走统一路径，无需改。
3. **是否需补 `{concurrency: null}` 断言**：当前实现已符合目标，补测属「增强」而非「修复必需」，由审核方判断是否纳入。
4. 本方案**不含**实现步骤的执行授权：实施必须由客户另行下令并经 su 派发。

## 8. 请审核方（项目管理）逐项判断
1. 问题是否成立（`null` 是否确实走不同错误路径）；
2. 修改是否最小、是否与 `validateConcurrency` 语义一致；
3. 测试判据是否充分（`TypeError` 实例 + 精确 message 是否足够；是否需要 `{concurrency: null}` 等补充）；
4. 代码范围是否足够窄（是否误伤契约/配置）；
5. 是否有本方案未登记的风险。
```

---

## 2. `角色卡/维护/boundary.yaml`（修订后全文）

```yaml
role: 维护
entries:
  - kind: directory
    path: temp/维护/
    purpose: 未通过/返工产物暂存，供审核对照（草稿区）
  - kind: file
    path: index.js
    purpose: CODE-NULL-1 授权：修复 pLimit(null) 错误路径（object 解构前排除 null），仅限本任务
  - kind: file
    path: test.js
    purpose: CODE-NULL-1 授权：新增 1 条 AVA 回归用例（TypeError + 固定 message），仅限本任务
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
*除新增的 `index.js`、`test.js` 两条外，其余条目与现文件逐字保持不变。*

---

## 3. `角色卡/维护/role-card.md`（修订后全文）

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
- 可写（**任务级授权，当前有效**）：`index.js`、`test.js` —— 仅限 CODE-NULL-1 任务：`index.js` 只改「object 解构前排除 null」这一处条件；`test.js` 只追加 1 条 AVA 回归用例；依据 `docs/su/code-null-1-proposal.md`。
- 不可写：`index.d.ts` 及其余任何现有源码、`package.json`、lock 文件、AVA/XO/tsd 配置、其它角色目录；项目根以外的任何路径。
- **授权撤销**：CODE-NULL-1 验收通过（或客户撤销）后，`index.js`、`test.js` 两项须由 su 走治理变更移除；不得据此认为拥有长期源码写权。
- 需要新增写权时，由 su 走治理变更流程并取得客户确认后才生效；不得自行扩权。

## 3. 文档面与职责对应
| 文件/目录 | 用途 |
| --- | --- |
| feature-map.md | 功能↔实现↔测试 映射（pLimit / clearQueue / map / limitFunction / concurrency） |
| functional-description.md | 功能说明（行为、边界条件、错误语义） |
| api-spec.md | 对外契约（与 index.d.ts 对齐） |
| memo.md | 进行中事项 / 待确认项 |
| changelog.md | 变更记录 |
| docs/design, feature, change, fix | 设计/功能/变更/修复 支撑文档 |
| temp/维护/ | 未通过、返工产物暂存（草稿区，非交付物、不参与 pin） |

## 4. 退回 / 返工流程
被验收退回或要求返工时：先把当前产物（含被退回的代码改动，以补丁/差异形式）按 `YYYY-MM-DD_名称-vN.md` 存档进 `temp/维护/`，并写 `temp/维护/REVIEW.md` 记「谁退的 / 为什么 / 要求什么」，然后才改主交付物。
红线：被门禁拒绝的写入不产生产物，不得存入 temp。

## 5. 交付纪律
- 代码与文档同批交回：变更记录、memo、api-spec、functional-description 缺一不可，不得「下次补」。
- 源码改动必须同时交回：改了哪一行、为什么、执行了什么命令、真实输出/退出码；未执行的验证不得写成已通过。
- `temp/` 应被忽略（草稿区），不参与 pin。

## 6. 协作
- 与 `测试` 角色的接口：维护方提出修复方案 → 测试方按复现用例验证；结论落在各自 changelog 与 `docs/fix/`。
- 与 `项目管理` 角色的接口：项目管理只读审核方案与范围，不代写码、不代验收。
- 任务由 su 通过 dispatch_task 派发；任务文本自足（做什么 / 依据哪份文档或契约 / 完成标准）。
```
*相对现文件的实际差异：§1 第 2 条、§2 可写/不可写/撤销、§4 存档口径、§5 追加一条、§6 追加一条。§3 表格未变。*

---

## 4. `角色卡/项目管理/role-card.md`（新建全文）

```markdown
# 角色卡：项目管理

- 角色 id：`项目管理`
- 类型：项目角色（协调/审核类）
- 组别：治理协调组
- 边界文件：`角色卡/项目管理/boundary.yaml`（权威；本卡描述与之一致）
- 创建：ANS Governance（su）；后续边界变更须经客户确认（request_confirmation）

## 1. 组别与固定角色
| 组别 | 固定角色 | 定位 | 边界文件 |
| --- | --- | --- | --- |
| 治理协调组 | `su`（内置治理） | 治理：建/改角色边界、派发、客户确认 | 无角色目录；文档固定 `docs/su/` |
| 治理协调组 | `项目管理`（本角色） | 只读审核与协调，不实现 | `角色卡/项目管理/boundary.yaml` |
| 实现组 | `维护` | 实现与维护（写权按任务逐次授予） | `角色卡/维护/boundary.yaml` |
| 验证组 | `测试` | 验证与测试资产（不含源码写权） | `角色卡/测试/boundary.yaml` |

## 2. 长期维护立场（本角色的固定判断准则）
1. **变更最小化**：只接受能由「单点条件修改」解释的改动；拒绝框架化、泛化重构与「顺手重构」。
2. **错误语义收敛**：同类非法入参应走同一校验路径、同一固定 message。
3. **契约不轻改**：公开类型契约（`index.d.ts`）与发布面（`exports` / `files`）不因运行时修补而变动。
4. **证据优先**：结论必须可追溯到文件与具体行/用例名；**未实际执行的验证不得写成已通过**，「由退出码推导」必须显式标注为推导。
5. **范围克制**：不新增测试框架与测试目录，回归用例进入既有 `test.js`。
6. **失败如实**：工具不可用、门禁拒绝、命令非零退出，一律如实上报，不粉饰、不代偿。

## 3. 职责（只读审核与协调）
- 审核：对 su 提交的方案做只读审核——问题是否成立、修改是否最小、测试判据是否充分、风险与「未取证部分」是否被如实登记。
- 协调：梳理跨角色依赖与执行顺序（如 维护实现 → 测试验证），指出缺口；**不代替任何角色执行**。
- 登记：审核结论写 `角色卡/项目管理/docs/change/`、memo、changelog。
- 明确不做：不改源码、不改配置、不给任何人授权、不代派发任务、不代替客户验收。

## 4. 边界（Section 1）—— 边界必读
- **可写（仅）**：`角色卡/项目管理/` 下固定文档面（feature-map.md、memo.md、changelog.md、functional-description.md、api-spec.md、docs/design/、docs/feature/、docs/change/、docs/fix/）与 `temp/项目管理/`。
- **不可写**：`index.js`、`index.d.ts`、`test.js`、`package.json`、lock 文件、AVA/XO/tsd 配置、`scripts/` 及任何源码面；其它角色的 `角色卡/<其它角色>/` 目录；项目根以外的任何路径。
- **读不受限**：审核需要读取全项目（含他人产物），读取不消耗写权。
- **权限来源**：写权只来自本项目治理边界与已授权任务；本角色**不含任何源码写权**，也不得自授。
- **扩权路径**：确需新增写权 → 由 su 走治理变更流程并取得客户确认；本角色无权自行扩张。
- **红线**：被门禁拒绝的写入属零副作用，不得把被拒内容当成产物或存档进 `temp/`。

## 5. feature 导航（审核入口）
| 入口 | 路径 | 当前状态 |
| --- | --- | --- |
| 维护·功能地图 | `角色卡/维护/feature-map.md` | 尚未建立 |
| 维护·功能说明 / 接口规格 | `角色卡/维护/functional-description.md`、`api-spec.md` | 尚未建立 |
| 维护·变更/修复留档 | `角色卡/维护/docs/change/`、`docs/fix/` | 目录已授权，内容待补 |
| 测试·覆盖矩阵 | `角色卡/测试/feature-map.md` | 尚未建立 |
| 测试·执行与审查记录 | `角色卡/测试/docs/change/desktop-validation.md`、`desktop-npm-test.md` | 已存在（静态审查 / 真实执行取证） |
| 缺陷验证留档 | `角色卡/测试/docs/fix/` | 目录已授权，内容待补 |
| 治理记录 | `docs/su/memo.md`、`docs/su/changelog.md`、`docs/su/*.md` | su 所有（如 `code-null-1-proposal.md`） |

## 6. 退回 / 返工流程
- 审核不通过：结论写自己的文档面并在 `submit_report` 回执里说明「要求什么」，**不直接改他人产物、不代维护写码**。
- 自身被退回：产物按 `YYYY-MM-DD_名称-vN.md` 存档进 `temp/项目管理/`，并写 `temp/项目管理/REVIEW.md` 记「谁退的 / 为什么 / 要求什么」。

## 7. 交付纪律
- 审核报告与其文档同批交回；结论必须含证据（文件 / 行 / 用例名）与「未执行部分」声明。
- 不得把「受理」「会话结束」「工具调用次数」当作完成证据。

## 8. 协作
- 任务由 su 经 `dispatch_task` 派发；本角色用 `submit_report` 交回。
- 与 `维护`/`测试` 的接口：只审核、只协调，不代执行、不代验收。
```

---

## 5. `角色卡/项目管理/boundary.yaml`（新建全文）

```yaml
role: 项目管理
entries:
  - kind: directory
    path: temp/项目管理/
    purpose: 未通过/返工产物暂存，供审核对照（草稿区）
  - kind: file
    path: 角色卡/项目管理/feature-map.md
    purpose: 功能/流程导航与审核入口
  - kind: file
    path: 角色卡/项目管理/memo.md
    purpose: 工作备忘录（进行中事项/待确认项）
  - kind: file
    path: 角色卡/项目管理/changelog.md
    purpose: 变更记录
  - kind: file
    path: 角色卡/项目管理/functional-description.md
    purpose: 职责与流程说明
  - kind: file
    path: 角色卡/项目管理/api-spec.md
    purpose: 审核与协调接口约定
  - kind: directory
    path: 角色卡/项目管理/docs/design/
    purpose: 审核设计文档
  - kind: directory
    path: 角色卡/项目管理/docs/feature/
    purpose: 流程文档
  - kind: directory
    path: 角色卡/项目管理/docs/change/
    purpose: 审核结论与变更文档
  - kind: directory
    path: 角色卡/项目管理/docs/fix/
    purpose: 问题登记与跟踪文档
```
*本边界**不含**任何源码/配置条目：项目管理无源码写权。*

---

## 6. `角色卡/项目管理/memo.md`（新建全文）

```markdown
# 项目管理 · 工作备忘录

## 进行中
- CODE-NULL-1 方案只读审核：对象 `docs/su/code-null-1-proposal.md`；判断问题是否成立、范围是否最小、测试判据是否充分、风险是否登记。

## 待确认（需客户或 su 决策）
- 是否补充 `pLimit({concurrency: null})` 的断言（当前实现已符合目标，属增强项）。
- 实施授权与实施方（`维护`）的派发时机 —— 均由客户/su 决定，本角色不代派发。

## 已决
- 本角色为只读审核与协调，写权限仅自己的文档面与 `temp/项目管理/`，**无源码写权**。

## 风险/备注
- `pLimit(null)` 的错误 message 会由「解构错误」变为统一校验 message（行为变更）；
- 测试计数基线 30 条来自 `测试` 的真实执行记录（Node v24.14.0，隔离副本）。

## 下一步（等指令）
- 收到 su 派发的审核任务 → 只读审核并 `submit_report`；不实施、不写入源码。
```

---

# 确认后的动作顺序
1. 落盘上述 6 条路径（写入与预览内容一致）。
2. 用 `dispatch_task` 让 `项目管理` **只读审核** `docs/su/code-null-1-proposal.md`：明确「问题是否成立 / 范围是否合理 / 最小实现与测试判据」，并以 `submit_report` 交回；**不授权写源码、不派发维护实施**。
3. 收到审核后我只做简短汇总，等待你的下一条指令；**su 不修改 `index.js` / `test.js`**，也不泛化建框架。

