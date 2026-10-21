// test/桌面UI/document-view.test.ts
// Phase 4A 纯逻辑：错误码→人话、相对/外部链接解析、读取请求/回包形状与
// scope/version 校验、可重试判定、已列文档 ref 解析。

import test from "node:test";
import assert from "node:assert/strict";
import {
  canRetryDocument,
  documentErrorText,
  documentReadRequest,
  documentReadableRef,
  documentSourceTitle,
  documentStatusText,
  resolveDocumentLink,
  roleDocumentRefs,
  validateDocumentReadResult,
  type DocumentRef,
  type DocumentScope,
} from "../../app/renderer/src/chat/document-view.ts";

const scope: DocumentScope = { version: 1, projectViewId: "epoch-one", projectRoot: "/p" };
const refs: DocumentRef[] = [
  {
    version: 1,
    projectViewId: "epoch-one",
    documentId: "doc-one",
    roleId: "A",
    relativePath: "角色卡/A/docs/one.md",
    label: "报告 1",
    format: "markdown",
  },
  {
    version: 1,
    projectViewId: "epoch-one",
    documentId: "doc-two",
    roleId: "A",
    relativePath: "角色卡/A/docs/two.md",
    label: "报告 2",
    format: "text",
  },
];

test("错误码文案与旧实现逐字一致；未知码保守如实", () => {
  assert.equal(documentErrorText("PROJECT_NOT_GRANTED"), "尚未获得当前项目的文档读取许可，请重新选择项目文件夹。");
  assert.equal(documentErrorText("TOO_LARGE"), "文档超过256KiB，无法在此预览。");
  assert.equal(documentErrorText("CHANGED_DURING_READ"), "读取期间文档发生变化，请重新选择。");
  assert.equal(documentErrorText("UNSUPPORTED_ENVIRONMENT"), "当前环境暂不支持安全读取项目文档。");
  assert.equal(documentErrorText("IO_ERROR"), "文档读取失败。");
  assert.equal(documentErrorText("SOMETHING_NEW"), "无法读取此文档。");
  assert.equal(documentErrorText(undefined), "无法读取此文档。");
});

test("可重试错误码：IO/变化/不存在/权限", () => {
  assert.equal(canRetryDocument("IO_ERROR"), true);
  assert.equal(canRetryDocument("CHANGED_DURING_READ"), true);
  assert.equal(canRetryDocument("NOT_FOUND"), true);
  assert.equal(canRetryDocument("PERMISSION_DENIED"), true);
  assert.equal(canRetryDocument("TOO_LARGE"), false);
  assert.equal(canRetryDocument("BINARY_CONTENT"), false);
});

test("可读判定：scope 必须存在且 projectViewId 与 ref 精确一致", () => {
  assert.equal(documentReadableRef(refs[0], scope), true);
  assert.equal(documentReadableRef(refs[0], null), false);
  assert.equal(documentReadableRef({ ...refs[0], projectViewId: "old" }, scope), false);
  assert.equal(documentReadableRef({ ...refs[0], documentId: "" }, scope), false);
});

test("读取请求：只用 opaque projectViewId/documentId", () => {
  assert.deepEqual(documentReadRequest(refs[0], scope), {
    version: 1,
    projectViewId: "epoch-one",
    documentId: "doc-one",
  });
  assert.equal(documentReadRequest(refs[0], null), null);
});

test("回包校验：成功形状与回显必须精确匹配", () => {
  const request = documentReadRequest(refs[0], scope);
  const good = {
    ok: true,
    version: 1,
    projectViewId: "epoch-one",
    documentId: "doc-one",
    roleId: "A",
    relativePath: "角色卡/A/docs/one.md",
    format: "markdown",
    byteLength: 12,
    text: "# 正文",
  };
  const valid = validateDocumentReadResult(good, request, refs[0], scope);
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.result.text, "# 正文");
    assert.equal(valid.result.byteLength, 12);
  }
  assert.equal(
    validateDocumentReadResult({ ...good, documentId: "doc-two" }, request, refs[0], scope).ok,
    false,
  );
  assert.equal(
    validateDocumentReadResult({ ...good, roleId: "B" }, request, refs[0], scope).ok,
    false,
  );
  assert.equal(
    validateDocumentReadResult({ ...good, format: "html" }, request, refs[0], scope).ok,
    false,
  );
  assert.equal(
    validateDocumentReadResult({ ...good, version: 2 }, request, refs[0], scope).ok,
    false,
  );
  const tooLarge = { ok: false, version: 1, projectViewId: "epoch-one", documentId: "doc-one", code: "TOO_LARGE" };
  const failed = validateDocumentReadResult(tooLarge, request, refs[0], scope);
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.code, "TOO_LARGE");
  assert.equal(documentStatusText(valid.ok ? valid.result : null), "只读文档 · 12 字节");
  assert.equal(documentStatusText(null), "");
});

test("链接解析：http(s) 外开；相对链接命中已列文档则内部打开", () => {
  const external = resolveDocumentLink("https://example.com/x", refs[0].relativePath, refs);
  assert.deepEqual(external, { kind: "external", url: "https://example.com/x" });
  const relative = resolveDocumentLink("./two.md", refs[0].relativePath, refs);
  assert.equal(relative.kind, "internal");
  if (relative.kind === "internal") assert.equal(relative.ref.documentId, "doc-two");
  const sibling = resolveDocumentLink("/角色卡/A/docs/two.md", refs[0].relativePath, refs);
  assert.equal(sibling.kind, "internal");
  const missing = resolveDocumentLink("./missing.md", refs[0].relativePath, refs);
  assert.deepEqual(missing, { kind: "unavailable" });
  const javascript = resolveDocumentLink("javascript:alert(1)", refs[0].relativePath, refs);
  assert.deepEqual(javascript, { kind: "unavailable" });
  assert.deepEqual(resolveDocumentLink("", refs[0].relativePath, refs), { kind: "none" });
  const decoded = resolveDocumentLink("./%E4%B8%AD%E6%96%87.md", "角色卡/A/docs/one.md", [
    { ...refs[0], relativePath: "角色卡/A/docs/中文.md" },
  ]);
  assert.equal(decoded.kind, "internal");
});

test("已列文档 ref：畸形条目丢弃，不猜路径", () => {
  const refsFromListing = roleDocumentRefs({
    roleId: "A",
    documents: [
      ...refs,
      { documentId: "", projectViewId: "e", relativePath: "x", roleId: "A" },
      { documentId: "d", projectViewId: "e", relativePath: "", roleId: "A" },
      { documentId: "d2", projectViewId: "e", relativePath: "y" },
    ],
  });
  assert.equal(refsFromListing.length, 2);
  assert.equal(refsFromListing[0].label, "报告 1");
  assert.deepEqual(roleDocumentRefs({}), []);
  assert.deepEqual(roleDocumentRefs(null), []);
});

test("来源文档标题：角色名 · 来源文档", () => {
  assert.equal(documentSourceTitle("A"), "A · 来源文档");
  assert.equal(documentSourceTitle(""), "角色 · 来源文档");
});
