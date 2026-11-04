// test/测试/trunk-amendment-electron-probe.mjs
// T2（2026-11-05 trunk-amendment Batch 5）：真实 Electron 窗口 + 真实 preload/渲染器 +
// 真实 ChatHeader/TrunkPanels/VersionChangePanel/RefactorPanel/DecisionDialog；D1 冻结 IPC
// 载荷由本探针按真实形状注入（trunk:state + 只读列表），客户作答经真实 `session:operator-response`
// 回执。不启动真实模型、不触外网、不改产品代码。
//
// 运行：node_modules/.bin/electron test/测试/trunk-amendment-electron-probe.mjs
//   env ANS_T2_OUTDIR=证据输出目录（截图/report.json/probe.log）
//
// 场景（V1 §4.6；最多截图、不录屏；不加载 DEBUG 覆盖层）：
//   · 客户侧 header：无「重构」按钮/无 #run-change；有「版本变更」+ 收窄「主干升级」；
//   · 版本变更面板：待批/历史 VCA、kind/发起者/target/path/version/sha256/语义说明；
//   · 主干面板：F15 三类 stable 快照（workflow/role-card/boundary）、stable 确认/续接记录
//     （path/decisionId/old→new）、无 drift 文案、冻结清单/恢复说明；
//   · 重构审计：只读、无批准/拒绝按钮、managedBy application-scheduler、无提交表单；
//   · 主干升级：仅 emergency/recovery + 高危勾选 + 二次确认（一次性 preview）；
//   · 客户卡：VCA 批准卡（kind/发起者/targets/hash/语义）与 detail 逐项卡（acknowledgments）；
//   · en-US 面板文案（i18n 成对）。
//
// 纪律：本探针只读产品代码；截图 SHA-256/窗口尺寸/命令写入 report.json 与 probe.log。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import {
  buildAmendmentItemCard,
  buildStableBoundaryRisk,
  buildStableWriteCard,
  buildVersionChangeCard,
} from "../../app/desktop/version-change.ts";
import { createCustomerInputChannel } from "../../app/desktop/customer-input.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "app");
const RENDERER_ENTRY = path.join(APP, "renderer", "dist", "index.html");
const PRELOAD = path.join(APP, "preload.cjs");
const OUT = path.resolve(
  process.env.ANS_T2_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-t2-")),
);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "probe.log"), "");
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = path.join(OUT, "project");
const AT = "2026-11-05T00:30:00.000Z";
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

// —————————————— 夹具项目（真实磁盘文件；D1 载荷为真实形状的只读投影） ——————————————
const FILES = {
  "docs/workflow.md": "# workflow\n",
  "角色卡/impl/role-card.md": "# role card impl\n",
  "角色卡/impl/boundary.yaml": "role: impl\nentries:\n  - kind: directory\n    path: src/\n    purpose: impl\n",
  "docs/proposals/demo-proposal-v1.md": "version: 1\n# proposal v1\n",
  "docs/proposals/demo-proposal-v2.md": "version: 2\n# proposal v2\n",
  "docs/scheduling/demo-team-v2.md": "version: 2\n# team v2\n",
};
const H = {};
for (const [rel, text] of Object.entries(FILES)) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
  H[rel] = sha(text);
}

const W = H["docs/workflow.md"];
const R = H["角色卡/impl/role-card.md"];
const B = H["角色卡/impl/boundary.yaml"];
const P1 = H["docs/proposals/demo-proposal-v1.md"];
const P2 = H["docs/proposals/demo-proposal-v2.md"];
const T2 = H["docs/scheduling/demo-team-v2.md"];
const W2 = sha("# workflow v2 (confirmed)\n");

const vcaPending = {
  applicationId: "vc-2",
  kind: "detail-amendment",
  initiatorRoleId: "rapporteur",
  flowId: "demo",
  status: "submitted",
  summary: "补充合同交付细节",
  bootstrap: false,
  baseTrunkVersion: 2,
  targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v2.md", action: "modify", version: 2, toSha256: P2 }],
  submittedAt: AT,
  at: AT,
};
const vcaApplied = {
  applicationId: "vc-1",
  kind: "version-upgrade",
  initiatorRoleId: "product",
  flowId: "demo",
  status: "applied",
  summary: "产品版本升级：契约 v2",
  bootstrap: false,
  baseTrunkVersion: 1,
  targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v2.md", action: "modify", version: 2, toSha256: P2 }],
  submittedAt: AT,
  decidedAt: AT,
  decisionId: "decision-op-1",
  resultTrunkVersion: 2,
  at: AT,
};
const stableRecord = {
  requestId: "sw-1",
  roleId: "convener",
  path: "docs/workflow.md",
  kind: "workflow",
  baseSha256: W,
  targetSha256: W2,
  status: "written",
  decisionId: "decision-op-1",
  writtenAt: AT,
  at: AT,
};
const refactorRow = {
  requestId: "rf-1",
  flowId: "demo",
  initiatedBy: "convener",
  title: "模块内重复代码清理",
  reason: "降低维护成本（不改变契约/边界）",
  scope: { modules: ["impl"], paths: ["src/"], roles: ["impl"] },
  status: "requested",
  managedBy: "application-scheduler",
  at: AT,
};
const freezeRows = [
  { path: "docs/proposals/demo-proposal-v1.md", version: 1, sha256: P1, frozen: true, reason: "migrated-legacy", migrationMark: "migrated-legacy", at: AT },
  { path: "docs/proposals/demo-proposal-v2.md", version: 2, sha256: P2, frozen: true, reason: "version-upgrade-approved", at: AT },
  { path: "docs/scheduling/demo-team-v2.md", version: 2, sha256: T2, frozen: true, reason: "detail-item-applied", at: AT },
];

const trunkPayload = {
  version: 1,
  ok: true,
  projectRoot: ROOT,
  generatedAt: AT,
  availability: "frozen",
  trunkVersion: 2,
  source: "upgrade",
  runId: "run-20261105-demo-a1b2c3d4",
  flowId: "demo",
  digest: sha("trunk-digest"),
  derived: false,
  stable: {
    workflow: { kind: "workflow", path: "docs/workflow.md", sha256: W2 },
    roleCards: { impl: { kind: "role-card", path: "角色卡/impl/role-card.md", sha256: R } },
    boundaries: { impl: { kind: "boundary", path: "角色卡/impl/boundary.yaml", sha256: B } },
  },
  amendment: null,
  journal: { journalId: "j-vc-1", phase: "committed", result: "committed" },
  pendingReattach: [],
  issues: [],
  freezes: { count: freezeRows.length, items: [], cacheHealth: "ok" },
  pendingVersionChanges: { count: 1, items: [vcaPending] },
  refactors: { count: 1, items: [refactorRow] },
  disables: { versionChange: null, stableWrite: null, trunkUpgrade: null, refactor: null },
};

// —————————————— 日志 / 报告 / 截图 ——————————————
const LOG = [];
const CHECKS = [];
const SHOTS = [];
function log(line) {
  LOG.push(String(line));
  fs.appendFileSync(path.join(OUT, "probe.log"), String(line) + "\n");
}
function check(name, ok, detail) {
  CHECKS.push({ name, ok: ok === true, ...(detail !== undefined ? { detail } : {}) });
  log((ok === true ? "PASS " : "FAIL ") + name + (detail !== undefined ? " :: " + JSON.stringify(detail) : {}));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// —————————————— 窗口 / IPC ——————————————
let win;
const initialLocale = process.env.ANS_T2_LOCALE === "en-US" ? "en-US" : "zh-CN";
const scenario = process.env.ANS_T2_SCENARIO || "full";
let locale = initialLocale;
let upgradeRequested = null;
let upgradeConfirmed = null;
const operatorResponses = [];

function listing() {
  return {
    projectRoot: ROOT,
    primaryRoleId: "impl",
    hasRoles: true,
    warnings: [],
    governanceModel: "trio",
    roles: [
      {
        roleId: "impl",
        cardPath: path.join(ROOT, "角色卡", "impl", "role-card.md"),
        cardText: "# role card impl\n",
        boundaryPath: path.join(ROOT, "角色卡", "impl", "boundary.yaml"),
        boundary: { entries: [] },
        governanceFunction: "schedule",
        changelog: null,
        docs: [],
      },
    ],
  };
}

const handlers = {
  "app:renderer-diagnostic": () => ({ ok: true }),
  "app:recovery-state": () => ({}),
  "app:recovery-ready": () => ({ ok: true }),
  "app:reload-interface": async () => ({ ok: true }),
  "app:list-project": () => listing(),
  "app:pick-project": () => ROOT,
  "app:attach-image": () => ({ ok: false, error: "t2: disabled" }),
  "app:pick-image": () => ({ ok: false, error: "t2: disabled" }),
  "window:minimize": () => ({ ok: true }),
  "window:toggle-maximize": () => ({ ok: true }),
  "window:close": () => ({ ok: true }),
  "window:is-maximized": () => false,
  "preferences:get": () => ({ version: 1, locale, supported: ["zh-CN", "en-US"] }),
  "preferences:set-locale": (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, locale, error: "invalid-sender" };
    const next = input && typeof input.locale === "string" ? input.locale : "";
    if (!["zh-CN", "en-US"].includes(next)) return { ok: false, locale, error: "invalid-locale" };
    locale = next;
    if (!win.isDestroyed()) win.webContents.send("preferences:locale-changed", { locale });
    return { ok: true, locale };
  },
  "session:open": () => ({ ok: true, resumed: true, contextSource: "resumed", runtime: "pi", projectRoot: ROOT, profileRevision: 0 }),
  "session:live": () => ["impl"],
  "session:stop": () => ({ ok: true }),
  "session:history-get": (_e, input) => ({ ...input, rows: [], error: null, skipped: 0 }),
  "session:live-views": () => [{ projectRoot: ROOT, roleId: "impl", runtime: "pi" }],
  "session:abort": () => ({ ok: true, supported: true }),
  "session:send": () => ({ ok: true }),
  "session:withdraw": () => ({ ok: false, error: "t2: disabled" }),
  "session:role-states": () => ({ ok: true }),
  "session:get-persistence": (_e, input) => ({ ok: true, version: 1, scope: { projectRoot: ROOT, roleId: input.roleId, runtime: input.runtime }, value: { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true } }),
  "session:operator-response": (_e, input) => {
    operatorResponses.push(input);
    return { ok: true };
  },
  "session:operator-judge": () => ({ ok: true }),
  "network:get-state": () => ({ online: true, source: "main-net", at: Date.now(), stableForMs: 0, reason: "probe" }),
  "network:renderer-state": () => ({ ok: true }),
  "background-tasks:list": () => ({ ok: true, unavailable: true, tasks: [] }),
  "background-tasks:read": () => ({ ok: false, error: "t2: disabled" }),
  "background-tasks:stop": () => ({ ok: false, error: "t2: disabled" }),
  "tasks:list": () => ({ ok: true, tasks: [], errors: [] }),
  "tasks:close": () => ({ ok: false, error: "t2: disabled" }),
  "tasks:redispatch": () => ({ ok: false, error: "t2: disabled" }),
  "tasks:restore": () => ({ ok: false, error: "t2: disabled" }),
  "project-state:get": () => ({ version: 1, projectRoot: ROOT, state: null, errors: [] }),
  "roles:activity-log": () => ({ ok: true, rows: [] }),
  "roles:terminate": () => ({ ok: false, error: "t2: disabled" }),
  "run:change-request": () => ({ ok: false, error: "t2: low-level run-change not used in T2" }),
  "shell:judge-pause": () => ({ ok: true, paused: false }),
  "app:open-external": () => ({ ok: true }),
  "directive:list": () => ({ version: 1, directivesEnabled: false, projectRoot: ROOT, approval: [], decision: [], ledgerErrors: 0 }),
  "directive:revoke": () => ({ ok: false, error: "t2: disabled" }),
  "directive:confirm-response": () => ({ ok: false, error: "t2: disabled" }),
  "runtime-config:get": (_e, input) => ({ runtime: input.runtime, label: input.runtime, path: path.join(ROOT, ".env"), revision: 0, application: "next-session", missingKeys: [], fields: [] }),
  "runtime-config:save": () => ({ ok: true, revision: 1 }),
  "pi-config:get": () => ({ path: path.join(ROOT, ".env"), fields: [] }),
  "pi-config:save": () => ({ ok: true, appliedKeys: [] }),
  "shell:confirm-response": () => ({ ok: true }),
  "shell:judge-get": () => ({ version: 1, ok: true, enabled: false }),
  "shell:judge-set": () => ({ version: 1, ok: true, enabled: false }),
  "decision:judge-get": () => ({ version: 1, ok: true, enabled: false }),
  "decision:judge-set": () => ({ version: 1, ok: true, enabled: false }),
  "report:get-save-state": (_e, input) => ({ ok: true, version: 1, scope: {}, value: { state: "saved", reportId: input.reportId, retryAvailable: false } }),
  "report:retry-save": () => ({ ok: false, error: "t2: disabled" }),
  "delivery:get-receipt": () => ({ ok: true, version: 1, scope: {}, value: { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false } }),
  "delivery:retry-history-save": () => ({ ok: false, error: "t2: disabled" }),
  "project:document-read": () => ({ ok: false, version: 1, documentId: "", projectViewId: "", code: "t2-disabled", message: "t2: disabled" }),
  // —— trunk-amendment D1 冻结 IPC（只读 + 受控确认；无 submit/refactor:request）——
  "version-change:list": () => ({ ok: true, items: [vcaPending, vcaApplied] }),
  "version-change:present": () => ({ ok: true, status: "pending" }),
  "stable-write:list": () => ({ ok: true, items: [stableRecord] }),
  "refactor:list": () => ({ ok: true, items: [refactorRow] }),
  "doc-freeze:list": () => ({ ok: true, freezes: freezeRows, cacheHealth: "ok" }),
  "trunk:list": () => ({ ok: true, trunks: [{ trunkVersion: 2, source: "upgrade", current: true }] }),
  "trunk:upgrade-request": (_e, input) => {
    upgradeRequested = input;
    return {
      ok: true,
      previewId: "tup-1",
      preview: {
        previewId: "tup-1",
        reason: input.reason,
        scope: input.scope ?? [],
        trunkVersion: 2,
        changes: [{ kind: "workflow", path: "docs/workflow.md", oldSha: W, newSha: W2 }],
        expiresAt: "2026-11-05T01:00:00.000Z",
      },
    };
  },
  "trunk:upgrade-confirm": (_e, input) => {
    upgradeConfirmed = input;
    return { ok: true, status: "applied", trunkVersion: 3 };
  },
  "trunk:refreeze-request": () => ({ ok: true, status: "refrozen", trunkVersion: 2, changed: ["workflow"] }),
  "trunk:abandon-upgrade": () => ({ ok: true, status: "abandoned", trunkVersion: 2 }),
  "trunk:recover-request": () => ({ ok: true, status: "recovered", trunkVersion: 3 }),
};

function registerHandlers() {
  for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") log("[renderer-console] " + event.message);
  });
}

const js = (code) =>
  win.webContents.executeJavaScript(code.includes("await ") ? "(async()=>{" + code + "})()" : code);

async function waitFor(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return true;
    } catch {
      /* page transitions */
    }
    await sleep(50);
  }
  throw new Error("timeout waiting for " + label);
}

async function shot(name) {
  const image = await win.webContents.capturePage();
  const file = path.join(OUT, name + ".png");
  fs.writeFileSync(file, image.toPNG());
  const size = win.getContentSize();
  SHOTS.push({ name, file, sha256: sha256File(file), bytes: fs.statSync(file).size, window: { width: size[0], height: size[1] } });
  log("SHOT " + name + " " + file + " sha256=" + SHOTS[SHOTS.length - 1].sha256 + " window=" + size.join("x"));
}

async function loadUi() {
  await waitFor(async () => (await js("typeof window.__ansRenderer === 'object'")) === true, "renderer driver");
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('impl')`);
  await sleep(200);
  win.webContents.send("trunk:state", trunkPayload);
  await waitFor(async () => (await js("document.querySelector('#version-change') && !document.querySelector('#version-change').disabled")) === true, "version-change entry enabled");
}

function dialogState() {
  return js(`(()=>{const d=document.querySelector('#decision-dialog');if(!d)return null;
    const acks=[...d.querySelectorAll('.dd-acks input[type=checkbox]')].map(x=>({checked:x.checked,label:(x.closest('label')?.textContent||'').trim()}));
    return {title:(d.querySelector('.dd-title')?.textContent||'').trim(),
      source:(d.querySelector('.dd-source')?.textContent||'').trim(),
      preview:(d.querySelector('.dd-preview')?.textContent||'').trim().slice(0,1200),
      options:[...d.querySelectorAll('.dd-options .dd-option-label')].map(x=>(x.textContent||'').trim()),
      acks, hasConfirm:!!d.querySelector('.dd-confirm'),hasSubmit:!!d.querySelector('.dd-submit')};})()`);
}
async function waitDialog(label) {
  await waitFor(async () => (await dialogState()) !== null, label);
  return dialogState();
}

async function main() {
  if (!fs.existsSync(RENDERER_ENTRY)) throw new Error("renderer 构建产物缺失（先 npm run build:renderer）：" + RENDERER_ENTRY);
  log("ELECTRON=" + process.versions.electron + " NODE=" + process.versions.node + " CHROME=" + process.versions.chrome);
  log("ROOT=" + ROOT + " OUT=" + OUT);

  await app.whenReady();
  app.on("window-all-closed", () => log("window-all-closed (probe keeps running)"));
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    frame: false,
    show: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  registerHandlers();
  await win.loadFile(RENDERER_ENTRY);
  await loadUi();
  if (initialLocale === "en-US") {
    await js(`document.querySelector('#version-change').click()`);
    await waitFor(async () => (await js("!!document.querySelector('.vc-panel[data-segment=\"version-change\"]')")) === true, "en version-change panel");
    await sleep(300);
    const enText = await js(`(()=>{const p=document.querySelector('.vc-panel[data-segment="version-change"]');return (p?.textContent||'').replace(/\s+/g,' ').trim();})()`);
    check("en-US 面板展示版本变更文案", /Version changes|Version upgrade|Amendment/i.test(enText), enText.slice(0, 700));
    await shot("09-version-change-panel-en");
    fs.writeFileSync(path.join(OUT, "report-en.json"), JSON.stringify({ at: new Date().toISOString(), locale, checks: CHECKS, screenshots: SHOTS }, null, 2) + "\n", "utf8");
    const failedEn = CHECKS.filter((c) => !c.ok);
    log("SUMMARY(en) checks=" + CHECKS.length + " failed=" + failedEn.length + " shots=" + SHOTS.length);
    app.exit(failedEn.length === 0 ? 0 : 1);
    return;
  }
  if (scenario === "vca-card") {
    const vcaCardOnly = buildVersionChangeCard({ record: vcaPending });
    check("VCA 卡组装成功", vcaCardOnly !== undefined);
    win.webContents.send("session:operator-request", {
      id: "op-vca-1",
      roleId: "impl",
      projectRoot: ROOT,
      request: vcaCardOnly.request,
      anchorKey: "t2-vca-card",
    });
    const vcaDialogOnly = await waitDialog("VCA dialog");
    check("VCA 卡显示 kind/发起者/target/hash/语义说明",
      /修正案/.test(vcaDialogOnly.title) &&
        /rapporteur|策划/.test(vcaDialogOnly.preview) &&
        /demo-proposal-v2\.md/.test(vcaDialogOnly.preview) &&
        vcaDialogOnly.preview.includes(P2.slice(0, 12)) &&
        /逐项确认|内容门槛/.test(vcaDialogOnly.preview) &&
        vcaDialogOnly.options.length === 2,
      vcaDialogOnly);
    await shot("08-vca-approval-card");
    fs.writeFileSync(path.join(OUT, "report-vca.json"), JSON.stringify({ at: new Date().toISOString(), locale, scenario, checks: CHECKS, screenshots: SHOTS }, null, 2), "utf8");
    const failedVca = CHECKS.filter((c) => !c.ok);
    log("SUMMARY(vca) checks=" + CHECKS.length + " failed=" + failedVca.length + " shots=" + SHOTS.length);
    app.exit(failedVca.length === 0 ? 0 : 1);
    return;
  }
  if (scenario === "item-card") {
    const itemRecordOnly = { ...vcaPending };
    const itemOnly = { itemId: "it-1", kind: "contract", change: "modify", from: "docs/proposals/demo-proposal-v1.md", to: "docs/proposals/demo-proposal-v2.md", fromSha256: P1, toSha256: P2 };
    const itemCardOnly = buildAmendmentItemCard({
      record: itemRecordOnly,
      item: itemOnly,
      index: 0,
      total: 2,
      acknowledgments: [{ id: "boundary-expansion-0", label: "边界扩大：角色卡/impl/boundary.yaml", required: true }],
    });
    check("detail 逐项卡组装成功（item-apply/keep/cancel + ack）", itemCardOnly !== undefined);
    win.webContents.send("session:operator-request", {
      id: "op-item-1",
      roleId: "impl",
      projectRoot: ROOT,
      request: itemCardOnly.request,
      anchorKey: "t2-amendment-item",
    });
    const itemDialogOnly = await waitDialog("amendment item dialog");
    check("逐项卡显示 item 选择与必选 acknowledgment",
      itemDialogOnly.options.length === 3 && itemDialogOnly.acks.length === 1 && /boundary-expansion|边界扩大/.test(JSON.stringify(itemDialogOnly.acks)), itemDialogOnly);
    await shot("07-amendment-item-card");
    fs.writeFileSync(path.join(OUT, "report-item.json"), JSON.stringify({ at: new Date().toISOString(), locale, scenario, checks: CHECKS, screenshots: SHOTS }, null, 2), "utf8");
    const failedItem = CHECKS.filter((c) => !c.ok);
    log("SUMMARY(item) checks=" + CHECKS.length + " failed=" + failedItem.length + " shots=" + SHOTS.length);
    app.exit(failedItem.length === 0 ? 0 : 1);
    return;
  }

  if (scenario === "boundary-stable") {
    // AC-13（D2/S7）：stable boundary 预览扩大 → 横幅 + required acknowledgments；未勾选不确认/不签发。
    const integration = createVersionChangeIntegration({ projectRoot: ROOT, now: () => new Date() });
    const fromPath = "角色卡/impl/boundary.yaml";
    const expandedYaml = [
      "role: impl",
      "entries:",
      "  - kind: directory",
      "    path: src/",
      "    purpose: impl",
      "  - kind: directory",
      "    path: test/",
      "    purpose: expanded",
      "",
    ].join("\n");
    const detected = await integration.trunk.detectStableBoundaryExpansion({ projectRoot: ROOT, roleId: "impl", fromPath, toYamlText: expandedYaml });
    check("S7：boundary 预览扩大检测（条目逐条）", detected.expanded === true && detected.expansions.some((entry) => entry.includes("test")), detected);
    const risk = buildStableBoundaryRisk(detected.expansions);
    check("D2：扩大风险横幅 + required acknowledgments",
      risk.expanded === true && risk.acknowledgments.length === detected.expansions.length && risk.acknowledgments.every((entry) => entry.required === true) && risk.banner.includes("test"),
      risk);
    const unexpanded = await integration.trunk.detectStableBoundaryExpansion({
      projectRoot: ROOT,
      roleId: "impl",
      fromPath,
      toYamlText: ["role: impl", "entries:", "  - kind: directory", "    path: src/", "    purpose: impl", ""].join("\n"),
    });
    const noRisk = buildStableBoundaryRisk(unexpanded.expansions);
    check("D2：收窄/无变化 ⇒ 无横幅", unexpanded.expanded === false && noRisk.expanded === false && noRisk.banner === "", unexpanded);
    const unparseable = await integration.trunk.detectStableBoundaryExpansion({ projectRoot: ROOT, roleId: "impl", fromPath, toYamlText: "not-a-yaml: [" });
    const unparseableRisk = buildStableBoundaryRisk(unparseable.expansions);
    check("D2：不可解析预览 ⇒ fail-closed（unparseable，不呈现卡）", unparseable.expanded === true && unparseableRisk.unparseable === true, unparseable);

    const request = {
      kind: "confirm",
      title: "边界写入确认",
      cardKind: "appointment-write",
      application: true,
      sourceRoleId: "nominator",
      flowId: "demo",
      paths: [fromPath],
      preview: `${risk.banner}

${fromPath}
${expandedYaml}`,
      acknowledgments: risk.acknowledgments,
    };
    win.webContents.send("session:operator-request", {
      id: "op-boundary-1",
      roleId: "impl",
      projectRoot: ROOT,
      request,
      anchorKey: "t2-boundary-stable",
    });
    const boundaryDialog = await waitDialog("boundary appointment-write dialog");
    check("边界确认卡：横幅/逐条扩大项/必选勾选可见",
      /test\//.test(boundaryDialog.preview) && boundaryDialog.acks.length === detected.expansions.length && boundaryDialog.hasConfirm === true,
      boundaryDialog);
    const beforeAck = await js(`(()=>{const b=document.querySelector('#decision-dialog .dd-confirm');return b?{disabled:b.disabled,text:(b.textContent||'').trim()}:null})()`);
    check("AC-13：未勾选必选项 ⇒ 确认按钮禁用（不签发许可）", beforeAck !== null && beforeAck.disabled === true, beforeAck);
    await shot("10-boundary-expansion-card");
    // 真实客户通道契约核验：confirm 回执必须携带 required acknowledgments（否则 session 不签发许可）。
    const pushed = [];
    const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "customer" });
    const pending = channel.customerInput(request, { roleId: "application", governanceModel: "trio" });
    await waitFor(() => pushed.length > 0, "boundary channel present");
    const deniedConfirm = channel.respond({ id: pushed[0].id, decision: { kind: "confirm", confirmed: true } });
    check("AC-13：缺 required acknowledgments 的 confirm 被拒收（pending 保留）", deniedConfirm.ok === false, deniedConfirm);
    const requiredIds = risk.acknowledgments.map((entry) => entry.id);
    const acceptedConfirm = channel.respond({ id: pushed[0].id, decision: { kind: "confirm", confirmed: true, acknowledged: requiredIds } });
    check("AC-13：勾选齐全后 confirm 受理", acceptedConfirm.ok === true, acceptedConfirm);
    const outcome = await pending;
    const acknowledgments = outcome?.outcome === "answered" && Array.isArray(outcome.acknowledged) ? outcome.acknowledged : [];
    check("AC-13：confirm 回执携带 required acknowledgments（供 session 签发许可）",
      acknowledgments.length === risk.acknowledgments.length && risk.acknowledgments.every((entry) => acknowledgments.includes(entry.id)),
      { acknowledgments, required: risk.acknowledgments.map((entry) => entry.id), outcome });
    fs.writeFileSync(path.join(OUT, "report-boundary.json"), JSON.stringify({ at: new Date().toISOString(), locale, scenario, checks: CHECKS, screenshots: SHOTS }, null, 2), "utf8");
    const failedBoundary = CHECKS.filter((c) => !c.ok);
    log("SUMMARY(boundary) checks=" + CHECKS.length + " failed=" + failedBoundary.length + " shots=" + SHOTS.length);
    app.exit(failedBoundary.length === 0 ? 0 : 1);
    return;
  }
  if (scenario === "ac17") {
    // AC-17（D2）：VCA 在途时冻结冲突只发系统行、不弹 run-change；显式入口保留。
    // 本场景展示 UI 结果（系统行 + 无决策卡）；抑制逻辑由 D2 桌面集成测试 run-change-trigger 覆盖（T3 通过）。
    win.webContents.send("session:event", {
      roleId: "impl",
      projectRoot: ROOT,
      runtime: "pi",
      event: {
        kind: "message",
        summary: "[主干与版本变更] 版本变更 · vc-1 (待确认) — 提交在发起角色会话中经能力工具完成；本面板只显示状态与入口说明。",
        detail: { source: "delivery-note" },
      },
    });
    await sleep(500);
    const body = await js(`document.body.textContent || ""`);
    check("AC-17：VCA 在途系统行可见且含 vc-1", /vc-1/.test(body) && /版本变更/.test(body), body.slice(0, 800));
    check("AC-17：未自动弹 run-change 决策卡", (await js("!document.querySelector('#decision-dialog')")) === true);
    check("AC-17：显式低层入口保留（版本变更/主干升级）",
      (await js("!!document.querySelector('#version-change') && !!document.querySelector('#trunk-upgrade')")) === true);
    await shot("11-ac17-vca-in-flight-system-line");
    fs.writeFileSync(path.join(OUT, "report-ac17.json"), JSON.stringify({ at: new Date().toISOString(), locale, scenario, checks: CHECKS, screenshots: SHOTS }, null, 2), "utf8");
    const failedAc17 = CHECKS.filter((c) => !c.ok);
    log("SUMMARY(ac17) checks=" + CHECKS.length + " failed=" + failedAc17.length + " shots=" + SHOTS.length);
    app.exit(failedAc17.length === 0 ? 0 : 1);
    return;
  }

  // —— 1. 客户侧 header：无「重构」按钮 / 无 #run-change；版本变更 + 收窄主干升级 ——
  const header = await js(`(()=>{
    const buttons=[...document.querySelectorAll('header button, .chat-header button')].map(b=>({id:b.id,text:(b.textContent||'').trim(),aria:b.getAttribute('aria-label')||''}));
    return {hasRunChange:!!document.querySelector('#run-change'), buttons,
      bodyHasRefactorButton:[...document.querySelectorAll('button')].some(b=>/^重构$/.test((b.textContent||'').trim()))};
  })()`);
  check("客户侧无 #run-change 按钮", header.hasRunChange === false, header);
  check("客户侧无「重构」按钮", header.bodyHasRefactorButton === false, header);
  check("存在「版本变更」入口", header.buttons.some((b) => b.id === "version-change" && /版本变更/.test(b.text)), header.buttons);
  check("存在收窄「主干升级」入口", header.buttons.some((b) => b.id === "trunk-upgrade" && /主干升级/.test(b.text)), header.buttons);
  await shot("01-customer-header");

  // —— 2. 版本变更面板 ——
  await js(`document.querySelector('#version-change').click()`);
  await waitFor(async () => (await js("!!document.querySelector('.vc-panel[data-segment=\"version-change\"]')")) === true, "version-change panel");
  await sleep(300);
  const vcPanel = await js(`(()=>{const p=document.querySelector('.vc-panel[data-segment="version-change"]');return {text:(p?.textContent||'').replace(/\\s+/g,' ').trim()};})()`);
  check("版本变更面板显示待批修正案（kind/发起者/目标/hash/语义）",
    /修正案/.test(vcPanel.text) && /rapporteur|策划/.test(vcPanel.text) && /demo-proposal-v2\.md/.test(vcPanel.text) && /待确认/.test(vcPanel.text) && /逐项确认|内容门槛/.test(vcPanel.text), vcPanel.text.slice(0, 600));
  check("版本变更面板显示历史版本升级与结果主干", /版本升级/.test(vcPanel.text) && /已生效/.test(vcPanel.text) && /t2|主干.*2/.test(vcPanel.text), vcPanel.text.slice(0, 600));
  await shot("02-version-change-panel");

  // —— 3. 主干面板：F15 三类 stable 快照 + 续接记录 + 无 drift ——
  await js(`document.querySelector('#trunk-seg-trunk').click()`);
  await waitFor(async () => (await js("!!document.querySelector('.vc-panel[data-segment=\"trunk\"]')")) === true, "trunk panel");
  await sleep(300);
  const trunkPanel = await js(`(()=>{const p=document.querySelector('.vc-panel[data-segment="trunk"]');return {text:(p?.textContent||'').replace(/\\s+/g,' ').trim()};})()`);
  check("F15：三类 stable 快照齐全（workflow/角色卡/边界）",
    /workflow/i.test(trunkPanel.text) && /角色卡/.test(trunkPanel.text) && /边界/.test(trunkPanel.text), trunkPanel.text.slice(0, 900));
  check("stable 确认/续接记录含路径/decisionId/old→new",
    /docs\/workflow\.md/.test(trunkPanel.text) && /decision-op-1/.test(trunkPanel.text) && new RegExp(W.slice(0, 8) + ".*" + W2.slice(0, 8)).test(trunkPanel.text), trunkPanel.text.slice(0, 900));
  check("无 drift 状态行（仅展示「不再显示漂移」的说明文案）",
    !/带漂移|漂移中|drift state/i.test(trunkPanel.text) && /不再显示漂移/.test(trunkPanel.text), trunkPanel.text.slice(0, 900));
  check("恢复区只显示说明，无本地重建/解冻按钮", /恢复/.test(trunkPanel.text) && !/重建|解冻/.test(trunkPanel.text), trunkPanel.text.slice(0, 900));
  await shot("03-trunk-panel-stable");

  // —— 4. 重构审计（客户只读） ——
  await js(`document.querySelector('#trunk-seg-refactor').click()`);
  await waitFor(async () => (await js("!!document.querySelector('.vc-panel[data-segment=\"refactor\"]')")) === true, "refactor panel");
  await sleep(300);
  const refactorPanel = await js(`(()=>{const p=document.querySelector('.vc-panel[data-segment="refactor"]');
    return {text:(p?.textContent||'').replace(/\\s+/g,' ').trim(),
      buttons:[...p.querySelectorAll('button')].map(b=>(b.textContent||'').trim()),
      hasInput:!!p.querySelector('input,textarea,select')};})()`);
  check("重构审计只读（无批准/拒绝/关闭按钮、无申请表单）",
    refactorPanel.buttons.every((label) => !/批准|拒绝|关闭|提交/.test(label)) && refactorPanel.hasInput === false, refactorPanel);
  // managedBy=application-scheduler 是账本/载荷事实（T1/桌面测试断言）；面板按 U1 只显示只读审计字段。
  check("重构审计显示标题/范围/只读状态", /模块内重复代码清理/.test(refactorPanel.text) && /src\//.test(refactorPanel.text) && /已申请/.test(refactorPanel.text), refactorPanel.text.slice(0, 700));
  await shot("04-refactor-audit");

  // —— 5. 主干升级（紧急/恢复 + 高危勾选 + 二次确认） ——
  await js(`document.querySelector('#trunk-seg-trunk').click()`);
  await sleep(200);
  await js(`(()=>{const el=document.getElementById('trunk-upgrade-reason');const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(el,'manifest 紧急恢复（T2 探针）');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(200);
  const submitClicked = await js(`(()=>{const s=document.querySelector('#trunk-emergency button.vc-action');if(!s)return false;s.click();return true;})()`);
  check("主干升级请求按钮可点击（应急/恢复）", submitClicked === true);
  await waitDialog("trunk upgrade preview").catch(() => null);
  await waitFor(async () => (await js("!!document.querySelector('#trunk-upgrade-ack')")) === true, "upgrade preview");
  const previewText = await js(`(()=>{const s=document.querySelector('#trunk-emergency');return (s?.textContent||'').replace(/\\s+/g,' ').trim();})()`);
  check("升级预览显示 stable 差异 old→new", new RegExp(W.slice(0, 8) + ".*" + W2.slice(0, 8)).test(previewText), previewText.slice(0, 800));
  check("升级需高危勾选（acknowledged 未勾选时确认禁用）",
    (await js("!!document.querySelector('#trunk-upgrade-ack') && document.querySelector('#trunk-emergency .vc-preview button.vc-action[disabled]') !== null")) === true, previewText.slice(0, 800));
  await js(`document.getElementById('trunk-emergency').scrollIntoView({block:'center'})`);
  await sleep(200);
  await shot("05-trunk-upgrade-preview");
  await js(`document.querySelector('#trunk-upgrade-ack').click()`);
  await sleep(100);
  await js(`(()=>{const s=document.querySelector('#trunk-emergency .vc-preview .vc-row-actions button.vc-action:not([disabled])');if(s)s.click();})()`);
  await sleep(400);
  check("二次确认只对同一 previewId 提交 acknowledged:true",
    upgradeConfirmed !== null && upgradeConfirmed.previewId === "tup-1" && upgradeConfirmed.acknowledged === true,
    upgradeConfirmed);
  check("升级请求只允许 emergency/recovery", upgradeRequested !== null && ["emergency", "recovery"].includes(upgradeRequested.reason), upgradeRequested);
  await shot("06-trunk-upgrade-confirmed");

  // —— 收尾 ——
  const report = {
    task: "2026-11-04-trunk-amendment-model",
    node: "T2",
    at: new Date().toISOString(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    command: "node_modules/.bin/electron test/测试/trunk-amendment-electron-probe.mjs",
    out: OUT,
    window: { width: 1360, height: 860, useContentSize: true },
    checks: CHECKS,
    screenshots: SHOTS,
    operatorResponses,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  const failed = CHECKS.filter((c) => !c.ok);
  log("SUMMARY checks=" + CHECKS.length + " failed=" + failed.length + " shots=" + SHOTS.length);
  app.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  log("FATAL " + (error instanceof Error ? error.stack ?? error.message : String(error)));
  try {
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ fatal: String(error), checks: CHECKS, screenshots: SHOTS }, null, 2) + "\n");
  } catch {
    /* ignore */
  }
  app.exit(1);
});
