# B1 搬移审计摘要（cf63cc7d4fc4）

session.ts 行数：13491 → 12421（-1070）
运行时导出键（6）：CAPABILITY_INSTALL_SYSTEM_PREFIX, MAX_LIVE_SESSIONS, SessionManager, desktopProjectExecutionInventory, shouldSuppressStarTaskReport, subscribeDesktopExecutionInventory
搬移块：41；全部块在归一化（仅允许的 import/导出/状态单例适配）后与 HEAD 逐字一致：true

- app/desktop/session.ts:358-362 (5 行) → app/desktop/session/contracts/persistence.ts:8-12 sha256=0b155a1f5ef5fdf1… 适配=[无]
- app/desktop/session.ts:353-357 (5 行) → app/desktop/session/contracts/session-types.ts:15-19 sha256=2b66f3e3551c17d1… 适配=[无]
- app/desktop/session.ts:363-370 (8 行) → app/desktop/session/contracts/session-types.ts:21-28 sha256=b3b8570696b82c8d… 适配=[无]
- app/desktop/session.ts:372-395 (24 行) → app/desktop/session/contracts/session-types.ts:30-53 sha256=2581209484fc1608… 适配=[无]
- app/desktop/session.ts:404-411 (8 行) → app/desktop/session/contracts/session-types.ts:55-62 sha256=9c6667e714f6299a… 适配=[无]
- app/desktop/session.ts:413-422 (10 行) → app/desktop/session/contracts/session-types.ts:64-73 sha256=6c494044252da094… 适配=[exportizeDecl]
- app/desktop/session.ts:424-436 (13 行) → app/desktop/session/contracts/session-types.ts:75-87 sha256=1f83b676f8f4e317… 适配=[无]
- app/desktop/session.ts:441-456 (16 行) → app/desktop/session/contracts/session-types.ts:89-104 sha256=9dca7b558b58739c… 适配=[无]
- app/desktop/session.ts:458-469 (12 行) → app/desktop/session/contracts/session-types.ts:106-117 sha256=c857fbbbaddbbe26… 适配=[无]
- app/desktop/session.ts:471-471 (1 行) → app/desktop/session/contracts/session-types.ts:119-119 sha256=18e96a2c86aba0ed… 适配=[无]
- app/desktop/session.ts:473-491 (19 行) → app/desktop/session/contracts/session-types.ts:121-139 sha256=5d2499956fc1278b… 适配=[无]
- app/desktop/session.ts:493-523 (31 行) → app/desktop/session/contracts/session-types.ts:141-171 sha256=749721168c2a6eef… 适配=[无]
- app/desktop/session.ts:525-533 (9 行) → app/desktop/session/contracts/session-types.ts:173-181 sha256=1ad961bdb67733c2… 适配=[无]
- app/desktop/session.ts:534-539 (6 行) → app/desktop/session/contracts/session-types.ts:183-188 sha256=2f8c9325c66148c3… 适配=[无]
- app/desktop/session.ts:541-547 (7 行) → app/desktop/session/contracts/session-types.ts:190-196 sha256=d25c25976a117504… 适配=[无]
- app/desktop/session.ts:1030-1043 (14 行) → app/desktop/session/contracts/session-types.ts:198-211 sha256=6404986a932278b4… 适配=[无]
- app/desktop/session.ts:1045-1049 (5 行) → app/desktop/session/contracts/session-types.ts:213-217 sha256=de55a6ac7da8355d… 适配=[无]
- app/desktop/session.ts:1051-1070 (20 行) → app/desktop/session/contracts/session-types.ts:219-238 sha256=6e04b8440d858645… 适配=[exportizeDecl]
- app/desktop/session.ts:1072-1073 (2 行) → app/desktop/session/contracts/session-types.ts:240-241 sha256=3ea708e4cf4ac556… 适配=[exportizeDecl]
- app/desktop/session.ts:1075-1174 (100 行) → app/desktop/session/contracts/session-types.ts:243-342 sha256=286ce645a3107aef… 适配=[exportizeDecl]
- app/desktop/session.ts:1176-1231 (56 行) → app/desktop/session/contracts/session-types.ts:344-399 sha256=3c81d45a174ea411… 适配=[exportizeDecl, trunkInline]
- app/desktop/session.ts:1233-1267 (35 行) → app/desktop/session/contracts/session-types.ts:401-435 sha256=d3f1e16c150a5632… 适配=[trunkInline]
- app/desktop/session.ts:1269-1280 (12 行) → app/desktop/session/contracts/session-types.ts:437-448 sha256=c98bee65111101d5… 适配=[无]
- app/desktop/session.ts:1407-1436 (30 行) → app/desktop/session/contracts/session-types.ts:450-479 sha256=2a6853c17df5313f… 适配=[exportizeDecl]
- app/desktop/session.ts:549-598 (50 行) → app/desktop/session/contracts/tasks.ts:9-58 sha256=b4b8e0873a44143d… 适配=[无]
- app/desktop/session.ts:600-625 (26 行) → app/desktop/session/contracts/tasks.ts:60-85 sha256=250aeb0b55151016… 适配=[无]
- app/desktop/session.ts:627-654 (28 行) → app/desktop/session/contracts/tasks.ts:87-114 sha256=b20d64d7c84ac679… 适配=[无]
- app/desktop/session.ts:656-678 (23 行) → app/desktop/session/contracts/tasks.ts:116-138 sha256=daa5f34f79aa0323… 适配=[无]
- app/desktop/session.ts:680-693 (14 行) → app/desktop/session/contracts/tasks.ts:140-153 sha256=5d25ae54006a6fd5… 适配=[无]
- app/desktop/session.ts:695-702 (8 行) → app/desktop/session/contracts/tasks.ts:155-162 sha256=37b7e53f74d034d5… 适配=[无]
- app/desktop/session.ts:704-1028 (325 行) → app/desktop/session/contracts/deps.ts:35-359 sha256=03ae737f35fb70c7… 适配=[depsInline]
- app/desktop/session.ts:1282-1302 (21 行) → app/desktop/session/shared/text.ts:10-30 sha256=2c240d99629fbd12… 适配=[exportizeDecl, exportizePrefixConst]
- app/desktop/session.ts:1306-1308 (3 行) → app/desktop/session/shared/text.ts:32-34 sha256=ccb60d5b509e7a05… 适配=[exportizeDecl]
- app/desktop/session.ts:1310-1322 (13 行) → app/desktop/session/shared/text.ts:36-48 sha256=2cdfb7d7ea8b035e… 适配=[exportizeDecl]
- app/desktop/session.ts:1324-1340 (17 行) → app/desktop/session/shared/text.ts:50-66 sha256=df34b0c250eeada9… 适配=[exportizeDecl]
- app/desktop/session.ts:1342-1360 (19 行) → app/desktop/session/shared/text.ts:68-86 sha256=c6ec45365ab344e9… 适配=[exportizeDecl]
- app/desktop/session.ts:1371-1401 (31 行) → app/desktop/session/shared/text.ts:88-118 sha256=d59a74eb64a5e52c… 适配=[exportizeDecl]
- app/desktop/session.ts:13439-13455 (17 行) → app/desktop/session/shared/text.ts:120-136 sha256=58daae9bff112726… 适配=[无]
- app/desktop/session.ts:13457-13462 (6 行) → app/desktop/session/shared/text.ts:138-143 sha256=74f55214b9660e3b… 适配=[exportizeDecl]
- app/desktop/session.ts:13464-13491 (28 行) → app/desktop/session/shared/text.ts:145-172 sha256=41fc5b3697942b15… 适配=[exportizeDecl]
- app/desktop/session.ts:1437-1455 (19 行) → app/desktop/session/shared/inventory.ts:14-34 sha256=4f68876b0e33fecd… 适配=[const desktopSessionManagers = new Set<SessionManager>();, let desktopExecutionRevision = 0;, const inventoryListeners = new Set<]

## 类区（1457-13437）完整性
- 归一化后逐字一致：true；原始差异行数：1
- L199: HEAD="    desktopExecutionRevision++;" → NEW="    bumpDesktopExecutionRevision();"
