// 门禁引擎测试：边界 YAML 文本校验公共入口（写前校验，2026-10-18 真机修复）
//
// 真机 bug：Nominator 写的 `角色卡/implementer/boundary.yaml` 用了 `version/roleId/root`
// 顶层键，而加载器只认 `role/entries/archived` ⇒ 整个边界解析失败、新角色未被枚举。
// 本文件钉住：
//  1. 逐字最小模板（卡文本给出的那份）通过，条目 path 规范化、root 缺省 project；
//  2. `version` / `roleId` / `root` 顶层键被拒，错误信息提示正确顶层键；
//  3. `archived` 布尔与归档标记仍按既有严格口径；
//  4. Nominator 卡文本确实含该模板与禁用键说明（模板与校验器同一口径）。
//
// 入口经 Service 公共出口消费；只读解析，不写盘、不读盘、临时目录也不需要。

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateBoundaryYamlText } from "../../src/service/boundary/resolve-boundary.ts";
import { governanceRoleOf } from "../../src/common/门禁引擎/governance-roles.ts";

const MINIMAL_TEMPLATE = [
  "role: <roleId>",
  "entries:",
  "  - kind: directory",
  "    path: bin/",
  "    purpose: 说明",
].join("\n");

test("合法最小模板：ok=true；path 规范化、root 缺省 project", () => {
  const r = validateBoundaryYamlText(MINIMAL_TEMPLATE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.entries.length, 1);
  assert.deepEqual(
    {
      root: r.entries[0].root,
      path: r.entries[0].path,
      kind: r.entries[0].kind,
      purpose: r.entries[0].purpose,
    },
    { root: "project", path: "bin", kind: "directory", purpose: "说明" },
  );
});

test("非法顶层键 version/roleId/root：ok=false，且提示正确顶层键", () => {
  const base = "entries:\n  - kind: directory\n    path: bin/\n    purpose: 说明\n";
  const cases: Array<[string, RegExp, RegExp]> = [
    [`version: 1\n${base}`, /version/, /role \/ entries \/ archived/],
    [`roleId: implementer\n${base}`, /roleId/, /`role:`/],
    [`root: project\n${base}`, /root/, /条目内 root 仅 conditional-directory 可选/],
  ];
  for (const [text, key, hint] of cases) {
    const r = validateBoundaryYamlText(text);
    assert.equal(r.ok, false, `${key} 应被拒`);
    if (!r.ok) {
      assert.match(r.message, key, `错误信息须点名 ${key}`);
      assert.match(r.message, hint, `错误信息须提示正确键`);
    }
  }
});

test("合法 role/entries + archived:true；archived 非布尔被拒", () => {
  const ok = validateBoundaryYamlText("role: x\nentries: []\narchived: true\n");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.entries.length, 0);
  const bad = validateBoundaryYamlText("entries: []\narchived: 'true'\n");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /archived 必须是布尔值/);
});

test("Nominator 卡文本：逐字最小模板 + 禁止 version/roleId/root 顶层键与条目 root:", () => {
  const t = governanceRoleOf("nominator")!.cardText;
  assert.ok(t.includes(MINIMAL_TEMPLATE), "卡文本必须含逐字最小模板");
  assert.match(t, /必须照抄/);
  for (const bad of ["version", "roleId", "root"]) {
    assert.match(t, new RegExp(`不得写[^\\n]*${bad}`), `卡文本须禁止顶层 ${bad}`);
  }
  assert.match(t, /条目内不要写 `root:`/);
  assert.match(t, /普通 `kind: file` \/ `kind: directory` 不写/);
});
