// test/测试/existing-project-compat-verify/e-contract-wiring.test.ts
// 测试角色：跨层契约独立核对（任务书 §A/B 契约面；PM 评审 §四.2）。
//
// 覆盖：IPC 通道名 / preload 方法名**不得起别名**；confirm:true 固定在桥内；渲染侧只经
// `window.desktop` 方法消费、不直连 ipcRenderer；`listProject` 结果携带 `governanceRecord`。
// 本文件只做**契约字面**核对（真实行为已由 A/B/C 套件驱动）；不 import 产品测试文件。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel: string): string => fs.readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

test("E1 IPC 契约：main 注册两个通道；preload 暴露同名方法且 establish 固定 confirm:true", () => {
  const main = read("app/main.ts");
  assert.match(main, /registerHandler\("project:governance-preview",\s*\(_e, input\) => desktop\.previewGovernanceRecord\(input\)\)/);
  assert.match(main, /registerHandler\("project:governance-establish",\s*\(_e, input\) => desktop\.establishGovernanceRecord\(input\)\)/);

  // 2026-10-17 契约变更（三权 S1 模型选择，评审 §5.5）：两方法增可选 `options.governanceModel`——
  // 交付形态是**同一方法 + 可选透传**，不是新通道；`confirm: true` 仍固定在本桥内。
  const preload = read("app/preload.cjs");
  assert.match(
    preload,
    /previewGovernanceRecord:\s*\(projectRoot, options\) =>\s*ipcRenderer\.invoke\("project:governance-preview",\s*\{\s*\n\s*projectRoot,/,
  );
  assert.match(
    preload,
    /establishGovernanceRecord:\s*\(projectRoot, options\) =>\s*\n?\s*ipcRenderer\.invoke\("project:governance-establish",\s*\{\s*\n\s*projectRoot,\s*\n\s*confirm: true,/,
  );
  assert.match(preload, /governanceModel: options\.governanceModel/, "可选 governanceModel 原样上送（缺省不注入）");

  // 不得出现别名通道（契约名唯一）。
  for (const alias of ["governancePreview", "governanceEstablish", "project:governance-bootstrap"]) {
    assert.equal(main.includes(alias), false, `main.ts 不得出现别名：${alias}`);
    assert.equal(preload.includes(alias), false, `preload.cjs 不得出现别名：${alias}`);
  }
});

test("E2 渲染侧契约：只经 window.desktop 方法消费；不使用 ipcRenderer；状态字段原样落 state", () => {
  const renderer = read("app/renderer/renderer.js");
  assert.match(renderer, /d\.previewGovernanceRecord\(projectRoot(?:,|\))/, "预览经 preload 方法");
  assert.match(renderer, /d\.establishGovernanceRecord\(projectRoot(?:,|\))/, "建立经 preload 方法");
  assert.equal(renderer.includes("ipcRenderer"), false, "渲染侧不得直连 ipcRenderer");
  assert.match(renderer, /state\.governanceRecord = gr/, "列举结果原样落 state.governanceRecord");
  // 2026-10-17 语义变更（pin 恢复）：状态集合由三态扩为四态（新增 pin-mismatch）。
  assert.match(
    renderer,
    /knownGovernanceStates\s*=\s*\["present", "missing", "invalid", "pin-mismatch"\]/,
    "只认四种状态（含 pin-mismatch；未知状态 fail-closed 兜底 present）",
  );
});

test("E3 Interface 契约：ListProjectResult 带 governanceRecord；两方法在 DesktopInterface 上", () => {
  const iface = read("app/desktop/interface.ts");
  assert.match(iface, /governanceRecord: GovernanceRecordStatus;/);
  // 2026-10-17（三权 S1）：两方法增可选 governanceModel（缺省 single，旧行为逐字不变）。
  assert.match(
    iface,
    /previewGovernanceRecord\(input: \{ projectRoot: string; governanceModel\?: GovernanceModel \}\): Promise<GovernancePreviewResult>;/,
  );
  assert.match(
    iface,
    /establishGovernanceRecord\(input: \{ projectRoot: string; confirm: true; governanceModel\?: GovernanceModel \}\): Promise<EstablishGovernanceResult>;/,
  );
  // 桌面只依赖 Pipeline 公共出口（不得直接导入 common/编排/finalize.ts）。
  assert.equal(
    /from\s+"\.\.\/\.\.\/src\/common\/编排\/finalize\.ts"/.test(iface),
    false,
    "桌面窗口不得直接导入编排私有 common",
  );
  assert.match(iface, /from "\.\.\/\.\.\/src\/pipeline\/orchestration\/govern-session\.ts"/);
});

test("E4 动作只由确认按钮触发：establish 调用点唯一（preview/建立均无自动/定时调用）", () => {
  const renderer = read("app/renderer/renderer.js");
  const calls = renderer.match(/d\.establishGovernanceRecord\(/g) ?? [];
  assert.equal(calls.length, 1, "renderer.js 中 establish 调用点恰一处（确认面板）");
  // 无定时器触发治理面板（renderer 既有「零计时器」纪律）：2026-10-18 客户批准唯一豁免——
  // 「替我审批中」一次性警告约 9 秒自动收起（showShellJudgeWarning）。锁定数量/位置/用途，
  // 并反向断言该计时器回调不触碰任何治理动作；setInterval 仍为零。
  const timers = renderer.match(/\bsetTimeout\s*\(/g) ?? [];
  assert.equal(timers.length, 1, "renderer.js 恰有一个 setTimeout（豁免仅限一次性警告）");
  const warnStart = renderer.indexOf("function showShellJudgeWarning(");
  const warnEnd = renderer.indexOf("function syncShellJudgeWarning(");
  const timerAt = renderer.indexOf("setTimeout(function ()");
  assert.ok(timerAt > warnStart && timerAt < warnEnd, "唯一计时器必须位于 showShellJudgeWarning 内");
  const timerSlice = renderer.slice(timerAt, timerAt + 240);
  assert.ok(timerSlice.includes("hideShellJudgeWarning();"), "计时器到期只收起该警告");
  assert.equal(
    /establishGovernanceRecord|previewGovernanceRecord|previewGovernanceMigration|migrateGovernanceModel|GovernancePreview|GovernanceMigration/.test(
      timerSlice,
    ),
    false,
    "计时器回调不得自动触发治理动作",
  );
  assert.equal(/setInterval\s*\(/.test(renderer), false, "renderer.js 不得以 setInterval 自动触发");
});
