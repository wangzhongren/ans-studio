// B2 证据脚本：rapporteur 模块 legacy 面指纹（before/after 对比用）。
// 只读导入模块 public entry 与差分 fixture；不写产品文件、不启动模型/Electron。
import { createHash } from "node:crypto";

const { rapporteurRoleModule } = await import(
  "../../../../../src/common/roles/rapporteur/index.ts"
);
const {
  ORACLE_DISPATCH_CASES,
  ORACLE_PREFLIGHT_CASES,
} = await import("../../../../../test/roles/rapporteur/oracle-fixture.ts");

const sha = (value) => createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
const j = (value) => JSON.stringify(value);

const lines = [];
const record = (name, value) => lines.push(`${name}: ${sha(j(value))} :: ${j(value).slice(0, 160)}`);

record("spec.id/displayName/function", {
  id: rapporteurRoleModule.id,
  displayName: rapporteurRoleModule.displayName,
  function: rapporteurRoleModule.function,
});
record("card.text", { sha256: sha(rapporteurRoleModule.card.text), length: rapporteurRoleModule.card.text.length, lines: rapporteurRoleModule.card.text.split("\n").length });
record("card.entries", rapporteurRoleModule.card.entries);
record("card.preauthorizedDirs", rapporteurRoleModule.card.preauthorizedDirs);
record("card.forbiddenWritePaths", rapporteurRoleModule.card.forbiddenWritePaths);
record("capabilities", rapporteurRoleModule.capabilities);
record("cards", rapporteurRoleModule.cards);
record("tools.trio", rapporteurRoleModule.tools({ governanceModel: "trio" }));
record("tools.single", rapporteurRoleModule.tools({ governanceModel: "single" }));
record("dispatch.all", ORACLE_DISPATCH_CASES.map((c) => ({ name: c.name, policy: rapporteurRoleModule.dispatch(c.input) })));
record("preflight.all", ORACLE_PREFLIGHT_CASES.map((c) => ({ name: c.name, decision: rapporteurRoleModule.preflight.checkAction({ action: c.action, facts: c.facts }) })));
record("context.trio.no-matrix", rapporteurRoleModule.context({ governanceModel: "trio" }));
record("context.trio.legacy-v1", rapporteurRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" }));
record("context.trio.empty-facts", rapporteurRoleModule.context({ governanceModel: "trio", facts: {} }));
record("context.single", rapporteurRoleModule.context({ governanceModel: "single" }));
record("context.trio.facts-rejected", rapporteurRoleModule.context({ governanceModel: "trio", facts: { anything: true } }));
record("context.null", rapporteurRoleModule.context(null));

process.stdout.write(lines.join("\n") + "\n");
