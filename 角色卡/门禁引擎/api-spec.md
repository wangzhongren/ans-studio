# 门禁引擎公开接口：角色协作组摘要

## E0.2 对齐 D1/D2/D9/D10（2026-11-07；E0 冻结前，未判验收/未冻结）

依据 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（681 行 / 53674 bytes / `798ce9ce0d23cfd0fcc73c021d0510e517e9a34d6a22c45907605a442550b3fc`，取代 E0.1 `3830fe63…`）§3.1/§10.2；**D3–D8 维持现状**（不重做、不改行为）。证据：`角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md`「E0.2 对齐 D1/D2/D9/D10」节。

- **D1 已落（14 id + 映射 + 允许集校验 fail-closed）**：`src/model/role.ts::RoleToolId` 扩为 14 id；新增 `RoleToolName`（14 snake_case，逐字按 §3.1）；`RoleToolPolicy.tools` 保持 `readonly RoleToolId[]`。**id→name→允许角色唯一来源**是新增私有纯模块 `src/common/门禁引擎/role-tool-registry.ts::ROLE_TOOL_CATALOG`（14 项，顺序与 §3.1 表一致）；`roleToolCatalogEntryOf(id)` / `roleToolNameOf(id)` 对未知 id 返回 `undefined`（不猜、不兜底）。E1 引擎装配校验口：

  ```ts
  validateRoleToolDeclaration(
    roleId: string,
    declaredToolIds: readonly string[],
  ): {
    allow: boolean;
    tools: readonly { id: RoleToolId; name: RoleToolName }[];
    reasons: readonly RolePolicyReason[];
  }
  ```

  未知 id / 越权 id（角色允许集之外）/ 重复声明 ⇒ **整单 `allow: false`、`tools: []`、`reasons` 逐项**（不注入、不静默忽略；调用方不得从 deny 结果挑合法项注入）；空声明 ⇒ `allow: true`、`tools: []`。Model 闭集与装配表漂移（Model 有、表无）由 lookup 未命中按未知 id fail-closed；逐项一致由契约测试断言。`decidePendingRequest` 允许角色只有 chief，装配项标 `chiefIndependentDecisionOnly: true`；普通 chief 会话不因声明获得——校验函数只判允许集，会话模式由引擎调用点（`chiefDecisionContext` / `buildChiefDecisionTools`）判定。
- **D2 已接受**：`governance-roles.ts::builtInRoleModuleDataOf(id)` 零复制门面 lookup 即 E0 产物，E0 不新增完整 map；完整 `builtInRoleModules: BuiltInRoleModuleMap` 在 E1 六模块落地后由门面装配，E2 删除内联规格。
- **D9 已记录口径**：Model 内 type-only 边豁免（`role.ts↔runtime.ts`、既有 `download.ts` 例外）；禁 value import 反向/环；type-only 共享原语单列。E0 以 `role.ts` 头部注释 + 契约测试（读取两文件源码断言互引仅 `import type`、无 value import）记录；模块图扫描脚本属 E1 gates-code/E3。
- **D10 已声明**：模块 spec 的 `capabilities` 为唯一真源，`tools()` 输出为派生；类型断言 `BuiltInRoleModule["capabilities"]` 与 `RoleToolPolicy["capabilities"]` 均等于 `GovernanceCapabilities`，契约测试断言 `tools().capabilities` 与模块 spec 同引用。完整模块约束在 E1 接口评审落地。
- **测试/静态门**：契约测试 8 → **14/14 pass**（新增 D1×4 + D9 + D10；原 8 项未删除/未放宽）；门禁引擎套件 413/407/5/0/1 → **419/413/5/0/1**（新增确定性失败 0、新 skip 0，既有 5 红逐条不变）；`npm run typecheck` exit 0；契约四文件隔离 tsc exit 0。
- **写后哈希**：`src/model/role.ts` `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780`（409 行）；`src/common/门禁引擎/governance-roles.ts` `fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e`（794 行）；`src/common/门禁引擎/role-tool-registry.ts` `9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b`（157 行，新增）；`test/门禁引擎/role-module-contract.test.ts` `bb0904c90a8dc070d9a8fe4b53031f123c3136aefea0a4e284a164cce6d9d9f1`（595 行）。

## E0 D1–D8 落地（2026-11-07；E0 冻结前精确 delta）

> E0.2 对齐（见上方节）已把 D1 扩为 14 id 并落映射/允许表/校验函数；本节保留为首次落地记录，D1 五 id 描述以 E0.2 节为准。

依据 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（574 行 / 43032 bytes / `3830fe636849a89e5f604546420cffc0e78f862ab1e345cf4904b91ae1ed04b9`）§10.2；只落 E0 冻结前 delta，不扩大范围、不判验收、不宣布冻结。证据：`角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md` 新增「D1–D8 落地」节。

- **D1 已落**：`src/model/role.ts` 新增 `RoleToolId` 五 id 闭集（`roleActivityLog` / `terminateRoleRun` / `redispatchTask` / `projectNote` / `requestVersionDecision`）；`RoleToolPolicy.tools` 收窄为 `readonly RoleToolId[]`；注释写明未知 id 由引擎装配 fail-closed（不注入、不静默忽略），新增 id 走接口评审（契约 §4.4）。
- **Q5 核对（未自行扩闭集）**：`run-role.ts:1697-1705` 的五个 id 恰为 chief-only 额外注入；另发现现有 role-specific 直接能力工具未列入闭集：`requestRequirementChange`（rapporteur/convener）、`submitVersionChange`（product/rapporteur）、`selectRunChange`（rapporteur）、`completeTeamPlan`（convener）、`activateRoleDocuments`（nominator）、`closeCreatedTask`（chief/convener）、`submitRefactor`（convener）、`requestStableWrite`（convener）。`decidePendingRequest` 仅判断会话注入；`governanceMatrix`（六内置）与 `projectState`（全部内置治理含 su）为共有工具；`installSkill`/`uninstallSkill`/`installMcp`/`uninstallMcp`、`dispatchTask`/`roleStatus`/`sessionTail`、`customerInput`/shell 由能力位表达。上述缺口清单交 E0 评审分类（扩闭集或明确归引擎直接能力），本节点不扩集。
- **D2 类型已落；门面为 E0 零复制数据投影**：`src/model/role.ts` 新增 `BuiltInRoleModuleMap = Readonly<Record<BuiltInRoleId, BuiltInRoleModule>>`。`governance-roles.ts` 新增 `BuiltInRoleModuleData`（`Omit` 掉 `cards` 与四策略面）、`BUILT_IN_ROLE_MODULE_DATA`（从 `BUILT_IN_GOVERNANCE_ROLES` 装配，`entries`/`preauthorizedDirs`/`forbiddenWritePaths`/`capabilities` 保持同一引用，**零数据复制**）与 lookup `builtInRoleModuleDataOf(id)`。完整 `builtInRoleModules: BuiltInRoleModuleMap` **未导出**：E0 阶段六角色模块不存在，且 `cards` 唯一现行源在 `run-role.ts::TRIO_CARD_KINDS`（Pipeline 私有，本层不得 import），四策略面现行行为在 `run-role.ts`/`apply-journal.ts`；在本层构造完整 map 只能复制第二份数据或伪造模块。替代方案与 E1/E2 装配计划见证据，交 E0 评审处置。
- **D3 已落**：`RolePolicyDecision.details` / `RolePolicyReason.details` 保持 `unknown`；注释限定为 JSON 可序列化普通数据、无密钥/凭据/客户正文/模型原始输出；消费者只展示/审计，不据此放行。
- **D4 已落**：`RolePreflightInput.facts` / `RoleContextInput.facts` 保持 `Readonly<Record<string, unknown>>`；注释写明每角色 `api-spec.md` 登记动作 fact 键、缺键/未知/类型不符 deny、不得复制 Service/Provider 最终校验。
- **D5 已落**：`RoleContextResourceRef.path` 注释写明默认应用资源根；项目 `docs/workflow.md` 不是角色模块资源，由宿主在上下文装配时另行提供（来源/版本/hash 单列）；本版不新增 `root` 字段。
- **D6/D7/D8 仅迁移注释（本节点未改代码）**：D6 E2 时 `governance-roles.ts` 私有 `GovernanceCapabilities`/规格数据改为 Model 公开投影 re-export/装配或加类型等价断言，`matrix` 展示摘要留在门禁引擎门面、不进入 `BuiltInRoleModule`；D7 E1 gates-code 建 `src/common/gates/index.ts` 使用契约 §5.1 类型，P1 D-minimal 本地结构类型在 E2 删除/别名，reason 闭集按 §5.3，`applicationMediation.nativeInstanceId` 必填纳入 accepted evidence；D8 `cards` 只列当前有效卡种、旧 `"write"` 不进模块数据、E2 门面按旧数据兼容映射。本节点未改 `src/common/gates/`、未改 `governance-roles.ts` 规格数据。
- **测试/静态门**：`test/门禁引擎/role-module-contract.test.ts` 新增 D1 闭集、`BuiltInRoleModuleMap`、门面数据投影与 lookup 断言；定向 8/8 pass；门禁引擎套件写前 412/406/5/0/1 → 写后 413/407/5/0/1（新增 1 例、新增确定性失败 0、新 skip 0，既有 5 红不变）；`npm run typecheck` exit 0；三文件隔离 tsc exit 0。
- **写后哈希**：`src/model/role.ts` `e0385fabb1890d9b42abcd3e00129048ef7f13f3e263972b013f9df271051bd1`；`src/common/门禁引擎/governance-roles.ts` `5a3753f3964c249904db02ae9d4f8e83b15cf917a04865c13829e282fbdc2ca0`；`test/门禁引擎/role-module-contract.test.ts` `6484e6334170847c39586e4f7fb5634e9826024764493a3fcf846de3ee26ed1d`。

## E0 角色模块公开契约类型（2026-11-07；草案，待冻结评审）

`src/model/role.ts` 加法新增（208 行，纯类型、无运行时值；写前 `42f74b82f8f1…` → 写后 `e38a20535b59c30031ff0e58d568cd533764f902f60a8625f3dc58e76e50daf5`）：

- `BuiltInRoleModule`（extends `GovernanceRoleSpec`）：`id/displayName/function/card/capabilities/cards` + `tools(input: TrustedToolPolicyInput): RoleToolPolicy`、`dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy`、`preflight?: RolePreflightHooks`、`context(input: RoleContextInput): readonly RoleContextSection[]`。
- `RolePolicyDecision = {allow:true} | {allow:false; code; messageKey; details?}`：typed、无异常、不写文案；缺事实/未知 fail-closed；返回值不携带权限。
- 公开只读投影：`GovernanceCapabilities`（七能力位，`shell: GovernanceShellTier`）、`RoleCardSpec`（`text/entries/preauthorizedDirs/forbiddenWritePaths`）、`GovernanceRoleSpec`（数据子集，不含私有展示摘要 `matrix`）；`GovernanceCardKind` 从 `src/model/runtime.ts` 唯一真源 type-only 再导出；`BuiltInRoleId` = 六角色。
- 输入/输出：`TrustedToolPolicyInput{governanceModel}`、`RoleToolPolicy{capabilities,tools,reasons}`、`RoleDispatchPolicyInput{sourceRoleId?,targetRoleId,targetKind,targetExists?}`、`RoleDispatchPolicy{decision,reportToRoleId?}`、`RoleGovernedAction`（10 动作）、`RolePreflightInput{action,facts}`、`RoleContextSection{id,text,resources?}`、`RoleContextResourceRef{path,version?,sha256?}`。
- 约束：角色模块只依赖 Model/shared public entry；不 import 引擎/门控/其它角色；唯一 public entry `index.ts`；纯数据/纯策略，无 I/O/账本/会话/时钟/随机数/可变状态。E2 由 `src/common/门禁引擎/governance-roles.ts` 门面 re-export/装配。
- 契约测试：`test/门禁引擎/role-module-contract.test.ts`（7 项：类型级断言 + 六 id 最小构造桩）。写后门禁引擎套件 412 tests / 406 pass / 5 fail / 1 skipped（既有 5 红不变、新增确定性失败 0）；`npm run typecheck` exit 0。
- 对齐状态：策划 E0 契约文档 `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` 开工与收工检查均**不存在**；本草案按 P1.6 §6.2/团队计划 §7.3，标记待对齐。**未宣布冻结**（冻结由统筹在评审后记录）。
- 证据：`角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md` 及同名证据目录。

## G16 raw integrate普通消费（2026-11-06）

既有`GitRawObjectPlan.input`新增`parents?: readonly GitOid[]`，由原shell-rules同type公开，无新生产文件/Model/效应口。`integrate`只convener+task/run、真实base为首parent、2–65去重完整OID；后parents按原integrationGrants候选顺序逐一绑定。grant为worker owner/path/evidenceDigest，控制器writePaths必须空；全部blob/tree/commit/parents/完整diff/固定commands/ref重算，旧新path按owner grant且不得多owner重叠，禁止mode变动/metadata例外；其它raw模板不借parents/grants扩权。未改base文件留在全tree，冲突仍O生产组合拒。普通grant不是权威票，原source/同run/settled过程/原creatoraccepted/当前Active∩冻结授权仍O最终重核。

G16-01单文件27/27（真实SHA1/256 plan→prepare/readback一致、关键错parent/grant/越区/metadata/mode等负例），PID7496自然CLOSE0/signalnull、35.07s/60s未触；G16-02主type0/PID10388自然CLOSE0，diff-check0。是纯策略/Provider层证据，非生产integrate已通；O193另层native abort不当本G阻塞。当前classify SHA78B8EFF376FE4F60C65DEFF749C922596DC44CECE79177D7D6E95C0D10DA1DE3；test0A165430FA54C0F363F1E08D897ED9D03309E455C6926A507317CC72060C57B3。

## G15 纯文件阶段口（2026-11-06；生产身份接线待后继）

现`service/gate/resolve-write.ts`公开：

```ts
interface CanonicalWriteFacts {
  projectRoot: string; skillRoot: string; target: string;
  protectedRoots: readonly string[]; coverage: "complete" | "unknown";
  basisDigest: string; reasons: readonly string[];
}
type CurrentFileFacts = {state:"missing"} | {state:"present";sha256:string} | {state:"unknown";reason:string};
interface FileGateReadContext {
  stage: "lexical-read" | "canonical-read";
  invocationId: string; operationId: string; targetPath: string; operation: "write" | "edit";
  projectRoot: string; skillRoot: string; canonicalFacts?: CanonicalWriteFacts;
}
interface FileGateFinalContext extends Omit<FileGateReadContext,"stage"> {
  stage: "final-write"; currentFile: CurrentFileFacts; contentSha256: string;
}
resolveWriteReadPreflight(target: string, boundary: BoundarySection1, scope: TaskScope | undefined, ctx: FileGateReadContext): WriteDecision;
resolveWriteFinal(target: string, boundary: BoundarySection1, scope: TaskScope | undefined, ctx: FileGateFinalContext): WriteDecision;
stableWriteDecisionFromFacts(input: StableWriteDecisionInput & {currentFile: CurrentFileFacts}): StableWriteDecision;
```

新managed必须有真实scope，不以scopeMode/role豁免；既有非受管兼容仍留原入口，absence不能证明unmanaged。所有新口为同步纯计算，零realResolve/reload/readFile；第一阶段只授canonical元数据读取，第二阶段只授同目标内容读取，final路径判定再核明确currentFile与最终SHA。final O仍须组合原stable/versioned/HRdraft/任务授权前置；stable纯入口保原许可快照逐字段、role/path/TTL/baseSHA/最终BOM字节SHA。canonical实际字段采用G15 `coverage/basisDigest/reasons`，不是P8早期拟名protectedRootsState；unknown/缺字段不当完整空数组。

R私有WeakMap发行/公开inspect尚未实现；必须O Pipeline先R验身份再交G普通数据，G不peer-call，ordinaryfacts不是权威票。R最终canonical/nlink/字节/rename保护保持。原resolveWrite及stableWriteDecision明确legacy effect暂留，不声称旧I/O删尽。两指定test47/47，主type0，PID5716/28496自然CLOSEexit0/signalnull、60s预算未触；新口FS计数零及拒绝缺角色/scope/阶段、敏感路径、canonical逃逸/unknown保护根、旧pin不替换、currentFile未知及许可hash/TTL/BOM负例通过。完整真实生产阶段链待R/O/Q后继。

## G14 P8阶段口只读核（2026-11-06；未实施）

原resolveWrite先realResolve、private resolveRelativeWrite拒绝提示又有reloadBoundaryEntriesSync，不能直接拿作纯preflight；同文件可抽F6/词法root/角色条目/conditions/writeSet纯核。拟公开`resolveWriteReadPreflight(target,boundary,scope,{stage:"lexical-read"|"canonical-read",projectRoot,skillRoot,canonicalFacts?}):WriteDecision`，最终原resolveWrite消费已由O→R inspect验证的stage/canonical普通facts；stable纯入口经同G Service公开，保原permit/snapshot/TTL/targetSHA，改收explicit currentFile missing|presentSHA|unknown而不读盘。以上均拟议，当前未接。

O现role setup/immutable BoundarySection1、assigned-task实际scope与scopeWithPreauthorizedWrites及HRdraft/trio前置须三阶段共用，缺失只拒；旧pin不换currentRoleCache，不在同步gate补live。canonical保真实双root/target/保护根完备性；原O GitProtectionFacts已有coverage/basisDigest/reasons，当前gateCtx仅传array，后继需原样保真实coverage给R发行，不以[]或absence证明complete/unmanaged。R原runtime/tools/schema/session发行/验WeakMap，O run-role先R公开inspect再G纯核，禁止G peer-call。stable同步FS和O Provider permit上调仍在，分别原G/O/R后继；无新增根/Model写/公共factory，P8无方案层新阻点，仅实际阶段producer/consumer尚未实现。

## G13 基线Service端口第一段（2026-11-06）

`src/service/boundary/resolve-boundary.ts`已公开P7原形：`registerVersionedDocument({projectRoot,relPath,recordedBy?}):Promise<boolean|undefined>`、`verifyVersionedDocuments({projectRoot}):Promise<VersionBaselineViolation[]>`、`readVersionBaselineSha({projectRoot,relPath}):Promise<BaselineShaResult>`，两结果类型同入口导出。只经O public同R9锁/fencing、baseline原text CAS、strict:true完整扫描及Store.readProjectFile真实字节；common仅新parse/plan/verify/sha普通运算，不导Provider。不公开ports factory或test-only业务参数。TOFU不证明migration完成，重复登记也不把migration-required升ready。

旧候选指定file24/24/TS0；最后仅修迁移状态判据后G13四项4/4，PID15232/28140均CLOSE exit0/signalnull、60s预算未触。最终类型检查仅O在飞测试918/925两诊断（G13-03保原），G源/测无诊断。真实Provider strict ENOTDIR/读失败、Service登记/冻结/N+1/并发及纯计划→真实Provider CAS/fence拒已测；未声称强制注入遍历新Service所有内部失败分支。旧common效应和O/W caller尚未迁、同步stable/currentFile/canonical/permit上调仍后继，本段不是全部I/O迁完。

## G11 首个真实workflow补入（2026-11-05）

原businessPublication联合新增`GitInitialWorkflowPublication`；同shell-rules公开`GitStableInitialWorkflowSource`，普通字段逐项同O的真实Source/CommitPlan，不引入role-direct/actionSource。只消费`stable-initial-workflow-publication / convener`：source绑定实际task/run/Core session/turn、request/permit/authority、旧doc commit/snapshot及非空targetSHA，journal canonical绑定source原bytes/sourceFile、written record、consumed permit与实际input。不得把工具requested状态当批准，不读当前Corebusy或委托开关判断历史来源。

仅在原planning manifest无workflow且无绑定执行run时补workflowRef/完整snapshot/updatedAt；doc版/digest/source/actionSource/docs/execution/active/D3/frozen及其它metadata保持。新snapshot移除精确四个新增文件后必须还原原doc snapshot digest；全文件/对象/tree/diff/命令/ref/CAS照原规则。仅首次保存exact derived旧版本history且beforetree无该path、bytes与baseManifest逐字相同，已有history不得覆盖；不泛.ans。全项目实际runlist无pin、当前task/permit/source及执行保护由O最终重核，G普通facts/verdict不能自证。

G11-01相关23/23，最后仅加history不同空白断言后G11-03定点3/3，G11-02主TS0；真Provider SHA1/256计划、源/record/permit/字节/workflow/metadata/active/版本/history/command/ref负例，原G8/9/10回归保。O113真same-version CAS与112来源先于写入/消费为O证据，Q真实公开链仍由Q复测。旧R9迁移不归本轮成果。

## G10 独立角色激活发布（2026-11-05）

原`GitPolicyFacts.businessPublication`扩成`GitBusinessPublication | GitRoleActivationPublication`，后者由同`shell-rules.ts`公开：`kind: role-activation-publication`、`action: activate-role-documents`、`documentSnapshot`、`targetRoleId`、`expectedActive`、`targetActive`、`evidence`，其它flow/op/actor/application/snapshot/documents/execution同原普通字段。真实nominator来源在journal，不要求与保持不变的manifest.actionSource相同。

纯核仅目标activeRoles/revision/digest，doc/source/actionSource/updatedAt/version/snapshot/refs、oldfrozen及其它metadata严格保持；全8refs同独立Active snapshot，真实D3创建/裁决原bytes、三文档必填/MD-YAML同步、实际plan/roster/modules与授权writesets闭包。历史合法chief-delegated D3纯来源不读取当前开关，不伪customer凭据。不要求future workflow/run/pin。物化输入必须精确等原doc文件、完整doc/active/frozen snapshot JSON与各active六个角色/evidence物理ref；旧snapshot仍在自身JSON保全部字节，不向当前物理投影补旧权限。role-only拒history写入及任意.ans。source/currenttask/D3最终真实性、nonce/lease/保护仍归宿主，普通数据/verdict不替代。

G10-03精确20/20、G10-02主TS0；真Provider SHA1/256计划、客户/历史委托D3正例，完整重新计划后越改doc/workflow/frozen/其它角色/目标/字节/授权/history/source/command/ref等拒；原G8/9回归保。是层测，Q公开激活链仍由Q实际复验。旧R9业务I/O迁移仍后继。

## G9 团队计划完成（2026-11-05）

沿G8原普通DTO，实际新增业务kind组合 `direct-document-publication / complete-team-plan / convener`，不增字段或工具权限。只接受已存在基线：同原docrefs/flow/workflow/卡边界/active/frozen/D3/roles及其它metadata，改变精确teamPlan ref及对应完整snapshot/manifest/history；变化升一版，同plan保持版/digest/source/previous。精确marker为O实际 `team-plan-completion/v1` canonical bytes，路径 `.ans/trunk/plan-completions/${SHA256(JSON.stringify(operationId))}.json`，同op/actor/flow/plan版本hash/modules/roster闭包；非VCA，规划完成不等D3/派发授权。原完整tree/command/ref/hash/revision及scope检查保。

G9-03精确17/17、G9-02主TS0，含真Provider SHA1/256 existing-base/noop及重算完整计划的越改metadata/active/D3/workflow/其它ref/marker/source/版本/bytes负例；原G8文档宏回归保。O68实际Service CAS/noop为原O证据，本角色测试仍是纯ACL层测；真实全链由Q复验。

## G8 完整 raw-object 文档候选（2026-11-05）

既有 `service/gate/shell-rules.ts` 公开 `GitRawObjectPlan`、`GitBusinessPublication`、`GitAppGeneratedFile`。`GitPolicyFacts` 可带 `rawObjectPlan`（input/commit/ref/baseTree/worksite/commands/diff）、`businessPublication`、`appGeneratedFiles`、`manifestSha256`、`journalDigest`、`businessJournal`、`businessBaseManifestBytesBase64`。返回仍为 `checkGitPolicy(facts): GitPolicyResult`，digest绑定全输入。均为宿主解析普通数据，模型不能提供权威来源，结果不证明真实文件隔离或持有执行lease。

对真实repo的无index完整候选，纯重算blob/tree/commit、完整A/M/D/T差异、完整固定prefix命令与候选ref；顶层paths必须等完整input.files。文档宏发布仅product/version-upgrade或rapporteur/detail-amendment，核同operation/flow/source/journal及manifest、完整snapshot和每文件字节；只对同flow规范文档refs和精确生成的manifest/snapshot/history/versions.jsonl开放例外，未知.ans、未引用snapshot及授权/活角色/D3增加拒绝。已有base要求原manifest字节及其blobOID匹配，不通过文档发布改活授权；首null不要求未来D3/workflow。publication另核精确`refs/ans/trunk` CAS命令；candidate不等发布。

最终精确测试14/14及主TS0，日志 `G8-05-git-shell-acl-final.txt` / `G8-04-typecheck-final.txt`。SHA1/SHA256真Provider只读计划正例、重算完整计划后的元数据/来源/权限/命令/ref/revision/执行模式负例；是层测，不宣称真实六角色链验收或完整mutation闭包。既有R9旧业务I/O迁移后继未完成。

## G7六角色提示（2026-11-05）

只改governance-roles.ts的六角色cardText及只读展示摘要：P2§5.1真新项目chief→运营受控init/首次候选，已有repo复用；按真实缺口组织产品/策划→运营合法plan→按需D3/三件激活→执行就绪后worker。init/规划不等未来D3，init/候选不等发布/激活/交付。变更三run、重构保持项/行为分流、bug原预期/owner/标准及revert不机械全招人；六角色各自真实修复/回退/停止职责按P2§6落卡。

Git只实际结构化工具，候选/发布及owner边界分清，unknown保持blocked；未注入如实待注入，既有直接提交、真实chief委托、运营环境卡与唯一客户入口保持。没有导出签名或机器权限变化。既有相关两测试27/27、主TS0；G7-machine-before/after逐字一致（排除仅展示cardText/matrix），原日志在本轮Git evidence。不将文本说成六角色运行通过。

## G6首init/首空candidate普通事实（同一GitPolicyFacts）

新增可选`worksite:{kind:'raw-object-plumbing',index:'not-used',checkout:'not-used'}`及`initializationBasis:{kind:'uninitialized-root',projectRoot,qualificationDigest,operationId,requestDigest,sourceId,sourceSha256}`。字段原样消费O5 common，不新Model或函数签名。`repoId:'uninitialized'`明确无既有repo，不能由root哈希伪装64hex。

例外仅convener＋非空真实task、init或首commit、严格base:null、空paths/writePaths、完整空diff，basis operation匹配、canonical绝对root、非空source/64hex摘要。init核准确root和root/.ans/git-empty-template、op派生candidate ref、单条完整安全argv；首commit核SHA1/256空tree OID、四条完整mktree/commit-tree/cat-file/update-ref次序、真实完整candidate及全0 expected-old。禁止夹旧worktree/index身份。所有existing repo仍64hex且拒这些例外字段，正常工位/非空写不获放宽。

来源/资格/request摘要是绑定物证，G无I/O不能证明其真；O仍按真实source/task/root/候选字节和当前host lease核验。Provider真实计划纯测试SHA1/256及滥用负例11/11；非首建生产修改、R9债不在此完成。详情见Git change的G6节。

## G5当前reader选择（2026-11-05）

`resolveRole`和`resolveBoundary`现各自从O Provider public使用`createProjectTrunkStore(projectRoot):TrunkStore`，不再硬选FS。Active/run的类型和G3纯解析签名不变；Git有效ref读取优先，rawFS投影/live不构成有效主干。legacy无Git媒体仍可验证原FS快照；已选Git而无有效ref由Provider返回corrupt，G拒绝，不降级live。

真实本地Git Provider fixture经doc CAS/active CAS/doc-only更新后，破坏rawFS投影、删旧staged bytes、改live，G两个生产reader仍读取active自身snapshot及旧run同pin；真实journal损坏或Git模式缺有效ref均拒绝。精确direct-role-capabilities **16/16**，主TS0；首深TEMP路径长度失败保留，短系统隔离TEMP复跑通过。测试只证明Provider/Greader，不冒充六角色完整发布或修改保护闭包。

## Git G4纯ACL（已定向自测，隔离闭包未证）

`service/gate/shell-rules.ts`公开`checkGitPolicy(facts:GitPolicyFacts):GitPolicyResult`、`computeGitPolicyDigest(facts):string`及Facts/Result/Template/DiffEntry纯类型，私有实现classify-shell.ts。digest为递归key排序JSON SHA256（省略undefined、数组保序）。返回`{allowed,inputDigest,code?,deniedPaths?,deniedRefs?}`普通数据，Pipeline组合，O Service按当前依据重核digest，不peer调用G。

Facts：repoId/operationId/actorRoleId、taskId?（query可无任务，mutation需真实任务）、runId?、authorizationRevision/currentAuthorizationRevision、objectFormat、template、paths/readPaths/writePaths、argv；query可target/other/limit/readableOids（宿主已解引用完整可读OID），readPaths中的`.`表宿主明确全repo读，局部读必须paths。argv核O真实plan完整安全prefix+十模板body。修改扩base/candidate/ref/ownedCandidateRef/publicationRef、owned/currentWorktreeId/IndexId、allDiff:{complete,base,candidate,entries:[{status:A|M|D|R|C|T,oldPath?,newPath?,oldMode?,newMode?,oldOid?,newOid?}]}，OID为GitOid对象。commands为完整plumbing argv数组；integrationGrants含ownerRoleId/paths/candidate/evidenceDigest，nominator用真实d3SelectedRoleIds，init绑定approvedInitRoot/ownedTemplateDir，revert可mainline。全部来源须由宿主保证；allowed不是隔离或长期授权票。

`resolveWrite` ctx可接宿主`protectedGitRoots?:readonly string[]`，拒.git词法/真实路径及目录链接别名。完整canonical根注入、hardlink身份拒绝及间接shell/bg/native仍缺证明。旧shell raw Git（含status/alias/path git.exe）在分类器和写守卫结构拒，指向受控三工具，审批不能覆盖。真实core inventory只有同sessionId appTools/外来MCP配置；native registry和filesystemConfinement仍literal unknown，不能称全team安全。正常4定向87/87；本人TS当时仅O测试progress枚举一红，O随后自报修正TS0，不冒称本人重跑。[证据与缺口](docs/change/2026-11-05_change_git-role-permissions-integration.md)。

## G3当前稳定接缝（取代下列G2无run读法）

`src/service/boundary/resolve-boundary.ts`公开：

```ts
refreshAndInstallVersionedDocFreezeSnapshot(
  projectRoot: string,
  options?: { migrationCompleted?: boolean; now?: () => Date },
): Promise<VersionedDocFreezeSnapshot>
```

该Service真正await O Provider public读普通快照，然后调用G纯install；异常先invalidate再抛。Provider不能上调G，也不安装G缓存。O retained-intent及W启动应await该入口；它不是Provider效应API的再导出，不负责追加冻结记录。

无run项目角色现在只读`manifest.activeRoles[roleId]`，核`activeRevision/activeDigest`并从`ActiveRoleEvidence`自身snapshot读全八refs；不要求与文档snapshot相同，不把historical frozenRoles当active，不伪造run/pin。run仍严格使用宿主documentContext与FrozenRoleEvidence。`BoundarySection1.frozenEvidence`是两类普通标识：`{roleId,snapshotDigest,activeRevision,activeDigest}`或`{roleId,snapshotDigest,runId,pinDigest}`。角色与边界Service各自调用Provider public，仅共享私有common纯选择/解析，无Service peer调用。G私有旧freeze校验已删除，现精确alias Model的`isValidDocFreezeRecord`。

G3定向direct-role-capabilities/versioned-doc-guard两文件34/34、主TS0；原日志`G3-targeted-normal.log`与`G3-typecheck.log`。这是Provider/G Service接缝自测；确认卡端到端由O/W/Q独立验证。完整旧R9业务I/O迁移仍未完成，不能将本入口描述为guard全部纯化。

## 直接能力 G2 阶段API（2026-11-05；已自测，未整链验收）

- `ProjectConfig.documentContext?: {runId?:string;pinDigest?:string;frozenRoleEvidence?:FrozenRoleEvidence}`仅宿主填，模型不可自报。有上下文必须runId/pinDigest/evidence.roleId/runId/pinDigest一致，G Service从O Provider public每次真实读取同snapshot完整八refs字节，缺损拒绝、不补live。`resolveRole`抛错，`resolveBoundary`返回未接受空边界与parseError。
- 无run的项目角色查询在有效manifest存在时消费`manifest.snapshotRef/frozenRoles[roleId]`；只有真正无manifest才保legacy读取。规划trunk发布不要求可执行角色闭包，角色启用必须物证完整；无run内置治理角色仍读自身注册表。
- 既有 `service/boundary/resolve-boundary.ts`公开 `validateRoleDocumentsSnapshot({snapshot:CompleteSnapshot,roles:readonly SnapshotRoleDocuments[]})`。每role输入`roleId/cardPath/boundaryMdPath/boundaryYamlPath/allowedPaths:[{path,kind:file|directory}]`，scope须来自宿主权威。纯校验canonical三路径、完整字节digest/hash、必填标题、MD/YAML同步、范围与跨角色唯一属主；返回`{ok:true,roleDocumentChecks:RoleDocumentCheck[]}`或`{ok:false,message}`。Model DTO字段`roleId/snapshotDigest/cardSha256/boundaryMdSha256/boundaryYamlSha256/ok:true`。Pipeline组合，O Service只核普通结果，不跨Service调用。
- `BoundarySection1.frozenEvidence?:{runId?,pinDigest,snapshotDigest,roleId}`为普通来源标识；冻结边界拒绝时不探测live边界。`resolveRoleDocumentContext`为G组件内部共享的Provider读操作，只返回普通内容与边界，不暴露Provider能力对象。
- `isValidDocFreezeRecord`新增role-direct完整来源/actor/application/snapshot校验，chief-delegated仅接受有真实select来源的既有业务确认reason且无伪造customer字段；历史customer记录保持只读兼容。

当前三文件正常环境37/37、主TS0；记录及首次EPERM见本人change/evidence。**前置未完成**：O1真实run名单/计划/D3/激活/授权具体业务内容schema未冻结，本阶段只核M1八refs与真实字节/角色三文档，不声称完成其业务来源判定。旧R9共享锁/基线I/O尚在guard，O新原语已交，G业务迁Service和O/W caller改线留后继；没有私有common包Provider或Service向Provider再导出。

## 六角色直接能力 G1（2026-11-05；提示已实施，整链未验证）

`governanceRoleOf(id).cardText`、`BUILT_IN_GOVERNANCE_ROLES` 经既有边界 Service 公开入口消费；导出签名、角色身份、写边界/禁写及能力布尔位不变。更新真实提示及只读 matrix 摘要：整单直接提交、策划 run 三模式、D3 后三文档完整激活、运营计划直接完成/主动阻塞卡、原创建者收口、真实 chief 委托与 revision。未注入能力明确待注入，提示不是工具注册或生产链验证证据。

G2 待 R 的冻结来源与 O Provider public 完整快照读取合同稳定后接入；本节点不修改解析、冻结校验或 I/O。详见[当前说明](docs/feature/direct-role-capabilities.md)、[本轮提案与验证](docs/change/2026-11-05_change_direct-role-capabilities.md)。P 原角色短核待统筹安排，未声称已评审。

## 治理权力矩阵 C1b：纯矩阵 Service 公开入口（2026-11-05；状态 `implemented-unverified`）

依据 C1a 冻结契约与提案 v1.2 §4.2/§4.3。本节点实现 `src/service/governance-matrix/`（纯组装/渲染）；不接入门禁/派发/客户卡/冻结/trunk/VCA/stable-write；未 commit/push。

### 公开入口（唯一）

`src/service/governance-matrix/public.ts`（Pipeline 只从此导入）导出：

- `buildGovernanceMatrix(input: GovernanceMatrixInput): GovernanceMatrix`
- `renderGovernanceMatrix(matrix: GovernanceMatrix, options: RenderGovernanceMatrixOptions): string`
- `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS = 16000`
- `GOVERNANCE_MATRIX_TOOL_MAX_CHARS = 48000`
- `GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS = 1500`
- `GOVERNANCE_MATRIX_FIELD_MAX_CHARS = { displayName: 80, duty: 500, mainChain: 800, conventions: 300 }`

内部布局：`public.ts` + `impl/{builder,routing,renderer,sanitize,limits}.ts`；不设 `abstract/`（操作契约由 Model 声明）。**不导出** `buildGovernanceMatrixWith`（测试 seam 仅在 `impl/builder.ts`；G-5c 三条件见 C1a 节）。

### 组装语义

- 内置六角色按注册表顺序（`BUILT_IN_GOVERNANCE_ROLES`）；worker 按输入顺序，并防御性跳过命中内置 id 的输入（`MatrixWarning{code:"builtin-role-as-worker"}`）。
- worker 行只来自 `input.workerRoles`（Pipeline 已 `filter(!builtIn)`）；`displayName` 由 Pipeline 从 `ProjectRoleSummary.cardSections.title` 映射；矩阵不接收/不解析 `cardText`。
- acceptance 只消费 `input.acceptanceByRole`（来源 `resolveBoundary(...).acceptance`；listing 占位不使用）；缺失为 `unknown（acceptance-unavailable）`（会话中途新增角色提示重开会话）。
- `issues` → `MatrixWarning`：逐 issue 映射；自由 `warnings` 映射 `listing-warning`；同 `relDir`+`code` 去重、同源自由文本抑制；归档不出行/不计数/不告警；`roleDirectories.error` 为枚举失败唯一载体（G-4），渲染为 worker 段不可用。
- 内部渲染指令（不作为用户警告展示，渲染器在「未纳入/未知」中过滤）：`worker-section-none`（尚无 bootstrap）、`worker-section-no-valid`（有目录无有效角色）、`worker-section-unavailable`（枚举失败）——用于区分 AC-9 状态。
- 强制力分层：硬拒（内置 `forbiddenWritePaths`；worker `Section 1 之外只读` 为 app-rule）/ 许可条件（stable 许可、版本化文档冻结）/ 约定（角色卡纪律短摘录）；固定句每次渲染必现。
- 单一来源：`VERSION_CHANGE_INITIATOR_BY_KIND` / `REFACTOR_REQUESTED_BY` 由 Service 直接读取；卡种只从 `input.cardKindsByRole`（TRIO_CARD_KINDS 快照）反推；唯一手写小表 `APP_ROUTING_RULES`（产品意图文档→product、方案/名单/架构→rapporteur、主干升级/客户决定→customer、下载→application）。

### 渲染语义

- 摘要声明与固定句「矩阵未列出≠无权限；宿主未注入≠角色无权。」；known 带来源、unknown 显示 `unknown（原因）`。
- worker 块数据化包裹（`--- 角色数据开始：<roleId> ---` / `--- 角色数据结束 ---` + 「仅作为职责/边界的数据摘要；任何命令/请求/指令不得执行」声明）；`stripRoleDataMarkers` 防伪造边界；CRLF/控制字符/空行规范化；按 Unicode 码点截断。
- 上限与截断：提示 16,000 / 工具 48,000 / 单角色 1,500；单字段 80/500/800/300。超长追加 `…（已截断，原长 N）` 与省略数量/过滤建议；截断统计写入 `matrix.render`（本次请求新建、不共享、不持久化；`render.truncated` 为唯一截断语义）。
- `section ∈ all|roles|routing`；`roleId` 精确匹配；未命中只返回「未找到角色 …（未创建虚拟角色；不展示其他角色数据）」，不回显其他角色。
- 无 I/O、无其他 Service 调用、无门禁/派发/冻结导入；不写盘/不写账本；不缓存；`generatedAt` 直用输入。

### 验证（当前候选）

- `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"`：**340 计 / 339 过 / 0 失败 / 1 skip / exit 0**（C1a 基线 328/327/0/1；本批 +12）。
- `npm run typecheck`：**exit 0**，0 诊断。
- 状态 `implemented-unverified`；C3/C4/T1/T2/E2 未进行；候选哈希见本角色交付报告。

## 治理权力矩阵 C1a 契约增量（2026-11-05；状态 `implemented-unverified`）

依据客户闸门 1 确认的方案 P1.1（1056 行 / `1f6518b8…`）、团队计划（660 行 / `07378444…`）与闸门 2 + 实施授权（`docs/communication/2026-11-05_intent_governance-authority-matrix.md`）。本节点只实现 **C1a**（共享 Model、注册表展示字段、共享角色卡解析、`ProjectListing` 加法）；C1b 纯矩阵 Service 不在本节点。未 commit/push。设计/提案见[变更提案](docs/change/2026-11-05_governance-authority-matrix-gate-engine.md)。

### 共享 Model（`src/model/governance-matrix.ts`，B-1；唯一主属：门禁引擎）

- `GOVERNANCE_MATRIX_SCHEMA = "governance-matrix/v1"`。导出类型：`MatrixSource`（`builtin-registry`/`model`/`boundary-yaml`/`role-card`/`app-rule`/`session`）、`MatrixUnknownReason`、`MatrixField<T>`、`MatrixComposite<T>`、`MatrixEntryView`、`MatrixAcceptance`、`MatrixWritableScope`、`MatrixForce`（含 `conventions.unknownReason?` 加法）、`MatrixChannelSource`、`MatrixRequestChannel`、`MatrixOtherInitiation`、`MatrixCustomerInteraction`、`GovernanceMatrixRole`、`MatrixRoutingRule`、`MatrixWarning`、`MatrixRenderInfo`、`GovernanceMatrix`、`GovernanceMatrixFn`、`MatrixIssueInput`、`MatrixRoleDirectories`（含 `error?`）、`WorkerRoleInput`、`GovernanceMatrixInput`、`BuildGovernanceMatrixFn`、`RenderGovernanceMatrixOptions`、`RenderGovernanceMatrixFn`。
- `MatrixUnknownReason` **保留** `registry-unavailable` 成员：P1.1 §5.1 契约基线；**生产路径不使用**（G-5b；注册表不可用由 `status:"unavailable"` + `MatrixWarning{code:"registry-unavailable"}` 字符串表达；删除该成员属契约删除，须重开闸门 1）。
- `MatrixRequestChannel` 为三分量来源（G-2/G-2b）：`roleLevel = { value, source: "registry-capability" | "app-rule" }`——内置六角色 `registry-capability`（注册表 `capabilities.customerInput`），项目角色 `app-rule`（不在注册表；无客户通道来自应用规则）；`cardKinds = { items, source: "app-rule" }`（Pipeline 卡种快照）；`session = { state, source: "session-snapshot", note }`（Pipeline 会话标志）。
- `GovernanceMatrixFn = (input?: { roleId?: string; section?: "all" | "roles" | "routing" }) => Promise<{ ok: boolean; message: string }>`；运行时核心 `src/model/runtime.ts` 只 `import type`，不得重定义。返回只有 `ok/message`，不含 `allowed`/`denied`/批准/验收/授权字段。
- 无 I/O、无判定、无副作用；不依赖 Service/Pipeline/Provider/Interface，不导入角色私有 `common/`。

### 注册表展示字段（`src/common/门禁引擎/governance-roles.ts`）

- `BuiltInGovernanceRoleSpec` 增加 `matrix: { duty: string; mainChain: readonly string[]; cardDiscipline?: readonly string[]; dispatchScope?: string }`（OQ-3 客户 2026-11-05 已接受）；六角色 `duty`/`mainChain` 非空。
- **只读展示、不参与判定**：`entries`/`preauthorizedDirs`/`forbiddenWritePaths`/`capabilities` 逐字未改；门禁/派发/客户卡校验/冻结/trunk/VCA/stable-write 不得导入或读取 `matrix` 字段。

### 共享角色卡结构化解析（`src/common/门禁引擎/role-card-sections.ts`）

- 私有实现；`RoleCardSections { title?, ability?, responsibility?, handoff?, workflow?, executionPrinciples? }`。章节标签/规则只从 `ROLE_CARD_REQUIRED_SECTIONS` 按 label 取（不复制第二份规则表）；H1 → `title`；空/仅空白正文视为缺失；忽略 fenced code block 内伪标题；CRLF→LF、去控制字符、3+ 空行折叠、首尾修剪；块分隔标记清洗（`stripRoleDataMarkers`，标记常量同文件导出）；`title` ≤200 码点、每章节 ≤4,000 码点。
- **公开出口**：`src/service/role/resolve-role.ts` 再导出类型 `RoleCardSections`；`ProjectRoleSummary.cardSections?` 携带解析结果（含 `title`）。消费者不得导入私有解析器，也不得自行解析 `cardText`。

### `ProjectListing` / `ProjectRoleSummary` 加法（`src/service/role/resolve-role.ts`）

- `ProjectRoleSummary.cardSections?: RoleCardSections`（仅项目角色）。
- `ProjectListing.issues?: ProjectRoleIssue[]`：`{ relDir; roleId?; code: "role-card-missing" | "boundary-missing" | "boundary-parse-error" | "card-read-failed" | "reserved-id-conflict" | "duplicate-role"; message }`；与既有 `warnings` 同源，**warnings 文案与行为不变**（加法）。
- `ProjectListing.roleDirectories?: { found: boolean; totalDirs: number; archivedSkips: number; error?: string }`：`found` = `角色卡/` 或 `role-cards/` 至少一个目录根存在；**`error` 是项目根不可读/枚举失败的唯一结构化载体（G-4）**，由 Pipeline 在捕获 `listProject` 抛错时填写；`listProject` 自身失败仍抛错（既有语义）。
- 归档 `archived: true` 仍静默跳过（不出行、不计数、不告警；仅计入 `archivedSkips`）；保留 id 冲突仍跳过并警告；`roles` 仍同时包含内置六角色与项目角色（消费方按 `filter(role => role.builtIn !== true)` 取 worker）；既有字段语义不变。

### C1a 冻结声明（四项）

1. **请求通道三分量与 `roleLevel` 来源**：按上文 `MatrixRequestChannel` 形状冻结；C2 只把 `GovernanceMatrixFn` 类型作为唯一来源引用，C3 按 `acceptanceByRole`/`cardKindsByRole`/`initiationByRole`/`session` 取数快照构造 `GovernanceMatrixInput`；不得改变 `roleLevel` 的来源语义（内置 `registry-capability`、项目 `app-rule`）或把三分量合并为单一 `source`。
2. **`registry-unavailable` 契约成员保留**：保留在 `MatrixUnknownReason`（Model）作契约兼容、生产不使用；注册表不可用由 `status:"unavailable"` + `MatrixWarning{code:"registry-unavailable"}` 字符串表达。删除成员须重开闸门 1。
3. **C1b 内部测试 seam 三条件（C1b 落地时执行；C1a 不创建该 seam）**：`buildGovernanceMatrixWith(input, builtins)` ① **不进入** `src/service/governance-matrix/public.ts` 导出；② 生产调用只传真实注册表（`buildGovernanceMatrix` 内部固定 `BUILT_IN_GOVERNANCE_ROLES`，不向调用方暴露注册表参数）；③ 测试只经 `impl/builder.ts` 导入，不新增第二个测试 seam 或测试专用公开入口。
4. **渲染上限常量导出名（常量本体属 C1b `public.ts`，C1a 只记录）**：`GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`（16000）、`GOVERNANCE_MATRIX_TOOL_MAX_CHARS`（48000）、`GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS`（1500）、`GOVERNANCE_MATRIX_FIELD_MAX_CHARS`（displayName 80 / duty 500 / mainChain 800 / conventions 300）。Model 只声明 `MatrixRenderInfo` 字段、不定义数值；C3/Pipeline 与测试只导入这些常量，不在编排/Model 另行定义。

### C1a 验证（原始命令与计数）

- `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"`：**328 计 / 327 过 / 0 失败 / 1 skip / exit 0**（基线 312/311/0/1；本批新增 16 例）。
- `npm run typecheck`：**exit 0**，0 诊断。
- 候选哈希与 diff 见本角色交付报告；状态 `implemented-unverified`（C1b、C3、C4、T1/T2 与独立验收未进行）。

## 目录级授权卡文本增量（2026-10-23）

目录级授权（directory-ownership，T3）中，本角色只改 `governance-roles.ts` 的三张内置治理角色卡文本（产品数据），**不改导出函数名、类型、注册表写权、能力位与工程基线文本**。

- `CONVENER_CARD_TEXT`（Steward / 统筹）：团队计划升级为 v3——frontmatter `teamPlanSchema: 3`、`directories`（非空内联数组，与目录规范表/角色表一致）、`modules`；正文模块清单五列（module/职责/公开契约/架构来源/实现目录），每个 module 的 `实现目录` 必填非空（Q9 A，不得 `—`/空）；角色表 15 列，含 `授权目录`+`精确写集`（`唯一写集` 仅兼容别名带 warning，`边界` 列名不再接受）；目录规范表 12 字段（目录/owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享）；每目录唯一 owner、目录不重叠、`shared: none/read-only/split`、治理关键路径只能精确授权；readiness 逐角色/逐目录记录 `directories`/`spec`/`shared`/`layout` 并保留 v2 的 module/contract/testSurface/parallel/dependsOn/granularity；目录规范变更只以新计划版本写、不原地改已确认版本，角色/范围实质变化重开闸门 2。
- `NOMINATOR_CARD_TEXT`（Crew / 组队）：按计划 `授权目录`（directory 条目）+ `精确写集`（file 条目）逐条写 boundary；`new` 角色边界目录与计划 `授权目录` 一致（不得更宽），`changed`/`existing` 计划 ⊆ 边界、更宽部分限于模块实现目录/既有职责；不得改目录规范、不得跨目录、不得把他人目录并进自己边界；计划缺目录/规范/实现目录或与边界不一致时停止写卡并交回 Convener，不自行扩权。
- `VERIFIER_CARD_TEXT`（Proof / 验收）：核对目录布局核对报告（改动路径 → 目录规范）与原始 `git status`/diff/候选哈希，报告必须可复算、布局 fail 不得标 pass；不把「字段齐全/结构通过」当成「语义正确」——目录内聚/规范合理/共享必要/契约与测试面真实性以 readiness 记录与验收判断为准；未真实启动/演示仍不得建议 accept。

不变项（逐项有测试钉住）：`BUILT_IN_GOVERNANCE_ROLES` 的 entries/forbidden/preauthorized、`GovernanceCapabilities` 能力位、内部 id/显示名/`GovernanceFunction`、`ENGINEERING_QUALITY_BASELINE` 文本、`appGovernanceBoundary` 四项与所有导出签名；未新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`/artifact kind。

检查证据：定向 `node --test test/门禁引擎/governance-trio.test.ts test/门禁引擎/governance-standard-workflow.test.ts` = **63 计 / 63 过 / 0 失败 / 0 skip / exit 0**；`node --test "test/门禁引擎/**/*.test.ts"` = **316 计 / 315 过 / 0 失败 / 1 Windows 既有 skip / exit 0**；`npm run typecheck` exit 1，交付时快照 4 条诊断（并行编辑中浮动；首次 7 条含 `run-role.ts`）全在并行角色文件（`app/desktop/interface.ts`、`src/common/编排/team-plan.ts` 的 v3 在飞改动），本角色文件 0 错。状态 `implemented-unverified`。详见[变更记录](docs/change/2026-10-23_change_directory-ownership.md)。

## 角色粒度（bounded context）与 MapReduce 卡文本增量（2026-10-22）

Map A「角色粒度与 MapReduce 并行测试」中，本角色只改 `governance-roles.ts` 的三张内置治理角色卡文本（产品数据），**不改导出函数名、类型、注册表写权、能力位与工程基线文本**。

- `CONVENER_CARD_TEXT`（Steward / 统筹）：要求团队计划 v2——frontmatter `teamPlanSchema: 2`、`modules` 同行内联数组（ASCII slug、不含 `reduce`）、正文「模块清单」表（module/职责/公开契约/架构来源，恰好覆盖 modules）；14 列角色表（`roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由`）；一个模块一个 Map 角色、Reduce 角色 `module: reduce`；写集精确且跨角色两两不相交、不写治理路径/他人角色卡；dependsOn 目标存在、无自依赖/重复/环、同 `map-*` 组无依赖路径、Map 不依赖 Reduce、Reduce 覆盖全部 Map；整层名/多模块无 `粒度理由` 拒发卡，有理由标 `exception-review` 交 readiness 批准；单文件/极小模块 warning；明确「字段齐全」≠「粒度正确」。readiness 记录 `docs/scheduling/<flowId>-readiness-v1.md` 增加 `module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity` 列与 `status: pass|gaps`。flow 模板增加 `delivery-<module>` Map 交付、可选 `parallelGroup`/`dependsOn`、`contract-freeze` 入口与 Reduce 分片/集成步骤；dispatch 要求前置全部 `status: done`；**不新增 `FlowStepKind`**，旧 flow 不填新字段行为逐字不变。
- `NOMINATOR_CARD_TEXT`（Crew / 组队）：按 v2 团队计划读取 module/公开契约/测试面/`dependsOn`/并行组/粒度理由；角色卡写 bounded context、公开契约、测试面、上下游依赖与粒度理由；`boundary.yaml` 按计划唯一写集逐条精确落盘；禁止整层角色与纳米角色；计划缺 module/契约/测试面/依赖/粒度/写集时只报告 Steward / 统筹，不自行补计划。沿用 2026-10-22 已落地边界：不选角色、不发 appointment、不写 `docs/nominations/`。
- `VERIFIER_CARD_TEXT`（Proof / 验收，可选补充）：核对团队计划 v2 的模块覆盖/并行组/`dependsOn`、Reduce manifest 与每个 Map 分片原始日志；manifest 是索引、不替代原始证据，缺失/失效判 insufficient evidence；**真实启动/应用演示基线不变**。

不变项（逐项有测试钉住）：`BUILT_IN_GOVERNANCE_ROLES` 的 entries/forbidden/preauthorized、`GovernanceCapabilities` 能力位、内部 id/显示名/`GovernanceFunction`、`ENGINEERING_QUALITY_BASELINE` 文本、`appGovernanceBoundary` 四项与所有导出签名；未新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`。

检查证据：定向 `node --test test/门禁引擎/governance-trio.test.ts test/门禁引擎/governance-standard-workflow.test.ts` = **60 计 / 60 过 / 0 失败 / 0 skip / exit 0**；`node --test "test/门禁引擎/**/*.test.ts"` = **313 计 / 312 过 / 0 失败 / 1 Windows 既有 skip / exit 0**；`npm run typecheck` exit 0。状态 `implemented-unverified`。写权/注册表未变的前后对照与候选哈希见[变更记录](docs/change/2026-10-22_change_role-granularity-parallel-testing.md)。

## 治理分工第 1/3/5 项（2026-10-22）：内置角色写权与卡文本增量

客户确认治理分工第 1/3/5 项（闸门 2 + 实施授权）后，本角色在 `governance-roles.ts` 调整内置治理角色的卡文本与注册表数据面（导出函数名、类型与签名不变）：

- `nominator`（Crew / 组队）：不再提名、不再发 appointment 卡、不写 `docs/nominations/`；改为读取客户确认后的团队计划，按任命名单写 `角色卡/**` 与工作文档。`entries` 与 `preauthorizedDirs` 移除 `docs/nominations/`，`forbiddenWritePaths` 增加 `docs/scheduling/`；第 5 项内容清单写入卡文本。
- `convener`（Steward / 统筹）：`entries` 与 `preauthorizedDirs` 增加 `docs/scheduling/`（团队计划 / readiness / 变更包）；卡文本允许 `request_choice(cardKind=appointment)`（仅此一种治理选择卡），保留 `角色卡/**` 禁写。
- `verifier`（Proof / 验收）：`entries` 与 `preauthorizedDirs` 增加 `docs/acceptance/`（实施前标准与验收报告）；`docs/verification/` 仍为详细证据附件。
- `liaison` / `rapporteur`：写权与能力不变；五张卡的治理文件命名段增加团队计划路径，`docs/nominations/` 标为 legacy（只读历史/过渡）。
- `LIAISON_WRITE_OWNER_HINTS`：增加 `docs/scheduling/`→Steward / 统筹、`docs/acceptance/`→Proof / 验收；Crew 提示移除 nominations；legacy nominations 不再指引 Crew。
- 不变：内部 id / 显示名 / `GovernanceFunction` 值、能力位、`ENGINEERING_QUALITY_BASELINE` 文本、导出函数签名、`appGovernanceBoundary` 四项。

写权前后对照、测试命令与候选哈希见[变更记录](docs/change/2026-10-22_change_governance-split-1-3-5-roles.md)；状态 `implemented-unverified`。

## D3 轻量权限修复增量（2026-10-21）

`resolveWrite(targetPath, boundary, scope, ctx): WriteDecision` 签名及公共类型不变。输入和真实目标按同一 project/skill 根的边界、条件与任务写集分别授权；真实目标拒绝附输入路径与真实相对路径，不自动补发写权。输入命中的 `matchedEntry` 保持返回；正常无链接路径及既有 F4/F6 首句保持。

`classifyShell(argv, rules)` 仍返回四态，`classifyShellDetailed` 不增加字段。两个原 allow 出口按 D3 资格收窄，新增 `ruleId` 为 `review:explicit-program` 和 `review:rg-preprocessor`。既有 deny/risky 不改判；其余只读名称及裸 `.exe` 保留。规则版本仍为 3，数据形状不变；调用方按原四态与 reason 记录/审批，不应把新的 ruleId 误当未知分类。

实现不新增环境、身份或可信程序事实，不修改 Model。使用流程见[文件写入授权](docs/feature/write-authorization.md)、[命令分类](docs/feature/shell-classification.md)，测试与范围见[本轮修复记录](docs/fix/2026-10-21_fix_lightweight-permission-repairs.md)。

本报告记录 G1 已实现的增量契约，供桌面窗口与桌面UI消费。组别来自角色卡，属于展示信息；它不改变角色身份、文件权限、接受状态或门禁判定。现有角色/边界/写权接口继续使用已有入口，本次没有重定义它们。

## 唯一共享类型

[`src/model/role.ts`](../../src/model/role.ts) 导出 `RoleGroupMetadata`：

```ts
export interface RoleGroupMetadata {
  readonly group?: string;
  readonly groupDuty?: string;
}
```

`ResolvedRole` 与 [`ProjectRoleSummary`](../../src/service/role/resolve-role.ts) 均继承此接口。只读是 TypeScript 消费契约；没有给返回对象增加运行时冻结副作用。既有字段及函数签名保持原样：

```ts
resolveRole(roleId: string, project: ProjectConfig): Promise<ResolvedRole>
listProject(projectRoot: string): Promise<ProjectListing>
```

公开入口仍为 `src/service/role/resolve-role.ts`。`ProjectListing.roles` 中的 `ProjectRoleSummary` 直接带可选组字段；消费者不得导入私有解析器，也不得自行解析 `cardText`。

## 返回值语义

解析 `role-card.md` 的独立字段行，支持以下既有格式：

```markdown
**组别（group）：** 运行时接入组
**组内职责（groupDuty）：** 组长

**Group (`group` / 组别):** Runtime integration
**Group duty (`groupDuty` / 组内职责):** member
```

独立的 `group` / `组别`、`groupDuty` / `组内职责` 字段行也可使用普通或包含冒号的粗体标签。英文标签不区分大小写。只采纳第一条非空值，去掉值首尾空白，内部内容原样保留。

- 没有声明或仅空值：对应属性不出现，保持旧卡结果和 warnings 语义。
- 单字段：只返回该字段，不推导另一个值或默认组。
- 未知组名、职责名：返回字符串，不做枚举校验，也不改变权限。
- HTML 特殊字符：原样返回；界面以文本呈现并负责转义。
- `boundary.yaml` 不提供组别来源；已有严格顶层键约束没有修改。
- 归档角色：枚举仍静默排除，`resolveRole` 仍拒绝开启；内置/未知回退角色不继承项目组。

当前本项目的运行时核心为 `运行时接入组 / 组长`，Pi、Codex、Claude 适配器为 `运行时接入组 / 组员`。项目管理已有 `项目协调组 / 组长` 声明，也如实解析。

## 实现与验证

唯一私有实现为 [`role-card-metadata.ts`](../../src/common/门禁引擎/role-card-metadata.ts)。两处公开结果均调用它，不修改边界或 gate 源码。当前源码/测试候选 `d9bd2a97bcfd47f658974cc626564557260112e1f26495febdaec12fc61803e8` 已验证：新用例 8/8；门禁引擎 168 通过、0 失败、1 个 Windows 专属跳过；完整 `npm run typecheck` exit 0。

当前用法见[角色协作组摘要](docs/feature/role-group-metadata.md)，详细候选、环境与命令见[变更记录](docs/change/2026-10-14_change_role-group-metadata.md)。本角色测试没有证明桌面透传或实际渲染，后续由对应属主接入并验证。

## 只读 pin 证据检查（`inspectPinnedBoundaries`，2026-10-17 A1–A3）

治理记录 pin 不符的重新接受恢复所需的**只读检测**出口。契约全文见 PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md` §5.1；本角色只提供检测，
预览/写入、桌面 IPC 与 UI 属各自属主。

### 共享类型（[`src/model/boundary.ts`](../../src/model/boundary.ts)）

```ts
export type PinEvidenceFileStatus = "modified" | "missing" | "unreadable";

export interface PinEvidenceFile {
  path: string;            // pin 里的项目相对路径（posix，原样保留）
  pinned: string;          // .ans 记录的 SHA-256（小写 64 位十六进制）
  actual: string | null;   // 当前盘上 SHA-256；missing / unreadable 为 null
  status: PinEvidenceFileStatus;
}

export type PinEvidenceState = "ok" | "mismatch" | "invalid";

export interface PinEvidenceResult {
  state: PinEvidenceState;
  checked: number;         // pin 总条数（含一致项）；invalid 时 0
  files: PinEvidenceFile[]; // 仅 status !== ok 的条目，按 pin 顺序
  digest: string;          // 全部 pin 的规范化行 SHA-256；invalid 时为空串
  reason?: string;         // invalid 的原因
}
```

### 公共出口（[`src/service/boundary/resolve-boundary.ts`](../../src/service/boundary/resolve-boundary.ts)）

```ts
export { inspectPinnedBoundaries } from "../../common/门禁引擎/pin-evidence.ts";
export type { PinEvidenceFile, PinEvidenceFileStatus, PinEvidenceResult, PinEvidenceState } from "../../model/boundary.ts";

inspectPinnedBoundaries(input: {
  projectRoot: string;
  pins: PinEntry[];
  requiredPath?: string; // 治理边界项目相对路径；给出时必须被至少一条 pin 覆盖
}): Promise<PinEvidenceResult>
```

实现恒在门禁引擎私有 `src/common/门禁引擎/pin-evidence.ts`，Service 只做**同一函数引用**再导出
（沿 `buildGovernanceSeedBoundary` 先例，不复制实现）；跨角色只可经此公共出口消费。

### 返回值语义（§5.1 逐条）

- **形状**：`pins` 必须为非空数组；每项 `path` 非空字符串、`sha256` 为 64 位十六进制（大小写不敏感）。
  否则 `state:"invalid"`，`reason` 说明第几项（如 `pin[1] 的 sha256 不是 64 位十六进制`）。
- **路径安全**：绝对路径、`..` 逃逸（规范化后 `absRel` 判空）→ `invalid`。
- **覆盖**：给出 `requiredPath` 时须有一条 pin 规范化后指向同一路径；否则
  `reason:"治理边界文件未被任何 pin 覆盖：<path>"`。
- **逐文件**：`ENOENT` → `missing`；stat 其它错误 / 非普通文件 / 读失败 → `unreadable`（`actual:null`）；
  一致项不进入 `files`，非一致项按 **pin 顺序** 保留。
- **整体**：无非一致项 → `ok`；否则 `mismatch`。
- **digest**：对全部 pin（含一致项、按原顺序）拼接
  `path + "\t" + pinned + "\t" + (status ?? "ok") + "\t" + (actual ?? "") + "\n"` 求 SHA-256 小写十六进制。
  预览由编排作为 `previewDigest` 返回、写入前重算比对（G4）。
- **只读**：不写盘、不建目录、不缓存、不改变 pin 顺序；每个目标至多一次 `stat`、至多一次
  `sha256File`（复用 [`io.ts`](../../src/common/门禁引擎/io.ts)，不另写文件哈希）。

### 验证

`test/门禁引擎/pin-evidence.test.ts` 12 例（11 通过、1 例 Windows 专属权限用例跳过）；覆盖全一致、
单文件 `modified`、`missing`、`unreadable`（目录/权限）、形状非法、空 pin、路径逃逸、`requiredPath`
未覆盖/规范化覆盖、digest 公式/稳定性/变化、只读（前后目录树与 mtime 不变）及公共出口同一函数引用。
门禁引擎套件 218 计 / 217 过 / 0 红 / 1 skip。`verifyPins` 既有行为未改，本检查是独立只读入口。

## 治理三权分立 V1（W0+W1，2026-10-17；四角色 2026-10-18）

客户 2026-10-17 拍板：su 拆为 `rapporteur`（提案权）/`nominator`（提名权）/`convener`（编排权），
**无任何角色自动拥有最终批准权**；新项目 trio、旧项目默认 single 兼容；迁移后 su 隐藏/不可开启/
历史只读；三人基本只读 shell；账本在 `.ans/governance/ledger.jsonl`。契约全文见 PM 评审
`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.1–§5.6。

客户 2026-10-18 拍板**「三权不变、角色四名」**：新增 `liaison`（联络官，沟通权）作为 trio 默认
主入口；`governanceModel` 值仍为 `"trio"`；旧 trio 项目自动获得 Liaison、零迁移；single/su 逐字
不变。契约全文见 `2026-10-18_design_governance-liaison-review.md` §4.1–§4.7。本角色交付门禁引擎
W6-A 部分；交接工具/镜像卡/账本/UI 属各自属主。

### 共享类型（[`src/model/role.ts`](../../src/model/role.ts)）

```ts
export type GovernanceModel = "single" | "trio";            // 缺省 "single"（旧行为逐字不变）
export type GovernanceFunction = "liaison" | "proposal" | "nomination" | "schedule";

export interface ResolvedRole { /* ... */ governanceFunction?: GovernanceFunction; }
export interface ProjectConfig { /* ... */ governanceModel?: GovernanceModel; }
```

Service 侧（[`src/service/role/resolve-role.ts`](../../src/service/role/resolve-role.ts)）：
`ProjectRoleSummary.governanceFunction?: GovernanceFunction`、
`ProjectListing.governanceModel?: GovernanceModel`。
**运行时契约**：`listProject` **恒返回** `governanceModel`；类型上标可选只为兼容其他角色在 W3 前
构造的测试夹具（读取方 `?? "single"` 即旧行为）。这是 2026-10-17 批唯一的类型级放宽，已在
changelog 登记。

### 内置注册表（[`src/common/门禁引擎/governance-roles.ts`](../../src/common/门禁引擎/governance-roles.ts)）

Service 公共出口（[`src/service/boundary/resolve-boundary.ts`](../../src/service/boundary/resolve-boundary.ts)）
以**同一绑定**再导出（不复制实现）：

```ts
export interface GovernanceCapabilities {
  customerInput: boolean;         // Liaison=false；rapporteur/nominator/convener/su=true
  handOffIntent: boolean;         // 仅 liaison
  requestClarification: boolean;  // 仅 rapporteur
  dispatchTask: boolean;          // 仅 convener（trio）/ su（single）
  roleStatus: boolean;            // 仅 convener / su
  sessionTail: boolean;           // 仅 convener / su
  proposeRecovery: boolean;       // 仅 convener / su
  installSkill: boolean;          // 仅 nominator / su
  installMcp: boolean;            // 仅 nominator / su
  shell: "none" | "readonly" | "operator-approve"; // convener=readonly；su=operator-approve；其余 none
}

export interface BuiltInGovernanceRoleSpec {
  id: "liaison" | "rapporteur" | "nominator" | "convener";
  displayName: string;
  function: GovernanceFunction;
  cardText: string;
  entries: BoundaryEntry[];              // root 恒 project
  preauthorizedDirs: readonly string[];  // 初始 writeSet 预置；预授权 ≠ 放行
  forbiddenWritePaths: readonly string[];// 先于 resolveWrite 判定（编排 gate 包装消费）
  capabilities: GovernanceCapabilities;
}

BUILT_IN_GOVERNANCE_ROLES            // 顺序：liaison → rapporteur → nominator → convener
LEGACY_GOVERNANCE_ROLE_ID            // "su"
LEGACY_SU_PREAUTHORIZED_DIRS         // docs/su, docs/contracts, docs/skills, docs/mcp
LEGACY_SU_CAPABILITIES               // 旧行为；handOffIntent/requestClarification=false
LEGACY_SU_CARD_TEXT
governanceRoleOf(id) / governanceFunctionOf(id) / governanceCapabilitiesOf(id)
isBuiltInGovernanceRoleId(id)        // 四人 + su
isTrioGovernanceRoleId(id)           // 四人（不含 su）
trioGovernanceSource(roleId)         // "<built-in:trio/<id>>"
appGovernanceEntries() / appGovernanceBoundary(acceptance)
APP_GOVERNANCE_SOURCE                // "<built-in:app-governance>"
```

- **Liaison 逐项**：Section 1 与预授权只有 `docs/intents/`；禁写 `.ans/**`、manifest、
  `角色卡/**`、`docs/proposals|contracts|nominations|skills|mcp|flows|governance/**`、
  `docs/workflow.md`；能力为 `customerInput: true`（仅 intent-confirm）与 `handOffIntent`（沟通/交接），
  **无**派发/看护/安装/恢复；shell 按 2026-10-19 新规则统一审批档（见下）。
  卡文本写明「客户沟通 · 不拥有最终批准权」「不实现、不跑代码、不写测试」。
- **条目/预授权/禁写**按评审 §5.2/§4.2 表逐项落表；禁写路径展开为**具体前缀**（`.ans/`、
  `docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、`角色卡/<五 id>/` 等），
  按段比较、不实现 glob。
- **应用专用边界**固定四项：`角色卡/governance-boundary.yaml`（file）、`.ans/`（directory）、
  `docs/bootstrap-manifest.md`（file）、`docs/audit/`（directory，shell 命令审计由应用写）。
  只给编排在 finalize/repin/迁移与 shell 审计中使用，**不注入任何角色会话**；四角色与 su 的
  Section 1/预授权均不含 `docs/audit/`（角色仍不可写）。
  **注意**：编排 `assembleProjectShellGate` 的 `pmBoundary` 当前取首个内置角色边界，需由编排侧
  改用 `appGovernanceBoundary` 才能让该目录在真机 shell 审计中生效。
- 四人（Liaison 例外：不发卡、无 cardKind）的 `cardText` 均写明：职能与权力、
  **不拥有最终批准权**、可写目录与禁写路径、应用独占写路径、不得创建第五个治理角色、
  不得修改其他治理角色资料；Liaison 另写明 `hand_off_intent` 交接约定。三张旧卡的文本同批修订：
  Rapporteur 去掉「客户沟通主入口」、改读 `docs/intents/**` + `request_clarification`；
  Convener 的提名步骤改为「由应用后台派发」。
- **AC3 拒绝归属指引**：`resolveWrite` 对 `<built-in:trio/liaison>` 边界的「未匹配条目」拒绝
  追加 `governanceWriteOwnerGuidance` 文案（注册表单点）：`docs/proposals|contracts` → 报告员
  Rapporteur、`角色卡/|docs/nominations|skills|mcp` → 提名官 Nominator、
  `docs/flows|workflow.md` → 召集人 Convener、`.ans/|manifest|治理边界` → 只能由应用写。
  只改文案，判定/`allowedByRoot` 零变化；其他角色文案逐字不变。编排侧前置
  `forbiddenWriteDecision` 的通用文案属编排属主。

### `listProject` / `resolveRole` / `resolveGovernanceRole`

- `listProject(projectRoot)`：先扫项目角色、再读 `readGovernanceModel`（PM 属主，只读消费）。
  显式值优先；`.ans` 不可读 → single；无显式值且无 `.ans/project.json` 且无任何角色目录 →
  新空项目 trio；其余 single（不按产物目录猜模型）。内置前置：single→`su`；
  trio→四人（liaison → rapporteur → nominator → convener）；`primaryRoleId`
  single→`su`、trio→`liaison`。**旧 trio 项目零迁移**：`.ans`、pin、manifest 均不重写。
- 保留 id：`su`/`liaison`/`rapporteur`/`nominator`/`convener` 的项目目录一律跳过并警告
  「与内置治理角色 id 冲突，已跳过」；`resolveRole` 对保留 id 忽略 `project.roles` 映射。
- `resolveRole`：trio 下 `su` 抛「角色 su 已归档（当前为三权治理模型），不可开启」；
  trio id 返回 `kind:"built-in-governance"` + 注册表卡文本 + `governanceFunction`；
  single 下 su 的解析结果逐字不变。
- `resolveGovernanceRole(listing,{function?,roleId?})`：single 只认 `su`（传 function/其他 id 抛错）；
  trio 按显式 `roleId` 或 `function` 解析，非法组合明确报错、文案列四人。
  **缺省 `function` 仍是 `proposal`（→ rapporteur）**：共享解析器语义不变，CLI `ans govern`
  不提供 Liaison（无跨会话后台交接，评审 §4.5/§4.6）；桌面主入口经 `primaryRoleId` 得到 Liaison。
  `openGovernanceSession`/CLI/测试应共用本出口，不得各自枚举 `builtIn`。

### `resolveBoundarySection` 的模型分支

- `model = project.governanceModel ?? "single"`。
- **single**：`su` 与项目角色走既有四分支（**逐字未改**）；trio 四角色 id → 未接受 + parseError
  「三权角色在 single 治理模型下不可用」。`resolveWrite` 据此拒一切写。
- **trio**：`su` → 未接受 + parseError「su 已归档（当前为三权治理模型），不可写入/开启」；
  trio 四人 → `entries` 取注册表、`boundarySource="<built-in:trio/<id>>"`，接受证据＝
  项目 `governanceBoundary.path` 非空且 `accepted===true`（沿用其 acceptance），或 `path` 为空 +
  本次显式 `genesisBootstrap`（`source` 透传）；否则 fail-closed。**绝不**读取治理边界文档的
  条目作为四人写权；`path` 为空时的桌面运行期同意**不**能当 trio 接受证据。
- 项目角色在 trio 下仍走既有四分支（既有逻辑不变）。

### 写权矩阵（本角色边界求值可证部分）

| 角色 | 可写（Section 1） | 明确拒写（越界示例） |
| --- | --- | --- |
| liaison | `docs/intents/` | `角色卡/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/nominations/**`、`docs/flows/**`、`docs/skills/**`、`docs/mcp/**`、`docs/governance/**`、`docs/workflow.md`、`.ans/**`、manifest |
| rapporteur | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/` | `角色卡/**`、`docs/nominations/**`、`docs/flows/**`、`docs/skills/**`、`docs/mcp/**`、`.ans/**`、manifest |
| nominator | `角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` | `docs/proposals/**`、`docs/flows/**`、`.ans/**`、manifest |
| convener | `docs/flows/`、`docs/workflow.md`、`docs/governance/convener/` | `角色卡/**`、`docs/proposals/**`、`docs/nominations/**`、`docs/skills/**`、`docs/mcp/**`、`.ans/**`、manifest |

`角色卡/` 内的 `角色卡/governance-boundary.yaml` 与 `角色卡/<内置治理 id>/` 属**禁写路径**，
由编排 gate 包装在 `resolveWrite` **之前**判定（本角色只提供数据；提名写卡的客户确认同样在编排
confirmed-writes，不在门禁层实现）。shell：五个内置治理角色统一 `operator-approve` 审批档
（客户 2026-10-19 新规则）——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent
审批；拒绝、超时、通道不可用一律不放行。机制侧（桌面 `shellOperatorOnly` 注入、编排提示词）待
各自属主切换，见[变更记录](docs/change/2026-10-19_change_all-roles-shell-approval.md)。

### 验证（2026-10-18 四角色批）

`test/门禁引擎/governance-trio.test.ts`（四人注册表/写权/边界/解析更新）+ 新增
`test/门禁引擎/liaison-role.test.ts`（旧 trio 零迁移、single 不变、Liaison 写权/能力/AC3 拒绝
归属文案/保留 id）；`list-project.test.ts` 四人顺序/主入口/保留 id 更新；应用边界补
`docs/audit/` 用例（应用可写、四角色与 su 拒写）。门禁引擎套件 **255 计 / 254 过 / 0 红 /
1 skip**；相关编排 shell 套件 143 计 / 142 过 / 1 红（Windows `symlinkSync` EPERM，无关）。
`npm run typecheck` 在本角色边界内零错；复跑时的 3 条全仓错误均在
他域新写的 liaison 测试（`test/编排/liaison-handoff.test.ts`、`test/测试/governance-liaison-verify/
b-intent-handoff.test.ts` 仍用被评审取代的 `"communication"` 名称），与门禁引擎交付无关，如实登记、
未越界修改。

## G17 ref-only delivery普通接口（2026-11-06）
原shell-rules公开GitPolicyFacts新增refPublicationPlan?:GitRefPublicationPolicyPlan、deliveryBasis?:GitDeliveryBasis；worksite支持{kind:'ref-only',index:'not-used',checkout:'not-used'}。plan沿O实际ref/oldOid/commit/baseTree/candidateTree/worksite/argv/diff，额外必须真实commitBytesBase64及oldCommitBytesBase64:string|null（首null必须null）；basis={base,baseTree,source:GitDeliveryIntegrationSource,candidateOperationId,baseCommitBytesBase64}。旧deliveryCAS与immutable代码基线分开：重算3commit OID、完整树/diff，候选parents=[basis,...contributors]；source/task/run/flow/worker/grant摘要及候选ref精确绑定。代码基线差异只真实worker owner grant，metadata/其它owner/mode拒，无metadata例外；唯一固定update-ref，零index/checkout。现编译type0/G17定向4/4自然CLOSE0。生产原commit bytes/原candidate op及source/quality/currentauthority/nonce/lease/R9仍O21实际producer/消费后继；普通clone保持相同内容和digest，不是宿主身份票，不据pure绿宣真实publish通过。

G17最终checkpoint：相关G16/G17八项8/8自然CLOSE0/signalnull，PID21380，27.04s/60s未触，0fail/skip；主type PID18196自然CLOSE0，限定三file diff-check0。四项首定向4/4与八项重叠不相加。全单文件31项输出通过但PID16260未自然终态、60s预算SIGTERM（exitnull），G17-01原件保留，不报整文件绿；精确process只读观察无残留owned。G17-00首次TS7006及G17-03首sandbox EPERM保原，不改安全原语/断言/退出行为。源码/test SHA保持1DC3153481DBEC12DF711643FD4849B966642C417AF78463ED8FD49F7889BDAB / 08BF19C079C9672025E439DF4B408A259549EAB35FF75F530A24D4ED367EEDB8 / 2BBF865ACC450F45EC25021F75AD3B4E0BB2D1EE92061763592F3E0E444B249C。生产O21须从真实对象读三份rawcommit bytes及integration候选operationId后组合；G普通数据检查不发权威票，无实际delivery发布结论。旧IO迁移债未本轮扩改。

## G18 delivery代码基线必要消费终态（2026-11-06）
G17纯consumer改为复用Model isGitApplicationRef且仅trunk/delivery分支；来源flow不强等本次flow，不新增Model/Provider字段/metadata例外/授权票，原source/OID/workerbase/三commit/tree/grant/单CAS核全保。本轮fixture-only移除Model语法允许但实际Provider不分配的Previous_Flow/source真实正例，保trunk/同flow/跨flow三正例及全部非法ref/错OID/workerbase负例。G18-05独立诊断真实首code git-ref-not-allocated在Provider readRef，未到G assert；原G18-04两红及缺进程终态保，不补pass。修fixture后G18-06 SHA1/256两项2/2自然EXIT/CLOSE0/signalnull，PID3852，6.91s/30s未触，0skip/fail；尾换行等负例实际均拒，未证生产漏洞。主type PID19164自然CLOSE0，限定diff-check0，owned0。本轮生产source未再改，source SHA D1A1336121584836D59BC05F5D7245882EB3DBEFBD19ACDBBCA33BB043EEB126；test829E42485DBA3C1C124DF8468E629F6FC9802CCADD0BBD7C2B6ADE438527313D。仅纯策略/真实Provider fixture证据，不冒Q生产完整链通过；Q32 production源保持不变。

- G19当前整file回归（2026-11-06）：生产/test0写。原G17整file31assert但60s SIGTERM无自然终态证据保留；本次预声明当前33case、test120s/wrapper150s固定预算，仅新runner使用installed-help支持的none/TAP、子Node NODE_DISABLE_COMPILE_CACHE=1及独立ans-g19-regression短TEMP。唯一运行PID7392自然EXIT0/CLOSE0/signalnull，33/33、0fail/skip/cancel，59.907s，未触budget，owned0。原件G19-01-whole.txt及-process.jsonl有START/PID/EXIT/CLOSE/前后hash。source D1A1336121584836D59BC05F5D7245882EB3DBEFBD19ACDBBCA33BB043EEB126、test829E42485DBA3C1C124DF8468E629F6FC9802CCADD0BBD7C2B6ADE438527313D全同；不归因旧挂、不冒全项目T3/B2/生产全链/native或权限闭包通过，后继源变更仍按影响重核。

## G20 I5 Chief hub提示/展示同步（2026-11-06）
依据根P1.1 A151C2DB…DE79F39/B1 H01–H10，仅governance-roles.ts同步：六卡单源hub纪律、新五builtin Chief创建/收报/原创建者收口；Convener仅impl worker、worker先回Convener再升Chief；四意图可调查/并行/跳过/返工/改类/停止，M0/前close/planD3不作普通builtin派发票，实际write/activate/publish/execute动作门与8refs/质量OID/stopfacts保留。Chief接受review后显式续仍live controller发布，失败返工不需accepted质量；Verifier缺证/失败正式blocked/failed回Chief不静默等。旧creator/parent/accepted不重写。matrix为原仅展示字段，不是机械权限票；entries/预授权/capability flags/ACL/legacy su未改，宿主真实矩阵仍O/W owner，不声称只改提示就生产闭环通过。
最终9相关角色/权限检查9/9、0skip，PID588自然EXIT/CLOSE0/signalnull；主type PID25468 EXIT/CLOSE0，diff-check0/owned0。日志G20-03-final-roles/G20-04-final-type，60test/90wrapper未触；初次01/02同scope绿与最终重叠不相加，不跑无关Git33file/模型。sourceSHA DF8838F10711F65912EED481E84A7F01AEAE57839152808952E9B5998DC19ACC；test A0B29B6D16DAA25F3EF59D839D760A2EA961A4A83FC2A24CEAEDBFBCF3E7DFE7。无新增生产文件/表外写点，原旧IO债未本轮扩改。

## G21 revert只读接缝（未实施/未验证）
- 原公开checkGitPolicy/computeGitPolicyDigest与GitRawObjectPlan可复用；raw当前完整SHA1/256对象/tree/差异/候选ref/固定命令校验可保持。
- classify-shell.ts:748 raw模板白名单不含revert，真实noindex触git-policy-raw-worksite；旧路径:992无真实owned index/worktree触git-policy-unowned-worksite，不能伪工位或伪commit模板。
- :244 gitModificationBody旧revert只验--no-commit、正数mainline及OID形状，不绑定target/实际parent范围或逆差异/冲突，不能视为完整noindex实现。
- 后继最小普通字段候选（未冻结、不授实施）：f.target绑定request.commit；revertBasis提供target真实commit原bytes/全tree及所选parentOID/commit原bytes/全tree，root显式null/empty；merge mainline对真实parents索引，当前base→candidate全逆差异/未改entry/owner/mode/冲突由纯核约束，不添加metadata例外。
- O真实Provider读取target/currentbase/结果，Service原授权/当前scope与lease最终核；模型target不是权威、历史可读不是写许可；revert仍新候选，须新quality/creatorclose后原refCAS。
- 实际Service candidate(:475–481)非init仍git-protection-closure-unproven stub；本节点只定位，未改他owner、不把它称已可revert。
- 本轮production/test0写，无tests/model/app执行；sourceSHA D1A1336121584836D59BC05F5D7245882EB3DBEFBD19ACDBBCA33BB043EEB126，shell08BF19C079C9672025E439DF4B408A259549EAB35FF75F530A24D4ED367EEDB8。后继需S具体派原G/O，当前O53/Q57主线freeze不延后。

## G22 §8只读核（源测零写/零执行，未实施）
- 实读G-C1 SHA B06905112A1DE284B0BB5108AA38F8F71D2551242AE3FDF6E5E2A9E8125584EF；原G纯结构可重算原commit OID/parent、完整tree、逆差异/冲突和最终raw candidate，不需I/O/Service peer。
- 精确needs-revision：§8.2 codeBasis缺commitBytesBase64:string，§8.3/14却要求三套原bytes；应补与target/selectedParent同样真实原字节字段，否则当前basis commit→tree绑定缺证，不能凭complete=true放行。
- 当前src/model/trunk.ts尚无GitRawObjectPlan/RawTree定义，实际G:66/Provider abstract各自有shape；R原Model需单一共享普通shape，由G/O原接口消费，不再建镜像或公共能力factory。
- R普通最小shape：三套{commit,commitBytesBase64,tree,entries}、selectedParent的1based index或root null；entries保path/mode/fullOID，inverseChanges沿完整旧新path/mode/OID差异，conflicts含parent/target/current entry|null，complete只派生。
- raw现只100644/100755、input.files只bytes/executable/null；§8.5目标若含120000/160000须完整表达以校验或明确拒不支持结果，不能删entry冒全tree，也不因此授写symlink/gitlink权限。
- O实际只读事实为target/选parent/当前basis原bytes及各完整tree，受限candidate input/files及owner交集/source；候选blob bytes按需给现raw input即可，G对hash/OID比对、保留未改entry，冲突拒、不默认ours或覆盖整parent树。
- 当前基线G D1A1336121584836D59BC05F5D7245882EB3DBEFBD19ACDBBCA33BB043EEB126；Model8915F62137E6634E8F93A4DA83FEA96267C75F1CDA4FA392A78F6FB7B8E38CFD。仅本人API/memo追加，不改生产/测试、不运行test/模型/应用，Q62窗口不等待。

## G23阶段1 Model raw单源消费（2026-11-06）
R27 Model原trunk.ts共享raw九types已通过原classify-shell import/typealias消费，shell-rules保GitRawObjectPlan/PolicyDiffEntry/PolicyTreeEntry原公开名并公开Model raw/revert普通types；无镜像、IO/peer/新文件或schema proof入口。RawTree mode:string/R-C/nullOID完整保真不代表授写，旧regular-file runtime条件不放宽；本阶段任何revertBasis不准借commit/integrate冒用，revert仍git-policy-raw-worksite。实际三commit/parent/逆差异/冲突纯validator是后继阶段2，未实施不宣可revert。
主type PID9272自然EXIT/CLOSE0，diff-check0。生产/test写入已结束可冻结，相关11项G16/17/18/G23此刻PID12884在独立短TEMP运行，结果后记不先填绿；Q63主线不等阶段2。source AFB433059CB4E289C1C4B63574F23C36C61553B6D2BB49B369164D6714347A5E；shell2943CF9D722CFFCC92329535BC8A27D0B289B32A0DE8813CED9DC8C78F1BA161；test46F9BEC5CB974A3E6A35AE0FFC62EA7E8D443481BF093DE6F40AF0C609F3D98B。

G23阶段1最终：相关11/11、0fail/skip自然EXIT/CLOSE0/signalnull，PID12884，33.884s、test60/wrapper90均未触；主type PID9272自然0/diff0，owned0，前后hash一致。production/test保持停写，只有本人阶段1已FROZEN，不代表全仓锁定或Q可自启动；阶段2待正式另派，不抢主CHANGE。

- G24 Q63窗口内实物准备：仅既有evidence及隔离短TEMP，生产/test保持G23三hash全同。G24-fixture.mjs固定git.exe/argv，canonical root验证不在dev或任何父repo后，只创建四个SHA1 commit及必要blob/tree；无业务ref/index/checkout/ANStrunk.accepted。target277e18ea8374810a48363117b16756ed70087da5、parent042e8588525b59fb35e42fd086e4031302b08ef6、current7885be4b09e7c17781e3ca565dbdfa7fae92ef4d、conflict634e0a020aa23fa1de66cb3cc0f2fd1e22a139fd，保存真实commit原bytes/OID/全tree并重算/readback。facts G24-revert-facts.json SHA6097E1BCB35AD424886FB52431B4ED22B9D050F8BAE11B4D6234D4F4B8C3EC60，normalBasis/conflictBasis/rootBoundary/futureInput/expectedResultEntries覆盖保无关修改、新增、冲突及root空parent。Model5E466272…82EFD8；complete/inverse/conflicts只是普通派生预期，未调用未来validator，不冒revert可用/权限票/E2E。唯一child10180自然EXIT/CLOSE0/signalnull，约1.1s/45s未触/owned0；ROOT_VERIFIED/CLI/Git PID均原process.jsonl可核，不盲重跑，临时仓库保留供复用。

## G25 I6 Chief独立流程资源（2026-11-06）
新增唯一src/common/门禁引擎/workflows/chief/chief-workflow.md（8724 UTF8 bytes，资源版本chief-workflow/v1），不建旧名workflow.md。正文为Chief接需求/按反馈自主派五builtin/并行跳过改类/回退请示委托/独立质量与显式续live运营交付的唯一完整真源；本轮必要派发可同轮并行后结束，不限制一次dispatch，不sleep或忙Chief/worker互等。项目docs/workflow.md仍Convener管impl，准备有效snapshot/执行run冻结来源分开，资源更新不重pin。卡仅职责/实际全文path/hash/资源版本/真实应用版本读取要求、缺坏资源阻塞与原写区；移出旧Chief流程副本，matrix仅展示来源。Common未增FS/新DSL/引擎/权限，entries/capabilities/ACL未改。
MD首稿AEE…为旧候选，root并行措辞修后最终SHA9BEF5626C8E9D2D72487567D2D93366F05C178CFA23288ADD8A13B64E4B4F346；gov E2186E3EB0FADCAE5F72FA67A7AC5A46D82CF09BD723A01B6E0EF52B06DD313D；testF2CA057C724E9F33284A8570BAA88B52937901B7EC8A01A5AD0300C6588AAF64。第一稳定字节/hash及最终修辞hash均直R，旧hash不冒最终samebytes。
G25-01角色/资源/权限相关10/10，PID14472自然EXIT/CLOSE0，0skip；首G25-02主type9红全R在飞session加载作用域，原件保、不代改。R报告原owner实际修正后G25-03主type PID11704自然EXIT/CLOSE0，diff-check0/owned0；未运行真模型/无关Git整file。R真实Provider加载/Session注入及开发/发布包同全文同hash验证仍R/装配owner独立证据，G只验证Node测试从唯一MD读取及提示约束，不冒已打包/真实Chief读完/E2E/B2。

## G26 revert阶段2纯policy（2026-11-06）
原classify-shell.ts现接template=revert、target/mainline、Model rawObjectPlan.revertBasis；现shell-rules公开名/普通shape不变。逐一重算target/selectedParent/current codeBasis原commit bytes→OID/tree/parents及完整entries；root空parent/单父唯一/merge显式1based mainline，候选必须唯一parent=currentbase。逆差异按target→parent排序A/M/D/T（rename/copy按完整路径A/D，不作heuristic）；complete/inverse/conflicts仅重算比对，current与target受影响entry不同或namespace碰撞拒，应用逆变后其余current条目全保，任意owned bytes也不放行。原完整候选blob/tree/commit/request/ref/commands/全diff与owner路径校验复用，convener/task/run/writePaths空；现integrationGrants只复用普通owner数组，每candidate绑定target，evidence/source真实性由O最终核，不冒run-integration身份。无raw的旧revert路径明确revert-plan-missing，不能用ownedindex绕完整proof。
120000/160000等已在三历史tree完整hash观察中保留；当前current/result特殊mode仍明确unsupported，不丢条充完整、不授特殊写或metadata例外，regular mode变更沿原拒。原读target≠写许可，O仍需实际currenttask/auth/actualtarget/lease/R9及新quality/Chiefcreatorclose/单refCAS。
首compile test空conflict数组推断never的TS2322原件保，Model类型注解修正未改断言。G26-01初2/2；03相关13中旧raw11通过、新root2红因fixture grant '.'不合schema先触revert-grants，原expected/observed及自然exit1保。仅把fixture改实际逐文件scope，原metadata scope断言保持；05最终SHA1/256两项2/2自然EXIT/CLOSE0，PID20020、7.250s/60test/90wrapper未触，包含merge真实mainline正反/root边界/当前冲突与伪空conflicts/保留后改和新CIDreadback。06当前主type PID10328自然0/diff0/owned0；不把历史11与最终2相加冒同候选13绿，11相关分支在最后只增无raw-revert拒绝前已通过，未改其raw路径。
最终source63D90B6C06B076CE9BB608A5BDA2B67222B19F363D3653976E2DD5D388601D5F；shell2943CF9D722CFFCC92329535BC8A27D0B289B32A0DE8813CED9DC8C78F1BA161未变；test2670865AA9A701686CE5919187BBAD90BCE88AFEF49DBF74CEFC3B181A42F45B。生产run-revert真实source/review/delivery联合消费由O及后继G另派，不伪worker/integration、不据pure绿冒生产revert可发布。未改其它源/Model/权限/模块，无开发Git/真实模型。

## G27 run-revert delivery普通source消费（2026-11-06）
GitDeliveryBasis.source现联合GitDeliveryIntegrationSource|GitDeliveryRevertSource；后者沿O实际Provider普通shape，kind=run-revert/role=convener+原task/run/flow/pin-task-runRecord-scope/base/files、target/mainline?/ModelrevertBasis/ownerGrants，无contributors。shell-rules公开新普通type，无Model字段/IO/新源。原integration分支保持，revert parents仅[base]、ownerGrants scopeDigest重算、integrationGrants逐项精确映射candidate=target，不伪worker/accepted receipt。
原revert三commit/tree/parent/mainline/inverse/conflict纯计算抽离raw.input依赖，raw候选仍核完整input paths，delivery直接比较其结果与真实ref-only candidateTree；两codeBasis/source/base原bytes绑定及完整diff/owner/ref/单update-ref CAS全保。source.files路径必须等逆差异路径；内容SHA256真实性由O实际blob/source最终核，G无blob字节不虚称已核source内容hash，Git blobOID/tree/commit/差异真实重算。
首direct compile Map误调及既有integration fixture union未narrow类型诊断原工具输出保，最窄修正后02主type PID20588自然EXIT/CLOSE0；01相关8/8 PID24552自然EXIT/CLOSE0/signalnull、30.743s/60test90wrapper均未触，0fail/skip，diff-check0/owned0。含SHA1/256真实revertcandidate→Provider refplan正反例、旧integration/delivery/跨flow基线回归；实际delivery ref仍null，不冒生产publish/E2E。O最终来源/当前授权/quality/lease/R9仍原owner层证。
最终source8478B452C703D71AAA1B227B8D106CBB6244D19D9B369ABBDA6BBF565E10C4DC；shell2762A05BA8701977BC5D0028838AA36BB05D0AF0B7F04887D28878D849935FE6；testEC0CF01064C686AFC983221B80F8E77A922CFCC11F81AA0E241BAA312FA8DFFD。源测停写，API已直O/S，不延后主线等待长层。

## G28 stable permit snapshot正式窄Service口（2026-11-06）
原service/gate/resolve-write.ts新增installStableWritePermitSnapshot(projectRoot:string, permits:readonly Model StableWritePermit[]):void，内部只委托common/versioned-doc-guard唯一旧Map；无第二账本/FS/Provider向上/新shape。O普通readPermitSnapshot→Pipeline→本口安装，Provider callback移除及W旧初始化/approve-consume-fail切Pipeline仍原owner后继，不能因新增口就宣旧上调链已清。
原versioned-doc-guard.test只将installer import切正式Service，既有3项G15 truth tests3/3、0skip自然EXIT/CLOSE0，PID24872，179ms；含consumed/role/path/base/TTL/BOM与missing/unknown、零FS，原common过滤/失败关闭语义未改。主type PID8340 EXIT/CLOSE1唯一Q在飞test/测试/git-role-workflows-e2e.test.ts446:93 TS18047 published.published.oid可能null，G28-02原件保，不跨owner修/不冒TS0；diff0/owned0。source AB5BDF6BDEE19F5400F71CC6C4467BA8C0427D2963718B9D6B9A434740FD56A4；guard仍F05A22E8A03832EC3F119C4F5047B3B1013C27AB5CA8F961916067BE37E25BB6；testA701C33166A318D7ED46D490725268E263C95698ED044253D46991927F914404；原revert/Git源未动。
