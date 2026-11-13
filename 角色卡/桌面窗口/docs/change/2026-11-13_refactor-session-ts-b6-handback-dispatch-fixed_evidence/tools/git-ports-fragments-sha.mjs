import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, "../../../../../.."));
const OUT = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed_evidence";
const head = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const srcLines = head.split(/\r?\n/);
const target = fs.readFileSync("app/desktop/session/git-ports.ts", "utf8");
const facade = fs.readFileSync("app/desktop/session.ts", "utf8");
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const dedent = (t) => t.split("\n").map((l) => l.replace(/^\s+/, "")).join("\n").trim();

function lines(start, end) { return srcLines.slice(start - 1, end).join("\n"); }

const fragments = [];

// A. currentGitRuntime 闭包 → createTurnGitRuntime 返回的 async 箭头。
{
  const source = lines(2070, 2087);
  const targetStart = target.split("\n").findIndex((l) => l.trim() === "return async () => {");
  const tLines = target.split("\n");
  let end = targetStart;
  while (!(tLines[end].trim() === "};" && tLines[end].startsWith("  };"))) end += 1;
  const targetText = tLines.slice(targetStart, end + 1).join("\n");
  const norm = (t) => dedent(t)
    .replace(/^const currentGitRuntime = /, "")
    .replace(/^return /, "")
    .replace(/this\.sessions/g, "ctx.sessions")
    .replace(/\.get\(key\)/g, ".get(ctx.key)")
    .replace(/(?<!ctx\.)gitBinding/g, "ctx.gitBinding")
    .replace(/this\.deliveryIsStopped\(key\)/g, "ctx.deliveryIsStopped(ctx.key)")
    .replace(/req\.projectRoot/g, "ctx.projectRoot")
    .replace(/req\.roleId/g, "ctx.roleId")
    .replace(/this\.runTaskIsFenced/g, "ctx.runTaskIsFenced");
  const a = norm(source), b = norm(targetText);
  fragments.push({
    name: "turn-git-runtime-closure",
    sourceRange: "session.ts:2070-2087",
    target: "session/git-ports.ts createTurnGitRuntime() returned async arrow",
    adaptations: [
      "receiver: this.sessions -> ctx.sessions; .get(key) -> .get(ctx.key); gitBinding -> ctx.gitBinding; this.deliveryIsStopped(key) -> ctx.deliveryIsStopped(ctx.key); req.projectRoot/req.roleId -> ctx.projectRoot/ctx.roleId; this.runTaskIsFenced -> ctx.runTaskIsFenced (original closure free variables passed verbatim at the call site)",
      "indentation/declaration wrapper only (const currentGitRuntime = / return)",
    ],
    sourceSha256: sha(source), targetSha256: sha(targetText),
    sourceNormalizedSha256: sha(a), targetNormalizedSha256: sha(b),
    identicalUnderDocumentedAdaptations: a === b,
  });
}

// B. gitContextFailure 对象字面量。
{
  const source = lines(2088, 2089);
  const t = target;
  const objStart = t.indexOf("{ operationId, repoId: \"unavailable\",");
  const objEnd = t.indexOf("}", objStart) + 1;
  const targetText = t.slice(objStart, objEnd + 1); // include trailing ';'? no—object only
  const norm = (s) => dedent(s).replace(/^\(/, "").replace(/^\{/, "{").replace(/\)?;?$/, "");
  const sObj = source.slice(source.indexOf("({ operationId") + 1);
  const a = norm(sObj), b = norm(targetText);
  fragments.push({
    name: "git-context-failure",
    sourceRange: "session.ts:2088-2089",
    target: "session/git-ports.ts gitContextFailure()",
    adaptations: ["expression wrapper only (const arrow => declaration + return); object literal fields/values verbatim"],
    sourceSha256: sha(source), targetSha256: sha(targetText),
    sourceNormalizedSha256: sha(a), targetNormalizedSha256: sha(b),
    identicalUnderDocumentedAdaptations: a === b,
  });
}

// C. taskGit 注入对象。
{
  const source = lines(2709, 2709).trim();
  const t = target;
  const start = t.indexOf("return { classifyShellDetailed");
  const end = t.indexOf("}", start) + 1;
  const targetText = t.slice(start, end + 1);
  const norm = (s) => s.replace(/^return /, "").replace(/^\? /, "").replace(/^\{ taskGit: /, "").replace(/req\.projectRoot/g, "projectRoot").replace(/;$/, "").trim().replace(/\} \}$/, "}").trim();
  const a = norm(source), b = norm(targetText);
  fragments.push({
    name: "fixed-task-git-surface",
    sourceRange: "session.ts:2709 (taskGit injection value)",
    target: "session/git-ports.ts buildFixedTaskGitSurface() return value",
    adaptations: ["outer `taskGit:` key retained at the call site; req.projectRoot -> projectRoot (parameter, same value at call site); key order/values verbatim"],
    sourceSha256: sha(source), targetSha256: sha(targetText),
    sourceNormalizedSha256: sha(a), targetNormalizedSha256: sha(b),
    identicalUnderDocumentedAdaptations: a === b,
  });
}

// D. session-dispose lease/信号 单行片段（begin / interruption / end）。
{
  const checks = [
    ["session-dispose-begin", 569, /beginGitHostAction\(\{ projectRoot: root, kind: "session-dispose" \}\)/,
      /beginGitHostAction\(\{ projectRoot, kind: "session-dispose" \}\)/, (s) => s.replace(/projectRoot: root/, "projectRoot")],
    ["session-dispose-interruption", 570, /recordGitHostInterruption\(\{ projectRoot: root, reason: "session-dispose-during-host-action", coreSessionId: handle\.sessionId \}\)/,
      /recordGitHostInterruption\(\{ projectRoot, reason: "session-dispose-during-host-action", coreSessionId \}\)/, (s) => s.replace(/projectRoot: root/, "projectRoot").replace(/coreSessionId: handle\.sessionId/, "coreSessionId")],
    ["session-dispose-end", 577, /endGitHostAction\(\{ projectRoot: root, leaseId: lease\.leaseId \}\)/,
      /endGitHostAction\(\{ projectRoot, leaseId \}\)/, (s) => s.replace(/projectRoot: root/, "projectRoot").replace(/leaseId: lease\.leaseId/, "leaseId")],
  ];
  for (const [name, lineNo, sourceRe, targetRe, norm] of checks) {
    const sourceLine = srcLines[lineNo - 1];
    const sm = sourceRe.exec(sourceLine);
    const tm = targetRe.exec(target);
    if (!sm || !tm) throw new Error(`fragment not found: ${name}`);
    const a = norm(sm[0]), b = norm(tm[0]);
    fragments.push({
      name,
      sourceRange: `session.ts:${lineNo}`,
      target: "session/git-ports.ts wrapper body",
      adaptations: ["receiver wrapper: free variable root/handle/lease passed as parameters; argument values verbatim"],
      sourceSha256: sha(sm[0]), targetSha256: sha(tm[0]),
      sourceNormalizedSha256: sha(a), targetNormalizedSha256: sha(b),
      identicalUnderDocumentedAdaptations: a === b,
    });
  }
}

// 调用点证据：session.ts 使用导入片段（无第二份内联实现）。
const callSites = {
  createTurnGitRuntime: /const currentGitRuntime = createTurnGitRuntime\(\{/.test(facade),
  gitContextFailure: /gitContextFailure\(input\.operationId, current\)/.test(facade),
  buildFixedTaskGitSurface: /taskGit: buildFixedTaskGitSurface\(req\.projectRoot\)/.test(facade),
  beginSessionDisposeLease: /beginSessionDisposeLease\(root\)/.test(facade),
  noteSessionDisposeInterruption: /noteSessionDisposeInterruption\(root, handle\.sessionId\)/.test(facade),
  endSessionDisposeLease: /endSessionDisposeLease\(root, lease\.leaseId\)/.test(facade),
};

const summary = {
  generatedAt: new Date().toISOString(),
  sourceOfTruth: "git show HEAD:app/desktop/session.ts (b5901ac)",
  fragmentCount: fragments.length,
  allFragmentsIdenticalUnderDocumentedAdaptations: fragments.every((f) => f.identicalUnderDocumentedAdaptations),
  facadeCallSitesWired: callSites,
  allFacadeCallSitesWired: Object.values(callSites).every(Boolean),
  fragments,
};
fs.writeFileSync(`${OUT}/git-ports-fragments.json`, JSON.stringify(summary, null, 2), "utf8");
console.log(JSON.stringify({ fragmentCount: summary.fragmentCount, allOk: summary.allFragmentsIdenticalUnderDocumentedAdaptations, callSites }, null, 2));
