import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createProjectDocumentReader } from "../../src/pipeline/project-document/read-project-document.ts";
import { createProjectDocumentService } from "../../src/service/project-document/public/read-project-document.ts";
import { createProjectDocumentFileReader } from "../../src/provider/project-document/public/file-reader.ts";
import type { ProjectDocumentRoleCandidates, ProjectDocumentRef } from "../../src/model/project-document.ts";

test("independent B: native grant, opaque reference, actual bounded file reads, revocation and project switch", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-doc-")));
  const nextRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-doc-next-")));
  const reader = createProjectDocumentReader();
  const base = "角色卡/R/docs/";
  const bodies = new Map<string, Buffer>([
    [base + "unicode.md", Buffer.from("\uFEFF# Independent 🧪\n中文全文\n", "utf8")],
    [base + "limit.txt", Buffer.alloc(262144, "x")],
    [base + "too-large.md", Buffer.alloc(262145, "x")],
    [base + "invalid.md", Buffer.from([0xc3, 0x28])],
    [base + "binary.md", Buffer.from("a\0b")],
    [base + "removed.md", Buffer.from("removed only after catalog publication")],
    [base + "revoked.md", Buffer.from("revoked from trusted listing")],
    ["角色卡/R/role-card.md", Buffer.from("# R\n")],
  ]);
  for (const [file, bytes] of bodies) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  }
  fs.mkdirSync(path.join(root, base, "directory"));
  fs.writeFileSync(path.join(root, ".env"), "FIXTURE_ONLY=not-a-credential\n");
  const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  const before = { sha: digest(base + "unicode.md"), mtime: fs.statSync(path.join(root, base + "unicode.md")).mtimeMs };
  const documents: ProjectDocumentRoleCandidates["docs"][number][] = [...bodies.keys()]
    .filter(file => file.startsWith(base)).map(file => ({ path: file.slice("角色卡/R/".length), kind: "file" }));
  documents.push({ path: "docs/directory", kind: "directory" });
  const roles: ProjectDocumentRoleCandidates[] = [{ roleId: "R", builtIn: false, cardPath: "角色卡/R/role-card.md", docs: documents }];
  const request = (ref: ProjectDocumentRef) => ({ version: 1 as const, projectViewId: ref.projectViewId, documentId: ref.documentId });
  try {
    const ungranted = reader.updateListing(reader.beginListing(root), root, roles);
    assert.equal(ungranted.documentScope, undefined, "listing a renderer-supplied root is not a native grant");
    assert.equal(Object.values(ungranted.documents).flat().length, 0);
    await reader.grantNativeSelection(root);
    const listing = reader.updateListing(reader.beginListing(root), root, roles);
    if (process.platform === "win32") {
      assert.equal(listing.documentReadUnavailable, "UNSUPPORTED_ENVIRONMENT");
      assert.equal(listing.documentScope, undefined, "unsupported native selection must not issue a scope");
      assert.equal(Object.values(listing.documents).flat().length, 0, "unsupported native selection must not mint refs");
      const failed = await reader.read({ version: 1, projectViewId: "unissued", documentId: "unissued" });
      assert.equal(failed.ok, false);
      if (!failed.ok) { assert.equal(failed.code, "UNSUPPORTED_ENVIRONMENT"); assert.equal("text" in failed, false); }
      assert.deepEqual({ sha: digest(base + "unicode.md"), mtime: fs.statSync(path.join(root, base + "unicode.md")).mtimeMs }, before);
      assert.equal(fs.readFileSync(path.join(root, ".env"), "utf8"), "FIXTURE_ONLY=not-a-credential\n");
      return;
    }
    assert.ok(listing.documentScope);
    const refs = listing.documents.R;
    assert.ok(refs);
    assert.ok(!refs.some(ref => ref.relativePath.endsWith("directory") || ref.relativePath === ".env"));
    const ref = (name: string) => { const found = refs.find(item => item.relativePath === base + name); assert.ok(found); return found; };
    const unicode = ref("unicode.md");
    const result = await reader.read(request(unicode));
    assert.equal(result.ok, true, "supported local filesystem should read the listed UTF-8 document");
    if (result.ok) {
      assert.equal(result.text.replace(/^\uFEFF/, ""), "# Independent 🧪\n中文全文\n");
      assert.equal(result.byteLength, bodies.get(base + "unicode.md")!.length);
    }
    const limit = await reader.read(request(ref("limit.txt")));
    assert.equal(limit.ok, true);
    if (limit.ok) { assert.equal(limit.byteLength, 262144); assert.equal(limit.text.length, 262144); }
    for (const [name, code] of [["too-large.md", "TOO_LARGE"], ["invalid.md", "INVALID_UTF8"], ["binary.md", "BINARY_CONTENT"]] as const) {
      const failed = await reader.read(request(ref(name)));
      assert.equal(failed.ok, false);
      if (!failed.ok) { assert.equal(failed.code, code); assert.equal("text" in failed, false); assert.ok(!failed.message.includes(root)); }
    }
    const pathInjection = await reader.read({ ...request(unicode), path: ".env", roleId: "other-role" });
    assert.equal(pathInjection.ok, false);
    if (!pathInjection.ok) assert.equal(pathInjection.code, "INVALID_REQUEST");
    const forged = await reader.read({ ...request(unicode), documentId: "not-issued-by-main" });
    assert.equal(forged.ok, false);
    if (!forged.ok) assert.equal(forged.code, "UNKNOWN_DOCUMENT");
    fs.unlinkSync(path.join(root, base + "removed.md"));
    const missing = await reader.read(request(ref("removed.md")));
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "NOT_FOUND");
    const refreshed = reader.updateListing(reader.beginListing(root), root, [{ ...roles[0], docs: roles[0].docs.filter(file => file.path !== "docs/revoked.md") }]);
    assert.equal(refreshed.documentScope?.projectViewId, listing.documentScope.projectViewId);
    assert.equal(refreshed.documents.R.find(item => item.relativePath === unicode.relativePath)?.documentId, unicode.documentId);
    const revoked = await reader.read(request(ref("revoked.md")));
    assert.equal(revoked.ok, false);
    if (!revoked.ok) assert.equal(revoked.code, "NOT_LISTED");
    await reader.grantNativeSelection(nextRoot);
    const pendingNext = reader.beginListing(nextRoot);
    // An actual directory selection does not mean its asynchronous listing succeeded.
    // The real Interface has not called updateListing when enumeration rejects.
    const afterFailedImport = await reader.read(request(unicode));
    assert.equal(afterFailedImport.ok, true, "failed project import must preserve the prior visible project's readable references");
    reader.updateListing(pendingNext, nextRoot, []);
    const stale = await reader.read(request(unicode));
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "STALE_SCOPE");
    assert.deepEqual({ sha: digest(base + "unicode.md"), mtime: fs.statSync(path.join(root, base + "unicode.md")).mtimeMs }, before);
    assert.equal(fs.readFileSync(path.join(root, ".env"), "utf8"), "FIXTURE_ONLY=not-a-credential\n");
  } finally {
    reader.dispose();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(nextRoot, { recursive: true, force: true });
  }
});

test("independent B: accepted Windows restriction refuses native grants without issuing refs or reading bytes", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-doc-unsupported-")));
  const provider = createProjectDocumentFileReader({ platform: "win32" });
  let reads = 0;
  const reader = createProjectDocumentService({ fileReader: { ...provider, async read(...args) { reads++; return provider.read(...args); } } });
  try {
    fs.writeFileSync(path.join(root, "unchanged.md"), "must not be read or modified\n");
    await reader.grantNativeSelection(root);
    const listing = reader.updateListing(reader.beginListing(root), root, [{ roleId: "R", builtIn: false, cardPath: "角色卡/R/role-card.md", docs: [] }]);
    assert.equal(listing.documentReadUnavailable, "UNSUPPORTED_ENVIRONMENT");
    assert.equal(listing.documentScope, undefined);
    assert.deepEqual(Object.entries(listing.documents), []);
    const result = await reader.read({ version: 1, projectViewId: "forged", documentId: "forged" });
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.code, "UNSUPPORTED_ENVIRONMENT"); assert.equal("text" in result, false); assert.equal(result.message.includes(root), false); }
    assert.equal(reads, 0);
    assert.equal(fs.readFileSync(path.join(root, "unchanged.md"), "utf8"), "must not be read or modified\n");
  } finally { reader.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
});
