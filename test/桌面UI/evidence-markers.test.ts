// test/桌面UI/evidence-markers.test.ts
// 2026-10-30（3.4/P4.3）：验收/证据“未校验”与 mismatch 标识的数据源存在；不改 renderer。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { readSessionSource } from "../桌面应用/session-source.ts";

const SESSION = readSessionSource();
const EVIDENCE = fs.readFileSync(new URL("../../src/common/编排/evidence-check.ts", import.meta.url), "utf8");

test("验收 facts 暴露 unverified/legacy/evidenceMismatch；P0 不伪造通过", () => {
  assert.match(SESSION, /acceptanceFacts/);
  assert.match(SESSION, /evidenceMismatch/);
  assert.match(SESSION, /criteriaRef/);
  assert.match(EVIDENCE, /unverified/);
  assert.match(EVIDENCE, /p0Ignored/);
  assert.match(EVIDENCE, /evidence-mismatch/);
});
