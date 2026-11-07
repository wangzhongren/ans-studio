// Object plumbing uses raw bytes and an application-owned candidate ref. No shared index/checkout.
import { createHash } from "node:crypto";
import type { GitOid, GitRawRevertCommit, GitRawRevertBasis, GitRawDiffEntry } from "../../../model/trunk.ts";
import type { GitCandidateStore, GitCandidateInput, GitStoredCommit, GitTreeEntry, GitRepositoryIdentity, GitCandidatePlan, GitRevertInput, GitRevertPlanResult } from "../abstract/trunk-store.ts";
import { executeGit, inspectGitRepository, fullGitOid, literalGitPath, requireGitSuccess, gitCommandArgv } from "./git-command.ts";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function candidateParents(input: GitCandidateInput, format: GitOid["objectFormat"]): GitOid[] {
  const parents = input.parents ? [...input.parents] : input.base ? [input.base] : [];
  if (parents.length > 65 || new Set(parents.map(value => value.hex.toLowerCase())).size !== parents.length
    || (input.parents !== undefined && (!input.base || parents[0]?.hex !== input.base.hex))) throw new Error("git-candidate-parents-invalid");
  for (const parent of parents) fullGitOid(parent, format);
  return parents;
}
/** Computes complete planned Git object bytes; no object/ref is claimed to exist before actual readback. */
function planCandidateBytes(input: GitCandidateInput, before: readonly GitTreeEntry[], format: GitOid["objectFormat"]): GitCandidatePlan {
  const seconds = Math.floor(Date.parse(input.timestamp ?? "") / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || !input.operationId || input.operationId.length > 200 || !input.message.trim() || input.message.length > 4000 || input.files.length > 128) throw new Error("git-candidate-plan-invalid");
  const files = [...input.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (new Set(files.map(file => file.path)).size !== files.length) throw new Error("git-candidate-duplicate-path");
  const object = (kind: string, bytes: Buffer): GitOid => ({ objectFormat: format, hex: createHash(format).update(Buffer.from(`${kind} ${bytes.length}\0`)).update(bytes).digest("hex") });
  const entries = new Map(before.map(entry => [entry.path, entry])), commands: string[][] = []; let total = 0;
  for (const file of files) {
    literalGitPath(file.path);
    if (file.bytesBase64 === null) { if (!entries.delete(file.path)) throw new Error("git-delete-target-missing"); continue; }
    const bytes = Buffer.from(file.bytesBase64, "base64"); total += bytes.length;
    if (bytes.toString("base64") !== file.bytesBase64 || bytes.length > 1024 * 1024 || total > 4 * 1024 * 1024) throw new Error("git-candidate-byte-budget");
    entries.set(file.path, { path: file.path, mode: file.executable ? "100755" : "100644", oid: object("blob", bytes) });
    commands.push(["hash-object", "-w", "--stdin", "--no-filters"]);
  }
  if (entries.size > 2048) throw new Error("git-tree-file-budget");
  type Directory = Map<string, Directory | GitTreeEntry>; const root: Directory = new Map();
  for (const entry of entries.values()) {
    const parts = entry.path.split("/"); let dir = root;
    for (const name of parts.slice(0, -1)) { const old = dir.get(name); if (old && !(old instanceof Map)) throw new Error("git-tree-file-directory-conflict"); const next = old ?? new Map(); dir.set(name, next); dir = next; }
    if (dir.has(parts.at(-1)!)) throw new Error("git-tree-file-directory-conflict"); dir.set(parts.at(-1)!, entry);
  }
  function treeFor(dir: Directory): GitOid {
    const values = [...dir].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => value instanceof Map
      ? { name, mode: "40000", oid: treeFor(value), directory: true }
      : { name, mode: value.mode, oid: value.oid, directory: false });
    const bytes = Buffer.concat(values.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? "/" : "")), Buffer.from(b.name + (b.directory ? "/" : ""))))
      .flatMap(value => [Buffer.from(`${value.mode} ${value.name}\0`), Buffer.from(value.oid.hex, "hex")]));
    commands.push(["mktree", "-z"]); return object("tree", bytes);
  }
  const tree = treeFor(root), requestDigest = sha(JSON.stringify({ ...input, files })), message = `${input.message}\n\nANS-Request: ${requestDigest}\n`;
  const parents = candidateParents(input, format);
  const candidate = object("commit", Buffer.from(`tree ${tree.hex}\n${parents.map(parent => `parent ${parent.hex}\n`).join("")}author ANS Application <ans@localhost> ${seconds} +0000\ncommitter ANS Application <ans@localhost> ${seconds} +0000\n\n${message}`));
  const ref = `refs/ans/candidates/${sha(input.operationId)}`;
  commands.push(["commit-tree", tree.hex, ...parents.flatMap(parent => ["-p", parent.hex]), "-F", "-"], ["cat-file", "commit", candidate.hex], ["update-ref", "--no-deref", ref, candidate.hex, "0".repeat(format === "sha1" ? 40 : 64)]);
  const old = new Map(before.map(entry => [entry.path, entry])), diff: GitCandidatePlan["diff"][number][] = [];
  for (const file of [...new Set([...old.keys(), ...entries.keys()])].sort()) {
    const from = old.get(file), to = entries.get(file); if (from && to && from.mode === to.mode && from.oid.hex === to.oid.hex) continue;
    diff.push({ status: !from ? "A" : !to ? "D" : from.mode !== to.mode ? "T" : "M", ...(from ? { oldPath: file, oldMode: from.mode, oldOid: from.oid } : {}), ...(to ? { newPath: file, newMode: to.mode, newOid: to.oid } : {}) });
  }
  return { input, baseTree: structuredClone(before), commit: { candidate, tree, parents, message }, ref, worksite: { kind: "raw-object-plumbing", index: "not-used", checkout: "not-used" }, commands: commands.map(gitCommandArgv), diff };
}
export function planEmptyGitCandidate(value: { operationId: string; message: string; timestamp: string; objectFormat: GitOid["objectFormat"] }) {
  return planCandidateBytes({ operationId: value.operationId, base: null, files: [], message: value.message, timestamp: value.timestamp }, [], value.objectFormat);
}
export function applicationGitRef(ref: string): string {
  if (!/^(?:refs\/ans\/trunk|refs\/ans\/delivery\/[a-z0-9][a-z0-9-]{1,95}|refs\/ans\/candidates\/[a-f0-9]{64})$/.test(ref)) throw new Error("git-ref-not-allocated");
  return ref;
}
export function createGitCandidateStore(root: string): GitCandidateStore {
  const oid = (hex: string, identity: GitRepositoryIdentity): GitOid => ({ objectFormat: identity.objectFormat, hex: fullGitOid({ objectFormat: identity.objectFormat, hex: hex.trim() }, identity.objectFormat) });
  async function readRef(ref: string): Promise<GitOid | null> {
    const identity = await inspectGitRepository(root), facts = await executeGit(root, ["rev-parse", "--verify", "--quiet", applicationGitRef(ref)]);
    if (facts.termination === "exited" && facts.exitCode === 1) return null;
    return oid(requireGitSuccess(facts), identity);
  }
  async function listDeliveryRefs(): Promise<readonly { ref: string; oid: GitOid }[]> {
    const identity = await inspectGitRepository(root), result = await executeGit(root, ["for-each-ref", "--count=257", "--format=%(refname)%00%(objectname)", "refs/ans/delivery/"]);
    const text = requireGitSuccess(result), rows = text.split("\n").filter(Boolean); if (rows.length > 256) throw new Error("git-delivery-ref-budget");
    return rows.map(row => { const split = row.split("\0"); if (split.length !== 2 || !split[0]!.startsWith("refs/ans/delivery/")) throw new Error("git-delivery-ref-invalid");
      return { ref: applicationGitRef(split[0]!), oid: oid(split[1]!, identity) }; });
  }
  async function readCommit(value: GitOid): Promise<GitStoredCommit> {
    const identity = await inspectGitRepository(root), hex = fullGitOid(value, identity.objectFormat);
    const text = requireGitSuccess(await executeGit(root, ["cat-file", "commit", hex]));
    const split = text.indexOf("\n\n"); if (split < 0) throw new Error("git-commit-invalid");
    const header = text.slice(0, split).split("\n"), tree = header.find(line => line.startsWith("tree "))?.slice(5);
    if (!tree) throw new Error("git-commit-tree-missing");
    return { candidate: oid(hex, identity), tree: oid(tree, identity), parents: header.filter(line => line.startsWith("parent ")).map(line => oid(line.slice(7), identity)), message: text.slice(split + 2) };
  }
  async function readCommitBytes(value: GitOid): Promise<{ bytesBase64: string; sha256: string }> {
    const identity = await inspectGitRepository(root), hex = fullGitOid(value, identity.objectFormat);
    const result = await executeGit(root, ["cat-file", "commit", hex]); requireGitSuccess(result);
    const bytes = Buffer.from(result.stdoutBase64!, "base64");
    if (result.outputTruncated || bytes.length === 0 || bytes.length > 16384
      || createHash(identity.objectFormat).update(Buffer.from(`commit ${bytes.length}\0`)).update(bytes).digest("hex") !== hex)
      throw new Error("git-commit-raw-bytes-unavailable");
    return { bytesBase64: bytes.toString("base64"), sha256: sha(bytes) };
  }
  async function listTree(value: GitOid): Promise<readonly GitTreeEntry[]> {
    const identity = await inspectGitRepository(root), hex = fullGitOid(value, identity.objectFormat);
    const text = requireGitSuccess(await executeGit(root, ["ls-tree", "-r", "-z", "--full-tree", hex]));
    const rows = text.split("\0").filter(Boolean); if (rows.length > 2048) throw new Error("git-tree-file-budget");
    return rows.map(row => { const match = /^(100644|100755) blob ([a-f0-9]+)\t([^\x00-\x1f]+)$/.exec(row);
      if (!match) throw new Error("git-tree-mode-or-path-unsupported");
      return { path: literalGitPath(match[3]!), mode: match[1]!, oid: oid(match[2]!, identity) }; });
  }
  async function readRevertCommit(value: GitOid): Promise<GitRawRevertCommit & { parents: GitOid[] }> {
    const actual = await readCommit(value), bytes = await readCommitBytes(value), identity = await inspectGitRepository(root);
    const rows = requireGitSuccess(await executeGit(root, ["ls-tree", "-r", "-z", "--full-tree", fullGitOid(value, identity.objectFormat)])).split("\0").filter(Boolean);
    if (rows.length > 2048 || actual.parents.length > 65 || new Set(actual.parents.map(parent => parent.hex)).size !== actual.parents.length) throw new Error("git-revert-object-budget-or-parents");
    const entries = rows.map(row => { const match = /^([0-7]{6}) (?:blob|commit) ([a-f0-9]+)\t([^\x00-\x1f]+)$/.exec(row);
      if (!match) throw new Error("git-revert-tree-observation-unsupported");
      return { path: literalGitPath(match[3]!), mode: match[1]!, oid: oid(match[2]!, identity) }; });
    type Directory = Map<string, Directory | GitTreeEntry>; const tree: Directory = new Map(), names = new Set<string>();
    for (const entry of entries) {
      if (names.has(entry.path.toLowerCase())) throw new Error("git-revert-tree-path-collision"); names.add(entry.path.toLowerCase());
      const parts = entry.path.split("/"); let directory = tree;
      for (const part of parts.slice(0, -1)) { const old = directory.get(part); if (old && !(old instanceof Map)) throw new Error("git-revert-tree-path-collision"); const child = old ?? new Map(); directory.set(part, child); directory = child; }
      if (directory.has(parts.at(-1)!)) throw new Error("git-revert-tree-path-collision"); directory.set(parts.at(-1)!, entry);
    }
    const hashTree = (directory: Directory): GitOid => {
      const values = [...directory].map(([name, entry]) => entry instanceof Map ? { name, mode: "40000", oid: hashTree(entry), directory: true } : { name, mode: entry.mode, oid: entry.oid, directory: false });
      const content = Buffer.concat(values.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? "/" : "")), Buffer.from(b.name + (b.directory ? "/" : ""))))
        .flatMap(entry => [Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid.hex, "hex")]));
      return { objectFormat: identity.objectFormat, hex: createHash(identity.objectFormat).update(Buffer.from(`tree ${content.length}\0`)).update(content).digest("hex") };
    };
    if (hashTree(tree).hex !== actual.tree.hex) throw new Error("git-revert-full-tree-unproven");
    return { commit: actual.candidate, commitBytesBase64: bytes.bytesBase64, tree: actual.tree, entries, parents: actual.parents };
  }
  async function planRevert(input: GitRevertInput): Promise<GitRevertPlanResult> {
    const targetRead = await readRevertCommit(input.commit), currentRead = await readRevertCommit(input.base);
    let selectedParent: GitRawRevertBasis["selectedParent"] = null;
    if (targetRead.parents.length === 0) { if (input.mainline !== undefined) throw new Error("git-revert-root-mainline-invalid"); }
    else {
      const index = targetRead.parents.length === 1 ? 1 : input.mainline;
      if (targetRead.parents.length === 1 && input.mainline !== undefined || !Number.isSafeInteger(index) || index === undefined || index < 1 || index > targetRead.parents.length)
        throw new Error("git-revert-mainline-required-or-invalid");
      const { parents, ...parent } = await readRevertCommit(targetRead.parents[index - 1]!); void parents; selectedParent = { ...parent, index };
    }
    const { parents: targetParents, ...target } = targetRead, { parents: currentParents, ...codeBasis } = currentRead; void targetParents; void currentParents;
    const from = new Map(target.entries.map(entry => [entry.path, entry])), parent = new Map(selectedParent?.entries.map(entry => [entry.path, entry]) ?? []), current = new Map(codeBasis.entries.map(entry => [entry.path, entry]));
    const inverseChanges: GitRawDiffEntry[] = [], conflicts: GitRawRevertBasis["conflicts"][number][] = [], files: GitCandidateInput["files"][number][] = [];
    const equal = (a: GitTreeEntry | undefined, b: GitTreeEntry | undefined) => !a ? !b : !!b && a.mode === b.mode && a.oid.objectFormat === b.oid.objectFormat && a.oid.hex === b.oid.hex;
    for (const file of [...new Set([...from.keys(), ...parent.keys()])].sort()) {
      const before = from.get(file), after = parent.get(file), now = current.get(file); if (equal(before, after)) continue;
      inverseChanges.push({ status: !before ? "A" : !after ? "D" : before.mode !== after.mode ? "T" : "M", ...(before ? { oldPath: file, oldMode: before.mode, oldOid: before.oid } : {}), ...(after ? { newPath: file, newMode: after.mode, newOid: after.oid } : {}) });
      if (!equal(before, now)) conflicts.push({ path: file, parent: after ?? null, target: before ?? null, current: now ?? null, reason: "current-entry-differs-from-target" });
    }
    const basis: GitRawRevertBasis = { target, selectedParent, codeBasis, inverseChanges, conflicts, complete: true };
    if (conflicts.length) return { ok: false, code: "git-revert-conflict", basis, message: "Current entries differ from the target; an explicit revised change is required" };
    const resultEntries = new Map(current);
    for (const change of inverseChanges) { const file = (change.oldPath ?? change.newPath)!; const after = parent.get(file); if (after) resultEntries.set(file, after); else resultEntries.delete(file); }
    const names = [...resultEntries.keys()].map(file => file.toLowerCase());
    if (names.some((file, index) => names.some((other, at) => at !== index && (file === other || other.startsWith(file + "/")))))
      return { ok: false, code: "git-revert-conflict", basis, message: "The inverse change collides with a current file/directory path" };
    if ([...codeBasis.entries, ...resultEntries.values()].some(entry => !["100644", "100755"].includes(entry.mode)))
      return { ok: false, code: "git-revert-mode-unsupported", basis, message: "The complete observed current/result tree contains an unsupported effect mode" };
    for (const change of inverseChanges) {
      const file = (change.oldPath ?? change.newPath)!, after = parent.get(file);
      files.push({ path: file, bytesBase64: after && selectedParent ? (await readBlob(selectedParent.commit, file)).bytesBase64 : null, ...(after?.mode === "100755" ? { executable: true } : {}) });
    }
    return { ok: true, value: { ...planCandidateBytes({ operationId: input.operationId, base: input.base, files, message: input.message, timestamp: input.timestamp }, codeBasis.entries, input.base.objectFormat), revertBasis: basis } };
  }
  async function readBlob(value: GitOid, file: string) {
    const identity = await inspectGitRepository(root), hex = fullGitOid(value, identity.objectFormat), safePath = literalGitPath(file);
    const facts = await executeGit(root, ["cat-file", "blob", `${hex}:${safePath}`]); requireGitSuccess(facts);
    const bytes = Buffer.from(facts.stdoutBase64!, "base64"); return { bytesBase64: bytes.toString("base64"), sha256: sha(bytes) };
  }
  async function plan(input: GitCandidateInput): Promise<GitCandidatePlan> {
    const identity = await inspectGitRepository(root);
    if (input.base) await readCommit(input.base);
    for (const parent of input.parents ?? []) await readCommit(parent);
    return planCandidateBytes(input, input.base ? await listTree(input.base) : [], identity.objectFormat);
  }
  async function prepare(input: GitCandidateInput, signal?: AbortSignal, hostLeaseId?: string, writeRef = true): Promise<GitStoredCommit> {
    const identity = await inspectGitRepository(root);
    const parents = candidateParents(input, identity.objectFormat);
    for (const parent of input.parents ?? []) await readCommit(parent);
    if (!input.operationId || input.operationId.length > 200 || !input.message.trim() || input.message.length > 4000 || input.files.length > 128) throw new Error("git-candidate-input-invalid");
    const files = [...input.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (new Set(files.map(file => file.path)).size !== files.length) throw new Error("git-candidate-duplicate-path");
    const requestDigest = sha(JSON.stringify({ ...input, files })), ref = `refs/ans/candidates/${sha(input.operationId)}`;
    const existing = await readRef(ref);
    if (existing) { const prior = await readCommit(existing); if (!prior.message.endsWith(`\nANS-Request: ${requestDigest}\n`)) throw new Error("git-candidate-operation-conflict"); return prior; }
    const entries = new Map<string, GitTreeEntry>();
    if (input.base) { await readCommit(input.base); for (const entry of await listTree(input.base)) entries.set(entry.path, entry); }
    let bytesTotal = 0;
    for (const file of files) {
      literalGitPath(file.path);
      if (file.bytesBase64 === null) { if (!entries.delete(file.path)) throw new Error("git-delete-target-missing"); continue; }
      const bytes = Buffer.from(file.bytesBase64, "base64"); bytesTotal += bytes.length;
      if (bytes.toString("base64") !== file.bytesBase64 || bytes.length > 1024 * 1024 || bytesTotal > 4 * 1024 * 1024) throw new Error("git-candidate-byte-budget");
      const hex = requireGitSuccess(await executeGit(root, ["hash-object", "-w", "--stdin", "--no-filters"], { input: bytes, signal, hostLeaseId, operationId: input.operationId })).trim();
      entries.set(file.path, { path: file.path, mode: file.executable ? "100755" : "100644", oid: oid(hex, identity) });
    }
    if (entries.size > 2048) throw new Error("git-tree-file-budget");
    type Directory = Map<string, Directory | GitTreeEntry>; const tree: Directory = new Map();
    for (const entry of entries.values()) {
      const parts = entry.path.split("/"); let dir = tree;
      for (const part of parts.slice(0, -1)) { const old = dir.get(part); if (old && !(old instanceof Map)) throw new Error("git-tree-file-directory-conflict"); const next = old ?? new Map(); dir.set(part, next); dir = next; }
      if (dir.has(parts.at(-1)!)) throw new Error("git-tree-file-directory-conflict"); dir.set(parts.at(-1)!, entry);
    }
    async function writeTree(dir: Directory): Promise<string> {
      const rows: string[] = [];
      for (const [name, value] of [...dir].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        if (value instanceof Map) rows.push(`040000 tree ${await writeTree(value)}\t${name}\0`);
        else rows.push(`${value.mode} blob ${value.oid.hex}\t${name}\0`);
      }
      return requireGitSuccess(await executeGit(root, ["mktree", "-z"], { input: Buffer.from(rows.join("")), signal, hostLeaseId, operationId: input.operationId })).trim();
    }
    const treeHex = await writeTree(tree), message = `${input.message}\n\nANS-Request: ${requestDigest}\n`;
    const hex = requireGitSuccess(await executeGit(root, ["commit-tree", treeHex, ...parents.flatMap(parent => ["-p", fullGitOid(parent, identity.objectFormat)]), "-F", "-"], { input: Buffer.from(message), timestamp: input.timestamp, signal, hostLeaseId, operationId: input.operationId })).trim();
    const commit = await readCommit(oid(hex, identity));
    if (commit.tree.hex !== treeHex || JSON.stringify(commit.parents) !== JSON.stringify(parents)) throw new Error("git-candidate-readback-mismatch");
    if (!writeRef) return commit;
    const update = await executeGit(root, ["update-ref", "--no-deref", ref, hex, "0".repeat(identity.objectFormat === "sha1" ? 40 : 64)], { signal, hostLeaseId, operationId: input.operationId });
    if (update.termination !== "exited") throw new Error("git-candidate-ref-result-unknown");
    if (update.exitCode !== 0) { const winner = await readRef(ref); if (winner) { const prior = await readCommit(winner); if (prior.message.endsWith(`\nANS-Request: ${requestDigest}\n`)) return prior; } requireGitSuccess(update); }
    const actual = await readRef(ref); if (actual?.hex !== hex) throw new Error("git-candidate-ref-readback-mismatch");
    return commit;
  }
  return { inspect: () => inspectGitRepository(root), plan, planRevert, prepare,
    prepareObjects: (input, signal, hostLeaseId) => prepare(input, signal, hostLeaseId, false), readCommit, readCommitBytes, listTree, readBlob, readRef, listDeliveryRefs };
}
