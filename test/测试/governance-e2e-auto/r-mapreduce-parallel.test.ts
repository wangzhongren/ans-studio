// test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts
// 2026-10-22 角色粒度/MapReduce（Reduce 终验；验收标准 P4/P6/P7/P9 的并行与证据口径）。
//
// 覆盖：
//   · Map 组并行派发：同一 map 组两个角色互不依赖，先后/并行派发都受理，账本各自独立；
//   · dependsOn 硬前置：Reduce 步骤在所有 Map 交付 done 之前派发被拒（不写账本），done 后受理；
//   · 同组依赖拒绝：团队计划 / flow 两条路径都拒绝同一 map 组内的依赖路径；
//   · 测试分片隔离与失败隔离：两个独立临时根/输出/日志的 node 子进程，一个失败不阻塞另一个；
//     只重跑失败分片；共享只读夹具 pin 哈希前后一致；manifest 合并索引与原始日志分离；
//   · legacy 不变：无 parallelGroup/dependsOn 的旧 flow 不新增前置检查；
//   · Provider 不扩参：v2 初始 flow YAML 可携带可选字段；FLOW_STEP_KINDS 仍四值。
//
// 产品侧全部走真实 gate/flow 解析/桌面 Interface；模型为脚本桩。分片测试是测试角色自身的
// MapReduce 执行协议验证（不修改产品代码）。

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FLOW_STEP_KINDS, parseFlowStateYaml } from "../../../src/common/编排/flow-state.ts";
import { parseTeamPlan, teamPlanIssueMessages } from "../../../src/common/编排/team-plan.ts";
import {
  CRITERIA_REL,
  FLOW,
  FLOW_REL,
  TEAM_PLAN_REL,
  acceptanceCriteriaDoc,
  flowDoc,
  makeHarness,
  makeRoot,
  seedLedger,
  seedTrioProject,
  teamPlanV2Doc,
  write,
} from "./fixture.ts";

const ROLE_IDS = ["executor", "reviewer", "tester"] as const;

const MAP_FLOW_PENDING = flowDoc(FLOW, [
  { id: "contract-freeze", title: "冻结契约", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
  { id: "delivery-storefront", title: "Map A｜storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
  { id: "delivery-checkout-api", title: "Map A｜checkout-api", owner: "reviewer", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
  { id: "test-map-shards", title: "Map 测试分片", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
  { id: "integration-e2e", title: "Reduce｜契约/集成/端到端", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["test-map-shards"] },
  { id: "verification", title: "验收", kind: "acceptance", status: "pending" },
]);

/** Map 交付 done、Reduce 仍 pending 的 flow（dependsOn 前置已满足）。 */
const MAP_FLOW_DONE = flowDoc(FLOW, [
  { id: "contract-freeze", title: "冻结契约", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
  { id: "delivery-storefront", title: "Map A｜storefront", owner: "executor", kind: "dispatch", status: "done", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
  { id: "delivery-checkout-api", title: "Map A｜checkout-api", owner: "reviewer", kind: "dispatch", status: "done", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
  { id: "test-map-shards", title: "Map 测试分片", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
  { id: "integration-e2e", title: "Reduce｜契约/集成/端到端", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["test-map-shards"] },
  { id: "verification", title: "验收", kind: "acceptance", status: "pending" },
]);

const TEAM_PLAN = teamPlanV2Doc(FLOW, {
  modules: ["storefront", "checkout-api"],
  recommended: ["executor", "reviewer"],
  rows: [
    {
      roleId: "executor",
      type: "new",
      module: "storefront",
      writes: "src/owned-executor/; test/owned-executor/",
      contract: "docs/contracts/storefront-v1.md",
      testSurface: "test/owned-executor/",
      dependsOn: "无",
      parallelGroup: "map-a",
      group: "交付",
    },
    {
      roleId: "reviewer",
      type: "new",
      module: "checkout-api",
      writes: "src/owned-reviewer/; test/owned-reviewer/",
      contract: "docs/contracts/checkout-v1.md",
      testSurface: "test/owned-reviewer/",
      dependsOn: "无",
      parallelGroup: "map-a",
      group: "交付",
    },
    {
      roleId: "tester",
      type: "existing",
      module: "reduce",
      writes: "test/测试/; docs/verification/",
      contract: "docs/contracts/storefront-v1.md（消费）",
      testSurface: "test/测试/（集成/e2e）",
      deps: "依赖全部 Map 角色",
      dependsOn: "executor, reviewer",
      parallelGroup: "reduce",
      group: "测试",
      apiSpec: "not-applicable（Reduce 角色不导出产品接口）",
    },
  ],
});

async function seedDispatchProject(root: string): Promise<void> {
  seedTrioProject(root, [...ROLE_IDS]);
  write(root, FLOW_REL, MAP_FLOW_PENDING);
  write(root, TEAM_PLAN_REL, TEAM_PLAN);
  write(root, CRITERIA_REL, acceptanceCriteriaDoc(FLOW));
  await seedLedger(root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: [...ROLE_IDS],
      artifactPath: TEAM_PLAN_REL,
    },
  ]);
}

test("r1 Map 组并行派发 + Reduce 等全部 Map done + dependsOn 硬前置", async () => {
  const temp = makeRoot("mapreduce-dispatch");
  await seedDispatchProject(temp.root);
  const h = await makeHarness({ tag: "mapreduce-dispatch", root: temp.root, approval: true, decision: true });
  try {
    await h.open("convener");
    const caps = h.capsByRole.get("convener");
    assert.ok(caps?.dispatchTask, "Convener 应注入 dispatch_task");

    // ① 同一 map-a 组的两个角色互不依赖：两次派发都直接受理（可并行）。
    const storefront = (await caps!.dispatchTask!({ roleId: "executor", task: "Map A 交付 storefront", flowId: FLOW, stepId: "delivery-storefront" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(storefront.ok, true, storefront.message);
    const checkout = (await caps!.dispatchTask!({ roleId: "reviewer", task: "Map A 交付 checkout-api", flowId: FLOW, stepId: "delivery-checkout-api" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(checkout.ok, true, checkout.message);

    // ② Reduce 在 Map 交付 done 之前被拒（dependsOn 硬前置；不写账本、不等于「已派发」）。
    const early = (await caps!.dispatchTask!({ roleId: "tester", task: "测试分片（过早）", flowId: FLOW, stepId: "test-map-shards" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(early.ok, false, "Map 未完成时 Reduce 不得被派发");
    assert.match(early.message, /前置依赖尚未全部 done/);
    assert.match(early.message, /delivery-storefront/);
    assert.match(early.message, /delivery-checkout-api/);
    let ledger = await h.waitForLedger(() => true);
    assert.equal(
      ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "test-map-shards"),
      false,
      "被拒的 Reduce 派发不得写账本",
    );

    // ③ Map 交付 done 后，Reduce 派发受理；账本顺序证明先 Map 后 Reduce。
    write(temp.root, FLOW_REL, MAP_FLOW_DONE);
    const reduce = (await caps!.dispatchTask!({ roleId: "tester", task: "Map 测试分片（全部 Map done）", flowId: FLOW, stepId: "test-map-shards" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(reduce.ok, true, reduce.message);
    ledger = await h.waitForLedger(
      (entries) => entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "test-map-shards"),
      5000,
    );
    const ids = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted").map((entry) => entry.stepId);
    assert.deepEqual(ids.slice(-3), ["delivery-storefront", "delivery-checkout-api", "test-map-shards"]);
    await h.waitFor(
      () => ROLE_IDS.every((roleId) => h.openRoles.includes(roleId)),
      5000,
    );
    for (const roleId of ROLE_IDS) {
      assert.equal(h.openRoles.filter((id) => id === roleId).length, 1, `${roleId} 派发恰打开一次会话`);
    }
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("r2 同 Map 组依赖：团队计划与 flow 两条路径都拒绝", () => {
  const plan = parseTeamPlan(
    teamPlanV2Doc(FLOW, {
      modules: ["storefront", "checkout-api"],
      recommended: ["executor"],
      rows: [
        { roleId: "executor", type: "new", module: "storefront", writes: "src/owned-executor/; test/owned-executor/", contract: "docs/contracts/storefront-v1.md", testSurface: "test/owned-executor/", dependsOn: "无", parallelGroup: "map-a", group: "交付" },
        { roleId: "reviewer", type: "new", module: "checkout-api", writes: "src/owned-reviewer/; test/owned-reviewer/", contract: "docs/contracts/checkout-v1.md", testSurface: "test/owned-reviewer/", dependsOn: "executor", parallelGroup: "map-a", group: "交付" },
        { roleId: "tester", type: "existing", module: "reduce", writes: "test/测试/", contract: "docs/contracts/storefront-v1.md（消费）", testSurface: "test/测试/（集成/e2e）", deps: "依赖全部 Map", dependsOn: "executor, reviewer", parallelGroup: "reduce", group: "测试", apiSpec: "not-applicable（Reduce 不导出接口）" },
      ],
    }),
    { flowId: FLOW },
  );
  assert.equal(plan.ok, false);
  assert.ok(teamPlanIssueMessages(plan).some((message) => /同一 map-a 组内的角色 .* 之间存在依赖路径/.test(message)));

  const flow = parseFlowStateYaml(
    flowDoc(FLOW, [
      { id: "contract-freeze", owner: "rapporteur", kind: "artifact", status: "done", evidence: { kind: "artifact", ref: "docs/contracts/storefront-v1.md" } },
      { id: "delivery-storefront", owner: "executor", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze"] },
      { id: "delivery-checkout-api", owner: "reviewer", kind: "dispatch", status: "pending", parallelGroup: "map-a", dependsOn: ["contract-freeze", "delivery-storefront"] },
      { id: "integration-e2e", owner: "tester", kind: "dispatch", status: "pending", parallelGroup: "reduce", dependsOn: ["delivery-storefront", "delivery-checkout-api"] },
      { id: "verification", kind: "acceptance", status: "pending" },
    ]),
    FLOW,
  );
  assert.equal(flow.ok, false);
  assert.match(flow.ok ? "" : flow.error, /同一 map-a 组内的步骤 .* 之间存在依赖路径/);
});

test("r3 legacy 不变：无 parallelGroup/dependsOn 的旧 flow 不新增前置检查；FLOW_STEP_KINDS 仍四值", async () => {
  assert.deepEqual([...FLOW_STEP_KINDS], ["dispatch", "customer-decision", "artifact", "acceptance"], "不新增 FlowStepKind");
  const legacyFlow = flowDoc(FLOW, [
    { id: "previous", status: "pending" },
    { id: "impl", status: "pending" },
  ]);
  const parsed = parseFlowStateYaml(legacyFlow, FLOW);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  assert.equal(parsed.ok && parsed.flow.steps.every((step) => step.parallelGroup === undefined && step.dependsOn === undefined), true);

  const temp = makeRoot("mapreduce-legacy");
  seedTrioProject(temp.root, ["executor"]);
  write(temp.root, FLOW_REL, legacyFlow);
  write(temp.root, CRITERIA_REL, acceptanceCriteriaDoc(FLOW));
  await seedLedger(temp.root, [
    { decisionKind: "proposal-accept", customerDecision: "accepted", actorRoleId: "rapporteur", power: "proposal" },
    {
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: ["executor"],
    },
  ]);
  const h = await makeHarness({ tag: "mapreduce-legacy", root: temp.root, approval: true, decision: true });
  try {
    await h.open("convener");
    const caps = h.capsByRole.get("convener");
    const receipt = (await caps!.dispatchTask!({ roleId: "executor", task: "旧 flow 步骤", flowId: FLOW, stepId: "impl" })) as {
      ok: boolean;
      message: string;
    };
    assert.equal(receipt.ok, true, `旧 flow 无 dependsOn ⇒ 不因 previous 未 done 而拒绝：${receipt.message}`);
    assert.doesNotMatch(receipt.message, /前置依赖/);
  } finally {
    await h.stop();
    h.cleanup();
    temp.cleanup();
  }
});

test("r4 Provider 口径：v2 初始 flow YAML 携带 parallelGroup/dependsOn 可解析，不需要 flow_step_supersede 扩参", () => {
  const parsed = parseFlowStateYaml(MAP_FLOW_PENDING, FLOW);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  const delivery = parsed.flow.steps.find((step) => step.id === "delivery-storefront")!;
  assert.equal(delivery.parallelGroup, "map-a");
  assert.deepEqual(delivery.dependsOn, ["contract-freeze"]);
  const reduce = parsed.flow.steps.find((step) => step.id === "test-map-shards")!;
  assert.equal(reduce.parallelGroup, "reduce");
  assert.deepEqual(reduce.dependsOn, ["delivery-storefront", "delivery-checkout-api"]);
  // 本轮 Provider 口径：不新增/不扩展 flow_step_supersede 参数，flow_get 文本投影不渲染两字段；
  // 初始 flow 由 Convener 写 YAML 携带即可（服务层类型/视图/序列化已支持，见 test/编排）。
});

// —————————————————————— 测试分片隔离（测试角色自身 MapReduce 协议） ——————————————————————

interface ShardRun {
  exitCode: number | null;
  logPath: string;
  outPath: string;
}

function runShard(shardDir: string, script: string, logPath: string, outPath: string): Promise<ShardRun> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: shardDir,
      env: { ...process.env, SHARD_LOG: logPath, SHARD_OUT: outPath },
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("close", (code) => resolve({ exitCode: code, logPath, outPath }));
  });
}

test("r5 测试分片独立根/日志/输出、失败隔离、只重跑失败分片、manifest 合并", async () => {
  const temp = makeRoot("mapreduce-shards");
  try {
    const shardA = path.join(temp.root, "shard-a");
    const shardB = path.join(temp.root, "shard-b");
    for (const dir of [shardA, shardB]) mkdirSync(path.join(dir, "out"), { recursive: true });
    const logA = path.join(shardA, "map-a.log");
    const logB = path.join(shardB, "map-b.log");
    const outA = path.join(shardA, "out", "result.txt");
    const outB = path.join(shardB, "out", "result.txt");

    const scriptA = path.join(shardA, "run.mjs");
    const scriptBPassing = [
      'import fs from "node:fs";',
      'fs.writeFileSync(process.env.SHARD_LOG, "SHARD=b cwd=" + process.cwd() + "\\nRESULT=pass\\n");',
      'fs.writeFileSync(process.env.SHARD_OUT, "b-pass\\n");',
      "process.exit(0);",
      "",
    ].join("\n");
    const scriptBFailing = [
      'import fs from "node:fs";',
      'fs.writeFileSync(process.env.SHARD_LOG, "SHARD=b cwd=" + process.cwd() + "\\nRESULT=fail\\nError: fixture assertion failed\\n");',
      'fs.writeFileSync(process.env.SHARD_OUT, "b-fail\\n");',
      "process.exit(1);",
      "",
    ].join("\n");
    writeFileSync(
      scriptA,
      [
        'import fs from "node:fs";',
        'fs.writeFileSync(process.env.SHARD_LOG, "SHARD=a cwd=" + process.cwd() + "\\nRESULT=pass\\n");',
        'fs.writeFileSync(process.env.SHARD_OUT, "a-pass\\n");',
        "process.exit(0);",
        "",
      ].join("\n"),
    );
    const scriptB = path.join(shardB, "run.mjs");
    writeFileSync(scriptB, scriptBFailing);

    // 共享只读夹具 pin 哈希（本测试文件 + fixture.ts）；分片前后必须一致。
    const sharedFixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture.ts");
    const hashOf = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");
    const fixtureHashBefore = hashOf(sharedFixture);

    // ① 两个分片并发：独立 cwd/输出/日志；B 失败不阻塞 A。
    const [runA, runBFail] = await Promise.all([
      runShard(shardA, scriptA, logA, outA),
      runShard(shardB, scriptB, logB, outB),
    ]);
    assert.equal(runA.exitCode, 0, "A 分片应独立通过");
    assert.notEqual(runBFail.exitCode, 0, "B 分片应失败");
    const textA = readFileSync(logA, "utf8");
    const textB = readFileSync(logB, "utf8");
    assert.match(textA, /SHARD=a/);
    assert.doesNotMatch(textA, /SHARD=b/, "日志不得串写");
    assert.match(textB, /SHARD=b/);
    assert.match(textB, /RESULT=fail/);
    assert.match(textB, /fixture assertion failed/);
    assert.equal(readFileSync(outA, "utf8").trim(), "a-pass");
    assert.equal(readFileSync(outB, "utf8").trim(), "b-fail");
    const logAStatBefore = statSync(logA).mtimeMs;

    // ② 失败隔离：只重跑 B（修复后），A 的日志/输出不被重写或追加。
    writeFileSync(scriptB, scriptBPassing);
    const runBPass = await runShard(shardB, scriptB, logB, outB);
    assert.equal(runBPass.exitCode, 0, "修复后只重跑 B 应通过");
    assert.equal(statSync(logA).mtimeMs, logAStatBefore, "只重跑失败分片：A 日志 mtime 不变");
    assert.equal(readFileSync(outA, "utf8").trim(), "a-pass");
    assert.match(readFileSync(logB, "utf8"), /RESULT=pass/);

    // ③ 共享只读夹具 pin 哈希前后一致；manifest 是索引，原始日志单独保留。
    assert.equal(hashOf(sharedFixture), fixtureHashBefore, "共享只读夹具哈希在分片执行前后一致");
    const manifestPath = path.join(temp.root, "manifest.md");
    writeFileSync(
      manifestPath,
      [
        "---",
        `flowId: ${FLOW}`,
        `candidate: fixture-candidate`,
        `sharedFixtureSha256: ${fixtureHashBefore}`,
        "---",
        "",
        "# MapReduce 证据",
        "",
        "## Map 分片",
        "| module | command | log | result |",
        "| --- | --- | --- | --- |",
        `| map-a | node shard-a/run.mjs | ${path.relative(temp.root, logA)} | pass |`,
        `| map-b | node shard-b/run.mjs | ${path.relative(temp.root, logB)} | pass（重跑后） |`,
        "",
      ].join("\n"),
    );
    const manifest = readFileSync(manifestPath, "utf8");
    assert.match(manifest, /sharedFixtureSha256: [0-9a-f]{64}/);
    assert.match(manifest, /map-a/);
    assert.match(manifest, /map-b/);
    assert.doesNotMatch(manifest, /fixture assertion failed/, "manifest 不替代原始日志（失败原文只在分片日志）");
    assert.match(readFileSync(logB, "utf8"), /RESULT=pass/);
  } finally {
    temp.cleanup();
  }
});
