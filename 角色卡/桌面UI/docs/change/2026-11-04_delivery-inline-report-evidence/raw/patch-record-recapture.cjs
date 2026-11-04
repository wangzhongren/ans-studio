// Update implementation record after review: probe recapture + evidence descriptions + hash updates.
const fs = require("node:fs");
const file = "角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-implementation.md";
let text = fs.readFileSync(file, "utf8");
const crlf = text.includes("\r\n");
const adapt = (value) => (crlf ? value.replace(/\n/g, "\r\n") : value);
let failures = 0;
function replace(name, oldRaw, newRaw) {
  const oldText = adapt(oldRaw);
  const newText = adapt(newRaw);
  const first = text.indexOf(oldText);
  if (first < 0) {
    if (text.includes(newText)) {
      console.log(`ALREADY ${name}`);
      return;
    }
    console.error(`MISS ${name}`);
    failures += 1;
    return;
  }
  text = text.slice(0, first) + newText + text.slice(first + oldText.length);
  console.log(`OK ${name}`);
}

replace(
  "event-updated",
  `    summary: 按客户直修指令把交付行正文改为默认内联全文（不点击/不折叠）；批次标题与三列回执降级到卡片尾部默认折叠的「接收历史」区；保留 16 KiB 投影/flags/证据/重试/aria-live/安全副本；typecheck 0、build 0、UI 402/402、phase4b smoke 69/69、探针 before 6/6 / after 14/14
---`,
  `    summary: 按客户直修指令把交付行正文改为默认内联全文（不点击/不折叠）；批次标题与三列回执降级到卡片尾部默认折叠的「接收历史」区；保留 16 KiB 投影/flags/证据/重试/aria-live/安全副本；typecheck 0、build 0、UI 402/402、phase4b smoke 69/69、探针 before 6/6 / after 14/14
  - date: "2026-11-04"
    kind: updated
    summary: 复核发现首张截图为重绘前空帧；探针 shot() 改为 invalidate + 双帧等待 + 丢弃预热帧，按 baseline/candidate 临时还原重采 before/after（6/6、14/14，候选 SHA-256 复核一致）；before 冒烟 OUT 未留存改为只引用 raw 日志
---`,
);

// probe-meta was already fixed via sed (full path inside the backticks differs from this anchor).

replace(
  "before-build-row",
  "| 基线构建（改前） | `npm run build:renderer` | exit 0，`✓ built in 355ms`（以基线文件快照复核重跑并留存日志；首次改前构建输出一致：447ms） | `raw/before-build-renderer.log` |",
  "| 基线构建（改前） | `npm run build:renderer` | exit 0，`✓ built in 346ms`（以基线文件快照临时还原后重跑并留存；首次改前构建为 447ms） | `raw/before-build-renderer.log` |",
);

replace(
  "before-smoke-row",
  "| 基线冒烟（改前） | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs \"\" <before/smoke-out>` | **69 checks / 0 failures**；zero console errors / zero CSP violations | `raw/before-phase4b-smoke.log` |",
  "| 基线冒烟（改前） | `./node_modules/.bin/electron test/桌面UI/phase4b-electron-smoke.mjs \"\" <before/smoke-out>` | **69 checks / 0 failures**；zero console errors / zero CSP violations。说明：OUT 目录 `…/before/smoke-out` 当时未单独留存（后续探针输出目录清理时被复用删除），原始输出以 `raw/before-phase4b-smoke.log` 为准 | `raw/before-phase4b-smoke.log` |",
);

replace("final-build-ms", "exit 0，`✓ built in 350ms`", "exit 0，`✓ built in 347ms`");

replace(
  "recapture-note",
  `改后探针 DOM 断言（无点击）：\`topLevelParagraph = null\`；\`.delivery-receipt\` 存在且关闭、summary 含「接收历史」、内部 \`.delivery-batch-title\` 逐字为「交付 · 本批 1 份（不表示全部收齐）」；\`.delivery-report .hb-summary\` 长度 561、前缀与 \`PROBE-DELIVERY-TAIL-MARKER\` 均在；\`report-complete = false\`；无 \`excerpt-label\`；\`.report-evidence\` summary「证据（1 条）」、含证据项与「已截断」；正文 flags「已净化 · 已截断；部分证据显示已截断」；三列 \`dt\` = \`接收历史/目标输入记录/目标轮次结果\`；重试按钮「重试保存历史」；\`role="status" aria-live="polite"\` 在回执内；\`.safe-input-copy\` 存在且关闭；zero console errors。

## 6. 截图与证据路径`,
  `改后探针 DOM 断言（无点击）：\`topLevelParagraph = null\`；\`.delivery-receipt\` 存在且关闭、summary 含「接收历史」、内部 \`.delivery-batch-title\` 逐字为「交付 · 本批 1 份（不表示全部收齐）」；\`.delivery-report .hb-summary\` 长度 561、前缀与 \`PROBE-DELIVERY-TAIL-MARKER\` 均在；\`report-complete = false\`；无 \`excerpt-label\`；\`.report-evidence\` summary「证据（1 条）」、含证据项与「已截断」；正文 flags「已净化 · 已截断；部分证据显示已截断」；三列 \`dt\` = \`接收历史/目标输入记录/目标轮次结果\`；重试按钮「重试保存历史」；\`role="status" aria-live="polite"\` 在回执内；\`.safe-input-copy\` 存在且关闭；zero console errors。

- **截图首帧修正（复核后）**：\`show:false\` 窗口首张 \`capturePage()\` 可能返回重绘前旧帧（曾出现「尚未导入项目」空壳）；\`shot()\` 现先 \`wc.invalidate()\`、等两个 \`requestAnimationFrame\` 后丢弃一张预热帧再取图。before/after 全部截图已按「临时还原基线 → 构建 → before 探针 → 还原候选（SHA-256 校验）→ 构建 → after 探针」重采；本表 checks/failures 不变。

## 6. 截图与证据路径`,
);

replace(
  "screenshot-bullets",
  `- 改前：\`before/delivery-default-before.png\`、\`before/delivery-report-bottom-before.png\`（真实 Electron 1360×860 截图）、\`before/probe-result.json\`
- 改后：\`after/delivery-default-after.png\`、\`after/delivery-report-bottom-after.png\`、\`after/delivery-receipt-open-after.png\`、\`after/probe-result.json\``,
  `- 改前：\`before/delivery-default-before.png\`（卡片顶部默认态：卡首「交付 · 本批 1 份（不表示全部收齐）」+ 三列回执 + 180 字预览 + 「查看完整报告摘要与证据」折叠）、\`before/delivery-report-bottom-before.png\`（预览尾/flags/折叠）、\`before/probe-result.json\`
- 改后：\`after/delivery-default-after.png\`（卡片顶部默认态：卡首直接是「任务报告」正文，全文含尾标记、证据折叠、尾部「接收历史」折叠）、\`after/delivery-report-bottom-after.png\`、\`after/delivery-receipt-open-after.png\`（展开回执：批次标题/三列/重试/安全副本）、\`after/probe-result.json\``,
);

replace(
  "probe-hash-row",
  "| `…/probe-delivery-inline.mjs`（新增） | — | `444543fff8284c06d0debee057fdb2accdf263e888a13b0e5fdc4f78471e51e4` | `83402f5a771e0471b28429c95017c9cb01ca6292` |",
  "| `…/probe-delivery-inline.mjs`（新增） | — | `ae7a67401f8cb212fa72d58cacc2918a29b0cd3da32ea7a5df3cc9ed13fc1b82` | `0eded475e4626b8a2ccbbf28e3b4d629a8dfa0ed` |",
);

if (failures > 0) {
  console.error(`RECORD_PATCH_FAILED ${failures}`);
  process.exit(1);
}
fs.writeFileSync(file, text);
console.log("RECORD_PATCH_OK");
