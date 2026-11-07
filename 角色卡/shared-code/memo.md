# shared-code 工作备忘录（memo）

> 续接线索与状态记录；**不是**验收结论，不替代证据文档。角色卡/边界/YAML/changelog 归人事，本文件不写那些内容。

## 2026-11-07 · E1 首轮：接管共享 + 共享组件目录迁移 + 现状核对

### 已完成

1. **接管与核对**：以 E0.3 冻结契约 §4.2 为唯一清单，核对 `src/common/shared/` 现状：**11 个组件 / 18 个源文件**全部存在，public entry、消费者、测试逐项登记；无缺失、无未登记组件、无伞状 `index.ts`（E0 Q1）。
2. **共享组件现行目录（新建）**：`docs/architecture/shared-components.md`。以 `角色卡/项目管理/docs/architecture/shared-components.md`（216 行 / `dd33fdf7805e1ca08c60cf62b804b4f20b6dd7d5c9d4632431706bbaeeca6339`）为只读输入迁建；登记 11 组件 + §3 六角色模块/门控/共享的 owner–public entry–消费者关系 + §5 消费者观察。**自本文件起唯一现行目录**。
3. **共享测试补缺**：新增 `test/项目管理/shared/intent-entry-contract.test.ts`（22 例）——第 11 项组件此前无专属单测（只有消费方间接覆盖），E1 核对发现并补齐；不改实现。
4. **证据**：`docs/change/2026-11-07_E1_shared-catalog-and-maintenance-evidence.md`（目录清单/hash、共享变更清单、测试计数、typecheck、写集扫描、候选聚合、遗留）。
5. **共享 API 变更：0**。E0 §4.2 允许在依赖方向内新增/收敛 public entry，但须接口评审 + 消费者影响 + 测试；**本轮无需求方提案**，角色模块所需能力已由 Model 契约类型与既有 shared public entry 覆盖，不预先扩张 API。

### 关键判断（供续接）

- **共享实现零变更**是本轮的有意选择：E1 是「接管 + 迁移 + 核对」窗口，行为零变更可保证所有既有消费者证据继续有效；任何共享行为改动都应作为独立接口评审单元（§4.4）并重跑受影响消费者证据。
- `test/项目管理/shared/` **路径保持历史名**（团队计划 §5.1/§6.2、E0 Q12）；改名须另立变更，不在本变更顺手改。
- 共享组件目录是 owner/public entry 的**单一事实源**；其他角色链接引用，不复制定义。

### 遗留 / 待办

1. **PM 旧目录删除**：`角色卡/项目管理/docs/architecture/shared-components.md` 由项目管理在 E1 迁移窗口删除（团队计划 §6.4 单写者顺序）；**不在 shared-code 写集**，只读等待。删除前旧副本冻结只读。
2. **`feature-map.md` / `functional-description.md` 尚未建立**（角色卡要求首轮工作建立；本轮任务交付未列，待下轮补齐）。
3. **共享文件头 owner 注释**：多数组件文件头仍写「属主：项目管理」（历史注释）。现行 owner 已为 `shared-code`；注释清理会触及全部组件文件，列为后续纯文档维护项（不改行为、不使证据失效）。
4. **消费者观察项移交**（现行目录 §5，均非阻断、非本角色写集）：
   - `src/provider/runtime/tools.ts`、`app/renderer/src/chat/card-meta.ts` 直接 `import type` 自 `i18n/keys.ts`（宜经 `i18n/index.ts`）——运行时核心/桌面UI owner。
   - `app/renderer/src/chat/types.ts` 本地 `RuntimeKind` 子集（渲染层不能导入含 Node 依赖的 `runtime-shared.ts`）——桌面UI owner；新增 runtime 须同步。
   - `src/common/门禁引擎/versioned-doc-guard.ts` 私有 `atomicWrite`（无瞬时重试）——门禁引擎 owner 候选收敛。
   - `src/common/编排/role-log.ts` 私有 JSONL 轮转（含保留天数语义）——编排 owner 候选收敛。
5. **后续共享 API 需求**：角色/门控/引擎 owner 若有提案，走 E0 §4.4；评审记录写入 `docs/change/`，更新现行目录 + 冻结记录 + 消费者影响 + 测试后方可合入。

### 下一步（E1 续接）

- 关注六角色模块/门控模块落地后是否提出共享 public entry 需求（尤其角色模块的 `context()` 静态模板是否引用 `intentEntryContractText`；若引用，只读导入即可，无需新 API）。
- 保持 `test/项目管理/shared/**` 全绿；共享行为变更前先评审。
