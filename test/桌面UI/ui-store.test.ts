// test/桌面UI/ui-store.test.ts
// Phase 5A 迁移：旧「可收起左栏 / 左栏宽度 / 默认引擎」中的纯映射与持久化边界。
// 在 Node 里用最小 window.localStorage 桩加载 store；不启动 DOM。

import test from "node:test";
import assert from "node:assert/strict";

const memory = new Map<string, string>();
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => memory.set(key, String(value)),
    removeItem: (key: string) => memory.delete(key),
  },
};

memory.set("ans.sidebar.width", "999");
memory.set("ans.sidebar.collapsed", "0");
const {
  DEFAULT_RUNTIME,
  RUNTIME_OPTIONS,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  useUiStore,
} = await import("../../app/renderer/src/stores/ui-store.ts");

test("左栏宽度：默认 248 / 208–360 clamp / 四舍五入 / 坏值回退 248", () => {
  assert.equal(SIDEBAR_DEFAULT, 248);
  assert.equal(SIDEBAR_MIN, 208);
  assert.equal(SIDEBAR_MAX, 360);
  assert.equal(clampSidebarWidth(248), 248);
  assert.equal(clampSidebarWidth(1), 208);
  assert.equal(clampSidebarWidth(999), 360);
  assert.equal(clampSidebarWidth("240.6"), 241);
  assert.equal(clampSidebarWidth("bad"), 248);
  assert.equal(clampSidebarWidth(null), 248);
  assert.equal(clampSidebarWidth(Number.NaN), 248);
  // 启动读取也走同一 clamp：已存 999 ⇒ 360。
  assert.equal(useUiStore.getState().sidebarWidth, 360);
  assert.equal(useUiStore.getState().sidebarCollapsed, false);
});

test("默认引擎 Claude、选项顺序 Pi/Codex/Claude、存储键沿用旧口径", () => {
  assert.equal(DEFAULT_RUNTIME, "claude");
  assert.equal(useUiStore.getState().runtime, "claude");
  assert.deepEqual(RUNTIME_OPTIONS.map((option) => option.id), ["pi", "codex", "claude"]);
  assert.equal(SIDEBAR_WIDTH_STORAGE_KEY, "ans.sidebar.width");
  assert.equal(SIDEBAR_COLLAPSED_STORAGE_KEY, "ans.sidebar.collapsed");
});

test("宽度动作返回收敛值并持久化；折叠动作只写 1/0", () => {
  assert.equal(useUiStore.getState().setSidebarWidth(100), 208);
  assert.equal(memory.get("ans.sidebar.width"), "208");
  assert.equal(useUiStore.getState().setSidebarWidth(333.4), 333);
  assert.equal(memory.get("ans.sidebar.width"), "333");
  useUiStore.getState().setSidebarCollapsed(true);
  assert.equal(memory.get("ans.sidebar.collapsed"), "1");
  assert.equal(useUiStore.getState().sidebarCollapsed, true);
  useUiStore.getState().toggleSidebar();
  assert.equal(memory.get("ans.sidebar.collapsed"), "0");
  assert.equal(useUiStore.getState().sidebarCollapsed, false);
});

test("存储不可用不阻止本次会话操作（异常被吞掉，状态仍更新）", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")!;
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    },
  };
  try {
    assert.equal(useUiStore.getState().setSidebarWidth(250), 250);
    assert.equal(useUiStore.getState().sidebarWidth, 250);
    useUiStore.getState().setSidebarCollapsed(true);
    assert.equal(useUiStore.getState().sidebarCollapsed, true);
  } finally {
    Object.defineProperty(globalThis, "window", descriptor);
  }
});
