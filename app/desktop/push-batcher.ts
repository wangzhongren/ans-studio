// app/desktop/push-batcher.ts
// **主进程 → 渲染进程的热路径合并推送**（Q-1，2026-10-12 客户「很多操作会阻碍主线程」）。
//
// 症状（真机）：一轮里模型发**几百个事件**——若每个事件都各推一次 IPC（`session:event` + `session:role-state`）、
// 渲染侧每次再做 DOM 更新/滚动计算，主线程必被淹（角色工作期间 UI 卡死）。
// 本模块提供两个**纯逻辑**合并器（计时器注入，可单测；不依赖 electron）：
//   · `createEventBatcher`——事件**按窗口批量**（缺省 16ms≈一帧）：窗口内的 N 个事件合成**一次** send(数组)；
//   · `createRoleStateDebouncer`——角色状态快照**按角色去抖**：窗口内同角色只保留**最新**快照（快照语义），
//     一次 flush 把各角色的最新快照各推一次。
// 失败/关窗由调用方在 `send` 里处理（本模块只管合帧）；`flush()` 供退出/关窗时立即清空（不丢最后一批）。

/** 通用窗口合并器（事件批量）。 */
export interface Batcher<T> {
  push(item: T): void;
  /** 立即送出当前挂起（顺序不变）；无挂起则 no-op。 */
  flush(): void;
  /** 取消挂起计时并清空（**不**发送）——关窗等场景由调用方决定是否先 flush。 */
  dispose(): void;
  pendingCount(): number;
}

export function createEventBatcher<T>(opts: {
  /** 合并窗口（毫秒；缺省 16 ≈ 一帧）。 */
  windowMs?: number;
  /** 一次送出（调用方负责 win.isDestroyed 等防御）。 */
  send: (batch: T[]) => void;
}): Batcher<T> {
  const windowMs = typeof opts.windowMs === "number" && opts.windowMs > 0 ? opts.windowMs : 16;
  let pending: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    opts.send(batch);
  };

  return {
    push(item) {
      pending.push(item);
      if (timer === null) timer = setTimeout(flush, windowMs);
    },
    flush,
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = [];
    },
    pendingCount: () => pending.length,
  };
}

/** 角色状态快照的**去抖**合并器（同角色窗口内只保留最新——快照语义，不做事件式累积）。 */
export interface RoleStateDebouncer<T extends { roleId: string }> {
  push(info: T): void;
  flush(): void;
  dispose(): void;
  pendingRoles(): string[];
}

export function createRoleStateDebouncer<T extends { roleId: string }>(opts: {
  /** 去抖窗口（毫秒；缺省 100——「≥100ms 或变更才推」的窗口值）。 */
  windowMs?: number;
  send: (info: T) => void;
}): RoleStateDebouncer<T> {
  const windowMs = typeof opts.windowMs === "number" && opts.windowMs > 0 ? opts.windowMs : 100;
  const pending = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    const items = [...pending.values()];
    pending.clear();
    for (const item of items) opts.send(item);
  };

  return {
    push(info) {
      pending.set(info.roleId, info); // 同角色：只留最新快照（旧快照无意义）
      if (timer === null) timer = setTimeout(flush, windowMs);
    },
    flush,
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
    },
    pendingRoles: () => [...pending.keys()],
  };
}
