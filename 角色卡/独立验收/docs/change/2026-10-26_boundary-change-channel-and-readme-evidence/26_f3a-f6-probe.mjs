import {
  assessBoundaryChangeRequest,
  boundaryChangePathIsGovernanceCritical,
  boundaryChangeTicketId,
  buildBoundaryChangeCrewTaskText,
  buildBoundaryChangeJudgeRequest,
  normalizeBoundaryChangePath,
} from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/app/desktop/boundary-change.ts";

const boundary = {
  entries: [
    { root: "project", path: "src/executor/", kind: "directory", purpose: "实现目录" },
    { root: "project", path: "src/executor/legacy.ts", kind: "file", purpose: "旧入口" },
  ],
  boundarySource: "角色卡/executor/boundary.yaml",
  acceptance: { accepted: true, source: "probe" },
};
const show = (label, value) => console.log(label, JSON.stringify(value));

console.log("=== F3a electron-builder config ===");
for (const p of ["electron-builder.config.ts", "electron-builder.config.js", "electron-builder.config.mjs", "electron-builder.yml", "electron-builder.yaml"]) {
  const add = assessBoundaryChangeRequest({ boundary, addPaths: [p], rationale: "r" });
  const remove = assessBoundaryChangeRequest({ boundary, removePaths: [p], rationale: "r" });
  show(p, { critical: boundaryChangePathIsGovernanceCritical(p), add: add.ok ? "ok" : add.code, remove: remove.ok ? "ok" : remove.code });
}

console.log("=== F6 slash-sensitive (add & remove) ===");
for (const p of [
  "package.json/",
  "package-lock.json/",
  "tsconfig.node.json/",
  "vite.config.ts/",
  "electron-builder.yml/",
  ".env/",
  "index.html/",
  "docs/scheduling/",
  "docs/acceptance/",
  "docs/contracts/",
  "docs/governance/",
  "角色卡/executor/",
  ".ans/",
  "bin/",
  ".github/",
]) {
  const normalized = normalizeBoundaryChangePath(p);
  const add = normalized === undefined ? undefined : assessBoundaryChangeRequest({ boundary, addPaths: [normalized], rationale: "r" });
  const remove = normalized === undefined ? undefined : assessBoundaryChangeRequest({ boundary, removePaths: [normalized], rationale: "r" });
  show(p, { normalized, critical: normalized === undefined ? undefined : boundaryChangePathIsGovernanceCritical(normalized), add: add === undefined ? "normalize-null" : add.ok ? "ok" : add.code, remove: remove === undefined ? "normalize-null" : remove.ok ? "ok" : remove.code });
}

console.log("=== normal directory still usable ===");
const normal = assessBoundaryChangeRequest({ boundary, addPaths: ["config/newdir/"], rationale: "需要整个配置目录" });
show("assess config/newdir/", normal);
show("critical config/newdir/", boundaryChangePathIsGovernanceCritical("config/newdir/"));
const task = buildBoundaryChangeCrewTaskText({ ticketId: "bnd-test", roleId: "executor", flowId: "flow-x", addPaths: ["config/newdir/"], removePaths: [], rationale: "需要整个配置目录" });
show("task has config/newdir/（目录条目）", task.includes("config/newdir/（目录条目）"));
const judge = buildBoundaryChangeJudgeRequest({
  projectRoot: "/tmp/x",
  requesterRoleId: "convener",
  runtime: "pi",
  flowId: "flow-x",
  ticketId: "bnd-test",
  targetRole: { roleId: "executor", cardPath: "角色卡/executor/role-card.md", cardText: "# executor", boundarySource: "角色卡/executor/boundary.yaml", boundaryEntries: boundary.entries },
  addPaths: ["config/newdir/"],
  removePaths: [],
  effectiveAdds: ["config/newdir/"],
  effectiveRemoves: [],
  rationale: "需要整个配置目录",
  facts: { governanceModel: "trio", flowId: "flow-x", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
});
const preview = judge.card.kind === "choice" ? judge.card.preview ?? "" : "";
show("preview has config/newdir/（目录条目）", preview.includes("config/newdir/（目录条目）"));
show("ticketId stable", {
  a: boundaryChangeTicketId({ roleId: "executor", addPaths: ["config/newdir/"], removePaths: [], rationale: "r" }),
  b: boundaryChangeTicketId({ roleId: "executor", addPaths: ["config/newdir/"], removePaths: [], rationale: "r" }),
});
