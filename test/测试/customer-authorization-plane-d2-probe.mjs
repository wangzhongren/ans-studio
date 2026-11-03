#!/usr/bin/env node
/**
 * D2 test-only probe (evidence only; test role; not a product/test source file).
 *
 * Real Electron run of the customer-authorization-plane on the current candidate:
 *   real preload (app/preload.cjs) + real renderer bundle (app/renderer/dist) + real
 *   DesktopInterface (app/desktop/interface.ts) + real directive controller
 *   (app/desktop/directive-input.ts -> real B1 Pipeline ledger) + real customer-input
 *   channel decision consumer (app/desktop/customer-input.ts).
 *
 * Covers the D2 matrix scenarios requested by dispatch:
 *   S1  @审批 allow shell once -> confirm dialog fields -> confirm -> receipt system row
 *   S2  high-risk forever -> confirm disabled until acknowledged -> confirm
 *   S3  @决策 选推荐项 until=session -> decision card auto-selected; result row
 *   S4  conflicting decision directives -> customer card presented + directiveNotice row
 *   S4b no-match decision directive -> customer card presented + directiveNotice row;
 *       decision directives revoked through the input form (receipt path)
 *   S5  directive panel (approval/decision logical panels) -> revoke -> receipt (gap checked honestly)
 *   S6  project switch cancels pending directive dialog (directiveCancelled)
 *   S7  AC-22 shell card pending + card-footer directive entry -> dialog opens, card stays pending
 *
 * Run from repo root:
 *   ./node_modules/.bin/electron test/测试/customer-authorization-plane-d2-probe.mjs
 * Optional env ANS_D2_PROBE_OUT=<dir> (default: this task's evidence probe-run dir).
 *
 * Uses a fresh userData dir under OUT and a fresh fixture project under OUT (no customer data).
 * No recording/screen capture video is produced; PNG stills only.
 */
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT = process.env.ANS_D2_PROBE_OUT
  ? path.resolve(process.env.ANS_D2_PROBE_OUT)
  : path.join(REPO, "角色卡", "测试", "docs", "change", "2026-11-03_customer-authorization-plane-D2-evidence", "probe-run-2");
const USER_DATA = path.join(OUT, "userData");
const PROJECT = path.join(OUT, "project");
const PROJECT2 = path.join(OUT, "project-2");
const RENDERER_ENTRY = path.join(REPO, "app", "renderer", "dist", "index.html");
const PRELOAD = path.join(REPO, "app", "preload.cjs");
const LEDGER_REL = [".ans", "state", "customer-directives.jsonl"];

const report = {
  probe: "customer-authorization-plane-d2",
  startedAt: new Date().toISOString(),
  repo: REPO,
  out: OUT,
  userData: USER_DATA,
  project: PROJECT,
  project2: PROJECT2,
  rendererEntry: RENDERER_ENTRY,
  preload: PRELOAD,
  head: process.env.ANS_D2_HEAD ?? null,
  windowSize: null,
  sessionId: "d2-probe-" + Date.now(),
  checks: [],
  screenshots: [],
  console: [],
  csp: [],
  ledger: null,
  sends: [],
  shellResponses: [],
  failures: 0,
};
let win = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fresh userData before app ready (D2 requirement: probe-run-2/user-data, never C2 probe-run/user-data).
resetDir(OUT);
resetDir(USER_DATA);
app.setPath("userData", USER_DATA);

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail ?? null });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  return value === true;
}

function fatal(message) {
  report.error = message;
  console.error("D2_PROBE_ERROR", message);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } catch {}
  app.exit(9);
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, "角色卡", "A"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "A", "role-card.md"), "# 角色：A\n\nD2 探针夹具角色（不参与产品候选）。\n");
  fs.writeFileSync(path.join(root, "角色卡", "A", "boundary.yaml"), "role: A\nentries: []\n");
}

const govRole = {
  roleId: "chief",
  displayName: "幕僚",
  cardText: "# chief",
  cardPath: "",
  boundary: { entries: [] },
  boundaryPath: "",
  builtIn: true,
  governanceFunction: "chief",
  changelog: null,
  docs: [],
};
const projectRole = (roleId, root) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: "角色卡/" + roleId + "/role-card.md",
  boundary: { entries: [] },
  boundaryPath: "角色卡/" + roleId + "/boundary.yaml",
  changelog: null,
  docs: [],
});
const listingFor = (root) => ({
  projectRoot: root,
  primaryRoleId: "chief",
  hasRoles: true,
  warnings: [],
  governanceModel: "trio",
  roles: [govRole, projectRole("A", root)],
});

const runtimeConfig = (runtime) => ({
  runtime,
  label: runtime,
  path: path.join(OUT, "probe.env"),
  revision: 0,
  application: "next-session",
  missingKeys: [],
  fields: [],
});

// Module handles loaded from the real product sources.
let desktop = null;
let directiveInput = null;
let customerChannel = null;
let projectMod = null;
let pushedOperatorRequests = [];
let currentRoot = PROJECT;
let pushDirectiveState = async () => undefined;

function emitEvents(envelopes) {
  if (win === null || win.isDestroyed()) return;
  win.webContents.send("session:events", envelopes);
}

function emitDirectiveNote(note) {
  if (!note || typeof note.roleId !== "string" || note.roleId === "") return;
  emitEvents([
    {
      roleId: note.roleId,
      projectRoot: note.projectRoot ?? currentRoot,
      runtime: note.runtime ?? "claude",
      event: { kind: "message", summary: note.summary, detail: { source: "delivery-note" } },
    },
  ]);
}

async function start() {
  resetDir(PROJECT);
  resetDir(PROJECT2);
  writeFixture(PROJECT);
  writeFixture(PROJECT2);
  fs.mkdirSync(OUT, { recursive: true });

  const ifaceMod = await import(pathToFileURL(path.join(REPO, "app", "desktop", "interface.ts")).href);
  const directiveMod = await import(pathToFileURL(path.join(REPO, "app", "desktop", "directive-input.ts")).href);
  const ciMod = await import(pathToFileURL(path.join(REPO, "app", "desktop", "customer-input.ts")).href);
  projectMod = await import(pathToFileURL(path.join(REPO, "app", "desktop", "project.ts")).href);

  directiveInput = directiveMod.createDirectiveInputController({
    sessionId: report.sessionId,
    present: (payload) => {
      if (win === null || win.isDestroyed()) throw new Error("窗口已关闭，无法呈现指令确认");
      win.webContents.send("directive:confirm-request", payload);
    },
    emitNotice: (note) => emitDirectiveNote(note),
  });

  customerChannel = ciMod.createCustomerInputChannel({
    presenter: (payload) => {
      pushedOperatorRequests.push(payload);
      if (win !== null && !win.isDestroyed()) win.webContents.send("session:operator-request", payload);
    },
    operatorId: "d2-probe-operator",
    nextId: (() => {
      let n = 0;
      return () => "op-d2-" + ++n;
    })(),
    directive: {
      decisionFacts: (root) => directiveInput.decisionFacts(root),
      applyDecisionDirective: (root, card, hooks) => directiveInput.applyDecisionDirective(root, card, hooks),
      emitResult: (note) => emitDirectiveNote(note),
      emitNotice: (note) => emitDirectiveNote(note),
    },
  });

  desktop = ifaceMod.createDesktopInterface({
    pickDirectory: async () => PROJECT,
    emitEvent: (envelope) => emitEvents([envelope]),
    emitRoleState: (info) => {
      try {
        if (win !== null && !win.isDestroyed()) win.webContents.send("session:role-state", info);
      } catch {}
    },
    listProjectFn: async (root) => listingFor(root),
    buildProjectConfigFn: projectMod.buildProjectConfig,
    loadEffectiveConfig: async ({ fallback }) => ({
      project: fallback,
      source: { kind: "builtin-fallback", path: "", acceptance: projectMod.DESKTOP_RUNTIME_CONSENT, pinPaths: [] },
    }),
    directiveInput,
    envFilePath: path.join(OUT, "probe.env"),
    preferencesPath: path.join(USER_DATA, "ans", "preferences.json"),
    runtimeStatePath: path.join(USER_DATA, "ans", "runtime-selection.json"),
    deliveryQueueStorePath: path.join(USER_DATA, "ans", "delivery-queue.json"),
  });

  pushDirectiveState = async () => {
    try {
      const payload = await directiveInput.state();
      if (payload !== undefined && win !== null && !win.isDestroyed()) {
        win.webContents.send("directive:state", payload);
      }
    } catch (error) {
      console.error("D2_PUSH_STATE_ERROR", String(error && error.message ? error.message : error));
    }
  };

  Menu.setApplicationMenu(null);
}

// —————— IPC: real product paths where applicable, benign stubs elsewhere ——————
function registerIpc() {
  ipcMain.handle("preferences:get", () => ({ version: 1, locale: "zh-CN", supported: ["zh-CN", "en-US"] }));
  ipcMain.handle("preferences:set-locale", (_e, input) => {
    const locale = input && typeof input.locale === "string" ? input.locale : "";
    if (locale !== "zh-CN" && locale !== "en-US") return { ok: false, locale: "zh-CN", error: "invalid-locale" };
    return { ok: true, locale };
  });
  ipcMain.handle("app:recovery-state", () => null);
  ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
  ipcMain.handle("app:reload-interface", () => ({ ok: true }));
  ipcMain.handle("app:renderer-diagnostic", () => ({ ok: true }));
  ipcMain.handle("app:pick-project", () => PROJECT);
  ipcMain.handle("app:open-external", () => ({ ok: true }));
  ipcMain.handle("app:pick-image", () => null);
  ipcMain.handle("app:attach-image", () => ({ ok: false }));
  ipcMain.handle("app:list-project", async (_e, input) => {
    const res = await desktop.listProject(input);
    currentRoot = res.projectRoot;
    directiveInput.setCurrentProject(res.projectRoot);
    void pushDirectiveState();
    return res;
  });
  ipcMain.handle("session:open", (_e, input) => ({
    ok: true,
    resumed: true,
    contextSource: "resumed",
    runtime: input?.runtime,
    projectRoot: input?.projectRoot,
  }));
  ipcMain.handle("session:history-get", (_e, input) => ({
    projectRoot: input?.projectRoot,
    roleId: input?.roleId,
    runtime: input?.runtime,
    rows: [],
    error: null,
    skipped: 0,
  }));
  ipcMain.handle("session:live-views", () => []);
  ipcMain.handle("session:live", () => []);
  ipcMain.handle("session:role-states", () => []);
  ipcMain.handle("session:send", async (_e, input) => {
    const res = await desktop.sendSession(input);
    report.sends.push({ text: input?.text, target: input?.target, res });
    return res;
  });
  ipcMain.handle("session:stop", () => ({ ok: true }));
  ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
  ipcMain.handle("session:withdraw", () => ({ ok: true }));
  ipcMain.handle("session:operator-response", (_e, input) =>
    customerChannel.respond(input && typeof input === "object" ? input : {}),
  );
  ipcMain.handle("shell:confirm-response", (_e, input) => {
    report.shellResponses.push(input);
    return { ok: true };
  });
  ipcMain.handle("recovery:confirm-response", () => ({ ok: true }));
  ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false, paused: false, available: true }));
  ipcMain.handle("shell:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
  ipcMain.handle("shell:judge-pause", () => ({ version: 1, ok: true, paused: false }));
  ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false, available: true }));
  ipcMain.handle("decision:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
  ipcMain.handle("runtime-config:get", (_e, input) => runtimeConfig(input?.runtime ?? "claude"));
  ipcMain.handle("runtime-config:save", () => ({ ok: true }));
  ipcMain.handle("pi-config:get", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("pi-config:save", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("project:document-read", () => ({ ok: false }));
  ipcMain.handle("project-state:get", () => null);
  ipcMain.handle("report:retry-save", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("report:get-save-state", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("delivery:retry-history-save", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("delivery:get-receipt", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("session:get-persistence", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("network:get-state", () => ({ online: true, source: "main", at: Date.now(), stableForMs: 0, reason: "probe" }));
  ipcMain.handle("network:renderer-state", () => ({ ok: true }));
  ipcMain.handle("tasks:list", () => ({ ok: true, tasks: [] }));
  ipcMain.handle("tasks:restore", () => ({ ok: true, restored: 0 }));
  ipcMain.handle("tasks:redispatch", () => ({ ok: false }));
  ipcMain.handle("tasks:close", () => ({ ok: false }));
  ipcMain.handle("roles:activity-log", () => ({ ok: false }));
  ipcMain.handle("roles:terminate", () => ({ ok: false }));
  ipcMain.handle("run:change-request", () => ({ ok: false, error: "probe" }));
  ipcMain.handle("background-tasks:list", () => ({ ok: true, tasks: [], unavailable: true }));
  ipcMain.handle("background-tasks:read", () => ({ ok: false }));
  ipcMain.handle("background-tasks:stop", () => ({ ok: false }));
  ipcMain.handle("window:is-maximized", () => false);
  ipcMain.handle("window:minimize", () => ({ ok: true }));
  ipcMain.handle("window:toggle-maximize", () => ({ ok: true }));
  ipcMain.handle("window:close", () => ({ ok: true }));
  // Directive channels (C1 frozen; real controller).
  ipcMain.handle("directive:confirm-response", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "invalid-sender", expired: true };
    return directiveInput.respond(input);
  });
  ipcMain.handle("directive:list", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "invalid-sender" };
    return directiveInput.list(input);
  });
  ipcMain.handle("directive:revoke", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "invalid-sender" };
    return directiveInput.revoke(input);
  });
}

app.whenReady().then(async () => {
  try {
    await start();
  } catch (error) {
    fatal("start failed: " + String(error && error.stack ? error.stack : error));
    return;
  }
  console.log("D2_PROBE_READY sessionId=" + report.sessionId);
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: true,
    frame: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  registerIpc();
  report.windowSize = win.getContentSize();
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message: String(message ?? "") });
  });
  wc.on("did-finish-load", () => {
    void pushDirectiveState();
  });

  const js = (code) => wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  const waitFor = async (code, timeout = 6000) => {
    const begin = Date.now();
    while (Date.now() - begin < timeout) {
      try {
        if (await js(code)) return true;
      } catch {
        /* page may be mid-navigation; retry */
      }
      await sleep(50);
    }
    return false;
  };
  const setValue = async (selector, text) => {
    await js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await sleep(80);
  };
  const click = async (selector) => {
    const ok = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return false; el.click(); return true; })()`);
    await sleep(150);
    return ok;
  };
  const pane = "#chat .chat-pane[data-role-id=\"A\"]";
  const lastNote = async () =>
    js(`(() => { const rows = [...document.querySelectorAll('${pane} .sys-delivery-note')]; return rows.length ? rows[rows.length - 1].textContent : null; })()`);
  const notesText = async () => js(`[...document.querySelectorAll('${pane} .sys-delivery-note')].map((el) => el.textContent)`);
  const waitNote = async (needle, timeout = 8000) => {
    const begin = Date.now();
    while (Date.now() - begin < timeout) {
      const notes = (await notesText()) || [];
      if (notes.some((text) => typeof text === "string" && text.includes(needle))) return true;
      await sleep(80);
    }
    return false;
  };
  const noteCount = async () => ((await notesText()) || []).length;
  /** Waits for a new delivery-note appended after `startCount`; returns its text or null. */
  const waitNewNote = async (startCount, predicate, timeout = 8000) => {
    const begin = Date.now();
    while (Date.now() - begin < timeout) {
      const notes = (await notesText()) || [];
      if (notes.length > startCount) {
        const added = notes.slice(startCount).filter((text) => typeof text === "string");
        const hit = added.find((text) => predicate(text));
        if (hit !== undefined) return hit;
      }
      await sleep(80);
    }
    return null;
  };
  const receiptId = (text) => {
    const match = typeof text === "string" ? /#(d-\d+)/.exec(text) : null;
    return match ? match[1] : null;
  };
  /** Bounds awaits so a missing auto-answer cannot hang the whole probe. */
  const withTimeout = (promise, ms) =>
    Promise.race([promise, sleep(ms).then(() => null)]);
  const scrollChatBottom = async () => {
    await js(`(() => {
      const pane = document.querySelector('${pane}');
      if (!pane) return false;
      let node = pane;
      while (node) {
        if (node.scrollHeight > node.clientHeight + 4) node.scrollTop = node.scrollHeight;
        node = node.parentElement;
      }
      return true;
    })()`);
    await sleep(200);
  };
  const shot = async (name) => {
    try {
      win.setAlwaysOnTop(true);
    } catch {}
    try {
      wc.invalidate();
    } catch {}
    await sleep(180);
    let buffer = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const image = await wc.capturePage();
        buffer = image.toPNG();
        break;
      } catch {
        await sleep(220);
      }
    }
    try {
      win.setAlwaysOnTop(false);
    } catch {}
    if (buffer === null) {
      report.screenshots.push({ name: name + ".png", error: "capture-failed" });
      check("SHOT_" + name, false, "capture-failed");
      return false;
    }
    fs.writeFileSync(path.join(OUT, name + ".png"), buffer);
    report.screenshots.push({ name: name + ".png", bytes: buffer.length });
    console.log("SHOT " + name + ".png " + buffer.length + "B");
    return true;
  };
  const enterDirective = async (text) => {
    await setValue("#inp-message", text);
    const enabled = await waitFor(`!document.getElementById('btn-send').disabled`, 3000);
    if (!enabled) return false;
    await click("#btn-send");
    return true;
  };
  const confirmDialog = async (expectHighRisk = false) => {
    if (expectHighRisk) {
      await click("#directive-highrisk-ack");
      await sleep(120);
    }
    await click("#directive-confirm");
    await waitFor(`!document.getElementById('directive-dialog')`, 4000);
  };
  const readLedger = () => {
    const file = path.join(PROJECT, ...LEDGER_REL);
    if (!fs.existsSync(file)) return { exists: false, events: [] };
    const text = fs.readFileSync(file, "utf8");
    const events = text
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { parseError: line };
        }
      });
    return { exists: true, bytes: Buffer.byteLength(text), events };
  };

  try {
    await wc.loadFile(RENDERER_ENTRY);
    await sleep(400);
    await js(`window.__smokeCsp = []; window.addEventListener('securitypolicyviolation', (e) => window.__smokeCsp.push(e.violatedDirective)); 0`);

    check("MOUNT", await waitFor(`!!document.querySelector('#root > .app-shell')`, 10000));
    await js(`window.__ansRenderer.loadProject(${JSON.stringify(PROJECT)})`);
    await sleep(400);
    await js(`window.__ansRenderer.selectRuntime('claude')`);
    await sleep(200);
    await js(`window.__ansRenderer.selectRole('A')`);
    await sleep(600);

    check("CHAT_PANE", await waitFor(`!!document.querySelector('${pane}')`, 12000));
    check("COMPOSER_READY", await waitFor(`!!document.getElementById('inp-message') && !!document.getElementById('btn-send')`, 8000));
    check("DIRECTIVE_CAPABILITY_ON", await waitFor(`(() => { const b = document.getElementById('btn-directive-panel'); return !!b && b.disabled === false; })()`, 5000));
    await shot("00-initial-chat");

    // —————— S1: @审批 allow shell once -> dialog -> confirm -> receipt ——————
    const s1Text = '@审批 允许 shell "npm install" once';
    check("S1_INPUT_SENT", await enterDirective(s1Text));
    check("S1_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const s1Fields = await js(`(() => {
      const raw = document.getElementById('directive-raw-text');
      const scope = document.getElementById('directive-scope');
      const resource = document.getElementById('directive-resource');
      const until = document.getElementById('directive-until');
      return {
        raw: raw ? raw.textContent : null,
        scope: scope ? scope.textContent : null,
        resource: resource ? resource.textContent : null,
        until: until ? until.textContent : null,
        confirmDisabled: document.getElementById('directive-confirm')?.disabled === true,
        highRisk: !!document.getElementById('directive-high-risk'),
      };
    })()`);
    check(
      "S1_DIALOG_FIELDS",
      s1Fields.raw === s1Text &&
        typeof s1Fields.scope === "string" &&
        s1Fields.scope.trim() !== "" &&
        typeof s1Fields.resource === "string" &&
        s1Fields.resource.includes("npm install") &&
        typeof s1Fields.until === "string" &&
        s1Fields.until.trim() !== "" &&
        s1Fields.confirmDisabled === false &&
        s1Fields.highRisk === false,
      s1Fields,
    );
    check(
      "S1_NO_USER_BUBBLE",
      (await js(`[...document.querySelectorAll('${pane} .chat-row[data-row-kind="user"]')].every((el) => !el.textContent.includes(${JSON.stringify(s1Text)}))`)) === true,
    );
    await shot("01-approval-confirm-dialog");
    const s1NotesBefore = await noteCount();
    await confirmDialog(false);
    const s1Receipt = await waitNewNote(s1NotesBefore, (text) => /^已记录审批指令 #d-\d+$/.test(text), 8000);
    const s1Id = receiptId(s1Receipt);
    check("S1_RECEIPT", s1Receipt !== null, { receipt: s1Receipt, last: await lastNote() });
    await shot("02-approval-receipt");
    let ledger = readLedger();
    const s1Event = ledger.events.find((e) => e && e.kind === "directive.created" && e.id === s1Id);
    check(
      "S1_LEDGER_CREATED",
      !!s1Event &&
        s1Event.target === "approval" &&
        s1Event.until === "once" &&
        s1Event.action?.kind === "allow" &&
        s1Event.action?.resource?.type === "shell" &&
        s1Event.action?.resource?.command === "npm install",
      s1Event ?? null,
    );

    // —————— S2: high-risk forever -> confirm disabled until ack -> confirm ——————
    const s2Text = '@审批 允许 shell "npm install" forever';
    check("S2_INPUT_SENT", await enterDirective(s2Text));
    check("S2_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    check(
      "S2_HIGH_RISK_UNCHECKED_DISABLED",
      (await js(`(() => { const hr = document.getElementById('directive-high-risk'); const c = document.getElementById('directive-confirm'); return !!hr && !!c && c.disabled === true; })()`)) === true,
    );
    await shot("03-high-risk-confirm-disabled");
    await click("#directive-highrisk-ack");
    await sleep(150);
    check(
      "S2_HIGH_RISK_ACK_ENABLES_CONFIRM",
      (await js(`(() => { const c = document.getElementById('directive-confirm'); return !!c && c.disabled === false; })()`)) === true,
    );
    await shot("04-high-risk-acknowledged");
    const s2NotesBefore = await noteCount();
    await confirmDialog(false); // already acknowledged above; click confirm directly
    const s2Receipt = await waitNewNote(s2NotesBefore, (text) => /^已记录审批指令 #d-\d+$/.test(text), 8000);
    const s2Id = receiptId(s2Receipt);
    check("S2_RECEIPT", s2Receipt !== null, { receipt: s2Receipt, last: await lastNote() });
    ledger = readLedger();
    const s2Event = ledger.events.find((e) => e && e.kind === "directive.created" && e.id === s2Id);
    check(
      "S2_LEDGER_HIGH_RISK_RECORDED",
      !!s2Event &&
        s2Event.until === "forever" &&
        Array.isArray(s2Event.highRisk?.reasons) &&
        s2Event.highRisk.reasons.length > 0 &&
        s2Event.highRisk.acknowledged === true,
      s2Event ?? null,
    );

    // —————— S3: @决策 选推荐项 until=session -> decision card auto-select ——————
    const s3Text = "@决策 选推荐项 until=session";
    check("S3_INPUT_SENT", await enterDirective(s3Text));
    check("S3_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const s3DialogState = await js(`(() => {
      const highRisk = document.getElementById('directive-high-risk');
      const confirm = document.getElementById('directive-confirm');
      return { highRisk: !!highRisk, confirmDisabled: confirm?.disabled === true };
    })()`);
    // Q7 A / AC-13: project-level select-recommended with the decision switch OFF is high-risk.
    check(
      "S3_PROJECT_RECOMMENDED_HIGH_RISK",
      s3DialogState.highRisk === true && s3DialogState.confirmDisabled === true,
      s3DialogState,
    );
    await shot("05a-decision-high-risk-dialog");
    const s3NotesBefore = await noteCount();
    await confirmDialog(true);
    const s3Receipt = await waitNewNote(s3NotesBefore, (text) => /^已记录决策指令 #d-\d+$/.test(text), 8000);
    const s3Id = receiptId(s3Receipt);
    check("S3_RECEIPT", s3Receipt !== null, { receipt: s3Receipt, last: await lastNote() });

    const decisionCard = {
      kind: "choice",
      title: "选择方案",
      question: "请选择",
      cardKind: "decision",
      application: true,
      sourceRoleId: "application",
      flowId: "focus",
      options: [
        { id: "alpha", label: "方案 A", recommended: true },
        { id: "beta", label: "方案 B" },
      ],
    };
    const ctx = { roleId: "A", projectRoot: PROJECT, runtime: "claude", governanceModel: "trio" };
    const s3Outcome = await withTimeout(customerChannel.customerInput(decisionCard, ctx), 12000);
    check(
      "S3_DECISION_AUTO_SELECTED",
      s3Outcome?.outcome === "answered" &&
        Array.isArray(s3Outcome.value?.selected) &&
        s3Outcome.value.selected[0] === "alpha" &&
        s3Outcome.operatorId === `directive:${s3Id}` &&
        s3Outcome.directive?.action === "select-recommended" &&
        s3Outcome.judge === undefined,
      s3Outcome,
    );
    check("S3_RESULT_ROW", await waitNote(`客户指令 #${s3Id} 已代选推荐项 方案 A`, 8000), { notes: await notesText() });
    check(
      "S3_RESULT_ROW_ATTRIBUTION",
      (await lastNote())?.includes("客户指令，不是客户本人点击") === true,
      { last: await lastNote() },
    );
    check("S3_NO_CUSTOMER_CARD", (await js(`!document.getElementById('decision-dialog')`)) === true);
    await shot("05-decision-directive-applied");

    // —————— S4: conflicting decision directives -> customer card + directiveNotice ——————
    const s4Text = "@决策 只接受 方案 B flow=focus until=session";
    check("S4_INPUT_SENT", await enterDirective(s4Text));
    check("S4_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const s4NotesBefore = await noteCount();
    await confirmDialog(false);
    const s4Receipt = await waitNewNote(s4NotesBefore, (text) => /^已记录决策指令 #d-\d+$/.test(text), 8000);
    const s4Id = receiptId(s4Receipt);
    check("S4_RECEIPT", s4Receipt !== null, { receipt: s4Receipt, last: await lastNote() });
    const pushedBefore = pushedOperatorRequests.length;
    const s4Promise = customerChannel.customerInput(decisionCard, ctx);
    check("S4_CUSTOMER_CARD_PRESENTED", await waitFor(`!!document.getElementById('decision-dialog')`, 8000), {
      pushed: pushedOperatorRequests.length - pushedBefore,
    });
    const s4ConflictNote = await waitNewNote(s4NotesBefore, (text) => text.includes("决策指令冲突"), 8000);
    check("S4_CONFLICT_NOTICE", s4ConflictNote !== null, { note: s4ConflictNote, notes: await notesText() });
    check(
      "S4_CONFLICT_NOTICE_IDS",
      typeof s4ConflictNote === "string" && s4ConflictNote.includes(s3Id) && s4ConflictNote.includes(s4Id),
      s4ConflictNote,
    );
    await shot("06-decision-conflict-card-and-notice");
    const s4Payload = pushedOperatorRequests[pushedBefore];
    if (s4Payload !== undefined) {
      customerChannel.respond({ id: s4Payload.id, decision: { kind: "choice", selected: ["beta"] } });
    }
    const s4Outcome = await withTimeout(s4Promise, 12000);
    check(
      "S4_CONFLICT_NOT_AUTO_SELECTED",
      s4Outcome?.outcome === "answered" &&
        Array.isArray(s4Outcome.value?.selected) &&
        s4Outcome.value.selected[0] === "beta" &&
        s4Outcome.directive === undefined &&
        s4Outcome.operatorId === "d2-probe-operator",
      s4Outcome,
    );
    if (await js(`!!document.getElementById('decision-dialog')`)) {
      await click("#decision-dialog .dd-later");
    }
    await scrollChatBottom();
    await shot("06a-decision-conflict-notice-after-answer");

    // —————— S4b: no-match decision directive -> customer card + directiveNotice ——————
    const revokeByInput = async (marker, id) => {
      const before = await noteCount();
      const sent = await enterDirective(`${marker} 撤销 #${id}`);
      const opened = await waitFor(`!!document.getElementById('directive-dialog')`, 8000);
      await confirmDialog(false);
      const note = await waitNewNote(before, (text) => text.includes(`已撤销决策指令 #${id}`), 8000);
      return { sent, opened, note };
    };
    const revokeS3 = s3Id !== null ? await revokeByInput("@决策", s3Id) : { sent: false, opened: false, note: null };
    check("S4B_REVOKE_D3_RECEIPT", revokeS3.note !== null, revokeS3);
    const revokeS4 = s4Id !== null ? await revokeByInput("@决策", s4Id) : { sent: false, opened: false, note: null };
    check("S4B_REVOKE_D4_RECEIPT", revokeS4.note !== null, revokeS4);

    const s4bText = "@决策 只接受 不存在的选项 flow=focus until=session";
    check("S4B_INPUT_SENT", await enterDirective(s4bText));
    check("S4B_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const s4bNotesBefore = await noteCount();
    await confirmDialog(false);
    const s4bReceipt = await waitNewNote(s4bNotesBefore, (text) => /^已记录决策指令 #d-\d+$/.test(text), 8000);
    const s4bId = receiptId(s4bReceipt);
    check("S4B_RECEIPT", s4bReceipt !== null, { receipt: s4bReceipt, last: await lastNote() });
    const pushedBeforeNoMatch = pushedOperatorRequests.length;
    const s4bPromise = customerChannel.customerInput(decisionCard, ctx);
    check("S4B_CUSTOMER_CARD_PRESENTED", await waitFor(`!!document.getElementById('decision-dialog')`, 8000), {
      pushed: pushedOperatorRequests.length - pushedBeforeNoMatch,
    });
    const s4bNote = await waitNewNote(s4bNotesBefore, (text) => text.includes("未匹配到唯一选项"), 8000);
    check("S4B_NO_MATCH_NOTICE", s4bNote !== null, { note: s4bNote, notes: await notesText() });
    check(
      "S4B_NO_MATCH_NOTICE_ID",
      typeof s4bNote === "string" && s4bNote.includes(s4bId),
      s4bNote,
    );
    await shot("06b-decision-no-match-card-and-notice");
    const s4bPayload = pushedOperatorRequests[pushedBeforeNoMatch];
    if (s4bPayload !== undefined) {
      customerChannel.respond({ id: s4bPayload.id, decision: { kind: "choice", selected: ["alpha"] } });
    }
    const s4bOutcome = await withTimeout(s4bPromise, 12000);
    check(
      "S4B_NO_MATCH_NOT_AUTO_SELECTED",
      s4bOutcome?.outcome === "answered" &&
        Array.isArray(s4bOutcome.value?.selected) &&
        s4bOutcome.value.selected[0] === "alpha" &&
        s4bOutcome.directive === undefined &&
        s4bOutcome.operatorId === "d2-probe-operator",
      s4bOutcome,
    );
    if (await js(`!!document.getElementById('decision-dialog')`)) {
      await click("#decision-dialog .dd-later");
    }
    await scrollChatBottom();
    await shot("06c-decision-no-match-notice-after-answer");

    // —————— S5: directive panel (two logical panels) + revoke ——————
    await click("#btn-directive-panel");
    check("S5_PANEL_OPEN", await waitFor(`!!document.getElementById('directive-panel')`, 4000));
    const panelView = await js(`(() => {
      const approval = document.getElementById('directive-panel-approval');
      const decision = document.getElementById('directive-panel-decision');
      return {
        approval: !!approval,
        decision: !!decision,
        d1: !!document.getElementById(${JSON.stringify("directive-row-" + s1Id)}),
        d2: !!document.getElementById(${JSON.stringify("directive-row-" + s2Id)}),
        d3: !!document.getElementById(${JSON.stringify("directive-row-" + s3Id)}),
        d4: !!document.getElementById(${JSON.stringify("directive-row-" + s4Id)}),
        d4b: !!document.getElementById(${JSON.stringify("directive-row-" + s4bId)}),
        revokeD1: !!document.getElementById(${JSON.stringify("directive-revoke-" + s1Id)}),
      };
    })()`);
    check(
      "S5_TWO_LOGICAL_PANELS_AND_ROWS",
      panelView.approval &&
        panelView.decision &&
        panelView.d1 &&
        panelView.d2 &&
        panelView.d3 &&
        panelView.d4 &&
        panelView.d4b &&
        panelView.revokeD1,
      panelView,
    );
    await shot("07-directive-panel");
    const panelNotesBefore = await noteCount();
    const panelRevokeClicked = await click(`#directive-revoke-${s1Id}`);
    const panelRevokeReceipt = panelRevokeClicked
      ? await waitNewNote(panelNotesBefore, (text) => text.includes(`已撤销审批指令 #${s1Id}`), 3000)
      : null;
    // Honest check: the D2 matrix requires a revoke receipt for the panel path. If the product
    // does not emit one, this stays false and is reported as an observed gap (no product edits).
    check("S5_PANEL_REVOKE_RECEIPT", panelRevokeReceipt !== null, {
      clicked: panelRevokeClicked,
      receipt: panelRevokeReceipt,
      last: await lastNote(),
      notes: await notesText(),
    });
    check(
      "S5_REVOKED_ROW_STATE",
      await waitFor(`(() => { const row = document.getElementById(${JSON.stringify("directive-row-" + s1Id)}); return !!row && row.getAttribute('data-status') === 'revoked'; })()`, 5000),
    );
    await shot("08-approval-revoked");
    if (await js(`!!document.getElementById('directive-panel')`)) await click("#directive-panel-close");
    ledger = readLedger();
    check(
      "S5_LEDGER_REVOKED",
      ledger.events.some((e) => e && e.kind === "directive.revoked" && e.id === s1Id),
      ledger.events.filter((e) => e && e.kind === "directive.revoked"),
    );

    // —————— S6: project switch cancels pending directive dialog ——————
    const s6Text = '@审批 允许 shell "npm test" once';
    const ledgerBeforeCancel = readLedger().events.length;
    check("S6_INPUT_SENT", await enterDirective(s6Text));
    check("S6_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    await js(`window.__ansRenderer.loadProject(${JSON.stringify(PROJECT2)})`);
    check("S6_DIALOG_CLOSED_ON_SWITCH", await waitFor(`!document.getElementById('directive-dialog')`, 8000));
    check(
      "S6_SUBMIT_RETURNED_CANCELLED",
      report.sends.some((entry) => entry.text === s6Text && entry.res?.directiveCancelled === true),
      report.sends.filter((entry) => entry.text === s6Text),
    );
    check(
      "S6_CANCEL_MESSAGE",
      report.sends.some(
        (entry) => entry.text === s6Text && typeof entry.res?.error === "string" && entry.res.error !== "",
      ),
      report.sends.filter((entry) => entry.text === s6Text).map((entry) => entry.res?.error),
    );
    check("S6_NO_LEDGER_WRITE", readLedger().events.length === ledgerBeforeCancel);
    await shot("09-project-switch-cancels-pending");

    // Back to the primary fixture project.
    await js(`window.__ansRenderer.loadProject(${JSON.stringify(PROJECT)})`);
    await sleep(400);
    await js(`window.__ansRenderer.selectRuntime('claude')`);
    await sleep(200);
    await js(`window.__ansRenderer.selectRole('A')`);
    await sleep(600);

    // —————— S7 (AC-22): shell card pending + card-footer directive entry ——————
    wc.send("shell:confirm-request", {
      projectRoot: PROJECT,
      runtime: "claude",
      roleId: "A",
      id: "sc-d2-probe",
      policy: "project",
      command: "echo d2",
      summary: "D2 探针 shell 卡（待答）",
      reasonPlain: "AC-22 共存夹具",
      cwd: PROJECT,
      argvLines: ["echo", "d2"],
    });
    check("S7_SHELL_CARD_PENDING", await waitFor(`(() => { const el = document.getElementById('shell-confirm'); return !!el && el.hidden === false; })()`, 6000));
    await click("#sc-directive-entry");
    check("S7_ENTRY_INPUT_OPEN", await waitFor(`!!document.getElementById('sc-directive-input')`, 3000));
    const s7Text = '@审批 允许 shell "npm install" once';
    await setValue("#sc-directive-input", s7Text);
    const entryEnabled = await waitFor(`!document.getElementById('sc-directive-submit').disabled`, 3000);
    check("S7_ENTRY_SUBMIT_ENABLED", entryEnabled);
    await click("#sc-directive-submit");
    check("S7_DIRECTIVE_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    check(
      "S7_SHELL_CARD_STILL_PENDING_WITH_DIALOG",
      (await js(`(() => { const el = document.getElementById('shell-confirm'); return !!el && el.hidden === false && !!document.getElementById('directive-dialog'); })()`)) === true,
    );
    check("S7_NO_SHELL_RESPONSE_YET", report.shellResponses.length === 0, { shellResponses: report.shellResponses.length });
    await shot("10-shell-card-directive-dialog-coexist");
    const s7NotesBefore = await noteCount();
    await confirmDialog(false);
    const s7Receipt = await waitNewNote(s7NotesBefore, (text) => /^已记录审批指令 #d-\d+$/.test(text), 8000);
    const s7Id = receiptId(s7Receipt);
    check("S7_RECEIPT", s7Receipt !== null, { receipt: s7Receipt, last: await lastNote() });
    check(
      "S7_RECEIPT_NEW_ID",
      typeof s7Id === "string" && ![s1Id, s2Id].includes(s7Id),
      { s7Id, s1Id, s2Id },
    );
    check(
      "S7_SHELL_CARD_STILL_PENDING_AFTER_CONFIRM",
      (await js(`(() => { const el = document.getElementById('shell-confirm'); return !!el && el.hidden === false && !document.getElementById('directive-dialog'); })()`)) === true,
    );
    check("S7_SHELL_NOT_RESPONDED", report.shellResponses.length === 0, { shellResponses: report.shellResponses.length });
    await shot("11-shell-card-still-pending");

    // —————— Final: ledger sample, console/CSP ——————
    ledger = readLedger();
    report.ledger = {
      path: path.join(PROJECT, ...LEDGER_REL),
      exists: ledger.exists,
      bytes: ledger.bytes ?? 0,
      events: ledger.events.map((e) => (e && e.kind ? { kind: e.kind, id: e.id ?? e.directive?.id, target: e.target ?? e.directive?.target } : e)),
    };
    fs.writeFileSync(path.join(OUT, "ledger-snapshot.json"), JSON.stringify(ledger, null, 2));
    const createdIds = ledger.events.filter((e) => e.kind === "directive.created").map((e) => e.id);
    const revokedIds = ledger.events.filter((e) => e.kind === "directive.revoked").map((e) => e.id);
    check(
      "LEDGER_EVENTS_SAMPLE",
      ledger.exists &&
        [s1Id, s2Id, s3Id, s4Id, s4bId, s7Id].every((id) => typeof id === "string" && createdIds.includes(id)) &&
        [s1Id, s3Id, s4Id].every((id) => typeof id === "string" && revokedIds.includes(id)),
      { createdIds, revokedIds, events: report.ledger.events },
    );

    const badConsole = report.console.filter((item) => String(item.level) === "error" || item.level === 3);
    report.csp = (await js(`window.__smokeCsp || []`)) ?? [];
    check("NO_CONSOLE_ERRORS", badConsole.length === 0, badConsole);
    check("NO_CSP_VIOLATIONS", report.csp.length === 0, report.csp);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("D2_PROBE_RUN_ERROR", report.error);
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(`D2_PROBE_DONE failures=${report.failures} checks=${report.checks.length} screenshots=${report.screenshots.length} out=${OUT}`);
    app.exit(report.failures === 0 ? 0 : 1);
  }
}).catch((error) => {
  fatal("whenReady failed: " + String(error && error.stack ? error.stack : error));
});

setTimeout(() => {
  console.error("D2_PROBE_TIMEOUT");
  fatal("watchdog timeout");
}, 180000);
