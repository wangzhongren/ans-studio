# 变更包：运行时派发门证据修复（P1）

- **任务 ID**：`2026-11-07-runtime-gate-role-modularization`（P1 阶段）
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-07
- **性质**：统筹组装的 **P1 变更包**，交独立验收/后续阶段使用；**不是验收结论**。不授权提交/推送/合并/发布。
- **风险档位**：**T3**（P1.6 §10；不压档）。
- **阶段口径**：P1 = 路线 A（应用中介证据 + 受限路径）+ D-minimal（团队计划 §6.5/§7.2）+ 最小真实重跑；不含门控模块（E1）、不含角色模块化（E1/E2）。

## 一、候选身份（P1）

- **基线**：worktree `.claude/worktrees/trunk-amendment`，HEAD `e71501cae7fc563b63c63944d45d0d3114ec18a5`，分支 `feat/plan-escalation-card`。
- **P1 候选（12 文件）**（逐文件 `git hash-object`+`sha256sum` 见 `角色卡/测试/docs/change/2026-11-07_P1-D_combined-candidate-verification.md` §4；运行前后稳定）：
  1. `src/model/runtime.ts` `368559b75268df669f362406d785d5c3f04ca71994736fdfab181b34e019e9e5`
  2. `src/service/runtime/session.ts` `3de010915f24ab4634a417dec9df2e9ff199a01da51038482da635c6b73a692b`
  3. `test/runtime-core/application-mediation.test.ts` `6e33db5a1d6c3fbe35af7fe9a12f3c6719615aa39d2c8b9667a3e84c6008c608`
  4. `src/provider/claude/session.ts` `0edf3a8f56304e0ec364ffbcfdcc83fc8067bb59204c218a6abcb1a8a6b885f3`
  5. `test/claude-adapter/application-tool-surface.test.ts` `e162e6535b071b0bb1e4f8a6d93ae2b07a90cdde0938dd0f647425b1377f6911`
  6. `src/common/codex-adapter/chat-transport.ts` `2a53fb38588caa7901aedb3af7a766fb078312a13f02c6433aa506faeb6e1d55`
  7. `test/codex-adapter/application-surface.test.ts` `40cdee229dca38c4de0a1c0e8e931884e891b976165944a2a86cbc7ce1624de8`
  8. `src/common/pi-adapter/real-adapter.ts` `39eb7a12a2afabe7b4e619cb97c6186afc7bcd2c4ab6c5b283a661028d47cf5c`
  9. `test/pi-adapter/application-surface.test.ts` `9df52b981d6c921879dd3d2948fd93f09971afd928f45f0e0f5930a294c04300`
  10. `src/pipeline/orchestration/trunk-runtime.ts` `9453a43ff014acf74cf2106454ee6f069b257bbd2b4a68b7c56ff619ac1ffa24`
  11. `test/编排/trunk-runtime.test.ts` `0a05f54e415e5241de3e331d9be1640abbe83df9478cf1693c4eb0d4d2432efe`
  12. `test/编排/trunk-dispatch-parent.test.ts` `f2b29bdb67e862a5d7691f5b2d98218543f83ff9fe919e5e541b4a820ebbfead`
- **P1-D 集成测试**：`test/测试/runtime-dispatch-gate-integration.test.ts` `ede01d45…`（10 用例，属 P1 证据/测试产物）。
- **聚合身份（12 文件）**：`f1d0d017f057dde5d75a4c83b11206526227b2f07646062d686eb4830e2a1bdb`（算法：`sha256(排序后的 "<sha256>␠␠<path>" 行 + LF)`）。
- **候选范围说明**：`src/app/test` 当前另有 T1 三文件（只读、不属本候选）与 E0 草稿两文件（`src/model/role.ts`、`test/门禁引擎/role-module-contract.test.ts`，属 E0 输入）——均**不计入 P1 候选**；P1-RR 运行前后 12 文件哈希不变（只读核对）。

## 二、P1 节点与证据

| 节点 | 角色 | 交付 | 证据（路径 / 行数 / SHA-256） |
| --- | --- | --- | --- |
| P1-A | 运行时核心 | `RuntimeApplicationToolSurfaceFacts` + guard + `RoleSession.inspectApplicationToolSurface?` + `applicationMediation`（含 Amendment-1 `nativeInstanceId`）+ 包装层组合（reason 白名单/阻断集、仅 strict 非 observed 构造、fail-closed） | `角色卡/运行时核心/docs/change/2026-11-07_P1-A_application-mediation-contract-evidence.md`（311 行 / `6bf1a9d2fe09552e4fa976a2d2fa2eb9e9d830733ee2006f1f5f7a083db595e4`，含 §12 Amendment-1） |
| P1-A Amendment-1 | 运行时核心 | `applicationMediation.nativeInstanceId` 必填（P1.6 §4.4 字面谓词缺口补齐） | 同上 §12 |
| P1-B Claude | Claude适配器 | 实际构造面事实（appTools/foreign/nativeBuiltin 含 WebSearch；身份绑定；不可构造即 unknown） | `角色卡/Claude适配器/docs/change/2026-11-07_P1-B_claude-application-surface-evidence.md`（108 行 / `b2cbef7e8347146229f1bfdf2f3a029394ac735b0c032b1e7bb611d1586a4970`） |
| P1-B Codex | Codex适配器 | 应用面事实（实际 toolMap、foreign []、nativeBuiltin []；native 缺失/身份不符不提供） | `角色卡/Codex适配器/docs/change/2026-11-07_P1-B_codex-application-surface-evidence.md`（175 行 / `023a096ef79a6f2c8b9ee01f2d2a36e3fcc3517f5a0a9d18477f80ee6d98ca05`） |
| P1-B Pi | Pi适配器 | 应用面事实（customTools/allowedSurface/noTools:builtin；无 observation/bind 不提供） | `角色卡/Pi适配器/docs/change/2026-11-07_P1-B_pi-application-surface-evidence.md`（150 行 / `a1694be8732a4eac95360d1f9ddb8f7aceba9689ab31707636e0b76a6e6fe9be`） |
| P1-C | 编排 | D-minimal 单实现 `evaluateChiefDispatchParent`（validParent + currentChiefResumeSource 共用；四分支；strict 原条件 + `applicationMediation === undefined` guard；受限路径全条件；reason 码；对外 `trunk-verify-failed` 原文案不改） | `角色卡/编排/docs/change/2026-11-07_P1-C_dispatch-parent-d-minimal-evidence.md`（443 行 / `73c3cbb1e17b0dc3204d45b85473ecb85c1273d37b5e40d1052c2f65bf3d149a`，含 Amendment-1） |
| P1-C Amendment-1 | 编排 | Codex 绑定字面化 `native.nativeInstanceId === applicationMediation.nativeInstanceId`（保留附加防御，不放宽） | 同上 Amendment-1 节 |
| P1-D | 测试 | 跨层集成 10/10；六套件相对冻结脏基线 **新增确定性失败 0 / 新 skip 0**；typecheck 0；`build:renderer` N/A（`app/` 0 改动） | `角色卡/测试/docs/change/2026-11-07_P1-D_combined-candidate-verification.md`（293 行 / `91e5cbe7451534f8df3a921643a538a0c0168b489bb014c0ae8470826177caf1`） |
| P1-RR | 测试（沟通授权） | 真实 Claude 最小重跑（见 §三） | `角色卡/测试/docs/change/2026-11-07_P1-RR_real-claude-minimal-dispatch-evidence.md`（213 行 / `c47198f79572b2ab834d28fa44d5b756c6c9fa21a040d4bb5341fa16a204c06e`） |

**包含性检查**：P1-A/B/C 各节点报告均声明只写各自写集、未触碰 T1 三文件与禁碰路径；P1-D 对六套件与 B0 冻结失败名单逐字节对照（26 项 skip 同集合，既有失败逐条一致）。

## 三、真实运行（P1-RR）结果——如实记录

- **父门：已受理（PASS）**。真实 Claude 幕僚回合内 `dispatch_task` 通过父门；旧 `trunk-verify-failed：Repository initialization parent is not the actual active accepted chief dispatch turn` **未再出现**（证据根内零命中）。
- **任务创建：成功**：`task.created`（2026-11-07T08:31:38.095Z）`taskId=t-mw659tgv-974915bb`、`from=chief`、`to=product`、`flowId=todo-cli`、`runState=draft`；初始化来源 `init-source-a42b32ea….json`（`parent={kind:"message",roleId:"chief",runtime:"claude",turnId:"1883a5e5…",inputAccepted:true,settled:false}`）sha256 `70a6795e…`；run manifest sha256 `f61fd925…`。
- **任务投递：失败（下游门，非本变更范围）**：目标 product 会话创建被拒——`session.open.failed`（诊断）`runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable`；任务记 `status=failed`；投递队列空、无产品会话/产物；回执原文（`native-transcript.jsonl`/`replay.jsonl`）：“派发未投递：无法打开目标角色 产品 的会话（runtime-creation-admission-unproven:required-scope-unconfined-script-tools,native-factory-plan-unavailable）；未入队、未投递。” **不宣称闭环完成**。
- **预算与终止**：1 条客户消息、1 个 chief 回合（`1883a5e5-a651-491e-aa8b-24d1f01fd106`）、应用处理器层 `dispatch_task` 恰 1 次；观察窗口 42.5s、发送→停止约 48.1s、启动→退出约 70s（<10 分钟）；以真实 UI `#btn-halt` 中止 + `stopSession` + CDP `Browser.close`，无残留进程。
- **偏差（如实披露）**：模型侧同回合有 2 次 `mcp__ans__dispatch_task` tool_use——首次因字段名错误被 MCP 输入校验 `-32602` 拒绝（未进入应用处理器、无 `.ans` 副作用）；第二次才是应用处理器 1 次派发。属模型侧重试，非测试侧自动重试；已计入预算披露。
- **证据根**（仓库外）：`C:\Users\51054\Desktop\work\ans-dogfood-runtime-gate-2026-11-07\rr-p1\evidence\`；关键哈希：`tasks.jsonl` `8801a939…`、`chief.jsonl` `e3f8d231…`、`replay.jsonl` `2b74e881…`、`native-transcript.jsonl` `584d30ec…`、诊断 `553e1e4c…`、`summary.json` `00a49606…`、`drive.jsonl` `c3173bad…`；截图 4 张（jpeg q70，窗口 1376×868/1360×860，DPR 1，无 DEBUG 覆盖层）：`ui-01-imported.jpeg` `e939064f…`、`ui-02-sent.jpeg` `4a997c74…`、`ui-03-dispatch.jpeg` `cb5b4ff4…`、`ui-04-final.jpeg` `eb6b7581…`。
- **披露**：工作树含 T1 三文件与 E0 并发两文件（非本候选，运行前后未变）；真实模型单次观测；下游门是否另立 Q5 型变更由策划/沟通决定。

## 四、基线与验证口径

- **冻结脏基线**：`角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md`（`13553505…`）；B1 v1（`a999dc19…`）+ **B1 v1.1**（`e5027742…`，冻结脏基线/挂起口径）。
- P1-D 对照结果：runtime-core 490/453/33/0/4、claude 122/122/0/0/0、codex 123/122/0/0/1、pi 357/354/2/0/1（2 既有 EPERM）、编排 1,037/1,011/24/0/2、测试 661/603/39+1c/18（排除 B0 登记挂起）——**新增确定性失败 0、新 skip 0**；失败/skip 集合与 B0 逐字节一致（测试证据目录含失败对 diff）。
- `npm run typecheck` exit 0；`typecheck:renderer` 附加核对 exit 0；`build:renderer` N/A（`app/` 无候选改动）。

## 五、边界与状态

- 本变更包只写 `docs/scheduling/`；未改产品/测试/角色卡/边界/方案/沟通/验收；不判验收；不授权提交/推送/合并/发布。
- P1 状态：**implemented-unverified**；P1-RR 只证明「父门受理 + 任务创建」，投递被下游门拒绝，如实记录。
- 下一步：交独立验收按 B1 v1/v1.1 的 P1 条目判定（或按阶段安排）；下游门（目标角色会话创建准入）由策划/沟通决定是否另立变更。
