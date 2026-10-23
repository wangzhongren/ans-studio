// 2026-10-23 S7 目标项目只读复算（测试角色证据脚本；不属于产品候选）
// 用法：node target-recalc.mjs <targetRoot> <outFile>
// 纪律：只读目标文件（before/after SHA-256 自证零写入）；全部复算在系统临时根副本上进行。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const targetRoot = process.argv[2] ?? "C:/Users/51054/Desktop/work/ans-gateway";
const outFile = process.argv[3];
const repoRoot = process.cwd();
const flowId = "ai-governance-pipeline";

const REL = {
  flow: `docs/flows/${flowId}.yaml`,
  ledger: ".ans/governance/ledger.jsonl",
  reportV1: `docs/acceptance/${flowId}-report-v1.md`,
  reportV2: `docs/acceptance/${flowId}-report-v2.md`,
};

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readSource = (rel) => fs.readFileSync(path.join(targetRoot, ...rel.split("/")));
const before = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, sha(readSource(rel))]));

const mod = async (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);
const { parseFlowStateYaml, evaluateFlowCompletion, latestAcceptanceDecision, parseAcceptanceReworkReport, reopenAcceptanceStepForRework } =
  await mod("src/pipeline/orchestration/flow-state.ts");
const { acceptanceLastDispatchAtMs, acceptanceDispatchRecorded } = await mod("app/desktop/governance-advance.ts");
const { readGovernanceLedger } = await mod("src/common/编排/governance-ledger.ts");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ans-target-recalc-"));
const out = [];
const log = (label, value) => out.push(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

try {
  // 只读复制到临时夹具（复制后复算绝不回写目标）。
  log("recalc.time", new Date().toISOString());
  log("recalc.tempRoot", tempRoot);
  for (const [key, rel] of Object.entries(REL)) {
    const source = path.join(targetRoot, ...rel.split("/"));
    const dest = path.join(tempRoot, ...rel.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const bytes = readSource(rel);
    fs.writeFileSync(dest, bytes);
    const lineCount = bytes.toString("utf8").split(/\r?\n/).length - (bytes.toString("utf8").endsWith("\n") ? 1 : 0);
    log(`copy.${key}`, { source, dest, sha256: sha(bytes), bytes: bytes.length, lines: lineCount });
  }
  const flowText = fs.readFileSync(path.join(tempRoot, ...REL.flow.split("/")), "utf8");
  const parsed = parseFlowStateYaml(flowText, flowId);
  log("flow.parse.ok", parsed.ok);
  if (!parsed.ok) throw new Error(`flow 不可解析：${parsed.error ?? JSON.stringify(parsed.errors)}`);
  const flow = parsed.flow;
  const ledger = await readGovernanceLedger(tempRoot);
  log("ledger.entries", ledger.entries.length);
  log("ledger.errors", ledger.errors.length);
  log("flow.steps", flow.steps.length);
  log(
    "flow.statusCounts",
    flow.steps.reduce((acc, step) => ((acc[step.status] = (acc[step.status] ?? 0) + 1), acc), {}),
  );
  const verification = flow.steps.find((step) => step.id === "verification");
  log("verification", verification ? { id: verification.id, kind: verification.kind, status: verification.status } : null);

  const latest = latestAcceptanceDecision(flowId, ledger);
  log("latestAcceptanceDecision", latest.kind);
  if (latest.kind === "rejected") {
    log("latestRejected.at", latest.entry.at);
    log("latestRejected.decisionEvidence.kind", latest.entry.decisionEvidence?.kind ?? null);
  }

  // ① 现场形态（外部漂移后）：strict 门的全部阻塞项（可能含外部新增的未结算决定）。
  const strictLive = evaluateFlowCompletion(flow, ledger);
  log("live.strict.ready", strictLive.ready);
  log("live.strict.issues", strictLive.issues);
  const allowLive = evaluateFlowCompletion(flow, ledger, { allowRejectedAcceptance: true });
  log("live.allowRejected.ready", allowLive.ready);
  log("live.allowRejected.issues", allowLive.issues);
  const unresolvedEntries = ledger.entries.filter(
    (entry) =>
      entry.kind === "customer.decision" &&
      entry.flowId === flowId &&
      (entry.decisionKind === "unclassified" ||
        entry.customerDecision === "none" ||
        entry.customerDecision === undefined ||
        entry.customerDecision === ""),
  );
  log("live.unresolvedDecisions", unresolvedEntries.map((entry) => ({ at: entry.at, decisionKind: entry.decisionKind ?? null, customerDecision: entry.customerDecision ?? null, actorRoleId: entry.actorRoleId })));

  // ② A 语义重建（方案 §8.5）：A 快照没有未结算决定；用当前副本去掉**外部后加的**未结算决定
  // （不删任何 done/superseded 步骤，现场执行步骤已全 done），保留 08:05 rejected。
  const isUnresolvedForFlow = (entry) =>
    entry.kind === "customer.decision" &&
    entry.flowId === flowId &&
    (entry.decisionKind === "unclassified" ||
      entry.customerDecision === "none" ||
      entry.customerDecision === undefined ||
      entry.customerDecision === "");
  const entriesA = { entries: ledger.entries.filter((entry) => !isUnresolvedForFlow(entry)) };
  const strictA = evaluateFlowCompletion(flow, entriesA);
  log("aFixture.strict.ready", strictA.ready);
  log("aFixture.strict.issues", strictA.issues);
  const allowA = evaluateFlowCompletion(flow, entriesA, { allowRejectedAcceptance: true });
  log("aFixture.allowRejected.ready", allowA.ready);
  log("aFixture.allowRejected.issues", allowA.issues);

  // ③ A 语义：内存移除唯一 rejected（不写回）⇒ 无决定 + 全 done + pending ⇒ ready:true（仅 rejected 挡住）。
  const withoutRejected = {
    entries: entriesA.entries.filter(
      (entry) => !(entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "acceptance" && entry.customerDecision === "rejected"),
    ),
  };
  const strictNoRejected = evaluateFlowCompletion(flow, withoutRejected);
  log("strictWithoutRejected.ready", strictNoRejected.ready);
  log("strictWithoutRejected.issues", strictNoRejected.issues);

  // ③ B 语义：返工步骤未完成（dispatched）⇒ 即使移除 rejected 也不 ready。
  const reworkStep = flow.steps.find((step) => step.id.startsWith("rework-") && step.status === "done") ?? flow.steps.find((step) => step.status === "done");
  const bFlow = {
    ...flow,
    steps: flow.steps.map((step) =>
      step.id === reworkStep.id ? { ...step, status: "dispatched", evidence: undefined } : step,
    ),
  };
  const bResult = evaluateFlowCompletion(bFlow, withoutRejected);
  log("bFixture.step", reworkStep.id);
  log("bFixture.readyWithoutRejected", bResult.ready);
  log("bFixture.issues", bResult.issues.slice(0, 5));

  // ④ verification 重开语义（app-only）：rejected 前提；dispatched → pending 清旧证据；done → 拒绝。
  const flowAbs = path.join(tempRoot, ...REL.flow.split("/"));
  const dispatchedFlow = {
    ...flow,
    steps: flow.steps.map((step) => (step.id === "verification" ? { ...step, status: "dispatched", evidence: { kind: "acceptance", ref: "acceptance" } } : step)),
  };
  // 构造 dispatched 夹具 YAML（最小、合法：沿用原 flow，仅改 verification 状态并加旧证据）。
  const lines = ["flowId: " + flow.flowId, "version: " + flow.version, "qualityTier: " + flow.qualityTier, "steps:"];
  for (const step of dispatchedFlow.steps) {
    lines.push(`  - id: ${step.id}`, `    title: ${step.title}`, `    owner: ${step.owner}`, `    kind: ${step.kind}`, `    status: ${step.status}`);
    if (step.dependsOn !== undefined) lines.push(`    dependsOn: [${step.dependsOn.join(", ")}]`);
    if (step.evidence !== undefined) lines.push("    evidence:", `      kind: ${step.evidence.kind}`, `      ref: ${step.evidence.ref}`);
  }
  fs.writeFileSync(flowAbs, lines.join("\n") + "\n");
  const reopenDispatched = await reopenAcceptanceStepForRework({ projectRoot: tempRoot, flowId });
  log("reopen.dispatched.ok", reopenDispatched.ok);
  log("reopen.dispatched.code", reopenDispatched.code ?? null);
  if (reopenDispatched.ok && reopenDispatched.flow) {
    const step = reopenDispatched.flow.steps.find((item) => item.id === "verification");
    log("reopen.dispatched.verification", { status: step?.status, evidence: step?.evidence ?? null });
  }
  const doneFlow = { ...flow, steps: flow.steps.map((step) => (step.id === "verification" ? { ...step, status: "done", evidence: { kind: "acceptance", ref: "acceptance" } } : step)) };
  const doneLines = ["flowId: " + flow.flowId, "version: " + flow.version, "qualityTier: " + flow.qualityTier, "steps:"];
  for (const step of doneFlow.steps) {
    doneLines.push(`  - id: ${step.id}`, `    title: ${step.title}`, `    owner: ${step.owner}`, `    kind: ${step.kind}`, `    status: ${step.status}`);
    if (step.dependsOn !== undefined) doneLines.push(`    dependsOn: [${step.dependsOn.join(", ")}]`);
    if (step.evidence !== undefined) doneLines.push("    evidence:", `      kind: ${step.evidence.kind}`, `      ref: ${step.evidence.ref}`);
  }
  fs.writeFileSync(flowAbs, doneLines.join("\n") + "\n");
  const reopenDone = await reopenAcceptanceStepForRework({ projectRoot: tempRoot, flowId });
  log("reopen.done.ok", reopenDone.ok);
  log("reopen.done.code", reopenDone.code ?? null);

  // ⑤ 重派门输入事实（Q13 A / Q4 A）：decisionAt、flow mtime、最近 verification 派发。
  const flowStat = fs.statSync(path.join(targetRoot, ...REL.flow.split("/")));
  const decisionAtMs = latest.kind === "rejected" ? Date.parse(latest.entry.at) : Number.NaN;
  const lastVerifierAtMs = acceptanceLastDispatchAtMs(flowId, ledger);
  log("gate.decisionAtMs", decisionAtMs);
  log("gate.flowMtimeMs", flowStat.mtimeMs);
  log("gate.flowMtimeGtDecision", Number.isFinite(decisionAtMs) ? flowStat.mtimeMs > decisionAtMs : null);
  log("gate.acceptanceLastDispatchAtMs", lastVerifierAtMs ?? null);
  log("gate.acceptanceDispatchRecorded", acceptanceDispatchRecorded(flowId, ledger));
  log("gate.lastVerifierBeforeFlow", lastVerifierAtMs !== undefined ? lastVerifierAtMs < flowStat.mtimeMs : null);
  log("gate.aFixtureAllowRejectedReady", allowA.ready);
  log("gate.liveBlockedByUnresolved", !allowLive.ready && unresolvedEntries.length > 0);
  log("gate.liveWouldRedispatch", false);
  log("gate.liveNote", "现场账本有外部后加的未结算决定（见 live.unresolvedDecisions），既有口径 fail-closed 仍挡重派；需先核对/结算该决定。");
  log("gate.aFixtureWouldRedispatchOnce", allowA.ready && Number.isFinite(decisionAtMs) && flowStat.mtimeMs > decisionAtMs && (lastVerifierAtMs === undefined || lastVerifierAtMs < flowStat.mtimeMs));
  const flowSha = sha(readSource(REL.flow));
  log("gate.sameFlowShaSuppression", { hypothetical: true, currentFlowSha256: flowSha, note: "若 routing record.lastDispatchedFlowSha256 === 当前 sha 则不重派（同内容抑制）" });

  // ⑥ 报告结构化段：v1/v2 均无 acceptance-rework ⇒ missing（不解析 §8/§9.1）。
  for (const [key, rel] of [["reportV1", REL.reportV1], ["reportV2", REL.reportV2]]) {
    const text = readSource(rel).toString("utf8");
    const parsedReport = parseAcceptanceReworkReport(text);
    log(`${key}.parse.ok`, parsedReport.ok);
    log(`${key}.parse.reason`, parsedReport.ok ? null : parsedReport.reason);
    log(`${key}.acceptanceReworkOccurrences`, (text.match(/acceptance-rework/g) ?? []).length);
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const after = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, sha(readSource(rel))]));
log("zeroWrite.before", before);
log("zeroWrite.after", after);
log("zeroWrite.unchanged", Object.keys(before).every((key) => before[key] === after[key]));
const text = out.join("\n") + "\n";
if (outFile !== undefined) fs.writeFileSync(outFile, text);
process.stdout.write(text);
