// 独立验收探针：意图交接默认时限（不注入 handOffIntentLimits）与「阶段预算缺省=总预算」。
// ① 默认总/阶段预算 45s：send 挂起、目标 settled 后超时 ⇒ ok:false，耗时约 45s（不是 20s）；
// ② 只注入 totalMs=400（不注入 stageMs）⇒ 阶段预算回落总预算，约 400ms 超时。
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionManager } from "../../../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../../../app/desktop/project.ts";

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });
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

/** events 数组驱动的句柄：send 挂起；测试可 push settled 让本轮「结束」。 */
function hangingHandle(events, onSend) {
  return {
    async send() {
      onSend();
      return new Promise(() => {});
    },
    events() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              for (let i = 0; i < 20000 && events.length === 0; i += 1) {
                await new Promise((r) => setTimeout(r, 5));
              }
              if (events.length === 0) return { value: undefined, done: true };
              return { value: events.shift(), done: false };
            },
          };
        },
      };
    },
    async dispose() {},
  };
}

async function runCase({ injectedLimits }) {
  const root = mkdtempSync(path.join(tmpdir(), "ans-accept-deadline-"));
  mkdirSync(path.join(root, "docs", "intents"), { recursive: true });
  const listing = listingOf(root);
  const rapporteurEvents = [];
  let sendStarted = false;
  let liaisonInput;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (input.roleId === "liaison") { liaisonInput = input; return { async send() {}, events() { return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined, done: true }; } }; } }; }, async dispose() {} }; }
      if (input.roleId === "rapporteur") return hangingHandle(rapporteurEvents, () => { sendStarted = true; });
      return { async send() {}, events() { return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined, done: true }; } }; } }; }, async dispose() {} };
    },
    createPiAdapterFactory: () => { throw new Error("不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing : undefined),
    emitEvent: () => {},
    ...(injectedLimits !== undefined ? { handOffIntentLimits: injectedLimits } : {}),
  });
  await mgr.open({ projectRoot: root, roleId: "liaison", runtime: "demo" });
  const started = Date.now();
  const receiptPromise = liaisonInput.handOffIntent(
    { intentId: "intent-deadline", handoffKind: "initial", goal: "目标", scope: "范围", acceptance: "验收", summary: "摘要" },
    { turnId: "turn-deadline" },
  );
  // 等 send 真正开始，再让目标「本轮结束」（busy=false、无排队）⇒ 超时后应如实失败。
  for (let i = 0; i < 2000 && !sendStarted; i += 1) await new Promise((r) => setTimeout(r, 5));
  let settledAt;
  const settleTimer = setInterval(() => {
    if (sendStarted && settledAt === undefined) {
      settledAt = Date.now();
      rapporteurEvents.push({ kind: "settled", summary: "一轮结束（探针）" });
      clearInterval(settleTimer);
    }
  }, 10);
  const receipt = await receiptPromise;
  clearInterval(settleTimer);
  const elapsed = Date.now() - started;
  await mgr.stop(null);
  rmSync(root, { recursive: true, force: true });
  return { receipt, elapsed };
}

// ① 默认 45s（等待约 45s）
{
  const { receipt, elapsed } = await runCase({});
  check("默认：超时后如实失败（无在途证据）", receipt.ok === false && /投递任务给策划确认超时/.test(receipt.message ?? ""), JSON.stringify(receipt));
  check("默认：耗时约 45s（非旧 20s）", elapsed >= 43_000 && elapsed <= 50_000, `${elapsed}ms`);
  check("默认：文案约 45s", /约 45s/.test(receipt.message ?? ""), receipt.message ?? "");
}

// ② stageMs 缺省 = totalMs（快速用例）
{
  const { receipt, elapsed } = await runCase({ injectedLimits: { totalMs: 400 } });
  check("注入 totalMs=400 且无 stageMs：阶段预算回落总预算", receipt.ok === false && elapsed >= 350 && elapsed <= 2_000, `${elapsed}ms ${JSON.stringify(receipt)}`);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} probes passed`);
process.exit(failed.length === 0 ? 0 : 1);
