#!/usr/bin/env node
/**
 * test/桌面UI/phase5a-electron-smoke.mjs
 *
 * Phase 5A 真实 Electron 离线冒烟（受控 IPC 替身；无模型/网络/.env），验证三项缺口：
 *  1. Sidebar 身份只在 class/data/aria/title，无可见 .ti-badge 第三行；.ti-count 唯一数字；
 *  2. P7「待选择」：角色树与工作概览按未决 choice 显示；作答后回真实状态；
 *  3. 阅读锚点：full replay 前插后同一阅读行 offset <2px；贴底读者仍贴底。
 * 证据：1360/960/200% 截图；零 console.error / CSP 违规。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron test/桌面UI/phase5a-electron-smoke.mjs [entry.html] [outDir]
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
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : "/tmp/ans-phase5a-smoke";
const PRELOAD = path.join(HERE, "phase4b-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/phase5a-project";
const report = { entry: ENTRY, checks: [], console: [], csp: [], screenshots: [], failures: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
  return value === true;
}

let win = null;
const responses = [];
const openExternalCalls = [];
const navigations = [];
const deliveryReceipt = {
  version: 1,
  deliveryId: "d1",
  attemptId: "a1",
  turnId: "delivery-turn",
  inputSaved: true,
  history: "failed",
  outcome: "completed",
  retryHistoryAvailable: true,
};

const govRole = (roleId, fn) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: "",
  boundary: { entries: [] },
  boundaryPath: "",
  builtIn: true,
  governanceFunction: fn,
  changelog: null,
  docs: [],
});
const projectRole = (roleId) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: ROOT + "/角色卡/" + roleId + "/role-card.md",
  boundary: { entries: [] },
  boundaryPath: "",
  changelog: null,
  docs: [],
});
const listing = () => ({
  projectRoot: ROOT,
  primaryRoleId: "liaison",
  hasRoles: true,
  warnings: [],
  governanceModel: "trio",
  governanceRecord: { state: "present" },
  roles: [
    govRole("liaison", "liaison"),
    govRole("rapporteur", "proposal"),
    govRole("nominator", "nomination"),
    govRole("convener", "schedule"),
    govRole("verifier", "verification"),
    projectRole("A"),
    projectRole("B"),
    projectRole("C"),
  ],
});

function runtimeConfig(runtime) {
  const definition = RUNTIME_SETTINGS[runtime];
  return {
    runtime,
    label: definition.label,
    path: ROOT + "/.env",
    revision: 0,
    application: "next-session",
    missingKeys: [],
    fields: definition.fields.map((field) => ({
      ...field,
      value: "",
      isSet: field.required === true,
      source: field.required === true ? "environment" : "default",
    })),
  };
}

ipcMain.handle("app:recovery-state", () => null);
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", (_e, input) => {
  const root = input?.projectRoot || ROOT;
  if (root === "/phase5a-empty") {
    return { projectRoot: root, primaryRoleId: null, hasRoles: false, warnings: [], roles: [] };
  }
  if (root === "/phase5a-s0") {
    return { ...listing(), projectRoot: root, primaryRoleId: "liaison", hasRoles: false };
  }
  if (root === "/phase5a-gov") {
    return {
      ...listing(),
      projectRoot: root,
      governanceModel: "trio",
      governanceRecord: {
        state: "pin-mismatch",
        pinCount: 9,
        pinFiles: [{ path: "角色卡/assembly/boundary.yaml", pinned: "a1b2c3d4" + "0".repeat(56), actual: "9f8e7d6c" + "1".repeat(56), status: "modified" }],
      },
    };
  }
  return { ...listing(), projectRoot: root };
});
ipcMain.handle("app:pick-project", () => ROOT);
ipcMain.handle("app:open-external", (_e, input) => {
  openExternalCalls.push(input);
  return { ok: true };
});
ipcMain.handle("window:is-maximized", () => false);
ipcMain.handle("session:open", (_e, input) => ({
  ok: true,
  resumed: true,
  contextSource: "resumed",
  runtime: input.runtime,
  projectRoot: input.projectRoot,
}));
ipcMain.handle("session:history-get", (_e, input) => ({
  projectRoot: input.projectRoot,
  roleId: input.roleId,
  runtime: input.runtime,
  rows: [],
  error: null,
  skipped: 0,
}));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true }));
ipcMain.handle("session:withdraw", () => ({ ok: true }));
ipcMain.handle("session:operator-response", (_e, input) => {
  responses.push(input);
  return { ok: true };
});
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("shell:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("runtime-config:get", (_e, input) => runtimeConfig(input.runtime));
ipcMain.handle("runtime-config:save", (_e, input) => ({
  ok: true,
  runtime: input.runtime,
  appliedKeys: Object.keys(input.updates || {}),
  revision: 1,
  application: "next-session",
}));
ipcMain.handle("project:document-read", () => ({ ok: false, code: "NOT_LISTED" }));
ipcMain.handle("session:get-persistence", (_e, input) => ({
  ok: true,
  version: 1,
  scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
  value: { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true },
}));
ipcMain.handle("report:get-save-state", () => ({ ok: false, code: "DISABLED" }));
ipcMain.handle("delivery:get-receipt", (_e, input) => ({
  ok: true,
  version: 1,
  scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
  value: { state: "known", receipt: deliveryReceipt },
}));
ipcMain.handle("project:governance-reaccept-preview", (_e, input) => ({
  ok: true,
  preview: {
    projectRoot: input.projectRoot,
    writePaths: [".ans/project.json", "docs/bootstrap-manifest.md"],
    pinPaths: ["角色卡/governance-boundary.yaml"],
    pinCount: 9,
    changed: [{ path: "角色卡/assembly/boundary.yaml", pinned: "a1b2c3d4" + "0".repeat(56), actual: "9f8e7d6c" + "1".repeat(56), status: "modified" }],
    canConfirm: true,
    blockers: [],
    previewDigest: "b".repeat(64),
  },
}));

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
  wc.on("will-navigate", (_event, url) => {
    navigations.push(String(url));
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
    await sleep(140);
  };
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };
  const occlusion = (selector, shouldScroll = true) =>
    js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const composer = document.querySelector('.composer');
      const chat = document.getElementById('chat');
      if (!el || !composer || !chat) return { ok: false, reason: 'missing', selector: ${JSON.stringify(selector)} };
      ${shouldScroll ? "el.scrollIntoView({ block: 'end', inline: 'nearest' });" : ""}
      const e = el.getBoundingClientRect();
      const p = composer.getBoundingClientRect();
      const c = chat.getBoundingClientRect();
      return {
        ok: e.height > 0 && e.bottom <= p.top + 1 && e.bottom <= innerHeight + 1
          && e.left >= -1 && e.right <= innerWidth + 1
          && document.documentElement.scrollWidth <= innerWidth + 1,
        target: { top: e.top, bottom: e.bottom, h: e.height, left: e.left, right: e.right },
        composer: { top: p.top, bottom: p.bottom, h: p.height, position: getComputedStyle(composer).position },
        chat: { top: c.top, bottom: c.bottom, client: chat.clientHeight },
        innerHeight, innerWidth,
      };
    })()`);
  const reading = () =>
    js(`(() => {
      const c = document.getElementById('chat');
      const t = c.getBoundingClientRect().top;
      const nodes = [...c.querySelectorAll('.msg,.tool-records,.sys-denied')];
      const n = nodes.find((x) => x.getBoundingClientRect().bottom > t && x.getBoundingClientRect().top < c.getBoundingClientRect().bottom);
      return n ? { text: n.textContent.slice(0, 60), offset: n.getBoundingClientRect().top - t } : null;
    })()`);
  const bottomDistance = () =>
    js(`(() => { const c=document.getElementById('chat'); return c.scrollHeight-c.scrollTop-c.clientHeight; })()`);

  try {
    await win.loadFile(ENTRY);
    await sleep(500);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    await js(`window.__smokeCsp=[];document.addEventListener('securitypolicyviolation',(event)=>{window.__smokeCsp.push(event.violatedDirective+' '+event.blockedURI)})`);
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await sleep(220);
    await js(`await window.__ansRenderer.selectRole('liaison')`);
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(180);
    const brandIcons = await js(`(() => {
      const title = document.querySelector('.titlebar .titlebar-mark');
      const side = document.querySelector('.workspace-brand .workspace-brand-mark');
      const rect = (n) => n ? { w: n.getBoundingClientRect().width, h: n.getBoundingClientRect().height } : null;
      return {
        title: title ? { tag: title.tagName, alt: title.alt, src: title.getAttribute('src'), complete: title.complete, w: title.naturalWidth, h: title.naturalHeight, box: rect(title) } : null,
        side: side ? { tag: side.tagName, alt: side.alt, src: side.getAttribute('src'), complete: side.complete, w: side.naturalWidth, h: side.naturalHeight, box: rect(side) } : null,
        subtitle: document.querySelector('.workspace-brand span')?.textContent || '',
        titleText: document.querySelector('.titlebar-mark')?.textContent || '',
      };
    })()`);
    check(
      "brand icons are bundled img alt=ANS in titlebar and sidebar",
      brandIcons.title?.tag === "IMG"
        && brandIcons.title.alt === "ANS"
        && brandIcons.title.complete === true
        && brandIcons.title.w >= 16
        && Math.round(brandIcons.title.box?.w || 0) === 20
        && brandIcons.side?.tag === "IMG"
        && brandIcons.side.alt === "ANS"
        && brandIcons.side.complete === true
        && brandIcons.side.w >= 16
        && Math.round(brandIcons.side.box?.w || 0) === 30
        && brandIcons.subtitle === "AGENT WORKSPACE"
        && brandIcons.titleText === "",
      brandIcons,
    );

    // ————— 1. Sidebar 身份（1360） —————
    check(
      "Sidebar identity is data/aria only; no visible ti-badge third line",
      await js(`(() => {
        const tree = document.getElementById('role-tree');
        const primary = tree.querySelector('.tree-item.primary[data-role-id="liaison"]');
        return !!primary && primary.classList.contains('builtin')
          && primary.dataset.primary === 'true'
          && primary.dataset.builtin === 'true'
          && (primary.getAttribute('aria-description') || '').includes('主入口')
          && (primary.getAttribute('aria-description') || '').includes('内置')
          && (primary.title || '').includes('主入口')
          && !tree.querySelector('.ti-badge')
          && primary.querySelector('.ti-power').textContent.includes('客户沟通')
          && primary.querySelector('.ti-builtin').textContent.includes('随应用发布');
      })()`),
    );
    check(
      "primary row does not grow a duplicate third visible identity line",
      await js(`(() => {
        const primary = document.querySelector('.tree-item.primary');
        const lines = [...primary.querySelectorAll('.ti-name,.ti-power,.ti-group-duty,.ti-sub,.ti-builtin')].filter((el) => el.getBoundingClientRect().height > 0);
        return lines.filter((el) => el.classList.contains('ti-builtin')).length === 1 && !primary.querySelector('.ti-badge');
      })()`),
    );
    // busy 时唯一数字徽标是 .ti-count；不存在第二个数字徽标。
    await push("session:role-state", { roleId: "liaison", projectRoot: ROOT, runtime: "pi", busy: true, queue: [] });
    await sleep(180);
    await push("session:role-state", { roleId: "liaison", projectRoot: ROOT, runtime: "pi", busy: true, queue: [] });
    const countState = await js(`(() => {
        const primary = document.querySelector('.tree-item.primary');
        const counts = primary.querySelectorAll('.ti-count');
        return { count: counts.length, text: counts[0] ? counts[0].textContent : null, busy: window.__ansRenderer.state.roleBusy.liaison === true, allText: primary.textContent };
      })()`);
    check(
      "ti-count is the sole numeric badge",
      countState.count === 1 && countState.text.trim() === "1"
        && !(await js(`!!document.querySelector('.tree-item.primary .ti-badge')`)),
      countState,
    );
    await shot("01-sidebar-identity-1360");

    // ————— 2. P7 待选择（1360） —————
    await push("session:operator-request", {
      id: "phase5a-choice",
      roleId: "liaison",
      projectRoot: ROOT,
      runtime: "pi",
      request: { kind: "choice", title: "选择查看方式", options: [{ id: "one", label: "摘要" }, { id: "two", label: "完整" }] },
    });
    check(
      "P7 role tree shows 待选择 without a count suffix",
      await js(`(() => {
        const row = document.querySelector('.tree-item[data-role-id="liaison"]');
        const status = row.querySelector('.ti-status');
        return status.textContent.trim() === '待选择' && !/·\\s*\\d+/.test(status.textContent);
      })()`),
    );
    await js(`document.getElementById('tab-work').click()`);
    await sleep(100);
    check(
      "P7 work overview separates choice from empty queue",
      await js(`document.getElementById('right-body').textContent.includes('待选择') && document.getElementById('right-body').textContent.includes('无进行中或排队消息')`),
    );
    await shot("02-p7-pending-choice-1360");
    // 作答 → pending 移除，状态回真实（不再显示待选择/等待你确认）。
    await js(`(() => {
      const card = document.querySelector('[data-request-id="phase5a-choice"]');
      const input = card.querySelector('input[type="radio"]');
      input.click();
      card.querySelector('.op-submit').click();
    })()`);
    await sleep(180);
    check(
      "P7 answered choice returns to real status",
      await js(`(() => {
        const status = document.querySelector('.tree-item[data-role-id="liaison"] .ti-status');
        return !status.textContent.includes('待选择') && !status.textContent.includes('等待你确认');
      })()`),
    );
    check("P7 answer posted exactly once", responses.length === 1 && responses[0].id === "phase5a-choice", responses.slice(-1));
    check(
      "busy tail uses the same 12px status spinner at 0.9s",
      await js(`(() => {
        const spinner = document.querySelector('#chat .tool-current .status-spinner');
        const svg = spinner && spinner.querySelector('svg');
        if (!spinner || !svg) return false;
        const rect = spinner.getBoundingClientRect();
        const svgStyle = getComputedStyle(svg);
        return Math.abs(rect.width - 12) <= 1
          && Math.abs(rect.height - 12) <= 1
          && svgStyle.width === '12px' && svgStyle.height === '12px'
          && spinner.dataset.spinMotion === 'true'
          && spinner.dataset.spinDuration === '0.9';
      })()`),
    );

    // ————— 2b. Markdown 外链：只走 openExternal，不导航窗口 —————
    await push("session:history", {
      roleId: "liaison",
      projectRoot: ROOT,
      rows: [{ kind: "assistant", text: "[外链](https://example.com/x)", at: "" }],
    });
    await sleep(140);
    const linkInfo = await js(`(() => {
      const a = document.querySelector('#chat a.md-link');
      return a ? { href: a.getAttribute('href'), rel: a.getAttribute('rel'), className: a.className } : null;
    })()`);
    const urlBeforeLink = wc.getURL();
    await js(`document.querySelector('#chat a.md-link').click()`);
    await sleep(220);
    check(
      "markdown external link opens externally without navigating window",
      !!linkInfo &&
        linkInfo.href === "https://example.com/x" &&
        linkInfo.rel === "noopener noreferrer" &&
        linkInfo.className.includes("md-link") &&
        wc.getURL() === urlBeforeLink &&
        navigations.length === 0 &&
        openExternalCalls.length === 1 &&
        openExternalCalls[0].url === "https://example.com/x",
      { linkInfo, before: urlBeforeLink, after: wc.getURL(), navigations, openExternalCalls },
    );
    check(
      "markdown external link reports opened state without changing page",
      await js(`document.querySelector('#chat a.md-link').getAttribute('data-open-result') === 'opened'`),
    );

    // ————— 3. 阅读锚点（1360/960） —————
    const longRows = [];
    for (let i = 0; i < 220; i += 1) {
      longRows.push({ kind: "assistant", text: "row-" + i + " 长聊天验证。".repeat(12), at: "" });
      if (i === 120) {
        for (let j = 0; j < 24; j += 1) {
          longRows.push({
            kind: "tool",
            text: "调用工具 read_file",
            at: "",
            activity: { toolName: "read_file", target: "file-" + j + ".md", toolCallId: "long-" + j, phase: "call", status: "call" },
          });
        }
      }
    }
    await push("session:history", { roleId: "liaison", projectRoot: ROOT, rows: longRows });
    await sleep(180);
    check(
      "virtual long history is windowed before full replay",
      await js(`window.__ansRenderer.rowModelDebug('liaison').count > 150`),
    );
    const replayAt = async (width, label, prefix) => {
      win.setContentSize(width, width === 960 ? 620 : 860);
      await sleep(160);
      await js(`document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight * .55`);
      await sleep(140);
      const before = await reading();
      const rewritten = [{ kind: "assistant", text: prefix, at: "" }, ...longRows, { kind: "assistant", text: "appended tail " + label, at: "" }];
      await push("session:history", { roleId: "liaison", projectRoot: ROOT, rows: rewritten });
      const after = await reading();
      check(
        "full replay preserves content identity " + label,
        !!before && !!after && before.text === after.text && Math.abs(before.offset - after.offset) < 2,
        { before, after },
      );
      await shot("03-full-replay-" + label);
    };
    await replayAt(1360, "1360", "inserted prefix 1360");
    await replayAt(960, "960", "inserted prefix 960");
    // 贴底读者仍贴底（尾随新行）。
    win.setContentSize(960, 620);
    await sleep(120);
    await js(`document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight`);
    await sleep(160);
    const tailBefore = await reading();
    const tailRows = [{ kind: "assistant", text: "inserted prefix sticky", at: "" }, ...longRows, { kind: "assistant", text: "appended tail sticky", at: "" }];
    await push("session:history", { roleId: "liaison", projectRoot: ROOT, rows: tailRows });
    check(
      "sticky reader stays at bottom after full replay",
      (await bottomDistance()) <= 24,
      { before: tailBefore, distance: await bottomDistance() },
    );
    await shot("04-full-replay-sticky-960");

    // ————— 4. 200% 档：身份/P7 可见且无横向溢出 —————
    win.setContentSize(1360, 860);
    wc.setZoomFactor(2);
    await sleep(260);
    await push("session:operator-request", {
      id: "phase5a-choice-200",
      roleId: "liaison",
      projectRoot: ROOT,
      runtime: "pi",
      request: { kind: "choice", title: "200% 选择", options: [{ id: "one", label: "摘要" }, { id: "two", label: "完整" }] },
    });
    check(
      "200% identity/P7 visible without horizontal overflow",
      await js(`(() => {
        const primary = document.querySelector('.tree-item.primary');
        const status = primary.querySelector('.ti-status');
        const rect = primary.getBoundingClientRect();
        return !!status && status.textContent.trim() === '待选择'
          && rect.height > 0 && rect.right <= innerWidth + 1
          && !primary.querySelector('.ti-badge')
          && document.documentElement.scrollWidth <= innerWidth + 1;
      })()`),
    );
    const p0Metrics = await js(`(() => {
        const chat = document.getElementById('chat');
        const composer = document.querySelector('.composer');
        if (!chat || !composer) return { ok: false, reason: 'missing' };
        const c = composer.getBoundingClientRect();
        const overflowY = getComputedStyle(chat).overflowY;
        return {
          ok: chat.clientHeight >= 200
            && chat.scrollHeight > chat.clientHeight
            && overflowY === 'auto'
            && c.height > 0 && c.bottom <= innerHeight + 1 && c.top >= 0
            && document.documentElement.scrollWidth <= innerWidth + 1,
          chatClient: chat.clientHeight,
          chatScroll: chat.scrollHeight,
          overflowY,
          composer: { top: c.top, bottom: c.bottom, height: c.height },
          innerHeight,
          bodyScrollW: document.documentElement.scrollWidth,
          innerWidth,
        };
      })()`);
    check(
      "200% long history keeps composer reachable and chat internally scrollable",
      p0Metrics.ok === true,
      p0Metrics,
    );
    await shot("05-sidebar-p7-200pct");
    // P1：200% 无角色/会话失败态中栏不得横向溢出，输入区仍可达。
    await js(`await window.__ansRenderer.loadProject('/phase5a-empty')`);
    await sleep(220);
    const emptyMetrics = await js(`(() => {
      const mid = document.querySelector('.col-mid');
      const empty = document.querySelector('#chat .chat-empty');
      const composer = document.querySelector('.composer');
      const m = mid ? mid.getBoundingClientRect() : null;
      const e = empty ? empty.getBoundingClientRect() : null;
      const c = composer ? composer.getBoundingClientRect() : null;
      return {
        ok: !!mid && !!empty && !!composer
          && mid.scrollWidth <= mid.clientWidth + 1
          && document.documentElement.scrollWidth <= innerWidth + 1
          && e.right <= (m ? m.right : innerWidth) + 1
          && c.bottom <= innerHeight + 1,
        mid: m ? { left: m.left, right: m.right, scrollW: mid.scrollWidth, clientW: mid.clientWidth } : null,
        empty: e ? { left: e.left, right: e.right } : null,
        composer: c ? { top: c.top, bottom: c.bottom } : null,
        innerHeight,
      };
    })()`);
    check("200% empty/error state has no horizontal overflow and composer reachable", emptyMetrics.ok === true, emptyMetrics);
    await shot("06-empty-state-200pct");
    wc.setZoomFactor(1);
    await sleep(180);

    // S0：真实空项目（hasRoles=false 仍返回内置角色，primary=liaison）。
    await js(`await window.__ansRenderer.loadProject('/phase5a-s0')`);
    await sleep(220);
    const s0 = await js(`(() => {
      const empty = document.querySelector('#chat .chat-empty');
      const cta = document.querySelector('#chat .chat-empty #btn-start-primary');
      const gov = document.querySelector('#btn-governance-empty-action');
      const tree = document.getElementById('role-tree');
      const mentions = (document.body.textContent.match(/项目尚未 bootstrap/g) || []).length;
      return {
        title: empty ? empty.querySelector('.empty-title').textContent : null,
        sub: empty ? empty.querySelector('.empty-sub').textContent : null,
        cta: cta ? cta.textContent : null,
        gov: !!gov,
        mentions,
        treeText: tree ? tree.textContent : '',
        hint: document.getElementById('composer-hint').textContent,
        roleCount: window.__ansRenderer.state.roles.length,
        hasRoles: window.__ansRenderer.state.hasRoles,
      };
    })()`);
    check(
      "S0 hasRoles=false shows bootstrap title/sub/CTA once and no governance CTA",
      s0.title === "项目尚未 bootstrap"
        && s0.sub.includes("与 主理 对话") && s0.sub.includes("左树会随之长出")
        && s0.cta === "开始与 主理 对话"
        && s0.gov === false
        && s0.mentions === 1
        && !s0.treeText.includes("未枚举")
        && s0.hint === ""
        && s0.roleCount >= 5 && s0.hasRoles === false,
      s0,
    );
    await js(`(() => { const b=document.querySelector('#chat .empty-title'); b.setAttribute('data-s0','1'); })()`);
    await js(`document.querySelector('#chat .chat-empty #btn-start-primary').click()`);
    await sleep(180);
    check(
      "S0 CTA starts the primary session on explicit click",
      await js(`window.__ansRenderer.state.sessionOpenRoleId === 'liaison'`),
    );
    await js(`await window.__ansRenderer.loadProject('/phase5a-s0')`);
    await sleep(180);
    await js(`document.querySelector('#chat .chat-empty #btn-start-primary').focus()`);
    wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    wc.sendInputEvent({ type: "char", keyCode: "\r" });
    wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await sleep(200);
    check(
      "S0 CTA starts the primary session from keyboard",
      await js(`window.__ansRenderer.state.sessionOpenRoleId === 'liaison'`),
    );

    // ————— 5. 200% 镜像卡 / 交付批次目标可见（UIUX 5B-F7 缺证据补齐） —————
    wc.setZoomFactor(2);
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await sleep(220);
    await js(`await window.__ansRenderer.selectRole('liaison')`);
    await sleep(120);
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(160);
    await push("session:operator-request", {
      id: "phase5a-mirror-200",
      roleId: "rapporteur",
      projectRoot: ROOT,
      runtime: "pi",
      mirrorRoleId: "liaison",
      request: { kind: "confirm", title: "200% 镜像提案", cardKind: "proposal", flowId: "flow-200", summary: "提案 v1" },
    });
    await sleep(240);
    const mirrorMetrics = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="liaison"]');
      const card = pane ? pane.querySelector('[data-request-id="phase5a-mirror-200"]') : null;
      if (!card) return { ok: false, reason: 'missing' };
      const badge = card.querySelector('.op-mirror-badge');
      const source = card.querySelector('.op-mirror-source');
      if (!badge || !source) return { ok: false, reason: 'badges' };
      badge.scrollIntoView({ block: 'center' });
      const chat = document.getElementById('chat').getBoundingClientRect();
      const b = badge.getBoundingClientRect();
      const s = source.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        ok: card.classList.contains('is-mirror')
          && !!card.querySelector('.op-gov-badge')
          && card.querySelectorAll('.op-actions button').length === 2
          && b.height > 0 && b.top >= chat.top - 1 && b.bottom <= chat.bottom + 1
          && s.height > 0 && s.bottom <= chat.bottom + 1
          && c.right <= innerWidth + 1 && card.scrollWidth <= card.clientWidth + 1
          && document.documentElement.scrollWidth <= innerWidth + 1,
        badgeText: badge.textContent,
        sourceText: source.textContent,
        card: { top: c.top, bottom: c.bottom, right: c.right },
        chat: { top: chat.top, bottom: chat.bottom },
      };
    })()`);
    check("200% mirror card target visible with badge/source/actions", mirrorMetrics.ok === true, mirrorMetrics);
    await shot("07-operator-mirror-200pct");

    const deliverySnapshot = {
      version: 1,
      reportId: "phase5a-delivery-report",
      source: { roleId: "rapporteur", runtime: "pi", turnId: "report-turn" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: "交付目标可见性用安全摘要。", redacted: true, truncated: true },
      evidence: [{ text: "证据一", redacted: false, truncated: true }],
      evidenceOmitted: 0,
      at: "2026-10-21T00:00:00Z",
    };
    await js(`await window.__ansRenderer.selectRole('A')`);
    await sleep(160);
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(140);
    await push("session:events", [{
      projectRoot: ROOT,
      roleId: "A",
      runtime: "pi",
      event: {
        kind: "message",
        turnId: "delivery-turn",
        summary: "交接",
        detail: {
          source: "prompt-input",
          text: "安全交接 [REDACTED]",
          inputProvenance: {
            version: 1,
            kind: "handback",
            deliveryId: "d1",
            attemptId: "a1",
            target: { roleId: "A", runtime: "pi" },
            reports: [deliverySnapshot],
          },
          inputTextProjection: {
            version: 1,
            source: "trusted-handback-display",
            modelInputRecorded: false,
            redacted: true,
            truncated: true,
            summaryTruncated: true,
          },
        },
      },
    }]);
    await sleep(280);
    const deliveryMetrics = await js(`(() => {
      const card = document.querySelector('#chat .chat-pane[data-role-id="A"] .msg-delivery') || document.querySelector('.msg-delivery');
      if (!card) return { ok: false, reason: 'missing' };
      const facts = card.querySelector(':scope > .persistence-state .delivery-batch-facts');
      const safe = card.querySelector('.safe-input-copy');
      if (!facts || !safe) return { ok: false, reason: 'facts' };
      card.scrollIntoView({ block: 'start' });
      const chat = document.getElementById('chat').getBoundingClientRect();
      const title = [...card.querySelectorAll(':scope > p, :scope > .msg-head, :scope > .mi-head')].find((n) => n.textContent.includes('回交投递'));
      const t = title ? title.getBoundingClientRect() : null;
      const f = facts.getBoundingClientRect();
      const s = safe.getBoundingClientRect();
      return {
        ok: card.textContent.includes('回交投递 · 本批 1 份（不表示全部收齐）')
          && facts.querySelectorAll('dt').length === 3
          && !!t && t.height > 0 && t.top >= chat.top - 1 && t.bottom <= chat.bottom + 1
          && f.height > 0 && f.top >= chat.top - 1 && f.top <= chat.bottom
          && s.height > 0 && s.right <= innerWidth + 1
          && card.scrollWidth <= card.clientWidth + 1
          && document.documentElement.scrollWidth <= innerWidth + 1,
        title: t ? { top: t.top, bottom: t.bottom, text: title.textContent } : null,
        facts: { top: f.top, bottom: f.bottom, dt: facts.querySelectorAll('dt').length },
        safe: { top: s.top, bottom: s.bottom },
        chat: { top: chat.top, bottom: chat.bottom },
      };
    })()`);
    check("200% delivery batch target facts visible without horizontal overflow", deliveryMetrics.ok === true, deliveryMetrics);
    await shot("08-delivery-200pct");
    wc.setZoomFactor(1);
    await sleep(160);

    // ————— 5b. 200% 遮挡门（680 CSS / 480 CSS）：目标 bottom ≤ composer.top —————
    const reportSnapshot = {
      version: 1,
      reportId: "occ-report",
      source: { roleId: "A", runtime: "pi", turnId: "occ-report-turn" },
      taskId: null,
      origin: "submitted-report",
      status: "completed",
      summary: { text: "遮挡门报告摘要。".repeat(40) + "summary-tail", redacted: true, truncated: true },
      evidence: [{ text: "遮挡门证据一", redacted: false, truncated: true }],
      evidenceOmitted: 0,
      at: "2026-10-21T00:00:00Z",
    };
    const deliveryInput = {
      source: "prompt-input",
      text: "安全交接 [REDACTED]",
      inputProvenance: {
        version: 1,
        kind: "handback",
        deliveryId: "d1",
        attemptId: "a1",
        target: { roleId: "A", runtime: "pi" },
        reports: [{ ...reportSnapshot, reportId: "occ-received", summary: { text: "收到的安全摘要", redacted: false, truncated: false } }],
      },
      inputTextProjection: { version: 1, source: "trusted-handback-display", modelInputRecorded: false, redacted: true, truncated: true, summaryTruncated: true },
    };

    const occlusionPass = async (tag, width, height) => {
      win.setContentSize(width, height);
      wc.setZoomFactor(2);
      await sleep(260);

      // 报告卡 / 完整摘要 / 证据：目标 bottom 必须在 composer.top 之上。
      await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
      await sleep(220);
      await js(`await window.__ansRenderer.selectRole('A')`);
      await sleep(160);
      await js(`await window.__ansRenderer.selectRuntime('pi')`);
      await sleep(140);
      await push("session:events", [{
        projectRoot: ROOT,
        roleId: "A",
        runtime: "pi",
        event: { kind: "handback", report: reportSnapshot, reportPersistence: { state: "saved", reportId: "occ-report", retryAvailable: false }, summary: "报告" },
      }]);
      await sleep(280);
      await js(`(() => { const d=document.querySelector('.msg-handback .report-complete'); if (d) d.open = true; })()`);
      await sleep(160);
      const summaryOcc = await occlusion(".hb-complete-summary");
      check(`200% ${tag} report complete summary bottom above composer`, summaryOcc.ok === true, summaryOcc);
      await shot(`10-report-${tag}`);
      const evidenceOcc = await occlusion(".hb-evidence");
      check(`200% ${tag} report evidence bottom above composer`, evidenceOcc.ok === true, evidenceOcc);
      await shot(`11-details-${tag}`);

      // 治理预览：打开时 composer 不粘底，预览 bottom 在 composer.top 之上。
      await js(`await window.__ansRenderer.loadProject('/phase5a-gov')`);
      await sleep(240);
      await js(`document.querySelector('#governance-status [data-governance-reaccept]').click()`);
      await sleep(280);
      const previewOcc = await occlusion("#governance-preview");
      check(`200% ${tag} governance preview bottom above composer`, previewOcc.ok === true, previewOcc);
      await shot(`12-preview-${tag}`);

      // 镜像卡动作。
      await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
      await sleep(220);
      await js(`await window.__ansRenderer.selectRole('liaison')`);
      await sleep(140);
      await js(`await window.__ansRenderer.selectRuntime('pi')`);
      await sleep(140);
      await push("session:operator-request", {
        id: "occ-mirror",
        roleId: "rapporteur",
        projectRoot: ROOT,
        runtime: "pi",
        mirrorRoleId: "liaison",
        request: { kind: "confirm", title: "遮挡门镜像提案", cardKind: "proposal", flowId: "occ-flow", summary: "提案 v1" },
      });
      await sleep(260);
      const mirrorOcc = await occlusion('#chat [data-request-id="occ-mirror"] .op-actions');
      check(`200% ${tag} mirror actions bottom above composer`, mirrorOcc.ok === true, mirrorOcc);
      await shot(`13-mirror-${tag}`);

      // 交付批次事实。
      await js(`await window.__ansRenderer.selectRole('A')`);
      await sleep(150);
      await push("session:events", [{
        projectRoot: ROOT,
        roleId: "A",
        runtime: "pi",
        event: { kind: "message", turnId: "delivery-turn", summary: "交接", detail: deliveryInput },
      }]);
      await sleep(280);
      const deliveryOcc = await occlusion("#chat .chat-pane[data-role-id='A'] .msg-delivery .delivery-batch-facts");
      check(`200% ${tag} delivery facts bottom above composer`, deliveryOcc.ok === true, deliveryOcc);
      await shot(`14-delivery-${tag}`);

      // S0 CTA：回到聊天顶部，空态整体应在 composer 上方。
      await js(`await window.__ansRenderer.loadProject('/phase5a-s0')`);
      await sleep(260);
      await js(`document.getElementById('chat').scrollTop = 8`);
      await sleep(80);
      const s0Occ = await occlusion("#chat .chat-empty #btn-start-primary", false);
      check(`200% ${tag} S0 CTA bottom above composer`, s0Occ.ok === true, s0Occ);
      await shot(`15-s0-${tag}`);
    };

    await occlusionPass("680css", 1360, 860);
    await occlusionPass("480css", 960, 620);
    wc.setZoomFactor(1);
    win.setContentSize(1360, 860);
    await sleep(180);

    // ————— 6. 零 console.error / CSP —————
    const badConsole = report.console.filter((item) => String(item.level) === "error" || item.level === 3);
    const csp = await js(`window.__smokeCsp || []`);
    report.csp = csp;
    check("no console errors", badConsole.length === 0, badConsole);
    check("no CSP violations", csp.length === 0, csp);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("PHASE5A_SMOKE_ERROR", report.error);
  } finally {
    report.finished = true;
    report.at = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log("PHASE5A_SMOKE_DONE failures=" + report.failures + " checks=" + report.checks.length + " out=" + OUT);
    app.exit(report.failures === 0 ? 0 : 1);
  }
});
