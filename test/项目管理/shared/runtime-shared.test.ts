// test/项目管理/shared/runtime-shared.test.ts
// 项目管理：对共享运行时原语 `src/common/shared/runtime-shared.ts` 的行为验证，并核对其与
// 各消费方**旧本地副本**在收敛窗口期内取值一致（`RuntimeKind` / `PI_CREDENTIAL_ENV_VARS` /
// `resolveSkillRoot`）。
//
// 隶属：共享组件测试（pm 属主）。

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  RUNTIME_KINDS,
  RUNTIME_LABELS,
  RUNTIME_LABEL_KEYS,
  DEFAULT_RUNTIME,
  PI_CREDENTIAL_ENV_VARS,
  RUNTIME_CREDENTIAL_ENV_VARS,
  resolveSkillRoot,
} from "../../../src/common/shared/runtime-shared.ts";
import { DEFAULT_LOCALE, translate } from "../../../src/common/shared/i18n/index.ts";

// 消费方旧副本（只读导入，用于一致性核对；改为从 shared 导入并删本地归 T21/T22/T24）。
import { RUNTIME_KINDS as 编排RUNTIME_KINDS } from "../../../src/common/编排/args.ts";
import {
  RUNTIME_VALUES,
  DEFAULT_RUNTIME as 装配DEFAULT_RUNTIME,
  PI_CREDENTIAL_ENV_VARS as 装配PI_CREDENTIAL_ENV_VARS,
} from "../../../src/common/装配/runtime.ts";
import { PI_CREDENTIAL_ENV_VARS as piPI_CREDENTIAL_ENV_VARS } from "../../../src/provider/pi/tools.ts";
import { resolveSkillRoot as 桌面ResolveSkillRoot } from "../../../app/desktop/project.ts";

test("RuntimeKind 取值单一来源：shared 与编排旧副本一致", () => {
  assert.deepEqual([...RUNTIME_KINDS], [...编排RUNTIME_KINDS]);
  assert.deepEqual([...RUNTIME_KINDS], ["demo", "pi", "codex", "claude"]);
  // 2026-10-23 B4：demo 改为语言中性值；用户可见文案走 i18n key（见下一条测试）。
  assert.deepEqual(RUNTIME_KINDS.map((runtime) => RUNTIME_LABELS[runtime]), ["demo", "Pi", "Codex", "Claude"]);
  // 导出兼容：`RUNTIME_LABELS` 仍是覆盖全部 RuntimeKind 的只读字符串表，键集未变。
  assert.deepEqual(Object.keys(RUNTIME_LABELS).sort(), [...RUNTIME_KINDS].sort());
});

test("B4：demo 标签语言中性、显示文案只存在于 i18n 目录；Pi/Codex/Claude 品牌名不变", () => {
  assert.equal(RUNTIME_LABELS.demo, "demo");
  assert.equal(/\p{Script=Han}/u.test(RUNTIME_LABELS.demo), false, "demo 标签不得再含中文");
  assert.equal(RUNTIME_LABEL_KEYS.demo, "shared.runtimeSettings.runtime.demo");
  assert.equal(translate(DEFAULT_LOCALE, "shared.runtimeSettings.runtime.demo"), "演示");
  assert.equal(translate("en-US", "shared.runtimeSettings.runtime.demo"), "Demo");
  assert.deepEqual(
    { pi: RUNTIME_LABELS.pi, codex: RUNTIME_LABELS.codex, claude: RUNTIME_LABELS.claude },
    { pi: "Pi", codex: "Codex", claude: "Claude" },
    "品牌名不翻译",
  );
  for (const brand of ["pi", "codex", "claude"] as const) {
    assert.equal(RUNTIME_LABEL_KEYS[brand], null, `${brand}: 品牌名无 i18n key，直接使用 RUNTIME_LABELS`);
  }
});

test("RuntimeKind 取值单一来源：shared 与装配旧副本（RUNTIME_VALUES / DEFAULT_RUNTIME）一致", () => {
  assert.deepEqual([...RUNTIME_KINDS], [...RUNTIME_VALUES]);
  assert.equal(DEFAULT_RUNTIME, 装配DEFAULT_RUNTIME);
  assert.equal(DEFAULT_RUNTIME, "demo");
});

test("PI_CREDENTIAL_ENV_VARS：shared 与装配、Pi适配器两处旧副本**逐条相同**（安全相关，不得分叉）", () => {
  assert.deepEqual([...PI_CREDENTIAL_ENV_VARS], [...装配PI_CREDENTIAL_ENV_VARS]);
  assert.deepEqual([...PI_CREDENTIAL_ENV_VARS], [...piPI_CREDENTIAL_ENV_VARS]);
  assert.ok(PI_CREDENTIAL_ENV_VARS.length > 0);
  // 名单本身固定（任一处改动都应同时触发本断言失败，提醒核对剥离点）。
  assert.deepEqual(
    [...PI_CREDENTIAL_ENV_VARS],
    ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "PI_API_KEY"],
  );
});

test("resolveSkillRoot：优先 ANS_SKILL_ROOT（取非空值）", () => {
  assert.equal(resolveSkillRoot({ ANS_SKILL_ROOT: "/x/skill" }), "/x/skill");
});

test("跨引擎秘密键包含旧 Pi 凭据与 SDK CODEX_API_KEY，保持 Pi 旧名单兼容", () => {
  for (const key of PI_CREDENTIAL_ENV_VARS) assert.ok(RUNTIME_CREDENTIAL_ENV_VARS.includes(key));
  assert.ok(RUNTIME_CREDENTIAL_ENV_VARS.includes("CODEX_API_KEY"));
  assert.ok(RUNTIME_CREDENTIAL_ENV_VARS.includes("CODEX_ACCESS_TOKEN"));
  assert.ok(RUNTIME_CREDENTIAL_ENV_VARS.includes("CLAUDE_CODE_OAUTH_TOKEN"));
});

test("resolveSkillRoot：缺省回退默认技能目录，且与桌面旧副本同值", () => {
  const expectedTail = path.join(".claude", "skills", "ans-governed-construction");
  assert.equal(resolveSkillRoot({}), path.join(os.homedir(), expectedTail));
  assert.match(resolveSkillRoot({}), /ans-governed-construction$/);
  assert.equal(resolveSkillRoot({}), 桌面ResolveSkillRoot({}));
});

test("resolveSkillRoot：空串视为未设置（回退默认），与桌面旧副本同值", () => {
  assert.equal(resolveSkillRoot({ ANS_SKILL_ROOT: "" }), 桌面ResolveSkillRoot({ ANS_SKILL_ROOT: "" }));
  assert.match(resolveSkillRoot({ ANS_SKILL_ROOT: "" }), /ans-governed-construction$/);
});
