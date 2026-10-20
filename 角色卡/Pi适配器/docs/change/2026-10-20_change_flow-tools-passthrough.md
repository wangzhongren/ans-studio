# 2026-10-20 变更记录：flow 文件方法化三工具能力透传（Pi legacy/假适配器路径）

归属角色：Pi适配器（Section 1 边界内）。
客户/评审依据：2026-10-20 客户拍板「flow 文件方法化最小闭环」；运行时核心已提供
`GovernedToolsOptions.flowGet?` / `flowStepUpdate?` / `flowStepSupersede?`
（类型 `FlowGetFn` / `FlowStepUpdateFn` / `FlowStepSupersedeFn`，见 `src/model/runtime.ts`），
生产 Service 路径已透传。本角色仅补齐 Pi 适配器的 **legacy/假适配器** 路径。

## 一、问题与目标

`createFakeRuntimeAdapter` 与 `PiRuntimeAdapterOptions`（legacy 直调路径）此前未声明/透传三 flow 能力，
导致：

- 假适配器测试面无法覆盖 flow 工具注册与 handler 透传；
- 不走 Service 生产装配、直接以 `createPiRuntimeAdapter({...})` 构造的真机 Pi 角色看不到
  `flow_get` / `flow_step_update` / `flow_step_supersede`。

目标：只做**能力透传**——未注入 ⇒ 对应工具不注册（既有结构性 fail-closed 先例）；
权限/状态迁移/证据/revision 冲突/Steward-only 裁决全部留在编排 flow-service，本层不实现、不预判。

## 二、改动（仅本角色边界内文件）

### 1. `src/provider/pi/session.ts`

- 类型导入：自 `../../model/runtime.ts` 增加 `FlowGetFn` / `FlowStepUpdateFn` / `FlowStepSupersedeFn`。
- `createFakeRuntimeAdapter` 选项（约 147 行）新增：

  ```ts
  flowGet?: FlowGetFn;
  flowStepUpdate?: FlowStepUpdateFn;
  flowStepSupersede?: FlowStepSupersedeFn;
  ```

  并在其 `buildGovernedTools(opts.gate, {...})` 调用（现 187 行）逐项透传
  `flowGet` / `flowStepUpdate` / `flowStepSupersede`。
- `PiRuntimeAdapterOptions`（现约 301 行）新增同三可选字段；legacy 路径
  `buildGovernedTools(adapterInput.gate, {...adapterInput})`（现 415 行）既有的对象展开
  在运行期直接转发三字段，类型声明补齐后无遗漏（`npm run typecheck` 验证）。
- **判断模式不变**：`shellJudge` / `governanceJudge` 分支仍只经 `judgeToolset()` 构造恰三只只读工具，
  不构造 flow 工具、不注册 flow 能力（既有判断工具集断言未放宽、未改）。

### 2. `test/pi-adapter/flow-tools.test.ts`（新增，4 例）

1. 未注入三能力 ⇒ 三工具均不注册：假适配器脚本调用三次 flow 均落入「未知工具」`denied`，
   零 `accepted`；同一机制下 `write_file` 仍在工具集内（被写门禁拒绝而非未知工具），证明既有工具面未放宽。
2. 注入三能力 ⇒ 三工具注册：handler 调用注入 fn，参数**逐字**透传——
   `flow_get` 给出 `flowId` 原样传、缺省传 `{}`；`flow_step_update` 含
   `evidence`/`idempotencyKey`/`note` 可选字段全量到达；`flow_step_supersede` 含
   `reason`/`idempotencyKey` 全量到达；回执 `ok/revision/flow` 视图原样转达为 `accepted`。
3. 各能力独立：只注入 `flowGet` ⇒ 仅 `flow_get` 注册，其余两工具仍「未知工具」。
4. `PiRuntimeAdapterOptions` 类型接受三字段（编译期检查；运行期仅断言对象键，不构造真实适配器）。

### 3. `角色卡/Pi适配器/changelog.md`

追加 2026-10-20 条目并链接本记录。

## 三、明确未改动（不越界）

- `src/model/runtime.ts`、`src/provider/runtime/**`（运行时核心契约与工具实现）；
- `src/common/编排/**`（flow-service 与裁决逻辑）；
- `app/**`、`test/编排/**`、`test/测试/**`；
- `src/common/pi-adapter/real-adapter.ts`（其消费的是已定形 `tools` 数组，Service 生产路径已透传）；
- 未改任何既有测试断言（新增测试独立成文件）。

## 四、验证证据（真实输出）

### 1. 新增用例

```
$ node --test "test/pi-adapter/flow-tools.test.ts"
✔ 未注入三能力：flow_get / flow_step_update / flow_step_supersede 均不注册（脚本调用=未知工具）
✔ 注入三能力：三工具注册，参数逐字透传，回执如实转达（accepted）
✔ 只注入 flowGet：仅 flow_get 注册，其余两工具仍不注册（互不隐含）
✔ PiRuntimeAdapterOptions 类型接受三 flow 能力（编译期检查；未调用真实适配器）
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

### 2. 角色全量测试

```
$ node --test "test/pi-adapter/**/*.test.ts"
ℹ tests 309
ℹ pass 309
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12694.91425
```

（既有工具面、shell judge / 治理 judge 工具集断言均未修改，全部保持绿。）

### 3. 类型检查

```
$ npm run typecheck
> ans-cli@1.3.0 typecheck
> tsc --noEmit
```

退出码 0，无错误输出；确认 `PiRuntimeAdapterOptions` 三字段与 legacy 展开转发类型闭合。

## 五、未验边界 / 风险

- 未跑真实 Pi 模型往返：本层只保证注入面、工具注册与参数/回执透传；flow 权限与状态裁决的正确性
  由编排 flow-service 的测试与真实会话验收覆盖。
- `flowGet` 等能力与 `shellJudge`/`governanceJudge` 同时注入时，判断模式仍按既有契约只构造 judge
  工具集（flow 能力被结构性忽略），未新增互斥报错——与「判断会话不提供写/交互能力」的隔离口径一致。
- 未 git 提交；未读 `.env`；未发网络/真实模型请求。
