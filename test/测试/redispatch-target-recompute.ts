// test/测试/redispatch-target-recompute.ts
// 2026-10-23 S5 终验：目标项目只读复算（governance-advance-redispatch）。
//
// 用法：node test/测试/redispatch-target-recompute.ts <目标项目根>
// 语义：
//   · 只读目标项目：复制 flow/账本/团队计划/角色卡到**一次性临时根**，并只改临时根的 `.ans/project.json` projectRoot；
//     目标项目前后哈希必须零变化（脚本内校验）。
//   · 在临时根上走真实桌面 Interface + 新逻辑：
//       - 目标账本形态含「appointment 链早期无 stepId 的 app→Convener 派发」（entry 17/索引 16）与后续 Crew 写卡；
//         断言该旧条目不再挡：应用应把 role-cards 收口 done、写验证记录、派 stepId=role-readiness 的 readiness。
//       - 再次刷新：当前指纹通过记录之后已有 readiness 派发 ⇒ 不重复（跨重启账本锚）。
//   · 本脚本**不修改**目标项目、不写仓库；输出 JSON 摘要供证据保存。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { makeHarness } from "./governance-e2e-auto/fixture.ts";

const target = process.argv[2];
if (typeof target !== "string" || target.trim() === "") {
  throw new Error("用法：node test/测试/redispatch-target-recompute.ts <目标项目根>");
}
const TARGET = path.resolve(target);
const FLOW_ID = "ai-governance-pipeline";
const FLOW_REL = `docs/flows/${FLOW_ID}.yaml`;
const LEDGER_REL = ".ans/governance/ledger.jsonl";
const PROJECT_REL = ".ans/project.json";
const TEAM_PLAN_REL = `docs/scheduling/${FLOW_ID}-team-v1.md`;
const READINESS_REL = `docs/scheduling/${FLOW_ID}-readiness-v1.md`;
const RECORD_PREFIX = `.ans/governance/role-cards/${FLOW_ID}/`;

function sha256File(rel: string): string {
  return createHash("sha256").update(readFileSync(path.join(TARGET, ...rel.split("/")))).digest("hex");
}

const watched = [FLOW_REL, LEDGER_REL, PROJECT_REL, TEAM_PLAN_REL, READINESS_REL];
const before = Object.fromEntries(watched.map((rel) => [rel, sha256File(rel)]));

const temp = mkdtempSync(path.join(os.tmpdir(), "ans-redispatch-target-"));
let result: Record<string, unknown> = {};
try {
  // 只读复制到临时根（角色卡、flow、团队计划、账本、project.json）。
  cpSync(path.join(TARGET, "角色卡"), path.join(temp, "角色卡"), { recursive: true });
  cpSync(path.join(TARGET, "docs", "flows"), path.join(temp, "docs", "flows"), { recursive: true });
  cpSync(path.join(TARGET, "docs", "scheduling"), path.join(temp, "docs", "scheduling"), { recursive: true });
  for (const dir of [".ans", path.join(".ans", "governance")]) {
    cpSync(path.join(TARGET, dir), path.join(temp, dir), { recursive: true });
  }
  // 临时根的 .ans/project.json 只改 projectRoot（目标项目本身不写）。
  const projectJson = JSON.parse(readFileSync(path.join(TARGET, ...PROJECT_REL.split("/")), "utf8")) as Record<string, unknown>;
  projectJson.projectRoot = temp.replace(/\\/g, "/");
  writeFileSync(path.join(temp, ...PROJECT_REL.split("/")), `${JSON.stringify(projectJson, null, 2)}\n`, "utf8");

  const h = await makeHarness({ tag: "target-recompute", root: temp, approval: true, decision: true });
  try {
    await h.open("nominator");
    // 触发刷新探针 + 完整写卡后检查（目标账本最新 appointment 的 targets 全部已在 listing）。
    await h.iface.listProject({ projectRoot: temp });
    const deadline = Date.now() + 25000;
    let done = false;
    let corrections = 0;
    while (Date.now() < deadline) {
      const flowText = readFileSync(path.join(temp, ...FLOW_REL.split("/")), "utf8");
      done = /- id: role-cards\n(?:    [^\n]*\n)*?    status: done/.test(flowText);
      corrections = (h.prompts.get("nominator") ?? []).filter((p) => /写卡产物未通过/.test(p)).length;
      if (done || corrections > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const ledger1 = await h.waitForLedger(() => true, 1000);
    const entries1 = ledger1.entries;
    const flowText = readFileSync(path.join(temp, ...FLOW_REL.split("/")), "utf8");
    const flowBlock = /- id: role-cards\n([\s\S]*?)(?:\n  - id: |\n*$)/.exec(flowText)?.[1] ?? "";
    const recordDir = path.join(temp, ...RECORD_PREFIX.split("/"));
    const recordFiles = existsSync(recordDir) ? readdirSync(recordDir).filter((name) => name.endsWith(".json")) : [];
    const readinessDispatches = () =>
      entries1.filter(
        (entry) =>
          entry.kind === "dispatch.accepted" &&
          entry.targetRoleId === "convener" &&
          entry.actorRoleId === "app" &&
          entry.stepId === "role-readiness",
      );
    const artifactObserved = () =>
      entries1.filter(
        (entry) =>
          entry.kind === "artifact.observed" &&
          entry.actorRoleId === "app" &&
          entry.power === "app" &&
          typeof entry.artifactPath === "string" &&
          entry.artifactPath.startsWith(RECORD_PREFIX),
      );

    const firstPass = {
      roleCardsDone: /status: done/.test(flowBlock),
      roleCardsStepKind: /kind: artifact/.test(flowBlock) ? "artifact" : /kind: dispatch/.test(flowBlock) ? "dispatch" : "?",
      roleCardsEvidence: /ref: (.+)/.exec(flowBlock)?.[1]?.trim() ?? "",
      recordFiles,
      artifactObserved: artifactObserved().length,
      readinessDispatches: readinessDispatches().length,
      corrections,
      oldNoStepIdDispatchIndex: entries1.findIndex(
        (entry) =>
          entry.kind === "dispatch.accepted" &&
          entry.targetRoleId === "convener" &&
          entry.actorRoleId === "app" &&
          entry.stepId === undefined,
      ),
    };
    result.firstPass = firstPass;

    // 第二次刷新：当前指纹通过记录之后已有 readiness 派发 ⇒ 不重复派发/不重复记录。
    await h.iface.listProject({ projectRoot: temp });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const ledger2 = await h.waitForLedger(() => true, 1000);
    const secondRefresh = {
      readinessDispatches: ledger2.entries.filter(
        (entry) =>
          entry.kind === "dispatch.accepted" &&
          entry.targetRoleId === "convener" &&
          entry.actorRoleId === "app" &&
          entry.stepId === "role-readiness",
      ).length,
      artifactObserved: ledger2.entries.filter(
        (entry) =>
          entry.kind === "artifact.observed" &&
          entry.actorRoleId === "app" &&
          entry.power === "app" &&
          typeof entry.artifactPath === "string" &&
          entry.artifactPath.startsWith(RECORD_PREFIX),
      ).length,
    };
    result.secondRefresh = secondRefresh;
    assert.equal(firstPass.roleCardsDone, true, "目标账本形态：旧无 stepId 派发不得挡住 role-cards 收口");
    assert.equal(firstPass.artifactObserved, 1, "应写一条应用验证记录（artifact.observed）");
    assert.equal(firstPass.readinessDispatches, 1, "应派一次 role-readiness");
    assert.equal(firstPass.corrections, 0, "目标角色卡应通过结构校验（或见 corrections 失败）");
    assert.equal(secondRefresh.readinessDispatches, 1, "当前指纹通过记录后已有派发 ⇒ 刷新不得重复派发");
    assert.equal(secondRefresh.artifactObserved, 1, "刷新不得重复写验证记录");
  } finally {
    await h.stop();
    h.cleanup();
  }
  const after = Object.fromEntries(watched.map((rel) => [rel, sha256File(rel)]));
  result.targetZeroWrite = before;
  result.targetUnchanged = watched.every((rel) => before[rel] === after[rel]);
  assert.equal(result.targetUnchanged, true, "目标项目 flow/账本/计划/项目配置必须零变化");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(JSON.stringify({ target: TARGET, flowId: FLOW_ID, targetHashes: before, ...result }, null, 2));
