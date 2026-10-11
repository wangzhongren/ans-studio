// test/编排/orchestration.test.ts
// 编排角色自测：只依赖本角色文件（common/编排/），不依赖门禁引擎与 Pi 适配器是否已落盘。
// 覆盖：参数解析分支（含用法错误）、事件格式化（按根分组）、配置取值（注入优先/缺注入报错）与夹具形状。
//
// 演示配置数据已从 common/编排/ 移除（单一来源归装配，契约 §6），故本测试自带夹具
// （见 makeFixtureProject / makeFixtureScope）替代旧的内嵌演示配置。
// 命令级退出码端到端测试见 ./exit-codes.test.ts。

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoleRunArgs, parseTaskId } from "../../src/common/编排/args.ts";
import { formatEvent } from "../../src/common/编排/output.ts";
import { requireProjectConfig, requireTaskScope } from "../../src/common/编排/config.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";

// 测试夹具：模拟装配入口注入的“默认演示配置”。边界路径按 Governance 迁移后的
// YAML 固定格式指向 boundary.yaml（门禁引擎解析器以 .yaml/.yml 走严格 YAML）。
function makeFixtureProject(): ProjectConfig {
  const roles = {} as ProjectConfig["roles"];
  for (const id of ["项目管理", "编排", "门禁引擎", "Pi适配器", "装配", "测试"]) {
    roles[id] = { card: `角色卡/${id}/role-card.md`, boundary: `角色卡/${id}/boundary.yaml` };
  }
  return {
    projectRoot: "/repo",
    skillRoot: "/skills/ans-governed-construction",
    roles,
    governanceBoundary: {
      path: "角色卡/门禁引擎/boundary.yaml",
      acceptance: { accepted: true, source: "fixture:test-config" },
    },
  };
}

// 测试夹具：演示任务 T-1 的写集（编排边界 Section 1 的真子集）。
function makeFixtureScope(): TaskScope {
  return { writeSet: ["src/interface/cli/run.ts"], conditions: [] };
}

test("parseRoleRunArgs 解析角色与任务（带 role/run 前导词）", () => {
  assert.deepEqual(parseRoleRunArgs(["role", "run", "编排", "--task", "T-1"]), {
    roleId: "编排",
    taskId: "T-1",
    runtime: "",
    errors: [],
  });
});

test("parseRoleRunArgs 支持 --task= 形式且可省略前导词", () => {
  assert.deepEqual(parseRoleRunArgs(["--task=T-2", "门禁引擎"]), {
    roleId: "门禁引擎",
    taskId: "T-2",
    runtime: "",
    errors: [],
  });
});

test("parseRoleRunArgs 解析 --runtime（两种写法），非法值记为用法错误", () => {
  assert.deepEqual(parseRoleRunArgs(["编排", "--task", "T-1", "--runtime", "pi"]), {
    roleId: "编排",
    taskId: "T-1",
    runtime: "pi",
    errors: [],
  });
  assert.equal(parseRoleRunArgs(["编排", "--task", "T-1", "--runtime=demo"]).runtime, "demo");
  assert.ok(parseRoleRunArgs(["编排", "--task", "T-1", "--runtime", "bogus"]).errors.some((e) => /非法的 --runtime/.test(e)));
  assert.ok(parseRoleRunArgs(["编排", "--task", "T-1", "--runtime"]).errors.some((e) => /缺少值/.test(e)));
});

test("parseRoleRunArgs 缺角色与缺 --task 记为用法错误（不再回退演示值）", () => {
  const parsed = parseRoleRunArgs([]);
  assert.equal(parsed.roleId, "");
  assert.equal(parsed.taskId, "");
  assert.ok(parsed.errors.some((e) => /缺少角色 id/.test(e)));
  assert.ok(parsed.errors.some((e) => /缺少 --task/.test(e)));
});

test("parseRoleRunArgs 未知参数与多余裸词记为用法错误", () => {
  assert.ok(parseRoleRunArgs(["编排", "--task", "T-1", "--bogus"]).errors.some((e) => /未知参数/.test(e)));
  assert.ok(parseRoleRunArgs(["编排", "多余", "--task", "T-1"]).errors.some((e) => /多余参数/.test(e)));
});

test("parseRoleRunArgs 选项缺值记为用法错误", () => {
  assert.ok(parseRoleRunArgs(["编排", "--task"]).errors.some((e) => /缺少值/.test(e)));
  assert.ok(parseRoleRunArgs(["编排", "--task", "--bogus"]).errors.some((e) => /缺少值/.test(e)));
});

test("parseTaskId 取 --task，缺省回退", () => {
  assert.equal(parseTaskId(["govern", "--task", "T-9"], "T-1"), "T-9");
  assert.equal(parseTaskId([], "T-1"), "T-1");
});

test("requireProjectConfig 有注入值即原样返回", () => {
  const project = makeFixtureProject();
  assert.equal(requireProjectConfig(project), project);
});

test("requireProjectConfig 缺注入抛清晰错误（不回退演示副本）", () => {
  assert.throws(() => requireProjectConfig(undefined), /缺少 project 配置/);
});

test("requireTaskScope 缺注入抛清晰错误（不回退演示副本）", () => {
  assert.throws(() => requireTaskScope(undefined), /缺少 scope 配置/);
});

test("夹具（模拟装配演示配置）六个角色且边界路径用 .yaml", () => {
  const cfg = makeFixtureProject();
  assert.equal(Object.keys(cfg.roles).length, 6);
  assert.equal(cfg.roles["编排"].boundary, "角色卡/编排/boundary.yaml");
  for (const loc of Object.values(cfg.roles)) {
    assert.match(loc.boundary, /boundary\.yaml$/);
  }
  assert.match(cfg.governanceBoundary?.path ?? "", /boundary\.yaml$/);
});

test("夹具任务写集是编排边界的子集", () => {
  const scope = makeFixtureScope();
  assert.ok(scope.writeSet.includes("src/interface/cli/run.ts"));
});

test("formatEvent 拒绝事件按根分组列出允许路径", () => {
  const line = formatEvent({
    kind: "denied",
    summary: "拒绝写入 src/evil.ts",
    detail: {
      allowedByRoot: { skill: ["skill/foo.ts"], project: ["src/interface/cli/run.ts"] },
    },
  });
  assert.match(line, /\[denied\] 拒绝写入 src\/evil\.ts/);
  assert.match(line, /允许路径（按根分组）：/);
  assert.match(line, /skill:/);
  assert.match(line, /- skill\/foo\.ts/);
  assert.match(line, /project:/);
  assert.match(line, /- src\/interface\/cli\/run\.ts/);
});

test("formatEvent 无 detail 时只输出一行", () => {
  assert.equal(formatEvent({ kind: "settled", summary: "完成" }), "[settled] 完成");
});
