// 门禁引擎：V3 shell 命令级闸 (c) —— 确定性规则/白名单引擎（纯函数，无副作用）
//
// 冻结契约（设计 §7.2/§7.4/§14）：`classifyShell(argv, rules) => "allow" | "deny" | "risky" | "review"`。
// 判据是「这条命令是否被允许执行」，**不是**「路径是否在边界内」——shell 里的 `echo x > 路径`
// 不经过 resolveWrite（§7.1），故这道闸的判据与路径判定正交。
//
// 四态（§7.3 → §14.1 重定）：白名单命中 → allow；硬拒命中 → deny（绝对否决，不可被 (b)/(a) 翻案）；
//   命中「危险但有正当用途」→ risky（**必过 (b)；(b) 放行后仍须过 (a)**，§14.2）；都不命中 → review
//   （交 (b)；b 明确即终结，b 拿不准/不可用才升 (a)）。
//
// fail-closed（§7.5 第一条）——结构上不可能退化：
//   * classifyShell **要求显式传入 rules**（无默认参数、无 rules 可选重载）；
//   * rules 缺失/非对象/版本未知/形状非法 → 返回 "deny"（视为硬拒）；
//   * argv 缺失/为空/含非字符串元素 → 返回 "deny"；
//   * 唯一通向 "allow" 的分支是「命中一条已通过校验的白名单条目」——没有规则 ⇒ 结构上到不了 allow。
//
// —— 执行模型前提（§7.10，T8a 重述）——
// Pi适配器执行 `spawn(argv[0], argv.slice(1), { shell:false })`——**命令不经 shell 解释**。
// 因此本规则集**按「程序 + argv」分类**：argv[0] 程序黑/白名单、危险 flag、写目标参数；
// **不按 shell 元字符**。`> | & ; $( ` <<` 换行 在这个模型下**只是普通参数字节**，永不以「被解释」的
// 形式出现：把它们当硬拒项扫是**空转的**，更糟——给人「拦住了重定向」的**假安全感**，还误杀
// `grep 'a|b'` 一类的正常参数。故本引擎**仅在 `rules.executionModel !== "argv-noshell"` 时**才扫
// `denyTokens`（见 classifyShellDetailed 第 6 步与 rules.executionModel 的类型注释）。
//
//   ★★ 耦合（必须记牢）★★：上面的「不扫元字符」前提**绑定 `shell:false`**。一旦执行层改回
//   **原始命令串 / `shell:true`**，**元字符规则必须恢复**——把 `rules.executionModel` 改为
//   `"shell-string"`（或删掉该字段，缺省即最保守地恢复扫描），否则 `> /path`、`$(...)`、管道到 shell
//   之类会被**漏掉**，出现「以为拦了、其实没拦」的洞。规则集里**保留 `denyTokens` 数据**正是为此：
//   它是**待恢复**的元字符集合，不是当前生效的判据。
//
// 关于 argv（§7.2/§7.10）：接口收的是 `argv: string[]`（程序 + 参数），不是原始命令串。
//   * `argv[0]` 含空白（说明塞进来的是**整条命令串**而非程序名）→ deny（无法可靠解析，fail-closed）；
//   * `sh -c "…"` 把真实命令藏在参数里、无法可靠反推：**外壳/解释器本身就在硬拒名单**
//     （sh/bash/cmd/pwsh/…），故这一类「在参数里重新引入 shell」的形态仍被守住。
//
// —— risky 的判据与前提（§14.2/§14.3-B，T40）——
// 危险命令**不再一概终结**（客户 2026-10-11 推翻 §7.3「危险即硬拒」）：`rm` 不是永远错的
//   （删自己刚生成的临时文件合理）——一概硬拒即「过宽则天天误杀」。故新增第四档 `risky`：
//   **危险但有正当用途**的命令 → 过 (b) pm 审读，(b) 判放行后**仍须过 (a) 客户看原文确认**。
//   **但**：`risky` 只给「**程序名在 argv 里以可读元素出现、语义可判**」的形态——因为 (a) 是**客户看命令原文**，
//   得看得懂（`rm -rf build/` 看得懂）。**re-shell / 内联求值**（`sh -c "…"`/`eval`/`node -e`/`awk`…）**不在此列、
//   仍硬拒终结**：它们 `argv` 里**没有可读的程序名**（真命令是那段 string，其影响发生在子进程内、**完全不经过
//   `resolveWrite`**），放行 = 整体绕过写边界（§14.4）。**「argv 里看得见」是 (a) 能兜住 risky 的前提。**

import type {
  ShellClass,
  ShellExecutionModel,
  ShellHardDenyRule,
  ShellReadOnlyRule,
  ShellRiskyRule,
  ShellRules,
} from "../../model/decision.ts";
import { createHash } from "node:crypto";
import { isCompleteSnapshot, isDirectActionSource, isActiveRoleEvidence, isGitApplicationRef, FROZEN_ROLE_REF_KEYS, type ActiveRoleEvidence, type CompleteSnapshot, type GitOid, type TrunkApplyJournal, type SnapshotRef } from "../../model/trunk.ts";
import type { GitRawObjectPlan, GitRawTreeEntry, GitRawDiffEntry, GitRawRevertCommit, GitRawRevertBasis, RawTree } from "../../model/trunk.ts";
export type { GitRawObjectPlan, GitRawTreeEntry, RawTree, GitRawDiffEntry, GitRawObjectInput, GitRawStoredCommit, GitRawRevertCommit, GitRawRevertBasis, GitRawRevertConflict } from "../../model/trunk.ts";
import { isValidDocFreezeRecord, type StableWriteAuthority, type StableWriteRecord, type StableWritePermit } from "../../model/version-change.ts";
import { validateRoleDocumentsSnapshot, parseSnapshotRoleDocuments, snapshotDocumentText } from "./boundary-core.ts";
import { parse as parseYaml } from "yaml";

export type GitPolicyTemplate = "status" | "diff" | "log" | "show" | "rev-parse" | "ls-files" | "ls-tree" | "merge-base" | "branch-list" | "worktree-list"
  | "commit" | "integrate" | "revert" | "init" | "publish-documents" | "publish-delivery";
export type GitPolicyDiffEntry = GitRawDiffEntry;
export interface GitAppGeneratedFile {
  path: string; sha256: string; oid: GitOid;
  kind: "manifest" | "complete-snapshot" | "history" | "frozen-application-evidence" | "snapshot-content";
}
export type GitPolicyTreeEntry = GitRawTreeEntry;
/** Ordinary settled-source data; authenticity/current authority are rechecked by O, not inferred here. */
export interface GitDeliveryTaskSource {
  kind: "assigned-run-task"; taskId: string; runId: string; flowId: string; roleId: string; moduleId: string;
  pinDigest: string; taskDigest: string; runRecordSha256: string; scopeDigest: string;
  base: { ref: string; oid: GitOid | null }; files: readonly { path: string; sha256: string | null }[];
}
export interface GitDeliveryIntegrationSource extends Omit<GitDeliveryTaskSource, "kind" | "moduleId"> {
  kind: "run-integration";
  contributors: readonly { operationId: string; candidate: GitOid; source: GitDeliveryTaskSource; closeOperationId: string; closeEventId: string; reportSha256: string }[];
}
export interface GitDeliveryRevertSource extends Omit<GitDeliveryTaskSource, "kind" | "moduleId"> {
  kind: "run-revert"; roleId: "convener"; target: GitOid; mainline?: number;
  revertBasis: GitRawRevertBasis;
  ownerGrants: readonly { ownerRoleId: string; paths: readonly string[]; evidenceDigest: string }[];
}
export interface GitRefPublicationPolicyPlan {
  ref: string; oldOid: GitOid | null;
  commitBytesBase64: string; oldCommitBytesBase64: string | null;
  commit: { candidate: GitOid; tree: GitOid; parents: GitOid[]; message: string };
  baseTree: readonly GitPolicyTreeEntry[]; candidateTree: readonly GitPolicyTreeEntry[];
  worksite: { kind: "ref-only"; index: "not-used"; checkout: "not-used" };
  argv: readonly string[]; diff: readonly GitPolicyDiffEntry[];
}
export interface GitDeliveryBasis {
  base: GitOid; baseTree: readonly GitPolicyTreeEntry[]; source: GitDeliveryIntegrationSource | GitDeliveryRevertSource;
  candidateOperationId: string; baseCommitBytesBase64: string;
}
export interface GitBusinessPublication {
  kind: "direct-document-publication"; flowId: string; operationId: string; actorRoleId: string; applicationId: string; action: string;
  snapshot: SnapshotRef; documents: Readonly<Record<string, unknown>>; execution: { teamPlan: unknown; flow: unknown };
}
export interface GitRoleActivationPublication extends Omit<GitBusinessPublication, "kind" | "action"> {
  kind: "role-activation-publication"; action: "activate-role-documents";
  documentSnapshot: SnapshotRef; targetRoleId: string;
  expectedActive: { revision: number; digest: string | null };
  targetActive: { revision: number; digest: string; roles: Record<string, ActiveRoleEvidence> };
  evidence: ActiveRoleEvidence;
}
export interface GitStableInitialWorkflowSource {
  schema: "stable-initial-workflow-source/v1"; kind: "stable-initial-workflow"; operationId: string;
  flowId: string; taskId: string; runId: string; coreSessionId: string; coreTurnId?: string;
  roleId: "convener"; requestId: string; permitId: string; path: "docs/workflow.md"; baseSha256: ""; targetSha256: string;
  authority: StableWriteAuthority; documentCommit: { version: number; digest: string }; documentSnapshot: SnapshotRef;
}
export interface GitInitialWorkflowPublication extends Omit<GitBusinessPublication, "kind" | "action" | "applicationId" | "actorRoleId"> {
  kind: "stable-initial-workflow-publication"; actorRoleId: "convener"; documentSnapshot: SnapshotRef;
  source: GitStableInitialWorkflowSource; record: StableWriteRecord; permit: StableWritePermit;
}
/** Host-resolved ordinary evidence, never model parameters or execution-isolation proof. */
export interface GitPolicyFacts {
  repoId: string; operationId: string; actorRoleId: string; taskId?: string; runId?: string;
  authorizationRevision: string | number; currentAuthorizationRevision: string | number;
  objectFormat: "sha1" | "sha256"; template: GitPolicyTemplate;
  paths: readonly string[]; readPaths: readonly string[]; writePaths: readonly string[];
  target?: GitOid; other?: GitOid; limit?: number; readableOids?: readonly GitOid[];
  base?: GitOid | null; candidate?: GitOid | null;
  ref?: string; ownedCandidateRef?: string; publicationRef?: string;
  ownedWorktreeId?: string; currentWorktreeId?: string; ownedIndexId?: string; currentIndexId?: string;
  /** Exact planned transport argv including the fixed safety prefix. */
  argv: readonly string[];
  /** Complete per-operation plumbing commands for modifying operations. */
  commands?: readonly (readonly string[])[];
  allDiff?: { complete: boolean; base: GitOid | null; candidate: GitOid | null; entries: readonly GitPolicyDiffEntry[] };
  d3SelectedRoleIds?: readonly string[];
  integrationGrants?: readonly { ownerRoleId: string; paths: readonly string[]; candidate: GitOid; evidenceDigest: string }[];
  approvedInitRoot?: string; ownedTemplateDir?: string; mainline?: number;
  worksite?: { kind: "raw-object-plumbing" | "ref-only"; index: "not-used"; checkout: "not-used" };
  initializationBasis?: {
    kind: "uninitialized-root"; projectRoot: string; qualificationDigest: string;
    operationId: string; requestDigest: string; sourceId: string; sourceSha256: string;
  };
  rawObjectPlan?: GitRawObjectPlan;
  refPublicationPlan?: GitRefPublicationPolicyPlan;
  deliveryBasis?: GitDeliveryBasis;
  businessPublication?: GitBusinessPublication | GitRoleActivationPublication | GitInitialWorkflowPublication;
  appGeneratedFiles?: readonly GitAppGeneratedFile[];
  manifestSha256?: string; journalDigest?: string; businessJournal?: TrunkApplyJournal;
  businessBaseManifestBytesBase64?: string;
}
export interface GitPolicyResult {
  allowed: boolean; inputDigest: string; code?: string;
  deniedPaths?: string[]; deniedRefs?: string[];
}
function gitCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(gitCanonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => [key, gitCanonical(val)]));
  return value;
}
export function computeGitPolicyDigest(facts: GitPolicyFacts): string {
  return createHash("sha256").update(JSON.stringify(gitCanonical(facts))).digest("hex");
}
const gitText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 1024 && !/[\x00-\x1f\x7f]/.test(v);
function gitPath(value: unknown): value is string {
  return gitText(value) && !value.startsWith("/") && !value.startsWith("-") && !/[\\:*?\[\]]/.test(value)
    && !value.split("/").some(p => !p || p === "." || p === ".." || p.toLowerCase() === ".git");
}
function gitCovered(file: string, scopes: readonly string[]): boolean {
  return scopes.some(scope => scope === "." || (scope.endsWith("/")
    ? file.toLowerCase().startsWith(scope.toLowerCase()) : file.toLowerCase() === scope.toLowerCase()));
}
function gitOid(value: unknown, format: GitPolicyFacts["objectFormat"]): value is GitOid {
  if (!value || typeof value !== "object") return false;
  const v = value as GitOid;
  return v.objectFormat === format && (format === "sha1" ? /^[a-f0-9]{40}$/i : /^[a-f0-9]{64}$/i).test(v.hex);
}
function sameGitOid(a: GitOid | null | undefined, b: GitOid | null | undefined): boolean {
  return a === null ? b === null : !!a && !!b && a.objectFormat === b.objectFormat && a.hex.toLowerCase() === b.hex.toLowerCase();
}
function gitBody(argv: readonly string[]): readonly string[] | undefined {
  if (!Array.isArray(argv) || argv.length > 256 || argv.some(v => typeof v !== "string" || /[\x00-\x1f\x7f]/.test(v))) return;
  if (JSON.stringify(argv.slice(0, 3)) !== JSON.stringify(["--no-pager", "--no-optional-locks", "--literal-pathspecs"])) return;
  const nullFile = argv[4] === "core.fsmonitor=false" && argv[6] === "core.hooksPath=NUL" ? "NUL" : "/dev/null";
  const config = ["core.fsmonitor=false", `core.hooksPath=${nullFile}`, "core.untrackedCache=false", `core.excludesFile=${nullFile}`,
    "core.pager=cat", "pager.status=false", "pager.diff=false", "maintenance.auto=false", "gc.auto=0", "protocol.allow=never", "diff.external=", `core.attributesFile=${nullFile}`];
  const prefix = ["--no-pager", "--no-optional-locks", "--literal-pathspecs", ...config.flatMap(v => ["-c", v])];
  if (JSON.stringify(argv.slice(0, prefix.length)) !== JSON.stringify(prefix)) return;
  return argv.slice(prefix.length);
}
// 导出仅供同仓测试做「只读 Git 规范体 × 结构化查询模板」差分对照（2026-11-08，W3-G）；
// 不属公共出口——`src/service/gate/shell-rules.ts` **不得**再导出本函数（单一来源仍在本文件）。
export function gitQueryBody(facts: GitPolicyFacts): string[] | undefined {
  const paths = [...facts.paths], a = facts.target?.hex, b = facts.other?.hex;
  switch (facts.template) {
    case "status": return ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignore-submodules=all", "--", ...paths];
    case "diff": return ["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", ...(a ? [a] : []), ...(b ? [b] : []), "--", ...paths];
    case "log": return ["log", `-${facts.limit ?? 20}`, "--format=%H%x00%P%x00%s", ...(a ? [a] : ["--all"]), "--", ...paths];
    case "show": return a && paths.length === 1 ? ["cat-file", "blob", `${a}:${paths[0]}`] : undefined;
    case "rev-parse": return a ? ["rev-parse", "--verify", `${a}^{commit}`] : undefined;
    case "ls-files": return ["ls-files", "--stage", "-z", "--", ...paths];
    case "ls-tree": return a ? ["ls-tree", "-r", "-z", "--full-tree", a, "--", ...paths] : undefined;
    case "merge-base": return a && b ? ["merge-base", a, b] : undefined;
    case "branch-list": return ["for-each-ref", `--count=${facts.limit ?? 20}`, "--format=%(refname)%00%(objectname)", "refs/heads/"];
    case "worktree-list": return ["worktree", "list", "--porcelain", "-z"];
    default: return;
  }
}
function gitRolePath(f: GitPolicyFacts, file: string): boolean {
  if (!gitCovered(file, f.writePaths) || /^(?:\.ans\/|\.git(?:\/|$))/i.test(file)
      || file.split("/").some(p => [".gitattributes", ".gitmodules"].includes(p.toLowerCase()))) return false;
  const roots: Record<string, readonly string[]> = {
    chief: ["docs/intents/"], product: ["docs/product/"], rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    convener: ["docs/scheduling/", "docs/workflow.md", "docs/governance/convener/"],
    verifier: ["docs/quality/", "docs/verification/", "docs/governance/verifier/"],
  };
  if (f.actorRoleId === "nominator") {
    const match = /^角色卡\/([^/]+)\/(role-card\.md|boundary\.md|boundary\.yaml)$/.exec(file);
    return !!match && !["chief", "product", "rapporteur", "nominator", "convener", "verifier", "su"].includes(match[1]!)
      && !!f.d3SelectedRoleIds?.includes(match[1]!);
  }
  if (roots[f.actorRoleId]) return gitCovered(file, roots[f.actorRoleId]!);
  return f.actorRoleId !== "su" && f.actorRoleId !== "liaison" && !/^(?:角色卡\/|docs\/(?:intents|product|proposals|contracts|scheduling|quality|verification|governance)\/|docs\/workflow\.md$)/i.test(file);
}
function gitModificationBody(f: GitPolicyFacts, body: readonly string[]): boolean {
  const oid = (v: unknown) => typeof v === "string" && gitOid({ objectFormat: f.objectFormat, hex: v }, f.objectFormat);
  const same = (...expected: string[]) => JSON.stringify(body) === JSON.stringify(expected);
  if (same("hash-object", "-w", "--stdin", "--no-filters") || same("mktree", "-z")) return !f.template.startsWith("publish-") && f.template !== "init";
  if (body[0] === "cat-file") return body.length === 3 && body[1] === "commit" && oid(body[2]);
  if (body[0] === "ls-tree") return body.length === 5 && body[1] === "-r" && body[2] === "-z" && body[3] === "--full-tree" && oid(body[4]);
  if (body[0] === "rev-parse") return body.length === 4 && body[1] === "--verify" && body[2] === "--quiet" && body[3] === f.ref;
  if (body[0] === "commit-tree") {
    if (f.template.startsWith("publish-") || f.template === "init" || !oid(body[1]) || body.at(-2) !== "-F" || body.at(-1) !== "-") return false;
    const parents = body.slice(2, -2);
    return parents.length % 2 === 0 && parents.every((value, i) => i % 2 === 0 ? value === "-p" : oid(value))
      && (f.base === null ? parents.length === 0 : parents[1]?.toLowerCase() === f.base?.hex.toLowerCase());
  }
  if (body[0] === "update-ref") return body.length === 5 && body[1] === "--no-deref" && body[2] === f.ref && oid(body[3])
    && typeof body[4] === "string" && (oid(body[4]) || /^0{40}$|^0{64}$/.test(body[4]))
    && (!f.template.startsWith("publish-") || (body[3]?.toLowerCase() === f.candidate?.hex.toLowerCase()
      && body[4]?.toLowerCase() === (f.base?.hex.toLowerCase() ?? "0".repeat(f.objectFormat === "sha1" ? 40 : 64))));
  if (body[0] === "merge-tree") return f.template === "integrate" && body.length === 5 && body[1] === "--write-tree"
    && body[2] === "--no-messages" && oid(body[3]) && oid(body[4]);
  if (body[0] === "revert") return f.template === "revert" && (f.mainline === undefined ? body.length === 3 && body[1] === "--no-commit" && oid(body[2])
    : Number.isSafeInteger(f.mainline) && f.mainline > 0 && body.length === 5 && body[1] === "--no-commit" && body[2] === "-m" && body[3] === String(f.mainline) && oid(body[4]));
  if (body[0] === "init") return f.template === "init" && f.base === null && f.candidate === null
    && gitText(f.approvedInitRoot) && gitText(f.ownedTemplateDir)
    && same("init", `--template=${f.ownedTemplateDir}`, `--object-format=${f.objectFormat}`, "--initial-branch=ans-unpublished", "--", f.approvedInitRoot);
  return false;
}

function initialGitPolicyError(f: GitPolicyFacts): string | undefined {
  const b = f.initializationBasis, w = f.worksite;
  const exactKeys = (value: object, keys: string[]) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.sort());
  const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
  const canonicalRoot = (root: unknown): root is string => {
    if (!gitText(root)) return false;
    const value = root.replace(/\\/g, "/");
    if (!/^(?:[A-Za-z]:\/|\/)/.test(value) || value === "/" || /^[A-Za-z]:\/$/.test(value)) return false;
    return !value.replace(/^(?:[A-Za-z]:\/|\/)/, "").split("/").some(p => !p || p === "." || p === ".." || /[\x00-\x1f]/.test(p));
  };
  if (f.actorRoleId !== "convener" || !gitText(f.taskId) || !["init", "commit"].includes(f.template)
      || !b || b.kind !== "uninitialized-root" || !exactKeys(b, ["kind", "projectRoot", "qualificationDigest", "operationId", "requestDigest", "sourceId", "sourceSha256"])
      || !canonicalRoot(b.projectRoot) || b.operationId !== f.operationId || f.operationId.length > 200
      || !digest(b.qualificationDigest) || !digest(b.requestDigest) || !digest(b.sourceSha256) || !gitText(b.sourceId))
    return "git-policy-initialization-basis";
  if (!w || !exactKeys(w, ["kind", "index", "checkout"]) || w.kind !== "raw-object-plumbing" || w.index !== "not-used" || w.checkout !== "not-used"
      || [f.ownedWorktreeId, f.currentWorktreeId, f.ownedIndexId, f.currentIndexId].some(v => v !== undefined)) return "git-policy-initialization-worksite";
  if (f.base !== null || f.paths.length || f.writePaths.length || !f.allDiff?.complete || f.allDiff.base !== null
      || !Array.isArray(f.allDiff.entries) || f.allDiff.entries.length || !sameGitOid(f.candidate, f.allDiff.candidate)
      || f.target !== undefined || f.other !== undefined || f.publicationRef !== undefined || f.integrationGrants !== undefined
      || f.d3SelectedRoleIds !== undefined || f.mainline !== undefined) return "git-policy-initialization-empty-diff";
  const allocated = `refs/ans/candidates/${createHash("sha256").update(f.operationId).digest("hex")}`;
  if (f.ref !== allocated || f.ownedCandidateRef !== allocated) return "git-policy-initialization-ref";
  if (!Array.isArray(f.commands) || !f.commands.length || JSON.stringify(f.argv) !== JSON.stringify(f.commands[0])) return "git-policy-initialization-plan";
  if (f.approvedInitRoot !== undefined && f.approvedInitRoot !== b.projectRoot) return "git-policy-initialization-root";
  const template = `${b.projectRoot.replace(/\\/g, "/")}/.ans/git-empty-template`;
  if (f.ownedTemplateDir !== undefined && f.ownedTemplateDir.replace(/\\/g, "/") !== template) return "git-policy-initialization-root";
  let expected: readonly (readonly string[])[];
  if (f.template === "init") {
    if (f.candidate !== null || f.allDiff.candidate !== null || f.approvedInitRoot !== b.projectRoot || !gitText(f.ownedTemplateDir)) return "git-policy-initialization-root";
    expected = [["init", `--template=${f.ownedTemplateDir}`, `--object-format=${f.objectFormat}`, "--initial-branch=ans-unpublished", "--", b.projectRoot]];
  } else {
    if (!gitOid(f.candidate, f.objectFormat)) return "git-policy-initialization-candidate";
    const tree = createHash(f.objectFormat).update(Buffer.from("tree 0\0")).digest("hex");
    expected = [["mktree", "-z"], ["commit-tree", tree, "-F", "-"], ["cat-file", "commit", f.candidate.hex],
      ["update-ref", "--no-deref", allocated, f.candidate.hex, "0".repeat(f.objectFormat === "sha1" ? 40 : 64)]];
  }
  const actual = f.commands.map(argv => gitBody(argv));
  return JSON.stringify(actual) === JSON.stringify(expected) ? undefined : "git-policy-initialization-plan";
}

type PolicyObject = Record<string, unknown>;
const policyObject = (value: unknown): value is PolicyObject => value !== null && typeof value === "object" && !Array.isArray(value);
const policySha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const policyEqual = (a: unknown, b: unknown) => JSON.stringify(gitCanonical(a)) === JSON.stringify(gitCanonical(b));
function policyRequire(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
function policyBytes(value: string): Buffer {
  const bytes = Buffer.from(value, "base64"); policyRequire(bytes.toString("base64") === value, "git-policy-raw-base64"); return bytes;
}
function policyGitObject(format: "sha1" | "sha256", kind: string, bytes: Buffer): GitOid {
  return { objectFormat: format, hex: createHash(format).update(Buffer.from(`${kind} ${bytes.length}\0`)).update(bytes).digest("hex") };
}
/** First stable workflow publication; the source was captured by the host before its written/consumed result. */
function initialWorkflowMetadataPaths(f: GitPolicyFacts, pub: GitInitialWorkflowPublication, bytes: Map<string, Buffer>, before: Map<string, { path: string; mode: "100644" | "100755"; oid: GitOid }>): Set<string> {
  const check: typeof policyRequire = policyRequire, canonical = (value: unknown) => JSON.stringify(gitCanonical(value));
  const decode = (content: Buffer): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
  const object = (content: Buffer): PolicyObject => { const value = decode(content); check(policyObject(value), "git-policy-workflow-json"); return value; };
  const json = (path: string) => { const content = bytes.get(path); check(content, "git-policy-workflow-file-missing"); return object(content); };
  const source = pub.source, record = pub.record, permit = pub.permit, journal = f.businessJournal;
  check(pub.actorRoleId === "convener" && f.actorRoleId === "convener" && pub.operationId === f.operationId && f.base !== null
    && source && source.schema === "stable-initial-workflow-source/v1" && source.kind === "stable-initial-workflow"
    && source.operationId === f.operationId && source.flowId === pub.flowId && source.taskId === f.taskId && source.runId === f.runId
    && [source.flowId, source.taskId, source.runId, source.coreSessionId, source.requestId, source.permitId].every(gitText)
    && (source.coreTurnId === undefined || gitText(source.coreTurnId)) && source.roleId === "convener" && source.path === "docs/workflow.md"
    && source.baseSha256 === "" && /^[a-f0-9]{64}$/.test(source.targetSha256)
    && policyEqual(source.documentSnapshot, pub.documentSnapshot)
    && f.operationId === `initial-workflow-${policySha(JSON.stringify([pub.flowId, source.requestId, source.permitId]))}`, "git-policy-workflow-source");
  const authority = source.authority;
  check(policyObject(authority) && (gitText(authority.decisionId) || gitText(authority.confirmationId))
    && Object.keys(authority).every(key => ["decisionId", "confirmationId"].includes(key))
    && [authority.decisionId, authority.confirmationId].every(value => value === undefined || gitText(value)), "git-policy-workflow-authority");
  check(policyEqual(source, { schema: source.schema, kind: source.kind, operationId: source.operationId, flowId: source.flowId, taskId: source.taskId, runId: source.runId,
    coreSessionId: source.coreSessionId, ...(source.coreTurnId === undefined ? {} : { coreTurnId: source.coreTurnId }), roleId: "convener", requestId: source.requestId, permitId: source.permitId,
    path: "docs/workflow.md", baseSha256: "", targetSha256: source.targetSha256, authority, documentCommit: source.documentCommit, documentSnapshot: source.documentSnapshot }), "git-policy-workflow-source-fields");
  for (const item of [record, permit]) check(item && item.v === 1 && item.schema === "stable-write/v1" && item.requestId === source.requestId && item.permitId === source.permitId
    && item.roleId === "convener" && item.path === source.path && item.kind === "workflow" && item.baseSha256 === "" && item.targetSha256 === source.targetSha256, "git-policy-workflow-write-binding");
  check(record.status === "written" && permit.status === "consumed" && policyEqual(permit.authority, authority)
    && record.decisionId === authority.decisionId && record.confirmationId === authority.confirmationId
    && record.approvedAt === permit.approvedAt && record.expiresAt === permit.expiresAt && record.consumedAt === permit.consumedAt, "git-policy-workflow-consumption");
  const time = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;
  const approved = time(permit.approvedAt), issued = time(permit.issuedAt), consumed = time(permit.consumedAt), written = time(record.writtenAt), expires = time(permit.expiresAt);
  check([approved, issued, consumed, written, expires, time(record.at)].every(Number.isFinite)
    && time(record.at) <= approved && approved <= issued && issued <= consumed && approved <= written && written <= consumed && consumed <= expires, "git-policy-workflow-write-times");
  const manifestPath = ".ans/trunk/manifest.json", manifest = json(manifestPath);
  check(f.businessBaseManifestBytesBase64, "git-policy-workflow-base-missing");
  const oldBytes = policyBytes(f.businessBaseManifestBytesBase64), previous = object(oldBytes);
  check(before.get(manifestPath)?.mode === "100644" && sameGitOid(before.get(manifestPath)?.oid, policyGitObject(f.objectFormat, "blob", oldBytes))
    && previous.schema === "trunk/v1" && previous.flowId === pub.flowId && previous.runId === null && policyObject(previous.artifacts)
    && previous.artifacts.workflow === undefined && !before.has(source.path)
    && policyEqual(source.documentCommit, { version: previous.trunkVersion, digest: previous.digest }) && policyEqual(previous.snapshotRef, pub.documentSnapshot), "git-policy-workflow-initial-basis");
  check(journal && journal.actionSource === undefined && journal.v === 1 && journal.schema === "trunk-apply-journal/v1"
    && journal.operationId === f.operationId && journal.flowId === pub.flowId && journal.applicationId === `stable:${source.requestId}` && journal.journalId === `j-${f.operationId}`
    && policyEqual(journal.beforeSnapshot, pub.documentSnapshot) && policyEqual(journal.targetSnapshot, pub.snapshot) && typeof journal.message === "string", "git-policy-workflow-journal");
  const metadata = object(Buffer.from(journal.message)), input = metadata.input;
  const sourcePath = `.ans/trunk/operations/${policySha(f.operationId)}/stable-source.json`, sourceBytes = Buffer.from(canonical(source));
  const sourceFile = { path: sourcePath, sha256: policySha(sourceBytes) };
  check(policyObject(input) && input.kind === "workflow" && input.roleId === "convener" && input.path === source.path && input.oldSha === "" && input.newSha === source.targetSha256
    && input.decisionId === authority.decisionId && input.confirmationId === authority.confirmationId && Number.isFinite(time(input.at))
    && Object.keys(input).every(key => ["kind", "roleId", "path", "oldSha", "newSha", "decisionId", "confirmationId", "at"].includes(key))
    && journal.message === canonical({ schema: "stable-initial-workflow/v1", source, sourceFile, record, permit, input }), "git-policy-workflow-source-metadata");
  check(bytes.get(sourcePath)?.equals(sourceBytes), "git-policy-workflow-source-bytes");
  const workflow = { kind: "workflow", path: source.path, sha256: source.targetSha256, updatedAt: input.at, ...authority };
  check(policyEqual(manifest, { ...previous, snapshotRef: pub.snapshot, updatedAt: input.at, artifacts: { ...previous.artifacts, workflow } })
    && policyEqual(previous.artifacts.documents, pub.documents) && policyEqual(previous.artifacts.execution, pub.execution), "git-policy-workflow-unrelated-metadata");
  check(policyEqual(journal.target, { ...journal.before, workflow: { path: source.path, sha256: source.targetSha256 } })
    && journal.before.workflow === undefined && journal.before.trunkVersion === previous.trunkVersion && journal.before.runId === previous.runId
    && policyEqual(journal.before.execution, pub.execution) && journal.startedAt === input.at && journal.updatedAt === input.at, "git-policy-workflow-journal-target");
  check(policyEqual(journal.before.documents, Object.fromEntries(Object.entries(pub.documents).map(([kind, ref]) => {
    check(policyObject(ref), "git-policy-workflow-document-ref"); return [kind, { path: ref.path, sha256: ref.sha256 }];
  }))), "git-policy-workflow-journal-documents");
  const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
  check(f.manifestSha256 === policySha(bytes.get(manifestPath)!) && f.journalDigest === policySha(canonical(binding))
    && f.rawObjectPlan?.input.timestamp === input.at && f.rawObjectPlan.input.message === `ANS trunk ${previous.trunkVersion} ${previous.digest}`, "git-policy-workflow-binding");
  check(Array.isArray(f.appGeneratedFiles) && f.appGeneratedFiles.length === bytes.size, "git-policy-workflow-files-incomplete");
  const table = new Map<string, GitAppGeneratedFile>();
  for (const row of f.appGeneratedFiles) {
    const content = bytes.get(row.path); check(content && !table.has(row.path) && row.sha256 === policySha(content)
      && sameGitOid(row.oid, policyGitObject(f.objectFormat, "blob", content)), "git-policy-workflow-file-hash"); table.set(row.path, row);
  }
  const recordsPath = ".ans/state/stable-writes.json", permitsPath = ".ans/state/stable-write-permits.json";
  const records = decode(bytes.get(recordsPath)!), permits = decode(bytes.get(permitsPath)!);
  check(Array.isArray(records) && Array.isArray(permits) && records.length <= 2048 && permits.length <= 2048
    && records.filter(row => policyObject(row) && row.requestId === source.requestId).length === 1
    && permits.filter(row => policyObject(row) && row.permitId === source.permitId).length === 1
    && policyEqual(records.find(row => policyObject(row) && row.requestId === source.requestId), record)
    && policyEqual(permits.find(row => policyObject(row) && row.permitId === source.permitId), permit), "git-policy-workflow-permit-table");
  const refs = new Map([[pub.snapshot.snapshotId, pub.snapshot.digest]]);
  for (const collection of [previous.activeRoles, previous.frozenRoles]) if (collection !== undefined) {
    check(policyObject(collection), "git-policy-workflow-role-collection"); for (const item of Object.values(collection)) {
      check(isActiveRoleEvidence(item), "git-policy-workflow-role-evidence"); const digest = refs.get(item.snapshotRef.snapshotId);
      check(digest === undefined || digest === item.snapshotRef.digest, "git-policy-workflow-snapshot-conflict"); refs.set(item.snapshotRef.snapshotId, item.snapshotRef.digest);
    }
  }
  const snapshots = new Map<string, CompleteSnapshot>(), allowed = new Set([manifestPath, source.path, recordsPath, permitsPath, sourcePath]);
  for (const row of table.values()) if (row.kind === "complete-snapshot") {
    const snapshot = json(row.path); check(isCompleteSnapshot(snapshot) && row.path === `.ans/trunk/snapshots/${snapshot.snapshotId}.json`
      && refs.get(snapshot.snapshotId) === snapshot.digest, "git-policy-workflow-snapshot-ref");
    snapshotDocumentText(snapshot, snapshot.files[0]!.path); snapshots.set(snapshot.snapshotId, snapshot); allowed.add(row.path);
    if (snapshot.snapshotId !== pub.snapshot.snapshotId) check(sameGitOid(before.get(row.path)?.oid, row.oid), "git-policy-workflow-old-snapshot-change");
  }
  const primary = snapshots.get(pub.snapshot.snapshotId); check(primary && snapshots.size === refs.size, "git-policy-workflow-snapshot-missing");
  const additions = new Set([source.path, recordsPath, permitsPath, sourcePath]), original = primary.files.filter(file => !additions.has(file.path));
  check(primary.files.filter(file => additions.has(file.path)).length === 4
    && policySha(JSON.stringify([...original].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => [file.path, file.sha256.toLowerCase(), file.bytesBase64]))) === pub.documentSnapshot.digest,
  "git-policy-workflow-original-snapshot");
  const workflowBytes = bytes.get(source.path); check(workflowBytes && policySha(workflowBytes) === source.targetSha256
    && new TextDecoder("utf-8", { fatal: true }).decode(workflowBytes).trim().length > 0, "git-policy-workflow-content-hash");
  const identity = policySha(JSON.stringify([previous.snapshotRef, source.requestId, source.targetSha256, table.get(recordsPath)?.sha256, table.get(permitsPath)?.sha256]));
  check(primary.snapshotId === `s-initial-workflow-${identity}` && primary.createdAt === input.at, "git-policy-workflow-snapshot-identity");
  const materialized = new Map(primary.files.map(file => [file.path, policyBytes(file.bytesBase64)]));
  for (const [id] of snapshots) materialized.set(`.ans/trunk/snapshots/${id}.json`, bytes.get(`.ans/trunk/snapshots/${id}.json`)!);
  materialized.set(manifestPath, bytes.get(manifestPath)!);
  const archive = `.ans/trunk/history/manifest-v${previous.trunkVersion}.json`;
  if (!before.has(archive)) { check(bytes.get(archive)?.equals(oldBytes), "git-policy-workflow-history-bytes"); materialized.set(archive, oldBytes); allowed.add(archive); }
  check(materialized.size === bytes.size && [...materialized].every(([path, content]) => bytes.get(path)?.equals(content)), "git-policy-workflow-materialized-files");
  for (const row of table.values()) {
    const kind = row.path === manifestPath ? "manifest" : snapshots.has(row.path.slice(".ans/trunk/snapshots/".length, -5)) && row.path.startsWith(".ans/trunk/snapshots/") ? "complete-snapshot"
      : row.path === archive ? "history" : row.path.startsWith(".ans/") ? "frozen-application-evidence" : "snapshot-content";
    check(row.kind === kind, "git-policy-workflow-file-kind");
    if (!allowed.has(row.path)) check(before.get(row.path)?.mode === "100644" && sameGitOid(before.get(row.path)?.oid, row.oid), "git-policy-workflow-unrelated-bytes");
  }
  return allowed;
}
/** Activation changes only one independent role pointer. Ordinary data is not host authorization or an I/O capability. */
function activationMetadataPaths(f: GitPolicyFacts, pub: GitRoleActivationPublication, bytes: Map<string, Buffer>, before: Map<string, { path: string; mode: "100644" | "100755"; oid: GitOid }>): Set<string> {
  const check: typeof policyRequire = policyRequire, canonical = (value: unknown) => JSON.stringify(gitCanonical(value));
  const parse = (content: Buffer): PolicyObject => { const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)); check(policyObject(value), "git-policy-active-json"); return value; };
  const json = (path: string) => { const content = bytes.get(path); check(content, "git-policy-active-file-missing"); return parse(content); };
  check(pub.actorRoleId === "nominator" && f.actorRoleId === "nominator" && pub.action === "activate-role-documents"
    && pub.operationId === f.operationId && gitText(pub.flowId) && gitText(pub.targetRoleId) && !/[\\/]/.test(pub.targetRoleId)
    && f.base !== null && f.businessBaseManifestBytesBase64 && isActiveRoleEvidence(pub.evidence) && pub.evidence.roleId === pub.targetRoleId
    && !("runId" in pub.evidence) && !("pinDigest" in pub.evidence) && policyEqual(pub.evidence.snapshotRef, pub.snapshot), "git-policy-active-source");
  const evidence = pub.evidence, manifestPath = ".ans/trunk/manifest.json", manifest = json(manifestPath);
  const baseBytes = policyBytes(f.businessBaseManifestBytesBase64), previous = parse(baseBytes);
  check(before.get(manifestPath)?.mode === "100644" && sameGitOid(before.get(manifestPath)?.oid, policyGitObject(f.objectFormat, "blob", baseBytes)), "git-policy-active-base");
  const stripActive = (value: PolicyObject) => { const { activeRoles: _roles, activeRevision: _revision, activeDigest: _digest, ...document } = value; return document; };
  check(manifest.schema === "trunk/v1" && manifest.flowId === pub.flowId && policyEqual(stripActive(manifest), stripActive(previous))
    && policyEqual(manifest.snapshotRef, pub.documentSnapshot) && policyObject(manifest.artifacts)
    && policyEqual(manifest.artifacts.documents, pub.documents) && policyEqual(manifest.artifacts.execution, pub.execution), "git-policy-active-document-change");
  const oldRoles = previous.activeRoles ?? {}; check(policyObject(oldRoles), "git-policy-active-old-roles");
  const unchanged = policyEqual(oldRoles[pub.targetRoleId], evidence);
  check(policyEqual(pub.expectedActive, { revision: previous.activeRevision ?? 0, digest: previous.activeDigest ?? null })
    && Number.isSafeInteger(pub.expectedActive.revision) && pub.expectedActive.revision >= 0
    && pub.targetActive.revision === pub.expectedActive.revision + (unchanged ? 0 : 1)
    && policyEqual(pub.targetActive.roles, { ...oldRoles, [pub.targetRoleId]: evidence })
    && pub.targetActive.digest === policySha(canonical(pub.targetActive.roles))
    && manifest.activeRevision === pub.targetActive.revision && manifest.activeDigest === pub.targetActive.digest
    && policyEqual(manifest.activeRoles, pub.targetActive.roles), "git-policy-active-target");
  const journal = f.businessJournal, source = journal?.actionSource;
  const opHash = policySha(canonical(f.operationId)), identityHash = policySha(canonical([pub.flowId, f.operationId]));
  check(journal && isDirectActionSource(source) && source.kind === "role-direct" && source.actorRoleId === "nominator"
    && source.action === "activate-role-documents" && source.operationId === f.operationId && source.applicationId === pub.applicationId
    && pub.applicationId === `activation-${identityHash}` && source.journalId === `j-activation-${opHash.slice(0, 24)}`
    && source.baseDigest === pub.expectedActive.digest && source.targetDigest === pub.targetActive.digest
    && journal.operationId === f.operationId && journal.applicationId === pub.applicationId && journal.journalId === source.journalId
    && journal.flowId === pub.flowId && policyEqual(journal.targetSnapshot, pub.snapshot) && policyEqual(journal.beforeSnapshot, pub.documentSnapshot)
    && policyEqual(journal.target, journal.before) && journal.target.trunkVersion === manifest.trunkVersion && journal.target.runId === manifest.runId
    && policyEqual(journal.target.execution, pub.execution) && typeof journal.message === "string", "git-policy-active-journal");
  check(policyEqual(journal.target.documents, Object.fromEntries(Object.entries(pub.documents).map(([kind, ref]) => {
    check(policyObject(ref), "git-policy-active-document-ref"); return [kind, { path: ref.path, sha256: ref.sha256 }];
  }))), "git-policy-active-journal-documents");
  const { phase: _phase, updatedAt: _updated, result: _result, ...binding } = journal;
  check(f.journalDigest === policySha(canonical(binding)) && f.manifestSha256 === policySha(bytes.get(manifestPath)!)
    && f.rawObjectPlan?.input.timestamp === manifest.updatedAt && f.rawObjectPlan?.input.message === `ANS trunk ${manifest.trunkVersion} ${manifest.digest}`, "git-policy-active-binding");
  check(Array.isArray(f.appGeneratedFiles) && f.appGeneratedFiles.length === bytes.size, "git-policy-active-files-incomplete");
  const table = new Map<string, GitAppGeneratedFile>();
  for (const row of f.appGeneratedFiles) {
    const content = bytes.get(row.path); check(content && !table.has(row.path) && row.sha256 === policySha(content)
      && sameGitOid(row.oid, policyGitObject(f.objectFormat, "blob", content)), "git-policy-active-file-hash"); table.set(row.path, row);
  }
  check(table.get(manifestPath)?.kind === "manifest", "git-policy-active-manifest-kind");
  const refs = new Map([[pub.documentSnapshot.snapshotId, pub.documentSnapshot.digest]]);
  for (const collection of [manifest.activeRoles, manifest.frozenRoles]) if (collection !== undefined) {
    check(policyObject(collection), "git-policy-active-collection");
    for (const item of Object.values(collection)) {
      check(isActiveRoleEvidence(item), "git-policy-active-evidence-shape"); const old = refs.get(item.snapshotRef.snapshotId);
      check(old === undefined || old === item.snapshotRef.digest, "git-policy-active-snapshot-conflict"); refs.set(item.snapshotRef.snapshotId, item.snapshotRef.digest);
    }
  }
  const snapshots = new Map<string, CompleteSnapshot>(), allowed = new Set([manifestPath]);
  for (const row of table.values()) if (row.kind === "complete-snapshot") {
    const snapshot = json(row.path); check(isCompleteSnapshot(snapshot) && refs.get(snapshot.snapshotId) === snapshot.digest
      && row.path === `.ans/trunk/snapshots/${snapshot.snapshotId}.json`, "git-policy-active-snapshot-ref");
    snapshotDocumentText(snapshot, snapshot.files[0]!.path); snapshots.set(snapshot.snapshotId, snapshot); allowed.add(row.path);
    if (snapshot.snapshotId !== pub.snapshot.snapshotId || unchanged) check(sameGitOid(before.get(row.path)?.oid, row.oid), "git-policy-active-old-snapshot-change");
  }
  check(snapshots.size === refs.size, "git-policy-active-snapshot-missing");
  const snapshot = snapshots.get(pub.snapshot.snapshotId), document = snapshots.get(pub.documentSnapshot.snapshotId);
  check(snapshot && document && snapshot.files.length === FROZEN_ROLE_REF_KEYS.length
    && new Set(FROZEN_ROLE_REF_KEYS.map(key => evidence[key].path)).size === FROZEN_ROLE_REF_KEYS.length, "git-policy-active-eight-refs");
  for (const key of FROZEN_ROLE_REF_KEYS) {
    const ref = evidence[key], file = snapshot.files.find(file => file.path === ref.path && file.sha256 === ref.sha256);
    check(file && table.get(ref.path)?.sha256 === ref.sha256 && bytes.get(ref.path)?.equals(policyBytes(file.bytesBase64)), "git-policy-active-ref-bytes");
  }
  const projectRef = (ref: { path: string; sha256: string }) => ({ path: ref.path, sha256: ref.sha256 });
  const currentRoster = pub.documents.roster, currentModules = pub.documents.modules;
  check(policyObject(currentRoster) && policyObject(currentModules)
    && policyEqual(projectRef(evidence.rosterRef), { path: currentRoster.path, sha256: currentRoster.sha256 })
    && policyEqual(projectRef(evidence.planRef), pub.execution.teamPlan), "git-policy-active-plan-roster");
  for (const ref of [evidence.rosterRef, evidence.planRef]) check(document.files.some(file => file.path === ref.path && file.sha256 === ref.sha256), "git-policy-active-document-evidence");
  const frontmatter = (path: string): PolicyObject => {
    const text = snapshotDocumentText(snapshot, path), match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    check(match, "git-policy-active-frontmatter"); const value: unknown = parseYaml(match[1]!); check(policyObject(value), "git-policy-active-frontmatter"); return value;
  };
  const roster = frontmatter(evidence.rosterRef.path), plan = frontmatter(evidence.planRef.path);
  check(roster.schema === "project-roster/v3" && roster.flowId === pub.flowId && Array.isArray(roster.roles) && Array.isArray(roster.modules)
    && plan.schema === "teamPlanSchema:3" && plan.flowId === pub.flowId && Array.isArray(plan.roleRows)
    && policyEqual(plan.roster, projectRef(evidence.rosterRef)) && policyEqual(plan.modules, { path: currentModules.path, sha256: currentModules.sha256 }), "git-policy-active-planning-shape");
  const rosterRoles = roster.roles;
  const selected = rosterRoles.filter((role: unknown) => policyObject(role) && role.id === pub.targetRoleId), rows = plan.roleRows.filter((row: unknown) => policyObject(row) && row.roleId === pub.targetRoleId);
  check(selected.length === 1 && rows.length === 1 && policyObject(selected[0]) && Array.isArray(selected[0].modules)
    && policyObject(rows[0]) && policyEqual(rows[0].modules, selected[0].modules) && Array.isArray(rows[0].writesets) && rows[0].writesets.length > 0, "git-policy-active-plan-role");
  const writesets: string[] = rows[0].writesets; check(writesets.every(path => typeof path === "string" && gitPath(path.replace(/\/$/, ""))), "git-policy-active-writesets");
  const scopes: { path: string; kind: "file" | "directory" }[] = [];
  for (const moduleId of selected[0].modules) {
    const modules = roster.modules.filter((module: unknown) => policyObject(module) && module.id === moduleId);
    check(modules.length === 1 && policyObject(modules[0]) && roster.roles.filter((role: unknown) => policyObject(role) && Array.isArray(role.modules) && role.modules.includes(moduleId)).length === 1, "git-policy-active-module-owner");
    const rawPaths: unknown = modules[0].paths ?? modules[0].path, paths: unknown[] = Array.isArray(rawPaths) ? rawPaths : [rawPaths];
    check(paths.length > 0, "git-policy-active-module-path");
    for (const raw of paths) { check(typeof raw === "string", "git-policy-active-module-path"); const path = raw.trim().replace(/\\/g, "/");
      check(gitPath(path.replace(/\/$/, "")), "git-policy-active-module-path"); scopes.push({ path, kind: path.endsWith("/") ? "directory" : "file" }); }
  }
  const role = { roleId: pub.targetRoleId, cardPath: evidence.cardRef.path, boundaryMdPath: evidence.boundaryMdRef.path, boundaryYamlPath: evidence.boundaryYamlRef.path, allowedPaths: scopes };
  check(validateRoleDocumentsSnapshot({ snapshot, roles: [role] }).ok, "git-policy-active-role-documents");
  const parsedRole = parseSnapshotRoleDocuments(snapshot, role);
  check(writesets.every(write => parsedRole.entries.some(entry => entry.root === "project" && entry.kind !== "conditional-directory"
    && (entry.kind === "file" ? write === entry.path : gitCovered(write, [entry.path.endsWith("/") ? entry.path : `${entry.path}/`])))), "git-policy-active-boundary-writesets");
  const d3 = json(evidence.d3Ref.path); check(typeof d3.createdBytesBase64 === "string" && typeof d3.resolvedBytesBase64 === "string", "git-policy-active-d3-bytes");
  const created = parse(policyBytes(d3.createdBytesBase64)), resolved = parse(policyBytes(d3.resolvedBytesBase64));
  check(created.v === 1 && created.kind === "request.created" && created.flowId === pub.flowId && created.cardKind === "appointment" && created.sourceRoleId === "nominator"
    && gitText(created.requestId) && resolved.v === 1 && resolved.kind === "request.resolved" && resolved.cardKind === "appointment" && resolved.requestId === created.requestId
    && (resolved.flowId === undefined || resolved.flowId === pub.flowId) && ["customer", "chief-delegated"].includes(String(resolved.by))
    && Array.isArray(resolved.targetRoleIds) && resolved.targetRoleIds.includes(pub.targetRoleId)
    && resolved.targetRoleIds.every(id => rosterRoles.some((role: unknown) => policyObject(role) && role.id === id))
    && resolved.rosterVersion === roster.version && resolved.rosterSha256 === evidence.rosterRef.sha256
    && evidence.d3Ref.path === `.ans/role-evidence/d3-${policySha(canonical(created.requestId))}.json`, "git-policy-active-d3-selection");
  if (resolved.by === "chief-delegated") check(isDirectActionSource(resolved.actionSource) && resolved.actionSource.kind === "chief-delegated"
    && resolved.actionSource.requestId === created.requestId && resolved.actionSource.originRoleId === "nominator" && resolved.actionSource.disposition === "select"
    && policyEqual(resolved.actionSource.selected, resolved.targetRoleIds) && resolved.decisionId === undefined, "git-policy-active-delegated-d3");
  else check(gitText(resolved.decisionId) && (resolved.actionSource === undefined || (isDirectActionSource(resolved.actionSource)
    && resolved.actionSource.kind === "customer-decision" && resolved.actionSource.decisionId === resolved.decisionId)), "git-policy-active-customer-d3");
  const activation = json(evidence.activationRef.path), input = activation.input, authorization = json(evidence.authorizationRef.path);
  check(activation.schema === "role-activation/v1" && activation.actorRoleId === "nominator" && policyObject(input) && input.flowId === pub.flowId
    && input.targetRoleId === pub.targetRoleId && gitText(input.operationId) && (unchanged || input.operationId === f.operationId)
    && input.d3DecisionId === (resolved.by === "customer" ? resolved.decisionId : resolved.requestId) && policyObject(input.documents)
    && policyEqual(input.documents, { card: projectRef(evidence.cardRef), boundaryMd: projectRef(evidence.boundaryMdRef), boundaryYaml: projectRef(evidence.boundaryYamlRef) })
    && policyObject(input.planRef) && policyObject(input.rosterRef) && gitText(input.planRef.snapshotId) && input.planRef.snapshotId === input.rosterRef.snapshotId
    && policyEqual(projectRef(input.planRef as { path: string; sha256: string }), projectRef(evidence.planRef))
    && policyEqual(projectRef(input.rosterRef as { path: string; sha256: string }), projectRef(evidence.rosterRef))
    && evidence.activationRef.path === `.ans/role-evidence/activation-${policySha(canonical(input.operationId))}.json`, "git-policy-active-input");
  const expectedAuthorization = { schema: "role-authorization/v1", flowId: pub.flowId, roleId: pub.targetRoleId, plan: projectRef(evidence.planRef), roster: projectRef(evidence.rosterRef),
    d3RequestId: created.requestId, d3Source: resolved.by, ...(resolved.actionSource ? { actionSource: resolved.actionSource } : { decisionId: resolved.decisionId }), writesets };
  check(evidence.authorizationRef.path === `.ans/role-evidence/authorization-${pub.targetRoleId}.json` && policyEqual(authorization, expectedAuthorization), "git-policy-active-authorization");
  const metadata = parse(Buffer.from(journal.message));
  check(policyEqual(metadata.evidence, evidence) && policyEqual(metadata.expectedActive, pub.expectedActive)
    && policyEqual(metadata.targetActive, { revision: pub.targetActive.revision, digest: pub.targetActive.digest }) && metadata.noOp === unchanged
    && policyEqual(metadata.expectedTrunk, { version: manifest.trunkVersion, digest: manifest.digest }) && policyEqual(metadata.role, role) && policyEqual(metadata.writesets, writesets)
    && policyEqual(metadata.input, { ...input, operationId: f.operationId }), "git-policy-active-prepared-metadata");
  const targetPaths = new Set([evidence.cardRef.path, evidence.boundaryMdRef.path, evidence.boundaryYamlRef.path, evidence.d3Ref.path, evidence.activationRef.path, evidence.authorizationRef.path]);
  for (const row of table.values()) {
    check(row.kind !== "history" && !row.path.startsWith(".ans/trunk/history/"), "git-policy-active-history");
    if (row.kind === "manifest" || row.kind === "complete-snapshot") continue;
    if (targetPaths.has(row.path)) { check(row.kind === (row.path.startsWith("角色卡/") ? "snapshot-content" : "frozen-application-evidence"), "git-policy-active-target-kind"); allowed.add(row.path); }
    else check(before.get(row.path)?.mode === "100644" && sameGitOid(before.get(row.path)?.oid, row.oid), "git-policy-active-unrelated-bytes");
  }
  // Immutable snapshots retain their full bytes. Physical aliases follow the real active-only materializer:
  // document files plus six refs per active role; frozen historical plan/roster aliases are not rewritten.
  const materialized = new Map(document.files.map(file => [file.path, policyBytes(file.bytesBase64)]));
  for (const [id] of snapshots) materialized.set(`.ans/trunk/snapshots/${id}.json`, bytes.get(`.ans/trunk/snapshots/${id}.json`)!);
  materialized.set(manifestPath, bytes.get(manifestPath)!);
  for (const active of Object.values(pub.targetActive.roles)) {
    const stored = snapshots.get(active.snapshotRef.snapshotId); check(stored, "git-policy-active-materialized-snapshot");
    for (const key of ["cardRef", "boundaryMdRef", "boundaryYamlRef", "d3Ref", "activationRef", "authorizationRef"] as const) {
      const ref = active[key], file = stored.files.find(file => file.path === ref.path && file.sha256 === ref.sha256);
      check(file, "git-policy-active-materialized-ref"); materialized.set(ref.path, policyBytes(file.bytesBase64));
    }
  }
  check(materialized.size === bytes.size && [...materialized].every(([path, content]) => bytes.get(path)?.equals(content)), "git-policy-active-complete-files");
  return allowed;
}
function appMetadataPaths(f: GitPolicyFacts, bytes: Map<string, Buffer>, before: Map<string, { path: string; mode: "100644" | "100755"; oid: GitOid }>): Set<string> {
  if (f.businessPublication?.kind === "stable-initial-workflow-publication") return initialWorkflowMetadataPaths(f, f.businessPublication, bytes, before);
  if (f.businessPublication?.kind === "role-activation-publication") return activationMetadataPaths(f, f.businessPublication, bytes, before);
  const allowed = new Set<string>(), pub = f.businessPublication;
  policyRequire(pub && pub.kind === "direct-document-publication" && pub.operationId === f.operationId && pub.actorRoleId === f.actorRoleId
    && gitText(pub.flowId) && gitText(pub.applicationId)
    && ((pub.action === "version-upgrade" && f.actorRoleId === "product") || (pub.action === "detail-amendment" && f.actorRoleId === "rapporteur")
      || (pub.action === "complete-team-plan" && f.actorRoleId === "convener")), "git-policy-business-source");
  const teamPlan = pub.action === "complete-team-plan";
  policyRequire(Array.isArray(f.appGeneratedFiles) && f.appGeneratedFiles.length === bytes.size, "git-policy-app-files-incomplete");
  const table = new Map<string, GitAppGeneratedFile>();
  for (const row of f.appGeneratedFiles) {
    const content = bytes.get(row.path);
    policyRequire(content && !table.has(row.path) && row.sha256 === policySha(content)
      && sameGitOid(row.oid, policyGitObject(f.objectFormat, "blob", content)), "git-policy-app-file-hash");
    table.set(row.path, row);
  }
  const json = (file: string): PolicyObject => {
    const content = bytes.get(file); policyRequire(content, "git-policy-app-file-missing");
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
    policyRequire(policyObject(parsed), "git-policy-app-json"); return parsed;
  };
  const manifestPath = ".ans/trunk/manifest.json", manifestBytes = bytes.get(manifestPath), manifest = json(manifestPath);
  policyRequire(table.get(manifestPath)?.kind === "manifest" && manifestBytes && policySha(manifestBytes) === f.manifestSha256
    && manifest.schema === "trunk/v1" && manifest.flowId === pub.flowId && policyEqual(manifest.snapshotRef, pub.snapshot)
    && policyObject(manifest.artifacts) && policyEqual(manifest.artifacts.documents, pub.documents) && policyEqual(manifest.artifacts.execution, pub.execution), "git-policy-app-manifest-binding");
  const source = manifest.actionSource, journal = f.businessJournal;
  policyRequire(isDirectActionSource(source) && source.kind === "role-direct" && source.operationId === f.operationId
    && source.actorRoleId === f.actorRoleId && source.applicationId === pub.applicationId && source.action === pub.action
    && source.targetDigest === manifest.digest && journal && journal.operationId === f.operationId
    && policyEqual(journal.actionSource, source) && policyEqual(journal.targetSnapshot, pub.snapshot)
    && journal.target.trunkVersion === manifest.trunkVersion
    && policyEqual(journal.target.documents, Object.fromEntries(Object.entries(pub.documents).map(([key, ref]) => {
      policyRequire(policyObject(ref), "git-policy-app-document-ref"); return [key, { path: ref.path, sha256: ref.sha256 }];
    })))
    && policyEqual(journal.target.execution, pub.execution), "git-policy-app-journal-source");
  const { phase: _phase, updatedAt: _updated, result: _result, ...journalBinding } = journal;
  policyRequire(policySha(JSON.stringify(gitCanonical(journalBinding))) === f.journalDigest, "git-policy-app-journal-digest");
  policyRequire(f.rawObjectPlan?.input.timestamp === manifest.updatedAt
    && f.rawObjectPlan?.input.message === `ANS trunk ${manifest.trunkVersion} ${manifest.digest}`, "git-policy-app-command-source");
  let previous: PolicyObject | undefined;
  if (f.base !== null) {
    policyRequire(f.businessBaseManifestBytesBase64 && before.get(manifestPath), "git-policy-app-base-unproven");
    const old = policyBytes(f.businessBaseManifestBytesBase64);
    policyRequire(sameGitOid(before.get(manifestPath)!.oid, policyGitObject(f.objectFormat, "blob", old)), "git-policy-app-base-hash");
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(old));
    policyRequire(policyObject(parsed) && parsed.flowId === pub.flowId && policyObject(parsed.artifacts), "git-policy-app-base-shape"); previous = parsed;
    for (const key of ["activeRoles", "activeRevision", "activeDigest", "frozenRoles", "d3", "roles", "runId"])
      policyRequire(policyEqual(manifest[key], previous[key]), "git-policy-app-authorization-change");
    for (const key of ["workflow", "roleCards", "boundaries"])
      policyRequire(policyEqual(manifest.artifacts[key], parsed.artifacts[key]), "git-policy-app-stable-change");
  } else {
    policyRequire(!teamPlan, "git-policy-plan-base-required");
    for (const key of ["activeRoles", "activeRevision", "activeDigest", "frozenRoles", "d3", "roles"])
      policyRequire(manifest[key] === undefined, "git-policy-app-future-authorization");
    policyRequire(manifest.runId === null && manifest.artifacts.workflow === undefined
      && [manifest.artifacts.roleCards, manifest.artifacts.boundaries].every(v => v === undefined || (policyObject(v) && Object.keys(v).length === 0)), "git-policy-app-future-execution");
  }
  let planPath: string | undefined, planMarker: { path: string; bytes: string } | undefined;
  if (teamPlan) {
    policyRequire(previous && policyObject(previous.artifacts) && policyObject(previous.artifacts.execution) && policyObject(manifest.artifacts.execution)
      && policyEqual(manifest.artifacts.documents, previous.artifacts.documents)
      && policyEqual(manifest.artifacts.execution.flow, previous.artifacts.execution.flow)
      && source.baseDigest === previous.digest && policyEqual(journal.beforeSnapshot, previous.snapshotRef)
      && journal.before.trunkVersion === previous.trunkVersion && policyEqual(journal.before.execution, previous.artifacts.execution), "git-policy-plan-basis");
    const ref = pub.execution.teamPlan;
    policyRequire(policyObject(ref) && typeof ref.path === "string" && typeof ref.sha256 === "string"
      && policyEqual(ref, { path: ref.path, sha256: ref.sha256 }), "git-policy-plan-ref");
    policyRequire(policyEqual(manifest, { ...previous, source: manifest.source, trunkVersion: manifest.trunkVersion, previous: manifest.previous,
      updatedAt: manifest.updatedAt, artifacts: { ...previous.artifacts, execution: { ...previous.artifacts.execution, teamPlan: ref } },
      snapshotRef: manifest.snapshotRef, digest: manifest.digest, actionSource: source }), "git-policy-plan-unrelated-metadata");
    planPath = ref.path;
    const match = /-team-v([1-9]\d*)\.md$/.exec(planPath), version = Number(match?.[1]);
    policyRequire(Number.isSafeInteger(version) && planPath === `docs/scheduling/${pub.flowId}-team-v${version}.md`
      && policyObject(pub.documents.modules) && policyObject(pub.documents.roster), "git-policy-plan-ref");
    const noOp = policyEqual(ref, previous.artifacts.execution.teamPlan);
    policyRequire(Number.isSafeInteger(previous.trunkVersion) && manifest.trunkVersion === Number(previous.trunkVersion) + (noOp ? 0 : 1)
      && (noOp ? manifest.digest === previous.digest && manifest.source === previous.source && policyEqual(manifest.previous, previous.previous)
        : manifest.source === "team-plan" && manifest.digest !== previous.digest
          && policyEqual(manifest.previous, { trunkVersion: previous.trunkVersion, runId: previous.runId })), "git-policy-plan-version");
    const projection = (ref: PolicyObject) => ({ path: ref.path, sha256: ref.sha256 });
    const marker = { schema: "team-plan-completion/v1", operationId: f.operationId, actorRoleId: "convener", flowId: pub.flowId,
      plan: { ...projection(ref), version }, modules: projection(pub.documents.modules), roster: projection(pub.documents.roster) };
    const opDigest = policySha(JSON.stringify(f.operationId));
    planMarker = { path: `.ans/trunk/plan-completions/${opDigest}.json`, bytes: JSON.stringify(gitCanonical(marker)) };
    policyRequire(pub.applicationId === `plan-${policySha(JSON.stringify([pub.flowId, f.operationId]))}`
      && source.journalId === `j-plan-${opDigest.slice(0, 24)}` && journal.journalId === source.journalId
      && journal.applicationId === pub.applicationId && journal.flowId === pub.flowId && journal.target.runId === previous.runId,
    "git-policy-plan-source");
    policyRequire(table.get(planMarker.path)?.kind === "frozen-application-evidence" && bytes.get(planMarker.path)?.equals(Buffer.from(planMarker.bytes)), "git-policy-plan-marker");
    if (!noOp) policyRequire(manifest.digest === policySha(JSON.stringify(gitCanonical({ flowId: pub.flowId, trunkVersion: manifest.trunkVersion,
      artifacts: manifest.artifacts, snapshotRef: manifest.snapshotRef }))), "git-policy-plan-target-digest");
  }
  const expectedSnapshots = new Map([[pub.snapshot.snapshotId, pub.snapshot.digest]]);
  for (const collection of [manifest.activeRoles, manifest.frozenRoles]) if (collection !== undefined) {
    policyRequire(policyObject(collection), "git-policy-app-role-evidence-shape");
    for (const evidence of Object.values(collection)) {
      policyRequire(policyObject(evidence) && policyObject(evidence.snapshotRef) && typeof evidence.snapshotRef.snapshotId === "string"
        && typeof evidence.snapshotRef.digest === "string", "git-policy-app-role-snapshot-ref");
      const snapshotId = evidence.snapshotRef.snapshotId, digest = evidence.snapshotRef.digest, prior = expectedSnapshots.get(snapshotId);
      policyRequire(prior === undefined || prior === digest, "git-policy-app-snapshot-conflict"); expectedSnapshots.set(snapshotId, digest);
    }
  }
  const snapshots = new Map<string, import("../../model/trunk.ts").CompleteSnapshot>();
  for (const row of table.values()) if (row.kind === "complete-snapshot") {
    const parsed = json(row.path);
    policyRequire(isCompleteSnapshot(parsed) && row.path === `.ans/trunk/snapshots/${parsed.snapshotId}.json`
      && expectedSnapshots.get(parsed.snapshotId) === parsed.digest, "git-policy-app-snapshot-shape");
    const seen = new Set<string>();
    for (const file of parsed.files) {
      policyRequire(!seen.has(file.path.toLowerCase()) && policySha(policyBytes(file.bytesBase64)) === file.sha256.toLowerCase(), "git-policy-app-snapshot-bytes"); seen.add(file.path.toLowerCase());
    }
    const digest = policySha(JSON.stringify([...parsed.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => [file.path, file.sha256.toLowerCase(), file.bytesBase64])));
    policyRequire(digest === parsed.digest, "git-policy-app-snapshot-digest"); snapshots.set(parsed.snapshotId, parsed); allowed.add(row.path);
  }
  const primary = snapshots.get(pub.snapshot.snapshotId);
  policyRequire(primary && primary.digest === pub.snapshot.digest && snapshots.size === expectedSnapshots.size, "git-policy-app-snapshot-missing");
  policyRequire(primary.files.every(file => {
    const row = table.get(file.path); return row?.sha256 === file.sha256
      && ["snapshot-content", "frozen-application-evidence"].includes(row.kind);
  }), "git-policy-app-snapshot-content-incomplete");
  const artifactPaths = new Set<string>();
  const patterns: Record<string, RegExp> = { intent: /^docs\/product\/[^/]+-intent-v[1-9]\d*\.md$/, proposal: /^docs\/proposals\/[^/]+-proposal-v[1-9]\d*\.md$/,
    roster: /^docs\/proposals\/[^/]+-roster-v[1-9]\d*\.md$/, modules: /^docs\/proposals\/[^/]+-modules-v[1-9]\d*\.md$/, topology: /^docs\/proposals\/[^/]+-topology-v[1-9]\d*\.md$/,
    architecture: /^docs\/contracts\/[^/]+-architecture-v[1-9]\d*\.md$/, assets: /^docs\/contracts\/[^/]+-assets-v[1-9]\d*\.md$/ };
  for (const [kind, ref] of Object.entries(pub.documents)) {
    policyRequire(patterns[kind] && policyObject(ref) && typeof ref.path === "string" && typeof ref.sha256 === "string", "git-policy-app-document-ref");
    const file = ref.path.split("#")[0]!;
    const directory = ["architecture", "assets"].includes(kind) ? "contracts" : "proposals";
    policyRequire(patterns[kind]!.test(file) && file.startsWith(`docs/${directory}/${pub.flowId}-${kind}-v`)
      && primary.files.some(f => f.path === file && f.sha256 === ref.sha256), "git-policy-app-document-closure"); artifactPaths.add(file);
  }
  for (const [kind, ref] of Object.entries(pub.execution)) if (ref !== null) {
    policyRequire(["teamPlan", "flow"].includes(kind) && policyObject(ref) && typeof ref.path === "string" && typeof ref.sha256 === "string", "git-policy-app-execution-ref");
    const file = ref.path.split("#")[0]!;
    policyRequire((kind === "teamPlan" ? file.startsWith("docs/scheduling/") : file.startsWith("docs/flows/"))
      && primary.files.some(f => f.path === file && f.sha256 === ref.sha256), "git-policy-app-execution-closure"); artifactPaths.add(file);
  }
  for (const row of table.values()) {
    if (row.kind === "manifest") policyRequire(row.path === manifestPath, "git-policy-app-manifest-path");
    else if (row.kind === "history") {
      policyRequire(previous && row.path === `.ans/trunk/history/manifest-v${previous.trunkVersion}.json`
        && bytes.get(row.path)!.equals(policyBytes(f.businessBaseManifestBytesBase64!)), "git-policy-app-history-binding"); allowed.add(row.path);
    } else if (row.kind === "frozen-application-evidence") {
      if (planMarker && row.path === planMarker.path) {
        policyRequire(primary.files.some(file => file.path === row.path && file.sha256 === row.sha256)
          && bytes.get(row.path)!.equals(Buffer.from(planMarker.bytes)), "git-policy-plan-marker"); allowed.add(row.path); continue;
      }
      policyRequire(row.path === ".ans/state/versions.jsonl" && primary.files.some(file => file.path === row.path && file.sha256 === row.sha256), "git-policy-app-evidence-path");
      for (const line of bytes.get(row.path)!.toString("utf8").split(/\r?\n/).filter(line => line.trim())) {
        const record: unknown = JSON.parse(line);
        policyRequire(policyObject(record) && record.v === 1 && record.flowId === pub.flowId && typeof record.path === "string"
          && Number.isSafeInteger(record.version) && Number(record.version) > 0 && typeof record.sha256 === "string", "git-policy-app-freeze-record");
        const file = /-v\d+\.md$/.test(record.path) ? record.path : `${record.path}-v${record.version}.md`;
        policyRequire(primary.files.some(item => item.path === file && item.sha256 === record.sha256), "git-policy-app-freeze-closure");
        policyRequire(record.event === "frozen" ? isValidDocFreezeRecord(record.freeze)
          : ["baseline", "version-added", "draft-updated", "draft-marker"].includes(String(record.event)) && record.freeze === undefined, "git-policy-app-freeze-source");
      }
      allowed.add(row.path);
    } else if (row.kind === "snapshot-content") {
      policyRequire(!row.path.startsWith(".ans/") && primary.files.some(file => file.path === row.path && file.sha256 === row.sha256), "git-policy-app-content-closure");
      if (artifactPaths.has(row.path)) allowed.add(row.path);
    } else policyRequire(row.kind === "complete-snapshot" && allowed.has(row.path), "git-policy-app-file-kind");
  }
  if (teamPlan) for (const row of table.values()) if (row.kind === "snapshot-content" || row.kind === "frozen-application-evidence") {
    if (row.path === planPath || row.path === planMarker!.path) continue;
    policyRequire(before.get(row.path)?.mode === "100644" && sameGitOid(before.get(row.path)?.oid, row.oid), "git-policy-plan-unrelated-bytes");
  }
  allowed.add(manifestPath); return allowed;
}

/** Reconstruct immutable objects and an exact, conflict-free inverse. No observations authorize effects. */
function revertExpectedTree(f: GitPolicyFacts, observation: { basis: GitRawRevertBasis; target: GitOid | undefined; mainline: number | undefined; base: GitOid | null | undefined; baseTree: RawTree }): Map<string, GitRawTreeEntry> {
  const check: typeof policyRequire = policyRequire, basis = observation.basis, format = f.objectFormat;
  check(basis && f.actorRoleId === "convener" && gitText(f.runId) && gitOid(observation.target, format) && gitOid(observation.base, format)
    && f.writePaths.length === 0 && !f.businessPublication && !f.appGeneratedFiles, "git-policy-revert-basis");
  const read = (fact: GitRawRevertCommit) => {
    check(fact && gitOid(fact.commit, format) && gitOid(fact.tree, format) && Array.isArray(fact.entries) && fact.entries.length <= 2048, "git-policy-revert-object");
    const bytes = policyBytes(fact.commitBytesBase64);
    check(bytes.length <= 65536 && sameGitOid(policyGitObject(format, "commit", bytes), fact.commit), "git-policy-revert-commit-hash");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), split = text.indexOf("\n\n"), header = text.slice(0, split).split("\n");
    check(split > 0 && header[0] === `tree ${fact.tree.hex}` && header.filter(line => line.startsWith("tree ")).length === 1, "git-policy-revert-commit-tree");
    const parents = header.filter(line => line.startsWith("parent ")).map(line => ({ objectFormat: format, hex: line.slice(7) }));
    check(parents.length <= 65 && parents.every(parent => gitOid(parent, format)) && new Set(parents.map(p => p.hex)).size === parents.length, "git-policy-revert-parent-shape");
    type Dir = Map<string, Dir | GitRawTreeEntry>; const root: Dir = new Map(), entries = new Map<string, GitRawTreeEntry>();
    for (const entry of fact.entries) {
      check(gitPath(entry.path) && ["100644", "100755", "120000", "160000"].includes(entry.mode) && gitOid(entry.oid, format)
        && ![...entries.keys()].some(p => p.toLowerCase() === entry.path.toLowerCase()), "git-policy-revert-entry"); entries.set(entry.path, entry);
      const parts = entry.path.split("/"); let dir = root;
      for (const name of parts.slice(0, -1)) { const prior = dir.get(name); check(!prior || prior instanceof Map, "git-policy-revert-tree-collision"); const next = prior ?? new Map(); dir.set(name, next); dir = next; }
      check(!dir.has(parts.at(-1)!), "git-policy-revert-tree-collision"); dir.set(parts.at(-1)!, entry);
    }
    const hashTree = (dir: Dir): GitOid => {
      const rows = [...dir].map(([name, value]) => value instanceof Map ? { name, mode: "40000", oid: hashTree(value), directory: true } : { name, mode: value.mode, oid: value.oid, directory: false });
      const content = Buffer.concat(rows.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? "/" : "")), Buffer.from(b.name + (b.directory ? "/" : ""))))
        .flatMap(row => [Buffer.from(`${row.mode} ${row.name}\0`), Buffer.from(row.oid.hex, "hex")])); return policyGitObject(format, "tree", content);
    };
    check(sameGitOid(hashTree(root), fact.tree), "git-policy-revert-tree-hash"); return { parents, entries };
  };
  const target = read(basis.target), current = read(basis.codeBasis);
  check(sameGitOid(basis.target.commit, observation.target) && sameGitOid(basis.codeBasis.commit, observation.base)
    && policyEqual(observation.baseTree, basis.codeBasis.entries), "git-policy-revert-code-basis");
  let parent = new Map<string, GitRawTreeEntry>();
  if (!target.parents.length) check(basis.selectedParent === null && observation.mainline === undefined, "git-policy-revert-root-parent");
  else {
    const selected = basis.selectedParent, index = target.parents.length === 1 ? 1 : observation.mainline;
    check(selected && Number.isSafeInteger(index) && index! > 0 && index! <= target.parents.length
      && (target.parents.length > 1 || observation.mainline === undefined) && selected.index === index
      && sameGitOid(selected.commit, target.parents[index! - 1]), "git-policy-revert-mainline"); parent = read(selected).entries;
  }
  const inverse: GitPolicyDiffEntry[] = [], conflicts: import("../../model/trunk.ts").GitRawRevertConflict[] = [], after = new Map(current.entries);
  const equal = (a: GitRawTreeEntry | undefined, b: GitRawTreeEntry | undefined) => !a ? !b : !!b && a.mode === b.mode && sameGitOid(a.oid, b.oid);
  for (const file of [...new Set([...target.entries.keys(), ...parent.keys()])].sort()) {
    const from = target.entries.get(file), to = parent.get(file), now = current.entries.get(file); if (equal(from, to)) continue;
    inverse.push({ status: !from ? "A" : !to ? "D" : from.mode !== to.mode ? "T" : "M", ...(from ? { oldPath: file, oldMode: from.mode, oldOid: from.oid } : {}), ...(to ? { newPath: file, newMode: to.mode, newOid: to.oid } : {}) });
    if (!equal(from, now)) conflicts.push({ path: file, parent: to ?? null, target: from ?? null, current: now ?? null, reason: "current-entry-differs-from-target" });
    if (to) after.set(file, to); else after.delete(file);
  }
  check(basis.complete === true && policyEqual(basis.inverseChanges, inverse) && policyEqual(basis.conflicts, conflicts), "git-policy-revert-derived-binding");
  check(conflicts.length === 0, "git-policy-revert-conflict");
  const names = [...after.keys()];
  check(!names.some((a, i) => names.some((b, j) => i !== j && (a.toLowerCase() === b.toLowerCase() || b.toLowerCase().startsWith(a.toLowerCase() + "/")))), "git-policy-revert-conflict");
  check([...current.entries.values(), ...after.values()].every(entry => ["100644", "100755"].includes(entry.mode)), "git-policy-revert-unsupported-mode");
  const grants = f.integrationGrants;
  check(Array.isArray(grants) && grants.length > 0 && grants.length <= 64, "git-policy-revert-grants");
  for (const grant of grants) check(gitText(grant.ownerRoleId) && !["chief", "product", "rapporteur", "nominator", "convener", "verifier", "su", "liaison"].includes(grant.ownerRoleId)
    && sameGitOid(grant.candidate, observation.target) && /^[a-f0-9]{64}$/i.test(grant.evidenceDigest) && Array.isArray(grant.paths) && grant.paths.length > 0 && grant.paths.length <= 128
    && grant.paths.every((p: unknown) => typeof p === "string" && gitPath(p.replace(/\/$/, ""))), "git-policy-revert-grants");
  return after;
}

/** Validate the entire ordinary raw-object plan, without invoking Provider or claiming host authority. */
function rawObjectPolicyError(f: GitPolicyFacts): string | undefined {
  try {
    const plan = f.rawObjectPlan!;
    const integrating = f.template === "integrate", reverting = f.template === "revert";
    policyRequire(gitText(f.taskId) && ["commit", "publish-documents", "integrate", "revert"].includes(f.template) && (reverting || plan.revertBasis === undefined) && !f.initializationBasis
      && f.worksite && policyEqual(f.worksite, { kind: "raw-object-plumbing", index: "not-used", checkout: "not-used" }) && policyEqual(plan.worksite, f.worksite)
      && [f.ownedWorktreeId, f.currentWorktreeId, f.ownedIndexId, f.currentIndexId].every(v => v === undefined), "git-policy-raw-worksite");
    const input = plan.input, format = f.objectFormat;
    policyRequire(input.operationId === f.operationId && sameGitOid(input.base, f.base) && sameGitOid(plan.commit.candidate, f.candidate)
      && gitOid(plan.commit.tree, format) && Array.isArray(plan.baseTree) && plan.baseTree.length <= 2048 && (input.base !== null || plan.baseTree.length === 0), "git-policy-raw-basis");
    const parents = input.parents === undefined ? input.base ? [input.base] : [] : [...input.parents];
    policyRequire(parents.length <= 65 && parents.every(parent => gitOid(parent, format))
      && new Set(parents.map(parent => parent.hex.toLowerCase())).size === parents.length
      && (input.parents === undefined || (input.base && sameGitOid(parents[0], input.base))), "git-policy-raw-parents");
    const revertTree = reverting ? revertExpectedTree(f, { basis: plan.revertBasis!, target: f.target, mainline: f.mainline, base: f.base, baseTree: plan.baseTree }) : undefined;
    if (reverting) policyRequire(policyEqual(plan.input.files.map(row => row.path).sort(), plan.revertBasis!.inverseChanges.map(row => row.oldPath ?? row.newPath).sort()), "git-policy-revert-inverse-paths");
    if (reverting) policyRequire(parents.length === 1 && sameGitOid(parents[0], f.base), "git-policy-revert-candidate-parent");
    else if (integrating) {
      const grants = f.integrationGrants;
      policyRequire(f.actorRoleId === "convener" && gitText(f.runId) && gitOid(input.base, format) && input.parents !== undefined && parents.length >= 2
        && f.writePaths.length === 0 && Array.isArray(grants) && grants.length === parents.length - 1
        && !f.businessPublication && [f.appGeneratedFiles, f.businessJournal, f.manifestSha256, f.journalDigest, f.businessBaseManifestBytesBase64].every(value => value === undefined), "git-policy-raw-integration-basis");
      for (let index = 0; index < grants.length; index++) {
        const grant = grants[index]!;
        policyRequire(gitText(grant.ownerRoleId) && !["chief", "product", "rapporteur", "nominator", "convener", "verifier", "su", "liaison"].includes(grant.ownerRoleId)
          && /^[a-f0-9]{64}$/i.test(grant.evidenceDigest) && sameGitOid(grant.candidate, parents[index + 1])
          && Array.isArray(grant.paths) && grant.paths.length > 0 && grant.paths.length <= 128
          && grant.paths.every((path: unknown) => typeof path === "string" && gitPath(path.replace(/\/$/, ""))), "git-policy-raw-integration-grant");
      }
    } else policyRequire(input.parents === undefined && f.integrationGrants === undefined, "git-policy-raw-parents-template");
    policyRequire(Array.isArray(input.files) && input.files.length <= 128 && typeof input.message === "string" && input.message.trim().length > 0 && input.message.length <= 4000, "git-policy-raw-input");
    const seconds = Math.floor(Date.parse(input.timestamp ?? "") / 1000); policyRequire(Number.isSafeInteger(seconds) && seconds >= 0, "git-policy-raw-time");
    const before = new Map<string, { path: string; mode: "100644" | "100755"; oid: GitOid }>();
    for (const entry of plan.baseTree) {
      policyRequire(gitPath(entry.path) && (entry.mode === "100644" || entry.mode === "100755") && gitOid(entry.oid, format)
        && ![...before.keys()].some(p => p.toLowerCase() === entry.path.toLowerCase()), "git-policy-raw-base-tree"); before.set(entry.path, { path: entry.path, mode: entry.mode, oid: entry.oid });
    }
    const after = new Map(before), bytes = new Map<string, Buffer>(), commands: string[][] = [];
    const files = [...input.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0), seen = new Set<string>(); let total = 0;
    policyRequire(policyEqual([...f.paths].sort(), files.map(file => file.path).sort()), "git-policy-raw-path-binding");
    for (const file of files) {
      policyRequire(gitPath(file.path) && !seen.has(file.path.toLowerCase()) && (file.executable === undefined || typeof file.executable === "boolean"), "git-policy-raw-file"); seen.add(file.path.toLowerCase());
      if (file.bytesBase64 === null) { policyRequire(after.delete(file.path), "git-policy-raw-delete"); continue; }
      const content = policyBytes(file.bytesBase64); total += content.length; policyRequire(content.length <= 1024 * 1024 && total <= 4 * 1024 * 1024, "git-policy-raw-byte-budget");
      bytes.set(file.path, content); after.set(file.path, { path: file.path, mode: file.executable ? "100755" : "100644", oid: policyGitObject(format, "blob", content) });
      commands.push(["hash-object", "-w", "--stdin", "--no-filters"]);
    }
    policyRequire(after.size <= 2048, "git-policy-raw-tree-budget");
    if (revertTree) policyRequire(policyEqual([...after.values()].sort((a, b) => a.path < b.path ? -1 : 1), [...revertTree.values()].sort((a, b) => a.path < b.path ? -1 : 1)), "git-policy-revert-result-tree");
    type Entry = { path: string; mode: "100644" | "100755"; oid: GitOid }; type Dir = Map<string, Dir | Entry>; const root: Dir = new Map();
    for (const entry of after.values()) { const parts = entry.path.split("/"); let dir = root;
      for (const name of parts.slice(0, -1)) { const prior = dir.get(name); policyRequire(!prior || prior instanceof Map, "git-policy-raw-tree-collision"); const next = prior ?? new Map(); dir.set(name, next); dir = next; }
      policyRequire(!dir.has(parts.at(-1)!), "git-policy-raw-tree-collision"); dir.set(parts.at(-1)!, entry);
    }
    function treeFor(dir: Dir): GitOid {
      const values = [...dir].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => value instanceof Map
        ? { name, mode: "40000", oid: treeFor(value), directory: true } : { name, mode: value.mode, oid: value.oid, directory: false });
      const content = Buffer.concat(values.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? "/" : "")), Buffer.from(b.name + (b.directory ? "/" : ""))))
        .flatMap(value => [Buffer.from(`${value.mode} ${value.name}\0`), Buffer.from(value.oid.hex, "hex")]));
      commands.push(["mktree", "-z"]); return policyGitObject(format, "tree", content);
    }
    const tree = treeFor(root), request = policySha(JSON.stringify({ ...input, files }));
    const message = `${input.message}\n\nANS-Request: ${request}\n`;
    const candidate = policyGitObject(format, "commit", Buffer.from(`tree ${tree.hex}\n${parents.map(p => `parent ${p.hex}\n`).join("")}author ANS Application <ans@localhost> ${seconds} +0000\ncommitter ANS Application <ans@localhost> ${seconds} +0000\n\n${message}`));
    const allocated = `refs/ans/candidates/${policySha(f.operationId)}`;
    policyRequire(sameGitOid(tree, plan.commit.tree) && sameGitOid(candidate, plan.commit.candidate) && policyEqual(parents, plan.commit.parents)
      && message === plan.commit.message && plan.ref === allocated && f.ownedCandidateRef === allocated, "git-policy-raw-object-binding");
    commands.push(["commit-tree", tree.hex, ...parents.flatMap(parent => ["-p", parent.hex]), "-F", "-"], ["cat-file", "commit", candidate.hex], ["update-ref", "--no-deref", allocated, candidate.hex, "0".repeat(format === "sha1" ? 40 : 64)]);
    policyRequire(policyEqual(plan.commands.map(argv => gitBody(argv)), commands), "git-policy-raw-command-plan");
    const diff: GitPolicyDiffEntry[] = [];
    for (const file of [...new Set([...before.keys(), ...after.keys()])].sort()) { const from = before.get(file), to = after.get(file);
      if (from && to && from.mode === to.mode && sameGitOid(from.oid, to.oid)) continue;
      diff.push({ status: !from ? "A" : !to ? "D" : from.mode !== to.mode ? "T" : "M", ...(from ? { oldPath: file, oldMode: from.mode, oldOid: from.oid } : {}), ...(to ? { newPath: file, newMode: to.mode, newOid: to.oid } : {}) });
    }
    policyRequire(f.allDiff?.complete && sameGitOid(f.allDiff.base, input.base) && sameGitOid(f.allDiff.candidate, candidate)
      && policyEqual(diff, plan.diff) && policyEqual(diff, f.allDiff.entries), "git-policy-raw-complete-diff");
    const exceptions = f.businessPublication ? appMetadataPaths(f, bytes, before) : new Set<string>();
    policyRequire(f.businessPublication || [f.appGeneratedFiles, f.businessJournal, f.manifestSha256, f.journalDigest, f.businessBaseManifestBytesBase64].every(v => v === undefined), "git-policy-raw-unbound-metadata");
    for (const row of diff) {
      policyRequire(row.status !== "T", "git-policy-raw-mode-change");
      for (const file of [row.oldPath, row.newPath]) if (file) {
        if (integrating || reverting) {
          const owners = f.integrationGrants!.filter(grant => gitRolePath({ ...f, actorRoleId: grant.ownerRoleId, writePaths: grant.paths }, file));
          policyRequire(owners.length > 0 && new Set(owners.map(grant => grant.ownerRoleId)).size === 1, "git-policy-raw-integration-scope");
        } else policyRequire((exceptions.has(file) && after.get(file)?.mode === "100644") || gitRolePath(f, file), "git-policy-raw-write-scope");
      }
    }
    const expected = [...commands];
    if (f.template === "publish-documents") {
      policyRequire(f.businessPublication && f.ref === "refs/ans/trunk" && f.publicationRef === f.ref, "git-policy-raw-publication-ref");
      expected.push(["update-ref", "--no-deref", f.ref, candidate.hex, input.base?.hex ?? "0".repeat(format === "sha1" ? 40 : 64)]);
    } else policyRequire(f.ref === allocated, "git-policy-raw-candidate-ref");
    policyRequire(f.commands && policyEqual(f.commands.map(argv => gitBody(argv)), expected) && policyEqual(f.argv, f.commands[0]), "git-policy-raw-operation-plan");
    return undefined;
  } catch (error) { return error instanceof Error ? error.message : "git-policy-raw-invalid"; }
}

/** Full ref-CAS facts are distinct from the immutable code-basis authorization diff. */
function refPublicationPolicyError(f: GitPolicyFacts): string | undefined {
  try {
    const plan = f.refPublicationPlan!, basis = f.deliveryBasis, format = f.objectFormat;
    const check: typeof policyRequire = policyRequire;
    const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
    check(f.template === "publish-delivery" && f.actorRoleId === "convener" && gitText(f.taskId) && gitText(f.runId)
      && f.writePaths.length === 0 && basis && gitText(basis.candidateOperationId) && gitOid(basis.base, format)
      && policyEqual(f.worksite, { kind: "ref-only", index: "not-used", checkout: "not-used" }) && policyEqual(plan.worksite, f.worksite)
      && [f.ownedWorktreeId, f.currentWorktreeId, f.ownedIndexId, f.currentIndexId, f.rawObjectPlan, f.initializationBasis,
        f.businessPublication, f.appGeneratedFiles, f.businessJournal, f.manifestSha256, f.journalDigest, f.businessBaseManifestBytesBase64].every(v => v === undefined), "git-policy-delivery-basis");
    const source = basis.source, grants = f.integrationGrants;
    check(source && ["run-integration", "run-revert"].includes(source.kind) && source.roleId === "convener" && source.taskId === f.taskId && source.runId === f.runId
      && /^[a-z0-9][a-z0-9-]{1,95}$/.test(source.flowId) && isGitApplicationRef(source.base?.ref)
      && (source.base.ref === "refs/ans/trunk" || source.base.ref.startsWith("refs/ans/delivery/")) && sameGitOid(source.base.oid, basis.base)
      && [source.pinDigest, source.taskDigest, source.runRecordSha256, source.scopeDigest].every(digest)
      && Array.isArray(grants) && grants.length > 0 && grants.length <= 64, "git-policy-delivery-source");
    if (source.kind === "run-integration") check(Array.isArray(source.contributors) && source.contributors.length > 0 && source.contributors.length <= 64
      && grants.length === source.contributors.length, "git-policy-delivery-source");
    check(f.ref === `refs/ans/delivery/${source.flowId}` && f.publicationRef === f.ref && plan.ref === f.ref
      && f.ownedCandidateRef === `refs/ans/candidates/${policySha(basis.candidateOperationId)}`
      && sameGitOid(plan.oldOid, f.base) && gitOid(plan.commit.candidate, format) && sameGitOid(plan.commit.candidate, f.candidate)
      && gitOid(plan.commit.tree, format) && typeof plan.commit.message === "string", "git-policy-delivery-ref");
    const parents = source.kind === "run-integration" ? [basis.base, ...source.contributors.map(row => row.candidate)] : [basis.base];
    check(parents.every(parent => gitOid(parent, format)) && new Set(parents.map(parent => parent.hex.toLowerCase())).size === parents.length
      && policyEqual(plan.commit.parents, parents), "git-policy-delivery-parents");
    const workerOps = new Set<string>(), workerTasks = new Set<string>(), sourceFiles = new Map<string, string | null>();
    const validFiles = (files: GitDeliveryTaskSource["files"]) => Array.isArray(files) && files.length > 0 && files.length <= 128
      && files.every(file => gitPath(file.path) && (file.sha256 === null || digest(file.sha256)))
      && new Set(files.map(file => file.path.toLowerCase())).size === files.length;
    if (source.kind === "run-integration") {
    for (let index = 0; index < source.contributors.length; index++) {
      const row = source.contributors[index]!, worker = row.source, grant = grants[index]!;
      check(gitText(row.operationId) && !workerOps.has(row.operationId) && gitText(row.closeOperationId) && gitText(row.closeEventId) && digest(row.reportSha256)
        && worker && worker.kind === "assigned-run-task" && gitText(worker.taskId) && !workerTasks.has(worker.taskId) && gitText(worker.moduleId)
        && worker.runId === source.runId && worker.flowId === source.flowId && worker.pinDigest === source.pinDigest && policyEqual(worker.base, source.base)
        && [worker.taskDigest, worker.runRecordSha256, worker.scopeDigest].every(digest)
        && gitText(worker.roleId) && !["chief", "product", "rapporteur", "nominator", "convener", "verifier", "su", "liaison"].includes(worker.roleId)
        && validFiles(worker.files), "git-policy-delivery-contributor");
      workerOps.add(row.operationId); workerTasks.add(worker.taskId);
      check(grant.ownerRoleId === worker.roleId && sameGitOid(grant.candidate, row.candidate)
        && grant.evidenceDigest === policySha(JSON.stringify(gitCanonical(worker)))
        && Array.isArray(grant.paths) && policyEqual([...grant.paths].sort(), worker.files.map((file: { path: string }) => file.path).sort()), "git-policy-delivery-grant");
      for (const file of worker.files) {
        check(!sourceFiles.has(file.path) || sourceFiles.get(file.path) === file.sha256, "git-policy-delivery-source-conflict"); sourceFiles.set(file.path, file.sha256);
      }
    }
    check(source.scopeDigest === policySha(JSON.stringify(gitCanonical(source.contributors.map(row => row.source)))) && validFiles(source.files)
      && policyEqual([...source.files].sort((a, b) => a.path.localeCompare(b.path)), [...sourceFiles].map(([path, sha256]) => ({ path, sha256 })).sort((a, b) => a.path.localeCompare(b.path))), "git-policy-delivery-source-files");
    } else {
      check(!("contributors" in source) && Array.isArray(source.ownerGrants) && source.ownerGrants.length > 0 && source.ownerGrants.length <= 64
        && gitOid(source.target, format) && validFiles(source.files)
        && source.scopeDigest === policySha(JSON.stringify(gitCanonical(source.ownerGrants)))
        && policyEqual(grants, source.ownerGrants.map(grant => ({ ...grant, candidate: source.target }))), "git-policy-delivery-revert-source");
      for (const file of source.files) sourceFiles.set(file.path, file.sha256);
    }
    const tree = (entries: readonly GitPolicyTreeEntry[]) => {
      check(Array.isArray(entries) && entries.length <= 2048, "git-policy-delivery-tree");
      const values = new Map<string, GitPolicyTreeEntry>();
      for (const entry of entries) {
        check(gitPath(entry.path) && ["100644", "100755"].includes(entry.mode) && gitOid(entry.oid, format)
          && ![...values.keys()].some(p => p.toLowerCase() === entry.path.toLowerCase()), "git-policy-delivery-tree"); values.set(entry.path, entry);
      }
      type Dir = Map<string, Dir | GitPolicyTreeEntry>; const root: Dir = new Map();
      for (const entry of values.values()) { const parts = entry.path.split("/"); let dir = root;
        for (const name of parts.slice(0, -1)) { const prior = dir.get(name); check(!prior || prior instanceof Map, "git-policy-delivery-tree-collision"); const next = prior ?? new Map(); dir.set(name, next); dir = next; }
        check(!dir.has(parts.at(-1)!), "git-policy-delivery-tree-collision"); dir.set(parts.at(-1)!, entry);
      }
      const hashTree = (dir: Dir): GitOid => {
        const rows = [...dir].map(([name, entry]) => entry instanceof Map ? { name, mode: "40000", oid: hashTree(entry), directory: true } : { name, mode: entry.mode, oid: entry.oid, directory: false });
        const content = Buffer.concat(rows.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? "/" : "")), Buffer.from(b.name + (b.directory ? "/" : ""))))
          .flatMap(row => [Buffer.from(`${row.mode} ${row.name}\0`), Buffer.from(row.oid.hex, "hex")]));
        return policyGitObject(format, "tree", content);
      };
      return { values, oid: hashTree(root) };
    };
    const before = tree(plan.baseTree), after = tree(plan.candidateTree), original = tree(basis.baseTree);
    if (source.kind === "run-revert") {
      const expected = revertExpectedTree(f, { basis: source.revertBasis, target: source.target, mainline: source.mainline, base: basis.base, baseTree: basis.baseTree });
      const sorted = (values: Iterable<GitRawTreeEntry>) => [...values].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      check(policyEqual(sorted(expected.values()), sorted(after.values.values())), "git-policy-delivery-revert-result");
      check(policyEqual(source.files.map(file => file.path).sort(), source.revertBasis.inverseChanges.map(row => row.oldPath ?? row.newPath).sort()), "git-policy-delivery-revert-files");
    }
    check(plan.oldOid !== null || before.values.size === 0, "git-policy-delivery-null-base");
    check(sameGitOid(after.oid, plan.commit.tree), "git-policy-delivery-tree-hash");
    const commitFromBytes = (encoded: string, oid: GitOid, treeOid: GitOid) => {
      const bytes = policyBytes(encoded); check(bytes.length > 0 && bytes.length <= 16384
        && sameGitOid(policyGitObject(format, "commit", bytes), oid), "git-policy-delivery-commit-hash");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), split = text.indexOf("\n\n");
      check(split > 0, "git-policy-delivery-commit-shape");
      const headers = text.slice(0, split).split("\n"), parents: GitOid[] = [];
      check(headers.shift() === `tree ${treeOid.hex}`, "git-policy-delivery-commit-tree");
      while (headers[0]?.startsWith("parent ")) { const parent = { objectFormat: format, hex: headers.shift()!.slice(7) }; check(gitOid(parent, format), "git-policy-delivery-commit-parent"); parents.push(parent); }
      check(headers.length === 2 && /^author ANS Application <ans@localhost> \d+ \+0000$/.test(headers[0]!)
        && headers[1] === headers[0]!.replace(/^author /, "committer "), "git-policy-delivery-commit-shape");
      return { parents, message: text.slice(split + 2) };
    };
    const actual = commitFromBytes(plan.commitBytesBase64, plan.commit.candidate, after.oid);
    check(policyEqual(actual.parents, plan.commit.parents) && actual.message === plan.commit.message, "git-policy-delivery-commit-binding");
    commitFromBytes(basis.baseCommitBytesBase64, basis.base, original.oid);
    if (plan.oldOid === null) check(plan.oldCommitBytesBase64 === null, "git-policy-delivery-null-base");
    else commitFromBytes(plan.oldCommitBytesBase64!, plan.oldOid, before.oid);
    const diff = (a: Map<string, GitPolicyTreeEntry>, b: Map<string, GitPolicyTreeEntry>) => {
      const rows: GitPolicyDiffEntry[] = [];
      for (const file of [...new Set([...a.keys(), ...b.keys()])].sort()) { const old = a.get(file), next = b.get(file);
        if (old && next && old.mode === next.mode && sameGitOid(old.oid, next.oid)) continue;
        rows.push({ status: !old ? "A" : !next ? "D" : old.mode !== next.mode ? "T" : "M",
          ...(old ? { oldPath: file, oldMode: old.mode, oldOid: old.oid } : {}), ...(next ? { newPath: file, newMode: next.mode, newOid: next.oid } : {}) });
      } return rows;
    };
    const casDiff = diff(before.values, after.values), authorizationDiff = diff(original.values, after.values);
    check(f.allDiff?.complete && sameGitOid(f.allDiff.base, plan.oldOid) && sameGitOid(f.allDiff.candidate, plan.commit.candidate)
      && policyEqual(casDiff, plan.diff) && policyEqual(casDiff, f.allDiff.entries)
      && policyEqual([...f.paths].sort(), [...new Set(casDiff.flatMap(row => [row.oldPath, row.newPath].filter((p): p is string => !!p)))].sort()), "git-policy-delivery-complete-diff");
    for (const row of authorizationDiff) {
      check(row.status !== "T", "git-policy-delivery-mode-change");
      for (const file of [row.oldPath, row.newPath]) if (file) {
        const owners = grants.filter(grant => gitRolePath({ ...f, actorRoleId: grant.ownerRoleId, writePaths: grant.paths }, file));
        check(owners.length > 0 && new Set(owners.map(grant => grant.ownerRoleId)).size === 1 && sourceFiles.has(file)
          && (row.status === "D" ? sourceFiles.get(file) === null : sourceFiles.get(file) !== null), "git-policy-delivery-write-scope");
      }
    }
    const expected = ["update-ref", "--no-deref", f.ref!, plan.commit.candidate.hex, plan.oldOid?.hex ?? "0".repeat(format === "sha1" ? 40 : 64)];
    check(policyEqual(gitBody(plan.argv), expected) && policyEqual(f.argv, plan.argv) && policyEqual(f.commands, [plan.argv]), "git-policy-delivery-command");
    return undefined;
  } catch (error) { return error instanceof Error ? error.message : "git-policy-delivery-invalid"; }
}

/** Pure ACL only. O still needs real repo protection, inventory closure and critical-section evidence. */
export function checkGitPolicy(facts: GitPolicyFacts): GitPolicyResult {
  let inputDigest = "";
  try {
    inputDigest = computeGitPolicyDigest(facts);
    const deny = (code: string, paths?: string[], refs?: string[]): GitPolicyResult => ({ allowed: false, inputDigest, code,
      ...(paths?.length ? { deniedPaths: paths } : {}), ...(refs?.length ? { deniedRefs: refs } : {}) });
    if (!facts || (facts.repoId !== "uninitialized" && !/^[a-f0-9]{64}$/i.test(facts.repoId)) || !["sha1", "sha256"].includes(facts.objectFormat)
        || ![facts.operationId, facts.actorRoleId].every(gitText) || (facts.taskId !== undefined && !gitText(facts.taskId))) return deny("git-policy-invalid-facts");
    const rev = facts.authorizationRevision;
    if (!(typeof rev === "string" ? gitText(rev) : Number.isSafeInteger(rev) && rev >= 0)
        || rev !== facts.currentAuthorizationRevision) return deny("git-policy-stale-authorization");
    if (![facts.paths, facts.readPaths, facts.writePaths].every(Array.isArray)
        || facts.paths.length > 128 || facts.paths.some(p => !gitPath(p))) return deny("git-policy-invalid-path");
    if ([...facts.readPaths, ...facts.writePaths].some(p => p !== "." && !gitPath(p.replace(/\/$/, "")))) return deny("git-policy-invalid-scope");
    for (const oid of [facts.target, facts.other, facts.base, facts.candidate]) if (oid !== undefined && oid !== null && !gitOid(oid, facts.objectFormat)) return deny("git-policy-invalid-oid");
    if (facts.limit !== undefined && (!Number.isSafeInteger(facts.limit) || facts.limit < 1 || facts.limit > 100)) return deny("git-policy-query-budget");
    if (facts.repoId === "uninitialized") {
      if (facts.rawObjectPlan || facts.refPublicationPlan || facts.deliveryBasis || facts.businessPublication || facts.appGeneratedFiles) return deny("git-policy-initialization-plan");
      const error = initialGitPolicyError(facts);
      return error ? deny(error) : { allowed: true, inputDigest };
    }
    if (facts.refPublicationPlan !== undefined) {
      const error = refPublicationPolicyError(facts); return error ? deny(error) : { allowed: true, inputDigest };
    }
    if (facts.deliveryBasis !== undefined) return deny("git-policy-delivery-plan-missing");
    if (facts.rawObjectPlan !== undefined) {
      const error = rawObjectPolicyError(facts); return error ? deny(error) : { allowed: true, inputDigest };
    }
    if (facts.template === "revert") return deny("git-policy-revert-plan-missing");
    if (facts.worksite !== undefined || facts.initializationBasis !== undefined || facts.businessPublication !== undefined || facts.appGeneratedFiles !== undefined)
      return deny("git-policy-existing-repo-initialization-basis");
    const query = gitQueryBody(facts);
    if (query) {
      const body = gitBody(facts.argv);
      if (!body || JSON.stringify(body) !== JSON.stringify(query)) return deny("git-policy-argv-template");
      if ((!facts.paths.length && !facts.readPaths.includes(".")) || facts.paths.some(p => !gitCovered(p, facts.readPaths))) return deny("git-policy-read-scope", [...facts.paths]);
      if ([facts.target, facts.other].some(oid => oid && !facts.readableOids?.some(allowed => sameGitOid(oid, allowed)))) return deny("git-policy-read-oid");
      return { allowed: true, inputDigest };
    }
    if (!["commit", "integrate", "revert", "init", "publish-documents", "publish-delivery"].includes(facts.template)) return deny("git-policy-unknown-template");
    if (!gitText(facts.taskId)) return deny("git-policy-task-missing");
    if (!gitText(facts.ownedWorktreeId) || facts.ownedWorktreeId !== facts.currentWorktreeId || !gitText(facts.ownedIndexId)
        || facts.ownedIndexId !== facts.currentIndexId) return deny("git-policy-unowned-worksite");
    const ref = facts.ref;
    const candidateRef = gitText(facts.ownedCandidateRef) && /^(?:refs\/heads\/codex\/[a-zA-Z0-9_/-]+|refs\/ans\/candidates\/[a-f0-9]{64})$/.test(facts.ownedCandidateRef)
      && !facts.ownedCandidateRef.includes("..") && !facts.ownedCandidateRef.includes("//");
    const publishing = facts.template.startsWith("publish-");
    const goodRef = publishing ? ref === facts.publicationRef && (facts.template === "publish-documents" ? ref === "refs/ans/trunk"
      : /^refs\/ans\/delivery\/[a-z0-9][a-z0-9-]{1,95}$/.test(ref ?? "")) : candidateRef && ref === facts.ownedCandidateRef;
    if (!goodRef) return deny("git-policy-ref", undefined, [String(ref)]);
    if (["integrate", "revert", "init", "publish-delivery"].includes(facts.template) && facts.actorRoleId !== "convener") return deny("git-policy-role-action");
    if (facts.template === "publish-documents" && !["product", "rapporteur", "nominator", "convener"].includes(facts.actorRoleId)) return deny("git-policy-role-action");
    if (!facts.allDiff?.complete || !sameGitOid(facts.base ?? null, facts.allDiff.base) || !sameGitOid(facts.candidate ?? null, facts.allDiff.candidate)
        || !Array.isArray(facts.allDiff.entries) || facts.allDiff.entries.length > 2048) return deny("git-policy-incomplete-diff");
    const deniedPaths: string[] = [];
    for (const entry of facts.allDiff.entries) {
      if (!["A", "M", "D", "R", "C", "T"].includes(entry.status)) return deny("git-policy-diff-shape");
      const oldRequired = entry.status !== "A", newRequired = entry.status !== "D";
      if ((oldRequired && (!gitPath(entry.oldPath) || !gitOid(entry.oldOid, facts.objectFormat)))
          || (newRequired && (!gitPath(entry.newPath) || !gitOid(entry.newOid, facts.objectFormat)))
          || (oldRequired && !["100644", "100755"].includes(entry.oldMode ?? ""))
          || (newRequired && !["100644", "100755"].includes(entry.newMode ?? ""))) return deny("git-policy-diff-shape-or-mode");
      if (oldRequired && newRequired && entry.oldMode !== entry.newMode) return deny("git-policy-mode-change");
      for (const file of [oldRequired ? entry.oldPath : undefined, newRequired ? entry.newPath : undefined]) if (file) {
        const direct = gitRolePath(facts, file);
        const integrated = facts.actorRoleId === "convener" && ["integrate", "revert", "publish-delivery"].includes(facts.template)
          && facts.integrationGrants?.some(grant => gitText(grant.ownerRoleId) && /^[a-f0-9]{64}$/i.test(grant.evidenceDigest)
            && gitOid(grant.candidate, facts.objectFormat) && gitRolePath({ ...facts, actorRoleId: grant.ownerRoleId, writePaths: grant.paths }, file));
        if (!direct && !integrated) deniedPaths.push(file);
      }
    }
    if (deniedPaths.length) return deny("git-policy-write-scope", [...new Set(deniedPaths)]);
    if (!facts.commands?.length || JSON.stringify(facts.argv) !== JSON.stringify(facts.commands[0])
        || facts.commands.some(argv => { const body = gitBody(argv); return !body || !gitModificationBody(facts, body); }))
      return deny("git-policy-command-plan-unverified");
    return { allowed: true, inputDigest };
  } catch { return { allowed: false, inputDigest, code: "git-policy-invalid-facts" }; }
}

/** 引擎已知的规则集版本；rules.version 与之不符 → 硬拒（版本未知，fail-closed）。
 *  "2"：T8a 起规则集按「程序 + argv」重述、元字符仅在 `executionModel` 会经 shell 解释时生效（§7.10）。
 *  "3"：T40 起 `ShellClass` 增第四档 `risky`（§14）；硬拒名单重划（re-shell/内联求值/提权/系统破坏/LOLBin
 *       仍硬拒；删除/原地改写/编辑器/进程服务/网络/间接执行器/构建/包管理/git 写 → risky）；规则集新增
 *       `riskyPrograms` 段。旧 "2" 规则集因版本不符一律被拒（fail-closed）。
 *  "4"：W3-G（2026-11-08，设计 P1.3 §2.4.3/§4.4）起裸 Git 改为「只读精确白名单（`matchReadonlyGit`）
 *       ⇒ allow / 其余硬拒」；删除 `defaultReadOnly()` 中不可达的 `readonly:git` 死条目（规则数据变化，
 *       bump）。**不兼容读 v3**：v3 规则集/项目级 pin 一律因版本不符整条拒绝（fail-closed，不静默放宽）；
 *       迁移须改用 `defaultShellRules()`（`ans-default-v4`）。 */
export const SHELL_RULES_VERSION = "4";

/** 带原因的判定结果；classifyShell 只取其中的 decision（冻结契约是四态字符串）。 */
export interface ShellVerdict {
  decision: ShellClass;
  reason: string;
  ruleId: string; // deny:rules-invalid / deny:argv-invalid / deny:opaque-command / deny:program:<id> / deny:token:<t> / risky:program:<id> / allow:readonly:<id> / review
}

const EXE_SUFFIX = /\.(exe|cmd|bat|ps1|com)$/i;

/** 去掉一层成对引号（"…" 或 '…'） */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) return s.slice(1, -1);
  }
  return s;
}

/** argv[0] → 程序名（basename，去 exe/cmd/bat/ps1/com 后缀，小写比较） */
function programName(raw: string): string {
  const q = stripQuotes(raw.trim());
  const segs = q.split(/[\\/]/).filter((s) => s !== "");
  const base = segs.length > 0 ? segs[segs.length - 1] : q;
  return base.replace(EXE_SUFFIX, "").toLowerCase();
}

/** argv 中是否出现任一 flag（精确匹配，或 `flag=…` 前缀形式，如 --output=/tmp/x） */
function hasFlag(args: string[], flags: string[]): boolean {
  for (const a of args) {
    for (const f of flags) {
      if (f === "") continue;
      if (a === f || a.startsWith(f + "=")) return true;
    }
  }
  return false;
}

// 2026-10-29（v2.4 / 复验 F6）：短内联代码进入脚本审查；长内联仍硬拒。阈值与
// `shell-command-guard.ts` 的 inline-too-large 同口径（2048B / 10 行 / 单行 1024B）。
export const SHELL_INLINE_SHORT_MAX_COMMAND_BYTES = 2048;
export const SHELL_INLINE_SHORT_MAX_LINES = 10;
export const SHELL_INLINE_SHORT_MAX_LINE_BYTES = 1024;

/** 短内联代码（bounds 内）⇒ 可由上层生成 approvalContext 交脚本审查；超界 ⇒ 硬拒。 */
export function isShortInlineCode(code: string): boolean {
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > SHELL_INLINE_SHORT_MAX_COMMAND_BYTES) return false;
  const lines = code.split(/\r?\n/);
  if (lines.length > SHELL_INLINE_SHORT_MAX_LINES) return false;
  return lines.every((line) => Buffer.byteLength(line, "utf8") <= SHELL_INLINE_SHORT_MAX_LINE_BYTES);
}

/** 从 args（含程序名）中提取内联代码（`node -e X` / `python -c X` / `--eval=X` 等）。 */
export function inlineCodeOf(args: readonly string[], flags: readonly string[]): string | undefined {
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i]!;
    for (const flag of flags) {
      if (arg === flag) return args[i + 1];
      if (flag.startsWith("--") && arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

/** 校验规则集形状与版本；合法返回 null，非法返回原因（调用方据此 fail-closed 硬拒）。 */
function validateRules(rules: unknown): string | null {
  if (typeof rules !== "object" || rules === null || Array.isArray(rules)) return "规则集缺失或非对象";
  const r = rules as Record<string, unknown>;
  if (r.version !== SHELL_RULES_VERSION) {
    return `规则集版本未知或缺失：${String(r.version)}（引擎期望 ${SHELL_RULES_VERSION}）`;
  }
  // 规则集 id 可选；若给出须为非空字符串（审计归属用，§7.6）。
  if (r.id !== undefined && (typeof r.id !== "string" || r.id === "")) {
    return "id 若存在必须是非空字符串";
  }
  // 命令解释模型可选；若给出须为已知取值（未知模型 → 硬拒，fail-closed；§7.10）。
  if (
    r.executionModel !== undefined &&
    r.executionModel !== "argv-noshell" &&
    r.executionModel !== "shell-string"
  ) {
    return `executionModel 未知：${String(r.executionModel)}（须为 "argv-noshell" | "shell-string"）`;
  }
  const isStrArr = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!isStrArr(r.denyTokens)) return "denyTokens 必须是字符串数组";
  if (!Array.isArray(r.readOnly)) return "readOnly 必须是数组";
  if (!Array.isArray(r.hardDenyPrograms)) return "hardDenyPrograms 必须是数组";
  // riskyPrograms 为 v3 必需项：缺失/非数组 → 硬拒（fail-closed，§7.5）。
  // 否则「危险但有正当用途」的命令会静默降级为 review（只过 (b)、不强制 (a)），即门禁被削弱。
  if (!Array.isArray(r.riskyPrograms)) return "riskyPrograms 必须是数组（v3 必需；缺失即 fail-closed 硬拒）";

  const ro = r.readOnly as unknown[];
  for (let i = 0; i < ro.length; i++) {
    const e = ro[i];
    if (typeof e !== "object" || e === null) return `readOnly[${i}] 非对象`;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") return `readOnly[${i}] 缺少 id`;
    if (typeof o.program !== "string" || o.program === "") return `readOnly[${i}] 缺少 program`;
    if (o.subcommands !== undefined && !isStrArr(o.subcommands)) return `readOnly[${i}] 的 subcommands 非法`;
    if (o.blockedFlags !== undefined && !isStrArr(o.blockedFlags)) return `readOnly[${i}] 的 blockedFlags 非法`;
  }
  const hd = r.hardDenyPrograms as unknown[];
  for (let i = 0; i < hd.length; i++) {
    const e = hd[i];
    if (typeof e !== "object" || e === null) return `hardDenyPrograms[${i}] 非对象`;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") return `hardDenyPrograms[${i}] 缺少 id`;
    if (!isStrArr(o.programs) || o.programs.length === 0) return `hardDenyPrograms[${i}] 的 programs 非法`;
    if (o.onlyWithFlag !== undefined && !isStrArr(o.onlyWithFlag)) return `hardDenyPrograms[${i}] 的 onlyWithFlag 非法`;
    if (o.onlyWithSubcommand !== undefined && !isStrArr(o.onlyWithSubcommand)) {
      return `hardDenyPrograms[${i}] 的 onlyWithSubcommand 非法`;
    }
  }
  const rk = r.riskyPrograms as unknown[];
  for (let i = 0; i < rk.length; i++) {
    const e = rk[i];
    if (typeof e !== "object" || e === null) return `riskyPrograms[${i}] 非对象`;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || o.id === "") return `riskyPrograms[${i}] 缺少 id`;
    if (!isStrArr(o.programs) || o.programs.length === 0) return `riskyPrograms[${i}] 的 programs 非法`;
    if (o.onlyWithFlag !== undefined && !isStrArr(o.onlyWithFlag)) return `riskyPrograms[${i}] 的 onlyWithFlag 非法`;
    if (o.onlyWithSubcommand !== undefined && !isStrArr(o.onlyWithSubcommand)) {
      return `riskyPrograms[${i}] 的 onlyWithSubcommand 非法`;
    }
  }
  return null;
}

/** 硬拒程序匹配：program 命中且（若设了约束）flag/子命令满足条件时返回规则 id，否则 null */
function matchHardDeny(args: string[], program: string, rules: ShellHardDenyRule[]): string | null {
  for (const r of rules) {
    if (!r.programs.map((p) => p.toLowerCase()).includes(program)) continue;
    if (r.onlyWithFlag !== undefined && !hasFlag(args, r.onlyWithFlag)) continue;
    if (r.onlyWithSubcommand !== undefined) {
      const sub = typeof args[1] === "string" ? args[1].toLowerCase() : "";
      if (!r.onlyWithSubcommand.map((s) => s.toLowerCase()).includes(sub)) continue;
    }
    // 2026-10-29（复验 F6）：短内联（bounds 内）不硬拒——进入脚本审查（approvalContext 携带代码原文）；
    // 长内联/超界仍硬拒（预封堵 inline-too-large 与本节同口径）。
    if (r.id === "interpreter-inline") {
      const code = inlineCodeOf(args, r.onlyWithFlag ?? []);
      if (code !== undefined && isShortInlineCode(code)) continue;
    }
    // 2026-10-29（客户 Q1/Q2 口径修正，R2）：`bash/sh <script>` 不再硬拒——脚本文件进入脚本审查
    // （approvalContext 携带内容）。`-c/--command` 内联形态仍按 re-shell 硬拒（G3 不变）。
    if (r.id === "reshell") {
      const shellScriptPrograms = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish"]);
      const inline = hasFlag(args, ["-c", "--command"]);
      const hasScriptArg = args.some((arg) => arg !== "--" && !arg.startsWith("-"));
      if (shellScriptPrograms.has(program) && !inline && hasScriptArg) continue;
    }
    return r.id;
  }
  return null;
}

/** risky 程序匹配（§14.3-B）：program 命中且（若设了约束）flag/子命令满足条件时返回规则 id，否则 null。
 *  ★ 只对「程序名在 argv 里可见」的形态生效；re-shell/内联求值**不经此路**（它们在 hardDenyPrograms，先被拦）。 */
function matchRisky(args: string[], program: string, rules: ShellRiskyRule[]): string | null {
  for (const r of rules) {
    if (!r.programs.map((p) => p.toLowerCase()).includes(program)) continue;
    if (r.onlyWithFlag !== undefined && !hasFlag(args, r.onlyWithFlag)) continue;
    if (r.onlyWithSubcommand !== undefined) {
      const sub = typeof args[1] === "string" ? args[1].toLowerCase() : "";
      if (!r.onlyWithSubcommand.map((s) => s.toLowerCase()).includes(sub)) continue;
    }
    return r.id;
  }
  return null;
}

// —————————————————————— 窄只读 re-shell 白名单（客户 2026-10-18 裁定）——————————————————————
// `cmd /c dir`、`powershell -Command "Test-Path '<字面路径>'"` 一类**只读探针**不应硬拒；
// 但 re-shell 把真命令藏在参数 string 里、可能带元字符/变量展开，故只开两个极窄形态，且**先于**
// hardDenyPrograms 的 reshell 规则判定。其余 cmd/powershell/sh -c/pwsh/绝对路径可执行文件仍 deny。
//
// 防绕过要点：
//  - argv[0] 必须是**裸程序名**（不含 / 或 \）——绝对路径可执行文件仍走 deny；
//  - 整个 argv 不得含元字符/变量展开：& | < > ^ % ! $ ` ; ( ) 与换行/回车（cmd 与 PowerShell 都会在
//    子进程内解释这些字符，argv-noshell 的前提在 re-shell 上不成立）；
//  - cmd：[/d] /c 后**恰为** dir 或 where（大小写不敏感），其后只读参数可带；
//  - powershell：恰为 -NoProfile -Command，命令**恰为** Test-Path '<路径>'（单/双引号，路径内不含
//    引号/元字符）；不接 `Get-Process`、脚本块、管道等其它形态。
const RESHELL_ALLOW_METACHARS = ["&", "|", "<", ">", "^", "%", "!", "$", "`", ";", "(", ")", "\n", "\r"];

function hasReshellAllowMetachar(s: string): boolean {
  return RESHELL_ALLOW_METACHARS.some((t) => s.includes(t));
}

/** argv[0] 是否为裸程序名（无路径分隔符；引号先去一层）。 */
function isBareProgramName(raw: string): boolean {
  const q = stripQuotes(raw.trim());
  return !q.includes("/") && !q.includes("\\");
}

/** 只读 re-shell 白名单：命中返回规则 id（readonly-reshell），否则 null。 */
function matchReadonlyReshell(argv: string[], program: string): string | null {
  if (!isBareProgramName(argv[0])) return null;
  if (argv.some(hasReshellAllowMetachar)) return null;
  const args = argv.slice(1);
  if (program === "cmd") {
    let i = 0;
    if (args[i]?.toLowerCase() === "/d") i += 1;
    if (args[i]?.toLowerCase() !== "/c") return null;
    i += 1;
    const sub = args[i]?.toLowerCase();
    if (sub !== "dir" && sub !== "where") return null;
    return "readonly-reshell";
  }
  if (program === "powershell") {
    if (args.length !== 3) return null;
    if (args[0]?.toLowerCase() !== "-noprofile") return null;
    if (args[1]?.toLowerCase() !== "-command") return null;
    const command = args[2];
    if (typeof command !== "string") return null;
    // splitCommand 会剥掉外层引号、保留内层引号：`-Command "Test-Path 'C:\x'"` → `Test-Path 'C:\x'`。
    if (!/^test-path\s+(['"])([^'"]+)\1$/i.test(command.trim())) return null;
    return "readonly-reshell";
  }
  return null;
}

/** 白名单匹配：program 命中且子命令/禁用 flag 条件满足时返回规则 id，否则 null */
function matchReadOnly(args: string[], program: string, rules: ShellReadOnlyRule[]): string | null {
  for (const r of rules) {
    if (r.program.toLowerCase() !== program) continue;
    if (r.blockedFlags !== undefined && hasFlag(args, r.blockedFlags)) continue;
    if (r.subcommands !== undefined) {
      const sub = typeof args[1] === "string" ? args[1].toLowerCase() : "";
      if (!r.subcommands.map((s) => s.toLowerCase()).includes(sub)) continue;
    }
    return r.id;
  }
  return null;
}

// —————————————— 例行命令确定性白名单（2026-10-31，方案 v1.3 §5.1/§5.3/§5.4）——————————————
//
// **唯一实现**：分类器（本文件 `classifyShellDetailed`）与 shell 写目标守卫
// （`shell-write-guard.ts::evaluateShellWriteTargets`）**共用本函数**；Service 公开出口
// `src/service/gate/shell-rules.ts` 只逐字再导出（同一函数引用），编排/委托策略经该出口消费。
// 不得复制实现或另立第二份白名单（方案 §9 不变量 3 / §13.3）。
//
// 只放宽**精确 argv 形态**（§5.1）：任何多余参数、flag、`--`、通配、越界路径都不命中，落回既有链
// （review/risky → judge 或客户卡），fail-closed 不变。本函数**无 IO、不依赖 ShellRules**
// （§5.4：白名单不进规则集数据——写守卫拿不到规则集，避免扩大装配面）。
//
// 命中 id 是冻结契约：分类器 ruleId 为 `allow:routine:<id>`；B1 的委托策略（`routine-shell-policy`）
// 只接受原委托清单三 id（`npm-test` / `npm-run-typecheck` / `node-test`）。**不得改名**。

/** `npm run <script>` 固定脚本名（§5.1）：任意其它脚本名不放行（`build`/`start`/自定义仍走既有链）。 */
const ROUTINE_NPM_RUN_SCRIPTS: ReadonlySet<string> = new Set(["test", "typecheck", "lint", "check"]);

/** `node --test <path>` 的路径段字符集：Unicode 字母/数字与 `._@+-`（中文测试目录合法）；空白/元字符/引号/反斜杠一律不命中。 */
const ROUTINE_TEST_PATH_SEGMENT = /^[\p{L}\p{N}._@+-]+$/u;

/** 测试文件后缀（§5.1）：`*.test.{js,ts,mjs,cjs,mts,cts}`（大小写敏感，fail-closed）。 */
const ROUTINE_TEST_FILE = /\.test\.(?:js|ts|mjs|cjs|mts|cts)$/;

/** `node --test` 的单个路径：必须在 `test/` 下、匹配测试后缀、无 flag、无 `..`、无空白/元字符。 */
function isRoutineNodeTestPath(p: string): boolean {
  if (p === "" || p.startsWith("-")) return false;
  // 项目相对路径，字面以 `test/` 开头（`./test/…`、绝对路径、`TEST/…` 均不命中）。
  if (!p.startsWith("test/")) return false;
  const segments = p.split("/");
  if (segments.length < 2) return false;
  for (const seg of segments) {
    if (seg === "." || seg === "..") return false; // 无 `..`（逃逸）与空段/当前段
    if (!ROUTINE_TEST_PATH_SEGMENT.test(seg)) return false; // 无空白/元字符
  }
  return ROUTINE_TEST_FILE.test(p);
}

/**
 * 例行命令确定性白名单谓词（方案 v1.3 §5.1 精确形态；唯一实现）。
 * 命中返回稳定 id；未命中返回 undefined（调用方落回既有链，fail-closed 不变）。
 * 纯函数：无 IO、无副作用、不依赖规则集。
 */
export function matchRoutineShellCommand(argv: string[]): { id: string } | undefined {
  if (!Array.isArray(argv)) return undefined;
  if (!argv.every((a) => typeof a === "string")) return undefined;
  if (argv.length === 2) {
    const prog = argv[0];
    const second = argv[1];
    if (prog === "npm" && second === "test") return { id: "npm-test" };
    if (prog === "npm" && second === "ci") return { id: "npm-ci" };
    if (prog === "tsc" && second === "--noEmit") return { id: "tsc-noemit" };
  }
  if (argv.length === 3 && argv[0] === "npm" && argv[1] === "run") {
    const script = argv[2]!;
    if (ROUTINE_NPM_RUN_SCRIPTS.has(script)) return { id: `npm-run-${script}` };
  }
  if (argv[0] === "node" && argv[1] === "--test") {
    // 裸 `node --test`（cwd=项目根的默认发现）或受限测试路径；任何 flag/越界/畸形路径都不命中。
    if (argv.slice(2).every(isRoutineNodeTestPath)) return { id: "node-test" };
  }
  return undefined;
}

// —————————————— 只读 Git 精确白名单（2026-11-08，W3-G；设计 P1.3 §2.4.3）——————————————
//
// **唯一实现**：分类器（`classifyShellDetailed`）与 shell 写目标守卫（`shell-write-guard.ts`）
// **共用本函数引用**；`src/service/gate/shell-rules.ts` 公共出口逐字再导出（同一引用，沿用
// `matchRoutineShellCommand` 先例）。不得复制实现、不得另立第二份模板（设计 F5/F13）。
//
// 判据（客户 2026-11-08 补充规格「git 命令只读放行」）：
//   * `git` 之后**第一项必须是子命令**——任何全局选项（`-c`/`-C`/`--git-dir`/`--work-tree`/
//     `--exec-path`/`--config-env`/`--namespace`/`--bare`/`--no-pager`/`--literal-pathspecs`/
//     `--version`/`--help` …）一律拒绝；
//   * 每个子命令只接受 §2.4.3 表中列出的精确 flag/参数形态，**未列即拒**（deny-by-default；
//     不落审批——裸 Git 写路径在角色模型里不存在，写/发布只走结构化能力）；
//   * 路径必须是**字面项目相对路径**：非空、非绝对（含盘符/UNC）、无 `..`/`.`/空段、
//     无 `.git` 段（大小写不敏感）、无通配（`*`/`?`/`[`/`]`）、无 pathspec magic（`:`，含 `:(…)`）、
//     无反斜杠与 NUL/控制字符；
//   * OID 必须是完整 40/64 hex（不接受短 SHA/revision 表达式/分支名）；`HEAD` 仅出现在
//     `log` 目标、`rev-parse --verify`、`ls-tree` 目标、`merge-base` 参数的允许位置。
//
// 执行层不按本 argv 的 PATH/cwd 解析（N12）：只读 Git 经固定本地传输（绝对可执行 + 固定
// config/env；`executeReadonlyGit`，编排 trunk Provider）执行——**模型提供的程序名只用于匹配**。
// `buildReadonlyGitBody(match)` 给出**规范 argv 体**（单一来源；审计 `readonlyGit.canonicalArgv`
// 必须与实际执行体一致，I0-7）。

/** 只读 Git 白名单覆盖的子命令（同时是稳定 id / template / 审计 `allow:readonly:git:<id>` 的 `<id>`）。 */
export type ReadonlyGitTemplate =
  | "status" | "log" | "diff" | "show" | "rev-parse"
  | "ls-files" | "ls-tree" | "merge-base" | "blame" | "cat-file";

/**
 * `matchReadonlyGit` 的匹配结果（受限描述；执行层只接受本形状并自行构造规范体，
 * **不接受任意 argv**——见 `executeReadonlyGit` 契约）。`target`/`other` 为小写完整 OID
 * 或 `HEAD`（视子命令）；`paths` 为按输入原样保留的字面路径。
 */
export interface ReadonlyGitMatch {
  id: ReadonlyGitTemplate;
  template: ReadonlyGitTemplate;
  /** 主目标：完整 OID 或 HEAD（log/ls-tree 可缺省 ⇒ HEAD；show/rev-parse/cat-file/merge-base 必有）。 */
  target?: string;
  /** 第二目标：diff 的第二个 OID / merge-base 右侧。 */
  other?: string;
  /** 字面项目相对路径（`--` 之后原样保留）。 */
  paths: readonly string[];
  /** `log -<N>`（1..100；缺省 20）。 */
  limit?: number;
  /** `log --oneline`（只影响输出）。 */
  oneline?: boolean;
  /** `diff` 显示类 flag（只影响输出，规范体原样保留）。 */
  display?: "stat" | "name-only" | "name-status";
  /** `cat-file` 模式：`-t`/`-s`/`-e`/`-p` 或对象类型。 */
  catFileMode?: "-t" | "-s" | "-e" | "-p" | "blob" | "commit" | "tree" | "tag";
  /** `blame -L <start>,<end>`（1..2000；跨度 ≤2000）。 */
  lineStart?: number;
  lineEnd?: number;
}

/** `git` 程序名判定（路径前缀/`.exe|.cmd|.bat` 归一，小写）——与 `gitQueryBody` 的受控入口同一判据。 */
function isRawGitProgramName(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const base = raw.replace(/\\/g, "/").split("/").at(-1) ?? "";
  return /^git(?:\.exe|\.cmd|\.bat)?$/i.test(base);
}

/** 字面项目相对路径（§2.4.3）：非空/非绝对/无 `..`/`.git` 段/无通配或 pathspec magic/无控制字符。 */
function isReadonlyGitPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (/[\x00-\x1f\x7f]/.test(value)) return false;
  if (value.startsWith("-")) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) return false;
  // `:`（含 `:(…)` magic）、`*`/`?`/`[`/`]` 通配、反斜杠分隔符（Windows 路径）一律不命中。
  if (/[\\:*?\[\]]/.test(value)) return false;
  const body = value.endsWith("/") ? value.slice(0, -1) : value;
  if (body.length === 0) return false;
  return body.split("/").every((seg) => seg !== "" && seg !== "." && seg !== ".." && seg.toLowerCase() !== ".git");
}

/** 完整 OID：40 或 64 位 hex（大小写接受；规范体统一小写）。 */
function isReadonlyGitOid(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
}

function readonlyGitHeadOrOid(value: unknown): value is string {
  return value === "HEAD" || isReadonlyGitOid(value);
}

/** 规范体目标记号：OID 统一小写；HEAD 原样。 */
function readonlyGitTarget(value: string): string {
  return value === "HEAD" ? "HEAD" : value.toLowerCase();
}

/**
 * 拆分 `<flags> [-- <literal paths>…]`：`--` 最多出现一次；无 `--` 时全部 token 都必须是 flag
 * （路径必须位于 `--` 之后——表形态如此）；`--` 之后的每一项都必须过 `isReadonlyGitPath`。
 */
function splitReadonlyGitPathspec(tokens: readonly string[]): { flags: string[]; paths: string[] } | undefined {
  const idx = tokens.indexOf("--");
  if (idx === -1) return { flags: [...tokens], paths: [] };
  if (tokens.indexOf("--", idx + 1) !== -1) return undefined;
  const paths = tokens.slice(idx + 1);
  if (!paths.every(isReadonlyGitPath)) return undefined;
  return { flags: tokens.slice(0, idx).map(String), paths: [...paths] };
}

const READONLY_GIT_CAT_FILE_MODES: ReadonlySet<string> = new Set(["-t", "-s", "-e", "-p", "blob", "commit", "tree", "tag"]);
const READONLY_GIT_DIFF_DISPLAY: ReadonlyMap<string, ReadonlyGitMatch["display"]> = new Map([
  ["--stat", "stat"],
  ["--name-only", "name-only"],
  ["--name-status", "name-status"],
]);

/**
 * 只读 Git 精确白名单谓词（§2.4.3 白名单全形态；唯一实现）。
 * 命中返回受限描述 `ReadonlyGitMatch`；未命中返回 `undefined`（调用方维持硬拒 / 非 Git 路径不受影响）。
 * 纯函数：无 IO、无副作用、不依赖规则集。
 */
export function matchReadonlyGit(argv: readonly unknown[]): ReadonlyGitMatch | undefined {
  if (!Array.isArray(argv) || argv.length < 2) return undefined;
  if (!argv.every((a) => typeof a === "string")) return undefined;
  const args = argv as readonly string[];
  if (!isRawGitProgramName(args[0])) return undefined;
  const sub = args[1]!;
  const rest = args.slice(2);
  switch (sub) {
    case "status": {
      const split = splitReadonlyGitPathspec(rest);
      if (!split) return undefined;
      if (!split.flags.every((f) => f === "--porcelain" || f === "--porcelain=v1" || f === "--short" || f === "-s")) return undefined;
      return { id: "status", template: "status", paths: split.paths };
    }
    case "log": {
      const split = splitReadonlyGitPathspec(rest);
      if (!split) return undefined;
      let limit: number | undefined;
      let oneline = false;
      let target: string | undefined;
      for (const token of split.flags) {
        const limitMatch = /^-([1-9]\d{0,2})$/.exec(token);
        if (limitMatch) {
          if (limit !== undefined) return undefined;
          limit = Number(limitMatch[1]);
          if (limit > 100) return undefined;
          continue;
        }
        if (token === "--oneline") {
          if (oneline) return undefined;
          oneline = true;
          continue;
        }
        if (readonlyGitHeadOrOid(token)) {
          if (target !== undefined) return undefined;
          target = readonlyGitTarget(token);
          continue;
        }
        return undefined;
      }
      return {
        id: "log",
        template: "log",
        ...(target !== undefined ? { target } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(oneline ? { oneline: true } : {}),
        paths: split.paths,
      };
    }
    case "diff": {
      const split = splitReadonlyGitPathspec(rest);
      if (!split) return undefined;
      // 显示类 flag 只影响输出（规范体原样保留）；`--no-ext-diff`/`--no-textconv` 与规范体幂等。
      let display: ReadonlyGitMatch["display"];
      const oids: string[] = [];
      for (const token of split.flags) {
        const displayValue = READONLY_GIT_DIFF_DISPLAY.get(token);
        if (displayValue !== undefined) {
          if (display !== undefined) return undefined;
          display = displayValue;
          continue;
        }
        if (token === "--no-ext-diff" || token === "--no-textconv") continue;
        if (isReadonlyGitOid(token)) {
          if (oids.length >= 2) return undefined;
          oids.push(token.toLowerCase());
          continue;
        }
        return undefined;
      }
      return {
        id: "diff",
        template: "diff",
        ...(oids[0] !== undefined ? { target: oids[0] } : {}),
        ...(oids[1] !== undefined ? { other: oids[1] } : {}),
        ...(display !== undefined ? { display } : {}),
        paths: split.paths,
      };
    }
    case "show": {
      if (rest.length !== 1) return undefined;
      const match = /^([0-9a-fA-F]{40}|[0-9a-fA-F]{64}):(.+)$/.exec(rest[0]!);
      if (!match) return undefined;
      const [, oidText, pathText] = match;
      if (!isReadonlyGitPath(pathText)) return undefined;
      return { id: "show", template: "show", target: oidText!.toLowerCase(), paths: [pathText!] };
    }
    case "rev-parse": {
      if (rest.length !== 2 || rest[0] !== "--verify" || !readonlyGitHeadOrOid(rest[1])) return undefined;
      return { id: "rev-parse", template: "rev-parse", target: readonlyGitTarget(rest[1]!), paths: [] };
    }
    case "ls-files": {
      const split = splitReadonlyGitPathspec(rest);
      if (!split) return undefined;
      if (!split.flags.every((f) => f === "--stage" || f === "-z")) return undefined;
      return { id: "ls-files", template: "ls-files", paths: split.paths };
    }
    case "ls-tree": {
      const split = splitReadonlyGitPathspec(rest);
      if (!split) return undefined;
      let target: string | undefined;
      for (const token of split.flags) {
        if (token === "-r" || token === "--full-tree") continue;
        if (readonlyGitHeadOrOid(token)) {
          if (target !== undefined) return undefined;
          target = readonlyGitTarget(token);
          continue;
        }
        return undefined;
      }
      return { id: "ls-tree", template: "ls-tree", ...(target !== undefined ? { target } : {}), paths: split.paths };
    }
    case "merge-base": {
      if (rest.length !== 2 || !readonlyGitHeadOrOid(rest[0]) || !readonlyGitHeadOrOid(rest[1])) return undefined;
      return {
        id: "merge-base",
        template: "merge-base",
        target: readonlyGitTarget(rest[0]!),
        other: readonlyGitTarget(rest[1]!),
        paths: [],
      };
    }
    case "blame": {
      let lineStart: number | undefined;
      let lineEnd: number | undefined;
      let tokens = rest;
      if (tokens[0] === "-L") {
        const range = tokens[1];
        if (range === undefined) return undefined;
        const match = /^([1-9]\d{0,3}),([1-9]\d{0,3})$/.exec(range);
        if (!match) return undefined;
        lineStart = Number(match[1]);
        lineEnd = Number(match[2]);
        // 行号 1..2000、跨度 ≤2000（§2.4.3）。
        if (lineStart > 2000 || lineEnd > 2000 || lineStart > lineEnd || lineEnd - lineStart + 1 > 2000) return undefined;
        tokens = tokens.slice(2);
      }
      if (tokens.length !== 2 || tokens[0] !== "--" || !isReadonlyGitPath(tokens[1])) return undefined;
      return {
        id: "blame",
        template: "blame",
        paths: [tokens[1]!],
        ...(lineStart !== undefined && lineEnd !== undefined ? { lineStart, lineEnd } : {}),
      };
    }
    case "cat-file": {
      if (rest.length !== 2 || !READONLY_GIT_CAT_FILE_MODES.has(rest[0]!) || !isReadonlyGitOid(rest[1])) return undefined;
      return {
        id: "cat-file",
        template: "cat-file",
        target: rest[1]!.toLowerCase(),
        catFileMode: rest[0] as ReadonlyGitMatch["catFileMode"],
        paths: [],
      };
    }
    default:
      return undefined;
  }
}

/**
 * 只读 Git 规范 argv 体（单一来源，§2.4.3；审计 `readonlyGit.canonicalArgv` 与实际执行体一致）。
 * 与 `gitQueryBody` 的重叠模板由 `test/门禁引擎/readonly-git-matcher.test.ts` 做差分断言；
 * 允许的分叉（log 默认 HEAD 而非 `--all`、`--oneline`、diff 显示类 flag、ls-tree 默认 HEAD、
 * blame/cat-file 无结构化模板）逐条记录在同一测试与变更证据中。
 */
export function buildReadonlyGitBody(match: ReadonlyGitMatch): string[] {
  const paths = [...match.paths];
  switch (match.template) {
    case "status":
      return ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignore-submodules=all", "--", ...paths];
    case "log":
      return [
        "log",
        `-${match.limit ?? 20}`,
        ...(match.oneline === true ? ["--oneline"] : []),
        "--format=%H%x00%P%x00%s",
        match.target ?? "HEAD",
        "--",
        ...paths,
      ];
    case "diff": {
      const display = match.display === "stat" ? ["--stat"]
        : match.display === "name-only" ? ["--name-only"]
          : match.display === "name-status" ? ["--name-status"] : [];
      return [
        "diff",
        ...display,
        "--no-ext-diff",
        "--no-textconv",
        "--ignore-submodules=all",
        ...(match.target !== undefined ? [match.target] : []),
        ...(match.other !== undefined ? [match.other] : []),
        "--",
        ...paths,
      ];
    }
    case "show":
      return ["cat-file", "blob", `${match.target!}:${paths[0]!}`];
    case "rev-parse":
      return ["rev-parse", "--verify", `${match.target!}^{commit}`];
    case "ls-files":
      return ["ls-files", "--stage", "-z", "--", ...paths];
    case "ls-tree":
      return ["ls-tree", "-r", "-z", "--full-tree", match.target ?? "HEAD", "--", ...paths];
    case "merge-base":
      return ["merge-base", match.target!, match.other!];
    case "blame":
      return [
        "blame",
        ...(match.lineStart !== undefined && match.lineEnd !== undefined ? ["-L", `${match.lineStart},${match.lineEnd}`] : []),
        "--",
        paths[0]!,
      ];
    case "cat-file":
      return ["cat-file", match.catFileMode!, match.target!];
    default: {
      const exhaustive: never = match.template;
      throw new Error(`未知只读 Git 模板：${String(exhaustive)}`);
    }
  }
}

// rg 的带值选项仅用于跳过参数值（例如 -e --pre 是模式），不是新的安全白名单。
// D3 只识别显式 --pre；隐藏配置、其他间接执行能力沿用已接受的风险取舍。
const RG_VALUE_OPTIONS = new Set([
  "--regexp", "--file", "--pre-glob", "--dfa-size-limit", "--encoding", "--engine",
  "--max-count", "--regex-size-limit", "--threads", "--glob", "--iglob", "--ignore-file",
  "--max-depth", "--max-filesize", "--type", "--type-not", "--type-add", "--type-clear",
  "--after-context", "--before-context", "--color", "--colors", "--context",
  "--context-separator", "--field-context-separator", "--field-match-separator",
  "--hostname-bin", "--hyperlink-format", "--max-columns", "--path-separator", "--replace",
  "--sort", "--sortr", "--generate",
]);
const RG_SHORT_VALUE_OPTIONS = new Set("efEmjgdtTABCMr".split(""));

/** 只看选项位置；选项可出现在位置参数后，直到 --。短选项组合的首个带值项吃掉余部或下一项。 */
function hasRgPreprocessor(args: string[]): boolean {
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (arg === "--pre" || arg.startsWith("--pre=")) return true;
    if (RG_VALUE_OPTIONS.has(arg)) {
      i += 1;
    } else if (arg.startsWith("-") && !arg.startsWith("--")) {
      for (let j = 1; j < arg.length; j++) {
        if (!RG_SHORT_VALUE_OPTIONS.has(arg[j])) continue;
        if (j === arg.length - 1) i += 1;
        break;
      }
    }
  }
  return false;
}

/** 只在原 allow 出口调用：不改变既有 deny/risky，也不引入文件系统身份核验。 */
function reviewExplicitExecution(args: string[], program: string): ShellVerdict | null {
  const token = stripQuotes(args[0].trim());
  if (/[\\/]/.test(token) || /^[a-z]:/i.test(token) || /\.(cmd|bat|ps1)$/i.test(token)) {
    return {
      decision: "review",
      reason: "显式程序路径或脚本包装不能仅凭 basename 获得只读免审批资格，交既有审批",
      ruleId: "review:explicit-program",
    };
  }
  if (program === "rg" && hasRgPreprocessor(args)) {
    return {
      decision: "review",
      reason: "rg --pre 预处理参数可启动外部程序，交既有审批",
      ruleId: "review:rg-preprocessor",
    };
  }
  return null;
}

/**
 * 带原因的判定。参数取 unknown 是为了**强制走运行时校验**——任何调用方传错形状都得到 deny，
 * 而不会因为 TS 类型擦除而静默退化。classifyShell（冻结契约）只是它的四态封装。
 */
export function classifyShellDetailed(argv: unknown, rules: unknown): ShellVerdict {
  // 1) 规则集：缺失/非法/版本未知 → 硬拒（fail-closed，§7.5 第一条）
  const rulesErr = validateRules(rules);
  if (rulesErr !== null) {
    return { decision: "deny", reason: `规则集不可用（fail-closed）：${rulesErr}`, ruleId: "deny:rules-invalid" };
  }
  const R = rules as ShellRules;

  // 执行模型（§7.10）：仅在「命令会经 shell 解释」时才扫元字符。
  //   executionModel === "argv-noshell" → 元字符是普通参数字节，**不**扫（避免空转 + 假安全感 + 误杀）；
  //   "shell-string" 或缺省 → 保守假定 shell 会解释 ⇒ 扫（fail-closed 缺省，兼容旧规则集）。
  const metacharsEnforced = (R.executionModel as ShellExecutionModel | undefined) !== "argv-noshell";

  // 2) argv：必须是「非空、全字符串」的数组
  if (!Array.isArray(argv) || argv.length === 0) {
    return { decision: "deny", reason: "argv 缺失或为空（fail-closed）", ruleId: "deny:argv-invalid" };
  }
  if (!argv.every((a) => typeof a === "string")) {
    return { decision: "deny", reason: "argv 含非字符串元素（fail-closed）", ruleId: "deny:argv-invalid" };
  }
  const args = argv as string[];
  // 2) 裸 Git（2026-11-08，W3-G）：**只读精确白名单**命中 ⇒ allow（供 run_shell；执行侧经固定传输，
  //    见 `executeReadonlyGit`）；未命中 ⇒ 维持硬拒（写/发布只走结构化 git_query / git_candidate /
  //    git_publish）。本判定位置仍在 hardDeny/denyTokens/risky/readonly 分支**之前**：
  //    只读 Git 不受自定义硬拒/risky 规则误伤；非白名单形态也绝不会落入 (b)/(a) 被批准。
  //    分类器本身不区分入口——`start_background_task` 不享受放行由写目标守卫按 `entry` 拒绝。
  if (isRawGitProgramName(args[0])) {
    const readonlyGit = matchReadonlyGit(args);
    if (readonlyGit !== undefined) {
      return { decision: "allow", reason: `命中只读 Git 精确白名单：${readonlyGit.id}`, ruleId: `allow:readonly:git:${readonlyGit.id}` };
    }
    return { decision: "deny", ruleId: "deny:raw-git-controlled-tools-required",
      reason: "裸 Git 只读白名单之外一律硬拒：未经受控配置/env/完整模板与角色ACL；请使用 git_query / git_candidate / git_publish，旧shell审批不能替代该边界。" };
  }

  // 3) 结构性硬拒：换行/回车（多命令拼接）——**仅当执行模型会经 shell 解释时**成立（§7.10）。
  //    shell:false 下 argv 元素里的换行只是普通字节、不产生第二条命令，故不拒（否则误杀多行参数）。
  if (metacharsEnforced) {
    for (const a of args) {
      if (a.includes("\n") || a.includes("\r")) {
        return { decision: "deny", reason: "命令含换行/回车（多命令拼接）", ruleId: "deny:structural:newline" };
      }
    }
  }

  // 4) argv[0] 必须是程序名：空、或含空白（疑似塞进来整条命令串，如 "sh -c '…'"）→ 拒
  //    （此判据与执行模型无关，恒拒：整条命令串不是合法程序名，fail-closed。）
  const prog0 = args[0];
  if (prog0.trim() === "") {
    return { decision: "deny", reason: "argv[0] 为空", ruleId: "deny:argv-invalid" };
  }
  if (/\s/.test(prog0)) {
    return {
      decision: "deny",
      reason: `argv[0] 含空白，疑似整条命令串而非程序名（无法可靠解析）：${JSON.stringify(prog0)}`,
      ruleId: "deny:opaque-command",
    };
  }
  const program = programName(prog0);

  // 4.5) 窄只读 re-shell 白名单（客户 2026-10-18 裁定）——**先于** reshell 硬拒：
  //   只放 `cmd [/d] /c dir|where` 与 `powershell -NoProfile -Command "Test-Path '<字面路径>'"`；
  //   其余 re-shell 形态（sh -c/pwsh/cmd /c del/绝对路径可执行文件…）仍在第 5 步 deny。
  const roReshell = matchReadonlyReshell(args, program);
  if (roReshell !== null) {
    const review = reviewExplicitExecution(args, program);
    if (review !== null) return review;
    return {
      decision: "allow",
      reason: `命中窄只读 re-shell 白名单：${roReshell}`,
      ruleId: `allow:readonly:${roReshell}`,
    };
  }

  // 5) 硬拒程序（外壳/破坏性/执行包装器/间接执行器）——先于白名单，握绝对否决
  const denyProg = matchHardDeny(args, program, R.hardDenyPrograms);
  if (denyProg !== null) {
    return { decision: "deny", reason: `命中硬拒程序规则：${denyProg}`, ruleId: `deny:program:${denyProg}` };
  }

  // 6) 危险 shell 记号（逐元素子串扫描）——**仅当执行模型会经 shell 解释时**生效（§7.10）。
  //    shell:false 下 `> | & ; $( ` <<` 只是普通参数：扫它既是空转、又会误杀正常参数（如 `grep 'a|b'`）。
  //    ★ 耦合：若执行层改回 shell 字符串 / shell:true，务必令 executionModel !== "argv-noshell"
  //      （或删字段走缺省），否则这一段被跳过 ⇒ 漏掉真重定向/管道/命令替换。
  if (metacharsEnforced) {
    for (const a of args) {
      for (const t of R.denyTokens) {
        if (t === "") continue;
        if (a.includes(t)) {
          return {
            decision: "deny",
            reason: `命中危险 shell 记号 ${JSON.stringify(t)}：${JSON.stringify(a)}`,
            ruleId: `deny:token:${t}`,
          };
        }
      }
    }
  }

  // 6.5) 例行命令确定性白名单（2026-10-31，方案 v1.3 §5.1/§5.3）——**唯一纯函数**，写守卫共用同一引用。
  //    位置契约（§5.3）：硬拒（第 5 步）与记号检查（第 6 步）**之后** ⇒ 硬地板/自定义记号仍握绝对优先（P7/AC-16）；
  //    risky（第 7 步）**之前** ⇒ 注入更严格的 risky 规则也不能覆盖本确定性白名单（§8.3 第 11 点，客户已接受）。
  //    未命中的形态（npm install / 任意脚本名 / 裸 tsc / 越界或带 flag 的 node --test…）继续走既有链。
  const routine = matchRoutineShellCommand(args);
  if (routine !== undefined) {
    return {
      decision: "allow",
      reason: `命中例行命令确定性白名单：${routine.id}`,
      ruleId: `allow:routine:${routine.id}`,
    };
  }

  // 7) risky 程序（危险但有正当用途）→ "risky"（§14.2：交 (b) pm 审读；(b) 判放行后**仍须**过 (a) 客户）。
  //    只在「程序名在 argv 里可见、语义可判」时命中——re-shell/内联求值在第 5 步已硬拒，到不了这里。
  const riskyProg = matchRisky(args, program, R.riskyPrograms ?? []);
  if (riskyProg !== null) {
    return {
      decision: "risky",
      reason: `命中「危险但有正当用途」程序规则：${riskyProg}（须过 (b) 且必过 (a)）`,
      ruleId: `risky:program:${riskyProg}`,
    };
  }

  // 8) 白名单（只读命令）→ allow（唯一通向 allow 的分支）
  const ro = matchReadOnly(args, program, R.readOnly);
  if (ro !== null) {
    const review = reviewExplicitExecution(args, program);
    if (review !== null) return review;
    return { decision: "allow", reason: `命中只读白名单：${ro}`, ruleId: `allow:readonly:${ro}` };
  }

  // 9) 都不命中 → review（交 (b)；b 明确即终结，b 拿不准/不可用才升 (a)；未接时由装配方默认拒绝）
  return { decision: "review", reason: "未命中白名单，也未命中硬拒或 risky——交下一闸", ruleId: "review" };
}

/**
 * 冻结契约入口：`classifyShell(argv, rules) => "allow" | "deny" | "risky" | "review"`（§7.4/§14.1）。
 * rules 必填；缺失/非法/版本未知 → "deny"（fail-closed）。此函数不吞错误、无默认放行分支。
 */
export function classifyShell(argv: string[], rules: ShellRules): ShellClass {
  return classifyShellDetailed(argv, rules).decision;
}

// ---------------------------------------------------------------------------
// 默认规则集（可被装配方替换/覆盖；数据驱动，便于审计与 pin）。
// 取舍见本文件与 changelog 的说明：这是**硬地板**，取「无正当用途/绕过门禁的就拒、只读就放、
// 危险但有正当用途的交 (b)+(a)、其余交 (b)」；不追求完备（间接执行类无法穷尽），未命中者一律 review。
//
// ★ 规则集**按「程序 + argv」分类**（§7.10）：argv[0] 程序黑/白名单、危险 flag、写目标参数。
//   **不因「无 shell」就认为安全**——`tee`/`dd of=`/`cp`/`mv`/`node -e`/`git checkout` 等**程序自身**照样能写，
//   故它们按**程序语义**判（在 hardDenyPrograms / riskyPrograms 里），而非看有没有 `>`。
//   `denyTokens` 保留但**在本默认模型（argv-noshell）下不生效**——它是「一旦改回 shell 解释就恢复」的集合。
//
// ★ 三段（§14.3）：`hardDenyPrograms`（deny，终结）/ `riskyPrograms`（risky，过 b 且必过 a）/ `readOnly`（allow）。
//   划名原则：**只拒「没有任何正当用途」或「放行即绕过门禁」的**——`rm` 有正当用途（删临时文件）故入 risky；
//   `sh -c` 放行即绕过门禁（§14.4）故仍硬拒。
// ---------------------------------------------------------------------------

const BACKTICK = "`";

function defaultReadOnly(): ShellReadOnlyRule[] {
  return [
    { id: "ls", program: "ls" },
    { id: "pwd", program: "pwd" },
    { id: "cat", program: "cat" },
    { id: "head", program: "head" },
    { id: "tail", program: "tail" },
    { id: "wc", program: "wc" },
    { id: "grep", program: "grep" },
    { id: "rg", program: "rg" },
    { id: "findstr", program: "findstr" },
    { id: "diff", program: "diff" },
    { id: "echo", program: "echo" },
    { id: "date", program: "date" },
    { id: "whoami", program: "whoami" },
    { id: "hostname", program: "hostname" },
    { id: "uname", program: "uname" },
    { id: "which", program: "which" },
    { id: "where", program: "where" },
    { id: "printenv", program: "printenv" },
    { id: "stat", program: "stat" },
    { id: "readlink", program: "readlink" },
    { id: "basename", program: "basename" },
    { id: "dirname", program: "dirname" },
    // git：**不在此表**（W3-G 起单一来源为 `matchReadonlyGit` 精确白名单，分类器第 2 步先于本表判定；
    // 旧 `readonly:git` 子命令表是裸 Git 硬拒下的死数据，已随规则集 v4 删除，避免双口径/误读为仍生效）。
    // 解释器仅放「打印版本」这一确定只读形态（其余形态见硬拒/已知缺口）
    { id: "node-version", program: "node", subcommands: ["--version", "-v"] },
    {
      id: "npm-read",
      program: "npm",
      subcommands: ["--version", "-v", "ls", "list", "view", "outdated", "root", "prefix"],
    },
  ];
}

function defaultHardDeny(): ShellHardDenyRule[] {
  return [
    // ── A-1 re-shell：外壳/解释器外壳把**真命令藏在参数 string 里**，argv 无可读程序名，(c) 无法分类 ──
    // `sh -c "…"` 里的 `sh` 自己会解释那段 string ⇒ 其一切影响（含写入）发生在子进程内、**完全不经过
    // `resolveWrite`**；放行 = 整体绕过写边界（§14.4）。故这一类**仍硬拒终结、不改判 risky**。
    {
      id: "reshell",
      programs: [
        "sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish", "busybox",
        "cmd", "powershell", "pwsh", "wsl", "winpty", "script", "expect",
      ],
    },
    // ── A-1 求值内建/包装：把一段 string/命令当代码求值 ⇒ 同上「任意代码」，非「有界危险命令」──
    { id: "inline-eval", programs: ["eval", "exec", "source", "command", "."] },
    // ── A-1 解释器「内联求值」形态：node -e / python -c / perl -e / ruby -e / php -r …（其余形态见已知缺口）──
    {
      id: "interpreter-inline",
      programs: ["node", "python", "python2", "python3", "perl", "ruby", "php", "lua", "rscript", "deno", "bun", "ts-node"],
      onlyWithFlag: ["-e", "--eval", "-p", "--print", "-c", "-r", "--require"],
    },
    // ── A-1 deno 的 `deno eval <code>` 子命令形态（等价于内联求值）──
    { id: "deno-eval", programs: ["deno"], onlyWithSubcommand: ["eval"] },
    // ── A-1 awk 程序可 system()/重定向 ⇒ 等价任意代码（代价：普通文本处理也走 review 以上的硬拒）──
    { id: "awk-exec", programs: ["awk", "gawk", "mawk", "nawk"] },
    // ── 2026-10-29（v2.3 / 复验 F1）：find -exec/-execdir/-ok/-okdir 执行任意命令 ⇒ 硬拒 ──
    { id: "find-exec", programs: ["find"], onlyWithFlag: ["-exec", "-execdir", "-ok", "-okdir"] },
    // ── A-2 提权：受治理会话里无正当用途 ──
    { id: "privilege", programs: ["sudo", "doas", "su", "runas", "pkexec"] },
    // ── A-2 系统级破坏/控制：无正当用途 ──
    {
      id: "system-destroy",
      programs: ["mkfs", "format", "diskpart", "wipefs", "fdisk", "shutdown", "reboot", "halt", "poweroff"],
    },
    // ── A-2 Windows 脚本宿主/LOLBin（可下载并执行/绕过策略）：无正当用途 ──
    {
      id: "lolbin",
      programs: ["osascript", "wscript", "cscript", "mshta", "rundll32", "regsvr32", "msiexec", "installutil", "regasm", "regsvcs", "javaws", "msdt", "forfiles", "certutil", "bitsadmin"],
    },
  ];
}

/**
 * 默认 risky 规则（§14.3-B）：**危险但有正当用途**的单程序命令 → 判 "risky"（过 (b) pm 审读；b 判放行后**仍须过 (a)**）。
 * ★ 判据：**程序名在 argv 里以可读元素出现、语义可判**——(a) 客户看命令原文能看懂它的效果（`rm -rf build/` 看得懂）。
 *   这正是 (a) 能兜住 risky 的前提；「命令藏在 string 里」的 re-shell/内联求值**不进本表**（它们在 hardDenyPrograms）。
 *   风险交给 (b) 审读 + (a) 人看原文兜。**写目标是否逃出受治理根不由 (c) 判**——(c) 不解析路径（§7.7/§14.3）；
 *   路径由 resolveWrite 在其自身范围判。但 shell 介导的写不经 resolveWrite（§7.1），故对 shell 写「逃出根」在门禁侧
 *   无强制——由 (b)+(a) 兜（这也是本档**必须打扰人**的原因）。
 */
function defaultRisky(): ShellRiskyRule[] {
  return [
    // 删除/截断（删自己刚生成的临时文件等**正当**用途）
    { id: "risky:delete", programs: ["rm", "rmdir", "del", "erase", "rd", "shred", "srm", "truncate", "dd"] },
    // 原地改写
    { id: "risky:in-place-edit", programs: ["sed", "perl", "ruby"], onlyWithFlag: ["-i", "--in-place"] },
    // 交互式编辑器（可写）
    { id: "risky:editors", programs: ["vi", "vim", "nvim", "nano", "emacs", "ed", "ex", "notepad"] },
    // 进程/服务/系统状态变更
    {
      id: "risky:process-service",
      programs: ["kill", "killall", "taskkill", "systemctl", "service", "sc", "net", "reg", "regedit", "schtasks", "at", "crontab", "launchctl"],
    },
    // 网络抓取/远程执行
    {
      id: "risky:network",
      programs: ["curl", "wget", "fetch", "aria2c", "scp", "sftp", "ftp", "rsync", "telnet", "nc", "ncat", "netcat", "ssh", "psexec"],
    },
    // 间接执行器：被执行的**程序名以可读 argv 元素出现**（区别于 A-1「藏进 string」）⇒ 人能在原文里看懂
    { id: "risky:indirect-exec", programs: ["xargs", "env", "nohup", "nice", "ionice", "timeout", "stdbuf", "watch", "start"] },
    // 构建/任务运行器：目标是执行构建脚本（Makefile/…）
    {
      id: "risky:build",
      programs: ["make", "gmake", "just", "rake", "gradle", "gradlew", "mvn", "mvnw", "ant", "msbuild", "dotnet", "cargo", "go"],
    },
    // 包管理器的「运行脚本/安装（含生命周期脚本）」形态：npm install 会跑 postinstall
    {
      id: "risky:pkg-run",
      programs: ["npm", "yarn", "pnpm"],
      onlyWithSubcommand: [
        "run", "exec", "test", "start", "stop", "restart", "ci", "install", "i", "add",
        "remove", "rm", "uninstall", "publish", "pack", "link", "update", "upgrade", "init",
        "create", "prune", "dedupe", "rebuild", "build", "prepare", "postinstall",
      ],
    },
    // npx/corepack：接受包名并执行它（§14.3-B 明列 risky）
    { id: "risky:npx", programs: ["npx", "corepack"] },
    // 文件写入/创建/权限/挂载：开发里**正当**写盘操作，程序名可见
    {
      id: "risky:fs-write",
      programs: [
        "touch", "mkdir", "md", "cp", "copy", "mv", "move", "rename", "ren", "ln", "link", "mklink",
        "install", "tee", "patch", "chmod", "chown", "chgrp", "attrib", "icacls", "takeown", "cacls",
        "setfacl", "mkfifo", "mknod", "mount", "umount", "sync",
      ],
    },
    // git 的「危险 flag」写开关：`--output`/`--output=<file>` 会把结果写盘（§7.10「危险 flag」）。
    // 2026-11-08（W3-G/v4）：裸 Git 已在分类器第 2 步终结（只读白名单 allow / 其余硬拒），本规则在
    // 默认规则集下**不可达**——保留为数据纵深（若未来有人把 Git 分支挪到 risky 之后，写形态仍按 risky
    // 交 (b)+(a)，而不是静默 review）；它不是只读白名单的一部分，也不得被用作放行依据。
    { id: "risky:git-output-write", programs: ["git"], onlyWithFlag: ["--output"] },
    // git 的写子命令（同上：默认规则集下不可达的数据纵深，列出会改盘/改历史的子命令）
    {
      id: "risky:git-write",
      programs: ["git"],
      onlyWithSubcommand: [
        "commit", "push", "pull", "fetch", "clone", "checkout", "switch", "restore", "reset",
        "clean", "merge", "rebase", "cherry-pick", "revert", "am", "apply", "stash", "add",
        "rm", "mv", "tag", "branch", "config", "init", "gc", "filter-branch", "filter-repo",
        "submodule", "worktree", "update-index", "update-ref", "symbolic-ref", "notes",
        "replace", "prune", "repack", "remote", "sparse-checkout", "maintenance",
      ],
    },
  ];
}

/**
 * 危险 shell 记号（子串匹配）。`>` 覆盖 `>>`/`2>`；`&` 覆盖 `&&`/`&>`；`|` 覆盖 `||`/`|&`。
 *
 * ★ 本默认规则集的 `executionModel` 是 `"argv-noshell"`（`spawn(shell:false)`），**这些记号不生效**——
 *   它们是**待恢复**集合：一旦执行层改回原始命令串 / `shell:true`（把 `executionModel` 改为 `"shell-string"`
 *   或删字段），这些记号立即恢复拦截，否则 `> /path`、`$(...)`、`cmd | sh` 会被漏掉（§7.10 耦合）。
 */
function defaultDenyTokens(): string[] {
  return [">", "|", "&", ";", "$(", BACKTICK, "<<"];
}

/** 返回一份**全新**的默认规则集（无共享可变状态）。 */
export function defaultShellRules(): ShellRules {
  return {
    version: SHELL_RULES_VERSION,
    id: "ans-default-v4", // 规则集 id（审计 / §7.6 归属；装配方可取它，不必另传 rulesId）；v4 起删除死 readonly:git
    // 执行模型（§7.10）：本规则集按「程序 + argv」分类，绑定 `spawn(shell:false)`。
    // ★ 若执行层改回 shell 字符串 / shell:true，必须改为 "shell-string"（或删字段），否则元字符规则空转。
    executionModel: "argv-noshell",
    readOnly: defaultReadOnly(),
    hardDenyPrograms: defaultHardDeny(),
    riskyPrograms: defaultRisky(),
    denyTokens: defaultDenyTokens(),
  };
}

// —————————————————————— 不透明执行识别（2026-10-29，方案 v2.1 §6.4 / Q1 A） ——————————————————————
//
// 定义：命令可执行任意代码、写入目标无法从 argv 静态确定。此类命令在「替我审批」开启时**不得由
// 判断 agent 代批**，必须交给客户本人确认（shell 写目标守卫返回 `opaque` → `manualOnly`）。
// 本函数只识别，不改变 (c) 四态分类；`node -e`/`sh -c` 等仍由 hardDeny 终结。
//
// Q2 A（客户 2026-10-29 明确接受，高风险）：`node --test`、`npm test`、`npm install`/`npm ci` 等
// 常用测试/安装命令**按普通审批**（开关可代批）+ 执行后审计，不作 opaque；`npm run <脚本>` 一律 opaque。

const OPAQUE_INTERPRETERS = new Set([
  "node", "python", "python2", "python3", "perl", "ruby", "php", "lua", "rscript", "deno", "bun", "ts-node",
]);
const OPAQUE_BUILD_TOOLS = new Set([
  "make", "gmake", "ninja", "cmake", "gradle", "gradlew", "mvn", "mvnw", "msbuild", "dotnet",
  "cargo", "bazel", "bazelisk", "ant", "webpack", "rollup", "esbuild", "vite", "tsc", "gulp", "grunt",
  "go", "dd", "patch",
]);
/** Q2 A：测试/安装类子命令（普通审批，可被开关代批）+ 执行后审计。 */
const NPM_BUILTIN_SAFE = new Set(["test", "t", "tst", "install", "i", "ci", "it", "add"]);
/** 解释器里明确的只读/测试形态（不按脚本执行任意文件）。 */
const INTERPRETER_SAFE_FLAGS = new Set(["--version", "-v", "--test", "--test-only", "--check", "-h", "--help"]);

function firstNonOption(args: string[]): { value?: string; index: number } {
  for (let i = 0; i < args.length; i += 1) {
    const arg = stripQuotes(args[i]!.trim());
    if (arg.startsWith("-")) continue;
    return { value: arg, index: i };
  }
  return { index: -1 };
}

/**
 * 是否属于「不透明执行」类（无法静态界定写目标 → 强制客户本人审批）。
 * `argv[0]` 为程序名（可带路径），其余为参数；执行模型为 argv-noshell（无重定向/管道）。
 */
export function isOpaqueShellExecution(argv: readonly string[]): { opaque: boolean; reason?: string } {
  if (!Array.isArray(argv) || argv.length === 0) return { opaque: false };
  const program = programName(String(argv[0] ?? ""));
  if (program === "") return { opaque: false };
  const args = argv.slice(1).map((arg) => stripQuotes(String(arg).trim()));

  if (OPAQUE_INTERPRETERS.has(program)) {
    // 解释器：`-c/-e` 等内联已被 (c) 硬拒；这里把「执行脚本文件 / -m 模块」判 opaque。
    const inline = args.some((arg) => ["-e", "--eval", "-c", "-r", "--require", "-p", "--print", "-m"].includes(arg));
    const safeFlag = args.some((arg) => INTERPRETER_SAFE_FLAGS.has(arg));
    if (inline) return { opaque: true, reason: `${program} 内联/模块执行可运行任意代码，无法按写区校验` };
    if (safeFlag) return { opaque: false };
    const script = firstNonOption(args);
    if (script.value !== undefined) {
      return { opaque: true, reason: `${program} 执行脚本文件「${script.value}」可运行任意代码，无法按写区校验` };
    }
    return { opaque: false };
  }

  if (program === "npm" || program === "pnpm" || program === "yarn") {
    const sub = firstNonOption(args).value?.toLowerCase();
    if (sub === undefined) return { opaque: false };
    if (sub === "run" || sub === "run-script" || sub === "exec" || sub === "x" || sub === "dlx") {
      return { opaque: true, reason: `${program} ${sub} 可运行任意包脚本，无法按写区校验` };
    }
    if (NPM_BUILTIN_SAFE.has(sub)) return { opaque: false };
    // 其余子命令（如 start/自定义脚本）默认不透明（fail-closed）。
    return { opaque: true, reason: `${program} ${sub} 可能运行任意包脚本，无法按写区校验` };
  }
  if (program === "npx" || program === "corepack") {
    return { opaque: true, reason: `${program} 可下载并执行任意包/脚本，无法按写区校验` };
  }
  if (OPAQUE_BUILD_TOOLS.has(program)) {
    // 统一按不透明处理；`go version`/`dotnet --version` 等只读版本查询不进入（由 (c) 只读白名单直放）。
    if (args.some((arg) => arg === "--version" || arg === "-version" || arg === "version" || arg === "-v")) {
      return { opaque: false };
    }
    return { opaque: true, reason: `${program} 是构建/任务工具，可执行任意脚本或写任意产物，无法按写区校验` };
  }
  return { opaque: false };
}
