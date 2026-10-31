// 门禁引擎测试：例行命令确定性白名单谓词（方案 v1.3 §5.1/§5.3/§5.4；P7/AC-12/AC-13/AC-14/AC-16）
//
// 覆盖：
//   · 正例矩阵：§5.1 全部精确形态命中，id 稳定（分类器 ruleId = `allow:routine:<id>`）；
//   · 负例矩阵（§5.4 误伤面）：npm install / 任意脚本名 / 裸 tsc / 越界或带 flag 的 node --test 等
//     **不**命中，落回既有链（不是 c-allow）；
//   · 自定义规则集（P7/AC-16）：注入更严格的 risky 规则时，上表形态仍 allow（risky 被覆盖）；
//     硬拒（hardDenyPrograms）与危险记号（denyTokens）仍优先于本白名单；
//   · 谓词是纯函数：无规则集也能判定；非法运行时输入 fail-closed 返回 undefined。
//
// 唯一实现：`src/common/门禁引擎/classify-shell.ts::matchRoutineShellCommand`（写守卫共用同一引用；
// Service 公开出口同引用再导出见 shell-rules-public-reexport.test.ts）。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SHELL_RULES_VERSION,
  classifyShell,
  classifyShellDetailed,
  defaultShellRules,
  matchRoutineShellCommand,
} from "../../src/common/门禁引擎/classify-shell.ts";
import type { ShellRules } from "../../src/model/decision.ts";

const rules = defaultShellRules();

/** §5.1 全部精确形态（argv 全等）与冻结 id。 */
const POSITIVE: ReadonlyArray<{ argv: string[]; id: string }> = [
  { argv: ["npm", "test"], id: "npm-test" },
  { argv: ["npm", "run", "test"], id: "npm-run-test" },
  { argv: ["npm", "run", "typecheck"], id: "npm-run-typecheck" },
  { argv: ["npm", "run", "lint"], id: "npm-run-lint" },
  { argv: ["npm", "run", "check"], id: "npm-run-check" },
  { argv: ["node", "--test"], id: "node-test" },
  { argv: ["node", "--test", "test/a.test.ts"], id: "node-test" },
  {
    argv: [
      "node", "--test",
      "test/a.test.js", "test/b.test.ts", "test/c.test.mjs",
      "test/d.test.cjs", "test/e.test.mts", "test/f.test.cts",
    ],
    id: "node-test",
  },
  // 本仓库测试目录含中文（如 test/门禁引擎/…）：Unicode 字母是合法路径字符（不是空白/元字符）。
  { argv: ["node", "--test", "test/门禁引擎/classify-shell.test.ts"], id: "node-test" },
  { argv: ["node", "--test", "test/deep/sub/dir/x.test.ts"], id: "node-test" },
  { argv: ["tsc", "--noEmit"], id: "tsc-noemit" },
  { argv: ["npm", "ci"], id: "npm-ci" },
];

test("正例矩阵：§5.1 精确形态全部命中（id 稳定，ruleId = allow:routine:<id>）", () => {
  for (const { argv, id } of POSITIVE) {
    assert.deepEqual(matchRoutineShellCommand(argv), { id }, `谓词应命中：${argv.join(" ")}`);
    const detail = classifyShellDetailed(argv, rules);
    assert.equal(detail.decision, "allow", `分类器应 allow：${argv.join(" ")}`);
    assert.equal(detail.ruleId, `allow:routine:${id}`, `ruleId 必须稳定：${argv.join(" ")}`);
    assert.equal(classifyShell(argv, rules), "allow", `四态入口应 allow：${argv.join(" ")}`);
  }
});

test("id 冻结：原委托三 id 与新增形态 id 逐字固定（B1 委托策略按 id 过滤）", () => {
  // 原委托清单三 id（routine-shell-policy 只接受这三个；不得改名）。
  assert.equal(matchRoutineShellCommand(["npm", "test"])?.id, "npm-test");
  assert.equal(matchRoutineShellCommand(["npm", "run", "typecheck"])?.id, "npm-run-typecheck");
  assert.equal(matchRoutineShellCommand(["node", "--test", "test/a.test.ts"])?.id, "node-test");
  // 本表新增形态。
  assert.equal(matchRoutineShellCommand(["npm", "run", "test"])?.id, "npm-run-test");
  assert.equal(matchRoutineShellCommand(["npm", "run", "lint"])?.id, "npm-run-lint");
  assert.equal(matchRoutineShellCommand(["npm", "run", "check"])?.id, "npm-run-check");
  assert.equal(matchRoutineShellCommand(["tsc", "--noEmit"])?.id, "tsc-noemit");
  assert.equal(matchRoutineShellCommand(["npm", "ci"])?.id, "npm-ci");
});

test("谓词是纯函数：不依赖规则集即可判定；非法运行时输入 fail-closed 返回 undefined", () => {
  assert.deepEqual(matchRoutineShellCommand(["npm", "test"]), { id: "npm-test" });
  assert.equal(matchRoutineShellCommand(undefined as never), undefined);
  assert.equal(matchRoutineShellCommand(null as never), undefined);
  assert.equal(matchRoutineShellCommand("npm test" as never), undefined);
  assert.equal(matchRoutineShellCommand([123] as never), undefined);
});

/** §5.1「不纳入」与 §5.4 误伤面：必须不命中谓词、也不得被判 c-allow。 */
const NEGATIVE: readonly (readonly string[])[] = [
  // 安装/包管理：npm install 保留判断 + 判拒后申请；npm ci 只放行精确 2 元素形态。
  ["npm", "install"],
  ["npm", "install", "chalk"],
  ["npm", "i"],
  ["npm", "i", "chalk"],
  ["npm", "ci", "--ignore-scripts"],
  ["npm", "ci", "--foreground-scripts"],
  ["npm", "ci", "--no-audit"],
  ["npm", "uninstall", "chalk"],
  ["npm", "add", "chalk"],
  // npm test / npm run：任何附加参数、`--`、非固定脚本名都不命中。
  ["npm", "test", "--", "--ci"],
  ["npm", "test", "--ci"],
  ["npm", "test", "extra"],
  ["npm", "test", ""],
  ["npm", "run"],
  ["npm", "run", "build"],
  ["npm", "run", "start"],
  ["npm", "run", "dev"],
  ["npm", "run", "test:unit"],
  ["npm", "run", "test", "--", "--watch"],
  ["npm", "run", "typecheck", "--", "--pretty"],
  ["npm", "run", "Check"],
  // tsc：裸 tsc / 带其它参数 / npx 一律不放行。
  ["tsc"],
  ["tsc", "-p", "tsconfig.json"],
  ["tsc", "--noEmit", "--pretty"],
  ["tsc", "--noemit"],
  ["npx", "tsc", "--noEmit"],
  ["npx", "--no-install", "tsc", "--noEmit"],
  // node --test：越界/带 flag/后缀不符/空白/元字符/通配/`..` 全部不命中。
  ["node", "--test", "../outside.test.ts"],
  ["node", "--test", "test/../outside.test.ts"],
  ["node", "--test", "test/a.test.ts", "../b.test.ts"],
  ["node", "--test", "/outside.test.ts"],
  ["node", "--test", "src/main.test.ts"],
  ["node", "--test", "src/main.ts"],
  ["node", "--test", "test/main.ts"],
  ["node", "--test", "test/a.test.tsx"],
  ["node", "--test", "test/a.spec.ts"],
  ["node", "--test", "test/a.test.TS"],
  ["node", "--test", "test/"],
  ["node", "--test", "test"],
  ["node", "--test", ""],
  ["node", "--test", "--import", "src/setup.ts"],
  ["node", "--test", "--loader", "tsx"],
  ["node", "--test", "test/a.test.ts", "--import", "src/setup.ts"],
  ["node", "--test", "--experimental-test-coverage"],
  ["node", "--test", "test/a.test.ts", "--experimental-test-isolation=none"],
  ["node", "--test", "test/a.test.ts", "-x"],
  ["node", "--test", "test/a b.test.ts"],
  ["node", "--test", "test/a\tb.test.ts"],
  ["node", "--test", "test/a;b.test.ts"],
  ["node", "--test", "test/a|b.test.ts"],
  ["node", "--test", "test/a&b.test.ts"],
  ["node", "--test", "test/a$b.test.ts"],
  ["node", "--test", "test/a`b.test.ts"],
  ["node", "--test", "test/a*b.test.ts"],
  ["node", "--test", "test/a?b.test.ts"],
  ["node", "--test", "test/[ab].test.ts"],
  ["node", "--test", "test/a\\b.test.ts"],
  ["node", "--test", "test/a\"b.test.ts"],
  ["node", "--test", "test//a.test.ts"],
  ["node", "--test", "./test/a.test.ts"],
  // 大小写/路径/可执行形式不是精确形态（fail-closed，落回既有链）。
  ["NPM", "test"],
  ["npm", "TEST"],
  ["node", "--TEST"],
  ["node.exe", "--test", "test/a.test.ts"],
  ["C:\\nodejs\\node.exe", "--test", "test/a.test.ts"],
  ["./npm", "test"],
];

test("负例矩阵（§5.4）：不命中谓词，且分类不是 c-allow（落回既有链）", () => {
  for (const argv of NEGATIVE) {
    assert.equal(matchRoutineShellCommand([...argv]), undefined, `谓词不应命中：${argv.join(" ")}`);
    const detail = classifyShellDetailed([...argv], rules);
    assert.notEqual(detail.decision, "allow", `不得确定性放行：${argv.join(" ")}`);
    assert.ok(!detail.ruleId.startsWith("allow:routine:"), `不得命中 routine 规则：${argv.join(" ")}（${detail.ruleId}）`);
  }
});

test("负例分档与 §5.4 一致：npm install / npm run build 仍 risky；裸 tsc / node --test 越界仍 review；npx 仍 risky", () => {
  assert.equal(classifyShell(["npm", "install"], rules), "risky");
  assert.equal(classifyShell(["npm", "install", "chalk"], rules), "risky");
  assert.equal(classifyShell(["npm", "ci", "--ignore-scripts"], rules), "risky");
  assert.equal(classifyShell(["npm", "test", "--", "--ci"], rules), "risky");
  assert.equal(classifyShell(["npm", "run", "build"], rules), "risky");
  assert.equal(classifyShell(["npm", "run", "start"], rules), "risky");
  assert.equal(classifyShell(["tsc"], rules), "review");
  assert.equal(classifyShell(["tsc", "-p", "tsconfig.json"], rules), "review");
  assert.equal(classifyShell(["node", "--test", "../outside.test.ts"], rules), "review");
  assert.equal(classifyShell(["node", "--test", "--import", "src/setup.ts"], rules), "review");
  assert.equal(classifyShell(["npx", "tsc", "--noEmit"], rules), "risky");
});

/** 自定义规则集助手（version/executionModel 固定，其余按需覆盖）。 */
function customRules(overrides: Partial<ShellRules>): ShellRules {
  return {
    version: SHELL_RULES_VERSION,
    executionModel: "argv-noshell",
    readOnly: [],
    hardDenyPrograms: [],
    riskyPrograms: [],
    denyTokens: [],
    ...overrides,
  };
}

test("自定义规则集（P7/AC-16）：更严格的 risky 规则不能覆盖例行白名单——上表形态仍 allow", () => {
  // 宿主注入把 npm/node/tsc 全判 risky 的规则：代码级确定性白名单在 risky 之前命中。
  const strict = customRules({
    riskyPrograms: [{ id: "risky:host-strict", programs: ["npm", "node", "tsc"] }],
  });
  // 先确认该规则确实生效（否则本测试无意义）。
  assert.equal(classifyShell(["npm", "install"], strict), "risky");
  assert.equal(classifyShell(["node", "script.js"], strict), "risky");
  assert.equal(classifyShell(["tsc", "-p", "tsconfig.json"], strict), "risky");
  for (const { argv, id } of POSITIVE) {
    const detail = classifyShellDetailed([...argv], strict);
    assert.equal(detail.decision, "allow", `自定义规则集下仍应 allow：${argv.join(" ")}`);
    assert.equal(detail.ruleId, `allow:routine:${id}`);
  }
});

test("自定义规则集（P7/AC-16）：硬拒仍优先于例行白名单（hardDenyPrograms 在谓词之前判定）", () => {
  const denyNpm = customRules({ hardDenyPrograms: [{ id: "deny-all-npm", programs: ["npm"] }] });
  for (const argv of [["npm", "test"], ["npm", "ci"], ["npm", "run", "test"], ["npm", "run", "lint"]]) {
    const detail = classifyShellDetailed([...argv], denyNpm);
    assert.equal(detail.decision, "deny", `硬拒必须优先：${argv.join(" ")}`);
    assert.equal(detail.ruleId, "deny:program:deny-all-npm");
  }
  const denyNodeTest = customRules({
    hardDenyPrograms: [{ id: "deny-node-test", programs: ["node"], onlyWithFlag: ["--test"] }],
  });
  for (const argv of [["node", "--test"], ["node", "--test", "test/a.test.ts"]]) {
    const detail = classifyShellDetailed([...argv], denyNodeTest);
    assert.equal(detail.decision, "deny", `硬拒必须优先：${argv.join(" ")}`);
    assert.equal(detail.ruleId, "deny:program:deny-node-test");
  }
  const denyTsc = customRules({ hardDenyPrograms: [{ id: "deny-tsc", programs: ["tsc"] }] });
  assert.equal(classifyShell(["tsc", "--noEmit"], denyTsc), "deny");
});

test("自定义规则集（P7/AC-16）：危险记号检查先于例行白名单（denyTokens 仍握优先）", () => {
  // shell-string 模型下记号生效：记号检查（第 6 步）在例会白名单（6.5）之前。
  const tokenRules = customRules({ executionModel: "shell-string", denyTokens: ["--noEmit"] });
  const detail = classifyShellDetailed(["tsc", "--noEmit"], tokenRules);
  assert.equal(detail.decision, "deny");
  assert.equal(detail.ruleId, "deny:token:--noEmit");
});
