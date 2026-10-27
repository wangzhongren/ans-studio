// 独立验收探针（不属于产品/测试代码；仅本角色证据）：
// 1) ensureFlowSkeleton 落盘形状/幂等/fail-closed/零副作用/并发；
// 2) 骨架 → 完整流程替换的结构可解析性（去掉 status: skeleton、保留 contract-freeze 证据、加交付步骤与 gate）；
// 3) 三态文案（无 flow / 骨架 / 完整 flow）。
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureFlowSkeleton, validateReleaseOnlyExtension } from "../../../../../src/common/编排/flow-service.ts";
import { parseFlowStateYaml } from "../../../../../src/common/编排/flow-state.ts";
import { buildGovernanceAdvanceMessage } from "../../../../../app/desktop/governance-advance.ts";

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail });

const root = mkdtempSync(path.join(tmpdir(), "ans-accept-probe-"));
try {
  // —— 1) 创建、形状、幂等 ——
  const first = await ensureFlowSkeleton({ projectRoot: root, flowId: "probe-flow", qualityTier: "prototype" });
  check("created:true", first.ok && first.created === true, JSON.stringify(first));
  const abs = path.join(root, "docs", "flows", "probe-flow.yaml");
  const skeletonText = readFileSync(abs, "utf8");
  check("revision=sha256(bytes)", first.revision === createHash("sha256").update(skeletonText).digest("hex"));
  const parsed = parseFlowStateYaml(skeletonText, "probe-flow");
  check("parseFlowStateYaml ok", parsed.ok, parsed.ok ? "" : parsed.error);
  const steps = parsed.ok ? parsed.flow.steps : [];
  const shape = steps.map((s) => [s.id, s.kind, s.owner, s.status, s.dependsOn ?? []]);
  const expectedShape = [
    ["contract-freeze", "artifact", "rapporteur", "pending", []],
    ["team-plan", "artifact", "convener", "pending", ["contract-freeze"]],
    ["appointment", "customer-decision", "convener", "pending", ["team-plan"]],
    ["role-cards", "dispatch", "nominator", "pending", ["appointment"]],
    ["role-readiness", "artifact", "convener", "pending", ["role-cards"]],
    ["acceptance-criteria", "artifact", "verifier", "pending", ["role-readiness"]],
    ["change-package", "artifact", "convener", "pending", ["acceptance-criteria"]],
    ["verification", "acceptance", "app", "pending", []],
  ];
  check("八步 owner/kind/status/dependsOn 与设计一致", JSON.stringify(shape) === JSON.stringify(expectedShape), JSON.stringify(shape));
  check("顶层 status=skeleton", parsed.ok && parsed.flow.status === "skeleton");
  check("version=1 / qualityTier 原样", parsed.ok && parsed.flow.version === 1 && parsed.flow.qualityTier === "prototype");
  check("无项目交付步骤/gate/build-scaffold", !skeletonText.includes("delivery-") && !skeletonText.includes("gateKind") && !skeletonText.includes("build-scaffold"));
  check("不创建 .ans", !existsSync(path.join(root, ".ans")));
  check("docs 下仅 flows", JSON.stringify(readdirSync(path.join(root, "docs"))) === JSON.stringify(["flows"]));

  const second = await ensureFlowSkeleton({ projectRoot: root, flowId: "probe-flow", qualityTier: "production" });
  check("二次调用 created:false 且字节不变", second.ok && second.created === false && readFileSync(abs, "utf8") === skeletonText);

  const fullText = skeletonText.replace("status: skeleton\n", "");
  writeFileSync(abs, fullText, "utf8");
  const onFull = await ensureFlowSkeleton({ projectRoot: root, flowId: "probe-flow", qualityTier: "prototype" });
  check("完整流程不覆盖", onFull.ok && onFull.created === false && readFileSync(abs, "utf8") === fullText);
  writeFileSync(abs, "flowId: [unterminated", "utf8");
  const onBroken = await ensureFlowSkeleton({ projectRoot: root, flowId: "probe-flow", qualityTier: "prototype" });
  check("非法 YAML 不覆盖", onBroken.ok && onBroken.created === false && readFileSync(abs, "utf8") === "flowId: [unterminated");

  // —— 非法输入零落盘 ——
  const root2 = mkdtempSync(path.join(tmpdir(), "ans-accept-probe2-"));
  for (const bad of [
    { projectRoot: root2, flowId: "../evil", qualityTier: "production" },
    { projectRoot: root2, flowId: "Flow-A", qualityTier: "production" },
    { projectRoot: root2, flowId: "probe-b", qualityTier: "fast" },
    { projectRoot: "   ", flowId: "probe-b", qualityTier: "production" },
  ]) {
    const r = await ensureFlowSkeleton(bad);
    check(`非法输入拒绝 ${JSON.stringify(bad.flowId)}/${bad.qualityTier}`, r.ok === false && r.created === false);
  }
  check("非法输入零落盘", !existsSync(path.join(root2, "docs")));
  rmSync(root2, { recursive: true, force: true });

  // —— 并发恰一 created ——
  const root3 = mkdtempSync(path.join(tmpdir(), "ans-accept-probe3-"));
  const [a, b, c] = await Promise.all([
    ensureFlowSkeleton({ projectRoot: root3, flowId: "race-flow", qualityTier: "production" }),
    ensureFlowSkeleton({ projectRoot: root3, flowId: "race-flow", qualityTier: "prototype" }),
    ensureFlowSkeleton({ projectRoot: root3, flowId: "race-flow", qualityTier: "production" }),
  ]);
  check("同进程并发恰一 created", [a, b, c].filter((r) => r.ok && r.created).length === 1);
  check("并发后文件可解析", parseFlowStateYaml(readFileSync(path.join(root3, "docs", "flows", "race-flow.yaml"), "utf8"), "race-flow").ok === true);
  rmSync(root3, { recursive: true, force: true });

  // —— 2) 骨架 → 完整流程替换：结构上可解析、release-only 校验不误拦 ——
  const replacement = [
    "flowId: probe-flow",
    "version: 2",
    "qualityTier: prototype",
    "steps:",
    "  - id: contract-freeze",
    "    title: 冻结跨角色契约",
    "    owner: rapporteur",
    "    kind: artifact",
    "    status: done",
    "    evidence: { kind: artifact, ref: docs/contracts/probe-v1.md }",
    "  - id: team-plan",
    "    title: 团队计划",
    "    owner: convener",
    "    kind: artifact",
    "    status: done",
    "    dependsOn: [contract-freeze]",
    "    evidence: { kind: artifact, ref: docs/scheduling/probe-flow-team-v1.md }",
    "  - id: appointment",
    "    title: 任命",
    "    owner: convener",
    "    kind: customer-decision",
    "    status: pending",
    "    dependsOn: [team-plan]",
    "  - id: role-cards",
    "    title: 写卡",
    "    owner: nominator",
    "    kind: dispatch",
    "    status: pending",
    "    dependsOn: [appointment]",
    "  - id: role-readiness",
    "    title: 就绪",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "    dependsOn: [role-cards]",
    "  - id: acceptance-criteria",
    "    title: 验收标准",
    "    owner: verifier",
    "    kind: artifact",
    "    status: pending",
    "    dependsOn: [role-readiness]",
    "  - id: change-package",
    "    title: 变更包",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    "    dependsOn: [acceptance-criteria]",
    "  - id: delivery-core",
    "    title: 交付核心模块",
    "    owner: executor",
    "    kind: dispatch",
    "    status: pending",
    "    dependsOn: [contract-freeze]",
    "  - id: gate-vertical",
    "    title: 垂直切片门",
    "    owner: verifier",
    "    kind: artifact",
    "    status: pending",
    "    gateKind: vertical-slice",
    "    evidence: { kind: artifact, ref: docs/acceptance/probe-flow-gate-vertical-report-v1.md }",
    "    dependsOn: [delivery-core]",
    "  - id: verification",
    "    title: 最终验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
  const parsedReplacement = parseFlowStateYaml(replacement, "probe-flow");
  check("替换后完整流程可解析（含项目角色/交付/gate、contract-freeze 证据、无 status）", parsedReplacement.ok, parsedReplacement.ok ? "" : parsedReplacement.error);
  check("替换后无 status: skeleton", !replacement.includes("status: skeleton") && (parsedReplacement.ok ? parsedReplacement.flow.status === undefined : false));
  check(
    "contract-freeze 证据保留",
    parsedReplacement.ok
      ? JSON.stringify(parsedReplacement.flow.steps.find((s) => s.id === "contract-freeze")?.evidence) ===
          JSON.stringify({ kind: "artifact", ref: "docs/contracts/probe-v1.md" })
      : false,
  );
  const releaseCheck = validateReleaseOnlyExtension({ flowId: "probe-flow", previousText: skeletonText, nextText: replacement });
  check("release-only 校验不误拦骨架替换（双方均非 release）", releaseCheck.ok === true, JSON.stringify(releaseCheck));

  // —— 3) 三态文案 ——
  const payload = {
    cardKind: "proposal",
    nextFunction: "schedule",
    roleId: "convener",
    flowId: "probe-flow",
    proposalPath: "docs/proposals/probe-flow-v1.md",
  };
  const skeletonMsg = buildGovernanceAdvanceMessage(payload, ["convener"], {
    proposalDecision: "accept",
    flowStateExists: true,
    flowStateSkeleton: true,
  });
  const fullMsg = buildGovernanceAdvanceMessage(payload, ["convener"], { proposalDecision: "accept", flowStateExists: true });
  const noneMsg = buildGovernanceAdvanceMessage(payload, ["convener"], { proposalDecision: "accept" });
  check(
    "骨架文案：识别 skeleton + 一次性替换 + 保留证据 + 去掉 skeleton + 不要求初始创建",
    /status: skeleton/.test(skeletonMsg) &&
      /一次性替换/.test(skeletonMsg) &&
      /保留 contract-freeze 已登记的证据/.test(skeletonMsg) &&
      /去掉 status: skeleton/.test(skeletonMsg) &&
      !/请先写流程状态 YAML/.test(skeletonMsg),
  );
  check("完整 flow 文案：既有 flow 工具推进、无 skeleton 字样", /请用 flow_get 读取当前 revision/.test(fullMsg) && !/status: skeleton|一次性替换/.test(fullMsg));
  check("无 flow 文案：初始创建、无 skeleton 字样", /请先写流程状态 YAML/.test(noneMsg) && !/status: skeleton|一次性替换/.test(noneMsg));
} finally {
  rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} probes passed`);
process.exit(failed.length === 0 ? 0 : 1);
