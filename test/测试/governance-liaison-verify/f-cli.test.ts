// test/测试/governance-liaison-verify/f-cli.test.ts
// 独立端到端验收（测试角色，2026-10-18）：AC21 —— CLI 收窄。
//
// 评审口径（四角色评审 §4.6/§十 AC21）：
//   · `ans govern --function liaison` 必须**明确拒绝**（Liaison 仅桌面主入口提供；CLI 单进程没有
//     跨会话后台交接通道）；
//   · `proposal|nomination|schedule` 行为不变；`ans role run` 不受影响。
//
// 本用例按**已批准的评审口径**断言；实现若已由后续任务书放开（源码注释如此声称），本用例会红——
// 这是规范偏差，必须在验收报告中由 PM 裁定，不得静默放宽本断言。

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseGovernArgs } from "../../../src/common/编排/args.ts";

test("AC21：ans govern 的 --function 仍只接受 proposal|nomination|schedule，liaison 明确拒绝", () => {
  const liaison = parseGovernArgs(["--function", "liaison"]);
  assert.ok(liaison.errors.length > 0, "`--function liaison` 应按评审 §4.6 被拒（CLI 不提供 Liaison）");
  assert.match(liaison.errors.join("\n"), /liaison/);
  assert.equal(liaison.function, undefined, "被拒的职能不得被采纳");

  for (const fn of ["proposal", "nomination", "schedule"] as const) {
    const parsed = parseGovernArgs(["--function", fn]);
    assert.deepEqual(parsed.errors, [], `${fn} 行为不变`);
    assert.equal(parsed.function, fn);
  }
});
