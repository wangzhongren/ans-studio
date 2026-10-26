import {
  assessBoundaryChangeRequest,
  boundaryChangeClientMessageId,
  boundaryChangeTicketId,
  boundaryChangeTicketRelPath,
  buildBoundaryChangeCrewTaskText,
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

show("normalize ok", normalizeBoundaryChangePath("src/new/file.ts"));
show("normalize absolute", normalizeBoundaryChangePath("/etc/passwd"));
show("normalize drive", normalizeBoundaryChangePath("C:/abs.ts"));
show("normalize dotdot", normalizeBoundaryChangePath("a/../b.ts"));
show("normalize trailing slash", normalizeBoundaryChangePath("src/newdir/"));
show("normalize wildcard accepted?", normalizeBoundaryChangePath("src/*.ts"));

show("assess wildcard", assessBoundaryChangeRequest({ boundary, addPaths: ["src/*.ts"], rationale: "r" }));
show("assess trailing slash", assessBoundaryChangeRequest({ boundary, addPaths: ["src/newdir/"], rationale: "r" }));
show("assess governance .ans", assessBoundaryChangeRequest({ boundary, addPaths: [".ans/governance/ledger.jsonl"], rationale: "r" }));
show("assess remove covered file under dir", assessBoundaryChangeRequest({ boundary, removePaths: ["src/executor/legacy.ts"], rationale: "r" }));
show("assess remove child of dir", assessBoundaryChangeRequest({ boundary, removePaths: ["src/executor/sub.ts"], rationale: "r" }));
show("assess unchanged add", assessBoundaryChangeRequest({ boundary, addPaths: ["src/executor/inside.ts"], rationale: "r" }));
show("assess valid", assessBoundaryChangeRequest({ boundary, addPaths: ["config/site.ts"], removePaths: ["src/executor/legacy.ts"], rationale: "缺少写权" }));

const t1 = boundaryChangeTicketId({ roleId: "executor", addPaths: ["a.ts", "b.ts"], removePaths: ["c.ts"], rationale: " 理由 " });
const t2 = boundaryChangeTicketId({ roleId: "executor", addPaths: ["b.ts", "a.ts"], removePaths: ["c.ts"], rationale: "理由" });
show("ticket stable (order/trim)", { t1, t2, equal: t1 === t2 });

const text = buildBoundaryChangeCrewTaskText({
  ticketId: t1,
  roleId: "executor",
  flowId: "flow-x",
  addPaths: ["config/site.ts"],
  removePaths: ["src/executor/legacy.ts"],
  rationale: "缺少配置写权",
});
show("task has customer-approval phrase?", text.includes("客户批准"));
show("task has appointment-write?", text.includes("appointment-write"));
show("task has ticketId?", text.includes(t1));
show("ticket rel path", boundaryChangeTicketRelPath("flow-x", t1));
show("clientMessageId", boundaryChangeClientMessageId(t1));
