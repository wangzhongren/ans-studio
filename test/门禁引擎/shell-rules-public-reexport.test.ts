// 门禁引擎测试：shell 规则集**公开再导出**（`src/service/gate/shell-rules.ts`）
//
// 目的：编排 I-1 的 shell 闸 (c) 层经 `src/service/gate/` 的公开出口注入 `classifyShell` /
// `defaultShellRules`（编排不导入本角色私有 `common/`，§6）。本文件证明公开出口与私有源**同源**
// （引用同一性）且可用——单一来源仍是 `src/common/门禁引擎/classify-shell.ts`，公开文件只逐字转出。
//
// （测试可读引用私有模块作对照；**生产消费者**只可用公开出口。）

import { test } from "node:test";
import assert from "node:assert/strict";

// 公开出口（被测）
import { classifyShell, defaultShellRules, matchRoutineShellCommand } from "../../src/service/gate/shell-rules.ts";
// 私有源（同源性对照）
import * as priv from "../../src/common/门禁引擎/classify-shell.ts";
import type { ShellClass } from "../../src/model/decision.ts";

const FOUR_STATES: ShellClass[] = ["allow", "deny", "risky", "review"];

test("公开再导出与私有源同源：三符号均为同一函数引用（逐字转出，非复制实现）", () => {
  assert.equal(classifyShell, priv.classifyShell, "classifyShell 必须是同一函数引用（再导出）");
  assert.equal(defaultShellRules, priv.defaultShellRules, "defaultShellRules 必须是同一函数引用（再导出）");
  // 2026-10-31（方案 v1.3 §5.3）：例行白名单谓词经 Service 公开出口再导出——B1 委托策略的合法导入源。
  assert.equal(
    matchRoutineShellCommand,
    priv.matchRoutineShellCommand,
    "matchRoutineShellCommand 必须是同一函数引用（再导出，不复制实现/不另立规则集）",
  );
});

test("公开出口可用冒烟：matchRoutineShellCommand 经公开入口命中 §5.1 精确形态", () => {
  assert.deepEqual(matchRoutineShellCommand(["npm", "test"]), { id: "npm-test" });
  assert.deepEqual(matchRoutineShellCommand(["npm", "run", "typecheck"]), { id: "npm-run-typecheck" });
  assert.deepEqual(matchRoutineShellCommand(["node", "--test", "test/a.test.ts"]), { id: "node-test" });
  assert.equal(matchRoutineShellCommand(["npm", "install"]), undefined);
});

test("公开入口可用冒烟：classifyShell(argv, defaultShellRules()) 恒返回四态之一，且样本覆盖多种判定", () => {
  const rules = defaultShellRules();
  const SAMPLE: string[][] = [["ls"], ["git", "status"], ["rm", "-rf", "/tmp/x"], ["sh", "-c", "echo hi"]];
  const seen = new Set<ShellClass>();
  for (const argv of SAMPLE) {
    const d = classifyShell(argv, rules);
    assert.ok(FOUR_STATES.includes(d), `${argv.join(" ")} 应返回四态之一，实得 ${String(d)}`);
    // 与私有源同输入同输出（转出未引入包装层）
    assert.equal(d, priv.classifyShell(argv, rules), `${argv.join(" ")} 公开/私有输出应一致`);
    seen.add(d);
  }
  assert.ok(seen.size >= 2, `冒烟样本应覆盖多种判定（实得：${[...seen].join(",")}）`);
});
