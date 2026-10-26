// 独立验收 F1 复核探针（2026-10-26 decision 卡批次，F1 修复后）：
// 合法 decision 卡通过编排结构校验，但**客户通道在呈现前以 declined+notPresented 拒绝**
// （模拟桌面/应用 fail-closed 路径）⇒ 编排不得写 customer.decision，且 evaluateFlowCompletion 不被挡。
// 只读产品代码、临时目录建夹具；不修改仓库。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRoleSession } from "../../../../../src/pipeline/orchestration/run-role.ts";
import {
  flushGovernanceLedger,
  readGovernanceLedger,
} from "../../../../../src/common/编排/governance-ledger.ts";
import { evaluateFlowCompletion } from "../../../../../src/common/编排/flow-state.ts";

const BOUNDARY =
  "role: 治理边界\nentries:\n  - kind: conditional-directory\n    path: docs/\n    condition: docs-bootstrap\n    root: project\n    purpose: 文档\n";

function project(root) {
  mkdirSync(join(root, ".ans"), { recursive: true });
  mkdirSync(join(root, "角色卡"), { recursive: true });
  writeFileSync(join(root, "角色卡", "governance-boundary.yaml"), BOUNDARY);
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["convener"],
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

const root = mkdtempSync(join(tmpdir(), "ans-acceptance-f1-skip-"));
let caps;
let rawCalls = 0;
const raw = () => {
  rawCalls += 1;
  return { outcome: "declined", notPresented: true, reason: "模拟应用在呈现前 fail-closed" };
};
const handle = await openRoleSession(
  { roleId: "convener", project: project(root), customerInput: raw, autoRepin: false },
  { createAdapter: (_gate, capabilities) => ((caps = capabilities), adapter()) },
);
const out = await caps.customerInput(
  {
    kind: "choice",
    title: "合法 decision 卡",
    flowId: "flow-a",
    cardKind: "decision",
    options: [
      { id: "a", label: "A", recommended: true },
      { id: "b", label: "B" },
    ],
  },
  {},
);
await new Promise((resolve) => setTimeout(resolve, 200));
await flushGovernanceLedger(root);
const { entries, errors } = await readGovernanceLedger(root);
const flow = {
  flowId: "flow-a",
  version: 1,
  qualityTier: "production",
  steps: [{ id: "acceptance", title: "验收", owner: "verifier", kind: "acceptance", status: "pending" }],
};
console.log(
  JSON.stringify({
    rawCalls,
    outcome: out?.outcome ?? null,
    notPresented: out?.notPresented ?? null,
    operatorId: out?.operatorId ?? null,
    ledgerEntries: entries,
    ledgerErrors: errors,
    flowCompletion: evaluateFlowCompletion(flow, { entries, errors }),
  }),
);
await handle.dispose();
rmSync(root, { recursive: true, force: true });
