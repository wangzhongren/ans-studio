/**
 * 回放锚点纯逻辑（Phase 4B）：
 * - 历史回放行按 `anchorKey` 记录请求行/结论行的**行序位**；
 * - 交互卡（重）物化时插回请求行之后（结论行之前）；
 * - 卡插入后，其后的锚点索引同步右移（保持「卡在两行之间」的语义）；
 * - 找不到锚点返回 null，调用方兜底落尾（绝不丢卡）。
 *
 * 无 DOM、无 store；`replayAnchorDebug` 直接读表。
 */

export interface AnchorEntry {
  anchorKey: string;
  requestIndex: number | null;
  conclusionIndex: number | null;
  rowsAtReplay: number;
}

export class AnchorTable {
  private map = new Map<string, AnchorEntry>();

  clear(): void {
    this.map.clear();
  }

  /** 登记一次回放行（同一 anchorKey 再次出现：新请求作废旧结论）。 */
  note(rowIndex: number, anchorKey: unknown, anchor: unknown): void {
    if (typeof anchorKey !== "string" || anchorKey === "") return;
    const index = Math.max(0, Math.floor(rowIndex));
    let entry = this.map.get(anchorKey);
    if (!entry) {
      entry = { anchorKey, requestIndex: null, conclusionIndex: null, rowsAtReplay: 0 };
      this.map.set(anchorKey, entry);
    }
    if (anchor === "request") {
      entry.requestIndex = index;
      entry.conclusionIndex = null;
    } else if (anchor === "conclusion" && entry.conclusionIndex === null) {
      entry.conclusionIndex = index;
    }
    entry.rowsAtReplay = index + 1;
  }

  get(anchorKey: string): AnchorEntry | null {
    return this.map.get(anchorKey) || null;
  }

  entries(): AnchorEntry[] {
    return Array.from(this.map.values()).map((entry) => ({ ...entry }));
  }

  /** 卡应插入的位置（请求行之后 / 只有结论时结论行之前）；无锚或行表规模不符 ⇒ null。 */
  insertionIndex(anchorKey: string, rowCount: number): number | null {
    const entry = this.map.get(anchorKey);
    if (!entry) return null;
    if (rowCount < entry.rowsAtReplay) return null;
    if (entry.requestIndex !== null && entry.requestIndex + 1 <= rowCount) {
      return entry.requestIndex + 1;
    }
    if (entry.conclusionIndex !== null && entry.conclusionIndex <= rowCount) {
      return entry.conclusionIndex;
    }
    return null;
  }

  /** 行表在 `at` 处插入一行后，同步右移其后的锚点索引。 */
  shiftAfterInsert(at: number): void {
    const position = Math.max(0, Math.floor(at));
    for (const entry of this.map.values()) {
      if (entry.requestIndex !== null && entry.requestIndex >= position) {
        entry.requestIndex += 1;
      }
      if (entry.conclusionIndex !== null && entry.conclusionIndex >= position) {
        entry.conclusionIndex += 1;
      }
    }
  }
}
