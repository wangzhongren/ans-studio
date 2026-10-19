---
id: post-write-advance
type: change
title: 写卡后自动刷新枚举并推进——appointment-write/settle 触发，目标角色齐备即自动派 Convener
created: "2026-10-19"
status: implemented
---

# 写卡后自动刷新枚举并推进

## 真机问题

Crew 已写出 6 个角色卡/边界，但应用**没有重新枚举角色**，也**没有自动派下一步**，流程停住；真机必须
重新导入项目才看到 backend/frontend/tester。根因之一：`advanceGovernanceFlow` 的 appointment 路径在
`appointment-write` 卡等待期间用 `waitForRoleIdle` 等 Crew 本轮结束——卡未作答时本轮不会 settle，
等待超时/早退后链路停止；客户/判断 agent 随后批准写卡时，`appointment-write` 推导为「无下一步」，
没有任何代码继续推进。

## 改动

### 1. `app/desktop/interface.ts`：写卡后推进检查

触发面（二选一，事件驱动，无轮询）：

- `appointment-write` **answered**（客户手批或判断代批）后——即使该卡推导出的 `nextFunction=null`；
- 任意**内置治理角色 settle** 后（与既有 listing 刷新同一挂点）。

执行体（仅 `governanceModel=trio`）：

1. `manager.refreshListingNow(projectRoot)` **强制刷新共享 listing 缓存**；成功后
   `deps.emitProjectChanged?.()` —— 左树立即可见新写出的角色卡（无需重新导入）。
2. 读治理账本；按 flow 取**最新 appointment 决定**的 `targetRoleIds`。
3. 目标角色必须**全部**出现在最新 listing；缺 ⇒ 只记诊断 `advance.post-write.roles-missing`，
   不派、不发系统行。
4. appointment 之后账本已有到 convener 的 `dispatch.accepted` ⇒ 既有链路已推进（含重启前），不派；
   已有验收决定 ⇒ 流程已收口，不派。
5. 否则复用既有 appointment 任务文本 `buildGovernanceAdvanceMessage(payload, targets)` 派 Convener
   （**不造第二套消息**），成功后：
   - 写同形账本 `dispatch.accepted{actorRoleId:"app",power:"app",trigger:"customer-decision",
     targetRoleId:"convener"}`（应用动作 ≠ 客户批准；共用唯一写入口 `appendApplicationDispatch`）；
   - 触发有界验收检查；
   - 成功系统行（`governanceAdvanceSuccessNote`）落**主入口** `primaryRoleId`（自动推进 ≠ 客户批准）。

去重与有界：

- 调度：同项目 40ms 合并窗口，至多一次检查；检查体同项目串行（`postWriteAdvanceRunning`），不堆积。
- 运行期 Set（`project+flow+convener`）先占位、成功保留；失败释放，下一次真实事件可再试。
- 持久化去重：appointment 之后的 convener `dispatch.accepted`。
- 刷新失败/角色仍缺/引擎无法确定/开/发失败**只记诊断**，不发系统行、不循环。

### 2. 与既有 appointment 链路的共享去重（2026-10-19 全仓回归修复）

全仓 e2e 发现同一产品去重 bug：写卡后检查与原 appointment 链路**各派一次 Convener**。根因：新检查
只看账本里 appointment 之后是否有 convener 的 `dispatch.accepted`，而原链路投递成功后 `append` 是
**异步**的——检查先跑时账本还没这行；原链路也不登记新检查的运行期 Set。

修复：

- 两条链路共用**同一个** `applicationConvenerDispatchKey(projectRoot, flowId)` ⇒
  `project+flow+convener` 运行期 Set（`postWriteAdvanceDispatched`）。
- **投递前先占位、成功保留、失败释放**（原链路与新检查一致）；并发中的另一方看到登记即跳过。
- 新检查保留账本持久化去重（重启后），但**不要求账本 append 先于检查**；若原链路已投递而账本 append
  失败，运行期键仍阻止本进程内重复派；跨重启按账本 best-effort。
- 原链路在「写卡后兜底」分支看到已登记时，返回 `targetRoleId:"nominator"` + `followUpRoleId:"convener"`
  （后续 Convener 已由共享检查派出，不是第二次派发）。

### 3. 确定性（2026-10-19 全仓复跑：从「重复派」到「偶发不派」的竞态收口）

全仓并发/负载下同一检查出现两种红：有时多一个 Convener（重复派），有时 0 个 Convener（检查早跑时
角色卡未落盘、`roles-missing` 后不再重试）。收口为确定性行为：

- **写卡来源先等**：检查开始时若 Nominator 仍 busy，先 `waitForRoleSettle`（有界 8s）再刷新枚举；
  角色卡通常在同一轮内写出，避免抢跑。
- **roles-missing 有界重试**：100ms / 300ms / 600ms 共 3 次（按 canonical project key 计数）；
  仍缺则停止并记 `advance.post-write.roles-missing.final`；下一次真实事件重置计数。
- **运行中事件不吞**：检查运行中到达的 settle/appointment-write 事件记入 `postWriteAdvancePending`，
  当前检查结束后按更早的延迟补跑一次（不再因「一个窗口至多一次」丢掉信号）。
- **runtime 选择避免第二会话**：优先真实事件提示 / 活跃会话（与既有链路同一 runtime）；仅冷启动
  （两者都缺失）才用凭据感知解析器。此前为同一项目另开 pi runtime 的 Convener 会多出一个会话，
  触发 `MAX_LIVE_SESSIONS=3` 的 LRU 驱逐，可能把正在等待的 Nominator 会话淘汰 → 原链路误判超时。
- 共享去重键的 projectRoot 先 `path.resolve` + `realpath`（canonical，按输入缓存）；除发送前的
  `postWriteAdvanceDispatched` 外，`appendApplicationDispatch` 增加同键的**账本写入侧**已提交集合
  （`applicationDispatchCommitted`，失败释放），即使两条链路都走到发送也只产生一条 app 审计。
- 占位一律在**跨越任何 await 之前**（引擎解析/开/发），失败释放，允许下一次真实事件重试。

### 4. 时序修正

- 既有 appointment 路径在 `waitForRoleIdle` 后仍先 `refreshListingNow` 再判 `roleExists`（写卡完成但
  缓存仍旧的问题）；本检查在每次判定前也强制刷新。
- `waitForRoleIdle` 的超时/早退不再意味着链路终止：写卡确认后的 answered 事件与后续 settle 会触发
  本检查兜底。
- `appendDispatchAccepted` 重构为调用唯一写入口 `appendApplicationDispatch`（行为逐字不变），
  两条链路共用同一账本写法。

## 测试（`test/桌面应用/interface.test.ts`，62/62）

新增 2 例：

- **appointment-write answered 后 listing 出现目标角色**（缓存仍旧的模拟）⇒ 自动派 Convener 恰一次；
  任务文本复用既有 appointment 文案；账本恰一条 convener `dispatch.accepted`（`actor=app`/`power=app`）；
  `emitProjectChanged` 被调用；成功系统行落主入口；重复 appointment-write + 治理角色 settle 不重派。
- **目标角色仍缺** ⇒ 不派 Convener、不发任何系统行（只诊断），重复触发/ settle 不刷屏、不写账本。

真实输出（2026-10-19，本机 macOS，Node v24.14.0）：

- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **31 计 / 31 过 / 0 红**。
- **全仓 `node --test "test/**/*.test.ts"` 连跑 3 次** ⇒ 每次 **3255 计 / 3253 过 / 0 红 / 2 skip**
  （`c-appointment-timing` 与 `i-full-chain` 均稳定「恰一次 Convener」）。
- `node --test "test/桌面应用/interface.test.ts"` ⇒ **62 计 / 62 过 / 0 红**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **640 计 / 640 过 / 0 红**。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- 检查按账本中**最新 appointment 决定**逐 flow 判定。若某个历史 flow 有 appointment、目标角色齐全、
  且从未写过后继 convener `dispatch.accepted`（例如旧版本人工推进/异常中止），下一次任意治理 settle
  可能为该 flow 补派一次 Convener。判定受「无验收决定」「运行期/账本去重」约束，每个 flow 至多一次；
  如需限制到「本进程曾发现角色缺失的 flow」，可后续加白名单（会牺牲重启恢复能力）。
- 只覆盖 **appointment → 角色卡写出** 这一链路；其它「角色写完后需要继续」的场景仍依赖各自事件。
- 引擎解析复用统一的凭据感知解析器；无法确定时不派（不默认 claude），只记诊断。
- 成功系统行落 `primaryRoleId`；若 listing 异常给出空串，系统行无处呈现（诊断仍记）。
- 未改 `src/**`、`app/renderer/**`、其他角色文件；未 git 提交。
