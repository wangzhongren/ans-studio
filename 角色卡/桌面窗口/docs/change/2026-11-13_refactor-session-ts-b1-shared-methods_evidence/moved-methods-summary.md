# B1 提交 2/2：22 个类方法 → shared/* 搬移证据摘要

- 生成时间：2026-11-13T04:59:47.308Z
- 源：git show HEAD:app/desktop/session.ts（cf63cc7，B1 起点）
- 归一化口径：仅应用 adaptationsApplied 中的 receiver/state 适配；随后行级 trim + 折叠连续空白 + 去空行
- 结果：**22/22 归一化哈希逐字相等**（allFunctionsIdenticalUnderDocumentedAdaptations=true）
- session.ts 行数：12,421（第一段后）→ **12388**（wc -l 口径）

| 方法 | 目标模块 | HEAD 源行 | 目标行 | 归一化 sha256 | 适配（命中数） |
| --- | --- | --- | --- | --- | --- |
| sessionKey | shared/keys.ts | 1968-1970 | 11-13 | `00fa4e45faaab75c…` | 无（纯函数） |
| targetKey | shared/keys.ts | 1971-1980 | 26-35 | `17c3e3ca10769db2…` | this.sessionKey → 同模块函数×1；this.activeEntry() → 只读状态回调×1；this.activeRoleId 两次读取 → 状态回调 + 类型断言（无运行时效果）×1；this.sessions.keys() → 只读状态回调×1；this.rebuildChains.keys() → 只读状态回调×1 |
| queueKey | shared/keys.ts | 8102-8104 | 38-40 | `2b5d12f5c74a1a04…` | 无（纯函数） |
| now | shared/clock.ts | 1949-1951 | 8-10 | `d4b49c830e7c5ae6…` | this.deps.X → deps.X（端口参数）×2 |
| handbackOwnerRoleId | shared/roles.ts | 5299-5308 | 24-33 | `6d19a128416373f5…` | this.deps.X → deps.X（端口参数）×1 |
| chiefTaskRoleIdOf | shared/roles.ts | 5316-5320 | 36-40 | `766d1eab92a2e5e9…` | this.deps.X → deps.X（端口参数）×1 |
| dispatcherRoleIdOf | shared/roles.ts | 7851-7853 | 46-48 | `b1eb22a4558d5591…` | this.handbackOwnerRoleId → 模块函数 + deps×1 |
| resolveProofFlowIds | shared/roles.ts | 8077-8079 | 54-56 | `603791abb51563a2…` | 无（纯函数） |
| findListingForFeedback | shared/roles.ts | 8082-8091 | 59-68 | `b7f4895418932676…` | this.deps.X → deps.X（端口参数）×2 |
| roleDisplayName | shared/roles.ts | 8094-8099 | 71-76 | `672c70d246c72dbf…` | this.findListingForFeedback → 模块函数 + deps×1 |
| refreshListingNow | shared/roles.ts | 3549-3558 | 78-87 | `4997f5cebcf43670…` | this.deps.X → deps.X（端口参数）×2 |
| contextInfo | shared/session-views.ts | 2085-2089 | 10-14 | `25b11a0a18c74c73…` | 无（纯函数） |
| emitDeliveryNote | shared/notifier.ts | 7856-7859 | 12-16 | `60b115e3cffbcfe5…` | this.deps.X → deps.X（端口参数）×1 |
| rememberTaskCreator | shared/tasks-store.ts | 5312-5314 | 24-26 | `c9dccdabab03bad3…` | this.taskCreators → 模块单例状态×1 |
| readTasks | shared/tasks-store.ts | 5323-5330 | 29-36 | `b0bcebd5221ecffa…` | 无（纯函数） |
| isFixedTask | shared/tasks-store.ts | 5333-5338 | 39-44 | `7b7844b8efada890…` | this.readTasks → 同模块函数×1 |
| appendTaskStateResult | shared/tasks-store.ts | 5399-5404 | 47-52 | `b1030f029c1912cf…` | 无（纯函数） |
| appendTaskState | shared/tasks-store.ts | 5405-5407 | 54-56 | `c84c070c6162dbd3…` | this.appendTaskStateResult → 同模块函数×1 |
| recordTaskFailure | shared/tasks-store.ts | 5409-5415 | 58-64 | `2381bba964cd312c…` | this.readTasks → 同模块函数×1；this.appendTaskState → 同模块函数×1；this.now() → 时钟回调×1 |
| appendRoleActivity | shared/tasks-store.ts | 5418-5431 | 73-87 | `5ec2ac18125bf125…` | this.lastRoleActivity → 显式状态参数×1；this.now() → 时钟回调×1；appendRoleActivity 的 at → state.now()（状态面时钟）×1 |
| inventoryChanged | shared/inventory.ts | 1653-1663 | 55-65 | `32ff9cbbaca135eb…` | this.observedInventoryRoots → 显式状态参数×1；this.inventoryPublicationErrors → 显式状态参数×2 |
| publishDeliveryInventory | shared/inventory.ts | 1664-1666 | 66-68 | `bea71063fae624df…` | this.observedInventoryRoots → 显式状态参数×1；this.inventoryChanged → 模块函数 + state×1 |

适配含义：仅 receiver/state 适配（`this.x` → 显式参数/同模块函数/状态回调）；条件、顺序、错误码、文案、返回值逐字不变。

