// Explicit isolated Electron host plus reusable native DOM probe. Importing creates no app or UI evidence.
// No main.ts startup-chain claim, real account, model endpoint, CDP, state seed or permission bypass.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

export async function inspectSelectedRole(page, roleId) {
  await page.locator(`button.tree-item[data-role-id="${roleId}"]`).click();
  await page.locator("#inp-message").waitFor({ state: "visible" });
  await page.waitForRole?.(roleId);
  return page.evaluate(() => {
    const input = document.querySelector("#inp-message");
    const attachment = document.querySelector("#btn-attach-image");
    const decision = [...document.querySelectorAll("#judge-decision-toggle")];
    return { inputDisabled: input?.disabled, attachmentDisabled: attachment?.disabled,
      decisionCount: decision.length, decisionInHeader: decision.every(node => !!node.closest(".session-actions")),
      decisionRevision: decision[0]?.closest("[data-revision]")?.getAttribute("data-revision") ?? null,
      stopPresent: !!document.querySelector("#btn-halt"), taskHistoryPresent: !!document.querySelector("#tab-tasks"),
      roleHistoryPresent: !!document.querySelector("#tab-work"),
      // These are actual displayed rows, never inferred from TSX source or fabricated IPC.
      visibleDecisionSources: [...document.querySelectorAll("[data-source]")].map(node => node.getAttribute("data-source")),
    };
  });
}

/** Screenshots accompany each actual observation; caller supplies sourceIdentity and real scenario coverage. */
export async function runPreparedUiProbe(page, { outputDirectory, sourceIdentity, coverage }) {
  assert.ok(path.isAbsolute(outputDirectory)); assert.match(sourceIdentity, /^[a-f0-9]{64}$/i);
  assert.ok(Array.isArray(coverage), "Host must describe actual D3/acceptance/recovery scenarios, including uncovered items");
  await fs.mkdir(outputDirectory, { recursive: true });
  const results = [];
  for (const roleId of ["chief", "product", "rapporteur", "nominator", "convener", "verifier"]) {
    const observation = await inspectSelectedRole(page, roleId);
    assert.equal(observation.inputDisabled, roleId !== "chief", `${roleId} customer input ownership`);
    if (roleId !== "chief") assert.equal(observation.attachmentDisabled, true);
    assert.equal(observation.decisionCount, roleId === "chief" ? 1 : 0);
    assert.equal(observation.decisionInHeader, true);
    assert.equal(observation.stopPresent, true, "Stop control is preserved even when not currently visible");
    assert.equal(observation.taskHistoryPresent, true); assert.equal(observation.roleHistoryPresent, true);
    const screenshot = path.join(outputDirectory, `${roleId}.png`);
    const capture = await page.screenshot({ path: screenshot, expectedRoleId: roleId, expectedRuntime: "Codex" });
    const bytes = await fs.readFile(screenshot);
    results.push({ roleId, observation, capture, screenshot, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
  const report = { at: new Date().toISOString(), captureScope: "Actual viewport screenshots; no full-page capture claim", sourceIdentity, inference: "scripted-provider", actualUi: true,
    coverage, results, limitations: ["This probe alone does not prove request source, retained D3/acceptance/recovery behavior, internal dispatch or stop settlement. Host scenario observations must supply those separately."] };
  await fs.writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SELF = fileURLToPath(import.meta.url);
async function sourceSnapshot() {
  const rows = [];
  async function walk(file) {
    const stat = await fs.lstat(file); assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) { for (const name of (await fs.readdir(file)).sort()) await walk(path.join(file, name)); return; }
    assert.ok(!path.basename(file).startsWith(".env"), "Never hash or load a user credential file");
    if (!file.startsWith(path.join(REPO, "app/renderer/dist") + path.sep) && !/\.(?:ts|tsx|js|mjs|cjs|md|html|css|json)$/.test(file)) return;
    rows.push({ path: path.relative(REPO, file).replaceAll("\\", "/"), sha256: crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex") });
  }
  for (const name of ["src", "app", "test/测试/direct-role-capabilities-ui.mjs", "test/测试/git-role-workflows-driver.ts"]) await walk(path.join(REPO, name));
  return { files: rows, identity: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
async function loadedRendererArtifactManifest(win, loadFacts, phase) {
  const observed = await win.webContents.executeJavaScript(`(() => ({ entry: location.href, language: document.documentElement.lang,
    scripts: [...document.scripts].map(node => node.src).filter(Boolean),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(node => node.href),
    resources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /\.(?:js|css)(?:$|[?#])/.test(name)),
    switchHint: { text: document.getElementById('judge-switch-hint')?.textContent, title: document.getElementById('judge-switch-hint')?.getAttribute('title') } }))()`);
  phase("actual-renderer-loaded-resource-observation", { observed, loadFacts });
  const dist = await fs.realpath(path.join(REPO, "app/renderer/dist"));
  const urls = [...new Set([observed.entry, ...observed.scripts, ...observed.styles, ...observed.resources])].sort(), assets = [];
  for (const uri of urls) {
    const file = fileURLToPath(uri), resolved = await fs.realpath(file);
    assert.ok(resolved.startsWith(dist + path.sep) && resolved === file, "Actual loaded resource must be in the owned renderer build");
    assert.ok([".html", ".js", ".css"].includes(path.extname(resolved)));
    const bytes = await fs.readFile(resolved); assets.push({ uri, path: path.relative(REPO, resolved).split(path.sep).join("/"), bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
  assert.ok(loadFacts.loads.some(row => row.url === observed.entry), "Actual loaded entry requires its native did-finish-load receipt");
  const requestReceipts = [];
  for (const [uris, resourceType] of [[observed.scripts, "script"], [observed.styles, "stylesheet"]]) for (const uri of uris) {
    const expectedPath = await fs.realpath(fileURLToPath(uri));
    const candidates = loadFacts.requests.filter(row => row.state === "completed" && row.resourceType === resourceType && fileURLToPath(row.url) === expectedPath);
    assert.ok(candidates.length > 0, `ACTUAL_LOADED_RESOURCE_RECEIPT_UNAVAILABLE ${resourceType} ${uri}`);
    assert.ok(candidates.every(row => !(typeof row.statusCode === "number" && row.statusCode >= 400)));
    requestReceipts.push({ uri, resourceType, receipts: candidates });
  }
  assert.ok(observed.scripts.length && observed.styles.length);
  assert.ok(["zh-CN", "en-US"].includes(observed.language));
  const sourcePath = `src/common/shared/i18n/messages/${observed.language}.ts`, sourceBytes = await fs.readFile(path.join(REPO, sourcePath));
  const match = sourceBytes.toString("utf8").match(/"ui\.decisionDialog\.switchHint":\s*("(?:[^"\\]|\\.)*")/); assert.ok(match);
  const expected = JSON.parse(match[1]); assert.equal(observed.switchHint.text, expected); assert.equal(observed.switchHint.title, expected);
  return { observed, requestReceipts, loads: loadFacts.loads, assets, manifestSha256: crypto.createHash("sha256").update(JSON.stringify(assets)).digest("hex"), switchHintSource: { path: sourcePath, sha256: crypto.createHash("sha256").update(sourceBytes).digest("hex"), key: "ui.decisionDialog.switchHint", expected } };
}
export function uiConsoleError(detailsOrLevel, legacyMessage) {
  const details = detailsOrLevel && typeof detailsOrLevel === "object" ? detailsOrLevel : null;
  const level = details ? details.level : detailsOrLevel, message = details ? details.message : legacyMessage;
  if (level === "error" || level === 3) return { level, message: typeof message === "string" ? message : String(message) };
  if (![0, 1, 2, "info", "warning", "warn", "debug", "verbose"].includes(level)) return { level: "unknown", message: "Unsupported Electron console-message signature" };
  return null;
}
export function uiStderrFailures(stderr) {
  assert.equal(typeof stderr, "string");
  return stderr.split(/\r?\n/).filter(line => /Error occurred in handler for|No handler registered|(?:^|\s)(?:[A-Za-z]*Error|UnhandledPromiseRejection)(?::|\b)/.test(line));
}
export function assertUiCompletedClean(life, report, stderrErrors) {
  assert.equal(life.childDeadlineFired ?? false, false); assert.equal(life.watchdogFired, false);
  for (const type of ["EXIT", "CLOSE"]) { const row = life.events.find(row => row.type === type); assert.ok(row); assert.equal(row.exitCode, 0); assert.equal(row.signal, null); }
  assert.deepEqual(stderrErrors, [], "Unknown IPC/handler/main errors prevent UI_COMPLETE");
  assert.equal(report.ok, true, report.error?.message ?? report.cleanupError?.message);
  assert.deepEqual(report.consoleErrors, []);
}
async function waitUntil(check, deadline, label) {
  for (;;) { if (await check()) return; assert.ok(Date.now() < deadline, `UI_BOUNDED_WAIT ${label}`); await new Promise(resolve => setTimeout(resolve, 25)); }
}
async function resizeHiddenViewport(win, deadline, phase, identity, evaluate, expectedContentSize) {
  const beforeIdentity = await identity(), beforeContentSize = win.getContentSize(); assert.equal(win.isVisible(), false);
  assert.ok(expectedContentSize.some((value, i) => value !== beforeContentSize[i]), "A real viewport size change is required");
  const beforeViewport = await evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })), resizeEvents = [];
  const onResize = () => { const entry = { at: new Date().toISOString(), contentSize: win.getContentSize(), windowVisible: win.isVisible() }; resizeEvents.push(entry); phase("actual-window-resize", entry); };
  win.on("resize", onResize); let acknowledgedViewport;
  try {
    const resizeRequestedAt = new Date().toISOString(); phase("actual-content-resize-request", { beforeContentSize, expectedContentSize, resizeRequestedAt });
    win.setContentSize(...expectedContentSize);
    await waitUntil(async () => { acknowledgedViewport = await evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio }));
      return resizeEvents.length > 0 && win.getContentSize().every((value, i) => value === expectedContentSize[i]) && acknowledgedViewport.width === expectedContentSize[0] && acknowledgedViewport.height === expectedContentSize[1];
    }, deadline, "actual native resize and renderer viewport ack");
    assert.equal(win.isVisible(), false); assert.deepEqual(await identity(), beforeIdentity);
    return { beforeIdentity, beforeContentSize, beforeViewport, expectedContentSize, resizeRequestedAt, resizeEvents, acknowledgedViewport };
  } finally { win.removeListener("resize", onResize); }
}
function nativePage(win, deadline, phase, resizeEveryCapture) {
  const baseContentSize = win.getContentSize(), alternateContentSize = baseContentSize.map(size => size + 16);
  const evaluate = fn => win.webContents.executeJavaScript(`(${fn.toString()})()`);
  const identity = async () => ({ ...await evaluate(() => {
    const active = [...document.querySelectorAll("button.tree-item[aria-current='true']")];
    return { roleIds: active.map(node => node.getAttribute("data-role-id")), roleLabel: active[0]?.querySelector(".ti-name")?.textContent?.trim() ?? null,
      headerRole: document.getElementById("chat-role")?.textContent?.trim() ?? null,
      runtime: document.getElementById("runtime-select")?.textContent?.trim() ?? null, documentTitle: document.title };
  }), windowTitle: win.getTitle() });
  return { evaluate, identity,
    locator: selector => ({
      click: async () => { await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('ACTUAL_UI_ELEMENT_UNAVAILABLE');el.click();})()`); },
      waitFor: async () => waitUntil(() => win.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});return !!el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';})()`), deadline, selector),
    }),
    screenshot: async ({ path: file, expectedRoleId, expectedRuntime }) => {
      assert.ok(Date.now() < deadline); const before = await identity();
      assert.deepEqual(before.roleIds, [expectedRoleId]); assert.equal(before.runtime, expectedRuntime);
      assert.ok(before.roleLabel); assert.equal(before.headerRole, before.roleLabel);
      let surfaceResize;
      if (resizeEveryCapture) {
        const current = win.getContentSize();
        assert.ok([baseContentSize, alternateContentSize].some(size => size.every((value, i) => value === current[i])), "Unexpected actual viewport before bounded resize");
        const target = current.every((value, i) => value === baseContentSize[i]) ? alternateContentSize : baseContentSize;
        surfaceResize = await resizeHiddenViewport(win, deadline, phase, identity, evaluate, target); assert.deepEqual(surfaceResize.beforeIdentity, before);
      }
      assert.equal(win.isVisible(), false, "Diagnostic host must not show an OS window");
      const visibilityBefore = await evaluate(() => {
        if (window.__ansQaVisibilityCapture) throw Error("Overlapping visibility probe");
        const probe = { initial: document.visibilityState, events: [], overflow: false };
        probe.listener = () => { if (probe.events.length >= 64) { probe.overflow = true; return; } probe.events.push({ state: document.visibilityState, at: performance.now() }); };
        document.addEventListener("visibilitychange", probe.listener); window.__ansQaVisibilityCapture = probe;
        return { state: document.visibilityState, at: performance.now() };
      });
      const presentations = [], subscribedAt = new Date().toISOString();
      let subscribed = false, image, visibilityAfter;
      const captureStartedAt = new Date().toISOString();
      try {
        win.webContents.beginFrameSubscription(false, (frame, dirtyRect) => {
          if (presentations.length >= 4) return;
          const entry = { at: new Date().toISOString(), dirtyRect, size: frame.getSize(), pngSHA256: crypto.createHash("sha256").update(frame.toPNG()).digest("hex") };
          presentations.push(entry); phase("native-presentation-during-default-capture", { file: path.basename(file), ...entry });
        }); subscribed = true;
        phase("default-capture-start-hidden-window", { file: path.basename(file), before, visibilityBefore, windowVisible: win.isVisible(), captureStartedAt });
        image = await win.webContents.capturePage();
        assert.ok(Date.now() < deadline); assert.equal(image.isEmpty(), false);
      } finally {
        if (subscribed && !win.webContents.isDestroyed()) win.webContents.endFrameSubscription();
        visibilityAfter = await evaluate(() => {
          const probe = window.__ansQaVisibilityCapture;
          if (!probe) throw Error("Visibility probe missing");
          document.removeEventListener("visibilitychange", probe.listener); delete window.__ansQaVisibilityCapture;
          return { state: document.visibilityState, at: performance.now(), events: probe.events, overflow: probe.overflow };
        });
        phase("default-capture-finished-hidden-window", { file: path.basename(file), at: new Date().toISOString(), visibilityAfter, windowVisible: win.isVisible(), presentations });
      }
      assert.equal(win.isVisible(), false, "Capture must not show an OS window"); assert.equal(visibilityAfter.overflow, false);
      const capturedAt = new Date().toISOString(), after = await identity(); assert.deepEqual(after, before);
      const bytes = image.toPNG(), pngSize = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      if (surfaceResize) { assert.deepEqual(pngSize, { width: surfaceResize.acknowledgedViewport.width, height: surfaceResize.acknowledgedViewport.height }); assert.deepEqual(image.getSize(), pngSize); }
      await fs.writeFile(file, bytes, { flag: "wx" });
      return { before, after, surfaceResize, pngSize, windowVisibleBefore: false, windowVisibleAfter: win.isVisible(), visibilityBefore, visibilityAfter, subscribedAt, captureStartedAt, capturedAt, presentations, size: image.getSize(), nativeScaleFactors: image.getScaleFactors(), encodedDefaultScaleFactor: 1,
        method: "Actual default capturePage original PNG; actual resize/viewport ack when enabled, role identity and raw size guards; visual pixels require manual review" };
    },
  };
}

function startIsolatedElectronHost(output, ownedRoot, firstResizeDiagnostic = false) {
  // All path checks and app configuration precede the first asynchronous yield.
  const require = createRequire(import.meta.url), electron = require("electron");
  const { app } = electron, userData = path.join(ownedRoot, "user-data"), codexHome = path.join(ownedRoot, "codex-home");
  const temp = fsSync.realpathSync(os.tmpdir());
  assert.equal(path.dirname(fsSync.realpathSync(ownedRoot)), temp);
  assert.ok(path.basename(ownedRoot).startsWith("ans-owned-ui-"));
  for (const directory of [ownedRoot, userData, codexHome, output]) {
    const stat = fsSync.lstatSync(directory); assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(fsSync.realpathSync(directory), directory);
  }
  assert.equal(process.env.CODEX_HOME, codexHome);
  assert.equal(app.isReady(), false, "Owned paths must be bound before Electron ready");
  app.setPath("userData", userData); assert.equal(app.getPath("userData"), userData);
  const bootstrapFile = path.join(output, "bootstrap-phases.jsonl"), deadline = Date.now() + 60000;
  const phase = (stage, details = {}) => fsSync.appendFileSync(bootstrapFile, JSON.stringify({ stage, at: new Date().toISOString(), pid: process.pid, ...details }) + "\n");
  phase("owned-paths-bound-before-ready", { userData, codexHome, ready: app.isReady(), deadline });
  app.whenReady().then(() => {
    phase("electron-ready", { ready: app.isReady() });
    return runIsolatedElectronHost(output, ownedRoot, electron, deadline, phase, firstResizeDiagnostic);
  }).catch(error => {
    phase("bootstrap-rejected", { message: String(error), stack: error?.stack });
    console.error(error); process.exitCode = 1; app.quit();
  });
  phase("ready-callback-registered-module-returning");
}

async function runIsolatedElectronHost(output, ownedRoot, { app, BrowserWindow, ipcMain, net: electronNet }, deadline, phase, firstResizeDiagnostic) {
  const userData = path.join(ownedRoot, "user-data");
  const calls = [], deniedNetwork = [], consoleErrors = [], lifecycle = [];
  let win, driver, networkMonitor, primary, httpStarted = false, releaseHttp = () => {}, released = false;
  const gate = new Promise(resolve => { releaseHttp = () => { released = true; resolve(); }; });
  const originalFetch = globalThis.fetch;
  let restoreNetwork = () => {};
  const loadFacts = { loads: [], requests: [] };
  const report = { loadedResourceRaw: loadFacts, started: new Date().toISOString(), mainPid: process.pid, ownedRoot, userData, output, ok: false,
    host: "Production DesktopInterface + production preload/renderer; dedicated test host, not app/main.ts startup", calls, deniedNetwork, consoleErrors, lifecycle,
    testSafetyConditions: ["Only Codex Chat with explicit fake key/owned env and fixed loopback inference", "Renderer HTTP and Node fetch/TCP guarded by test host; not product protection evidence", "No native SDK, real model, foreign MCP or user credentials/configuration"],
    uncovered: ["Retained D3/acceptance/recovery UI scenarios", "main.ts production bootstrap and packaged startup", "Native tool execution/operating-system stop"] };
  try {
    phase("host-work-started-after-ready"); assert.equal(app.isReady(), true);
    win = new BrowserWindow({ show: false, width: 1360, height: 900, webPreferences: { preload: path.join(REPO, "app/preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("did-finish-load", () => { const row = { at: new Date().toISOString(), url: win.webContents.getURL() }; loadFacts.loads.push(row); phase("native-renderer-did-finish-load", row); });
    const distRequestPattern = pathToFileURL(path.join(REPO, "app/renderer/dist")).href + "/*";
    win.webContents.session.webRequest.onCompleted({ urls: [distRequestPattern] }, details => {
      const row = { state: "completed", at: new Date().toISOString(), id: details.id, url: details.url, resourceType: details.resourceType, statusCode: details.statusCode, fromCache: details.fromCache };
      loadFacts.requests.push(row); phase("actual-renderer-file-request-completed", row);
    });
    win.webContents.session.webRequest.onErrorOccurred({ urls: [distRequestPattern] }, details => {
      const row = { state: "failed", at: new Date().toISOString(), id: details.id, url: details.url, resourceType: details.resourceType, error: details.error };
      loadFacts.requests.push(row); consoleErrors.push(row); phase("actual-renderer-file-request-failed", row);
    });
    win.webContents.on("console-message", (_event, detailsOrLevel, legacyMessage) => { const error = uiConsoleError(detailsOrLevel, legacyMessage); if (error) consoleErrors.push(error); });
    win.webContents.on("did-fail-load", (_event, errorCode, description, url, isMainFrame) => { if (isMainFrame && errorCode !== -3) consoleErrors.push({ source: "did-fail-load", errorCode, description, url }); });
    const { createRealHttpDriver, modelDone } = await import("./git-role-workflows-driver.ts");
    driver = await createRealHttpDriver({ chief: [async body => {
      const md = await fs.readFile(path.join(REPO, "src/common/门禁引擎/workflows/chief/chief-workflow.md"), "utf8");
      assert.ok(body.messages.some(message => message.role === "system" && typeof message.content === "string" && message.content.includes(md)));
      httpStarted = true; lifecycle.push({ stage: "actual-default-chat-http-before-stop", at: new Date().toISOString(), request: body });
      await gate; return modelDone("本地UI停止诊断回包；没有业务批准、派发或执行动作。");
    }] }, { tag: "isolated-ui", requestLimit: 8, timeoutMs: 15000, caseDeadlineAt: deadline, applicationDataRoot: userData,
      emitUiEvent: event => { if (win && !win.isDestroyed()) win.webContents.send("session:event", event); },
      emitUiRoleState: state => { if (win && !win.isDestroyed()) win.webContents.send("session:role-state", state); },
    });
    assert.ok(driver.initialRootFacts.ancestors.every(row => !row.gitMarker && !row.symbolicLink));
    const inference = new URL(driver.inferenceOrigin); report.inferenceOrigin = inference.origin; report.projectRoot = driver.root;
    await fs.writeFile(path.join(userData, "no-real-credentials.env"), `CODEX_API_KEY=q-ui-explicit-fake-key\nANS_CODEX_MODEL=q2-fixture-only\nANS_CODEX_BASE_URL=${inference.origin}/v1\nANS_CODEX_WIRE_API=chat\n`, { flag: "wx", mode: 0o600 });
    report.explicitOwnedConfiguration = { envPath: path.join(userData, "no-real-credentials.env"), key: "explicit fake only", model: "q2-fixture-only", endpoint: inference.origin, wire: "chat" };
    globalThis.fetch = (input, init) => { const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (target.origin !== inference.origin) { deniedNetwork.push({ plane: "node-fetch", target: target.origin }); throw Error("UI_TEST_EXTERNAL_NETWORK_BLOCKED"); } return originalFetch(input, init); };
    const net = await import("node:net"), originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function(...args) {
      let first = args[0]; if (Array.isArray(first)) first = first[0];
      if (first && typeof first === "object" && first.path) { if (typeof first.path === "string" && first.path.startsWith(ownedRoot + path.sep)) return originalConnect.apply(this, args);
        deniedNetwork.push({ plane: "node-pipe", path: "outside-owned-root" }); throw Error("UI_TEST_EXTERNAL_PIPE_BLOCKED"); }
      const port = typeof first === "number" ? first : Number(first?.port), host = typeof first === "number" ? args[1] : first?.host ?? first?.hostname;
      if (port !== Number(inference.port) || !["127.0.0.1", "localhost", "::1"].includes(host)) { deniedNetwork.push({ plane: "node-tcp", host: typeof host === "string" ? host : "unknown", port: Number.isFinite(port) ? port : null }); throw Error("UI_TEST_EXTERNAL_TCP_BLOCKED"); }
      return originalConnect.apply(this, args);
    };
    restoreNetwork = () => { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; };
    win.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, callback) => {
      const permitted = new URL(details.url).origin === inference.origin; if (!permitted) deniedNetwork.push({ plane: "renderer", url: details.url }); callback({ cancel: !permitted });
    });
    const desktop = driver.desktop;
    const { createNetworkMonitor } = await import("../../app/desktop/network-monitor.ts");
    networkMonitor = createNetworkMonitor({ probe: () => electronNet.isOnline(), onState: state => {
      desktop.applyNetworkState(state); if (!win.isDestroyed()) win.webContents.send("network:state", state);
    } });
    networkMonitor.start(); desktop.applyNetworkState(networkMonitor.current());
    const recovery = { projectRoot: null, roleId: null, runtime: "codex" };
    report.windowRecoverySource = "Owned window identity from actual successful listProject/openSession receipts; no prior recovery/user config read";
    const forward = { "preferences:get": () => desktop.getPreferences(), "preferences:set-locale": input => desktop.setLocale(input),
      "app:pick-project": () => desktop.pickProject(), "app:list-project": async input => { const result = await desktop.listProject(input);
        if (recovery.projectRoot !== result.projectRoot) recovery.roleId = null; recovery.projectRoot = result.projectRoot; return result; },
      "app:recovery-state": () => ({ ...recovery }), "network:get-state": () => networkMonitor.current(),
      "network:renderer-state": input => { if (!input || typeof input.online !== "boolean") return { ok: false }; return { ok: true, state: networkMonitor.noteRendererState(input.online) }; },
      "project:document-read": input => desktop.readProjectDocument(input), "project-state:get": input => desktop.getProjectState(input),
      "session:live": () => desktop.listLiveSessions(), "session:live-views": () => desktop.listLiveSessionViews(), "session:role-states": () => desktop.requestRoleStates(),
      "session:history-get": input => desktop.getSessionHistory(input), "session:send": input => desktop.sendSession(input), "session:stop": input => desktop.stopSession(input), "session:abort": input => desktop.abortSession(input),
      "session:open": async input => { if (input?.runtime !== "codex") { calls.push({ channel: "test-runtime-fence", actualRequestedRuntime: input?.runtime, noConstructor: true }); return { ok: false, error: "UI test safety condition: select explicitly configured Codex Chat loopback", code: "UI_TEST_RUNTIME_BLOCKED" }; } const result = await desktop.openSession(input); if (result.ok && input.projectRoot === recovery.projectRoot) { recovery.roleId = input.roleId; recovery.runtime = input.runtime; } return result; },
      "runtime-config:get": input => desktop.getRuntimeConfig(input?.runtime), "runtime-config:save": input => desktop.saveRuntimeConfig(input),
      "decision:judge-get": () => desktop.getDecisionJudgeState(), "decision:judge-set": async input => { const result = await desktop.setDecisionJudgeEnabled(input); win.webContents.send("decision:judge-state", desktop.getDecisionJudgeState()); return result; },
      "shell:judge-get": () => desktop.getShellJudgeState(), "shell:judge-set": async input => { const result = await desktop.setShellJudgeEnabled(input); win.webContents.send("shell:judge-state", desktop.getShellJudgeState()); return result; },
      "tasks:list": input => desktop.listTasks(input), "roles:activity-log": input => desktop.readRoleActivityLog(input),
      "version-change:list": input => desktop.listVersionChanges(input), "stable-write:list": input => desktop.listStableWrites(input), "refactor:list": input => desktop.listRefactorRequests(input), "doc-freeze:list": input => desktop.listDocFreezes(input), "trunk:list": input => desktop.listTrunks(input),
      "background-tasks:list": input => desktop.listBackgroundTasks(input), "session:get-persistence": input => desktop.getSessionPersistence(input),
      "app:renderer-diagnostic": input => { lifecycle.push({ stage: "actual-renderer-diagnostic", input }); return { ok: true }; },
      "window:is-maximized": () => win.isMaximized(), "window:minimize": () => win.minimize(), "window:toggle-maximize": () => { win.isMaximized() ? win.unmaximize() : win.maximize(); return win.isMaximized(); }, "window:close": () => win.close(),
    };
    for (const [channel, handle] of Object.entries(forward)) ipcMain.handle(channel, async (event, input) => {
      assert.equal(event.sender, win.webContents); const row = { at: new Date().toISOString(), channel, input }; calls.push(row);
      try { row.result = await handle(input); return row.result; } catch (error) { row.error = String(error); throw error; }
    });
    await win.loadFile(path.join(REPO, "app/renderer/dist/index.html")); const page = nativePage(win, deadline, phase, !firstResizeDiagnostic);
    page.waitForRole = roleId => waitUntil(async () => {
      const current = await page.identity(); return current.roleIds.length === 1 && current.roleIds[0] === roleId && current.headerRole === current.roleLabel && current.runtime === "Codex" &&
        calls.some(row => row.channel === "session:open" && row.input?.roleId === roleId && row.input?.runtime === "codex" && row.input?.projectRoot === driver.root && row.result?.ok);
    }, deadline, `actual ${roleId} session receipt and committed DOM identity`);
    await page.locator("#btn-import").waitFor({ state: "visible" }); await page.locator("#btn-import").click();
    await page.locator("button.tree-item[data-role-id='chief']").waitFor({ state: "visible" });
    await page.locator("#runtime-select").click(); await page.locator("#runtime-option-codex").click();
    await waitUntil(() => calls.some(row => row.channel === "session:open" && row.input?.runtime === "codex" && row.result?.ok), deadline, "actual Codex role open");
    const source = await sourceSnapshot(); report.source = source; report.loadedRendererArtifacts = await loadedRendererArtifactManifest(win, loadFacts, phase);
    if (firstResizeDiagnostic) {
      report.diagnostic = "Single Chief actual content viewport resize/fresh-surface observation; not full UI smoke";
      report.uncovered.push("Six-role visual smoke, toggle/stop UI actions are not exercised by this resize diagnostic");
      await page.waitForRole("chief");
      const resized = await resizeHiddenViewport(win, deadline, phase, page.identity, page.evaluate, win.getContentSize().map(size => size + 16));
      const screenshot = path.join(output, "chief-resized.png"), capture = await page.screenshot({ path: screenshot, expectedRoleId: "chief", expectedRuntime: "Codex" });
      const bytes = await fs.readFile(screenshot), pngSize = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      assert.deepEqual(pngSize, { width: resized.acknowledgedViewport.width, height: resized.acknowledgedViewport.height });
      assert.deepEqual(capture.size, pngSize); assert.equal(win.isVisible(), false); assert.deepEqual(await page.identity(), resized.beforeIdentity);
      report.firstChiefResize = { ...resized, capture, screenshot, pngSize, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), visualReview: "Pending actual original image review; size/hash/signals do not establish freshness" };
      assert.deepEqual(await sourceSnapshot(), source); assert.deepEqual(consoleErrors, []); assert.deepEqual(driver.errors, []); report.appMetricsBeforeQuit = app.getAppMetrics(); report.ok = true; return;
    }
    report.roleProbe = await runPreparedUiProbe(page, { outputDirectory: output, sourceIdentity: source.identity, coverage: ["Actual six role selection", "Chief-only customer composer", "Actual header control presence; toggle/stop checked separately below"] });
    await page.locator("button.tree-item[data-role-id='chief']").click();
    const initial = desktop.getDecisionJudgeState(); assert.equal(initial.ok, true); assert.equal(initial.enabled, false);
    await page.locator("#judge-decision-toggle").click();
    await waitUntil(() => calls.some(row => row.channel === "decision:judge-set" && row.input?.enabled === true && row.result?.ok), deadline, "true decision toggle IPC");
    assert.equal(desktop.getDecisionJudgeState().enabled, true); await page.locator("#judge-decision-toggle").click();
    await waitUntil(() => desktop.getDecisionJudgeState().enabled === false, deadline, "decision toggle restored through actual Interface");
    report.toggle = calls.filter(row => row.channel === "decision:judge-set"); assert.equal(report.toggle.length, 2);
    await win.webContents.executeJavaScript(`(()=>{const el=document.getElementById('inp-message');if(!el||el.disabled)throw Error('Chief input unavailable');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'UI local loopback bounded stop probe; do not create tasks or authorize effects.');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await new Promise(resolve => setTimeout(resolve, 50)); await win.webContents.executeJavaScript(`document.getElementById('inp-message').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))`);
    await waitUntil(() => httpStarted, deadline, "actual default Core/Chat HTTP before stop");
    const actual = await driver.observe(); report.beforeStop = actual;
    assert.ok(actual.inventory.sessions.filter(row => row.phase === "live").every(row => row.toolSurface?.factoryProvenance === "default-production" && row.toolSurface?.native?.factory === "codex-chat"));
    await page.locator("#btn-halt").click();
    await waitUntil(() => calls.some(row => row.channel === "session:abort" && row.result), deadline, "actual stop IPC and return"); releaseHttp();
    await waitUntil(() => !driver.inspectInventory().activeDeliveries.length && !driver.inspectInventory().queuedDispatches.length && driver.inspectInventory().sessions.filter(row => row.phase === "live").every(row => row.lifecycle?.status === "quiescent"), deadline, "actual stopped turn quiescence");
    report.stop = calls.filter(row => row.channel === "session:abort"); assert.equal(report.stop.length, 1);
    assert.equal(report.stop[0].result.ok, true); assert.equal(report.stop[0].input.roleId, "chief"); assert.equal(report.stop[0].input.projectRoot, driver.root);
    report.afterStop = await driver.observe(); report.appMetricsBeforeQuit = app.getAppMetrics();
    report.afterStopCapture = await page.screenshot({ path: path.join(output, "chief-after-stop.png"), expectedRoleId: "chief", expectedRuntime: "Codex" }); assert.deepEqual(driver.errors, []);
    assert.deepEqual(await loadedRendererArtifactManifest(win, loadFacts, phase), report.loadedRendererArtifacts);
    assert.deepEqual(await sourceSnapshot(), source); assert.deepEqual(consoleErrors, [], "Unknown/failed renderer IPC must not be reported as a clean smoke"); report.ok = true;
  } catch (error) { primary = error; report.error = { message: String(error), stack: error?.stack }; }
  finally {
    if (!released) releaseHttp(); networkMonitor?.stop();
    try { if (driver) { await driver.dispose(); report.afterCleanup = await driver.observe(); report.driverErrors = driver.errors; if (driver.errors.length) report.ok = false; } }
    catch (error) { report.cleanupError = { message: String(error), stack: error?.stack }; report.ok = false; }
    if (consoleErrors.length) report.ok = false;
    report.appMetricsBeforeQuit = app.getAppMetrics();
    if (win && !win.isDestroyed()) { win.webContents.session.webRequest.onCompleted(null); win.webContents.session.webRequest.onErrorOccurred(null); }
    restoreNetwork(); report.finished = new Date().toISOString();
    await fs.writeFile(path.join(output, "isolated-host-report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
    if (win && !win.isDestroyed()) win.close(); app.quit();
  }
}

async function launchIsolatedUi(output, firstResizeDiagnostic = false) {
  assert.ok(path.isAbsolute(output)); const evidenceRoot = path.join(REPO, "角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence") + path.sep;
  assert.ok(output.startsWith(evidenceRoot), "UI output must stay in the authorized evidence root"); await fs.mkdir(output, { recursive: false });
  const ownedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-owned-ui-")), started = new Date().toISOString();
  await fs.mkdir(path.join(ownedRoot, "user-data")); await fs.mkdir(path.join(ownedRoot, "codex-home"));
  const source = await sourceSnapshot(), require = createRequire(import.meta.url), electron = require("electron"); assert.equal(typeof electron, "string");
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|PROXY|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|ELECTRON_RUN_AS_NODE|ANS_|OPENAI_|ANTHROPIC_)/i.test(name)));
  Object.assign(env, { CODEX_HOME: path.join(ownedRoot, "codex-home"), CODEX_API_KEY: "q-ui-explicit-fake-key", ANS_CODEX_WIRE_API: "chat", NODE_DISABLE_COMPILE_CACHE: "1" });
  const life = { started, parentPid: process.pid, childPid: null, argv: [SELF, firstResizeDiagnostic ? "--electron-owned-host-first-resize" : "--electron-owned-host", output, ownedRoot, `--user-data-dir=${path.join(ownedRoot, "user-data")}`], budget: { childMs: 60000, outerMs: 90000, http: 8, attempts: 1, retries: 0 }, ownedRoot, source, events: [{ type: "START", at: started }], watchdogFired: false };
  const persist = () => fs.writeFile(path.join(output, "lifecycle.json"), JSON.stringify(life, null, 2)); await persist();
  const child = spawn(electron, life.argv, { cwd: REPO, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let writes = Promise.resolve(); const log = (file, bytes) => { writes = writes.then(() => fs.appendFile(path.join(output, file), bytes)); };
  child.stdout.on("data", bytes => { log("stdout.log", bytes); process.stdout.write(bytes); }); child.stderr.on("data", bytes => { log("stderr.log", bytes); process.stderr.write(bytes); });
  child.on("spawn", () => { life.childPid = child.pid; life.events.push({ type: "SPAWN", at: new Date().toISOString(), pid: child.pid }); writes = writes.then(persist); console.log(JSON.stringify({ type: "UI_START", pid: child.pid, ownedRoot, output })); });
  child.on("exit", (exitCode, signal) => { life.events.push({ type: "EXIT", at: new Date().toISOString(), exitCode, signal }); writes = writes.then(persist); });
  const childTimer = setTimeout(() => { life.childDeadlineFired = true; life.events.push({ type: "CHILD_DEADLINE", at: new Date().toISOString() }); writes = writes.then(persist); child.kill("SIGTERM"); }, 60000);
  const timer = setTimeout(() => { life.watchdogFired = true; life.events.push({ type: "WATCHDOG", at: new Date().toISOString() }); writes = writes.then(persist); child.kill("SIGTERM"); }, 90000);
  try { await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (exitCode, signal) => { life.events.push({ type: "CLOSE", at: new Date().toISOString(), exitCode, signal }); resolve(); }); }); }
  finally { clearTimeout(childTimer); clearTimeout(timer); await writes; life.finished = new Date().toISOString(); await persist(); }
  const stderr = await fs.readFile(path.join(output, "stderr.log")).then(bytes => bytes.toString("utf8"), error => { if (error?.code === "ENOENT") return ""; throw error; });
  const stderrErrors = uiStderrFailures(stderr);
  await fs.writeFile(path.join(output, "launcher-error-observation.json"), JSON.stringify({ stderrErrors, stderrBytes: Buffer.byteLength(stderr), completeChildStream: true }, null, 2), { flag: "wx" });
  const report = JSON.parse(await fs.readFile(path.join(output, "isolated-host-report.json"), "utf8"));
  assertUiCompletedClean(life, report, stderrErrors);
  assert.deepEqual(await sourceSnapshot(), source); console.log(JSON.stringify({ type: firstResizeDiagnostic ? "UI_FIRST_RESIZE_DIAGNOSTIC_COMPLETE" : "UI_COMPLETE", output, sourceIdentity: source.identity, actualUi: true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (mode === "--isolated-ui" || mode === "--isolated-ui-first-resize") { assert.equal(process.argv.length, 4); launchIsolatedUi(path.resolve(process.argv[3]), mode === "--isolated-ui-first-resize").catch(error => { console.error(error); process.exitCode = 1; }); }
  else if (mode === "--electron-owned-host" || mode === "--electron-owned-host-first-resize") { assert.ok(process.versions.electron && process.type === "browser"); assert.ok(process.argv[3] && process.argv[4]); const root = path.resolve(process.argv[4]);
    const switches = process.argv.slice(5); assert.ok(switches.length <= 1 && switches.every(arg => arg === `--user-data-dir=${path.join(root, "user-data")}`)); startIsolatedElectronHost(path.resolve(process.argv[3]), root, mode === "--electron-owned-host-first-resize"); }
  else throw new Error("UI_NOT_RUN: explicit isolated mode and output required; unknown mode never launches an app");
}
