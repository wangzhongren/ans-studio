// 独立验收探针（2026-10-26 decision 卡批次）：验证非桌面通道的结构 fail-closed 与
// 桌面拒绝后的账本副作用。只读产品代码、仅在临时目录建夹具；不修改仓库。
//
// 运行：node "角色卡/独立验收/docs/change/2026-10-26_decision-card-acceptance-evidence/probe-decision-card-paths.mjs"
// 依赖：Node v24（直接运行 .ts 模块；与仓库测试同口径）。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRoleSession } from "../../../../../src/pipeline/orchestration/run-role.ts";
import {
  flushGovernanceLedger,
  readGovernanceLedger,
} from "../../../../../src/common/编排/governance-ledger.ts";
import { createCustomerInputChannel } from "../../../../../app/desktop/customer-input.ts";

const BOUNDARY =
  "role: 治理边界\nentries:\n  - kind: conditional-directory\n    path: docs/\n    condition: docs-bootstrap\n    root: project\n    purpose: 文档\n";

function project(root, model, builtInRoles) {
  mkdirSync(join(root, ".ans"), { recursive: true });
  mkdirSync(join(root, "角色卡"), { recursive: true });
  writeFileSync(join(root, "角色卡", "governance-boundary.yaml"), BOUNDARY);
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: model }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: model,
    builtInRoles,
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "probe" } },
  };
}

function adapter() {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      return {
        async prompt() {},
        events() {
          return (async function* () {
            yield { kind: "settled", summary: "done" };
          })();
        },
        async dispose() {},
      };
    },
  };
}

async function runCase(label, { model, roleId, builtInRoles, request, desktop }) {
  const root = mkdtempSync(join(tmpdir(), "ans-acceptance-probe-"));
  let caps;
  let rawCalls = 0;
  let presented = 0;
  let channel;
  if (desktop) {
    channel = createCustomerInputChannel({
      presenter: () => {
        presented += 1;
      },
      operatorId: "customer-op",
      nextId: () => "op-1",
    });
  }
  const raw = desktop
    ? (req, metadata) => {
        rawCalls += 1;
        return channel.customerInput(
          req,
          { roleId, projectRoot: root, runtime: "demo", governanceModel: model },
          metadata,
        );
      }
    : (req) => {
        rawCalls += 1;
        return { outcome: "answered", value: { selected: ["a"] }, operatorId: "cli" };
      };
  const handle = await openRoleSession(
    { roleId, project: project(root, model, builtInRoles), customerInput: raw, autoRepin: false },
    { createAdapter: (_gate, capabilities) => ((caps = capabilities), adapter()) },
  );
  let outcome;
  try {
    outcome = await caps.customerInput(request, {});
  } catch (error) {
    outcome = { error: String(error && error.message ? error.message : error) };
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  await flushGovernanceLedger(root);
  const { entries, errors } = await readGovernanceLedger(root);
  console.log(
    JSON.stringify({
      label,
      channel: desktop ? "desktop" : "raw(orchestration->CLI-like)",
      rawCalls,
      presented,
      outcome: outcome?.outcome ?? null,
      notPresented: outcome?.notPresented ?? null,
      ledgerEntries: entries.map((entry) => ({
        kind: entry.kind,
        decisionKind: entry.decisionKind ?? null,
        customerDecision: entry.customerDecision ?? null,
        selectedOptions: entry.selectedOptions ?? null,
      })),
      ledgerErrors: errors,
    }),
  );
  await handle.dispose();
  rmSync(root, { recursive: true, force: true });
}

const convenerOptionsNoRecommended = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
];
const convenerOptionsTwoRecommended = [
  { id: "a", label: "A", recommended: true },
  { id: "b", label: "B", recommended: true },
];
const convenerOptionsValid = [
  { id: "a", label: "A", recommended: true },
  { id: "b", label: "B" },
];

// F1：桌面产品通道拒绝非法 decision 卡后，编排仍写账本（预期：0 条；实测：unclassified/none）。
await runCase("F1a desktop reject zero-recommended (valid flowId)", {
  model: "trio",
  roleId: "convener",
  builtInRoles: ["convener"],
  desktop: true,
  request: { kind: "choice", title: "t", flowId: "flow-a", cardKind: "decision", options: convenerOptionsNoRecommended },
});
await runCase("F1b desktop reject two-recommended (valid flowId)", {
  model: "trio",
  roleId: "convener",
  builtInRoles: ["convener"],
  desktop: true,
  request: { kind: "choice", title: "t", flowId: "flow-a", cardKind: "decision", options: convenerOptionsTwoRecommended },
});

// F2：非桌面 customerInput（CLI 的 createCliCustomerInput 同形）未做 decision 结构校验。
await runCase("F2a orchestration→raw convener zero-recommended", {
  model: "trio",
  roleId: "convener",
  builtInRoles: ["convener"],
  desktop: false,
  request: { kind: "choice", title: "t", flowId: "flow-a", cardKind: "decision", options: convenerOptionsNoRecommended },
});
await runCase("F2b orchestration→raw convener missing flowId", {
  model: "trio",
  roleId: "convener",
  builtInRoles: ["convener"],
  desktop: false,
  request: { kind: "choice", title: "t", cardKind: "decision", options: convenerOptionsValid },
});
await runCase("F2c single su decision card (role check only in desktop)", {
  model: "single",
  roleId: "su",
  builtInRoles: ["su"],
  desktop: false,
  request: { kind: "choice", title: "t", flowId: "flow-a", cardKind: "decision", options: convenerOptionsValid },
});
