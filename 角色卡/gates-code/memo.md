# gates-code 备忘录（memo）

## 当前状态（2026-11-07）

- E1 完成：`src/common/gates/` greenfield（唯一 public entry `index.ts`）+ `test/gates/`（矩阵/差分/module-graph/API 冻结）。
- 证据：`docs/change/2026-11-07_E1_gates-module-evidence.md`（同目录 `2026-11-07_E1_gates-module-evidence/` 原始日志与哈希）。
- 结果：29/29 测试绿；`npm run typecheck` exit 0；与 P1 D-minimal 差分 134 场景 / 268 比较 / **差异 0**；
  模块图 331 文件 / 1,735 边 / **0 违例 / 0 value 环**（D9 type-only 豁免单列）。
- 代码/测试候选聚合：`999f3b450814610f570238720d32d83af46c71cd8fa355fa6a9079419697aedd`（算法见证据 §2）。
- 未提交/未推送；未运行真实模型；未改依赖/构建。

## 关键决定与口径

1. **行为等价优先**：gates 实现逐条对应 `trunk-runtime.ts::evaluateChiefDispatchParent`（P1 D-minimal，E2 前权威），
   包括四分支、严格原条件 + `applicationMediation === undefined` guard、受限全条件、Codex 字面绑定
   （`native.nativeInstanceId === applicationMediation.nativeInstanceId` + 缺失/空串 fail-closed + lifecycle 附加防御）、
   reason 逐项/顺序一致。
2. **类型按 E0.3 §5.1**：`DispatchParentCoreFacts.lifecycle/toolSurface` 直接用 Model 类型（非 P1 本地投影）；
   E2 由编排把 `inspectManagedRoleSessionEvidence` 结果直接传入并删除本地类型（D7/D9）。
3. **reason 闭集编译期约束**：所有 helper 返回 `DispatchParentReason | undefined`；`api-contract.test.ts` 类型层断言 18 项。
4. **module-graph 用仓内 TypeScript**：`typescript@7.0.2` 是原生编译器，无传统 `ts.createSourceFile`；
   使用官方 `typescript/unstable/sync`（`API.updateSnapshot` + `Project.program` + AST）。不新增依赖。
5. **D9 口径**：Model 内 type-only 边豁免（`role.ts↔runtime.ts` 等）单列；Model→shared 仅允许既有 type-only
   原语（`runtime-shared.ts`、`diagnostics.ts`），value import 反向禁止；模块层 value 环 0。
6. **只判定、不采集**：模块头含 API 冻结声明；不 import 角色/Service/Provider/Pipeline/私有 common；
   不承载写/发布/停稳门（INV-2）。

## 下一步（E2，归编排执行；本角色配合）

1. 编排把 `trunk-runtime.ts` 两处判定改调 `src/common/gates/`（`validParent`、`currentChiefResumeSource`）。
2. 同 fixture 双跑差分（gates vs 内联）、受影响套件、回滚演练；通过后删除内联实现/本地类型与桥接开关（D9/E-A10）。
3. 最终合并候选上重跑 `test/gates/**`、`npm run typecheck`、module-graph（角色模块并行在途）。
4. 真实运行（P1-RR）与门禁负例终验由对应 owner 执行；本角色只读核对证据链。

## 注意

- `src/common/roles/**` 属其他角色写集；module-graph 报告是时间点快照，内容变化时重跑即可（测试会自动扫描）。
- 全量 typecheck 曾因并行角色在途文件短暂报错（写集外），属主修复后已绿；提交前按最终候选复跑。
- 不修改角色卡/边界/YAML/changelog（人事维护）；不写其他角色资料与 `docs/scheduling|acceptance|communication|planning`。

## 导航

- 模块：`src/common/gates/index.ts`；测试：`test/gates/`；API 报告：`api-spec.md`；
  功能/职责：`feature-map.md`、`functional-description.md`；证据：`docs/change/2026-11-07_E1_gates-module-evidence.md`。
