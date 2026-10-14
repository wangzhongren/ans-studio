import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse } from "yaml";

import {
  buildDemoProjectConfig,
  buildDemoTaskScope,
  resolveProjectRoot,
  DEMO_ACCEPTANCE,
} from "../../src/index.ts";
import { DEMO_SCRIPT } from "../../src/common/装配/demo-runtime.ts";

const PROJECT_ROOT = resolveProjectRoot();

function read(rel: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, rel), "utf8");
}

/**
 * 从某角色边界 YAML（固定格式）里抽出项目相对路径（以 src/ 或 test/ 开头的 entries）。
 * 边界格式已由 Governance 迁移为 YAML；此处直接解析配置文件**实际引用**的那份边界，
 * 保证测试校验的是单一来源（内嵌配置的 boundary 路径）。
 */
function readBoundaryPaths(boundaryRel: string): string[] {
  const doc = parse(read(boundaryRel)) as { entries?: Array<{ path?: unknown }> };
  const entries = doc?.entries ?? [];
  const found: string[] = [];
  for (const entry of entries) {
    const p = entry.path;
    if (typeof p === "string" && (p.startsWith("src/") || p.startsWith("test/"))) {
      found.push(p);
    }
  }
  return found;
}

test("内嵌配置含原六个及三个运行时角色的真实 card/boundary 映射", () => {
  const project = buildDemoProjectConfig();
  const ids = Object.keys(project.roles).sort();
  assert.deepEqual(
    ids,
    ["Pi适配器", "门禁引擎", "编排", "测试", "项目管理", "装配", "运行时核心", "Codex适配器", "Claude适配器"].sort(),
  );
  for (const [roleId, loc] of Object.entries(project.roles)) {
    assert.ok(
      fs.existsSync(path.join(PROJECT_ROOT, loc.card)),
      `${roleId} 的 card 不存在：${loc.card}`,
    );
    assert.ok(
      fs.existsSync(path.join(PROJECT_ROOT, loc.boundary)),
      `${roleId} 的 boundary 不存在：${loc.boundary}`,
    );
    // 边界格式已迁移为 YAML 固定格式：boundary 一律指向 .yaml。
    assert.match(loc.boundary, /\.yaml$/, `${roleId} 的 boundary 应为 .yaml：${loc.boundary}`);
  }
});

test("projectRoot 解析到仓库根（含 package.json 与 src/index.ts）", () => {
  assert.ok(fs.existsSync(path.join(PROJECT_ROOT, "package.json")));
  assert.ok(fs.existsSync(path.join(PROJECT_ROOT, "src", "index.ts")));
});

test("T-1 的 writeSet 是演示角色“编排”边界的真子集（用于演示 F4）", () => {
  const project = buildDemoProjectConfig();
  const scope = buildDemoTaskScope();
  const boundaryPaths = readBoundaryPaths(project.roles["编排"].boundary);
  assert.ok(boundaryPaths.length > 0, "应能从编排边界解析出路径");

  // 子集：writeSet 每项都在编排边界内。
  for (const p of scope.writeSet) {
    assert.ok(boundaryPaths.includes(p), `writeSet 项不在编排边界内：${p}`);
  }
  // 真子集：至少存在一个边界内文件不在 writeSet 内（否则演示不了 F4）。
  const inBoundaryNotInWriteSet = boundaryPaths.filter((p) => !scope.writeSet.includes(p));
  assert.ok(inBoundaryNotInWriteSet.length > 0, "writeSet 应为真子集，需存在边界内但 writeSet 外的路径");
});

test("演示任务 scope 携带 conditions（门禁引擎新增字段），编排边界无 conditional-directory 故为空", () => {
  const scope = buildDemoTaskScope();
  assert.ok(Array.isArray(scope.conditions), "scope.conditions 必须是数组");
  assert.deepEqual(scope.conditions, [], "编排边界无 conditional-directory 条目，演示任务不声明条件");
});

test("演示脚本两笔写入分别演示 F5/F10 与 F4", () => {
  const project = buildDemoProjectConfig();
  const scope = buildDemoTaskScope();
  const boundaryPaths = readBoundaryPaths(project.roles["编排"].boundary);
  assert.equal(DEMO_SCRIPT.length, 2);

  const outOfBoundary = String((DEMO_SCRIPT[0].args as Record<string, unknown>).path);
  const inBoundaryOutWriteSet = String((DEMO_SCRIPT[1].args as Record<string, unknown>).path);

  // 第一笔：完全落在边界之外（F5/F10）。
  assert.ok(!boundaryPaths.includes(outOfBoundary), `第一笔应在边界外：${outOfBoundary}`);
  // 第二笔：命中边界（目录条目 src/common/编排/），但不在 writeSet（F4）。
  assert.ok(
    boundaryPaths.includes("src/common/编排/"),
    "编排边界应含 src/common/编排/ 目录条目",
  );
  assert.ok(
    inBoundaryOutWriteSet.startsWith("src/common/编排/"),
    `第二笔应落在 src/common/编排/ 目录下：${inBoundaryOutWriteSet}`,
  );
  assert.ok(!scope.writeSet.includes(inBoundaryOutWriteSet), "第二笔应不在 writeSet 内");
});

test("边界接受证据如实标注演示来源，且不由程序自行判定", () => {
  assert.equal(DEMO_ACCEPTANCE.accepted, true);
  assert.ok(DEMO_ACCEPTANCE.source.length > 0);
  assert.match(DEMO_ACCEPTANCE.source, /demo/);
  // 每个角色边界携带同一演示来源。
  const project = buildDemoProjectConfig();
  for (const loc of Object.values(project.roles)) {
    const acceptance = (loc as { acceptance?: { accepted: boolean; source: string } }).acceptance;
    assert.ok(acceptance, "角色条目应携带演示 acceptance");
    assert.equal(acceptance?.source, DEMO_ACCEPTANCE.source);
  }
});
