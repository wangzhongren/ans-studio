import io

root = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b5"
path = f"{root}/app/desktop/session.ts"
s = open(path, encoding="utf-8").read()


def replace_once(old, new):
    global s
    assert s.count(old) == 1, f"expected exactly one occurrence, got {s.count(old)}: {old[:80]!r}"
    s = s.replace(old, new)


replace_once(
"""  private runStopGeneration = 0;
  private readonly fencedRunTasks = new Map<string, Set<string>>();
  private readonly fencedRuns = new Map<string, Set<string>>();
  private readonly runStopFacts = new Map<string, { projectRoot: string; fact: DesktopRunStopFact }>();
  private readonly controllerStopFacts = new Map<string, { projectRoot: string; fact: DesktopControllerStopFact }>();
  private readonly controllerDisposalOwners = new Set<ControllerDisposalLease>();
  private readonly deferredRunChanges = new Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }>();
  private readonly runChangeOperations = new Map<string, { plan: RunChangeHostPlan; controller: AbortController }>();""",
"""  // —— B5（2026-11-13）：run-change 状态（方案 §3.6 的 10 个字段）由 `./session/run-change.ts` 的
  // `RunChange` **单 owner 持有并创建**；门面仅保留**同一实例**访问器（方案 §4.3 兼容面：测试 cast 与
  // 尚未迁出的生命周期/停止方法按原名访问），不造第二份状态。 ——
  private get runStopGeneration(): number { return this.runChange.state.runStopGeneration; }
  private set runStopGeneration(value: number) { this.runChange.state.runStopGeneration = value; }
  private get fencedRunTasks(): Map<string, Set<string>> { return this.runChange.state.fencedRunTasks; }
  private get fencedRuns(): Map<string, Set<string>> { return this.runChange.state.fencedRuns; }
  private get runStopFacts(): Map<string, { projectRoot: string; fact: DesktopRunStopFact }> { return this.runChange.state.runStopFacts; }
  private get controllerStopFacts(): Map<string, { projectRoot: string; fact: DesktopControllerStopFact }> { return this.runChange.state.controllerStopFacts; }
  private get controllerDisposalOwners(): Set<ControllerDisposalLease> { return this.runChange.state.controllerDisposalOwners; }
  private get deferredRunChanges(): Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }> { return this.runChange.state.deferredRunChanges; }
  private get runChangeOperations(): Map<string, { plan: RunChangeHostPlan; controller: AbortController }> { return this.runChange.state.runChangeOperations; }""")

replace_once(
"""  private readonly inventoryPublicationErrors = new Map<string, string>();
  private readonly observedInventoryRoots = new Set<string>();""",
"""  private get inventoryPublicationErrors(): Map<string, string> { return this.runChange.state.inventoryPublicationErrors; }
  private get observedInventoryRoots(): Set<string> { return this.runChange.state.observedInventoryRoots; }""")

replace_once(
"""  /** 库存函数的显式状态面（同一 Set/Map 实例；方案 §3.6 归属 run-change，B1 不搬状态）。 */
  private get inventoryState(): SessionInventoryState {
    return { observedInventoryRoots: this.observedInventoryRoots, inventoryPublicationErrors: this.inventoryPublicationErrors };
  }""",
"""  /** 库存函数的显式状态面（同一 Set/Map 实例；方案 §3.6 归属 run-change，由模块单 owner 持有）。 */
  private get inventoryState(): SessionInventoryState {
    return this.runChange.inventoryState;
  }""")

replace_once(
"""  /** 2026-11-05：在途方案升级卡（`projectRoot\\0flowId` 去重；同一 flow 至多一张）。 */
  private readonly planEscalations = new Map<string, Promise<void>>();""",
"""  /** B5：在途方案升级卡（`projectRoot\\0flowId` 去重；同一 flow 至多一张）——状态由
   *  `./session/cards/cards.ts` 的 `Cards` 单 owner 持有（同一实例访问器）。 */
  private get planEscalations(): Map<string, Promise<void>> { return this.cards.state.planEscalations; }""")

replace_once(
"""  /**
   * 2026-11-05（客户最终口径）：已向 convener 发过「是否自己调用 report_plan_escalation」提示的 flow。
   * 首次 blocked 即提示，同一 flow 在 done/failed/aborted 或升级卡成功提交后清除标记（下一次 blocked 可再提示）。
   */
  private readonly planEscalationPrompted = new Set<string>();""",
"""  /** B5：已向 convener 发过「是否自己调用 report_plan_escalation」提示的 flow（状态由 `Cards` 单 owner
   *  持有；首次 blocked 即提示，同一 flow 在 done/failed/aborted 或升级卡成功提交后清除标记）。 */
  private get planEscalationPrompted(): Set<string> { return this.cards.state.planEscalationPrompted; }""")

replace_once(
"""  /** C 批：系统通知去重（`requestId\\0event`）。 */
  private readonly requestNotifiedKeys = new Set<string>();""",
"""  /** C 批：系统通知去重（`requestId\\0event`）——状态由 `Cards` 单 owner 持有。 */
  private get requestNotifiedKeys(): Set<string> { return this.cards.state.requestNotifiedKeys; }""")

replace_once(
"""  /**
   * 2026-11-02（版本决策）：同进程未决请求（subjectKey -> requestId）；跨重启由账本结构化扫描兜底。
   * 只用于 `decision-pending` 的 check-then-set，不当作第二份持久状态。
   */
  private readonly versionDecisionPending = new Map<string, string>();""",
"""  /** 2026-11-02（版本决策）：同进程未决请求（subjectKey -> requestId）——状态由 `Cards` 单 owner 持有；
   *  跨重启由账本结构化扫描兜底，只用于 `decision-pending` 的 check-then-set，不当作第二份持久状态。 */
  private get versionDecisionPending(): Map<string, string> { return this.cards.state.versionDecisionPending; }""")

replace_once(
"""  /** 版本决策 check-then-set 的 per-project 串行链（不持有到卡裁决/执行，避免阻塞第二请求的超时）。 */
  private readonly versionDecisionChains = new Map<string, Promise<void>>();""",
"""  /** 版本决策 check-then-set 的 per-project 串行链（状态由 `Cards` 单 owner 持有；不持有到卡裁决/执行）。 */
  private get versionDecisionChains(): Map<string, Promise<void>> { return this.cards.state.versionDecisionChains; }""")

replace_once(
"""  /** C 批：已呈现过的申请（`requestId\\0customer|judge`）。 */
  private readonly requestPresentedKeys = new Set<string>();""",
"""  /** C 批：已呈现过的申请（`requestId\\0customer|judge`）——状态由 `Cards` 单 owner 持有。 */
  private get requestPresentedKeys(): Set<string> { return this.cards.state.requestPresentedKeys; }""")

replace_once(
"""  /**
   * 2026-10-31（run-change 触发缺陷）：**自动**呈现 run-change 卡的去重键（`projectRoot\\0runId`）。
   * 同一 pinned run 只自动弹一次——客户已决定/已呈现后，后续冻结冲突只回结构化拒绝（走显式入口），
   * 不刷屏、不重复替客户要决定。显式入口（会话头按钮/IPC）不受此集合限制。
   */
  private readonly runChangeAutoPrompted = new Set<string>();""",
"""  /** 2026-10-31（run-change 触发缺陷）：**自动**呈现 run-change 卡的去重键（`projectRoot\\0runId`；状态由
   *  `Cards` 单 owner 持有）。同一 pinned run 只自动弹一次——客户已决定/已呈现后，后续冻结冲突只回
   *  结构化拒绝（走显式入口），不刷屏、不重复替客户要决定。显式入口（会话头按钮/IPC）不受此集合限制。 */
  private get runChangeAutoPrompted(): Set<string> { return this.cards.state.runChangeAutoPrompted; }""")

open(path, "w", encoding="utf-8", newline="").write(s)
print("fields patched")
