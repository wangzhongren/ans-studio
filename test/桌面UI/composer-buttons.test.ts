// test/桌面UI/composer-buttons.test.ts
// 2026-11-04 客户直修：输入区精简（移除发送按钮；「停止本轮」改纯图标）结构钉子。
// 只读源码，不启动 DOM；真实 Electron 行为由 phase3b/phase4a 冒烟与证据探针覆盖。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMPOSER = join(ROOT, "app", "renderer", "src", "shell", "Composer.tsx");
const source = readFileSync(COMPOSER, "utf8");

test("输入区不再渲染发送按钮，Enter 发送逻辑保留", () => {
  assert.equal(/id="btn-send"/.test(source), false, "发送按钮应已移除");
  assert.equal(source.includes("ArrowUp"), false, "发送按钮专用图标不应残留");
  assert.ok(source.includes("onKeyDown={onKeyDown}"), "textarea 仍绑定 Enter 发送处理");
  assert.ok(source.includes("event.key !== \"Enter\" || event.shiftKey"), "Enter 发送、Shift+Enter 换行逻辑保留");
});

test("停止本轮为纯图标按钮：无文字、复用既有文案做可访问名称、状态保留", () => {
  const start = source.indexOf("id=\"btn-halt\"");
  assert.ok(start >= 0, "应保留停止按钮");
  const end = source.indexOf("</Button>", start);
  assert.ok(end > start, "停止按钮应闭合");
  const block = source.slice(start, end);
  assert.ok(block.includes("size=\"icon-sm\""), "停止按钮应为图标尺寸");
  assert.ok(block.includes("<Square"), "停止按钮应包含方块图标");
  assert.ok(block.includes("aria-label={t(\"shared.common.stopTurn\")}"), "可访问名称复用既有「停止本轮」文案");
  assert.ok(block.includes("title={t(\"shared.common.stopTurn\")}"), "title 复用既有「停止本轮」文案");
  const visibleText = block.split("\n").filter((line) => line.trim() === "{t(\"shared.common.stopTurn\")}");
  assert.equal(visibleText.length, 0, "图标按钮不得保留可见文字子节点");
  assert.ok(block.includes("hidden={!busy}") && block.includes("disabled={halting}"), "进行中可见/请求中禁用状态保留");
});
