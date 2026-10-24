// test/桌面UI/profile-docs.test.ts
// S4 纯逻辑：角色根文档 / docs/ 分组、顺序、计数、空态、显示兜底过滤、
// S5 标签 key 消费与 relativePath 精确匹配。无 DOM/无 Electron。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ROOT_DOC_LABEL_KEYS,
  docsIndexMarkdown,
  matchDocumentRefByPath,
  profileDocsView,
  roleDocsEntries,
  roleRootDocs,
  rootDocDisplayName,
  rootDocLabelKey,
  rootDocOpenText,
} from "../../app/renderer/src/chat/profile-docs.ts";
import { translate } from "../../app/renderer/src/i18n/index.ts";
import type { DocumentRef } from "../../app/renderer/src/chat/document-view.ts";

const P = "角色卡/A/";
const THREE_ROOTS = [
  { name: "feature-map.md", path: P + "feature-map.md", kind: "file" },
  { name: "functional-description.md", path: P + "functional-description.md", kind: "file" },
  { name: "api-spec.md", path: P + "api-spec.md", kind: "file" },
];
const DOCS = [
  { path: "docs/design", kind: "directory" },
  { path: "docs/design/one.md", kind: "file" },
  { path: "docs/two.md", kind: "file" },
];

function ref(relativePath: string, documentId: string): DocumentRef {
  return {
    version: 1,
    projectViewId: "epoch-one",
    documentId,
    roleId: "A",
    relativePath,
    label: relativePath.split("/").pop() || relativePath,
    format: "markdown",
  };
}

test("3 根文档 + N docs：两组、后端顺序、count 不计目录", () => {
  const view = profileDocsView({ roleId: "A", rootDocs: THREE_ROOTS, docs: DOCS });
  assert.deepEqual(
    view.rootDocs.map((doc) => doc.name),
    ["feature-map.md", "functional-description.md", "api-spec.md"],
  );
  assert.deepEqual(
    view.docsEntries.map((entry) => entry.path),
    ["docs/design", "docs/design/one.md", "docs/two.md"],
  );
  assert.equal(view.docsFiles, 2);
  assert.equal(view.count, 5);
  assert.equal(view.isEmpty, false);
});

test("3 根文档 + 0 docs：只显示根文档组，不显示整节空", () => {
  const view = profileDocsView({ roleId: "A", rootDocs: THREE_ROOTS, docs: [] });
  assert.equal(view.rootDocs.length, 3);
  assert.equal(view.docsEntries.length, 0);
  assert.equal(view.count, 3);
  assert.equal(view.isEmpty, false);
});

test("0 根文档 + N docs：只显示 docs 组", () => {
  const view = profileDocsView({ roleId: "A", docs: DOCS });
  assert.equal(view.rootDocs.length, 0);
  assert.equal(view.docsEntries.length, 3);
  assert.equal(view.count, 2);
  assert.equal(view.isEmpty, false);
});

test("两组都空/内置角色/旧 main：诚实空态，不伪造", () => {
  for (const role of [
    { roleId: "A", rootDocs: [], docs: [] },
    { roleId: "governance", builtIn: true },
    { roleId: "old-main", docs: undefined },
    null,
    {},
  ]) {
    const view = profileDocsView(role);
    assert.deepEqual(view.rootDocs, []);
    assert.deepEqual(view.docsEntries, []);
    assert.equal(view.count, 0);
    assert.equal(view.isEmpty, true);
  }
});

test("部分根文档缺失：只显示存在项，顺序保持相对", () => {
  const partial = [THREE_ROOTS[0], THREE_ROOTS[2]];
  const view = profileDocsView({ roleId: "A", rootDocs: partial, docs: [] });
  assert.deepEqual(
    view.rootDocs.map((doc) => doc.name),
    ["feature-map.md", "api-spec.md"],
  );
  assert.equal(view.count, 2);
});

test("显示兜底：memo/role-card/boundary/目录/空路径/重复路径不渲染", () => {
  const messy = [
    { name: "memo.md", path: P + "memo.md", kind: "file" },
    { name: "role-card.md", path: P + "role-card.md", kind: "file" },
    { name: "boundary.yaml", path: P + "boundary.yaml", kind: "file" },
    { name: "boundary.md", path: P + "boundary.md", kind: "file" },
    { name: "feature-map.md", path: P + "feature-map.md", kind: "directory" },
    { name: "feature-map.md", path: "   ", kind: "file" },
    { name: "", path: P + "functional-description.md", kind: "file" },
    { name: "api-spec.md", path: P + "api-spec.md", kind: "file" },
    { name: "api-spec.md", path: P + "api-spec.md", kind: "file" },
  ];
  const view = roleRootDocs({ roleId: "A", rootDocs: messy });
  assert.deepEqual(view, [
    { name: "functional-description.md", path: P + "functional-description.md" },
    { name: "api-spec.md", path: P + "api-spec.md" },
  ]);
  // 即使后端异常传入 memo，也不在两组中渲染。
  assert.equal(
    profileDocsView({ roleId: "A", rootDocs: messy, docs: [] }).rootDocs.some(
      (doc) => doc.name === "memo.md",
    ),
    false,
  );
});

test("展示名：优先后端 name；缺失时只取 path 末段（不构造路径）", () => {
  assert.equal(rootDocDisplayName({ name: "api-spec.md", path: P + "api-spec.md" }), "api-spec.md");
  assert.equal(rootDocDisplayName({ path: P + "feature-map.md" }), "feature-map.md");
  assert.equal(rootDocDisplayName({ path: "feature-map.md" }), "feature-map.md");
  assert.equal(rootDocDisplayName({}), "");
});

test("docs 条目：畸形项丢弃、目录/文件标记稳定、路径原样（角色相对）", () => {
  const entries = roleDocsEntries({
    docs: [
      { path: "docs/a", kind: "directory" },
      { path: "docs/a.md" },
      { path: "", kind: "file" },
      { path: "docs/b.md", kind: "file" },
      null,
    ],
  });
  assert.deepEqual(entries, [
    { path: "docs/a", kind: "directory" },
    { path: "docs/a.md", kind: "file" },
    { path: "docs/b.md", kind: "file" },
  ]);
});

test("docs Markdown 列表沿用既有形状：顺序不变、目录带尾斜杠", () => {
  assert.equal(
    docsIndexMarkdown(roleDocsEntries({ docs: DOCS })),
    "- docs/design/\n- docs/design/one.md\n- docs/two.md",
  );
  assert.equal(docsIndexMarkdown([]), "");
});

test("S5 标签 key：4 必需 + 3 可选副标签 zh/en 可用；文件名不翻译", () => {
  assert.deepEqual(ROOT_DOC_LABEL_KEYS, {
    "feature-map.md": "ui.profile.rootDoc.featureMap",
    "functional-description.md": "ui.profile.rootDoc.functionalDescription",
    "api-spec.md": "ui.profile.rootDoc.apiSpec",
  });
  assert.equal(rootDocLabelKey("feature-map.md"), "ui.profile.rootDoc.featureMap");
  assert.equal(rootDocLabelKey("memo.md"), null);
  assert.equal(rootDocLabelKey("other.md"), null);
  assert.equal(translate("zh-CN", "ui.profile.docsGroupRoot"), "角色根文档");
  assert.equal(translate("zh-CN", "ui.profile.docsGroupSubdir"), "docs/ 目录");
  assert.equal(translate("zh-CN", "ui.profile.noRoleDocs"), "（暂无角色文档）");
  assert.equal(translate("en-US", "ui.profile.docsGroupRoot"), "Role root documents");
  assert.equal(translate("en-US", "ui.profile.docsGroupSubdir"), "docs/ directory");
  assert.equal(translate("en-US", "ui.profile.noRoleDocs"), "(no role documents)");
  assert.equal(translate("zh-CN", "ui.profile.rootDoc.featureMap"), "功能导航");
  assert.equal(translate("en-US", "ui.profile.rootDoc.apiSpec"), "API / implementation report");
});

test("打开文案：openRootDoc + 原样文件名（zh/en 均保留文件名）", () => {
  assert.equal(rootDocOpenText("feature-map.md"), "只读打开 feature-map.md");
  assert.equal(rootDocOpenText("api-spec.md", "en-US"), "Open api-spec.md read-only");
  // 文件名是内容标识，不随语言变化。
  assert.equal(rootDocOpenText("api-spec.md").includes("api-spec.md"), true);
  assert.equal(rootDocOpenText("api-spec.md", "en-US").includes("api-spec.md"), true);
});

test("relativePath 精确匹配：只认完全相等的 opaque ref", () => {
  const refs = [
    ref(P + "feature-map.md", "root-1"),
    ref(P + "docs/one.md", "doc-1"),
    ref(P + "feature-map.md.bak.md", "root-x"),
  ];
  const matched = matchDocumentRefByPath(refs, P + "feature-map.md");
  assert.equal(matched?.documentId, "root-1");
  assert.equal(matchDocumentRefByPath(refs, P + "feature-map.md "), null);
  assert.equal(matchDocumentRefByPath(refs, P + "feature-map"), null);
  assert.equal(matchDocumentRefByPath(refs, ""), null);
  assert.equal(matchDocumentRefByPath([], P + "feature-map.md"), null);
});

test("api-spec 的 not-applicable 不进入视图模型：条目仍按普通根文档展示", () => {
  const view = profileDocsView({
    roleId: "A",
    rootDocs: [{ name: "api-spec.md", path: P + "api-spec.md", kind: "file" }],
    docs: [],
  });
  assert.deepEqual(view.rootDocs, [{ name: "api-spec.md", path: P + "api-spec.md" }]);
  assert.equal(view.count, 1);
  assert.equal("notApplicable" in view.rootDocs[0], false);
  assert.equal("badge" in view.rootDocs[0], false);
});

test("source-guard：纯展示模块不 import Node/fs/electron/网络，不触碰 window", () => {
  const file = fileURLToPath(
    new URL("../../app/renderer/src/chat/profile-docs.ts", import.meta.url),
  );
  const source = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal(/from\s+["'](node:|electron["']|fs["']|path["']|child_process["']|https?["'])/.test(source), false);
  assert.equal(/\brequire\s*\(/.test(source), false);
  assert.equal(/\bwindow\./.test(source), false);
  assert.equal(/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(source), false);
  assert.equal(/dangerouslySetInnerHTML|document\./.test(source), false);
});
