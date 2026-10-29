// test/桌面UI/composer-layout.test.ts
// 2026-10-29 客户真机缺陷（Composer 两开关溢出页面）修复的结构钉子：
//   · 输入区两行——提示文字一行（`.composer-trust-line`：标题 + 说明），控件一行
//     （`.composer-controls`：附件 + 两个胶囊开关组 + 范围 + 键盘提示 + 动作）；
//   · 胶囊样式：`.composer-auto-approve` 圆角胶囊、可收缩（`flex: 0 1 auto` + `min-width: 0`），
//     标签文字省略号；范围 `.composer-scope` 右靠 + 省略号；
//   · 无横向溢出的布局前提：`.composer-bottom` 纵向两行且 `width: 100%`，各行 `min-width: 0`，
//     不允许固定像素宽度把控件推出视口。
// 只读源码/CSS，不启动 DOM；真实窄屏/1360 像素级验证由 phase5a Electron 冒烟与真机 CDP 追加。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMPOSER = join(ROOT, "app", "renderer", "src", "shell", "Composer.tsx");
const SHELL_CSS = join(ROOT, "app", "renderer", "src", "shell", "shell.css");

const composerSource = readFileSync(COMPOSER, "utf8");
const css = readFileSync(SHELL_CSS, "utf8");

/** 取 TSX 中 `className="<name>"` 起的元素块：从起点到同名闭合标签（简单深度计数，够用于本文件结构钉子）。 */
function jsxBlock(className: string): string {
  const start = composerSource.indexOf(`className="${className}"`);
  assert.ok(start >= 0, `Composer.tsx 缺少 .${className}`);
  const openTagEnd = composerSource.indexOf(">", start);
  assert.ok(openTagEnd > start, `.${className} 起始标签不完整`);
  // 本文件结构钉子只关心两个容器各自包住了谁：容器都是 <div>，用 div 深度计到闭合。
  let depth = 1;
  let index = openTagEnd + 1;
  while (index < composerSource.length && depth > 0) {
    const nextOpen = composerSource.indexOf("<div", index);
    const nextClose = composerSource.indexOf("</div>", index);
    assert.ok(nextClose >= 0, `.${className} 未闭合`);
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + 4;
    } else {
      depth -= 1;
      index = nextClose + 6;
    }
  }
  return composerSource.slice(start, index);
}

/** 取 CSS 规则体（第一个精确选择器匹配）。 */
function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  assert.ok(match, `shell.css 缺少规则 ${selector}`);
  return match![1];
}

function assertDeclaration(rule: string, declaration: string, selector: string): void {
  assert.match(rule, new RegExp(`(?:^|\\n)\\s*${declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`), `${selector} 缺少声明 ${declaration}`);
}

test("Composer 结构：提示文字独占一行，控件（附件/两开关/范围/键盘/动作）同处一行", () => {
  const bottom = jsxBlock("composer-bottom");
  const trustLine = bottom.indexOf('className="composer-trust-line"');
  const controls = bottom.indexOf('className="composer-controls"');
  assert.ok(trustLine > 0, "composer-bottom 内应有 .composer-trust-line");
  assert.ok(controls > trustLine, "控件行 .composer-controls 应在提示行之后（两行结构）");

  const lineBlock = jsxBlock("composer-trust-line");
  assert.ok(lineBlock.includes('className="composer-trust-title"'), "提示行应含标题 .composer-trust-title");
  assert.ok(lineBlock.includes('id="judge-switch-hint"'), "提示行应含说明 #judge-switch-hint");
  assert.ok(lineBlock.includes('className="composer-trust-hint"'), "提示行说明应使用 .composer-trust-hint");
  assert.equal(lineBlock.includes("composer-auto-approve"), false, "开关胶囊不得回到提示行（应同处控件行）");

  const controlsBlock = jsxBlock("composer-controls");
  for (const token of [
    'id="btn-attach-image"',
    'className="composer-trust"',
    'id="auto-approve-toggle"',
    'id="judge-decision-toggle"',
    'id="composer-scope"',
    'className="composer-keyboard"',
    'className="composer-actions"',
  ]) {
    assert.ok(controlsBlock.includes(token), `控件行应包含 ${token}`);
  }
  // 两个开关胶囊同处 .composer-trust 分组（role=group），范围/键盘/动作在其外。
  const trustGroupStart = controlsBlock.indexOf('className="composer-trust"');
  const trustGroupEnd = controlsBlock.indexOf('id="composer-scope"');
  assert.ok(trustGroupStart >= 0 && trustGroupEnd > trustGroupStart, "composer-trust 分组应在 composer-scope 之前闭合");
  const trustGroup = controlsBlock.slice(trustGroupStart, trustGroupEnd);
  assert.equal(trustGroup.includes("composer-scope"), false, "composer-scope 不得被包进开关分组");
  assert.ok(trustGroup.includes('role="group"'), "两个开关应以 role=group 分组（可访问性）");
  assert.ok(trustGroup.includes('id="auto-approve-toggle"'), "分组内含「替我审批」");
  assert.ok(trustGroup.includes('id="judge-decision-toggle"'), "分组内含「替我决策」");
});

test("CSS 布局：composer-bottom 两行纵向，行/组可收缩（min-width:0），无固定宽度把控件推出视口", () => {
  const bottom = cssRule(".composer-bottom");
  assertDeclaration(bottom, "display: flex", ".composer-bottom");
  assertDeclaration(bottom, "flex-direction: column", ".composer-bottom");
  assertDeclaration(bottom, "width: 100%", ".composer-bottom");
  assertDeclaration(bottom, "min-width: 0", ".composer-bottom");

  const line = cssRule(".composer-trust-line");
  assertDeclaration(line, "display: flex", ".composer-trust-line");
  assertDeclaration(line, "align-items: baseline", ".composer-trust-line");
  assertDeclaration(line, "min-width: 0", ".composer-trust-line");

  const controls = cssRule(".composer-controls");
  assertDeclaration(controls, "display: flex", ".composer-controls");
  assertDeclaration(controls, "align-items: center", ".composer-controls");
  assertDeclaration(controls, "min-width: 0", ".composer-controls");
  assert.equal(/(?:^|\n)\s*width\s*:/.test(controls), false, ".composer-controls 不得写死宽度（窄屏必须让位）");

  const trust = cssRule(".composer-trust");
  assertDeclaration(trust, "display: flex", ".composer-trust");
  assertDeclaration(trust, "flex: 0 1 auto", ".composer-trust");
  assertDeclaration(trust, "min-width: 0", ".composer-trust");

  // 逐一确认两行内没有固定 px 宽度（over-flow 的主因）；位置/尺寸均交给 flex 收缩。
  for (const selector of [".composer-trust-line", ".composer-controls", ".composer-trust"]) {
    assert.equal(/(?:^|\n)\s*width\s*:\s*\d+(?:\.\d+)?px/.test(cssRule(selector)), false, `${selector} 不得固定像素宽度`);
  }
});

test("CSS 胶囊：两个开关是圆角胶囊、可收缩且标签省略；范围右靠省略；提示文字省略", () => {
  const pill = cssRule(".composer-auto-approve");
  assertDeclaration(pill, "border-radius: 999px", ".composer-auto-approve");
  assertDeclaration(pill, "border: 1px solid var(--border)", ".composer-auto-approve");
  assertDeclaration(pill, "flex: 0 1 auto", ".composer-auto-approve");
  assertDeclaration(pill, "min-width: 0", ".composer-auto-approve");
  assertDeclaration(pill, "white-space: nowrap", ".composer-auto-approve");

  const pillText = cssRule(".composer-auto-approve > span");
  for (const declaration of ["min-width: 0", "overflow: hidden", "text-overflow: ellipsis"]) {
    assertDeclaration(pillText, declaration, ".composer-auto-approve > span");
  }

  const scope = cssRule(".composer-scope");
  assertDeclaration(scope, "margin-left: auto", ".composer-scope");
  assertDeclaration(scope, "min-width: 0", ".composer-scope");
  assertDeclaration(scope, "overflow: hidden", ".composer-scope");
  assertDeclaration(scope, "text-overflow: ellipsis", ".composer-scope");

  const hint = cssRule(".composer-bottom .composer-trust-hint");
  for (const declaration of ["min-width: 0", "overflow: hidden", "text-overflow: ellipsis", "white-space: nowrap"]) {
    assertDeclaration(hint, declaration, ".composer-bottom .composer-trust-hint");
  }

  const title = cssRule(".composer-trust-title");
  assertDeclaration(title, "white-space: nowrap", ".composer-trust-title");
  assertDeclaration(title, "flex: 0 0 auto", ".composer-trust-title");
});
