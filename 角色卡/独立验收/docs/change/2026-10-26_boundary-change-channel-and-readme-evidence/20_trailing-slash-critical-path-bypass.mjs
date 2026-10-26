import { assessBoundaryChangeRequest, boundaryChangePathIsGovernanceCritical, boundaryEntryCoversPath, normalizeBoundaryChangePath } from "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/app/desktop/boundary-change.ts";

const boundary = { entries: [], boundarySource: "test", acceptance: { accepted: true, source: "probe" } };
for (const p of ["package.json", "package.json/", "package-lock.json/", "tsconfig.node.json/", "vite.config.ts/", "electron-builder.yml/", ".env/", ".env.local/", "index.html/", "release/", "docs/flows/"]) {
  const normalized = normalizeBoundaryChangePath(p);
  const critical = normalized === undefined ? undefined : boundaryChangePathIsGovernanceCritical(normalized);
  const assessment = normalized === undefined ? undefined : assessBoundaryChangeRequest({ boundary, addPaths: [normalized], rationale: "r" });
  console.log(p, JSON.stringify({ normalized, critical, assessment: assessment === undefined ? undefined : (assessment.ok ? { ok: true, effectiveAdds: assessment.effectiveAdds } : { ok: false, code: assessment.code }) }));
}
console.log("impact: directory entry package.json/ covers file package.json =",
  boundaryEntryCoversPath({ root: "project", path: "package.json/", kind: "directory", purpose: "bypass" }, "package.json"));
