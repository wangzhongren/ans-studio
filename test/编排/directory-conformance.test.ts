// test/编排/directory-conformance.test.ts
// 2026-10-23 目录级授权：**实际布局核对纯函数** `directory-conformance.ts` 的正/负矩阵
// （策划方案 §6.1–§6.3、§8.2；Q12 A）。
//
// 纯离线：不读 git、不写报告、不访问真实候选；只把改动路径与目录规范做确定性核对。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkDirectoryLayout,
  layoutCheckPassed,
  type LayoutCheckInput,
} from "../../src/common/编排/directory-conformance.ts";
import type { DirectorySpec } from "../../src/common/编排/team-plan.ts";

const API_DIR: DirectorySpec = {
  dir: "src/checkout/api/",
  owner: "checkout-api",
  kind: "implementation",
  purpose: "结算 API 与订单状态",
  naming: "kebab-case",
  subdirs: ["handlers", "models"],
  extensions: [".ts"],
  contract: "docs/contracts/checkout-v1.md",
  testSurface: ["test/checkout/api/"],
  dependencies: [],
  forbidden: [".env", "*.log", "dist/"],
  shared: "none",
};

const API_TESTS: DirectorySpec = {
  dir: "test/checkout/api/",
  owner: "checkout-api",
  kind: "tests",
  purpose: "结算 API 单元/层测试",
  naming: "*.test.ts",
  subdirs: "—",
  extensions: [".ts"],
  contract: "internal（消费 checkout 契约）",
  testSurface: ["test/checkout/api/"],
  dependencies: ["src/checkout/api/"],
  forbidden: ["dist/"],
  shared: "none",
};

const WEB_DIR: DirectorySpec = {
  dir: "src/checkout/web/",
  owner: "checkout-web",
  kind: "implementation",
  purpose: "结算页面与交互",
  naming: "PascalCase",
  subdirs: "**",
  extensions: [".tsx", ".ts"],
  contract: "docs/contracts/checkout-v1.md",
  testSurface: ["test/checkout/web/"],
  dependencies: [],
  forbidden: [".env"],
  shared: "none",
};

/** 更短的父目录规范：用于验证「最长前缀匹配 owner」。 */
const CHECKOUT_ROOT: DirectorySpec = {
  dir: "src/checkout/",
  owner: "checkout-lead",
  kind: "shared",
  purpose: "结算模块共享只读说明",
  naming: "any",
  subdirs: "**",
  extensions: [".md"],
  contract: "internal（模块总览）",
  testSurface: ["test/checkout/"],
  dependencies: [],
  forbidden: [],
  shared: "read-only",
};

const SPECS: DirectorySpec[] = [CHECKOUT_ROOT, API_DIR, API_TESTS, WEB_DIR];

function roleDirsOf(specs: readonly DirectorySpec[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const spec of specs) {
    const list = map.get(spec.owner) ?? [];
    list.push(spec.dir);
    map.set(spec.owner, list);
  }
  return map;
}

const ROLE_DIRS = roleDirsOf(SPECS);

function check(changedPaths: string[], over: Partial<LayoutCheckInput> = {}) {
  return checkDirectoryLayout({
    changedPaths,
    specs: SPECS,
    roleDirs: ROLE_DIRS,
    ...over,
  });
}

function rowOf(path: string, over: Partial<LayoutCheckInput> = {}) {
  const result = check([path], over);
  assert.equal(result.rows.length, 1);
  return result.rows[0]!;
}

test("目录内新增文件/子目录 pass：owner/类型/子目录/命名/禁写区全部通过", () => {
  const result = check([
    "src/checkout/api/handlers/create-order.ts",
    "src/checkout/api/models/order.ts",
    "src/checkout/api/index.ts",
    "test/checkout/api/price.test.ts",
    "src/checkout/web/CheckoutPage.tsx",
  ]);
  assert.equal(result.ok, true, JSON.stringify(result.rows.filter((row) => row.result === "fail"), null, 2));
  for (const row of result.rows) assert.equal(row.result, "pass", row.reason ?? "");
  assert.equal(rowOf("src/checkout/api/handlers/create-order.ts").owner, "checkout-api");
  assert.equal(layoutCheckPassed(result), true);
});

test("最长前缀匹配 owner：子目录规范优先于父目录规范", () => {
  const row = rowOf("src/checkout/api/handlers/create-order.ts");
  assert.equal(row.owner, "checkout-api");
  assert.equal(row.dir, "src/checkout/api/");
  const docRow = rowOf("src/checkout/README.md");
  assert.equal(docRow.owner, "checkout-lead");
  assert.equal(docRow.dir, "src/checkout/");
});

test("不在任何授权目录 / 跨目录 他人目录 fail", () => {
  const outside = rowOf("src/unknown/file.ts");
  assert.equal(outside.result, "fail");
  assert.match(outside.reason ?? "", /不在任何授权目录/);

  // 指定本次角色：路径属于其他角色目录 ⇒ fail（Map 角色自检口径）。
  const other = rowOf("src/checkout/web/CheckoutPage.tsx", { projectRoot: undefined });
  assert.equal(other.result, "pass");
  const scoped = checkDirectoryLayout({
    changedPaths: ["src/checkout/web/CheckoutPage.tsx"],
    specs: SPECS,
    roleDirs: ROLE_DIRS,
    roleId: "checkout-api",
  });
  assert.equal(scoped.rows[0]!.result, "fail");
  assert.match(scoped.rows[0]!.reason ?? "", /属于角色 checkout-web 的目录（非本次角色 checkout-api）/);
});

test("roleDirs 与目录规范 owner 不一致 ⇒ fail", () => {
  const scoped = checkDirectoryLayout({
    changedPaths: ["src/checkout/api/handlers/create-order.ts"],
    specs: SPECS,
    roleDirs: new Map([["checkout-api", ["test/checkout/api/"]]]),
  });
  assert.equal(scoped.rows[0]!.result, "fail");
  assert.match(scoped.rows[0]!.reason ?? "", /roleDirs 未包含/);
});

test("禁写区命中 fail：.env / *.log / dist/ 前缀", () => {
  for (const path of [
    "src/checkout/api/.env",
    "src/checkout/api/debug.log",
    "src/checkout/api/dist/bundle.ts",
  ]) {
    const row = rowOf(path);
    assert.equal(row.result, "fail", path);
    assert.match(row.reason ?? "", /禁写区/, path);
  }
});

test("命名不符 fail：kebab-case / PascalCase / *.test.ts", () => {
  assert.match(rowOf("src/checkout/api/handlers/CreateOrder.ts").reason ?? "", /命名规范「kebab-case」/);
  assert.match(rowOf("src/checkout/api/handlers/create_order.ts").reason ?? "", /命名规范「kebab-case」/);
  assert.match(rowOf("src/checkout/web/checkout-page.ts").reason ?? "", /命名规范「PascalCase」/);
  assert.match(rowOf("test/checkout/api/price.ts").reason ?? "", /命名规范「\*\.test\.ts」/);
  // 目录名同样按命名规则核对。
  assert.match(rowOf("src/checkout/api/BadDir/create.ts").reason ?? "", /子目录|目录名不符合命名规范/);
});

test("子目录越界 fail：— / 显式列表 / * 一层 / ** 任意层", () => {
  assert.match(rowOf("src/checkout/api/other/create.ts").reason ?? "", /超出「允许子目录」/);
  assert.match(rowOf("test/checkout/api/nested/price.test.ts").reason ?? "", /超出「允许子目录」/);

  const oneLevel: DirectorySpec = {
    ...API_DIR,
    dir: "src/one/",
    subdirs: "*",
  };
  const deep = checkDirectoryLayout({
    changedPaths: ["src/one/a/b/file.ts"],
    specs: [oneLevel],
    roleDirs: new Map([["checkout-api", ["src/one/"]]]),
  });
  assert.equal(deep.rows[0]!.result, "fail");
  assert.match(deep.rows[0]!.reason ?? "", /超出「允许子目录」/);

  const anyLevel: DirectorySpec = { ...API_DIR, dir: "src/any/", subdirs: "**" };
  const deepAny = checkDirectoryLayout({
    changedPaths: ["src/any/a/b/file.ts"],
    specs: [anyLevel],
    roleDirs: new Map([["checkout-api", ["src/any/"]]]),
  });
  assert.equal(deepAny.rows[0]!.result, "pass", deepAny.rows[0]!.reason ?? "");
});

test("扩展名不符 fail：implementation 不允许 *；docs 允许 *", () => {
  assert.match(rowOf("src/checkout/api/handlers/create.js").reason ?? "", /扩展名「\.js」不在允许文件类型/);
  const wildcardImplementation: DirectorySpec = { ...API_DIR, dir: "src/wild/", extensions: ["*"] };
  const rejected = checkDirectoryLayout({
    changedPaths: ["src/wild/a.ts"],
    specs: [wildcardImplementation],
    roleDirs: new Map([["checkout-api", ["src/wild/"]]]),
  });
  assert.equal(rejected.rows[0]!.result, "fail");
  assert.match(rejected.rows[0]!.reason ?? "", /不在允许文件类型/);
  const docsWildcard: DirectorySpec = { ...API_DIR, dir: "docs/checkout/", kind: "docs", extensions: ["*"] };
  const allowed = checkDirectoryLayout({
    changedPaths: ["docs/checkout/design.md"],
    specs: [docsWildcard],
    roleDirs: new Map([["checkout-api", ["docs/checkout/"]]]),
  });
  assert.equal(allowed.rows[0]!.result, "pass", allowed.rows[0]!.reason ?? "");
});

test("路径逃逸 fail：.. / 绝对路径 / 盘符 / UNC / 尾随空格或点", () => {
  for (const path of [
    "../outside/file.ts",
    "src/checkout/api/../../outside.ts",
    "/etc/passwd",
    "C:/Windows/file.ts",
    "//server/share/file.ts",
    "src/checkout/api/handlers/bad /file.ts",
    "src/checkout/api/handlers/bad./file.ts",
  ]) {
    const row = rowOf(path);
    assert.equal(row.result, "fail", path);
    assert.equal(row.checks.pathSafe, false, path);
    assert.match(row.reason ?? "", /路径不安全/, path);
  }
});

test("多 owner（重叠目录）fail：最长前缀出现两个不同 owner", () => {
  const duplicate: DirectorySpec = { ...API_DIR, owner: "checkout-web" };
  const result = checkDirectoryLayout({
    changedPaths: ["src/checkout/api/handlers/create.ts"],
    specs: [API_DIR, duplicate],
    roleDirs: new Map([
      ["checkout-api", ["src/checkout/api/"]],
      ["checkout-web", ["src/checkout/api/"]],
    ]),
  });
  assert.equal(result.rows[0]!.result, "fail");
  assert.match(result.rows[0]!.reason ?? "", /匹配到多个目录\/owner/);
});

test("shared: split 父目录本身不可直接写入", () => {
  const splitParent: DirectorySpec = { ...CHECKOUT_ROOT, dir: "src/split/", shared: "split", subdirs: ["a"] };
  const child: DirectorySpec = { ...API_DIR, dir: "src/split/a/" };
  const parentWrite = checkDirectoryLayout({
    changedPaths: ["src/split/file.md"],
    specs: [splitParent, child],
    roleDirs: new Map([["checkout-api", ["src/split/a/"]]]),
  });
  assert.equal(parentWrite.rows[0]!.result, "fail");
  assert.match(parentWrite.rows[0]!.reason ?? "", /shared: split 父目录/);
  const childWrite = checkDirectoryLayout({
    changedPaths: ["src/split/a/create.ts"],
    specs: [splitParent, child],
    roleDirs: new Map([["checkout-api", ["src/split/a/"]]]),
  });
  assert.equal(childWrite.rows[0]!.result, "pass", childWrite.rows[0]!.reason ?? "");
});

test("删除按原路径核对：自己目录内 pass，他人目录 fail；解析 git status 前缀", () => {
  const own = check(["D  src/checkout/api/handlers/create-order.ts"]);
  assert.equal(own.rows[0]!.result, "pass", own.rows[0]!.reason ?? "");
  assert.equal(own.rows[0]!.deleted, true);
  assert.equal(own.rows[0]!.owner, "checkout-api");

  const foreign = checkDirectoryLayout({
    changedPaths: ["D  src/checkout/web/CheckoutPage.tsx"],
    specs: SPECS,
    roleDirs: ROLE_DIRS,
    roleId: "checkout-api",
  });
  assert.equal(foreign.rows[0]!.result, "fail");
  assert.match(foreign.rows[0]!.reason ?? "", /属于角色 checkout-web 的目录/);

  const gone = check(["D  src/unknown/old.ts"]);
  assert.equal(gone.rows[0]!.result, "fail");
  assert.match(gone.rows[0]!.reason ?? "", /不在任何授权目录/);
});

test("重命名按新路径核对：新路径合规 pass；跨目录重命名 fail", () => {
  const renamed = check(["R  src/checkout/api/handlers/old.ts -> src/checkout/api/handlers/new.ts"]);
  assert.equal(renamed.rows[0]!.result, "pass", renamed.rows[0]!.reason ?? "");
  assert.equal(renamed.rows[0]!.path, "src/checkout/api/handlers/new.ts");

  const crossing = checkDirectoryLayout({
    changedPaths: ["R  src/checkout/api/handlers/old.ts -> src/checkout/web/Old.ts"],
    specs: SPECS,
    roleDirs: ROLE_DIRS,
    roleId: "checkout-api",
  });
  assert.equal(crossing.rows[0]!.result, "fail");
  assert.match(crossing.rows[0]!.reason ?? "", /属于角色 checkout-web 的目录/);
});

test("管理记录与角色根工作文档跳过（不参与布局核对）", () => {
  const result = check([
    "docs/communication/intent.md",
    "docs/planning/design.md",
    "docs/scheduling/team-v1.md",
    "docs/acceptance/criteria.md",
    "角色卡/编排/docs/feature/x.md",
    "角色卡/编排/boundary.md",
  ]);
  assert.equal(result.rows.length, 6);
  for (const row of result.rows) {
    assert.equal(row.skipped, true);
    assert.equal(row.result, "pass");
    assert.equal(row.owner, undefined);
  }
  assert.equal(result.ok, true);
});

test("projectRoot（可选）realpath 核对：项目内路径 pass", () => {
  const result = checkDirectoryLayout({
    changedPaths: ["src/checkout/api/handlers/create-order.ts"],
    specs: SPECS,
    roleDirs: ROLE_DIRS,
    projectRoot: process.cwd(),
  });
  assert.equal(result.rows[0]!.result, "pass", result.rows[0]!.reason ?? "");
  assert.equal(result.rows[0]!.checks.pathSafe, true);
});
