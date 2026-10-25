#!/usr/bin/env node
/**
 * test/桌面UI/phase4a-electron-smoke.mjs
 *
 * Phase 4A 真实 Electron 离线 IPC 冒烟（受控替身，无真实模型/网络/文件系统）：
 *  - 默认 Claude；恢复/显式 runtime 优先；
 *  - 三引擎真实 open/history 三元身份；每引擎视图缓存/切回/后台事件/旧项目丢弃；
 *  - 跨引擎草稿（内存 runtime×role；成功发送/切项目清除）；
 *  - 三引擎设置（metadata 驱动、掩码/显示、Slider/回退、保存 loading/saved/missing/error/晚到）；
 *  - 角色资料抽屉 + 文档只读（错误码/重试/链接/焦点/迟到失效）；
 *  - 工作概览（待处理/定位/当前工作/排队/最近交付/角标）；
 *  - 队列抽屉（位次/来源/全文/撤回就地回执）；
 *  - 1360/960 截图；零 console/CSP。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron test/桌面UI/phase4a-electron-smoke.mjs [entry.html] [outDir]
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ENTRY = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "app/renderer/dist/index.html");
const OUT = process.argv[3]
  ? path.resolve(process.argv[3])
  : "/tmp/ans-phase4a-smoke";
const PRELOAD = path.join(HERE, "phase4a-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/phase4a-project";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const report = {
  entry: ENTRY,
  checks: [],
  calls: {},
  console: [],
  csp: [],
  screenshots: [],
  failures: 0,
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({
    name,
    value: value === true,
    detail: detail === undefined ? null : detail,
  });
  if (value !== true) report.failures += 1;
  console.log(
    `CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`,
  );
  return value === true;
}

let win = null;
let reloads = 0;

const state = {
  recovery: {},
  missing: { pi: [], codex: [], claude: [] },
  application: "next-session",
  configDeferred: false,
  configPending: [],
  openDeferred: false,
  openPending: [],
  saveMode: "success",
  saveDeferred: false,
  savePending: [],
  customRange: false,
  docMode: "success",
  docPending: [],
  docDeferred: false,
  // Windows 形状：索引仍列根文档名，但无 scope/refs，读取不可用（Q9 A）。
  docsUnavailable: false,
  withdrawMode: "deferred",
  withdrawPending: [],
  withdrawThrow: false,
  activeQueue: [
    { id: "q-msg", kind: "message", summary: "客户排队消息", full: "客户排队消息全文与补充说明。", at: "2026-10-21T10:01:00Z" },
    { id: "q-dispatch", kind: "dispatch", sourceRoleId: "B", summary: "派发任务", full: "", at: "2026-10-21T10:02:00Z" },
    { id: "q-handback", kind: "handback", sourceRoleId: "B", summary: "交付报告", full: "", at: "2026-10-21T10:03:00Z" },
  ],
  busy: true,
  pendingOperator: null,
  shell: null,
};
const calls = {
  opens: [],
  histories: [],
  stops: [],
  configReads: [],
  configSaves: [],
  docReads: [],
  external: [],
  withdraws: [],
  sends: [],
  windows: [],
};
report.calls = calls;

const roleA = {
  roleId: "A",
  cardPath: ROOT + "/角色卡/A/role-card.md",
  cardText: "# A\n\n" + "资料内容用于检查阅读态。\n\n".repeat(80),
  boundary: {
    entries: [
      { kind: "directory", root: "P", path: "app/", purpose: "渲染层" },
      { kind: "conditional-directory", root: "P", path: "docs/", purpose: "条件目录", condition: "需要批准" },
      { kind: "file", root: "P", path: "角色卡/A/role-card.md", purpose: "角色卡" },
    ],
  },
  boundaryPath: "角色卡/A/boundary.yaml",
  changelog: { path: "角色卡/A/changelog.md", text: "# 变更记录\n\n" + "保留变更阅读位置。\n\n".repeat(100) },
  docs: Array.from({ length: 100 }, (_, index) => ({ kind: "file", path: "docs/record-" + index + ".md" })),
  // 角色根文档（S4 夹具：主进程索引的元数据形状；顺序即展示顺序）。
  rootDocs: [
    { name: "feature-map.md", path: ROOT + "/角色卡/A/feature-map.md", kind: "file" },
    { name: "functional-description.md", path: ROOT + "/角色卡/A/functional-description.md", kind: "file" },
    { name: "api-spec.md", path: ROOT + "/角色卡/A/api-spec.md", kind: "file" },
  ],
  // opaque 引用：根文档追加在既有 docs 之后（不复制正文）。
  documents: [
    {
      version: 1,
      projectViewId: "epoch-one",
      documentId: "doc-one",
      roleId: "A",
      relativePath: "角色卡/A/docs/one.md",
      label: "报告 1",
      format: "markdown",
    },
    {
      version: 1,
      projectViewId: "epoch-one",
      documentId: "doc-two",
      roleId: "A",
      relativePath: "角色卡/A/docs/two.md",
      label: "报告 2",
      format: "text",
    },
    {
      version: 1,
      projectViewId: "epoch-one",
      documentId: "root-feature-map",
      roleId: "A",
      relativePath: ROOT + "/角色卡/A/feature-map.md",
      label: "feature-map.md",
      format: "markdown",
    },
    {
      version: 1,
      projectViewId: "epoch-one",
      documentId: "root-functional-description",
      roleId: "A",
      relativePath: ROOT + "/角色卡/A/functional-description.md",
      label: "functional-description.md",
      format: "markdown",
    },
    {
      version: 1,
      projectViewId: "epoch-one",
      documentId: "root-api-spec",
      roleId: "A",
      relativePath: ROOT + "/角色卡/A/api-spec.md",
      label: "api-spec.md",
      format: "markdown",
    },
  ],
};
const roleB = {
  roleId: "B",
  cardPath: ROOT + "/角色卡/B/role-card.md",
  cardText: "# B\n\nB 角色资料",
  boundary: { entries: [] },
  boundaryPath: "",
  changelog: null,
  docs: [],
  documents: [],
};

function listing(projectRoot = ROOT) {
  const roles = [
    { ...roleA, cardPath: projectRoot + "/角色卡/A/role-card.md" },
    { ...roleB, cardPath: projectRoot + "/角色卡/B/role-card.md" },
  ];
  if (state.docsUnavailable) {
    // 与 Windows 真实回包同形：索引元数据仍在，但 scope 缺席、无 refs、读取不可用。
    return {
      projectRoot,
      primaryRoleId: "A",
      hasRoles: true,
      warnings: [],
      documentReadUnavailable: "UNSUPPORTED_ENVIRONMENT",
      roles: roles.map((role) => ({ ...role, documents: [] })),
    };
  }
  return {
    projectRoot,
    primaryRoleId: "A",
    hasRoles: true,
    warnings: [],
    documentScope: { version: 1, projectViewId: "epoch-one", projectRoot },
    roles,
  };
}

function runtimeConfig(runtime) {
  calls.configReads.push(runtime);
  const definition = RUNTIME_SETTINGS[runtime];
  const missing = state.missing[runtime] || [];
  return {
    runtime,
    label: definition.label,
    path: ROOT + "/" + "a-very-long-path/".repeat(12) + ".env",
    revision: 0,
    application: state.application,
    missingKeys: missing,
    fields: definition.fields.map((field) => {
      let value = "";
      if (!field.secret) {
        if (field.key === "ANS_PI_CONTEXT_WINDOW") {
          value = state.customRange ? "123457" : "65536";
        } else if (field.key === "ANS_PI_PROMPT_TIMEOUT_MS") {
          value = "";
        } else if (field.required) {
          value = "fixture";
        }
      }
      return {
        ...field,
        value,
        isSet: field.required ? !missing.includes(field.key) : value !== "",
        source: field.secret && runtime === "codex" ? "fallback" : field.required ? "environment" : "default",
        fallbackKey: field.secret && runtime === "codex" ? "OPENAI_API_KEY" : undefined,
      };
    }),
  };
}

ipcMain.handle("app:recovery-state", () => state.recovery);
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", (_e, input) => listing(input?.projectRoot || ROOT));
ipcMain.handle("session:open", (_e, input) => {
  calls.opens.push(input);
  const reply = () => ({
    ok: true,
    resumed: true,
    contextSource: "resumed",
    runtime: input.runtime,
    projectRoot: input.projectRoot,
  });
  if (state.openDeferred) {
    return new Promise((resolve) => state.openPending.push({ resolve: () => resolve(reply()) }));
  }
  return reply();
});
ipcMain.handle("session:history-get", (_e, input) => {
  calls.histories.push(input);
  return {
    projectRoot: input.projectRoot,
    roleId: input.roleId,
    runtime: input.runtime,
    rows: [{ kind: "assistant", text: input.runtime + " 引擎历史行", turnId: input.runtime + "-history" }],
    error: null,
    skipped: 0,
  };
});
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", (_e, input) => {
  calls.stops.push(input);
  return { ok: true };
});
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", (_e, input) => {
  calls.sends.push(input);
  return { ok: true, turnId: "smoke-turn-" + calls.sends.length, runtime: input.target?.runtime };
});
ipcMain.handle("session:operator-response", () => ({ ok: true }));
ipcMain.handle("shell:confirm-response", () => ({ ok: true }));
ipcMain.handle("recovery:confirm-response", () => ({ ok: true }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("runtime-config:get", (_e, input) => {
  if (state.configDeferred) {
    return new Promise((resolve) => state.configPending.push({ runtime: input.runtime, resolve }));
  }
  return runtimeConfig(input.runtime);
});
ipcMain.handle("runtime-config:save", (_e, input) => {
  calls.configSaves.push({ runtime: input.runtime, updates: input.updates });
  const reply = () =>
    state.saveMode === "fail"
      ? { ok: false, error: "离线原子写失败" }
      : {
          ok: true,
          runtime: input.runtime,
          appliedKeys: Object.keys(input.updates),
          revision: 1,
          application: state.application,
        };
  if (state.saveDeferred) {
    return new Promise((resolve) => state.savePending.push({ resolve: () => resolve(reply()) }));
  }
  return reply();
});
ipcMain.handle("pi-config:get", () => {
  const view = runtimeConfig("pi");
  return { path: view.path, fields: view.fields };
});
ipcMain.handle("pi-config:save", (_e, input) => ({ ok: true, appliedKeys: Object.keys(input.updates || {}) }));
ipcMain.handle("project:document-read", (_e, input) => {
  calls.docReads.push(input);
  const reply = () => {
    if (state.docMode === "TOO_LARGE") {
      return { ok: false, version: 1, projectViewId: input.projectViewId, documentId: input.documentId, code: "TOO_LARGE", message: "fixed" };
    }
    if (state.docMode === "IO_ERROR") {
      return { ok: false, version: 1, projectViewId: input.projectViewId, documentId: input.documentId, code: "IO_ERROR", message: "fixed" };
    }
    if (state.docMode === "PROJECT_NOT_GRANTED") {
      return { ok: false, version: 1, projectViewId: input.projectViewId, documentId: input.documentId, code: "PROJECT_NOT_GRANTED", message: "fixed" };
    }
    if (input.documentId === "root-feature-map") {
      return {
        ok: true,
        version: 1,
        projectViewId: input.projectViewId,
        documentId: input.documentId,
        roleId: "A",
        relativePath: ROOT + "/角色卡/A/feature-map.md",
        format: "markdown",
        byteLength: 34,
        text: "# 功能导航\n\n根文档正文 feature map",
      };
    }
    if (input.documentId === "root-functional-description") {
      return {
        ok: true,
        version: 1,
        projectViewId: input.projectViewId,
        documentId: input.documentId,
        roleId: "A",
        relativePath: ROOT + "/角色卡/A/functional-description.md",
        format: "markdown",
        byteLength: 46,
        text: "# 模块视图\n\n根文档正文 functional description",
      };
    }
    if (input.documentId === "root-api-spec") {
      return {
        ok: true,
        version: 1,
        projectViewId: input.projectViewId,
        documentId: input.documentId,
        roleId: "A",
        relativePath: ROOT + "/角色卡/A/api-spec.md",
        format: "markdown",
        byteLength: 14,
        text: "not-applicable",
      };
    }
    if (input.documentId === "doc-two") {
      return {
        ok: true,
        version: 1,
        projectViewId: input.projectViewId,
        documentId: input.documentId,
        roleId: "A",
        relativePath: "角色卡/A/docs/two.md",
        format: "text",
        byteLength: 20,
        text: "纯文本正文 two",
      };
    }
    return {
      ok: true,
      version: 1,
      projectViewId: input.projectViewId,
      documentId: input.documentId,
      roleId: "A",
      relativePath: "角色卡/A/docs/one.md",
      format: "markdown",
      byteLength: 120,
      text:
        "# 已列文档\n\n<script>window.BAD_DOC=1</script>\n\n![image](https://invalid.example/x.png)\n\n" +
        "[内部文档](./two.md)\n\n[外部文档](https://example.com/doc)\n\n[未知文档](./missing.md)\n\n文档正文",
    };
  };
  if (state.docDeferred) {
    return new Promise((resolve) => state.docPending.push({ resolve: () => resolve(reply()) }));
  }
  return reply();
});
ipcMain.handle("app:open-external", (_e, input) => {
  calls.external.push(input.url);
  return { ok: true };
});
ipcMain.handle("session:withdraw", (_e, input) => {
  calls.withdraws.push(input);
  if (state.withdrawMode === "throw") {
    return Promise.reject(new Error("离线受控网络不可用"));
  }
  const reply = () => {
    if (state.withdrawMode === "success") {
      state.activeQueue = state.activeQueue.filter((item) => item.id !== input.id);
      if (win) {
        win.webContents.send("session:role-state", roleStateSnapshot());
      }
      return { ok: true, summary: "客户排队消息" };
    }
    if (state.withdrawMode === "fail") {
      return { ok: false, error: "离线受控拒绝" };
    }
    return new Promise((resolve) => state.withdrawPending.push({ resolve: () => resolve({ ok: false, error: "离线受控拒绝" }) }));
  };
  return reply();
});
ipcMain.handle("app:pick-image", () => ({
  ok: true,
  image: { name: "fixture.png", mime: "image/png", size: 68, dataBase64: PNG },
}));
ipcMain.handle("app:attach-image", (_e, input) => ({
  ok: true,
  image: { name: input.name || "pasted.png", mime: "image/png", size: 68 },
}));
ipcMain.handle("window:minimize", () => {
  calls.windows.push("minimize");
  return { ok: true };
});
ipcMain.handle("window:toggle-maximize", () => {
  calls.windows.push("maximize");
  return { ok: true };
});
ipcMain.handle("window:close", () => {
  calls.windows.push("close");
  return { ok: true };
});
ipcMain.handle("window:is-maximized", () => false);

function roleStateSnapshot(extra = {}) {
  return {
    projectRoot: ROOT,
    roleId: "A",
    runtime: "pi",
    busy: state.busy,
    summaries: state.activeQueue.map((item) => item.summary),
    queue: state.activeQueue,
    running: state.busy
      ? { id: "q-running", kind: "message", summary: "正在处理当前请求", full: "", at: "2026-10-21T10:00:00Z" }
      : null,
    ...extra,
  };
}

const watchdog = setTimeout(() => {
  report.failures += 1;
  report.checks.push({ name: "SMOKE_WATCHDOG_TIMEOUT", value: false, detail: null });
  try {
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } catch {
    /* 忽略 */
  }
  console.log("PHASE4A_SMOKE_WATCHDOG_TIMEOUT");
  app.exit(2);
}, 150000);

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message });
  });
  wc.on("did-fail-load", (_event, code, description) => {
    report.console.push({ level: "did-fail-load", message: code + " " + description });
  });
  const js = (code) =>
    wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }
  const push = async (channel, payload) => {
    await js(`window.desktop.__smoke.emit(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`);
    await sleep(90);
  };
  const key = async (name, modifiers = []) => {
    const keyCode = ({ Enter: "Return", ArrowDown: "Down", ArrowUp: "Up", ArrowRight: "Right", ArrowLeft: "Left" })[name] || name;
    wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (name === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await sleep(60);
  };
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  try {
  await win.loadFile(ENTRY);
  await sleep(400);
  await waitFor(`!!document.querySelector('#root > .app-shell')`);

  // —————— 0. 默认引擎 / 恢复显式优先 ——————
  check(
    "DEFAULT_RUNTIME_IS_CLAUDE_WITHOUT_RECOVERY",
    await js(`window.__ansRenderer.state.runtime==='claude'&&window.__ansRenderer.state.projectRoot===null&&document.getElementById('runtime-select').disabled===true`),
  );
  state.recovery = { projectRoot: ROOT, roleId: "A", runtime: "pi" };
  win.reload();
  reloads += 1;
  await sleep(700);
  await waitFor(`window.__ansRenderer&&!!window.__ansRenderer.state.projectRoot`);
  await sleep(200);
  check(
    "RECOVERY_EXPLICIT_RUNTIME_WINS",
    await js(`window.__ansRenderer.state.runtime==='pi'&&window.__ansRenderer.state.projectRoot===${JSON.stringify(ROOT)}&&window.__ansRenderer.state.sessionOpenRoleId==='A'`),
  );
  check(
    "RECOVERY_OPEN_USES_EXPLICIT_RUNTIME",
    calls.opens.some((input) => input.runtime === "pi" && input.projectRoot === ROOT && input.roleId === "A"),
    calls.opens.slice(-2),
  );
  state.recovery = {};

  // —————— 1. 三引擎真实 open/history + 每引擎视图缓存/切回 ——————
  check("PI_HISTORY_REAL_FROM_SESSION", await js(`document.getElementById('chat').textContent.includes('pi 引擎历史行')`));
  await push("session:events", [{ projectRoot: ROOT, roleId: "A", runtime: "pi", event: { kind: "message", turnId: "pi-live", summary: "Pi 实时消息" } }]);
  await push("session:role-state", roleStateSnapshot());
  await js(`document.getElementById('inp-message').value='Pi 草稿';document.getElementById('inp-message').dispatchEvent(new Event('input'))`);

  const stopCount = calls.stops.length;
  const openCount = calls.opens.length;
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  await sleep(180);
  check("SWITCH_CODEX_REAL_SESSION_TARGET", calls.opens.at(-1)?.runtime === "codex" && calls.histories.at(-1)?.runtime === "codex", calls.opens.at(-1));
  check(
    "SWITCH_CODEX_SHOWS_ONLY_CODEX_VIEW",
    await js(`window.__ansRenderer.state.runtime==='codex'&&document.getElementById('chat').textContent.includes('codex 引擎历史行')&&!document.getElementById('chat').textContent.includes('Pi 实时消息')&&!document.getElementById('chat').textContent.includes('pi 引擎历史行')&&document.getElementById('inp-message').value===''`),
  );
  check("SWITCH_DOES_NOT_STOP_BACKGROUND", calls.stops.length === stopCount, calls.stops.slice(stopCount));

  await push("session:events", [
    { projectRoot: ROOT, roleId: "A", runtime: "pi", event: { kind: "message", turnId: "pi-bg", summary: "Pi 后台消息" } },
    { projectRoot: "/old-project", roleId: "A", runtime: "codex", event: { kind: "message", summary: "旧项目不得出现" } },
  ]);
  check(
    "FOREIGN_RUNTIME_CACHE_ONLY_AND_STALE_PROJECT_DROPPED",
    await js(`!document.getElementById('chat').textContent.includes('Pi 后台消息')&&!document.getElementById('chat').textContent.includes('旧项目不得出现')`),
  );
  await js(`document.getElementById('inp-message').value='Codex 草稿';document.getElementById('inp-message').dispatchEvent(new Event('input'))`);

  await js(`await window.__ansRenderer.selectRuntime('claude')`);
  await sleep(180);
  check(
    "SWITCH_CLAUDE_REAL_HISTORY_AND_DRAFT_ISOLATED",
    await js(`window.__ansRenderer.state.runtime==='claude'&&document.getElementById('chat').textContent.includes('claude 引擎历史行')&&!document.getElementById('chat').textContent.includes('codex 引擎历史行')&&document.getElementById('inp-message').value===''`) &&
      calls.opens.at(-1)?.runtime === "claude",
  );
  await js(`document.getElementById('inp-message').value='Claude 草稿';document.getElementById('inp-message').dispatchEvent(new Event('input'))`);

  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await sleep(220);
  check(
    "SWITCH_BACK_PI_RESTORES_HISTORY_EVENT_QUEUE_AND_DRAFT",
    await js(`window.__ansRenderer.state.runtime==='pi'&&document.getElementById('chat').textContent.includes('pi 引擎历史行')&&document.getElementById('chat').textContent.includes('Pi 实时消息')&&document.getElementById('chat').textContent.includes('Pi 后台消息')&&document.getElementById('inp-message').value==='Pi 草稿'&&window.__ansRenderer.state.roleBusy.A===true`),
    await js(`({chat:document.getElementById('chat').textContent.slice(0,200),draft:document.getElementById('inp-message').value,busy:window.__ansRenderer.state.roleBusy.A})`),
  );
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  await sleep(180);
  check("CROSS_ENGINE_DRAFT_CODEX_RETAINED", await js(`document.getElementById('inp-message').value==='Codex 草稿'`));
  await js(`await window.__ansRenderer.selectRuntime('claude')`);
  await sleep(180);
  check("CROSS_ENGINE_DRAFT_CLAUDE_RETAINED", await js(`document.getElementById('inp-message').value==='Claude 草稿'`));
  await shot("1360-engine-claude");

  // 切换中状态：session:open 受控挂起，触发器 aria-busy + 转轮；不重复提交。
  state.openDeferred = true;
  await js(`(()=>{const t=document.getElementById('runtime-select');t.focus();t.click();})()`);
  await sleep(80);
  await js(`document.getElementById('runtime-option-codex').click()`);
  await sleep(120);
  check(
    "SWITCHING_STATE_ARIA_BUSY_AND_SINGLE_SUBMIT",
    await js(`document.getElementById('runtime-select').getAttribute('aria-busy')==='true'&&!!document.querySelector('#runtime-select .engine-switching')&&window.__ansRenderer.state.runtime==='codex'`),
  );
  await shot("1360-switching");
  await js(`document.getElementById('runtime-select').click()`);
  await sleep(60);
  check(
    "SWITCHING_IGNORES_REPEAT_MENU",
    await js(`document.getElementById('runtime-options').hidden===true`),
  );
  state.openPending.at(-1)?.resolve();
  await sleep(220);
  state.openDeferred = false;
  await js(`await window.__ansRenderer.selectRuntime('claude')`);
  await sleep(220);
  check("SWITCH_BACK_CLAUDE_AFTER_DEFERRED_OPEN", await js(`window.__ansRenderer.state.runtime==='claude'`));

  // C2 同因记录：失效 shell 卡在本引擎内收起并如实提示原因（2026-10-18 决定不保留
  // 按钮全禁用的「已失效」卡）；旧入口同名 check 即为既有基线红。
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await sleep(220);
  await push("shell:confirm-request", {
    projectRoot: ROOT,
    roleId: "A",
    runtime: "pi",
    id: "smoke-shell-expired",
    policy: "project",
    command: "echo shell",
    summary: "逐字命令",
    reasonPlain: "冒烟原因",
    cwd: ROOT,
    argvLines: ["echo", "shell"],
  });
  check("OWN_ENGINE_SHELL_CARD_VISIBLE", await js(`!document.getElementById('shell-confirm').hidden`));
  await push("session:operator-expired", {
    projectRoot: ROOT,
    roleId: "A",
    runtime: "pi",
    id: "smoke-shell-expired",
    reason: "原 shell 轮次已中止",
  });
  check(
    "C2_SAME_CAUSE_EXPIRED_SHELL_CLOSES_WITH_REASON",
    await js(`document.getElementById('shell-confirm').hidden&&window.__ansRenderer.state.shellConfirm===null&&document.getElementById('composer-hint').textContent.includes('原 shell 轮次已中止')`),
  );
  // PM §十三 最小例外：失效 operator 卡隐藏动作按钮（保留卡片容器/原因/aria）。
  await push("session:operator-request", {
    projectRoot: ROOT,
    roleId: "A",
    runtime: "pi",
    id: "op-expired",
    request: { kind: "confirm", title: "过期确认" },
  });
  await push("session:operator-request", {
    projectRoot: ROOT,
    roleId: "A",
    runtime: "pi",
    id: "op-expired-choice",
    request: { kind: "choice", title: "过期选择", options: [{ id: "one", label: "摘要" }] },
  });
  check(
    "OPERATOR_CARD_OPEN_SHOWS_ACTIONS",
    await js(`!document.querySelector('[data-request-id="op-expired"] .op-confirm').hidden&&!document.querySelector('[data-request-id="op-expired-choice"] .op-submit').hidden`),
  );
  await push("session:operator-expired", { projectRoot: ROOT, roleId: "A", runtime: "pi", id: "op-expired", reason: "原轮次已中止" });
  await push("session:operator-expired", { projectRoot: ROOT, roleId: "A", runtime: "pi", id: "op-expired-choice", reason: "原轮次已中止" });
  check(
    "EXPIRED_OPERATOR_CARD_HIDES_ALL_ACTIONS_KEEPS_REASON",
    await js(`(()=>{const c=document.querySelector('[data-request-id="op-expired"]');const ch=document.querySelector('[data-request-id="op-expired-choice"]');return !!c&&c.dataset.state==='expired'&&c.querySelector('.op-confirm').hidden===true&&c.querySelector('.op-deny').hidden===true&&ch.querySelector('.op-submit').hidden===true&&ch.querySelector('.op-cancel').hidden===true&&c.querySelector('.op-note').textContent.includes('原轮次已中止')&&c.getAttribute('aria-label').length>0;})()`),
  );
  await js(`document.querySelector('[data-request-id="op-expired"]').scrollIntoView({block:'center'})`);
  await sleep(100);
  await shot("1360-operator-expired");
  win.setContentSize(960, 620);
  await sleep(180);
  await js(`document.querySelector('[data-request-id="op-expired"]').scrollIntoView({block:'center'})`);
  await sleep(100);
  await shot("960-operator-expired");
  await shot("960-sidebar-badge");
  win.setContentSize(1360, 860);
  await sleep(180);

  await js(`await window.__ansRenderer.selectRuntime('claude')`);
  await sleep(220);

  // 成功发送只清当前引擎草稿。
  await js(`document.getElementById('btn-send').click()`);
  await sleep(160);
  check(
    "SEND_TARGET_CURRENT_RUNTIME_AND_CLEARS_ONLY_OWN_DRAFT",
    calls.sends.at(-1)?.target?.runtime === "claude" &&
      calls.sends.at(-1)?.target?.projectRoot === ROOT &&
      calls.sends.at(-1)?.target?.roleId === "A" &&
      (await js(`document.getElementById('inp-message').value===''`)),
    calls.sends.at(-1)?.target,
  );
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await sleep(180);
  check("SEND_DOES_NOT_CLEAR_OTHER_ENGINE_DRAFT", await js(`document.getElementById('inp-message').value==='Pi 草稿'`));

  // 切项目清空所有引擎草稿（不新增持久化）。
  const otherRoot = ROOT + "-other";
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(otherRoot)})`);
  await sleep(220);
  check(
    "PROJECT_SWITCH_CLEARS_CROSS_ENGINE_DRAFTS",
    await js(`document.getElementById('inp-message').value===''`),
  );
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
  await sleep(220);
  await js(`await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('A')`);
  await sleep(160);

  // —————— 2. 设置：缺配提示 → 打开设置 → 三引擎/metadata/掩码/Slider/保存 ——————
  state.missing.claude = ["ANTHROPIC_API_KEY"];
  await js(`await window.__ansRenderer.selectRuntime('claude')`);
  await sleep(200);
  check(
    "MISSING_CONFIG_NOTICE_ACTIONABLE",
    await js(`!document.getElementById('runtime-config-notice').hidden&&document.getElementById('runtime-config-message').textContent.includes('ANTHROPIC_API_KEY')&&document.getElementById('runtime-config-settings').textContent==='打开 Claude 设置'`),
  );
  await js(`document.getElementById('runtime-config-settings').focus()`);
  await key("Enter");
  await sleep(150);
  check(
    "MISSING_ENTRY_OPENS_CURRENT_ENGINE_SETTINGS",
    await js(`window.__ansRenderer.state.rightTab==='pi'&&document.getElementById('drawer-title').textContent==='Claude 配置'&&document.getElementById('pi-inp-ANTHROPIC_API_KEY').type==='password'`),
  );
  await shot("1360-settings-missing");
  await key("Escape");
  await sleep(200);
  check(
    "SETTINGS_CLOSE_RETURNS_TO_NOTICE_INVOKER",
    await js(`document.activeElement.id==='runtime-config-settings'`),
    await js(`({active:document.activeElement.id,tag:document.activeElement.tagName,hidden:document.getElementById('runtime-config-notice').hidden,inert:!!document.getElementById('runtime-config-settings').closest('[inert]')})`),
  );
  state.missing.claude = [];

  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await sleep(200);
  await js(`document.getElementById('tab-pi').click()`);
  await sleep(150);
  const panelState = await js(`(() => {
    const panel=document.getElementById('pi-panel');
    const token=document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN');
    const base=document.getElementById('pi-inp-ANS_PI_BASE_URL');
    const model=document.getElementById('pi-inp-ANS_PI_MODEL');
    const reasoning=document.getElementById('pi-inp-ANS_PI_REASONING_EFFORT');
    const advanced=panel.querySelector('.pi-advanced');
    const thumb=panel.querySelector('.slider-thumb input');
    return {
      title:document.getElementById('drawer-title').textContent,
      token:{type:token.type,value:token.value,placeholder:token.placeholder},
      base:base.value,
      model:model.value,
      reasoning:reasoning&&{tag:reasoning.tagName,options:[...reasoning.options].map(o=>o.textContent)},
      advanced:{hidden:advanced.hidden,open:advanced.open,cw:!!document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW'),timeout:!!document.getElementById('pi-inp-ANS_PI_PROMPT_TIMEOUT_MS')},
      thumb:thumb&&{tag:thumb.tagName,min:thumb.getAttribute('aria-valuemin'),max:thumb.getAttribute('aria-valuemax'),now:thumb.getAttribute('aria-valuenow'),text:thumb.getAttribute('aria-valuetext')},
      path:document.getElementById('pi-panel-path').textContent,
      hint:panel.textContent.includes('留空')&&panel.textContent.includes('默认'),
    };
  })()`);
  check(
    "PI_SETTINGS_METADATA_DRIVEN_FIELDS",
    panelState.title === "Pi 配置" &&
      panelState.token.type === "password" &&
      panelState.token.value === "" &&
      panelState.token.placeholder === "已设置，留空则不修改" &&
      panelState.base === "fixture" &&
      panelState.model === "fixture" &&
      panelState.reasoning?.tag === "SELECT" &&
      panelState.reasoning.options.includes("关") &&
      panelState.reasoning.options.includes("极高") &&
      panelState.advanced.hidden === false &&
      panelState.advanced.open === false &&
      panelState.advanced.cw &&
      panelState.advanced.timeout &&
      panelState.path.includes(".env") &&
      panelState.hint,
    panelState,
  );
  // M3：WAI-ARIA Tabs 键盘（←/→ 循环、Home/End、roving tabindex、aria-controls/tabpanel）。
  await js(`document.getElementById('pi-engine-tab-pi').focus()`);
  await key("ArrowRight");
  await sleep(220);
  await shot("1360-tabs-keyboard");
  check(
    "SETTINGS_TABS_ARROW_RIGHT_ROVING_AND_ARIA",
    await js(`document.getElementById('drawer-title').textContent==='Codex 配置'&&document.activeElement.id==='pi-engine-tab-codex'&&document.getElementById('pi-engine-tab-codex').getAttribute('aria-selected')==='true'&&document.getElementById('pi-engine-tab-codex').tabIndex===0&&document.getElementById('pi-engine-tab-pi').tabIndex===-1&&document.getElementById('pi-engine-tab-codex').getAttribute('aria-controls')==='pi-engine-panel'&&document.getElementById('pi-engine-panel').getAttribute('role')==='tabpanel'&&document.getElementById('pi-engine-panel').getAttribute('aria-labelledby')==='pi-engine-tab-codex'`),
  );
  await key("End");
  await sleep(220);
  check(
    "SETTINGS_TABS_END_SELECTS_LAST",
    await js(`document.getElementById('drawer-title').textContent==='Claude 配置'&&document.activeElement.id==='pi-engine-tab-claude'&&document.getElementById('pi-engine-tab-claude').getAttribute('aria-selected')==='true'`),
  );
  await key("Home");
  await sleep(220);
  check(
    "SETTINGS_TABS_HOME_SELECTS_FIRST",
    await js(`document.getElementById('drawer-title').textContent==='Pi 配置'&&document.activeElement.id==='pi-engine-tab-pi'&&document.getElementById('pi-engine-tab-pi').getAttribute('aria-selected')==='true'`),
  );
  await key("ArrowLeft");
  await sleep(220);
  check(
    "SETTINGS_TABS_ARROW_LEFT_WRAPS_TO_LAST",
    await js(`document.getElementById('drawer-title').textContent==='Claude 配置'&&document.activeElement.id==='pi-engine-tab-claude'`),
  );
  await key("Home");
  await sleep(260);

  check(
    "PI_SLIDER_ACCESSIBLE_VALUE_AND_KEYBOARD",
    (await js(`(()=>{const t=document.querySelector('#pi-panel .slider-thumb input');return t&&t.getAttribute('aria-valuemin')==='0'&&t.getAttribute('aria-valuemax')==='6'&&t.getAttribute('aria-valuenow')==='2'&&t.getAttribute('aria-valuetext')==='64k'&&document.getElementById('pi-range-out-ANS_PI_CONTEXT_WINDOW').textContent==='64k'&&document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW').value==='65536';})()`)),
  );
  await js(`document.querySelector('#pi-panel .pi-advanced').open=true`);
  await sleep(80);
  await js(`document.querySelector('#pi-panel .slider-thumb').scrollIntoView({block:'center'})`);
  await sleep(120);
  check(
    "SLIDER_VISUAL_THUMB_AND_OUTPUT_IN_VIEW",
    await js(`(()=>{const d=document.getElementById('right-drawer').getBoundingClientRect(),t=document.querySelector('#pi-panel .slider-thumb').getBoundingClientRect(),o=document.getElementById('pi-range-out-ANS_PI_CONTEXT_WINDOW').getBoundingClientRect();return t.width>=12&&t.height>=12&&t.top>=d.top&&t.bottom<=d.bottom&&o.width>0&&o.right<=d.right&&o.left>=d.left;})()`),
  );
  await shot("1360-settings-slider");
  await js(`document.querySelector('#pi-panel .slider-thumb input').focus()`);
  await key("ArrowRight");
  check(
    "SLIDER_KEYBOARD_UPDATES_HIDDEN_CANONICAL_VALUE",
    await js(`document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW').value==='131072'&&document.getElementById('pi-range-out-ANS_PI_CONTEXT_WINDOW').textContent==='128k'`),
  );
  await key("Home");
  check(
    "SLIDER_HOME_SETS_DEFAULT_TIER",
    await js(`document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW').value===''&&document.getElementById('pi-range-out-ANS_PI_CONTEXT_WINDOW').textContent==='系统默认（500k）'`),
  );
  await key("End");
  check(
    "SLIDER_END_SETS_LAST_TIER",
    await js(`document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW').value==='1048576'`),
  );
  await js(`document.querySelector('#pi-panel .pi-advanced').open=false`);
  await js(`document.getElementById('pi-toggle-secret-ANTHROPIC_AUTH_TOKEN').click()`);
  check(
    "SECRET_REVEAL_ONLY_LOCAL_INPUT",
    await js(`document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN').type==='text'&&document.getElementById('pi-toggle-secret-ANTHROPIC_AUTH_TOKEN').textContent==='隐藏'`),
  );
  await js(`document.getElementById('pi-toggle-secret-ANTHROPIC_AUTH_TOKEN').click()`);
  check("SECRET_HIDE_RESTORES_PASSWORD", await js(`document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN').type==='password'`));

  // 非预设档位：回退文本 + amber 提示（不静默覆盖）。
  state.customRange = true;
  await js(`await window.__ansRenderer.loadPiConfig()`);
  await sleep(120);
  check(
    "RANGE_VALUE_OUTSIDE_CHOICES_FALLS_BACK_TO_TEXT",
    await js(`(()=>{const input=document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW');const note=document.querySelector('#pi-panel .pi-range-note');return input&&input.type==='text'&&input.value==='123457'&&note&&note.textContent.includes('当前值不在预设档位');})()`),
  );
  state.customRange = false;
  await js(`await window.__ansRenderer.loadPiConfig()`);
  await sleep(120);

  // 保存失败：保留草稿与如实错误。
  state.saveMode = "fail";
  await js(`document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN').value='FAKE-DRAFT-SECRET';document.getElementById('pi-inp-ANS_PI_MODEL').value='draft-model';document.getElementById('pi-save').click()`);
  await sleep(200);
  check(
    "SAVE_FAILURE_KEEPS_DRAFT_AND_HONEST_ERROR",
    await js(`document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN').value==='FAKE-DRAFT-SECRET'&&document.getElementById('pi-inp-ANS_PI_MODEL').value==='draft-model'&&document.getElementById('pi-status').textContent.includes('保存失败')&&!document.getElementById('pi-panel').textContent.includes('FAKE-DRAFT-SECRET')`),
  );
  await shot("1360-settings-error");
  state.saveMode = "success";
  state.application = "after-active-turn";
  const opensBeforeSave = calls.opens.length;
  await js(`document.getElementById('pi-save').click()`);
  await sleep(250);
  check(
    "SAVE_SUCCESS_CLEARS_SECRET_AND_REPORTS_APPLICATION",
    await js(`document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN').value===''&&document.getElementById('pi-status').textContent.includes('已保存到 .env')&&document.getElementById('pi-status').textContent.includes('当前轮次继续使用原配置')`),
    await js(`document.getElementById('pi-status').textContent`),
  );
  check(
    "SAVE_STATUS_VISUALLY_COMPLETE_IN_64PX_BAR",
    await js(`(()=>{const st=document.getElementById('pi-status');const bar=document.querySelector('.pi-save-bar').getBoundingClientRect();const r=st.getBoundingClientRect();return st.textContent.includes('已保存到 .env')&&st.textContent.includes('必填配置已齐备')&&st.textContent.includes('当前轮次继续使用原配置')&&st.textContent.includes('下一次输入应用')&&st.scrollHeight<=st.clientHeight+1&&r.height>=20&&r.bottom<=bar.bottom+0.5&&r.top>=bar.top-0.5&&Math.abs(bar.height-64)<1;})()`),
    await js(`(()=>{const st=document.getElementById('pi-status');return {text:st.textContent,scrollHeight:st.scrollHeight,clientHeight:st.clientHeight,title:st.title};})()`),
  );
  check("SAVE_DOES_NOT_REOPEN_SESSION", calls.opens.length === opensBeforeSave, calls.opens.length - opensBeforeSave);
  await shot("1360-settings-saved");

  // 晚到旧保存不得覆盖当前状态。
  state.saveMode = "success";
  state.saveDeferred = true;
  state.application = "next-session";
  await js(`document.getElementById('pi-save').click()`);
  await sleep(100);
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  await sleep(220);
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await sleep(220);
  state.savePending.at(-1)?.resolve();
  await sleep(200);
  state.saveDeferred = false;
  check(
    "LATE_OLD_SAVE_CANNOT_OVERWRITE_CURRENT_STATUS",
    await js(`!document.getElementById('pi-status').textContent.includes('已保存到 .env')`),
    await js(`document.getElementById('pi-status').textContent`),
  );

  // Codex / Claude 字段。
  await js(`await window.__ansRenderer.selectRuntime('codex')`);
  await sleep(220);
  await js(`document.getElementById('tab-pi').click()`);
  await sleep(180);
  check(
    "CODEX_FIELDS_SECRET_FALLBACK_AND_HELP",
    await js(`window.__ansRenderer.state.runtime==='codex'&&document.getElementById('drawer-title').textContent==='Codex 配置'&&document.getElementById('pi-inp-CODEX_API_KEY').type==='password'&&document.getElementById('pi-panel').textContent.includes('回退（OPENAI_API_KEY）')&&document.getElementById('pi-panel').textContent.includes('Responses API')&&!document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN')`),
  );
  await shot("1360-settings-codex");
  const runtimeBeforeTab = await js(`window.__ansRenderer.state.runtime`);
  await js(`document.querySelector('.pi-engine-tab[data-engine="claude"]').click()`);
  await sleep(180);
  check(
    "SETTINGS_TABS_CHANGE_VIEW_NOT_SESSION_ENGINE",
    (await js(`window.__ansRenderer.state.runtime`)) === runtimeBeforeTab &&
      (await js(`document.getElementById('drawer-title').textContent==='Claude 配置'&&!!document.getElementById('pi-inp-ANTHROPIC_API_KEY')`)),
  );
  await shot("1360-settings-claude");
  await js(`document.querySelector('.pi-engine-tab[data-engine="codex"]').click()`);
  await sleep(150);

  // 缺配 / 读取失败 Alert。
  state.missing.codex = ["CODEX_API_KEY", "ANS_CODEX_MODEL"];
  await js(`await window.__ansRenderer.loadPiConfig()`);
  await sleep(150);
  check(
    "SETTINGS_MISSING_ALERT_AND_STATUS",
    await js(`document.querySelector('#pi-panel .pi-alert.is-warn').textContent.includes('CODEX_API_KEY')&&document.getElementById('pi-status').textContent.includes('配置不完整')`),
    await js(`document.getElementById('pi-status').textContent`),
  );
  state.missing.codex = [];
  await js(`await window.__ansRenderer.loadPiConfig()`);
  await sleep(120);
  await js(`document.getElementById('drawer-close').click()`);
  await sleep(160);

  // —————— 3. 角色资料 + 文档只读 ——————
  await js(`await window.__ansRenderer.selectRuntime('pi')`);
  await sleep(220);
  await js(`await window.__ansRenderer.selectRole('A');document.getElementById('tab-card').click()`);
  await sleep(160);
  check(
    "PROFILE_HEADER_AND_FOUR_SECTIONS",
    await js(`document.getElementById('drawer-title').textContent==='A · 角色资料'&&!!document.querySelector('#right-body .role-block')&&document.querySelectorAll('#right-body details[data-section]').length===4&&!!document.querySelector('#right-body details[data-section="boundary"] table.boundary')`),
  );
  await js(`document.getElementById('right-body').scrollTop=0`);
  await sleep(80);
  await shot("1360-profile");
  await js(`['card','docs','changes'].forEach(id=>document.querySelector('details[data-section="'+id+'"]').open=true)`);
  await sleep(120);
  const nested = await js(`(()=>{const out={};['card','docs','changes'].forEach(id=>{const el=document.querySelector('details[data-section="'+id+'"] .card-text');el.scrollTop=el.scrollHeight;out[id]=el.scrollTop;});document.getElementById('right-body').scrollTop=document.getElementById('right-body').scrollHeight;return out;})()`);
  await sleep(120);
  check(
    "PROFILE_LONG_SECTIONS_SCROLL_INDEPENDENTLY",
    Object.values(nested).every((value) => value > 100) &&
      (await js(`document.getElementById('right-body').scrollTop>100`)),
    nested,
  );
  // S4：文档节两组（角色根文档 / docs/）；顺序、计数、memo/role-card 过滤、按钮语义。
  check(
    "PROFILE_DOCS_GROUPS_ROOT_AND_SUBDIR",
    await js(`(()=>{const sec=document.querySelector('details[data-section="docs"]');const groups=[...sec.querySelectorAll('[data-docs-group]')].map(g=>g.getAttribute('data-docs-group'));const names=[...sec.querySelectorAll('[data-root-doc-path]')].map(b=>b.getAttribute('data-root-doc-path'));const rootText=sec.querySelector('[data-docs-group="root"]')?.textContent||'';const subText=sec.querySelector('[data-docs-group="subdir"]')?.textContent||'';return groups.join(',')==='root,subdir'&&names.length===3&&names[0].endsWith('/角色卡/A/feature-map.md')&&names[1].endsWith('/角色卡/A/functional-description.md')&&names[2].endsWith('/角色卡/A/api-spec.md')&&sec.querySelector('.sec-count').textContent==='103'&&rootText.includes('角色根文档')&&rootText.includes('功能导航')&&subText.includes('docs/ 目录')&&!sec.textContent.includes('memo.md')&&!sec.textContent.includes('role-card.md');})()`),
    await js(`(()=>{const sec=document.querySelector('details[data-section="docs"]');return {groups:[...sec.querySelectorAll('[data-docs-group]')].map(g=>g.getAttribute('data-docs-group')),names:[...sec.querySelectorAll('[data-root-doc-path]')].map(b=>b.getAttribute('data-root-doc-path')),count:sec.querySelector('.sec-count')?.textContent,memo:sec.textContent.includes('memo.md')};})()`),
  );
  check(
    "PROFILE_ROOT_DOC_BUTTON_TITLE_ARIA",
    await js(`(()=>{const b=document.querySelector('[data-root-doc-path$="/feature-map.md"]');const label='只读打开 feature-map.md';return !!b&&b.tagName==='BUTTON'&&b.title===label&&b.getAttribute('aria-label')===label;})()`),
  );
  // 平台诚实：索引仍列名；Windows 形状（无 scope/refs）点开停留列表态 + 既有结构化错误。
  state.docsUnavailable = true;
  await js(`document.querySelector('[data-root-doc-path$="/feature-map.md"]').click()`);
  await sleep(260);
  check(
    "ROOT_DOC_WINDOWS_UNAVAILABLE_STRUCTURED_ERROR",
    await js(`window.__ansRenderer.state.rightTab==='document'&&!document.getElementById('document-read-text')&&!document.querySelector('.document-list')&&(document.querySelector('.document-scope-error')?.textContent||'').includes('当前环境暂不支持安全读取项目文档')&&!document.getElementById('right-body').textContent.includes('根文档正文')`),
    await js(`({tab:window.__ansRenderer.state.rightTab,error:document.querySelector('.document-scope-error')?.textContent||'',list:!!document.querySelector('.document-list'),body:document.getElementById('right-body').textContent.slice(0,160)})`),
  );
  await js(`document.querySelector('[data-doc-action="back-role"]').click()`);
  await sleep(220);
  check(
    "ROOT_DOC_BACK_ROLE_FOCUSES_ROOT_BUTTON",
    await js(`window.__ansRenderer.state.rightTab==='card'&&(document.activeElement.getAttribute('data-root-doc-path')||'').endsWith('/角色卡/A/feature-map.md')`),
    await js(`({tab:window.__ansRenderer.state.rightTab,active:document.activeElement&&(document.activeElement.tagName+'.'+document.activeElement.className),path:document.activeElement.getAttribute&&document.activeElement.getAttribute('data-root-doc-path'),docsOpen:document.querySelector('details[data-section="docs"]')?.open})`),
  );
  state.docsUnavailable = false;
  // 可读分支：点击根文档 → 刷新后按 relativePath 精确匹配 ref → 既有 DocumentView 阅读态。
  await js(`document.querySelector('[data-root-doc-path$="/feature-map.md"]').click()`);
  await sleep(280);
  check(
    "ROOT_DOC_OPENS_DOCUMENT_VIEW_READONLY",
    await js(`window.__ansRenderer.state.rightTab==='document'&&document.getElementById('document-read-text').textContent.includes('根文档正文 feature map')&&document.getElementById('document-read-status').textContent.includes('只读文档')&&(document.querySelector('.document-path')?.textContent||'').endsWith('/角色卡/A/feature-map.md')&&!document.querySelector('#document-read-text script,#document-read-text img')`),
    await js(`({path:document.querySelector('.document-path')?.textContent,status:document.getElementById('document-read-status')?.textContent})`),
  );
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  await sleep(140);
  check(
    "ROOT_DOC_LIST_APPENDS_REFS_WITHOUT_PREFIX_CHANGE",
    await js(`document.querySelectorAll('[data-doc-id]').length===5&&!!document.querySelector('[data-doc-id="doc-one"]')&&!!document.querySelector('[data-doc-id="doc-two"]')&&!!document.querySelector('[data-doc-id="root-feature-map"]')&&!!document.querySelector('[data-doc-id="root-functional-description"]')&&!!document.querySelector('[data-doc-id="root-api-spec"]')`),
  );
  await js(`document.querySelector('[data-doc-action="back-role"]').click()`);
  await sleep(220);
  // api-spec 的 not-applicable 当普通文本：无 badge/特殊错误。
  await js(`document.querySelector('[data-root-doc-path$="/api-spec.md"]').click()`);
  await sleep(280);
  check(
    "ROOT_DOC_API_SPEC_NOT_APPLICABLE_PLAIN_TEXT",
    await js(`(document.getElementById('document-read-text')?.textContent||'').trim()==='not-applicable'&&!document.querySelector('.document-scope-error')&&!document.querySelector('#document-read-status [class*="badge"]')`),
    await js(`document.getElementById('document-read-text')?.textContent`),
  );
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  await sleep(120);
  await js(`document.querySelector('[data-doc-action="back-role"]').click()`);
  await sleep(200);
  await js(`[...document.querySelectorAll('#right-body button')].find(x=>x.textContent==='查看已列文档').click()`);
  await sleep(180);
  check(
    "DOCUMENT_LIST_OPAQUE_REFS_ONLY",
    await js(`document.getElementById('drawer-title').textContent==='A · 来源文档'&&document.querySelectorAll('[data-doc-id]').length===5&&document.querySelector('.document-source-note')&&window.__ansRenderer.state.selectedRoleId==='A'`),
    // 5 = 既有 docs 2 条 + 新增根文档 3 条（新增 refs，不是回归）。
    await js(`document.querySelectorAll('[data-doc-id]').length`),
  );
  await js(`document.querySelector('[data-doc-id="doc-one"]').click()`);
  await sleep(200);
  check(
    "DOCUMENT_READ_MARKDOWN_SAFE_NO_SCRIPT_OR_IMAGE",
    await js(`document.getElementById('document-read-text').textContent.includes('文档正文')&&!document.querySelector('#document-read-text script,#document-read-text img,#document-read-text iframe')&&!window.BAD_DOC&&![...document.querySelectorAll('#document-read-text a')].some(a=>a.getAttribute('href').startsWith('javascript:'))&&document.getElementById('document-read-status').textContent.includes('只读文档 · 120 字节')`),
  );
  await shot("1360-document-read");
  // 外部链接走 openExternal；内部链接命中已列文档；未知链接如实提示。
  await js(`[...document.querySelectorAll('#document-read-text a')].find(a=>a.textContent==='外部文档').click()`);
  await sleep(80);
  check("DOCUMENT_EXTERNAL_LINK_USES_OPEN_EXTERNAL", calls.external.at(-1) === "https://example.com/doc", calls.external.slice(-1));
  await js(`[...document.querySelectorAll('#document-read-text a')].find(a=>a.textContent==='内部文档').click()`);
  await sleep(200);
  check(
    "DOCUMENT_INTERNAL_LINK_OPENS_LISTED_REF",
    await js(`document.getElementById('document-read-text').textContent.includes('纯文本正文 two')&&document.getElementById('document-read-status').textContent.includes('只读文档 · 20 字节')`),
  );
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  await sleep(80);
  await js(`[...document.querySelectorAll('#document-read-text a')].length`);
  check(
    "DOCUMENT_BACK_LIST_RESTORES_READ_BUTTON_FOCUS",
    await js(`document.activeElement.dataset.docId==='doc-two'`),
    await js(`document.activeElement.dataset.docId`),
  );
  state.docMode = "TOO_LARGE";
  await js(`document.querySelector('[data-doc-id="doc-one"]').click()`);
  await sleep(160);
  check(
    "DOCUMENT_TOO_LARGE_EXPLICIT_ERROR",
    await js(`document.getElementById('document-read-status').textContent.includes('256KiB')&&!document.getElementById('document-read-text').textContent`),
  );
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  await sleep(100);
  state.docMode = "IO_ERROR";
  await js(`document.querySelector('[data-doc-id="doc-one"]').click()`);
  await sleep(160);
  check(
    "DOCUMENT_IO_ERROR_RETRYABLE",
    await js(`!!document.querySelector('[data-doc-action="retry"]')`),
  );
  state.docMode = "success";
  await js(`document.querySelector('[data-doc-action="retry"]').click()`);
  await sleep(180);
  check("DOCUMENT_RETRY_SUCCEEDS", await js(`document.getElementById('document-read-text').textContent.includes('文档正文')`));
  await js(`document.querySelector('[data-doc-action="back-list"]').click()`);
  await sleep(80);
  await js(`document.querySelector('[data-doc-action="back-role"]').click()`);
  await sleep(160);
  check(
    "DOCUMENT_BACK_ROLE_RESTORES_ENTRY_FOCUS",
    await js(`window.__ansRenderer.state.rightTab==='card'&&document.activeElement.textContent==='查看已列文档'`),
  );

  // 迟到读取：关闭抽屉后只丢弃。
  await js(`[...document.querySelectorAll('#right-body button')].find(x=>x.textContent==='查看已列文档').click()`);
  await sleep(150);
  state.docDeferred = true;
  await js(`document.querySelector('[data-doc-id="doc-one"]').click();document.getElementById('drawer-close').click()`);
  await sleep(100);
  state.docPending.at(-1)?.resolve();
  await sleep(160);
  state.docDeferred = false;
  check(
    "LATE_DOCUMENT_READ_INVALIDATED_BY_CLOSE",
    await js(`window.__ansRenderer.state.rightTab===null&&!document.getElementById('right-body').textContent.includes('LATE_DOCUMENT')`),
  );

  // 切换角色使文档子视图失效（不串读）。
  await js(`document.getElementById('tab-card').click()`);
  await sleep(120);
  await js(`[...document.querySelectorAll('#right-body button')].find(x=>x.textContent==='查看已列文档').click()`);
  await sleep(120);
  await js(`await window.__ansRenderer.selectRole('B')`);
  await sleep(180);
  check(
    "ROLE_SWITCH_INVALIDATES_DOCUMENT_VIEW",
    await js(`window.__ansRenderer.state.rightTab===null&&!document.getElementById('document-read-text')&&!document.querySelector('.document-list')`),
  );
  // B 无根文档且无 docs（旧 main 形状缺 rootDocs）：整节诚实空态，不伪造。
  await js(`document.getElementById('tab-card').click()`);
  await sleep(180);
  check(
    "PROFILE_EMPTY_DOCS_HONEST_STATE",
    await js(`(()=>{const sec=document.querySelector('details[data-section="docs"]');return !!sec&&!sec.querySelector('[data-docs-group]')&&sec.textContent.includes('（暂无角色文档）')&&sec.querySelector('.sec-count').textContent==='无';})()`),
    await js(`document.querySelector('details[data-section="docs"]')?.textContent`),
  );
  await js(`await window.__ansRenderer.selectRole('A')`);

  // —————— 4. 工作概览 ——————
  state.pendingOperator = {
    projectRoot: ROOT,
    roleId: "A",
    runtime: "pi",
    id: "op-pending",
    request: { kind: "choice", title: "选择处理方式", options: [{ id: "one", label: "摘要" }, { id: "two", label: "完整" }] },
  };
  await push("session:operator-request", state.pendingOperator);
  await push("session:role-state", roleStateSnapshot());
  await js(`document.getElementById('tab-work').click()`);
  await sleep(200);
  check(
    "WORK_OVERVIEW_ONE_QUEUE_BODY_NO_ROLE_DOCUMENTS",
    await js(`document.querySelectorAll('#right-body #right-queue-body').length===1&&!document.querySelector('#right-body details[data-section]')&&!document.getElementById('right-queue-overview')&&document.getElementById('drawer-title').textContent.includes('工作概览')`),
  );
  check(
    "WORK_OVERVIEW_PENDING_CURRENT_QUEUE",
    await js(`document.getElementById('right-body').textContent.includes('待选择')&&document.getElementById('right-body').textContent.includes('选择处理方式')&&document.getElementById('right-body').textContent.includes('当前工作')&&document.getElementById('right-body').textContent.includes('排队')&&document.querySelectorAll('#right-body .q-item').length===4`),
  );
  check(
    "WORK_BADGE_AND_ROLE_BADGE_COUNTS",
    await js(`document.querySelector('#tab-work .tab-badge').textContent==='1'&&document.querySelector('#tab-card .tab-badge').textContent==='4'&&document.getElementById('tab-work').getAttribute('aria-label').includes('1 项待处理')&&document.getElementById('tab-card').getAttribute('aria-label').includes('4 项进行中或排队')`),
    await js(`({work:document.querySelector('#tab-work .tab-badge')?.textContent,card:document.querySelector('#tab-card .tab-badge')?.textContent})`),
  );
  check(
    "SIDEBAR_SINGLE_COUNT_BADGE_ONLY_AND_QUEUE_IN_TITLE",
    await js(`(()=>{const item=document.querySelector('.tree-item[data-role-id="A"]');const status=item.querySelector('.ti-status');const count=item.querySelector('.ti-count');return !!count&&count.textContent==='4'&&!status.textContent.includes('待处理')&&count.getAttribute('title').includes('排队 3 项')&&count.getAttribute('aria-label').includes('当前工作 1 项');})()`),
    await js(`(()=>{const item=document.querySelector('.tree-item[data-role-id="A"]');return {status:item.querySelector('.ti-status').textContent,count:item.querySelector('.ti-count')&&item.querySelector('.ti-count').textContent,title:item.querySelector('.ti-count')&&item.querySelector('.ti-count').getAttribute('title')};})()`),
  );

  // M1：队列子视图（同一抽屉、标题/返回、当前/排队全量）；工作概览仅预览前 3 条排队。
  check(
    "WORK_OVERVIEW_QUEUE_PREVIEW_AND_VIEW_ALL_ENTRY",
    await js(`!!document.querySelector('#right-body .queue-view-all')&&document.querySelectorAll('#right-body .q-item').length===4`),
  );
  await js(`document.querySelector('#right-body .queue-view-all').click()`);
  await sleep(180);
  check(
    "QUEUE_SUBVIEW_TITLE_BACK_UNIQUE_BODY",
    await js(`window.__ansRenderer.state.rightTab==='work'&&document.getElementById('drawer-title').textContent==='A · 队列'&&document.querySelector('.queue-back').textContent.includes('工作概览')&&document.querySelectorAll('#right-body #right-queue-body').length===1&&!document.querySelector('#right-body details[data-section]')&&document.querySelectorAll('#right-body .q-item').length===4`),
    await js(`({title:document.getElementById('drawer-title').textContent,back:document.querySelector('.queue-back')&&document.querySelector('.queue-back').textContent,body:document.querySelectorAll('#right-body #right-queue-body').length,items:document.querySelectorAll('#right-body .q-item').length})`),
  );
  await shot("1360-queue");
  await key("Escape");
  await sleep(180);
  check(
    "QUEUE_SUBVIEW_ESC_RETURNS_WORK_AND_FOCUS",
    await js(`document.getElementById('drawer-title').textContent.includes('工作概览')&&document.activeElement.classList.contains('queue-view-all')&&document.querySelectorAll('#right-body #right-queue-body').length===1`),
  );
  await js(`document.querySelector('#right-body .queue-view-all').click()`);
  await sleep(160);
  await js(`document.querySelector('.queue-back').click()`);
  await sleep(160);
  check(
    "QUEUE_SUBVIEW_BACK_RETURNS_WORK_AND_FOCUS",
    await js(`document.getElementById('drawer-title').textContent.includes('工作概览')&&document.activeElement.classList.contains('queue-view-all')`),
  );

  await js(`document.querySelector('.pending-locate').click()`);
  await sleep(120);
  check(
    "PENDING_LOCATE_CLOSES_DRAWER_AND_FOCUSES_CARD",
    await js(`window.__ansRenderer.state.rightTab===null&&document.activeElement.dataset.requestId==='op-pending'&&[...document.querySelectorAll('[data-request-id="op-pending"] input[type=radio]')].every(x=>!x.checked)&&document.querySelector('[data-request-id="op-pending"] .op-submit').disabled`),
  );
  await js(`document.getElementById('tab-work').click()`);
  await sleep(180);
  await shot("1360-work");
  // 最近回交：同 reportId 去重，按真实报告身份。
  const reportOne = {
    version: 1,
    reportId: "smoke-report-one",
    source: { roleId: "A", runtime: "pi", turnId: "smoke-source" },
    taskId: null,
    origin: "submitted-report",
    status: "completed",
    summary: { text: "已完成的安全摘要", redacted: false, truncated: false },
    evidence: [],
    evidenceOmitted: 0,
    at: "2026-10-21T00:00:00Z",
  };
  await push("session:events", [
    { projectRoot: ROOT, roleId: "A", runtime: "pi", event: { kind: "handback", summary: "报告", report: reportOne } },
    { projectRoot: ROOT, roleId: "A", runtime: "pi", event: { kind: "handback", summary: "重复报告", report: { ...reportOne } } },
  ]);
  await sleep(120);
  check(
    "RECENT_HANDBACKS_DEDUP_BY_REAL_REPORT_IDENTITY",
    await js(`document.querySelectorAll('#right-body .recent-report').length===1&&document.getElementById('right-body').textContent.includes('报告声明：已完成')&&document.getElementById('right-body').textContent.includes('已完成的安全摘要')`),
  );
  const reportTwo = { ...reportOne, reportId: "smoke-report-two", origin: "terminal-fallback", status: "aborted", summary: { text: "第二份摘要" } };
  await push("session:events", [{ projectRoot: ROOT, roleId: "A", runtime: "pi", event: { kind: "handback", summary: "第二份", report: reportTwo } }]);
  await sleep(120);
  check(
    "RECENT_HANDBACKS_SECOND_REPORT_AND_DECLARATION",
    await js(`document.querySelectorAll('#right-body .recent-report').length===2&&document.getElementById('right-body').textContent.includes('系统按终态记录：已中止')`),
  );

  // —————— 5. 队列：位次/来源/全文/撤回 ——————
  check(
    "QUEUE_POSITIONS_SOURCES_AND_WITHDRAW_ELIGIBILITY",
    await js(`(()=>{const items=[...document.querySelectorAll('#right-body .q-item')];const nonRunning=items.filter(x=>!x.classList.contains('is-running'));const run=items.find(x=>x.classList.contains('is-running'));const pos=nonRunning.map(x=>x.querySelector('.q-pos').textContent);const src=nonRunning.map(x=>x.querySelector('.q-src').textContent);const withdraw=[...document.querySelectorAll('#right-body .q-withdraw')];return !!run&&run.querySelector('.q-pos')===null&&pos.join(',')==='1,2,3'&&src[0]==='客户消息'&&src[1].includes('派发')&&src[2].includes('交付')&&withdraw.length===1&&!!document.querySelector('#right-body .q-toggle');})()`),
    await js(`(()=>{const items=[...document.querySelectorAll('#right-body .q-item')];return {count:items.length,items:items.map(x=>({cls:x.className,pos:x.querySelector('.q-pos')&&x.querySelector('.q-pos').textContent,src:x.querySelector('.q-src')&&x.querySelector('.q-src').textContent})),withdraw:document.querySelectorAll('#right-body .q-withdraw').length,toggle:!!document.querySelector('#right-body .q-toggle')};})()`),
  );
  await js(`document.querySelector('#right-body .q-toggle').click()`);
  await sleep(80);
  check("QUEUE_FULL_TOGGLES_IN_PLACE", await js(`!document.querySelector('#right-body .q-full').hidden&&document.querySelector('#right-body .q-toggle').textContent==='收起'`));
  state.withdrawMode = "deferred";
  await js(`document.querySelector('#right-body .q-withdraw').click()`);
  await sleep(80);
  check(
    "WITHDRAW_PENDING_DISABLES_SAME_ACTION",
    await js(`document.querySelector('#right-body .q-withdraw').disabled&&document.querySelector('#right-body .q-withdraw').textContent==='撤回中…'`),
  );
  state.withdrawPending.at(-1)?.resolve();
  await sleep(160);
  check(
    "WITHDRAW_FAILURE_INLINE_AND_RETAINED",
    await js(`document.querySelector('#right-body .q-feedback').textContent.includes('离线受控拒绝')&&!document.querySelector('#right-body .q-withdraw').disabled&&!document.querySelector('#right-body .q-full').hidden&&document.getElementById('chat').textContent.includes('撤回无效：离线受控拒绝')`),
  );
  await shot("1360-withdraw-failure");
  state.withdrawMode = "throw";
  await js(`document.querySelector('#right-body .q-withdraw').focus()`);
  await key("Enter");
  await sleep(180);
  check(
    "WITHDRAW_THROW_INLINE_AND_FOCUS_RETAINED",
    await js(`document.querySelector('#right-body .q-feedback').textContent.includes('离线受控网络不可用')&&document.activeElement.classList.contains('q-withdraw')&&document.getElementById('chat').textContent.includes('撤回失败：')&&document.getElementById('chat').textContent.includes('离线受控网络不可用')`),
    await js(`({active:document.activeElement&&(document.activeElement.className||document.activeElement.id),feedback:document.querySelector('#right-body .q-feedback')&&document.querySelector('#right-body .q-feedback').textContent,chat:document.getElementById('chat').textContent.slice(-200)})`),
  );
  state.withdrawMode = "success";
  await js(`document.querySelector('#right-body .q-withdraw').click()`);
  await sleep(500);
  check(
    "WITHDRAW_SUCCESS_USES_REAL_SNAPSHOT",
    await js(`document.querySelectorAll('#right-body .q-item').length===3&&document.querySelectorAll('#right-body .q-withdraw').length===0&&document.getElementById('chat').textContent.includes('已撤回排队消息：客户排队消息')`),
    await js(`({items:document.querySelectorAll('#right-body .q-item').length,withdraw:document.querySelectorAll('#right-body .q-withdraw').length,feedback:document.querySelector('#right-body .q-feedback')&&document.querySelector('#right-body .q-feedback').textContent,queue:window.__ansRenderer.state.queueByRole.A&&window.__ansRenderer.state.queueByRole.A.length,busy:window.__ansRenderer.state.roleBusy.A,runtime:window.__ansRenderer.state.runtime,project:window.__ansRenderer.state.projectRoot,chatQueue:[...document.querySelectorAll('#chat .queue-row')].map(x=>x.textContent)})`),
  );
  await shot("1360-withdraw-success");
  state.withdrawMode = "deferred";

  // —————— 6. 960 档：无横向溢出、焦点/Esc/inert、队列子视图、设置/资料 ——————
  state.activeQueue.push({ id: "q-extra", kind: "dispatch", sourceRoleId: "B", summary: "补充派发", full: "", at: "2026-10-21T10:04:00Z" });
  await push("session:role-state", roleStateSnapshot());
  // 重新打开工作概览（960 档验证「打开→焦点进入抽屉」而不是沿用先前焦点）。
  await js(`document.getElementById('drawer-close').click()`);
  await sleep(160);
  await js(`document.getElementById('tab-work').click()`);
  await sleep(180);
  win.setContentSize(960, 620);
  await sleep(220);
  check(
    "WIDTH_960_NO_HORIZONTAL_OVERFLOW_WORK",
    await js(`document.body.scrollWidth===innerWidth&&document.querySelector('.app').scrollWidth===document.querySelector('.app').clientWidth&&Math.abs(document.getElementById('right-drawer').getBoundingClientRect().width-424)<1&&document.getElementById('right-body').scrollWidth===document.getElementById('right-body').clientWidth`),
  );
  check(
    "RUNTIME_960_WORK_FOCUS_AND_INERT",
    await js(`document.querySelector('.col-left').inert===true&&document.querySelector('.col-mid').inert===true&&document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement.id==='drawer-close'`),
    await js(`({active:document.activeElement&&(document.activeElement.id||document.activeElement.className||document.activeElement.tagName),leftInert:document.querySelector('.col-left').inert,midInert:document.querySelector('.col-mid').inert,tab:window.__ansRenderer.state.rightTab})`),
  );
  await key("Tab");
  check(
    "RUNTIME_960_WORK_TAB_STAYS_IN_DRAWER",
    await js(`document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement!==document.body`),
  );
  await shot("960-work");
  check("WIDTH_960_WORK_QUEUE_VIEW_ALL_ENTRY", await js(`!!document.querySelector('#right-body .queue-view-all')`));
  await js(`document.querySelector('#right-body .queue-view-all').click()`);
  await sleep(180);
  check(
    "WIDTH_960_QUEUE_SUBVIEW_READABLE",
    await js(`document.getElementById('drawer-title').textContent==='A · 队列'&&document.querySelector('.queue-back').textContent.includes('工作概览')&&document.querySelectorAll('#right-body #right-queue-body').length===1&&document.body.scrollWidth===innerWidth&&document.getElementById('right-body').scrollWidth===document.getElementById('right-body').clientWidth`),
  );
  await shot("960-queue");
  await key("Escape");
  await sleep(180);
  check(
    "RUNTIME_960_QUEUE_ESC_BACK_AND_FOCUS",
    await js(`document.getElementById('drawer-title').textContent.includes('工作概览')&&document.activeElement.classList.contains('queue-view-all')&&document.querySelector('.col-mid').inert===true`),
  );
  await js(`document.getElementById('drawer-close').click()`);
  await sleep(180);
  check(
    "RUNTIME_960_CLOSE_RESTORES_INERT_AND_FOCUS",
    await js(`window.__ansRenderer.state.rightTab===null&&!document.querySelector('.col-left').inert&&!document.querySelector('.col-mid').inert&&document.activeElement.id==='tab-work'`),
  );

  // 角色资料：焦点/Esc/inert、状态只表达状态、队列预览入口。
  await js(`document.getElementById('tab-card').click()`);
  await sleep(280);
  check(
    "RUNTIME_960_PROFILE_FOCUS_AND_INERT",
    await js(`document.querySelector('.col-left').inert===true&&document.querySelector('.col-mid').inert===true&&document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement.id==='drawer-close'`),
    await js(`({active:document.activeElement&&(document.activeElement.id||document.activeElement.className||document.activeElement.tagName),left:document.querySelector('.col-left').inert,mid:document.querySelector('.col-mid').inert,tab:window.__ansRenderer.state.rightTab,open:window.__ansRenderer.state.drawerOpen})`),
  );
  await shot("960-profile-focus");
  await key("Tab");
  check(
    "RUNTIME_960_PROFILE_TAB_STAYS_IN_DRAWER",
    await js(`document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement!==document.body`),
  );
  check(
    "PROFILE_STATUS_ONLY_NO_PENDING_COUNT",
    await js(`(()=>{const s=document.querySelector('#right-body .role-status');return !!s&&!s.textContent.includes('待处理')&&!s.textContent.includes('·')&&!!document.querySelector('#right-body .queue-view-all');})()`),
    await js(`document.querySelector('#right-body .role-status')&&document.querySelector('#right-body .role-status').textContent`),
  );
  await js(`document.querySelector('#right-body .queue-view-all').click()`);
  await sleep(180);
  check(
    "QUEUE_SUBVIEW_FROM_PROFILE_BACK_TO_ROLE",
    await js(`document.getElementById('drawer-title').textContent==='A · 队列'&&document.querySelector('.queue-back').textContent.includes('角色资料')&&window.__ansRenderer.state.rightTab==='card'`),
  );
  await key("Escape");
  await sleep(180);
  check(
    "QUEUE_SUBVIEW_FROM_PROFILE_ESC_RESTORES_ROLE_FOCUS",
    await js(`document.getElementById('drawer-title').textContent==='A · 角色资料'&&document.activeElement.classList.contains('queue-view-all')`),
  );
  await js(`document.querySelector('details[data-section="docs"]').open=true`);
  await sleep(100);
  check(
    "WIDTH_960_PROFILE_NO_OVERFLOW",
    await js(`document.body.scrollWidth===innerWidth&&document.getElementById('right-body').scrollWidth===document.getElementById('right-body').clientWidth&&(()=>{const d=document.getElementById('right-body').getBoundingClientRect();return [...document.querySelectorAll('[data-root-doc-path]')].every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.left>=d.left-0.5&&r.right<=d.right+0.5&&b.title.length>0&&b.getAttribute('aria-label')===b.title;});})()`),
    await js(`(()=>{const d=document.getElementById('right-body').getBoundingClientRect();return {drawer:{left:d.left,right:d.right},buttons:[...document.querySelectorAll('[data-root-doc-path]')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,title:b.title};})};})()`),
  );
  await js(`document.getElementById('right-body').scrollTop=0`);
  await sleep(80);
  await shot("960-profile");
  await key("Escape");
  await sleep(180);
  check(
    "RUNTIME_960_PROFILE_ESC_RETURNS_FOCUS",
    await js(`window.__ansRenderer.state.rightTab===null&&!document.querySelector('.col-left').inert&&!document.querySelector('.col-mid').inert&&document.activeElement.id==='tab-card'`),
  );

  // 设置：焦点/Esc/inert、保存状态两行完整、Slider 视觉。
  await js(`document.getElementById('tab-pi').click()`);
  await sleep(280);
  check(
    "RUNTIME_960_SETTINGS_FOCUS_AND_INERT",
    await js(`document.querySelector('.col-left').inert===true&&document.querySelector('.col-mid').inert===true&&document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement.id==='drawer-close'`),
  );
  check(
    "WIDTH_960_SETTINGS_NO_OVERFLOW",
    await js(`document.body.scrollWidth===innerWidth&&(()=>{const p=document.getElementById('pi-panel');return p.scrollWidth===p.clientWidth;})()&&[...document.querySelectorAll('#pi-panel input')].every(x=>x.getBoundingClientRect().right<=innerWidth)`),
    await js(`(()=>{const p=document.getElementById('pi-panel');return {body:document.body.scrollWidth,inner:innerWidth,panel:{scroll:p.scrollWidth,client:p.clientWidth},inputs:[...document.querySelectorAll('#pi-panel input')].map(x=>({id:x.id,right:x.getBoundingClientRect().right}))};})()`),
  );
  check(
    "WIDTH_960_SAVE_STATUS_NOT_CLIPPED",
    await js(`(()=>{const st=document.getElementById('pi-status');return st.textContent.includes('必填配置已齐备')&&st.scrollHeight<=st.clientHeight+1&&st.getBoundingClientRect().height>=13;})()`),
    await js(`(()=>{const st=document.getElementById('pi-status');return {text:st.textContent,scrollHeight:st.scrollHeight,clientHeight:st.clientHeight};})()`),
  );
  await shot("960-settings-focus");
  await key("Tab");
  check(
    "RUNTIME_960_SETTINGS_TAB_STAYS_IN_DRAWER",
    await js(`document.getElementById('right-drawer').contains(document.activeElement)&&document.activeElement!==document.body`),
  );
  await js(`document.querySelector('#pi-panel .pi-advanced').open=true`);
  await sleep(100);
  await js(`document.querySelector('#pi-panel .slider-thumb').scrollIntoView({block:'center'})`);
  await sleep(120);
  check(
    "WIDTH_960_SLIDER_VISUAL_IN_DRAWER",
    await js(`(()=>{const d=document.getElementById('right-drawer').getBoundingClientRect(),t=document.querySelector('#pi-panel .slider-thumb').getBoundingClientRect(),o=document.getElementById('pi-range-out-ANS_PI_CONTEXT_WINDOW').getBoundingClientRect();return t.width>=12&&t.top>=d.top&&t.bottom<=d.bottom&&o.width>0&&o.right<=d.right&&o.left>=d.left;})()`),
  );
  await shot("960-settings-slider");
  await shot("960-settings");
  await key("Escape");
  await sleep(180);
  check(
    "RUNTIME_960_SETTINGS_ESC_RETURNS_FOCUS",
    await js(`window.__ansRenderer.state.rightTab===null&&!document.querySelector('.col-left').inert&&!document.querySelector('.col-mid').inert&&document.activeElement.id==='tab-pi'`),
  );

  // —————— 7. 200% 文字（真实 Electron zoom 2；1360 窗口）——————
  win.webContents.setZoomFactor(2);
  await sleep(320);
  await js(`document.getElementById('tab-pi').click()`);
  await sleep(260);
  state.saveMode = "success";
  state.application = "next-session";
  state.missing.pi = [];
  await js(`document.getElementById('pi-save').click()`);
  await sleep(320);
  check(
    "ZOOM_200_SETTINGS_READABLE_AND_NO_OVERFLOW",
    await js(`(()=>{const st=document.getElementById('pi-status');const bar=document.querySelector('.pi-save-bar').getBoundingClientRect();return document.body.scrollWidth===innerWidth&&(()=>{const p=document.getElementById('pi-panel');return p.scrollWidth===p.clientWidth;})()&&[...document.querySelectorAll('#pi-panel input')].every(x=>x.getBoundingClientRect().right<=innerWidth)&&st.textContent.includes('已保存到 .env')&&st.textContent.includes('必填配置已齐备')&&st.textContent.includes('下一次开启会话时应用')&&st.scrollHeight<=st.clientHeight+1&&bar.bottom<=innerHeight+0.5;})()`),
    await js(`(()=>{const st=document.getElementById('pi-status');return {zoom:window.devicePixelRatio,innerWidth,text:st.textContent,scrollHeight:st.scrollHeight,clientHeight:st.clientHeight,bar:document.querySelector('.pi-save-bar').getBoundingClientRect().toJSON()};})()`),
  );
  await shot("1360-200-settings");
  await js(`document.getElementById('drawer-close').click()`);
  await sleep(180);
  await js(`document.getElementById('tab-card').click()`);
  await sleep(220);
  await js(`document.querySelector('details[data-section="docs"]').open=true`);
  await js(`document.querySelector('[data-root-doc-path]').scrollIntoView({block:'center'})`);
  await sleep(140);
  check(
    "ZOOM_200_ROOT_DOC_BUTTON_REACHABLE",
    await js(`(()=>{const b=document.querySelector('[data-root-doc-path]');const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&(hit===b||b.contains(hit))&&b.title.length>0&&b.getAttribute('aria-label')===b.title;})()`),
    await js(`(()=>{const b=document.querySelector('[data-root-doc-path]');const r=b.getBoundingClientRect();return {rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},innerWidth,title:b.title};})()`),
  );
  check(
    "ZOOM_200_PROFILE_NO_OVERFLOW",
    await js(`document.body.scrollWidth===innerWidth&&document.getElementById('right-body').scrollWidth===document.getElementById('right-body').clientWidth`),
  );
  await shot("1360-200-profile");
  await js(`document.getElementById('drawer-close').click()`);
  await sleep(160);
  win.webContents.setZoomFactor(1);
  await sleep(300);
  win.setContentSize(1360, 860);
  await sleep(220);
  await js(`document.getElementById('tab-work').click()`);
  await sleep(160);
  await js(`document.getElementById('drawer-close').click()`);
  await sleep(200);
  await shot("1360-sidebar-badge");

  // —————— 7. 零 console / CSP ——————
  const csp = await js(`window.__ansCspViolations||[]`);
  report.csp = Array.isArray(csp) ? csp : [];
  const errors = report.console.filter((line) => {
    const level = String(line.level);
    return level === "error" || level === "3" || level === "did-fail-load";
  });
  check("NO_CONSOLE_ERRORS_OR_CSP_VIOLATIONS", errors.length === 0 && report.csp.length === 0, { errors, csp: report.csp });

  } catch (error) {
    report.failures += 1;
    report.checks.push({ name: "SMOKE_ABORTED", value: false, detail: String(error && error.stack || error) });
    console.log("SMOKE_ABORTED " + String(error && error.stack || error));
  }
  clearTimeout(watchdog);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`PHASE4A_SMOKE_DONE checks=${report.checks.length} failures=${report.failures} out=${OUT}`);
  app.exit(report.failures === 0 ? 0 : 1);
});
