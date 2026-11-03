#!/usr/bin/env node
/**
 * D2-supplement Electron probe (test-only evidence; not a product/test source file).
 *
 * Real Electron run on the frozen candidate (HEAD 4c3a6e4 + 54 files), real preload
 * (app/preload.cjs), real renderer bundle (app/renderer/dist), real DesktopInterface
 * (app/desktop/interface.ts), real directive controller (app/desktop/directive-input.ts ->
 * real B1 ledger) and real customer-input decision consumer (app/desktop/customer-input.ts).
 * Unrelated IPC channels use benign stubs; directive/chat paths are real.
 *
 * Phases (ANS_SUPPLEMENT_PHASE):
 *   main            S1 near-miss/ordinary delivery + hit contrast; S2 empty-body panel;
 *                   S3 image+marker rejection; S4 unrecognized fragments (exact example and variant)
 *   restart-create  create `session` and unused `once` directives, screenshot active panel
 *   restart-verify  same userData/project, new process: both expired (app-restart / unused-once)
 *   bad-ledger      pre-seeded bad lines/rotations: panel ledgerErrors, ordinary chat path,
 *                   decision consumer falls back to the customer card
 *
 * Screenshots: PNG stills only, 1360x860 content size, DEBUG overlays unset; no recording.
 * Temporary userData/fixtures live under the supplement evidence directory only.
 *
 * Run from repo root:
 *   ANS_SUPPLEMENT_PHASE=main ./node_modules/.bin/electron <this script>
 */
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..", "..");
const BASE = path.resolve(HERE, "..");
const PHASE = process.env.ANS_SUPPLEMENT_PHASE ?? "main";
const PHASE_DIRS = {
  main: {
    run: path.join(BASE, "main"),
    userData: path.join(BASE, "main", "userData"),
    project: path.join(BASE, "main", "project"),
    resetUserData: true,
    resetProject: true,
  },
  "restart-create": {
    run: path.join(BASE, "restart", "run1"),
    userData: path.join(BASE, "restart", "userData"),
    project: path.join(BASE, "restart", "project"),
    resetUserData: true,
    resetProject: true,
  },
  "restart-verify": {
    run: path.join(BASE, "restart", "run2"),
    userData: path.join(BASE, "restart", "userData"),
    project: path.join(BASE, "restart", "project"),
    resetUserData: false,
    resetProject: false,
  },
  "bad-ledger": {
    run: path.join(BASE, "bad-ledger", "run"),
    userData: path.join(BASE, "bad-ledger", "userData"),
    project: path.join(BASE, "bad-ledger", "project"),
    resetUserData: true,
    resetProject: false,
  },
};
const DIRS = PHASE_DIRS[PHASE];
if (!DIRS) {
  console.error("D2S_UNKNOWN_PHASE", PHASE);
  process.exit(2);
}
const OUT = DIRS.run;
const USER_DATA = DIRS.userData;
const PROJECT = DIRS.project;
const RENDERER_ENTRY = path.join(REPO, "app", "renderer", "dist", "index.html");
const PRELOAD = path.join(REPO, "app", "preload.cjs");
const LEDGER_REL = [".ans", "state", "customer-directives.jsonl"];
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const report = {
  probe: "customer-authorization-plane-d2-supplement",
  phase: PHASE,
  startedAt: new Date().toISOString(),
  repo: REPO,
  out: OUT,
  userData: USER_DATA,
  project: PROJECT,
  rendererEntry: RENDERER_ENTRY,
  preload: PRELOAD,
  head: process.env.ANS_SUPPLEMENT_HEAD ?? null,
  windowSize: null,
  sessionId: `supplement-${PHASE}-` + Date.now(),
  checks: [],
  screenshots: [],
  console: [],
  csp: [],
  sends: [],
  notes: [],
  directiveLists: [],
  ledger: null,
  failures: 0,
};
let win = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

resetDir(OUT);
if (DIRS.resetUserData) resetDir(USER_DATA);
if (DIRS.resetProject) resetDir(PROJECT);
fs.mkdirSync(USER_DATA, { recursive: true });
fs.mkdirSync(PROJECT, { recursive: true });
app.setPath("userData", USER_DATA);

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail ?? null });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  return value === true;
}

function fatal(message) {
  report.error = message;
  console.error("D2S_PROBE_ERROR", message);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } catch {}
  app.exit(9);
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, "角色卡", "A"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "A", "role-card.md"), "# 角色：A\n\nD2 补证探针夹具角色（不参与产品候选）。\n");
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
const projectRole = (roleId) => ({
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
  roles: [govRole, projectRole("A")],
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
  writeFixture(PROJECT);
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
    operatorId: "d2s-probe-operator",
    nextId: (() => {
      let n = 0;
      return () => "op-d2s-" + ++n;
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
    pickImageFileFn: async () => ({ name: "supplement-tiny.png", dataBase64: TINY_PNG_BASE64 }),
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
      console.error("D2S_PUSH_STATE_ERROR", String(error && error.message ? error.message : error));
    }
  };

  Menu.setApplicationMenu(null);
}

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
  ipcMain.handle("app:pick-image", () => desktop.pickImage());
  ipcMain.handle("app:attach-image", (_e, input) => desktop.attachImage(input));
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
  ipcMain.handle("shell:confirm-response", () => ({ ok: true }));
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

function readLedger(root) {
  const file = path.join(root, ...LEDGER_REL);
  if (!fs.existsSync(file)) return { exists: false, path: file, bytes: 0, lines: 0, events: [] };
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const events = lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { parseError: line };
    }
  });
  return { exists: true, path: file, bytes: Buffer.byteLength(text), lines: lines.length, events };
}

function summarizeLedger(ledger) {
  return {
    exists: ledger.exists,
    path: ledger.path,
    bytes: ledger.bytes,
    lines: ledger.lines,
    events: ledger.events.map((e) =>
      e && typeof e === "object" && e.kind
        ? {
            kind: e.kind,
            id: e.id,
            seq: e.seq,
            target: e.target,
            until: e.until,
            reason: e.reason,
            at: e.at,
            by: e.by,
            sessionId: e.sessionId,
          }
        : e,
    ),
  };
}

app.whenReady().then(async () => {
  try {
    await start();
  } catch (error) {
    fatal("start failed: " + String(error && error.stack ? error.stack : error));
    return;
  }
  console.log("D2S_PROBE_READY phase=" + PHASE + " sessionId=" + report.sessionId);
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
    const ok = await js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await sleep(80);
    return ok;
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
  const noteCount = async () => ((await notesText()) || []).length;
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
  const withTimeout = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)]);
  const userRowsText = async () =>
    js(`[...document.querySelectorAll('${pane} .chat-row[data-row-kind="user"]')].map((el) => el.textContent)`);
  const hasUserBubble = async (text) => {
    const rows = (await userRowsText()) || [];
    return rows.some((row) => typeof row === "string" && row.includes(text));
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
  const enterSend = async (text) => {
    await setValue("#inp-message", text);
    const enabled = await waitFor(`!document.getElementById('btn-send').disabled`, 3000);
    if (!enabled) return false;
    await click("#btn-send");
    return true;
  };
  const waitDialog = (timeout = 8000) => waitFor(`!!document.getElementById('directive-dialog')`, timeout);
  const dialogGone = (timeout = 5000) => waitFor(`!document.getElementById('directive-dialog')`, timeout);
  const cancelDialog = async () => {
    await click("#directive-cancel");
    return dialogGone();
  };
  const confirmDialog = async (expectHighRisk = false) => {
    if (expectHighRisk) {
      await click("#directive-highrisk-ack");
      await sleep(120);
    }
    await click("#directive-confirm");
    await dialogGone(4000);
  };
  const readDialog = async () =>
    js(`(() => {
      const raw = document.getElementById('directive-raw-text');
      const scope = document.getElementById('directive-scope');
      const resource = document.getElementById('directive-resource');
      const until = document.getElementById('directive-until');
      const unrecognized = document.getElementById('directive-unrecognized');
      const notConfirmable = document.getElementById('directive-not-confirmable');
      const confirm = document.getElementById('directive-confirm');
      const highRisk = document.getElementById('directive-high-risk');
      return {
        open: !!document.getElementById('directive-dialog'),
        raw: raw ? raw.textContent : null,
        scope: scope ? scope.textContent : null,
        resource: resource ? resource.textContent : null,
        until: until ? until.textContent : null,
        unrecognized: unrecognized ? unrecognized.textContent : null,
        notConfirmable: notConfirmable ? notConfirmable.textContent : null,
        confirmDisabled: confirm ? confirm.disabled === true : null,
        highRisk: !!highRisk,
      };
    })()`);
  const listDirectives = async (projectRoot) => {
    const reply = await js(`window.desktop.listDirectives({ projectRoot: ${JSON.stringify(projectRoot)} })`);
    report.directiveLists.push(reply);
    return reply;
  };
  const openPanel = async () => {
    await click("#btn-directive-panel");
    return waitFor(`!!document.getElementById('directive-panel')`, 5000);
  };
  const closePanel = async () => {
    if (await js(`!!document.getElementById('directive-panel')`)) await click("#directive-panel-close");
    return waitFor(`!document.getElementById('directive-panel')`, 3000);
  };
  const waitSend = async (text, timeout = 8000) => {
    const begin = Date.now();
    while (Date.now() - begin < timeout) {
      const entry = [...report.sends].reverse().find((item) => item.text === text);
      if (entry !== undefined) return entry;
      await sleep(80);
    }
    return null;
  };
  const settle = async () => {
    await sleep(400);
  };
  // Ordinary sends fail with "session not open" in this probe (no real runtime adapter);
  // the Composer invalidates the session on that failure, which disables #btn-send.
  // Re-select role A (the probe's session:open stub returns ok) to restore the composer.
  const reopenSession = async () => {
    await js(`window.__ansRenderer.selectRole('A')`);
    await sleep(600);
    return waitFor(`(() => { const b = document.getElementById('btn-send'); return !!b && b.disabled === false; })()`, 4000);
  };

  const setupPage = async () => {
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
    await settle();
  };

  // —————————————————————— phase: main ——————————————————————
  const runMain = async () => {
    await setupPage();
    await shot("S0-initial-chat");
    const ledgerBefore = readLedger(PROJECT);
    check("MAIN_LEDGER_ABSENT_BEFORE", ledgerBefore.exists === false, { path: ledgerBefore.path });

    // S1: near-miss / mid-body / full-width / @边界 -> ordinary chat
    const ordinary = [
      { key: "S1a", text: "@审批员 你好", name: "S1a-near-miss-approval-clerk" },
      { key: "S1b", text: "请把 @审批 的说明发我", name: "S1b-mid-body-marker" },
      { key: "S1c", text: "＠审批 允许 shell \"npm install\" once", name: "S1c-fullwidth-marker" },
      { key: "S1d", text: "@边界 你好", name: "S1d-boundary-marker" },
    ];
    for (const item of ordinary) {
      const notesBefore = await noteCount();
      check(`${item.key}_INPUT_SENT`, await enterSend(item.text));
      const dialogOpened = await waitFor(`!!document.getElementById('directive-dialog')`, 1200);
      check(`${item.key}_NO_DIRECTIVE_DIALOG`, dialogOpened === false);
      check(`${item.key}_USER_BUBBLE`, await hasUserBubble(item.text), { rows: await userRowsText() });
      const entry = await waitSend(item.text);
      check(
        `${item.key}_NORMAL_SEND_PATH`,
        entry !== null &&
          entry.res !== null &&
          typeof entry.res === "object" &&
          entry.res.directive === undefined &&
          entry.res.directiveCancelled === undefined,
        entry?.res ?? null,
      );
      check(`${item.key}_NO_NEW_RECEIPT`, (await noteCount()) === notesBefore, { notes: await notesText() });
      check(`${item.key}_LEDGER_UNCHANGED`, readLedger(PROJECT).exists === false);
      await shot(item.name);
      check(`${item.key}_REOPEN_COMPOSER`, await reopenSession());
    }

    // S1e: hit contrast — dialog opens, no user bubble, no ledger; cancel keeps it unrecorded
    const hitText = '@审批 允许 shell "npm install" once';
    check("S1E_INPUT_SENT", await enterSend(hitText));
    check("S1E_DIALOG_OPEN", await waitDialog());
    check("S1E_NO_USER_BUBBLE", (await hasUserBubble(hitText)) === false, { rows: await userRowsText() });
    check("S1E_LEDGER_UNCHANGED", readLedger(PROJECT).exists === false);
    const hitDialog = await readDialog();
    check(
      "S1E_FIELDS",
      hitDialog.raw === hitText &&
        typeof hitDialog.scope === "string" &&
        typeof hitDialog.resource === "string" &&
        hitDialog.resource.includes("npm install") &&
        typeof hitDialog.until === "string" &&
        hitDialog.confirmDisabled === false,
      hitDialog,
    );
    await shot("S1e-hit-dialog-open-no-bubble");
    check("S1E_CANCEL", await cancelDialog());
    const hitEntry = await waitSend(hitText);
    check(
      "S1E_CANCELLED_RESULT",
      hitEntry !== null && hitEntry.res?.directiveCancelled === true && hitEntry.res?.directive === undefined,
      hitEntry?.res ?? null,
    );
    check("S1E_LEDGER_STILL_ABSENT", readLedger(PROJECT).exists === false);

    // S2: empty body -> panel with empty fields and disabled confirm
    check("S2_INPUT_SENT", await enterSend("@审批"));
    check("S2_DIALOG_OPEN", await waitDialog());
    const emptyDialog = await readDialog();
    check(
      "S2_EMPTY_BODY_PANEL",
      emptyDialog.raw === "@审批" &&
        emptyDialog.confirmDisabled === true &&
        emptyDialog.notConfirmable !== null &&
        emptyDialog.resource !== null &&
        /\s$|shell/i.test(emptyDialog.resource),
      emptyDialog,
    );
    await shot("S2-empty-body-panel");
    check("S2_CANCEL", await cancelDialog());
    await waitSend("@审批");

    // S4a: dispatch's exact example — record actual behavior honestly (no fabricated expectation)
    const exactText = '@审批 允许 shell "npm install" 加急';
    check("S4A_INPUT_SENT", await enterSend(exactText));
    check("S4A_DIALOG_OPEN", await waitDialog());
    const exactDialog = await readDialog();
    report.exactExampleObservation = exactDialog;
    check(
      "S4A_ACTUAL_NO_UNRECOGNIZED",
      exactDialog.unrecognized === null && exactDialog.confirmDisabled === false,
      exactDialog,
    );
    await shot("S4a-exact-example-actual-behavior");
    check("S4A_CANCEL", await cancelDialog());
    await waitSend(exactText);

    // S4b: variant that genuinely yields an unrecognized fragment
    const variantText = "@审批 允许 加急";
    check("S4B_INPUT_SENT", await enterSend(variantText));
    check("S4B_DIALOG_OPEN", await waitDialog());
    const variantDialog = await readDialog();
    check(
      "S4B_UNRECOGNIZED_FRAGMENTS",
      typeof variantDialog.unrecognized === "string" &&
        variantDialog.unrecognized.includes("加急") &&
        variantDialog.confirmDisabled === true &&
        variantDialog.notConfirmable !== null,
      variantDialog,
    );
    await shot("S4b-unrecognized-fragments-panel");
    check("S4B_CANCEL", await cancelDialog());
    await waitSend(variantText);

    // S3: image + marker -> explicit rejection, no dialog, no delivery, no ledger
    const imageText = '@审批 允许 shell "npm install" once';
    const notesBeforeImage = await noteCount();
    check("S3_ATTACH_CLICK", await click("#btn-attach-image"));
    check(
      "S3_ATTACH_CHIP",
      await waitFor(`(() => { const row = document.getElementById('attach-row'); return !!row && row.hidden === false && row.querySelectorAll('.attach-chip').length === 1; })()`, 5000),
      { attachRow: await js(`(() => { const row = document.getElementById('attach-row'); return row ? { hidden: row.hidden, chips: row.querySelectorAll('.attach-chip').length } : null; })()`) },
    );
    await shot("S3a-image-attached");
    check("S3_INPUT_SENT", await enterSend(imageText));
    check(
      "S3_REJECTION_STATUS",
      await waitFor(`(() => { const el = document.getElementById('composer-demo-status'); return !!el && el.textContent.includes('指令输入不支持图片附件'); })()`, 8000),
      { status: await js(`document.getElementById('composer-demo-status')?.textContent ?? null`) },
    );
    const imageEntry = await waitSend(imageText);
    check(
      "S3_ERROR_TEXT",
      imageEntry !== null &&
        typeof imageEntry.res?.error === "string" &&
        imageEntry.res.error.includes("指令输入不支持图片附件") &&
        imageEntry.res.directive === undefined &&
        imageEntry.res.directiveCancelled === undefined,
      imageEntry?.res ?? null,
    );
    check("S3_NO_DIALOG", (await js(`!!document.getElementById('directive-dialog')`)) === false);
    check("S3_NO_USER_BUBBLE", (await hasUserBubble(imageText)) === false, { rows: await userRowsText() });
    check("S3_NO_RECEIPT", (await noteCount()) === notesBeforeImage, { notes: await notesText() });
    check("S3_LEDGER_STILL_ABSENT", readLedger(PROJECT).exists === false);
    await shot("S3b-image-directive-rejected");
    // remove the restored attachment so the report ends in a clean composer state
    await click("#attach-row .attach-rm");
    await settle();

    const ledger = readLedger(PROJECT);
    report.ledger = summarizeLedger(ledger);
    fs.writeFileSync(path.join(OUT, "ledger-snapshot.json"), JSON.stringify(ledger, null, 2));
    const listReply = await listDirectives(PROJECT);
    check(
      "MAIN_DIRECTIVE_LIST_EMPTY",
      listReply?.ok === true &&
        listReply.ledgerErrors === 0 &&
        listReply.approval?.active?.length === 0 &&
        listReply.decision?.active?.length === 0,
      { ok: listReply?.ok, ledgerErrors: listReply?.ledgerErrors },
    );
    report.notes = await notesText();
  };

  // —————————————————————— phase: restart-create ——————————————————————
  const runRestartCreate = async () => {
    await setupPage();
    const sessionText = '@审批 允许 shell "npm install" until=session';
    check("R1_SESSION_INPUT", await enterSend(sessionText));
    check("R1_SESSION_DIALOG", await waitDialog());
    const sessionDialog = await readDialog();
    check("R1_SESSION_FIELDS", sessionDialog.raw === sessionText && sessionDialog.confirmDisabled === false, sessionDialog);
    const notesBeforeSession = await noteCount();
    await confirmDialog(false);
    const sessionReceipt = await waitNewNote(notesBeforeSession, (text) => /^已记录审批指令 #d-\d+$/.test(text), 8000);
    const sessionId = receiptId(sessionReceipt);
    check("R1_SESSION_RECEIPT", sessionReceipt !== null && typeof sessionId === "string", { receipt: sessionReceipt });

    const onceText = '@审批 允许 shell "npm test" once';
    check("R1_ONCE_INPUT", await enterSend(onceText));
    check("R1_ONCE_DIALOG", await waitDialog());
    const onceDialog = await readDialog();
    check("R1_ONCE_FIELDS", onceDialog.raw === onceText && onceDialog.confirmDisabled === false, onceDialog);
    const notesBeforeOnce = await noteCount();
    await confirmDialog(false);
    const onceReceipt = await waitNewNote(notesBeforeOnce, (text) => /^已记录审批指令 #d-\d+$/.test(text), 8000);
    const onceId = receiptId(onceReceipt);
    check("R1_ONCE_RECEIPT", onceReceipt !== null && typeof onceId === "string" && onceId !== sessionId, { receipt: onceReceipt });

    const ledger = readLedger(PROJECT);
    report.ledger = summarizeLedger(ledger);
    fs.writeFileSync(path.join(OUT, "ledger-snapshot.json"), JSON.stringify(ledger, null, 2));
    check(
      "R1_LEDGER_CREATED",
      ledger.events.some((e) => e.kind === "directive.created" && e.id === sessionId && e.until === "session") &&
        ledger.events.some((e) => e.kind === "directive.created" && e.id === onceId && e.until === "once"),
      { sessionId, onceId, events: report.ledger.events },
    );
    const listReply = await listDirectives(PROJECT);
    check(
      "R1_LIST_ACTIVE",
      listReply?.ok === true &&
        listReply.approval?.active?.some((item) => item.id === sessionId && item.status === "active") &&
        listReply.approval?.active?.some((item) => item.id === onceId && item.status === "active"),
      { active: listReply?.approval?.active?.map((item) => ({ id: item.id, until: item.until, status: item.status })) },
    );
    check("R1_PANEL_OPEN", await openPanel());
    check(
      "R1_PANEL_ACTIVE_ROWS",
      await waitFor(
        `(() => { const a = document.getElementById(${JSON.stringify("directive-row-" + sessionId)}); const b = document.getElementById(${JSON.stringify("directive-row-" + onceId)}); return !!a && !!b && a.getAttribute('data-status') === 'active' && b.getAttribute('data-status') === 'active'; })()`,
        5000,
      ),
      { sessionId, onceId },
    );
    await shot("R1-panel-before-restart-active");
    await closePanel();
    report.ids = { sessionId, onceId };
    report.sessionIdOfRun = report.sessionId;
  };

  // —————————————————————— phase: restart-verify ——————————————————————
  const runRestartVerify = async () => {
    await setupPage();
    const ledgerBefore = readLedger(PROJECT);
    check("R2_LEDGER_PRESENT", ledgerBefore.exists === true, { path: ledgerBefore.path, lines: ledgerBefore.lines });
    const createdIds = ledgerBefore.events
      .filter((e) => e && e.kind === "directive.created")
      .map((e) => e.id);
    check("R2_TWO_CREATED", createdIds.length === 2 && createdIds[0] !== createdIds[1], { createdIds });
    const sessionId = createdIds[0];
    const onceId = createdIds[1];

    check("R2_PANEL_OPEN", await openPanel());
    check(
      "R2_PANEL_EXPIRED_ROWS",
      await waitFor(
        `(() => { const a = document.getElementById(${JSON.stringify("directive-row-" + sessionId)}); const b = document.getElementById(${JSON.stringify("directive-row-" + onceId)}); return !!a && !!b && a.getAttribute('data-status') === 'expired' && b.getAttribute('data-status') === 'expired'; })()`,
        8000,
      ),
      { sessionId, onceId },
    );
    const rowText = await js(`(() => {
      const a = document.getElementById(${JSON.stringify("directive-row-" + sessionId)});
      const b = document.getElementById(${JSON.stringify("directive-row-" + onceId)});
      return { a: a ? a.textContent : null, b: b ? b.textContent : null };
    })()`);
    check(
      "R2_PANEL_STATUS_TEXT",
      typeof rowText.a === "string" &&
        rowText.a.includes("已失效") &&
        typeof rowText.b === "string" &&
        rowText.b.includes("已失效") &&
        rowText.b.includes("未使用，已失效"),
      rowText,
    );
    check(
      "R2_NO_ACTIVE_ROWS",
      (await js(`document.querySelectorAll('#directive-panel-approval [data-status="active"]').length`)) === 0,
    );
    await shot("R2-panel-after-restart-expired");
    await closePanel();

    const listReply = await listDirectives(PROJECT);
    check(
      "R2_LIST_EXPIRED",
      listReply?.ok === true &&
        listReply.ledgerErrors === 0 &&
        listReply.approval?.active?.length === 0 &&
        listReply.approval?.expired?.some((item) => item.id === sessionId) &&
        listReply.approval?.expired?.some((item) => item.id === onceId),
      {
        active: listReply?.approval?.active?.map((item) => item.id),
        expired: listReply?.approval?.expired?.map((item) => item.id),
        ledgerErrors: listReply?.ledgerErrors,
      },
    );

    const ledgerAfter = readLedger(PROJECT);
    report.ledger = summarizeLedger(ledgerAfter);
    fs.writeFileSync(path.join(OUT, "ledger-snapshot.json"), JSON.stringify(ledgerAfter, null, 2));
    const expiredEvents = ledgerAfter.events.filter((e) => e && e.kind === "directive.expired");
    check(
      "R2_LEDGER_EXPIRED_REASONS",
      expiredEvents.some((e) => e.id === sessionId && e.reason === "app-restart") &&
        expiredEvents.some((e) => e.id === onceId && e.reason === "unused-once"),
      expiredEvents,
    );
    check(
      "R2_NO_FAKE_RECEIPT",
      ((await notesText()) || []).every((text) => typeof text !== "string" || !text.includes("已记录")),
      { notes: await notesText() },
    );
    report.ids = { sessionId, onceId };
    report.notes = await notesText();
  };

  // —————————————————————— phase: bad-ledger ——————————————————————
  const runBadLedger = async () => {
    const seeded = readLedger(PROJECT);
    check("B_LEDGER_PRESENT", seeded.exists === true, { path: seeded.path, lines: seeded.lines, bytes: seeded.bytes });
    fs.writeFileSync(path.join(OUT, "ledger-before.json"), JSON.stringify(seeded, null, 2));
    await setupPage();
    check("B_PANEL_OPEN", await openPanel());
    check(
      "B_PANEL_LEDGER_ERRORS",
      await waitFor(`!!document.getElementById('directive-panel-ledger-errors')`, 8000),
      { text: await js(`document.getElementById('directive-panel-ledger-errors')?.textContent ?? null`) },
    );
    const errorText = await js(`document.getElementById('directive-panel-ledger-errors')?.textContent ?? null`);
    const errorCount = (() => {
      const match = typeof errorText === "string" ? /（(\d+) 条坏行）/.exec(errorText) : null;
      return match ? Number(match[1]) : null;
    })();
    check(
      "B_LEDGER_ERRORS_TEXT",
      typeof errorText === "string" &&
        errorText.includes("指令账本不可用") &&
        errorText.includes("客户指令未生效") &&
        typeof errorCount === "number" &&
        errorCount > 0,
      { errorText, errorCount },
    );
    check(
      "B_NO_ACTIVE_ROWS",
      (await js(`document.querySelectorAll('#directive-panel-approval [data-status="active"]').length`)) === 0,
    );
    check("B_NO_FAKE_RECEIPT", ((await notesText()) || []).every((text) => typeof text !== "string" || !text.includes("已记录")));
    await shot("B1-panel-ledger-errors");
    await closePanel();

    const listReply = await listDirectives(PROJECT);
    check(
      "B_LIST_LEDGER_ERRORS",
      listReply?.ok === true && typeof listReply.ledgerErrors === "number" && listReply.ledgerErrors > 0,
      { ok: listReply?.ok, ledgerErrors: listReply?.ledgerErrors },
    );

    // ordinary chat path remains available (no directive interception)
    const chatText = "你好";
    const notesBeforeChat = await noteCount();
    check("B_CHAT_INPUT_SENT", await enterSend(chatText));
    check("B_CHAT_USER_BUBBLE", await hasUserBubble(chatText), { rows: await userRowsText() });
    const chatEntry = await waitSend(chatText);
    check(
      "B_CHAT_NORMAL_PATH",
      chatEntry !== null &&
        typeof chatEntry.res === "object" &&
        chatEntry.res.directive === undefined &&
        chatEntry.res.directiveCancelled === undefined,
      chatEntry?.res ?? null,
    );
    check("B_CHAT_NO_RECEIPT", (await noteCount()) === notesBeforeChat, { notes: await notesText() });
    await shot("B2-ordinary-chat-after-bad-ledger");

    // decision consumer: bad ledger -> treat as no directive -> normal customer card
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
    const pushedBefore = pushedOperatorRequests.length;
    const decisionPromise = customerChannel.customerInput(decisionCard, ctx);
    check(
      "B_DECISION_CARD_PRESENTED",
      await waitFor(`!!document.getElementById('decision-dialog')`, 8000),
      { pushed: pushedOperatorRequests.length - pushedBefore },
    );
    await shot("B3-decision-card-normal-path");
    const payload = pushedOperatorRequests[pushedBefore];
    if (payload !== undefined) {
      customerChannel.respond({ id: payload.id, decision: { kind: "choice", selected: ["alpha"] } });
    }
    const outcome = await withTimeout(decisionPromise, 12000);
    check(
      "B_DECISION_NOT_AUTO_SELECTED",
      outcome?.outcome === "answered" &&
        Array.isArray(outcome.value?.selected) &&
        outcome.value.selected[0] === "alpha" &&
        outcome.directive === undefined &&
        outcome.operatorId === "d2s-probe-operator",
      outcome,
    );
    if (await js(`!!document.getElementById('decision-dialog')`)) {
      await click("#decision-dialog .dd-later");
    }
    await settle();

    const ledgerAfter = readLedger(PROJECT);
    report.ledger = summarizeLedger(ledgerAfter);
    fs.writeFileSync(path.join(OUT, "ledger-after.json"), JSON.stringify(ledgerAfter, null, 2));
    check(
      "B_LEDGER_UNCHANGED_BY_CONSUMERS",
      ledgerAfter.lines === seeded.lines && ledgerAfter.bytes === seeded.bytes,
      { before: { lines: seeded.lines, bytes: seeded.bytes }, after: { lines: ledgerAfter.lines, bytes: ledgerAfter.bytes } },
    );
    report.notes = await notesText();
  };

  try {
    if (PHASE === "main") await runMain();
    else if (PHASE === "restart-create") await runRestartCreate();
    else if (PHASE === "restart-verify") await runRestartVerify();
    else if (PHASE === "bad-ledger") await runBadLedger();
    report.csp = (await js(`window.__smokeCsp || []`)) ?? [];
    const badConsole = report.console.filter((item) => String(item.level) === "error" || item.level === 3);
    check("NO_CONSOLE_ERRORS", badConsole.length === 0, badConsole);
    check("NO_CSP_VIOLATIONS", report.csp.length === 0, report.csp);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("D2S_PROBE_RUN_ERROR", report.error);
    try {
      fs.writeFileSync(path.join(OUT, "console-error.json"), JSON.stringify(report.console, null, 2));
    } catch {}
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(`D2S_PROBE_DONE phase=${PHASE} failures=${report.failures} checks=${report.checks.length} screenshots=${report.screenshots.length} out=${OUT}`);
    app.exit(report.failures === 0 ? 0 : 1);
  }
}).catch((error) => {
  fatal("whenReady failed: " + String(error && error.stack ? error.stack : error));
});

setTimeout(() => {
  console.error("D2S_PROBE_TIMEOUT");
  fatal("watchdog timeout");
}, 180000);
