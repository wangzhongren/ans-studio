// 独立验收探针：桌面交接的顺序与副作用（真实 SessionManager，假句柄）。
// 断言：① send() 被调用时骨架文件已存在（先建骨架、后投递）；② 回执 ok:true；
// ③ 账本只写一条 dispatch.accepted{trigger:intent-handoff}，不写 intent.handed-off / customer.decision；
// ④ 已存在的完整流程在交接时不被覆盖。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionManager } from "../../../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../../../app/desktop/project.ts";
import { readGovernanceLedger } from "../../../../../src/pipeline/orchestration/govern-session.ts";
import { parseFlowStateYaml } from "../../../../../src/common/编排/flow-state.ts";

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
const fakeHandle = () => ({
  async send() {},
  events() {
    return {
      [Symbol.asyncIterator]() {
        return { async next() { return { value: undefined, done: true }; } };
      },
    };
  },
  async dispose() {},
});
const listingOf = (projectRoot) => ({
  projectRoot,
  roles: ["liaison", "rapporteur", "nominator", "convener"].map((id) => {
    const fn = { liaison: "liaison", rapporteur: "proposal", nominator: "nomination", convener: "schedule" }[id];
    return {
      roleId: id,
      cardPath: "",
      boundaryPath: "",
      cardText: `# ${id}`,
      boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: true, source: "probe" } },
      builtIn: true,
      ...(fn !== undefined ? { governanceFunction: fn } : {}),
    };
  }),
  warnings: [],
  hasRoles: false,
  primaryRoleId: "liaison",
  governanceModel: "trio",
});

const root = mkdtempSync(path.join(tmpdir(), "ans-accept-order-"));
let mgr;
try {
  mkdirSync(path.join(root, "docs", "intents"), { recursive: true });
  writeFileSync(
    path.join(root, "docs", "intents", "intent-order.md"),
    ["---", "intentId: intent-order", "handoffKind: initial", "flowId: flow-order", "qualityTier: production", "goal: 目标", "scope: 范围", "acceptance: 验收", "---", ""].join("\n"),
    "utf8",
  );
  const listing = listingOf(root);
  let liaisonInput;
  let sendCalls = 0;
  let skeletonSeenAtSend;
  mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "liaison") liaisonInput = input;
      if (input.roleId === "rapporteur") {
        return {
          async send() {
            sendCalls += 1;
            skeletonSeenAtSend = existsSync(path.join(root, "docs", "flows", "flow-order.yaml"));
          },
          events() {
            return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined, done: true }; } }; } };
          },
          async dispose() {},
        };
      }
      return fakeHandle();
    },
    createPiAdapterFactory: () => { throw new Error("不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing : undefined),
    emitEvent: () => {},
  });
  check("打开 Liaison", (await mgr.open({ projectRoot: root, roleId: "liaison", runtime: "demo" })).ok === true);
  const receipt = await liaisonInput.handOffIntent(
    { intentId: "intent-order", handoffKind: "initial", goal: "目标", scope: "范围", acceptance: "验收", summary: "摘要" },
    { turnId: "turn-order" },
  );
  check("交接回执 ok:true", receipt.ok === true, JSON.stringify(receipt));
  check("只投递一次（不重试）", sendCalls === 1, String(sendCalls));
  check("send() 时骨架已存在（先建骨架、后投递）", skeletonSeenAtSend === true, String(skeletonSeenAtSend));
  const flowText = readFileSync(path.join(root, "docs", "flows", "flow-order.yaml"), "utf8");
  const parsed = parseFlowStateYaml(flowText, "flow-order");
  check("骨架可解析且 status=skeleton", parsed.ok && parsed.flow.status === "skeleton", parsed.ok ? "" : parsed.error);
  const ledger = await readGovernanceLedger(root);
  const accepted = ledger.entries.filter((e) => e.kind === "dispatch.accepted" && e.trigger === "intent-handoff");
  check("账本恰一条 dispatch.accepted{intent-handoff}", accepted.length === 1, String(accepted.length));
  check("桌面不写 intent.handed-off", ledger.entries.every((e) => e.kind !== "intent.handed-off"));
  check("桌面不写 customer.decision", ledger.entries.every((e) => e.kind !== "customer.decision"));
  // 交接的既有副作用只有 dispatch.accepted 审计账本（.ans/governance/ledger.jsonl）；骨架创建本身
  // 不建 .ans（另见 15_probe-skeleton：ensureFlowSkeleton 后 .ans 不存在）。不得写 project.json 等。
  const ansEntries = readdirSync(path.join(root, ".ans"));
  check(".ans 仅含 governance（审计账本）", JSON.stringify(ansEntries) === JSON.stringify(["governance"]), JSON.stringify(ansEntries));
  check(".ans 无 project.json", !existsSync(path.join(root, ".ans", "project.json")));

  // 已存在完整流程：交接不得覆盖。
  const fullFlow = flowText.replace("status: skeleton\n", "");
  writeFileSync(path.join(root, "docs", "flows", "flow-order.yaml"), fullFlow, "utf8");
  await liaisonInput.handOffIntent(
    { intentId: "intent-order", handoffKind: "initial", goal: "目标", scope: "范围", acceptance: "验收", summary: "摘要" },
    { turnId: "turn-order-2" },
  );
  check("已存在完整流程不被覆盖", readFileSync(path.join(root, "docs", "flows", "flow-order.yaml"), "utf8") === fullFlow);
} finally {
  await mgr?.stop(null);
  rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} probes passed`);
process.exit(failed.length === 0 ? 0 : 1);
