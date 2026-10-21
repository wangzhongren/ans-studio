/**
 * 虚拟窗口行模型（Phase 3A 移植；纯逻辑、无 DOM）。
 *
 * 与旧 `renderer.js` 的行表同口径：
 * - 行 = `{height}`，`height` 是**行占位**（真实行高 + pane 行距；组件测量后修正）；
 * - 行数 < `minRows`（150）⇒ 全挂载（小 pane 行为与旧版一致）；
 * - ≥ 阈值 ⇒ 只实体化视口 ± `buffer` 行，窗口外用上下 spacer 按 prefix 和撑高；
 * - `preferTail` 把窗口钉在尾部（新行到达时贴底）；`preferIndex` 用于未决卡/锚点定位。
 *
 * 该模块只负责“哪些行应挂载/上下 spacer 多高”，不构造元素、不读样式；
 * 实测与滚动由 React 组件负责。
 */

export interface RowLike {
  height: number;
  measured?: boolean;
  kind?: string;
  requestId?: string;
}

export interface WindowOptions {
  buffer?: number;
  preferTail?: boolean;
  preferIndex?: number;
}

export interface WindowResult<T extends RowLike> {
  first: number;
  last: number;
  topSpacer: number;
  bottomSpacer: number;
  rows: T[];
  allMounted: boolean;
}

export const VIRT_MIN_ROWS = 150;
export const VIRT_BUFFER = 30;
export const CHAT_ROW_GAP = 16;

export class RowModel<T extends RowLike> {
  rows: T[] = [];
  gap: number;
  minRows: number;
  private prefix: number[] | null = null;

  constructor(gap = CHAT_ROW_GAP, minRows = VIRT_MIN_ROWS) {
    this.gap = gap;
    this.minRows = minRows;
  }

  append(row: T): T {
    this.rows.push(row);
    this.prefix = null;
    return row;
  }

  insertAt(index: number, row: T): T {
    const at = Math.max(0, Math.min(this.rows.length, Math.floor(index)));
    this.rows.splice(at, 0, row);
    this.prefix = null;
    return row;
  }

  setRows(rows: T[]): void {
    this.rows = rows;
    this.prefix = null;
  }

  clear(): void {
    this.rows = [];
    this.prefix = null;
  }

  totalHeight(): number {
    return this.rebuild()[this.rows.length] ?? 0;
  }

  rebuild(): number[] {
    if (this.prefix !== null) return this.prefix;
    const sums = new Array<number>(this.rows.length + 1);
    sums[0] = 0;
    for (let i = 0; i < this.rows.length; i += 1) {
      sums[i + 1] = sums[i] + Math.max(0, this.rows[i].height || 0);
    }
    this.prefix = sums;
    return sums;
  }

  /** 视口（内容坐标，px）→ 需要挂载的行范围与 spacer 高度。 */
  getWindow(
    viewTop: number,
    viewBottom: number,
    options: WindowOptions = {},
  ): WindowResult<T> {
    const n = this.rows.length;
    if (n === 0) {
      return {
        first: 0,
        last: -1,
        topSpacer: 0,
        bottomSpacer: 0,
        rows: [],
        allMounted: true,
      };
    }
    if (n < this.minRows) {
      return {
        first: 0,
        last: n - 1,
        topSpacer: 0,
        bottomSpacer: 0,
        rows: this.rows.slice(),
        allMounted: true,
      };
    }
    const sums = this.rebuild();
    const buffer =
      typeof options.buffer === "number" && options.buffer >= 0
        ? Math.floor(options.buffer)
        : VIRT_BUFFER;
    const top = Math.max(0, viewTop);
    const bottom = Math.max(top, viewBottom);
    let first = 0;
    while (first + 1 < n && sums[first + 1] <= top) first += 1;
    let last = n - 1;
    while (last > 0 && sums[last] >= bottom) last -= 1;
    first = Math.max(0, first - buffer);
    last = Math.min(n - 1, last + buffer);
    if (options.preferTail === true) {
      last = n - 1;
      first = Math.max(0, last - 2 * buffer);
    }
    if (typeof options.preferIndex === "number") {
      const index = Math.max(0, Math.min(n - 1, Math.floor(options.preferIndex)));
      first = Math.max(0, index - buffer);
      last = Math.min(n - 1, index + buffer);
    }
    const topSpacer = sums[first];
    const bottomSpacer = sums[n] - sums[last + 1];
    return {
      first,
      last,
      topSpacer,
      bottomSpacer,
      rows: this.rows.slice(first, last + 1),
      allMounted: false,
    };
  }

  /** `rowModelDebug` 的同义返回：count/lastIndex/operators/rowGap。 */
  debug(): {
    count: number;
    lastIndex: number;
    operators: Array<{ index: number; requestId: string }>;
    rowGap: number;
  } {
    const operators: Array<{ index: number; requestId: string }> = [];
    for (let i = 0; i < this.rows.length; i += 1) {
      const row = this.rows[i];
      if (row.kind === "operator" && typeof row.requestId === "string") {
        operators.push({ index: i, requestId: row.requestId });
      }
    }
    return {
      count: this.rows.length,
      lastIndex: this.rows.length - 1,
      operators,
      rowGap: this.gap,
    };
  }

  /** 找到某 callId 所在行（operator 卡锚点物化用）。 */
  indexOfCallId(callId: string): number {
    if (!callId) return -1;
    for (let i = 0; i < this.rows.length; i += 1) {
      if ((this.rows[i] as RowLike & { callId?: string }).callId === callId) {
        return i;
      }
      const data = (this.rows[i] as RowLike & { data?: { items?: Array<{ callId?: string }> } }).data;
      if (data && Array.isArray(data.items)) {
        for (const item of data.items) {
          if (item && item.callId === callId) return i;
        }
      }
    }
    return -1;
  }
}
