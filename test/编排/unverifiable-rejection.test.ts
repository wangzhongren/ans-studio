// test/编排/unverifiable-rejection.test.ts
// 2026-11-04（客户直修：自动决策升级）：isUnverifiableRejectionCode 单一来源分类器。
//
// 语义：物证/验收标准缺失、不可读或互相不一致 ⇒「无法核对」，不是「不合格」。
// 桌面自动决策必须把这类 manual 结果原样呈现客户卡（附原因），不得自动拒绝退回；
// judge 的 fail-closed 方向不变（无物证绝不 approve）。
import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalRejectionCode,
  isUnverifiableRejectionCode,
  rejectionMapSnapshot,
} from "../../src/common/编排/mechanical-rejection.ts";

test("「无法核对」类 code：必须升级客户确认，不得自动拒绝", () => {
  const unverifiable = [
    "artifact-missing",
    "artifact-not-read",
    "criteria-ref-mismatch",
    "criteria-missing",
    "criteria-parse-failed",
    "evidence-mismatch",
    "evidence-path-invalid",
    "evidence-packet-missing",
    "evidence-packet-overflow",
    "evidence-conflict",
    "evidence-hash-mismatch",
    "context-missing",
    "download-facts-missing",
  ];
  for (const code of unverifiable) {
    assert.equal(
      isUnverifiableRejectionCode(code),
      true,
      `${code} 属于「无法核对」：自动决策应原样转客户卡并附原因，不得自动拒绝，也不得自动放行`,
    );
  }
});

test("非「无法核对」类 code：维持既有行为，不被本次直修误升级", () => {
  const verifiableOrOperational = [
    "timeout",
    "parse-failed",
    "aborted",
    "insufficient-evidence",
    "path-outside-boundary",
    "path-unverified",
    "model-manual",
    "switch-off",
    "not-recommended",
    "download-declined",
    "download-unsafe-url",
    "",
    "unknown-code-xyz",
  ];
  for (const code of verifiableOrOperational) {
    assert.equal(
      isUnverifiableRejectionCode(code),
      false,
      `${code === "" ? "空串" : code} 不属「无法核对」：不得改变其既有结算路径（白名单之外一律维持旧行为）`,
    );
  }
});

test("漂移守卫：RULES 中全部 criteria-* 码与核实物证码必须已在分类器内", () => {
  for (const { code } of rejectionMapSnapshot()) {
    if (code.startsWith("criteria-")) {
      assert.equal(
        isUnverifiableRejectionCode(code),
        true,
        `RULES 中的 ${code} 是验收标准核对码，新增同类 code 时必须同步加入 UNVERIFIABLE_REJECTION_CODES`,
      );
    }
  }
  for (const code of ["artifact-missing", "artifact-not-read", "evidence-mismatch", "evidence-path-invalid"]) {
    assert.equal(
      isUnverifiableRejectionCode(code),
      true,
      `${code} 是核实物证码，必须升级客户确认而不是自动拒绝`,
    );
  }
});

test("旧别名兼容：分类器先 canonical 化，现有别名映射到非核对类即维持 false", () => {
  const legacyCodes = [
    "M2_ROSTER_INVALID",
    "M5_TARGET_CARD_MISSING",
    "M6_MODULE_OWNER_MISMATCH",
    "APPOINTMENT_ROOT_MISSING",
    "PATH_OUTSIDE_BOUNDARY",
  ];
  for (const legacy of legacyCodes) {
    const canonical = canonicalRejectionCode(legacy);
    assert.equal(
      isUnverifiableRejectionCode(legacy),
      false,
      `${legacy}（→ ${canonical}）目前不属「无法核对」，不得被误升级为转客户确认`,
    );
    // 分类器与 canonical 化结果保持一致：将来若某别名改映射到核对类码，分类器自动生效。
    assert.equal(
      isUnverifiableRejectionCode(legacy),
      isUnverifiableRejectionCode(canonical),
      `分类器必须先 canonical 化再判断：${legacy} 与 ${canonical} 结果应一致`,
    );
  }
});
