root = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b5"
path = f"{root}/app/desktop/session.ts"
s = open(path, encoding="utf-8").read()


def replace_once(old, new):
    global s
    assert s.count(old) == 1, f"expected exactly one occurrence, got {s.count(old)}: {old[:80]!r}"
    s = s.replace(old, new)


replace_once(
'import { Delivery, type DrainClaimRecord } from "./session/delivery/queue.ts";',
'''import { Delivery, type DrainClaimRecord } from "./session/delivery/queue.ts";
// B5（2026-11-13）：卡片决策（43 方法 → `./session/cards/` 三文件：cards / version-decisions /
// acceptance-facts）与 run-change（9 方法 → `./session/run-change.ts`）；端口形状在
// `./session/card-gateway.ts`（CardGateway / FixedCardHooks / ControllerStopPort）。
// 类内保留同名同签名同可见性的**薄委托**；cards/run-change 的 17 个实例状态按方案 §3.6 由模块单 owner
// 持有并创建，门面仅保留同一实例访问器；未迁出的门面方法经端口回调注入（参数逐位原样转发）。
import { Cards } from "./session/cards/cards.ts";
import { VersionDecisions } from "./session/cards/version-decisions.ts";
import { AcceptanceFacts } from "./session/cards/acceptance-facts.ts";
import { RunChange } from "./session/run-change.ts";
import type { CardGateway, ControllerStopPort } from "./session/card-gateway.ts";''')

replace_once(
'''  private readonly delivery: Delivery;
  /** 回交去重键（`handbackKey` 单一来源；`projectRoot\\0<key>`）——**一条回交只投递一次**（永不放行重投）。 */''',
'''  private readonly delivery: Delivery;
  /** B5：run-change 栅栏/控制器停止/执行库存事实（9 方法 → `./session/run-change.ts`；方案 §3.6 的 10 个
   *  状态字段由模块单 owner 持有（`RunChange.state`）；门面仅保留同一实例访问器）。 */
  private readonly runChange: RunChange;
  /** B5：应用卡呈现/申请生命周期/方案升级/任命/stable/run-change 卡（21 方法 →
   *  `./session/cards/cards.ts`；方案 §3.6 的 7 个 cards 状态字段由模块单 owner 持有）。 */
  private readonly cards: Cards;
  /** B5：版本决策全链与恢复（17 方法 → `./session/cards/version-decisions.ts`）。 */
  private readonly versionDecisions: VersionDecisions;
  /** B5：验收 judge 事实与 appointment-write 校验（5 方法 → `./session/cards/acceptance-facts.ts`）。 */
  private readonly acceptanceFacts: AcceptanceFacts;
  /** B5：卡片通道端口实例（门面构造注入；fixed-workflow/lifecycle 经此使用，不导入 cards/**）。 */
  private readonly cardGateway: CardGateway;
  /** B5：精确控制器停止端口实例（门面构造注入）。 */
  private readonly controllerStopPort: ControllerStopPort;
  /** 回交去重键（`handbackKey` 单一来源；`projectRoot\\0<key>`）——**一条回交只投递一次**（永不放行重投）。 */''')

replace_once(
'''    // B4（2026-11-13）两阶段装配：投递机状态由 `./session/delivery/queue.ts` 的 `Delivery` **单 owner 持有**''',
'''    // B5（2026-11-13）两阶段装配：run-change 状态由 `./session/run-change.ts` 的 `RunChange` **单 owner 持有**
    // （方案 §3.6 的 10 个字段；inventory 两项与 Delivery 共享同一 Set/Map 实例）；投递方法经端口箭头回调
    // 注入，只在运行期调用（构造期不触发）。必须在 Delivery 之前构造：Delivery 的库存状态引用取自本对象。
    this.runChange = new RunChange(
      {
        sessions: this.sessions,
        observedHandles: this.observedHandles,
        openChains: this.openChains,
        lastRoleActivity: this.lastRoleActivity,
        managerId: this.managerId,
        deliveryQueues: () => this.deliveryQueues,
        activeDeliveries: () => this.activeDeliveries,
        drainClaimRecords: () => this.drainClaimRecords,
        taskDeliveryCommits: () => this.taskDeliveryCommits,
        taskHandbackCommits: () => this.taskHandbackCommits,
      },
      { deliveryQueuePersistenceFacts: () => this.deliveryQueuePersistenceFacts() },
      deps,
    );
    // B4（2026-11-13）两阶段装配：投递机状态由 `./session/delivery/queue.ts` 的 `Delivery` **单 owner 持有**''')

replace_once(
'''      deps,
    );
  }

  // —————————————— G-2（W1）：看护的观察/活动转发与时钟 ——————————————''',
'''      deps,
    );
    // B5（2026-11-13）两阶段装配：cards 簇（方案 §3.6 的 7 个状态字段由 `Cards` 单 owner 持有并创建；
    // version-decisions 经同一实例引用读写 versionDecisionPending/versionDecisionChains）；
    // fixed 卡钩子（prepareFixedAppointmentCardRequest/recordFixedCardWorkflowResolution）经门面箭头注入。
    this.acceptanceFacts = new AcceptanceFacts(deps);
    this.cards = new Cards(
      {
        sessions: this.sessions,
        lastGovernanceRuntime: this.lastGovernanceRuntime,
        lastRoleActivity: this.lastRoleActivity,
        loadEffectiveConfig: this.loadEffectiveConfig,
      },
      {
        findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
        activeRuntimeFor: (projectRoot) => this.activeRuntimeFor(projectRoot),
        enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
        drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
      },
      deps,
      this.evidence,
      this.acceptanceFacts,
      {
        prepareFixedAppointmentCardRequest: (projectRoot, flowId, request) => this.prepareFixedAppointmentCardRequest(projectRoot, flowId, request),
        recordFixedCardWorkflowResolution: (input) => this.recordFixedCardWorkflowResolution(input),
      },
    );
    this.versionDecisions = new VersionDecisions(
      this.cards,
      { sessions: this.sessions, lastGovernanceRuntime: this.lastGovernanceRuntime },
      { findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId) },
      deps,
      this.acceptanceFacts,
    );
    // B5 端口实例（方案 §3.3：由门面构造注入、运行期调用；B6/B7 的 fixed-workflow/lifecycle 经 CardGateway 发卡）。
    this.cardGateway = {
      presentAppCard: (input) => this.cards.presentAppCard(input),
      withRequestLifecycle: (projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle) =>
        this.cards.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle),
      offerRunChangeOnFrozenContract: (input) => this.cards.offerRunChangeOnFrozenContract(input),
      reportPlanEscalation: (projectRoot, input, signal) => this.cards.reportPlanEscalation(projectRoot, input, signal),
    };
    this.controllerStopPort = { stopExactController: (input, caller) => this.runChange.stopExactController(input, caller) };
  }

  // —————————————— G-2（W1）：看护的观察/活动转发与时钟 ——————————————''')

open(path, "w", encoding="utf-8", newline="").write(s)
print("ctor patched")
