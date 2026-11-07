// test/gates/api-contract.test.ts
// 门 API 冻结面测试（E0.3 §5.1/§5.3/§5.4；B1 E0.4/E1.7）。
//
// 冻结声明（变更走接口评审）：
// - 唯一 public entry `src/common/gates/index.ts`，导出 5 个符号：
//   `DispatchParentHostFacts` / `DispatchParentCoreFacts` / `DispatchParentReason` /
//   `DispatchParentDecision` / `evaluateChiefDispatchParent`；
// - reason 为 18 项闭集；
// - 输入/输出形状固定在类型层断言（编译期失败即契约漂移）；
// - 模块只 import Model public 类型，不 import 角色/引擎/私有 common，不导出内部 helper。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateChiefDispatchParent,
  type DispatchParentCoreFacts,
  type DispatchParentDecision,
  type DispatchParentHostFacts,
  type DispatchParentReason,
} from "../../src/common/gates/index.ts";
import type {
  RuntimeInputProvenanceV1,
  RuntimeSessionLifecycleFacts,
  RuntimeSessionToolSurfaceFacts,
} from "../../src/model/runtime.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

// ———— 类型层：reason 18 项闭集（与 E0.3 §5.3 表一致；顺序不参与类型） ————
type ExpectedReason =
  | "evidence-missing"
  | "disposed"
  | "not-default-core"
  | "evidence-identity-mismatch"
  | "wrong-runtime"
  | "tool-surface-unknown"
  | "custom-factory"
  | "application-mediation-ambiguous"
  | "application-mediation-unverified"
  | "native-builtin-present"
  | "registry-mismatch"
  | "turn-mismatch"
  | "stopped"
  | "no-active-dispatch"
  | "input-not-accepted"
  | "turn-settled"
  | "creator-reports-mismatch"
  | "parent-kind-invalid";
type _ReasonClosed = Expect<Equal<DispatchParentReason, ExpectedReason>>;

// ———— 类型层：输入/输出形状冻结（E0.3 §5.1） ————
type ExpectedHost = {
  parent: {
    roleId: "chief";
    runtime: DispatchParentHostFacts["parent"]["runtime"];
    sessionId: string;
    turnId: string;
    clientMessageId?: string;
    kind?: string;
    inputAccepted: true;
    settled: false;
  };
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[];
};
type _HostExact = Expect<Equal<DispatchParentHostFacts, ExpectedHost>>;
type _CoreKeys = Expect<Equal<keyof DispatchParentCoreFacts, "disposed" | "construction" | "roleId" | "runtime" | "lifecycle" | "toolSurface" | "turnInput">>;
type _CoreLifecycleIsModel = Expect<Equal<DispatchParentCoreFacts["lifecycle"], RuntimeSessionLifecycleFacts | undefined>>;
type _CoreToolSurfaceIsModel = Expect<Equal<DispatchParentCoreFacts["toolSurface"], RuntimeSessionToolSurfaceFacts | undefined>>;
type _CoreTurnInput = Expect<Equal<NonNullable<DispatchParentCoreFacts["turnInput"]>, { turnId: string; provenance?: RuntimeInputProvenanceV1 }>>;
type _DecisionExact = Expect<Equal<DispatchParentDecision, { ok: true } | { ok: false; reasons: readonly DispatchParentReason[] }>>;
type _ApiFrozen = Expect<Equal<typeof evaluateChiefDispatchParent,
  (input: { host: DispatchParentHostFacts; core: DispatchParentCoreFacts | undefined; hub: boolean }) => DispatchParentDecision>>;

test("API 冻结：唯一 public entry 只导出契约符号（类型 + 唯一函数），不导出内部 helper", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "src/common/gates/index.ts"), "utf8");
  const exported = [...source.matchAll(/^export\s+(?:interface|type|function)\s+([A-Za-z0-9_]+)/gm)].map(match => match[1]);
  assert.deepEqual(exported, [
    "DispatchParentHostFacts",
    "DispatchParentCoreFacts",
    "DispatchParentReason",
    "DispatchParentDecision",
    "evaluateChiefDispatchParent",
  ], "导出面与 E0.3 §5.1 逐项一致");
  assert.ok(!/^export\s+(?:default|const|let|var|class|enum|\*|\{)/m.test(source), "无额外 runtime 导出 / re-export / default export");
  assert.equal((source.match(/^export function evaluateChiefDispatchParent/gm) ?? []).length, 1, "唯一导出函数");
});

test("API 冻结：reason 结构由类型层断言（18 项闭集）+ 运行期无闭集外取值", async () => {
  // 类型层断言在编译期执行（`npm run typecheck` 会检查本文件）；这里做一个运行期冒烟，
  // 确保调用形状（host/core/hub）与返回值判别字段（ok/reasons）可用。
  const decision = evaluateChiefDispatchParent({ host: undefined as unknown as DispatchParentHostFacts, core: undefined, hub: true });
  assert.deepEqual(decision, { ok: false, reasons: ["evidence-missing"] });
  const source = await fs.readFile(path.join(REPO_ROOT, "src/common/gates/index.ts"), "utf8");
  const declared = source.slice(source.indexOf("export type DispatchParentReason"), source.indexOf("export type DispatchParentDecision"));
  const reasons = [...declared.matchAll(/\|\s*"([a-z-]+)"/g)].map(match => match[1]);
  assert.equal(reasons.length, 18, "reason 联合声明 18 项");
  assert.equal(new Set(reasons).size, 18, "reason 无重复");
});

test("API 冻结：模块是纯判定（无 I/O/时钟/随机数/环境读取），不 import 角色/引擎/私有 common", async () => {
  const source = await fs.readFile(path.join(REPO_ROOT, "src/common/gates/index.ts"), "utf8");
  const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(specifiers)], ["../../model/runtime.ts"], "import 面只有 Model public entry");
  for (const forbidden of [/\bnode:fs\b/, /\bnode:child_process\b/, /\bMath\.random\b/, /\bDate\.now\b/, /\bnew Date\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\bprocess\.env\b/, /\bfetch\s*\(/]) {
    assert.ok(!forbidden.test(source), `不得出现 ${forbidden}`);
  }
});
