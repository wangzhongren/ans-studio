#!/usr/bin/env node
/**
 * NL test-only probe (evidence only; test role; not a product/test source file).
 *
 * Real Electron run of the natural-language directive path on the current candidate:
 *   real preload (app/preload.cjs) + real renderer bundle (app/renderer/dist) + real
 *   DesktopInterface (app/desktop/interface.ts) + real directive controller
 *   (app/desktop/directive-input.ts -> real B1 Pipeline ledger) + real customer-input
 *   channel decision consumer (app/desktop/customer-input.ts).
 *
 * Covers the natural-language directive scenarios (2026-11-04 customer direct fix):
 *   NL1 `@审批 让 npm install 跑一次` -> interpreter prefill -> confirm dialog
 *       (raw text/action/resource/until) -> confirm -> durable d-1 + receipt row.
 *   NL2 `@决策 以后都选推荐项` -> select-recommended prefill; switch-off project-wide
 *       high risk -> confirm disabled until acknowledged -> confirm -> durable d-2 + receipt.
 *   NL3 `@审批 这个不需要了` -> low confidence -> fallback panel (raw + unrecognized,
 *       confirm disabled) -> cancel -> no ledger event.
 *
 * Run from repo root:
 *   ./node_modules/.bin/electron test/测试/customer-authorization-plane-nl-probe.mjs
 * Optional env ANS_NL_PROBE_OUT=<dir> (default: this task's evidence probe-run dir).
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
const OUT = process.env.ANS_NL_PROBE_OUT
  ? path.resolve(process.env.ANS_NL_PROBE_OUT)
  : path.join(REPO, "角色卡", "测试", "docs", "change", "2026-11-04_customer-authorization-plane-nl-evidence", "probe-run");
const USER_DATA = path.join(OUT, "userData");
const PROJECT = path.join(OUT, "project");
const PROJECT2 = path.join(OUT, "project-2");
const RENDERER_ENTRY = path.join(REPO, "app", "renderer", "dist", "index.html");
const PRELOAD = path.join(REPO, "app", "preload.cjs");
const LEDGER_REL = [".ans", "state", "customer-directives.jsonl"];

const report = {
  probe: "customer-authorization-plane-nl",
  startedAt: new Date().toISOString(),
  repo: REPO,
  out: OUT,
  userData: USER_DATA,
  project: PROJECT,
  project2: PROJECT2,
  rendererEntry: RENDERER_ENTRY,
  preload: PRELOAD,
  head: process.env.ANS_NL_HEAD ?? null,
  windowSize: null,
  sessionId: "d2-probe-" + Date.now(),
  checks: [],
  interpretCalls: [],
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
  console.error("NL_PROBE_ERROR", message);
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
    // 自然语言（2026-11-04 客户直修）：解释只预填面板；本探针用桩件替代模型（其余全走产品真实实现）。
    interpret: (request) =>
      desktop !== null
        ? desktop.interpretDirective(request)
        : Promise.resolve({ ok: false, reasonCode: "unavailable" }),
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
    // 探针只替换「判断 AI 模型」这一步：解释器驱动、SessionManager、控制器、面板、账单均走真实实现。
    createDirectiveInterpreterFn: (opts) => async (req) => {
      report.interpretCalls.push({
        target: req.target,
        body: req.body,
        runtime: opts.runtime,
        projectRoot: opts.project.projectRoot,
      });
      if (req.target === "approval" && /npm install/.test(req.body)) {
        return {
          ok: true,
          candidate: {
            action: { kind: "allow", resource: { type: "shell", command: "npm install" } },
            until: "session",
            confidence: 0.93,
          },
          confidence: 0.93,
        };
      }
      if (req.target === "decision" && /推荐/.test(req.body)) {
        return {
          ok: true,
          candidate: { action: { kind: "select-recommended" }, until: "session", confidence: 0.9 },
          confidence: 0.9,
        };
      }
      return { ok: false, reasonCode: "low-confidence" };
    },
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
  console.log("NL_PROBE_READY sessionId=" + report.sessionId);
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
    // 当前渲染侧无独立发送按钮：Enter 即发送（Composer.tsx `onKeyDown`）。
    const sent = await js(`(() => {
      const el = document.getElementById('inp-message');
      if (!el) return false;
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      return true;
    })()`);
    await sleep(180);
    return sent;
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
    check("COMPOSER_READY", await waitFor(`!!document.getElementById('inp-message') && !!document.getElementById('composer-capsule')`, 8000));
    check("DIRECTIVE_CAPABILITY_ON", await waitFor(`(() => { const b = document.getElementById('btn-directive-panel'); return !!b && b.disabled === false; })()`, 5000));
    await shot("00-initial-chat");

    // —————— NL1: 自然语言审批 → 判断 AI 解释 → 面板预填 → 确认 → 落账/回执 ——————
    const nl1Text = "@审批 让 npm install 跑一次";
    const nl1LedgerBefore = readLedger().events.length;
    const nl1NotesBefore = await noteCount();
    check("NL1_INPUT_SENT", await enterDirective(nl1Text));
    check("NL1_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const nl1Fields = await js(`(() => {
      const raw = document.getElementById('directive-raw-text');
      const resource = document.getElementById('directive-resource');
      const until = document.getElementById('directive-until');
      const unrecognized = document.getElementById('directive-unrecognized');
      const action = document.querySelector('#directive-dialog .directive-fields dd');
      const confirm = document.getElementById('directive-confirm');
      return {
        raw: raw ? raw.textContent : null,
        resource: resource ? resource.textContent : null,
        until: until ? until.textContent : null,
        unrecognized: unrecognized ? unrecognized.textContent : null,
        action: action ? action.textContent : null,
        confirmDisabled: confirm ? confirm.disabled : null,
      };
    })()`);
    check("NL1_RAW_TEXT", typeof nl1Fields.raw === "string" && nl1Fields.raw.includes(nl1Text), nl1Fields);
    check("NL1_PREFILL_ACTION", typeof nl1Fields.action === "string" && nl1Fields.action.length > 0, nl1Fields.action);
    check("NL1_PREFILL_RESOURCE", typeof nl1Fields.resource === "string" && nl1Fields.resource.includes("npm install"), nl1Fields.resource);
    check("NL1_PREFILL_UNTIL", typeof nl1Fields.until === "string" && nl1Fields.until.length > 0, nl1Fields.until);
    check("NL1_NO_UNRECOGNIZED", nl1Fields.unrecognized === null, nl1Fields.unrecognized);
    check("NL1_CONFIRM_ENABLED", nl1Fields.confirmDisabled === false, nl1Fields.confirmDisabled);
    check(
      "NL1_INTERPRET_CALLED",
      report.interpretCalls.some((call) => call.target === "approval" && call.body === "让 npm install 跑一次"),
      report.interpretCalls,
    );
    await scrollChatBottom();
    await shot("10-nl-approval-prefill");
    await confirmDialog(false);
    check("NL1_DIALOG_CLOSED", await waitFor(`!document.getElementById('directive-dialog')`, 5000));
    const nl1Receipt = await waitNewNote(nl1NotesBefore, (text) => /^已记录审批指令 #d-\d+$/.test(text), 8000);
    check("NL1_RECEIPT", nl1Receipt !== null, { receipt: nl1Receipt, ledger: readLedger().events.length });
    check("NL1_LEDGER_APPENDED", readLedger().events.length === nl1LedgerBefore + 1, readLedger().events.length);
    const nl1Event = readLedger().events[readLedger().events.length - 1];
    check(
      "NL1_LEDGER_ACTION",
      !!nl1Event &&
        nl1Event.target === "approval" &&
        !!nl1Event.action &&
        nl1Event.action.kind === "allow" &&
        !!nl1Event.action.resource &&
        nl1Event.action.resource.type === "shell" &&
        nl1Event.action.resource.command === "npm install" &&
        nl1Event.until === "session" &&
        nl1Event.rawText === nl1Text,
      nl1Event,
    );
    await shot("11-nl-approval-receipt");

    // —————— NL2: 自然语言决策 → select-recommended 预填 → 确认 → 落账/回执 ——————
    const nl2Text = "@决策 以后都选推荐项";
    const nl2LedgerBefore = readLedger().events.length;
    const nl2NotesBefore = await noteCount();
    check("NL2_INPUT_SENT", await enterDirective(nl2Text));
    check("NL2_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const nl2Fields = await js(`(() => {
      const raw = document.getElementById('directive-raw-text');
      const action = document.querySelector('#directive-dialog .directive-fields dd');
      const confirm = document.getElementById('directive-confirm');
      return { raw: raw ? raw.textContent : null, action: action ? action.textContent : null, confirmDisabled: confirm ? confirm.disabled : null };
    })()`);
    check("NL2_RAW_TEXT", typeof nl2Fields.raw === "string" && nl2Fields.raw.includes(nl2Text), nl2Fields);
    check("NL2_PREFILL_ACTION", typeof nl2Fields.action === "string" && nl2Fields.action.length > 0, nl2Fields.action);
    const nl2HighRisk = await js(`(() => {
      const section = document.getElementById('directive-high-risk');
      const confirm = document.getElementById('directive-confirm');
      return { visible: !!section, text: section ? section.textContent : null, confirmDisabled: confirm ? confirm.disabled : null };
    })()`);
    check("NL2_HIGH_RISK_VISIBLE", nl2HighRisk.visible === true, nl2HighRisk);
    check(
      "NL2_HIGH_RISK_SWITCH_OFF_REASON",
      typeof nl2HighRisk.text === "string" && nl2HighRisk.text.includes("「替我决策」开关关闭时的项目级自动代选"),
      nl2HighRisk.text,
    );
    check("NL2_CONFIRM_DISABLED_UNTIL_ACK", nl2HighRisk.confirmDisabled === true, nl2HighRisk.confirmDisabled);
    check(
      "NL2_INTERPRET_CALLED",
      report.interpretCalls.some((call) => call.target === "decision" && call.body === "以后都选推荐项"),
      report.interpretCalls,
    );
    await scrollChatBottom();
    await shot("12-nl-decision-prefill");
    await confirmDialog(true);
    check("NL2_DIALOG_CLOSED", await waitFor(`!document.getElementById('directive-dialog')`, 5000));
    const nl2Receipt = await waitNewNote(nl2NotesBefore, (text) => /^已记录决策指令 #d-\d+$/.test(text), 8000);
    check("NL2_RECEIPT", nl2Receipt !== null, { receipt: nl2Receipt, ledger: readLedger().events.length });
    check("NL2_LEDGER_APPENDED", readLedger().events.length === nl2LedgerBefore + 1, readLedger().events.length);
    const nl2Event = readLedger().events[readLedger().events.length - 1];
    check(
      "NL2_LEDGER_ACTION",
      !!nl2Event &&
        nl2Event.target === "decision" &&
        !!nl2Event.action &&
        nl2Event.action.kind === "select-recommended" &&
        nl2Event.until === "session" &&
        nl2Event.rawText === nl2Text &&
        !!nl2Event.highRisk &&
        nl2Event.highRisk.acknowledged === true &&
        Array.isArray(nl2Event.highRisk.reasons) &&
        nl2Event.highRisk.reasons.includes("switch-off-project-recommended"),
      nl2Event,
    );
    await shot("13-nl-decision-receipt");

    // —————— NL3: 解释失败 → 回退现有面板：原文 + 未识别片段、确认禁用；取消不落账 ——————
    const nl3Text = "@审批 这个不需要了";
    const nl3LedgerBefore = readLedger().events.length;
    check("NL3_INPUT_SENT", await enterDirective(nl3Text));
    check("NL3_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 8000));
    const nl3Fields = await js(`(() => {
      const raw = document.getElementById('directive-raw-text');
      const unrecognized = document.getElementById('directive-unrecognized');
      const notConfirmable = document.getElementById('directive-not-confirmable');
      const confirm = document.getElementById('directive-confirm');
      return {
        raw: raw ? raw.textContent : null,
        unrecognized: unrecognized ? unrecognized.textContent : null,
        notConfirmable: notConfirmable ? notConfirmable.textContent : null,
        confirmDisabled: confirm ? confirm.disabled : null,
      };
    })()`);
    check("NL3_RAW_TEXT", typeof nl3Fields.raw === "string" && nl3Fields.raw.includes(nl3Text), nl3Fields);
    check("NL3_UNRECOGNIZED_SHOWN", typeof nl3Fields.unrecognized === "string" && nl3Fields.unrecognized.includes("这个不需要了"), nl3Fields);
    check("NL3_CONFIRM_DISABLED", nl3Fields.confirmDisabled === true, nl3Fields);
    check("NL3_NOT_CONFIRMABLE_NOTE", typeof nl3Fields.notConfirmable === "string" && nl3Fields.notConfirmable.length > 0, nl3Fields);
    await scrollChatBottom();
    await shot("14-nl-fallback-disabled");
    await click("#directive-cancel");
    check("NL3_DIALOG_CLOSED", await waitFor(`!document.getElementById('directive-dialog')`, 4000));
    check("NL3_NO_LEDGER", readLedger().events.length === nl3LedgerBefore, readLedger().events.length);

    // —————— 汇总 ——————
    check("LEDGER_TOTAL_2", readLedger().events.length === 2, readLedger().events.length);
    report.ledger = readLedger();

  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("NL_PROBE_RUN_ERROR", report.error);
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(`NL_PROBE_DONE failures=${report.failures} checks=${report.checks.length} screenshots=${report.screenshots.length} out=${OUT}`);
    app.exit(report.failures === 0 ? 0 : 1);
  }
}).catch((error) => {
  fatal("whenReady failed: " + String(error && error.stack ? error.stack : error));
});

setTimeout(() => {
  console.error("NL_PROBE_TIMEOUT");
  fatal("watchdog timeout");
}, 180000);
