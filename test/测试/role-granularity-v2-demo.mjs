// test/测试/role-granularity-v2-demo.mjs
// 2026-10-22 角色粒度/MapReduce（Reduce 终验）**真实启动/演示**脚本。
//
// 真实启动 Electron：真实 `app/desktop/interface.ts`（桌面 Interface）、真实 `app/preload.cjs`、
// 真实渲染进程（`app/renderer/dist/index.html`）+ 真实窗口；真实客户通道/账本/门禁/flow 解析。
// 只有**模型适配器**是脚本桩（离线、无凭据、绝不触网）——与 `test/桌面应用/e2e/main.mjs` 同一注入纪律。
//
// 演示的 v2 链路：
//   团队计划 v2（模块清单/14 列/MapReduce）→ appointment 卡（客户任命 executor/reviewer/tester）
//   → 应用派 Crew 写两个 Map 角色卡（appointment-write 卡 → 客户确认）
//   → 结构校验 + V12 通过 → Convener readiness（写 module/测试面/并行/粒度）
//   → contract-freeze 已完成 → Map 组并行派发 → 测试分片 → Reduce 集成派发
//   → 测试角色写 Reduce manifest → 变更包 → Verifier 报告 + acceptance 卡 → 客户验收。
//
// 运行：node_modules/electron/dist/electron.exe test/测试/role-granularity-v2-demo.mjs
//   env ANS_DEMO_OUTDIR=（截图与 report.txt 输出目录；缺省系统临时目录）
//
// 输出：report.txt（DEMO_PASS / 截图清单 / 账本派发 / 产物）+ 逐关键画面 PNG。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, ipcMain, Menu } from "electron";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const APP_DIR = path.join(REPO_ROOT, "app");
const OUTDIR = process.env.ANS_DEMO_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-role-granularity-v2-demo-"));
fs.mkdirSync(OUTDIR, { recursive: true });

const FLOW = "flow-demo";
const PROJECT = path.join(OUTDIR, "project");
const TEAM_PLAN_REL = `docs/scheduling/${FLOW}-team-v1.md`;
const FLOW_REL = `docs/flows/${FLOW}.yaml`;
const CRITERIA_REL = `docs/acceptance/${FLOW}-criteria-v1.md`;
const REPORT_REL = `docs/acceptance/${FLOW}-report-v1.md`;
const CHANGE_REL = `docs/scheduling/${FLOW}-change-v1.md`;
const READINESS_REL = `docs/scheduling/${FLOW}-readiness-v1.md`;
const MANIFEST_REL = `docs/verification/${FLOW}/manifest.md`;
const CONTRACT_A = "docs/contracts/storefront-v1.md";
const CONTRACT_B = "docs/contracts/checkout-api-v1.md";
const MAP_ROLES = ["executor", "reviewer"];
const TESTER = "tester";

const report = [];
const log = (line) => report.push(String(line));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function write(rel, content) {
  const abs = path.join(PROJECT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}
const exists = (rel) => fs.existsSync(path.join(PROJECT, rel));

function roleCardDoc(roleId) {
  return [
    `# 角色：${roleId}`,
    "",
    "## 组别",
    "交付。",
    "",
    "## 工作立场",
    "对本角色交付长期负责。",
    "",
    "## 能力描述",
    "按团队计划实现并验证本模块功能。",
    "",
    "## 系统功能导航",
    "见 feature-map.md。",
    "",
    "## 必读资料",
    "团队计划、契约与提案。",
    "",
    "## 交接输入输出",
    "输入：团队计划与本模块契约；输出：实现与测试证据。",
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
    "代码、测试与证据。",
    "",
  ].join("\n");
}

function roleBoundaryDoc(roleId) {
  return [
    `role: ${roleId}`,
    "entries:",
    ...["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"].flatMap((file) => [
      "  - kind: file",
      `    path: 角色卡/${roleId}/${file}`,
      "    purpose: 角色根工作文档",
    ]),
    "  - kind: directory",
    `    path: src/owned-${roleId}/`,
    "    purpose: 模块代码",
    "  - kind: directory",
    `    path: test/owned-${roleId}/`,
    "    purpose: 模块测试",
    "",
  ].join("\n");
}

function roleWorkDocs(roleId) {
  return {
    "feature-map.md": `# 功能导航\n\n| 功能 | 入口 |\n| --- | --- |\n| 模块交付 | src/owned-${roleId}/ |\n`,
    "functional-description.md": `# 功能说明\n\n职责：实现与测试。代码位置：src/owned-${roleId}/。\n`,
    "memo.md": `# 备忘\n\n- 2026-10-22 由 Crew 按团队计划 v2 写卡（${roleId}）。\n`,
    "api-spec.md": "# API\n\nnot-applicable：本角色无导出/共享接口。\n",
  };
}

function seedRoleArtifacts(roleId, writes) {
  write(`角色卡/${roleId}/role-card.md`, roleCardDoc(roleId));
  write(`角色卡/${roleId}/boundary.yaml`, roleBoundaryDoc(roleId));
  for (const [file, content] of Object.entries(roleWorkDocs(roleId))) write(`角色卡/${roleId}/${file}`, content);
  return writes;
}

function teamPlanV2() {
  return [
    "---",
    `flowId: ${FLOW}`,
    "version: 1",
    "teamPlanSchema: 2",
    "riskTier: T3",
    "recommended: [executor, reviewer, tester]",
    "modules: [storefront, checkout-api]",
    "---",
    "",
    `# 团队计划 ${FLOW}（v2）`,
    "",
    "## 模块清单",
    "",
    "| module | 职责 | 公开契约 | 架构来源 |",
    "| --- | --- | --- | --- |",
    `| storefront | 结算页面与交互 | \`${CONTRACT_A}\`（消费） | \`docs/planning/${FLOW}-v1.md\` §4.1 |`,
    `| checkout-api | 结算 API 与订单状态 | \`${CONTRACT_B}\` | \`docs/planning/${FLOW}-v1.md\` §4.2 |`,
    "",
    "## 参与角色与职责",
    "",
    "| roleId | 类型 | module | 职责目标 | 能力要求 | 唯一写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| executor | new | storefront | 结算页面与交互 | UI/契约/测试 | \`src/owned-executor/\`; \`test/owned-executor/\` | \`${CONTRACT_A}\`（消费） | \`test/owned-executor/\` | 无 | 无 | map-a | 交付 | required | — |`,
    `| reviewer | new | checkout-api | 结算 API 与订单状态 | API/契约/测试 | \`src/owned-reviewer/\`; \`test/owned-reviewer/\` | \`${CONTRACT_B}\` | \`test/owned-reviewer/\` | 无 | 无 | map-a | 交付 | required | — |`,
    `| ${TESTER} | existing | reduce | 契约/集成/e2e/证据合并 | 测试/环境/证据 | \`test/测试/\`; \`docs/verification/\` | \`${CONTRACT_A}\`; \`${CONTRACT_B}\`（消费） | \`test/测试/\`（集成/e2e） | 依赖全部 Map | executor, reviewer | reduce | 测试 | not-applicable（Reduce 角色不导出接口） | — |`,
    "",
    "## 五维判断与协调成本",
    "",
    "- 责任独立性：storefront 与 checkout-api 各有独立变化原因与契约。",
    "- 范围归属：两个 Map 角色写集不相交；Reduce 只写测试与证据根。",
    "- 契约影响：checkout-api 唯一主属 API 契约；storefront 只消费。",
    "- 证据独立性：每个 Map 角色有独立测试面；Reduce 独立合并 manifest。",
    "- 协调成本：map-a 两个模块可并行，未拆到函数级。",
    "",
  ].join("\n");
}

function flowDoc(options = {}) {
  const status = (done) => (done === true ? "done" : "pending");
  const mapDone = options.mapDone === true;
  const shardsDone = options.shardsDone === true;
  const e2eDone = options.e2eDone === true;
  const evidenceDone = options.evidenceDone === true;
  return [
    `flowId: ${FLOW}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    ...[
      ["team-plan", "artifact", "done", "convener", `docs/scheduling/${FLOW}-team-v1.md`],
      ["appointment", "customer-decision", "done", "convener", "appointment"],
      ["role-cards", "dispatch", "done", "convener", "role-cards"],
      ["role-readiness", "dispatch", "done", "convener", "role-readiness"],
      ["acceptance-criteria", "artifact", "done", "verifier", CRITERIA_REL],
      ["contract-freeze", "artifact", "done", "rapporteur", CONTRACT_A],
      ["delivery-storefront", "dispatch", status(mapDone), "executor", "delivery-storefront"],
      ["delivery-checkout-api", "dispatch", status(mapDone), "reviewer", "delivery-checkout-api"],
      ["test-map-shards", "dispatch", status(shardsDone), TESTER, "test-map-shards"],
      ["integration-e2e", "dispatch", status(e2eDone), TESTER, "integration-e2e"],
      ["verification-evidence", "artifact", status(evidenceDone), TESTER, MANIFEST_REL],
      ["change-package", "artifact", "done", "convener", CHANGE_REL],
      ["verification", "acceptance", "pending", "verifier", undefined],
    ].flatMap(([id, kind, stepStatus, owner, ref]) => {
      const group =
        id === "delivery-storefront" || id === "delivery-checkout-api"
          ? "map-a"
          : id === "test-map-shards" || id === "integration-e2e" || id === "verification-evidence"
            ? "reduce"
            : undefined;
      const dependsOn =
        id === "delivery-storefront" || id === "delivery-checkout-api"
          ? ["contract-freeze"]
          : id === "test-map-shards"
            ? ["delivery-storefront", "delivery-checkout-api"]
            : id === "integration-e2e"
              ? ["test-map-shards"]
              : id === "verification-evidence"
                ? ["integration-e2e"]
                : undefined;
      return [
        `  - id: ${id}`,
        `    title: ${id}`,
        `    owner: ${owner}`,
        `    kind: ${kind}`,
        `    status: ${stepStatus}`,
        ...(group !== undefined ? [`    parallelGroup: ${group}`] : []),
        ...(dependsOn !== undefined ? [`    dependsOn: [${dependsOn.join(", ")}]`] : []),
        ...(stepStatus === "done" && ref !== undefined
          ? ["    evidence:", `      kind: ${kind}`, `      ref: ${ref}`]
          : []),
      ];
    }),
    "",
  ].join("\n");
}

function readinessDoc() {
  return [
    "---",
    `flowId: ${FLOW}`,
    "version: 1",
    "status: pass",
    "---",
    "",
    `# 角色就绪复核 ${FLOW}（v2）`,
    "",
    "| roleId | module | 职责目标 | 能力要求 | 写集/边界 | 公开契约 | 测试面 | 依赖/交接 | 并行/粒度 | 结论 | 证据 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| executor | storefront | pass | pass | pass | pass | pass | pass | map-a / 单模块 | pass | 角色卡/executor/role-card.md |`,
    `| reviewer | checkout-api | pass | pass | pass | pass | pass | pass | map-a / 单模块 | pass | 角色卡/reviewer/role-card.md |`,
    `| ${TESTER} | reduce | pass | pass | pass | pass | pass | pass | reduce / 覆盖全部 Map | pass | 角色卡/${TESTER}/role-card.md |`,
    "",
  ].join("\n");
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
    "| P1 | v2 计划与 MapReduce 交付 | 账本/文件/分片证据 | 待提交 | demo | 测试 | 待判定 | 待判定 |",
    "",
    "风险档位：T3。",
    "",
    "判定规则：pass / fail / insufficient evidence。",
    "",
    "证据计划：Electron 截图、账本、manifest 与分片日志。",
    "",
    "版本与冻结：写盘后冻结。",
    "",
  ].join("\n");
}

function reportDoc() {
  return [
    "风险档位：T3｜判定依据：角色粒度与 MapReduce 流程变更｜选定检查：真实启动+账本+manifest｜复用证据：无｜全量回归：已执行",
    "",
    `# 验收报告 ${FLOW}`,
    "",
    "## 结论",
    "通过（演示）。",
    "",
  ].join("\n");
}

function changeDoc() {
  return [
    "---",
    `flowId: ${FLOW}`,
    "version: 1",
    "riskTier: T3",
    "candidate: demo-candidate",
    "changedPaths:",
    "  - src/owned-executor/",
    "  - src/owned-reviewer/",
    "evidence:",
    `  - ${REPORT_REL}`,
    "---",
    "",
    `# 变更包 ${FLOW}`,
    "",
    "风险档位 T3。",
    "",
  ].join("\n");
}

function manifestDoc() {
  return [
    "---",
    `flowId: ${FLOW}`,
    "candidate: demo-candidate",
    "environment: Electron offline-scripted",
    "---",
    "",
    "# MapReduce 证据（演示）",
    "",
    "## Map 分片",
    "| module | command | log | result |",
    "| --- | --- | --- | --- |",
    "| storefront | node --test \"test/owned-executor/**\" | map-storefront.log | pass |",
    "| checkout-api | node --test \"test/owned-reviewer/**\" | map-checkout-api.log | pass |",
    "",
    "## Reduce",
    "| check | command | log | result |",
    "| --- | --- | --- | --- |",
    "| integration-e2e | node --test \"test/测试/e2e/**\" | reduce-e2e.log | pass |",
    "",
  ].join("\n");
}

function seedProject() {
  const govYaml =
    "role: 治理边界\nentries:\n  - kind: directory\n    path: 角色卡/\n    root: project\n    purpose: 角色目录\n  - kind: directory\n    path: docs/\n    root: project\n    purpose: 项目文档\n  - kind: directory\n    path: .ans/\n    root: project\n    purpose: 配置与 pin\n";
  write("角色卡/governance-boundary.yaml", govYaml);
  write(CONTRACT_A, "# 契约 storefront-v1\n\n冻结契约（演示）。\n");
  write(CONTRACT_B, "# 契约 checkout-api-v1\n\n冻结契约（演示）。\n");
  const ledgerLines = [
    {
      at: new Date().toISOString(),
      kind: "customer.decision",
      flowId: FLOW,
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
      messageSummary: "演示前置：客户接受提案",
    },
    ...[CONTRACT_A, CONTRACT_B].map((rel) => ({
      at: new Date().toISOString(),
      kind: "artifact.observed",
      flowId: FLOW,
      actorRoleId: "rapporteur",
      power: "proposal",
      artifactPath: rel,
      artifactSha256: createHash("sha256").update(fs.readFileSync(path.join(PROJECT, rel))).digest("hex"),
      messageSummary: "演示前置：契约冻结物证",
    })),
  ];
  write(".ans/governance/ledger.jsonl", ledgerLines.map((line) => JSON.stringify(line)).join("\n") + "\n");
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
            source: "demo:role-granularity-v2",
            pin: [{ path: "角色卡/governance-boundary.yaml", sha256: createHash("sha256").update(govYaml).digest("hex") }],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  write(TEAM_PLAN_REL, teamPlanV2());
  write(FLOW_REL, flowDoc({}));
  // Reduce 角色（existing）的产物预先存在；Map 角色由 Crew 写。
  write(`角色卡/${TESTER}/role-card.md`, roleCardDoc(TESTER));
  write(
    `角色卡/${TESTER}/boundary.yaml`,
    [
      `role: ${TESTER}`,
      "entries:",
      ...["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"].flatMap((file) => [
        "  - kind: file",
        `    path: 角色卡/${TESTER}/${file}`,
        "    purpose: 角色根工作文档",
      ]),
      "  - kind: directory",
      "    path: test/测试/",
      "    purpose: 跨模块测试",
      "  - kind: directory",
      "    path: docs/verification/",
      "    purpose: 证据根",
      "",
    ].join("\n"),
  );
  for (const [file, content] of Object.entries(roleWorkDocs(TESTER))) write(`角色卡/${TESTER}/${file}`, content);
}

let createDesktopInterface;
let createCustomerInputChannel;
let buildGovernedTools;
let win;
let iface;
let channel;
let nextPickPath = null;
const presentations = [];

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
      const call = async (name, args) => {
        queue.push({ kind: "tool_call", summary: `模型请求调用 ${name}`, detail: { name, args } });
        const tool = tools.get(name);
        const result = tool === undefined ? { ok: false, message: `工具未注册：${name}` } : await tool.handler({ name, args });
        queue.push({ kind: result.ok ? "accepted" : "denied", summary: result.message });
        return result;
      };
      const writeFiles = async (files) => {
        await call("request_confirmation", {
          title: `写盘确认 ${FLOW}`,
          paths: files.map(([rel]) => rel),
          preview: ["将写入以下文件（逐路径正文）：", "", ...files.map(([rel, content]) => `## ${rel}\n\n${content}`)].join("\n"),
          flowId: FLOW,
          cardKind: "appointment-write",
        });
        for (const [rel, content] of files) await call("write_file", { path: rel, content });
      };
      return {
        async prompt(text) {
          turn += 1;
          queue.push({ kind: "message", summary: `用户指令：${text}` });
          if (roleId === "convener" && /请依团队计划请客户任命/.test(text)) {
            await call("request_choice", {
              title: `任命 ${FLOW}`,
              question: "选择要任命的角色",
              flowId: FLOW,
              cardKind: "appointment",
              multiple: true,
              options: [
                { id: "executor", label: "Executor" },
                { id: "reviewer", label: "Reviewer" },
                { id: TESTER, label: "Tester" },
              ],
            });
          } else if (roleId === "convener" && /角色就绪复核/.test(text)) {
            if (exists(CRITERIA_REL)) {
              await call("write_file", { path: READINESS_REL, content: readinessDoc() });
              await call("write_file", { path: CHANGE_REL, content: changeDoc() });
              await call("write_file", { path: FLOW_REL, content: flowDoc({}) });
              await call("dispatch_task", { roleId: "executor", task: "Map A｜storefront 交付", flowId: FLOW, stepId: "delivery-storefront" });
              await call("dispatch_task", { roleId: "reviewer", task: "Map A｜checkout-api 交付", flowId: FLOW, stepId: "delivery-checkout-api" });
            }
          } else if (roleId === "convener" && /收尾 Map/.test(text)) {
            await call("write_file", { path: FLOW_REL, content: flowDoc({ mapDone: true }) });
            await call("dispatch_task", { roleId: TESTER, task: "Map 测试分片（按模块并行、每分片独立证据）", flowId: FLOW, stepId: "test-map-shards" });
            await call("write_file", { path: FLOW_REL, content: flowDoc({ mapDone: true, shardsDone: true }) });
            await call("dispatch_task", { roleId: TESTER, task: "Reduce｜契约/集成/端到端", flowId: FLOW, stepId: "integration-e2e" });
            await call("write_file", { path: FLOW_REL, content: flowDoc({ mapDone: true, shardsDone: true, e2eDone: true }) });
          } else if (roleId === "convener" && /收尾流程/.test(text)) {
            await call("write_file", { path: FLOW_REL, content: flowDoc({ mapDone: true, shardsDone: true, e2eDone: true, evidenceDone: true }) });
          } else if (roleId === "nominator") {
            const files = [];
            for (const roleId2 of MAP_ROLES) {
              files.push([`角色卡/${roleId2}/role-card.md`, roleCardDoc(roleId2)]);
              files.push([`角色卡/${roleId2}/boundary.yaml`, roleBoundaryDoc(roleId2)]);
              for (const [file, content] of Object.entries(roleWorkDocs(roleId2))) files.push([`角色卡/${roleId2}/${file}`, content]);
            }
            await writeFiles(files);
          } else if (roleId === "verifier" && /实施前完成标准/.test(text)) {
            await call("write_file", { path: CRITERIA_REL, content: criteriaDoc() });
          } else if (roleId === "verifier" && /验收报告|验收卡/.test(text)) {
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
          } else if (roleId === TESTER && /合并分片证据|manifest/.test(text)) {
            await call("write_file", { path: MANIFEST_REL, content: manifestDoc() });
          } else if (roleId === "executor" || roleId === "reviewer") {
            await call("submit_report", { status: "completed", summary: `${roleId} Map 交付完成（演示）。` });
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

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error(`等待超时：${label}`);
    await sleep(50);
  }
}

async function waitForPresentation(match) {
  await waitFor(() => presentations.some(match), 20000, `交互卡 ${match}`);
  return presentations.find(match);
}

async function sendViaUi(roleId, text) {
  const projectRoot = PROJECT.split(path.sep).join("/");
  const runtime = await win.webContents.executeJavaScript("window.__ansRenderer.state.runtime");
  const result = await win.webContents.executeJavaScript(
    `window.desktop.sendSession(${JSON.stringify(text)}, [], { projectRoot: ${JSON.stringify(projectRoot)}, roleId: ${JSON.stringify(roleId)}, runtime: ${JSON.stringify(runtime)} })`,
  );
  if (!result || result.ok !== true) throw new Error(`发送失败（${roleId}@${runtime}）：${JSON.stringify(result)}`);
  log(`DEMO_SEND role=${roleId} runtime=${runtime}`);
  return result;
}

function fireViaUi(roleId, text) {
  void sendViaUi(roleId, text).catch((error) => log("DEMO_SEND_ERROR " + (error && error.message ? error.message : String(error))));
}

async function run() {
  Menu.setApplicationMenu(null);
  createDesktopInterface = (await import(pathToFileURL(path.join(APP_DIR, "desktop", "interface.ts")).href)).createDesktopInterface;
  createCustomerInputChannel = (await import(pathToFileURL(path.join(APP_DIR, "desktop", "customer-input.ts")).href)).createCustomerInputChannel;
  buildGovernedTools = (await import(pathToFileURL(path.join(REPO_ROOT, "src", "provider", "runtime", "tools.ts")).href)).buildGovernedTools;
  const rendererEntryModule = await import(pathToFileURL(path.join(APP_DIR, "desktop", "renderer-entry.ts")).href);
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
        log(`EVENT ${envelope.roleId} ${event.kind} ${event.kind === "denied" ? String(event.summary ?? "") : String(event.summary ?? "").slice(0, 160)}`);
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

  const projectRootNorm = PROJECT.split(path.sep).join("/");
  await win.webContents.executeJavaScript(`window.__ansRenderer.loadProject(${JSON.stringify(projectRootNorm)})`);
  await waitFor(
    () => win.webContents.executeJavaScript("window.__ansRenderer.state.projectRoot === " + JSON.stringify(projectRootNorm)),
    15000,
    "导入项目",
  );
  await sleep(400);
  await shot("demo-01-project-imported");
  log("DEMO_V2_PLAN=" + exists(TEAM_PLAN_REL));
  log("DEMO_V2_FLOW_PARALLEL_GROUP=" + /parallelGroup: map-a/.test(fs.readFileSync(path.join(PROJECT, FLOW_REL), "utf8")));

  const openedConvener = await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('convener')");
  if (openedConvener !== true) throw new Error("打开 Convener 失败");
  await waitFor(
    () => win.webContents.executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId === 'convener'"),
    15000,
    "打开 Convener 会话",
  );
  await sleep(300);

  // ① appointment 卡（v2 计划 + MapReduce flow 通过卡前守卫/V11）。
  fireViaUi("convener", "请依团队计划请客户任命 executor、reviewer 与 tester。");
  const appointment = await waitForPresentation((p) => p.request && p.request.cardKind === "appointment");
  await sleep(500);
  await shot("demo-02-appointment-card");
  log("DEMO_APPOINTMENT_CARD_VISIBLE=true");
  channel.respond({ id: appointment.id, decision: { kind: "choice", selected: ["executor", "reviewer", TESTER] } });

  // ② 应用派 Crew 写两个 Map 角色卡 → appointment-write 卡（客户确认）。
  const writeCard = await waitForPresentation((p) => p.request && p.request.cardKind === "appointment-write");
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('nominator')");
  await sleep(600);
  await shot("demo-03-crew-write-card");
  log("DEMO_CREW_WRITE_CARD_VISIBLE=true");
  channel.respond({ id: writeCard.id, decision: { kind: "confirm", confirmed: true } });
  await waitFor(() => exists("角色卡/executor/role-card.md") && exists("角色卡/reviewer/role-card.md"), 20000, "Crew 写两个 Map 角色卡");
  log("DEMO_CREW_TWO_ROLES_WRITTEN=true");

  // ③ Verifier 写实施前标准 → Convener readiness（v2 文案/模块/测试面/并行）。
  const uiRuntime = await win.webContents.executeJavaScript("window.__ansRenderer.state.runtime");
  const verifierOpen = await iface.openSession({ projectRoot: projectRootNorm, roleId: "verifier", runtime: uiRuntime });
  if (verifierOpen.ok !== true) throw new Error(`打开 Verifier 失败：${verifierOpen.error ?? ""}`);
  await sendViaUi("verifier", "请写实施前完成标准。");
  await waitFor(() => exists(CRITERIA_REL), 10000, "实施前标准落盘");
  const convenerOpen = await iface.openSession({ projectRoot: projectRootNorm, roleId: "convener", runtime: uiRuntime });
  if (convenerOpen.ok !== true) throw new Error(`重新打开 Convener 失败：${convenerOpen.error ?? ""}`);
  fireViaUi("convener", "请继续角色就绪复核（role-readiness）。");
  await waitFor(() => exists(READINESS_REL) && exists(CHANGE_REL), 20000, "readiness/变更包落盘");
  await waitFor(
    () =>
      fs.existsSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl")) &&
      ["delivery-storefront", "delivery-checkout-api"].every((stepId) =>
        fs.readFileSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl"), "utf8").includes(`"stepId":"${stepId}"`),
      ),
    20000,
    "Map 并行派发账本",
  );
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('convener')");
  await sleep(600);
  await shot("demo-04-convener-readiness-map-dispatch");
  log("DEMO_READINESS_RECORD=" + exists(READINESS_REL));
  log("DEMO_CHANGE_PACKAGE=" + exists(CHANGE_REL));
  log("DEMO_MAP_PARALLEL_DISPATCH=true");

  // ④ Map done → 测试分片 → Reduce 集成派发 → 测试角色写 manifest。
  const convenerMap = await iface.openSession({ projectRoot: projectRootNorm, roleId: "convener", runtime: uiRuntime });
  if (convenerMap.ok !== true) throw new Error(`打开 Convener（Map 收尾）失败：${convenerMap.error ?? ""}`);
  fireViaUi("convener", "请收尾 Map：把两个 Map 交付标 done 并派发 Reduce 测试分片与集成。");
  await waitFor(
    () =>
      ["test-map-shards", "integration-e2e"].every((stepId) =>
        fs.readFileSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl"), "utf8").includes(`"stepId":"${stepId}"`),
      ),
    20000,
    "Reduce 派发账本",
  );
  log("DEMO_REDUCE_DISPATCH=true");
  const testerOpen = await iface.openSession({ projectRoot: projectRootNorm, roleId: TESTER, runtime: uiRuntime });
  if (testerOpen.ok !== true) throw new Error(`打开 Tester 失败：${testerOpen.error ?? ""}`);
  await sendViaUi(TESTER, "请合并分片证据（manifest）并写 docs/verification。");
  await waitFor(() => exists(MANIFEST_REL), 10000, "Reduce manifest 落盘");
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('tester')");
  await sleep(600);
  await shot("demo-05-reduce-manifest");
  log("DEMO_MANIFEST=" + exists(MANIFEST_REL));

  // ⑤ 最终 flow（所有执行步骤 done）→ Verifier 报告 + acceptance 卡 → 客户验收。
  const convenerFinal = await iface.openSession({ projectRoot: projectRootNorm, roleId: "convener", runtime: uiRuntime });
  if (convenerFinal.ok !== true) throw new Error(`打开 Convener（收尾）失败：${convenerFinal.error ?? ""}`);
  fireViaUi("convener", "请收尾流程：按账本证据把剩余执行步骤标 done。");
  await waitFor(
    () => {
      const text = fs.readFileSync(path.join(PROJECT, FLOW_REL), "utf8");
      return /- id: verification-evidence\r?\n(?:    [^\n]*\n)*?    status: done/.test(text);
    },
    15000,
    "最终 flow",
  );
  // 稳定后再交验收，避免判断/受理期间 flow 变化。
  await sleep(500);
  const verifierReopen = await iface.openSession({ projectRoot: projectRootNorm, roleId: "verifier", runtime: uiRuntime });
  if (verifierReopen.ok !== true) throw new Error(`重新打开 Verifier 失败：${verifierReopen.error ?? ""}`);
  fireViaUi("verifier", "请汇总证据并出验收报告与验收卡。");
  const acceptance = await waitForPresentation((p) => p.request && p.request.cardKind === "acceptance");
  await win.webContents.executeJavaScript("window.__ansRenderer.selectRole('verifier')");
  await sleep(600);
  await shot("demo-06-acceptance-card");
  log("DEMO_ACCEPTANCE_CARD_VISIBLE=true");
  channel.respond({ id: acceptance.id, decision: { kind: "choice", selected: ["accept"] } });
  await waitFor(() => exists(REPORT_REL), 10000, "验收报告落盘");
  await sleep(800);
  await shot("demo-07-accepted");

  const ledgerText = fs.existsSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl"))
    ? fs.readFileSync(path.join(PROJECT, ".ans", "governance", "ledger.jsonl"), "utf8")
    : "";
  const entries = ledgerText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const decisions = entries
    .filter((entry) => entry.kind === "customer.decision")
    .map((entry) => `${entry.decisionKind}:${entry.customerDecision}:${(entry.targetRoleIds ?? []).join("+")}`);
  log("DEMO_DECISIONS=" + decisions.join(","));
  const dispatched = entries.filter((entry) => entry.kind === "dispatch.accepted").map((entry) => entry.stepId ?? entry.targetRoleId);
  log("DEMO_DISPATCHES=" + dispatched.join(","));
  for (const rel of [TEAM_PLAN_REL, FLOW_REL, CRITERIA_REL, REPORT_REL, CHANGE_REL, READINESS_REL, MANIFEST_REL, "角色卡/executor/role-card.md", "角色卡/reviewer/role-card.md"]) {
    log(`DEMO_FILE_${rel}=${exists(rel)}`);
  }
  const pass =
    decisions.some((entry) => entry.startsWith("appointment:appointed:executor+reviewer+tester")) &&
    decisions.some((entry) => entry.startsWith("appointment-write:accepted")) &&
    decisions.some((entry) => entry.startsWith("acceptance:accepted")) &&
    dispatched.includes("delivery-storefront") &&
    dispatched.includes("delivery-checkout-api") &&
    dispatched.includes("test-map-shards") &&
    dispatched.includes("integration-e2e") &&
    exists(MANIFEST_REL) &&
    exists(REPORT_REL) &&
    fs.readdirSync(OUTDIR).filter((name) => name.endsWith(".png")).length >= 7;
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
