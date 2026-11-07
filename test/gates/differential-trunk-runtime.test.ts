// test/gates/differential-trunk-runtime.test.ts
// X-G 金样差分：门控模块判定 vs 已冻结金样（原 oracle = P1 D-minimal 内联实现）。
//
// 依据：E2 检查单 §4.5 / G9 / B3（删除旧实现前先冻结金样、再改 import；不得删断言/删覆盖）；
// E0.3 §5/§10.2 D7（行为等价、reason 逐项一致）；团队计划 §6.5/§7.5。
//
// 金样：`test/gates/fixtures/dispatch-parent-golden.ts` —— 由
// `src/pipeline/orchestration/trunk-runtime.ts::evaluateChiefDispatchParent`（生成时
// SHA-256 `9453a43f…`）对 `test/gates/fixtures.ts::differentialScenarios()` 逐场景 ×
// hub ∈ {true,false} 生成（134 场景 / 268 比较 / 差异 0），生成时 gates 侧复核差异亦为 0。
//
// 本测试只 import gates + 金样 + 场景夹具，**不 import trunk-runtime**；内联实现删除后
// 本测试仍可运行（X-G 目的）。判定：每次求值比较 `ok` 与 `reasons`（逐项/顺序），任一
// 不匹配即失败；金样缺项/多项同样失败。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateChiefDispatchParent as gatesEvaluate } from "../../src/common/gates/index.ts";
import {
  DISPATCH_PARENT_GOLDEN,
  DISPATCH_PARENT_GOLDEN_META,
  type DispatchParentGoldenCase,
} from "./fixtures/dispatch-parent-golden.ts";
import { differentialScenarios } from "./fixtures.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HUB_VALUES = [true, false] as const;
/** 场景标签（与 `test/gates/fixtures.ts::scenarioLabel` 及金样生成器同格式）。 */
const label = (name: string, hub: boolean): string => `${name} [hub=${hub}]`;
/** reason 闭集（E0.3 §5.3；与 `src/common/gates/index.ts` 的 `DispatchParentReason` 逐项一致）。 */
const CLOSED_REASONS = new Set<string>([
  "evidence-missing",
  "disposed",
  "not-default-core",
  "evidence-identity-mismatch",
  "wrong-runtime",
  "tool-surface-unknown",
  "custom-factory",
  "application-mediation-ambiguous",
  "application-mediation-unverified",
  "native-builtin-present",
  "registry-mismatch",
  "turn-mismatch",
  "stopped",
  "no-active-dispatch",
  "input-not-accepted",
  "turn-settled",
  "creator-reports-mismatch",
  "parent-kind-invalid",
]);

interface Difference {
  readonly scenario: string;
  readonly gates: unknown;
  readonly golden: unknown;
}

test("金样差分：gates 模块与冻结金样逐字段/逐 reason/顺序一致（差异 = 0）", () => {
  const scenarios = differentialScenarios();
  const golden = new Map<string, DispatchParentGoldenCase>();
  for (const entry of DISPATCH_PARENT_GOLDEN) {
    const key = label(entry.scenario, entry.hub);
    assert.ok(!golden.has(key), `金样重复条目：${key}`);
    golden.set(key, entry);
  }
  assert.equal(DISPATCH_PARENT_GOLDEN_META.scenarios, scenarios.length, "金样元数据场景数与夹具一致");
  assert.equal(DISPATCH_PARENT_GOLDEN.length, DISPATCH_PARENT_GOLDEN_META.comparisons, "金样条目数 = 元数据比较数");

  const differences: Difference[] = [];
  let comparisons = 0;
  for (const scenario of scenarios) {
    for (const hub of HUB_VALUES) {
      comparisons++;
      const key = label(scenario.name, hub);
      const expected = golden.get(key);
      if (!expected) {
        differences.push({ scenario: key, gates: "(missing golden entry)", golden: undefined });
        continue;
      }
      golden.delete(key);
      const decision = gatesEvaluate({ host: scenario.host, core: scenario.core, hub });
      const same = decision.ok === expected.ok
        && (decision.ok
          ? expected.reasons.length === 0
          : decision.reasons.length === expected.reasons.length
            && decision.reasons.every((reason, index) => reason === expected.reasons[index]));
      if (!same) differences.push({ scenario: key, gates: decision, golden: expected });
    }
  }

  assert.deepEqual(differences, [], `预期零差异；实际差异见上（${differences.length} 条）`);
  assert.deepEqual([...golden.keys()], [], `金样存在无对应场景/ hub 的多余条目（${golden.size} 条）`);
  assert.ok(scenarios.length >= 100, `场景数不少于 100（实际 ${scenarios.length}）`);
  assert.ok(comparisons >= 200, `比较次数不少于 200（实际 ${comparisons}）`);
  assert.equal(comparisons, DISPATCH_PARENT_GOLDEN.length, "比较次数 = 冻结金样条目数");
  console.log(`differential(gates vs frozen golden): scenarios=${scenarios.length} comparisons=${comparisons} differences=${differences.length}`);
});

test("金样：来源元数据自洽，且测试/金样不再 import P1 内联 oracle（E2 可删内联实现）", async () => {
  // 来源元数据（生成时冻结的 oracle/gates/fixtures 身份；重新生成须经接口评审并更新证据）。
  assert.equal(DISPATCH_PARENT_GOLDEN_META.schema, "dispatch-parent-golden/v1");
  assert.equal(DISPATCH_PARENT_GOLDEN_META.oracle, "src/pipeline/orchestration/trunk-runtime.ts::evaluateChiefDispatchParent");
  assert.deepEqual([...DISPATCH_PARENT_GOLDEN_META.hubValues], [true, false]);
  assert.equal(DISPATCH_PARENT_GOLDEN.length, DISPATCH_PARENT_GOLDEN_META.scenarios * DISPATCH_PARENT_GOLDEN_META.hubValues.length);
  for (const [file, hash] of Object.entries(DISPATCH_PARENT_GOLDEN_META.sources)) {
    assert.match(hash, /^[0-9a-f]{64}$/, `${file} 来源哈希格式`);
  }

  // 结构不变量：ok ⇒ reasons 为空；拒绝 ⇒ reasons 非空且全部落在 18 项闭集内。
  for (const entry of DISPATCH_PARENT_GOLDEN) {
    const key = label(entry.scenario, entry.hub);
    if (entry.ok) {
      assert.deepEqual([...entry.reasons], [], `${key}: 通过项不得携带 reason`);
    } else {
      assert.ok(entry.reasons.length > 0, `${key}: 拒绝项必须至少 1 个 reason`);
      for (const reason of entry.reasons) assert.ok(CLOSED_REASONS.has(reason), `${key}: ${reason} 在 18 项闭集外`);
    }
  }

  // E2 脱离 oracle：本测试与金样源文件均不得 import/reference trunk-runtime。
  for (const file of ["test/gates/differential-trunk-runtime.test.ts", "test/gates/fixtures/dispatch-parent-golden.ts"]) {
    const source = await fs.readFile(path.join(REPO_ROOT, file), "utf8");
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]!);
    assert.ok(!specifiers.some(specifier => specifier.includes("trunk-runtime")), `${file} 不得 import trunk-runtime`);
  }
});
