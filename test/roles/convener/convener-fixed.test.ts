// convener 角色模块 fixed 矩阵测试（T3「两条固定工作流路径」B2；MF-IR-4 / v1.3 §3.4）。
// B9.1（RR4 `1bcdaf69…`）：fixed 段新增任务证据与哈希纪律（应用算 hash、禁止 worker shell hash）
// 与卡预算段（3 确认卡 + merge-main；不诱导额外审批卡），本文件同步覆盖。
//
// 覆盖：
//  - `fixedCards` / `fixedAllowedBuiltInRoleIds` 冻结值（与 legacy 数据独立）；
//  - `isConvenerFixedBuiltInDispatchTarget` 正/负例、与目标表同源、纯函数；
//  - fixed context 段（仅显式 `matrix:"two-fixed-paths/v1"` 返回；legacy 三段/返回值逐字不变）；
//  - legacy 数据/派发/tools 不受 fixed 字段影响（与既有单测/差分测试互补，不重复弱化）；
//  - G-IR 拒绝项：无 `requestReleaseMerge`、工具闭集不变、无新增 skip/force-exit。
//
// legacy 差分逐字不变由 `convener-differential.test.ts`（冻结金样）继续保证；本文件不修改
// legacy 数据，也不断言 fixed 之外的新行为。

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  CONVENER_WORKER_DISPATCH_TARGETS,
  convenerRoleModule,
} from "../../../src/common/roles/convener/index.ts";

const MODULE = convenerRoleModule;
const FIXED = "two-fixed-paths/v1" as const;
const MODULE_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "src/common/roles/convener");

// —————————————————————— fixed 数据值（MF-IR-4 冻结值）——————————————————————

test("fixedCards：冻结值恰 [\"decision\"]；独立于 legacy cards，legacy 逐字不变", () => {
  const fixedCards = MODULE.fixedCards;
  assert.ok(fixedCards !== undefined, "convener 必须提供 fixedCards（B2 六角色均提供）");
  assert.deepEqual([...fixedCards], ["decision"]);
  assert.equal(Object.isFrozen(fixedCards), true);
  // legacy 卡种逐字不变；fixed 是新数组（不从 legacy cards 过滤/复用同一引用）。
  assert.deepEqual([...MODULE.cards], ["decision"]);
  assert.equal(Object.isFrozen(MODULE.cards), true);
  assert.notEqual(fixedCards, MODULE.cards, "fixedCards 必须是独立冻结数据（不从 legacy cards 派生）");
});

test("fixedAllowedBuiltInRoleIds：冻结值恰 [product, rapporteur, nominator]；legacy allowedBuiltInRoleIds 仍 [verifier]", () => {
  const fixedAllowed = MODULE.fixedAllowedBuiltInRoleIds;
  assert.ok(fixedAllowed !== undefined, "convener 必须提供 fixedAllowedBuiltInRoleIds（MF-IR-4）");
  assert.deepEqual([...fixedAllowed], ["product", "rapporteur", "nominator"]);
  assert.equal(Object.isFrozen(fixedAllowed), true);
  assert.equal((fixedAllowed as readonly string[]).includes("verifier"), false, "fixed 下 convener 不得派 verifier");
  // legacy 目标常量逐字冻结（legacy 消费点 apply-journal/trunk-runtime 不改读取源）。
  assert.deepEqual([...CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds], ["verifier"]);
  assert.equal(CONVENER_WORKER_DISPATCH_TARGETS.workerTargetKind, "project");
  assert.equal(CONVENER_WORKER_DISPATCH_TARGETS.reportToRoleId, "convener");
});

// —————————————————————— fixed 谓词（与目标表同源）——————————————————————

test("isConvenerFixedBuiltInDispatchTarget：生产线目标正例；verifier/自身/未知/大小写变体负例", () => {
  const predicate = MODULE.isConvenerFixedBuiltInDispatchTarget;
  assert.ok(predicate !== undefined, "convener 必须提供 fixed 谓词（MF-IR-4）");
  assert.equal(typeof predicate, "function");
  for (const target of ["product", "rapporteur", "nominator"]) {
    assert.equal(predicate(target), true, `fixed 谓词须允许 ${target}`);
  }
  for (const denied of ["verifier", "chief", "convener", "su", "", "  ", "worker-x", "Product", "product "]) {
    assert.equal(predicate(denied), false, `fixed 谓词须拒绝 ${JSON.stringify(denied)}`);
  }
  // 同源：成员判定恰与 fixedAllowedBuiltInRoleIds 一致（不复制第二张表）。
  const fixedAllowed = MODULE.fixedAllowedBuiltInRoleIds ?? [];
  for (const target of ["product", "rapporteur", "nominator", "verifier", "chief", "worker-x"]) {
    assert.equal(predicate(target), fixedAllowed.includes(target), target);
  }
  // 纯函数：重复调用同值；不修改目标表（无副作用）。
  const before = JSON.stringify(MODULE.fixedAllowedBuiltInRoleIds ?? null);
  assert.equal(predicate("product"), predicate("product"));
  assert.equal(predicate("verifier"), predicate("verifier"));
  assert.equal(JSON.stringify(MODULE.fixedAllowedBuiltInRoleIds ?? null), before);
});

// —————————————————————— fixed context 段（仅显式 fixed 矩阵）——————————————————————

test("context(fixed)：返回 fixed 段（生产线/任务证据与哈希/卡预算/团队计划与基线/集成汇总与报告期望），冻结且无 resources", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  assert.deepEqual(
    sections.map((section) => section.id),
    [
      "convener-fixed-production-line",
      "convener-fixed-evidence",
      "convener-fixed-card-budget",
      "convener-fixed-baseline",
      "convener-fixed-report",
    ],
  );
  assert.equal(Object.isFrozen(sections), true);
  for (const section of sections) {
    assert.equal(section.text.trim().length > 0, true, section.id);
    assert.equal(section.resources, undefined, section.id);
    assert.equal(Object.isFrozen(section), true);
  }
  const text = sections.map((section) => section.text).join("\n");
  // 任务书固定主题：生产线唯一派发者（product/rapporteur/nominator/项目生产角色/实现）、
  // 团队计划、基线 3 件小事、集成汇总、不派 verifier。
  for (const token of [
    "生产线唯一派发者",
    "product",
    "rapporteur",
    "nominator",
    "项目生产角色",
    "实现",
    "团队计划",
    "基线 3 件小事",
    "git init -b main",
    ".gitignore",
    "ans/task/",
    "集成汇总",
    "报告期望",
    "verifier",
    "convener-to-verifier-forbidden",
  ]) {
    assert.equal(text.includes(token), true, `fixed 段缺主题：${token}`);
  }
  // 纯数据：不携带权限/批准字段。
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    for (const section of sections) assert.equal(forbidden in section, false, section.id);
  }
});

test("B9.1 fixed 证据纪律：证据只要求 path/内容/frontmatter/结论；应用计算 hash；禁止 worker shell hash", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const evidence = sections.find((section) => section.id === "convener-fixed-evidence")?.text;
  assert.ok(evidence !== undefined, "B9.1 必须提供任务证据与哈希段");

  // 证据三要素：路径 / 内容/frontmatter / 结论（RR4：worker 不再被要求给出 sha256）。
  for (const token of ["路径", "frontmatter", "结论"]) {
    assert.equal(evidence.includes(token), true, `证据段缺要素：${token}`);
  }
  // 禁止 worker 用 shell/certutil/Get-FileHash 计算 hash/sha256（RR4 失败事实：certutil）。
  for (const token of ["run_shell", "certutil", "Get-FileHash", "sha256", "hash"]) {
    assert.equal(evidence.includes(token), true, `证据段缺禁令主体：${token}`);
  }
  assert.match(evidence, /不要要求 worker 用/);
  // 哈希由应用在收口/归档/依据校验时计算（应用机器事实，非 worker 义务）。
  assert.match(evidence, /应用/);
  for (const token of ["close_created_task", "closeTask", "basis.recorded", "documentRefs", "归档"]) {
    assert.equal(evidence.includes(token), true, `证据段缺应用计算时点：${token}`);
  }
  // 任务文本不得以「给出 sha256」作为完成/验收标准。
  assert.match(evidence, /不得以「给出 sha256」/);
  assert.match(evidence, /完成标准/);
});

test("B23 fixed 哈希来源：权威哈希取应用记录（project_state [versions]/versions.jsonl）；自身禁止 shell 计算/核验", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const evidence = sections.find((section) => section.id === "convener-fixed-evidence")?.text ?? "";
  const baseline = sections.find((section) => section.id === "convener-fixed-baseline")?.text ?? "";

  // RR19 回归：convener 在 A9 缺哈希来源，试图 certutil 计算 roster hash 触发 shell 审批卡。
  for (const token of ["project_state", "[versions]", "sha256=", ".ans/state/versions.jsonl"]) {
    assert.equal(evidence.includes(token), true, `证据段缺应用哈希来源：${token}`);
  }
  assert.match(evidence, /你自身同样禁止/);
  for (const token of ["run_shell", "certutil", "Get-FileHash", "PowerShell"]) {
    assert.equal(evidence.includes(token), true, `证据段缺自身 shell 禁令：${token}`);
  }

  // A9 团队计划字段（modules/roster）的哈希来源必须写进基线段。
  for (const token of ["project_state", "[versions]", "sha256=", ".ans/state/versions.jsonl", "run_shell", "certutil"]) {
    assert.equal(baseline.includes(token), true, `基线段缺团队计划哈希来源/禁令：${token}`);
  }
});

test("B27 fixed A11 任务文本：不得建议自测脚本/运行；报告只要求静态自检结论（执行/验证归 A12）", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const production = sections.find((section) => section.id === "convener-fixed-production-line")?.text ?? "";

  // RR24：convener 任务文本「可加最小单测/自测脚本」+「如何自测」⇒ worker 执行 node self-test ⇒ shell 卡早停。
  for (const token of [
    "不得建议或要求 worker 添加后运行自测脚本",
    "静态自检结论",
    "不运行 shell/node/npm",
    "不执行测试脚本",
    "执行/验证归 A12",
    "git add",
    "git commit",
    "run_shell",
    "node src/core/self-test.js",
  ]) {
    assert.equal(production.includes(token), true, `生产线段缺 B27 口径：${token}`);
  }
  assert.match(production, /不得以「如何自测」「测试结论」作为报告项/u);
});

test("B28 fixed 生产/评审任务禁止 shell（含 mkdir）；write_file 自动建目录；docs/acceptance 由应用归档", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const production = sections.find((section) => section.id === "convener-fixed-production-line")?.text ?? "";
  // RR25：review 角色为建目录执行 `cmd /c mkdir docs\acceptance` ⇒ shell 审批卡早停。
  for (const token of [
    "所有 fixed 生产/评审任务文本",
    "不得要求或建议 worker 运行任何 shell 命令",
    "mkdir",
    "cp",
    "mv",
    "write_file",
    "edit_file",
    "自动创建目录",
    "docs/acceptance",
    "cmd /c mkdir docs\\acceptance",
  ]) {
    assert.equal(production.includes(token), true, `生产线段缺 B28 口径：${token}`);
  }
});

test("B32 fixed A11/B3 提交语法：git commit -m \"<message>\" 整体引号单参数；返工只纠语法；不得代 worker 提交", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const production = sections.find((section) => section.id === "convener-fixed-production-line")?.text ?? "";

  // RR27：worker 以未加引号的 `git commit -m feat(game-core): …` 提交 ⇒ argv 被拆（-m 后多
  // token），shell 写门拒绝；任务文本须写明正确提交语法：含空格消息整体加引号、-m 后恰一个
  // 带引号的单消息参数。
  assert.equal(production.includes('git commit -m "<message>"'), true, "生产线段须给出引号化提交模板");
  for (const token of [
    "含空格的提交消息必须整体加引号",
    "`-m` 后必须恰一个带引号的单消息参数",
    "未加引号会被拆成多 argv",
    "shell 写门拒绝",
    "RR27 实测",
    "git\",\"commit\",\"-m\"",
  ]) {
    assert.equal(production.includes(token), true, `生产线段缺 B32 提交语法口径：${token}`);
  }

  // 返工只纠正提交语法，不重写实现；被拒按真实回执（code/argv 形状）rework/re-dispatch 并复述语法。
  for (const token of [
    "返工任务只纠正提交语法",
    "不得重写已完成的实现",
    "按真实回执（code 与 argv 形状）rework/re-dispatch",
    "在任务文本复述正确提交语法",
    "不得把「缺少 taskGitScope」当唯一解释",
  ]) {
    assert.equal(production.includes(token), true, `生产线段缺 B32 返工口径：${token}`);
  }

  // RR27：convener 代 worker 提交亦被拒（stage-request 无实现任务 taskGitScope）⇒ 明令不得代提交。
  assert.equal(production.includes("你不得代 worker 执行 `git commit`/`git add`（不得代提交）"), true);
  for (const token of ["不得代 worker 执行", "不得代提交", "stage-request 会话", "按设计无实现任务 taskGitScope"]) {
    assert.equal(production.includes(token), true, `生产线段缺 B32 代提交禁令：${token}`);
  }

  // fixed-only：legacy context / legacy card.text 不混入 B32 文案（legacy 逐字冻结）。
  const legacyText = MODULE.context({ governanceModel: "trio" }).map((section) => section.text).join("\n");
  for (const token of [
    "git commit -m",
    "不得代 worker 执行",
    "不得代提交",
    "返工任务只纠正提交语法",
    "单消息参数",
    "rework/re-dispatch",
    "taskGitScope",
  ]) {
    assert.equal(legacyText.includes(token), false, `legacy context 不得含 fixed-only B32 内容：${token}`);
    assert.equal(MODULE.card.text.includes(token), false, `legacy card.text 不得含 fixed-only B32 内容：${token}`);
  }

  // 确定性/纯函数：同输入同引用。
  assert.equal(MODULE.context({ governanceModel: "trio", matrix: FIXED }), sections);
});

test("B13.2 fixed 证据纪律：任务文本须要求 submit_report.evidence[] 为纯项目相对路径（描述文本不计为证据）", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const evidence = sections.find((section) => section.id === "convener-fixed-evidence")?.text;
  assert.ok(evidence !== undefined, "B13.2 必须在任务证据段补 evidence[] 纯路径要求");

  // RR8 回归：产品把描述句写进 evidence[] ⇒ close-report-missing 返工循环。
  assert.match(evidence, /`submit_report` 的 `evidence\[\]` 每项为\*\*纯项目相对文件路径\*\*/u);
  assert.match(evidence, /`docs\/product\/<flowId>-intent-vN\.md`/u);
  assert.match(evidence, /不得写描述句、冒号说明或正文/u);
  assert.match(evidence, /描述与 frontmatter 实际值写在报告 summary 正文/u);
  assert.match(evidence, /收口（`close_created_task accepted`）按纯路径逐项核验文件字节/u);
  assert.match(evidence, /描述文本不计为证据/u);
  assert.match(evidence, /`close-report-missing` 时按此要求返工/u);

  // fixed-only：legacy context 不混入该口径。
  const legacyText = MODULE.context({ governanceModel: "trio" }).map((section) => section.text).join("\n");
  for (const token of ["evidence[]", "纯项目相对文件路径", "描述文本不计为证据"]) {
    assert.equal(legacyText.includes(token), false, `legacy context 不得含 fixed-only B13.2 内容：${token}`);
  }
  // 确定性/纯函数：同输入同引用。
  assert.equal(MODULE.context({ governanceModel: "trio", matrix: FIXED }), sections);
});

test("B14 fixed 环境探测纪律：不得为环境/工具链探测运行 shell；环境事实从应用只读事实读取", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const production = sections.find((section) => section.id === "convener-fixed-production-line")?.text;
  assert.ok(production !== undefined, "B14 必须在生产线段补环境探测禁令");

  // RR9 实测：运营执行 python --version 触发 shell 审批/拒绝面，超出 fixed 卡预算。
  assert.match(production, /不得为探测环境运行 shell/u);
  assert.match(production, /`node -v`/u);
  assert.match(production, /`python --version`/u);
  assert.match(production, /shell 审批\/拒绝面/u);
  assert.match(production, /fixed 卡预算之外的额外门/u);
  assert.match(production, /`project_state`/u);
  assert.match(production, /按应用事实报告并如实说明，不运行 shell/u);

  // fixed-only：legacy context 不混入该口径。
  const legacyText = MODULE.context({ governanceModel: "trio" }).map((section) => section.text).join("\n");
  for (const token of ["不得为探测环境运行 shell", "node -v", "python --version", "fixed 卡预算之外的额外门"]) {
    assert.equal(legacyText.includes(token), false, `legacy context 不得含 fixed-only B14 内容：${token}`);
  }
  // 确定性/纯函数：同输入同引用。
  assert.equal(MODULE.context({ governanceModel: "trio", matrix: FIXED }), sections);
});

test("B9.1 fixed 卡预算：3 张确认卡 + merge-main；shell/stable-write 等额外卡不得由任务文本诱导", () => {
  const sections = MODULE.context({ governanceModel: "trio", matrix: FIXED });
  const budget = sections.find((section) => section.id === "convener-fixed-card-budget")?.text;
  assert.ok(budget !== undefined, "B9.1 必须提供卡预算段");
  for (const token of [
    "3 张确认卡",
    "intent-confirm",
    "proposal",
    "appointment",
    "merge-main",
    "客户本人确认",
    "acceptance",
    "decision",
  ]) {
    assert.equal(budget.includes(token), true, `卡预算段缺：${token}`);
  }
  // 额外客户/操作员审批（shell/stable-write/trunk/run）不得由 worker 任务文本诱导。
  assert.match(budget, /不得在 worker 任务文本中诱导额外/);
  for (const token of ["shell", "stable-write", "trunk", "run"]) {
    assert.equal(budget.includes(token), true, `卡预算段缺额外卡禁令：${token}`);
  }
  // decision 卡不计入固定 3 张确认卡（设计 v1.3 §4.2 说明）。
  assert.match(budget, /decision 卡只用于材料性选择/);
  assert.match(budget, /不计入 3 张确认卡/);
});

test("context(legacy)：无 matrix / legacy-v1 / 畸形输入返回同一 legacy 三段（固定前逐字冻结）", () => {
  const legacy = MODULE.context({ governanceModel: "trio" });
  assert.equal(MODULE.context({ governanceModel: "single" }), legacy);
  assert.equal(MODULE.context({ governanceModel: "trio", matrix: "legacy-v1" }), legacy);
  assert.equal(MODULE.context({} as never), legacy, "context({}) 必须逐字返回 legacy 段");
  assert.equal(MODULE.context(null as never), legacy, "畸形输入保持 legacy 行为（不抛错）");
  assert.equal(MODULE.context({ matrix: "unknown" } as never), legacy, "未知矩阵值不升级为 fixed");
  assert.deepEqual(legacy.map((section) => section.id), ["decision-card", "project-workflow", "report-expectation"]);
  const text = legacy.map((section) => section.text).join("\n");
  assert.equal(text.includes("request_choice(cardKind=decision)"), true);
  assert.equal(text.includes("reportTargetForTaskCreator"), true);
  assert.equal(text.includes("convener-fixed"), false, "legacy 返回值不得混入 fixed 段");
  // B9.1 新增 fixed 文案只属于 fixed 段：legacy context 与 legacy card.text 逐字不变。
  for (const fixedOnly of ["certutil", "Get-FileHash", "任务证据与哈希", "3 张确认卡", "convener-fixed-evidence", "静态自检结论"]) {
    assert.equal(text.includes(fixedOnly), false, `legacy context 混入 fixed 文案：${fixedOnly}`);
    assert.equal(MODULE.card.text.includes(fixedOnly), false, `legacy card.text 混入 fixed 文案：${fixedOnly}`);
  }
  // 两矩阵隔离：fixed 返回值不含 legacy 段 id（run-role fixed 会话只追加 fixed 段）。
  assert.equal(
    MODULE.context({ governanceModel: "trio", matrix: FIXED }).some((section) => section.id === "decision-card"),
    false,
  );
});

// —————————————————————— legacy 行为不受 fixed 字段影响 ——————————————————————

test("legacy tools/dispatch/capabilities 与 fixed 字段无耦合（fixed 数据纯只读）", () => {
  const trio = MODULE.tools({ governanceModel: "trio" });
  assert.deepEqual([...trio.tools], [
    "requestRequirementChange",
    "completeTeamPlan",
    "closeCreatedTask",
    "submitRefactor",
    "requestStableWrite",
  ]);
  assert.equal(trio.capabilities, MODULE.capabilities);
  assert.deepEqual([...MODULE.tools({ governanceModel: "single" }).tools], ["submitRefactor", "requestStableWrite"]);

  // legacy dispatch 逐字保持：convener→verifier 允许；convener→product 拒绝（fixed 目标只经
  // fixed 谓词/矩阵视图消费，不改 legacy dispatch()）。
  const verifier = MODULE.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(verifier.decision, { allow: true });
  assert.equal(verifier.reportToRoleId, "convener");
  const product = MODULE.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(product.decision.allow, false);
  assert.equal(product.decision.allow === false ? product.decision.code : "", "convener-target-forbidden");
  // 传 fixed matrix 也不改变 dispatch() 的 legacy 判定（fixed 派发由编排 fixed 谓词负责）。
  const productFixedMatrix = MODULE.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    matrix: FIXED,
  });
  assert.deepEqual(productFixedMatrix, product);

  // 纯数据：模块不新增权限/批准字段。
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    assert.equal(forbidden in MODULE, false);
  }
});

// —————————————————————— 模块纪律与 G-IR 拒绝项 ——————————————————————

test("模块纪律：唯一 public entry；只 import Model（type-only）；无 requestReleaseMerge / 无新工具", async () => {
  const entries = await readdir(MODULE_DIR, { withFileTypes: true });
  assert.deepEqual(entries.map((entry) => entry.name), ["index.ts"]);

  const source = await readFile(path.join(MODULE_DIR, "index.ts"), "utf8");
  assert.doesNotMatch(source, /requestReleaseMerge|request_release_merge/, "G-IR §六拒绝新增 requestReleaseMerge");
  for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
    assert.equal(match[1].startsWith("../../../model/"), true, `越界 import：${match[1]}`);
  }
  assert.deepEqual([...source.matchAll(/^import\s+(?!type\b)[^;]+;/gm)].map((match) => match[0]), [], "角色模块只允许 `import type`");
  for (const forbidden of ["node:", "require(", "import(", "Math.random", "new Date(", "process.env"]) {
    assert.equal(source.includes(forbidden), false, `角色模块不得包含：${forbidden}`);
  }
});

test("测试纪律：本目录测试不新增 skip / force-exit（token 动态拼接以避免自指误报）", async () => {
  const skipCall = new RegExp("\\b(?:test|t)\\.skip\\s*\\(");
  const forceExitToken = ["test", "force", "exit"].join("-");
  const files = (await readdir(import.meta.dirname)).filter((name) => name.endsWith(".test.ts"));
  assert.ok(files.length >= 3);
  for (const file of files) {
    const source = await readFile(path.join(import.meta.dirname, file), "utf8");
    assert.doesNotMatch(source, skipCall, `${file} 不得新增 skip`);
    assert.equal(source.includes(forceExitToken), false, `${file} 不得新增 force-exit`);
  }
});
