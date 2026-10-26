import {
  assessBoundaryChangeRequest,
  boundaryEntryCoversPath,
  boundaryEntryIsExact,
  boundaryChangeTicketId,
  buildBoundaryChangeCrewTaskText,
  buildBoundaryChangeJudgeRequest,
  normalizeBoundaryChangePath,
} from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/app/desktop/boundary-change.ts";

const show = (label, value) => console.log(label, JSON.stringify(value));
const boundary = {
  entries: [
    { root: "project", path: "src/executor/", kind: "directory", purpose: "实现目录" },
    { root: "project", path: "src/executor/legacy.ts", kind: "file", purpose: "旧入口" },
  ],
  boundarySource: "角色卡/executor/boundary.yaml",
  acceptance: { accepted: true, source: "probe" },
};

console.log("=== F1 wildcard / characters ===");
for (const p of ["src/*.ts", "src/?.ts", "src/[a].ts", "src/{a,b}.ts", "src/a*.ts", "src/a?.ts", "src/a[b].ts", "src/a{b}.ts"]) {
  show(`normalize ${p}`, normalizeBoundaryChangePath(p));
}
show("assess wildcard", assessBoundaryChangeRequest({ boundary, addPaths: ["src/*.ts"], rationale: "r" }));

console.log("=== F2 trailing slash ===");
for (const p of ["config/newdir", "config/newdir/", "config/newdir//", "config/newdir///", "config//x.ts", "./x", "../x", "x/.", "x/..", "x/", "/abs/", "C:/abs/"]) {
  show(`normalize ${p}`, normalizeBoundaryChangePath(p));
}
show("covers dir by directory entry x/", boundaryEntryCoversPath({ root: "project", path: "src/executor/", kind: "directory", purpose: "" }, "src/executor/"));
show("covers dir by file entry", boundaryEntryCoversPath({ root: "project", path: "src/executor", kind: "file", purpose: "" }, "src/executor/"));
show("exact x vs x/", boundaryEntryIsExact({ root: "project", path: "src/executor/", kind: "directory", purpose: "" }, "src/executor"));
show("assess add dir", assessBoundaryChangeRequest({ boundary, addPaths: ["config/newdir/"], rationale: "r" }));
show("assess add dir covered", assessBoundaryChangeRequest({ boundary, addPaths: ["src/executor/"], rationale: "r" }));
show("assess dedupe x & x/", assessBoundaryChangeRequest({ boundary, addPaths: ["config/newdir", "config/newdir/"], rationale: "r" }));
show("assess dedupe x/ & x", assessBoundaryChangeRequest({ boundary, addPaths: ["config/newdir/", "config/newdir"], rationale: "r" }));
show("assess overlap x add / x/ remove", assessBoundaryChangeRequest({ boundary, addPaths: ["config/newdir"], removePaths: ["config/newdir/"], rationale: "r" }));
show("assess remove x/ exact dir", assessBoundaryChangeRequest({ boundary, removePaths: ["src/executor/"], rationale: "r" }));
show("assess remove file with slash", assessBoundaryChangeRequest({ boundary, removePaths: ["src/executor/legacy.ts/"], rationale: "r" }));

console.log("=== F3 governance paths (add & remove) ===");
for (const p of ["docs/scheduling/x.md", "docs/acceptance/x.md", "docs/contracts/x.md", "docs/governance/x.md", "bin/ans.js", ".github/workflows/ci.yml", "electron-builder.yml", "electron-builder.yaml"]) {
  const add = assessBoundaryChangeRequest({ boundary, addPaths: [p], rationale: "r" });
  const remove = assessBoundaryChangeRequest({ boundary, removePaths: [p], rationale: "r" });
  show(`add ${p}`, { ok: add.ok, code: add.ok ? "ok" : add.code });
  show(`remove ${p}`, { ok: remove.ok, code: remove.ok ? "ok" : remove.code });
}

console.log("=== task/preview directory semantics ===");
const task = buildBoundaryChangeCrewTaskText({
  ticketId: "bnd-test",
  roleId: "executor",
  flowId: "flow-x",
  addPaths: ["config/newdir/"],
  removePaths: ["src/executor/legacy.ts"],
  rationale: "需要整个配置目录",
});
show("task has dir marker", task.includes("config/newdir/（目录条目）"));
show("task has file path plain", task.includes("- src/executor/legacy.ts\n") || task.includes("- src/executor/legacy.ts"));
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
show("preview has dir marker", preview.includes("config/newdir/（目录条目）"));
show("ticket id differs file vs dir", {
  file: boundaryChangeTicketId({ roleId: "executor", addPaths: ["config/newdir"], removePaths: [], rationale: "r" }),
  dir: boundaryChangeTicketId({ roleId: "executor", addPaths: ["config/newdir/"], removePaths: [], rationale: "r" }),
});
