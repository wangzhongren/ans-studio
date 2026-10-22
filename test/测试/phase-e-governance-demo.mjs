// test/测试/phase-e-governance-demo.mjs
// 阶段 E「真实启动/演示」证据脚本（2026-10-22 治理分工第 1/3/5 项，客户确认方案）。
//
// 真实启动 Electron：真实 `app/desktop/interface.ts`（桌面 Interface）、真实 `app/preload.cjs`、
// 真实渲染进程（`app/renderer/dist/index.html`）+ 真实窗口。只有**模型适配器**是脚本桩（离线、
// 无凭据、绝不触网）——与既有 `test/桌面应用/e2e/main.mjs` 的总自检同一注入纪律。
//
// 演示的治理链路（第 1/3 项关键变化）：
//   团队计划/流程 YAML 已由 Convener 写出 → Convener 发 appointment 卡（客户任命 executor）
//   → 应用派 Crew 写卡（appointment-write 卡 → role-card/boundary/工作文档）
//   → 结构校验通过 → Convener role-readiness（写 readiness + 变更包 + 派发 impl）
//   → Verifier 写实施前标准/验收报告并发 acceptance 卡 → 客户验收（accepted）。
//
// 运行：node_modules/electron/dist/electron.exe test/测试/phase-e-governance-demo.mjs
//   env ANS_DEMO_OUTDIR=（截图与 report.txt 输出目录；缺省系统临时目录）
//
// 输出：report.txt（DEMO_PASS / 截图清单 / 账本决定 / 落盘产物）+ 逐关键画面 PNG。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, ipcMain, Menu } from "electron";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const APP_DIR = path.join(REPO_ROOT, "app");
const OUTDIR = process.env.ANS_DEMO_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-governance-demo-"));
fs.mkdirSync(OUTDIR, { recursive: true });

const FLOW = "flow-demo";
const PROJECT = path.join(OUTDIR, "project");
const TEAM_PLAN_REL = `docs/scheduling/${FLOW}-team-v1.md`;
const FLOW_REL = `docs/flows/${FLOW}.yaml`;
const CRITERIA_REL = `docs/acceptance/${FLOW}-criteria-v1.md`;
const REPORT_REL = `docs/acceptance/${FLOW}-report-v1.md`;
const CHANGE_REL = `docs/scheduling/${FLOW}-change-v1.md`;
const READINESS_REL = `docs/scheduling/${FLOW}-readiness-v1.md`;
const ROLE_ID = "executor";

const report = [];
const log = (line) => report.push(String(line));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function write(rel, content) {
  const abs = path.join(PROJECT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}
const exists = (rel) => fs.existsSync(path.join(PROJECT, rel));

function seedProject() {
  const govYaml =
    "role: 治理边界\nentries:\n  - kind: directory\n    path: 角色卡/\n    root: project\n    purpose: 角色目录\n  - kind: directory\n    path: docs/\n    root: project\n    purpose: 项目文档\n  - kind: directory\n    path: .ans/\n    root: project\n    purpose: 配置与 pin\n";
  write("角色卡/governance-boundary.yaml", govYaml);
  // 前置：提案已被客户接受（派发门禁要求；演示从团队计划/任命开始，提案接受是已完成的既有阶段）。
  write(
    ".ans/governance/ledger.jsonl",
    JSON.stringify({
      at: new Date().toISOString(),
      kind: "customer.decision",
      flowId: FLOW,
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
      messageSummary: "演示前置：客户接受提案",
    }) + "\n",
  );
  write(
    ".ans/project.json",
    JSON.stringify(
      {
        projectRoot: PROJECT.split(path.sep).join("/"),
        skillRoot: PROJECT.split(path.sep).join("/"),
        governanceModel: "trio",
        roles: {},
        governanceBoundary: {
          path: "角色卡/governance-boundary.yaml",
          acceptance: {
            accepted: true,
            source: "demo:phase-e",
            pin: [{ path: "角色卡/governance-boundary.yaml", sha256: createHash("sha256").update(govYaml).digest("hex") }],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  write(
    TEAM_PLAN_REL,
    [
      "---",
      `flowId: ${FLOW}`,
      "version: 1",
      "riskTier: T1",
      `recommended: [${ROLE_ID}]`,
      "---",
      "",
      `# 团队计划 ${FLOW} v1`,
      "",
      "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      `| ${ROLE_ID} | new | 实现演示功能 | 能写代码 | src/owned-${ROLE_ID}/ | 无 | 开发 | not-applicable |`,
      "",
    ].join("\n"),
  );
  write(
    FLOW_REL,
    [
      `flowId: ${FLOW}`,
      "version: 1",
      "qualityTier: production",
      "steps:",
      ...[
        ["team-plan", "artifact", "done"],
        ["appointment", "customer-decision", "done"],
        ["role-cards", "dispatch", "pending"],
        ["role-readiness", "dispatch", "pending"],
        ["acceptance-criteria", "artifact", "pending"],
        ["change-package", "artifact", "pending"],
        ["impl", "dispatch", "pending"],
        ["verification", "acceptance", "pending"],
      ].flatMap(([id, kind, status]) => [
        `  - id: ${id}`,
        `    title: ${id}`,
        `    owner: ${kind === "acceptance" ? "verifier" : "executor"}`,
        `    kind: ${kind}`,
        `    status: ${status}`,
        ...(status === "done"
          ? [
              "    evidence:",
              `      kind: ${kind}`,
              `      ref: ${id === "team-plan" ? TEAM_PLAN_REL : id}`,
            ]
          : []),
      ]),
      "",
    ].join("\n"),
  );
}

function roleCardDoc() {
  return [
    `# 角色：${ROLE_ID}`,
    "",
    "## 组别",
    "开发。",
    "",
    "## 工作立场",
    "对本角色交付长期负责。",
    "",
    "## 能力描述",
    "按团队计划实现并验证功能。",
    "",
    "## 系统功能导航",
    "见 feature-map.md。",
    "",
    "## 必读资料",
    "团队计划与提案。",
    "",
    "## 交接输入输出",
    "输入：团队计划；输出：实现与测试证据。",
    "",
    "## 执行原则",
    "只写计划内写集。",
    "",
    "## 质量职责",
    "交付可复现验证。",
    "",
    "## 标准工作流",
    "读计划 → 实现 → 测试 → 报告。",
    "",
    "## 交付物清单",
    "代码、测试与报告。",
    "",
  ].join("\n");
}

function roleBoundaryDoc() {
  return [
    `role: ${ROLE_ID}`,
    "entries:",
    ...["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"].flatMap((file) => [
      "  - kind: file",
      `    path: 角色卡/${ROLE_ID}/${file}`,
      "    purpose: 角色根工作文档",
    ]),
    "  - kind: directory",
    `    path: src/owned-${ROLE_ID}/`,
    "    purpose: 角色代码",
    "",
  ].join("\n");
}

function workDocs() {
  return {
    "feature-map.md": "# 功能导航\n\n| 功能 | 入口 |\n| --- | --- |\n| 实现 | src/owned-executor/ |\n",
    "functional-description.md": "# 功能说明\n\n职责：实现与测试。交接：向 Lead 报告。代码位置：src/owned-executor/。\n",
    "memo.md": "# 备忘\n\n- 2026-10-22 由 Crew 按团队计划写卡。\n",
    "api-spec.md": "# API\n\nnot-applicable：本角色无导出/共享接口。\n",
  };
}

function criteriaDoc() {
  return [
    "---",
    `flowId: ${FLOW}`,
    "version: 1",
    "---",
    "",
    `# 验收完成标准 ${FLOW}`,
    "",
    "| ID | 标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    "| P1 | 演示链落盘 | 账本/文件 | 待提交 | 候选哈希 | 测试 | 待判定 | 待判定 |",
    "",
    "风险档位：T1。",
    "",
    "判定规则：pass / fail / insufficient evidence。",
    "",
    "证据计划：截图与账本。",
    "",
    "版本与冻结：写盘后冻结。",
    "",
  ].join("\n");
}

function reportDoc() {
  return [
    "风险档位：T1｜判定依据：演示链变更｜选定检查：真实启动+账本｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "## 结论",
    "通过（演示）。",
    "",
  ].join("\n");
}

function changeDoc() {
  return ["---", `flowId: ${FLOW}`, "version: 1", "riskTier: T1", "candidate: demo-candidate", "---", "", `# 变更包 ${FLOW}`, "", "风险档位 T1。", ""].join("\n");
}

let createDesktopInterface;
let createCustomerInputChannel;
let buildGovernedTools;
let win;
let iface;
let channel;
let nextPickPath = null;
const presentations = [];

/** 脚本化模型适配器：按角色与提示文本返回工具调用（不触网、不写仓库，只写 OUTDIR 的临时项目）。 */
function scriptedAdapterFactory(gate, caps) {
  let roleId = "";
  let turn = 0;
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(role) {
      roleId = role.id;
      const tools = new Map(
        buildGovernedTools(gate, {
          readRoot: PROJECT,
          writeRoot: PROJECT,
          currentTurnId: () => `demo-${roleId}-${turn}`,
          roleId,
          runtime: "pi",
          ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
          ...(caps?.dispatchTask !== undefined ? { dispatchTask: caps.dispatchTask } : {}),
        }).map((tool) => [tool.name, tool]),
      );
      const queue = [];
      let release;
      return {
        async prompt(text) {
          turn += 1;
          queue.push({ kind: "message", summary: `用户指令：${text}` });
          const call = async (name, args) => {
            queue.push({ kind: "tool_call", summary: `模型请求调用 ${name}`, detail: { name, args } });
            const tool = tools.get(name);
            const result = tool === undefined ? { ok: false, message: `工具未注册：${name}` } : await tool.handler({ name, args });
            queue.push({ kind: result.ok ? "accepted" : "denied", summary: result.message });
            return result;
          };
          if (roleId === "convener" && /请依团队计划请客户任命/.test(text)) {
            await call("request_choice", {
              title: `任命 ${FLOW}`,
              question: "选择要任命的角色",
              flowId: FLOW,
              cardKind: "appointment",
              multiple: true,
              options: [{ id: ROLE_ID, label: "Executor" }],
            });
          } else if (roleId === "convener" && /角色就绪复核/.test(text)) {
            if (exists(CRITERIA_REL)) {
              await call("write_file", { path: READINESS_REL, content: `---\nflowId: ${FLOW}\nversion: 1\nstatus: pass\n---\n\n# 角色就绪复核\n\n| roleId | 结论 | 证据 |\n| --- | --- | --- |\n| ${ROLE_ID} | pass | 角色卡/${ROLE_ID}/role-card.md |\n` });
              await call("write_file", { path: CHANGE_REL, content: changeDoc() });
              await call("dispatch_task", { roleId: ROLE_ID, task: "执行 impl 步骤", flowId: FLOW, stepId: "impl" });
            }
          } else if (roleId === "nominator") {
            const files = [
              [`角色卡/${ROLE_ID}/role-card.md`, roleCardDoc()],
              [`角色卡/${ROLE_ID}/boundary.yaml`, roleBoundaryDoc()],
              ...Object.entries(workDocs()).map(([file, content]) => [`角色卡/${ROLE_ID}/${file}`, content]),
            ];
            await call("request_confirmation", {
              title: `写盘确认 ${FLOW}`,
              paths: files.map(([rel]) => rel),
              preview: ["将写入以下文件（逐路径正文）：", "", ...files.map(([rel, content]) => `## ${rel}\n\n${content}`)].join("\n"),
              flowId: FLOW,
              cardKind: "appointment-write",
            });
            for (const [rel, content] of files) await call("write_file", { path: rel, content });
          } else if (roleId === "verifier" && /实施前完成标准/.test(text)) {
            await call("write_file", { path: CRITERIA_REL, content: criteriaDoc() });
          } else if (roleId === "verifier" && /验收报告/.test(text)) {
            await call("write_file", { path: REPORT_REL, content: reportDoc() });
            await call("request_choice", {
              title: `验收 ${FLOW}`,
              question: "是否验收通过？",
              flowId: FLOW,
              cardKind: "acceptance",
              options: [
                { id: "accept", label: "通过" },
                { id: "reject", label: "不通过" },
              ],
            });
          } else if (roleId === "executor") {
            // 演示只需展示派发已送达；回交/报告不在本演示范围（不调用未注册工具）。
          }
          queue.push({ kind: "settled", summary: "会话结束" });
          release?.();
        },
        events() {
          return (async function* () {
            let index = 0;
            for (;;) {
              if (index < queue.length) {
                yield queue[index++];
                continue;
              }
              if (queue.closed) return;
              await sleep(10);
            }
          })();
        },
        async dispose() {
          queue.closed = true;
          release?.();
        },
      };
    },
  };
}

async function shot(name) {
  try {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUTDIR, `${name}.png`), image.toPNG());
    log(`SHOT=${name}.png`);
  } catch (error) {
    log(`SHOT_FAILED=${name}:${error && error.message ? error.message : String(error)}`);
  }
}

function registerIpc() {
  ipcMain.handle("app:renderer-diagnostic", () => ({ ok: true }));
  ipcMain.handle("app:recovery-state", () => ({ projectRoot: null, roleId: null }));
  ipcMain.handle("app:recovery-ready", () => {
    channel?.replayPending?.();
    return { ok: true };
  });
  ipcMain.handle("app:reload-interface", async () => {
    await win.loadFile(rendererEntry);
    return { ok: true };
  });
  ipcMain.handle("app:pick-project", () => iface.pickProject());
  ipcMain.handle("app:list-project", (_event, input) => iface.listProject(input));
  ipcMain.handle("session:open", (_event, input) => iface.openSession(input));
  ipcMain.handle("session:send", (_event, input) => iface.sendSession(input));
  ipcMain.handle("session:stop", (_event, input) => iface.stopSession(input));
  ipcMain.handle("session:withdraw", (_event, input) => iface.withdrawQueued(input));
  ipcMain.handle("session:abort", (_event, input) => iface.abortSession(input));
  ipcMain.handle("session:live", () => iface.listLiveSessions());
  ipcMain.handle("session:live-views", () => iface.listLiveSessionViews());
  ipcMain.handle("session:history-get", () => ({ rows: [], error: null }));
  ipcMain.handle("session:get-persistence", () => ({ ok: true }));
  ipcMain.handle("report:retry-save", () => ({ ok: true }));
  ipcMain.handle("report:get-save-state", () => ({ state: "idle" }));
  ipcMain.handle("delivery:retry-history-save", () => ({ ok: true }));
  ipcMain.handle("delivery:get-receipt", () => ({ ok: true }));
  ipcMain.handle("runtime-config:get", (_event, input) => iface.getRuntimeConfig(input && input.runtime));
  ipcMain.handle("runtime-config:save", (_event, input) => iface.saveRuntimeConfig(input));
  ipcMain.handle("shell:judge-get", () => iface.getShellJudgeState());
  ipcMain.handle("shell:judge-set", (_event, input) => iface.setShellJudgeEnabled(input));
  ipcMain.handle("decision:judge-get", () => iface.getDecisionJudgeState());
  ipcMain.handle("decision:judge-set", (_event, input) => iface.setDecisionJudgeEnabled(input));
  ipcMain.handle("app:open-external", () => ({ ok: false, error: "demo：不外开" }));
  ipcMain.handle("app:attach-image", (_event, input) => iface.attachImage(input));
  ipcMain.handle("app:pick-image", () => ({ ok: false, error: "demo：不选图" }));
  ipcMain.handle("pi-config:get", () => iface.getPiConfig());
  ipcMain.handle("pi-config:save", (_event, input) => iface.savePiConfig(input));
  ipcMain.handle("session:operator-response", (_event, input) => channel.respond(input && typeof input === "object" ? input : {}));
  ipcMain.handle("shell:confirm-response", () => ({ ok: false, expired: true }));
  ipcMain.handle("window:minimize", () => win?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle("window:close", () => win?.close());
  ipcMain.handle("window:is-maximized", () => (win ? win.isMaximized() : false));
  win.on("maximize", () => win.webContents.send("window:maximized-changed", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized-changed", false));
}

let rendererEntry;
let rendererEntryModule;

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error(`等待超时：${label}`);
    await sleep(50);
  }
}

async function waitForPresentation(match) {
  await waitFor(() => presentations.some(match), 15000, `交互卡 ${match}`);
  return presentations.find(match);
}

/** 经真实 preload → IPC → DesktopInterface 发一轮消息（与界面发送同路径）。 */
async function sendViaUi(roleId, text) {
  const projectRoot = PROJECT.split(path.sep).join("/");
  const runtime = await win.webContents.executeJavaScript("window.__ansRenderer.state.runtime");
  const result = await win.webContents.executeJavaScript(
    `window.desktop.sendSession(${JSON.stringify(text)}, [], { projectRoot: ${JSON.stringify(projectRoot)}, roleId: ${JSON.stringify(roleId)}, runtime: ${JSON.stringify(runtime)} })`,
  );
  if (!result || result.ok !== true) {
    throw new Error(`发送失败（${roleId}@${runtime}）：${JSON.stringify(result)}`);
  }
  log(`DEMO_SEND role=${roleId} runtime=${runtime}`);
  return result;
}

/** 发送但不等待本轮结束（卡片需要客户作答后才能 settle；等待发送完成会造成死锁）。 */
function fireViaUi(roleId, text) {
  void sendViaUi(roleId, text).catch((error) => log("DEMO_SEND_ERROR " + (error && error.message ? error.message : String(error))));
}

async function run() {
  Menu.setApplicationMenu(null);
  createDesktopInterface = (await import(pathToFileURL(path.join(APP_DIR, "desktop", "interface.ts")).href)).createDesktopInterface;
  createCustomerInputChannel = (await import(pathToFileURL(path.join(APP_DIR, "desktop", "customer-input.ts")).href)).createCustomerInputChannel;
  buildGovernedTools = (await import(pathToFileURL(path.join(REPO_ROOT, "src", "provider", "runtime", "tools.ts")).href)).buildGovernedTools;
  rendererEntryModule = await import(pathToFileURL(path.join(APP_DIR, "desktop", "renderer-entry.ts")).href);
  rendererEntry = rendererEntryModule.resolveRendererEntry(APP_DIR);

  seedProject();

  channel = createCustomerInputChannel({
    operatorId: "demo-operator",
    presenter: (payload) => {
      presentations.push(payload);
      if (win && !win.isDestroyed()) win.webContents.send("session:operator-request", payload);
    },
    onNextStep: (payload, context) => {
      void iface.advanceGovernanceFlow({ payload, context });
    },
  });

  iface = createDesktopInterface({
    pickDirectory: async () => nextPickPath,
    emitEvent: (envelope) => {
      const event = envelope && envelope.event ? envelope.event : {};
      if (event.kind === "accepted" || event.kind === "denied" || event.kind === "settled") {
        log(`EVENT ${envelope.roleId} ${event.kind} ${String(event.summary ?? "").slice(0, 160)}`);
      }
      if (win && !win.isDestroyed()) win.webContents.send("session:event", envelope);
    },
    emitRoleState: (info) => {
      if (win && !win.isDestroyed()) win.webContents.send("session:role-state", info);
    },
    emitProjectChanged: () => {
      if (win && !win.isDestroyed()) win.webContents.send("project:changed");
    },
    createPiAdapterFactoryFn: () => scriptedAdapterFactory,
    createDemoAdapterFn: () => scriptedAdapterFactory,
    // 界面默认运行时可能不是 pi；统一注入脚本适配器，保证离线（不触网、不需凭据）。
    createRuntimeAdapterFactoryFn: () => scriptedAdapterFactory,
    customerInput: (req, ctx, metadata) => channel.customerInput(req, ctx, metadata),
    envFilePath: path.join(OUTDIR, "demo.env"),
    piConfigEnv: {},
    runtimeOptions: { modelId: "demo-model" },
  });

  win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    frame: false,
    webPreferences: {
      preload: path.join(APP_DIR, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  registerIpc();
  win.webContents.on("console-message", (_event, level, message) => {
    if (level === "error" || level === 3) log("[renderer-console] " + String(message));
  });
  await win.loadFile(rendererEntry);
  await sleep(800);
  await shot("demo-00-launch");

  // 导入临时 demo 项目（渲染器驱动 loadProject → 真实 preload/IPC/listProject）。
  const projectRootNorm = PROJECT.split(path.sep).join("/");
  await win.webContents.executeJavaScript(`window.__ansRenderer.loadProject(${JSON.stringify(projectRootNorm)})`);
  await waitFor(
    () => win.webContents.executeJavaScript("window.__ansRenderer.state.projectRoot === " + JSON.stringify(projectRootNorm)),
    15000,
    "导入项目",
  );
  await sleep(400);
  await shot("demo-01-project-imported");

  // 打开 Convener（真实 selectRole → openSession）。
  const openedConvener = await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('convener')");
  if (openedConvener !== true) throw new Error("打开 Convener 失败");
  await waitFor(
    () => win.webContents.executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId === 'convener'"),
    15000,
    "打开 Convener 会话",
  );
  await sleep(300);

  // ① 团队计划→appointment 卡（Convener 发起）。
  fireViaUi("convener", "请依团队计划请客户任命 executor。");
  const appointment = await waitForPresentation((p) => p.request && p.request.cardKind === "appointment");
  await sleep(500);
  await shot("demo-02-appointment-card");
  log("DEMO_APPOINTMENT_CARD_VISIBLE=true");
  channel.respond({ id: appointment.id, decision: { kind: "choice", selected: [ROLE_ID] } });

  // ② 应用派 Crew 写卡 → appointment-write 卡（客户确认）→ 写卡产物。
  const writeCard = await waitForPresentation((p) => p.request && p.request.cardKind === "appointment-write");
  // 卡属于 Crew 的聊天流：切到 Crew 再截图（应用派发不抢活动角色，需显式切换）。
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('nominator')");
  await sleep(600);
  await shot("demo-03-crew-write-card");
  log("DEMO_CREW_WRITE_CARD_VISIBLE=true");
  channel.respond({ id: writeCard.id, decision: { kind: "confirm", confirmed: true } });
  await waitFor(() => exists(`角色卡/${ROLE_ID}/role-card.md`) && exists(`角色卡/${ROLE_ID}/api-spec.md`), 15000, "Crew 写卡落盘");

  // ③ 结构校验通过 → Convener readiness；先由 Verifier 写实施前标准（O2），再驱动 readiness。
  const uiRuntime = await win.webContents.executeJavaScript("window.__ansRenderer.state.runtime");
  const verifierOpen = await iface.openSession({ projectRoot: projectRootNorm, roleId: "verifier", runtime: uiRuntime });
  if (verifierOpen.ok !== true) throw new Error(`打开 Verifier 失败：${verifierOpen.error ?? ""}`);
  await sendViaUi("verifier", "请写实施前完成标准。");
  await waitFor(() => exists(CRITERIA_REL), 10000, "实施前标准落盘");
  const convenerOpen = await iface.openSession({ projectRoot: projectRootNorm, roleId: "convener", runtime: uiRuntime });
  if (convenerOpen.ok !== true) throw new Error(`重新打开 Convener 失败：${convenerOpen.error ?? ""}`);
  fireViaUi("convener", "请继续角色就绪复核（role-readiness）。");
  await waitFor(() => exists(READINESS_REL) && exists(CHANGE_REL), 15000, "readiness/变更包落盘");
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('convener')");
  await sleep(600);
  await shot("demo-04-convener-readiness");
  log("DEMO_READINESS_RECORD=" + exists(READINESS_REL));
  log("DEMO_CHANGE_PACKAGE=" + exists(CHANGE_REL));

  // ④ Verifier 写报告并发 acceptance 卡 → 客户验收（LRU 可能回收空闲 Verifier 会话，先重开）。
  const verifierReopen = await iface.openSession({ projectRoot: projectRootNorm, roleId: "verifier", runtime: uiRuntime });
  if (verifierReopen.ok !== true) throw new Error(`重新打开 Verifier 失败：${verifierReopen.error ?? ""}`);
  fireViaUi("verifier", "请汇总证据并出验收报告与验收卡。");
  const acceptance = await waitForPresentation((p) => p.request && p.request.cardKind === "acceptance");
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('verifier')");
  await sleep(600);
  await shot("demo-05-acceptance-card");
  log("DEMO_ACCEPTANCE_CARD_VISIBLE=true");
  channel.respond({ id: acceptance.id, decision: { kind: "choice", selected: ["accept"] } });
  await waitFor(() => exists(REPORT_REL), 10000, "验收报告落盘");
  await sleep(800);
  await shot("demo-06-accepted");

  // —— 汇总证据 ——
  const ledgerText = fs.existsSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl"))
    ? fs.readFileSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl"), "utf8")
    : "";
  const decisions = ledgerText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && entry.kind === "customer.decision")
    .map((entry) => `${entry.decisionKind}:${entry.customerDecision}:${(entry.targetRoleIds ?? []).join("+")}`);
  log("DEMO_DECISIONS=" + decisions.join(","));
  const implDispatch = ledgerText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .some((entry) => entry && entry.kind === "dispatch.accepted" && entry.actorRoleId === "convener" && entry.stepId === "impl");
  log("DEMO_IMPL_DISPATCH=" + implDispatch);
  for (const rel of [TEAM_PLAN_REL, FLOW_REL, CRITERIA_REL, REPORT_REL, CHANGE_REL, READINESS_REL, `角色卡/${ROLE_ID}/role-card.md`, `角色卡/${ROLE_ID}/boundary.yaml`]) {
    log(`DEMO_FILE_${rel}=${exists(rel)}`);
  }
  const pass =
    decisions.some((entry) => entry.startsWith("appointment:appointed:" + ROLE_ID)) &&
    decisions.some((entry) => entry.startsWith("appointment-write:accepted")) &&
    decisions.some((entry) => entry.startsWith("acceptance:accepted")) &&
    implDispatch &&
    exists(`角色卡/${ROLE_ID}/role-card.md`) &&
    exists(REPORT_REL) &&
    fs.readdirSync(OUTDIR).filter((name) => name.endsWith(".png")).length >= 5;
  log("DEMO_PASS=" + pass);
  log("DEMO_DONE=1");
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (error) {
    log("DEMO_ERROR=" + (error && error.stack ? error.stack : String(error)));
    log("DEMO_PASS=false");
  } finally {
    try {
      fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\n");
    } catch {
      /* ignore */
    }
    await sleep(300);
    app.exit(0);
  }
});
