#!/usr/bin/env node
// D2 evidence helper (test role): compact ledger event summary from ledger-snapshot.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(fs.readFileSync(path.join(HERE, "probe-run-2", "ledger-snapshot.json"), "utf8"));
console.log(`ledger exists: ${snapshot.exists}`);
console.log(`ledger bytes: ${snapshot.bytes}`);
console.log(`events: ${snapshot.events.length}`);
for (const event of snapshot.events) {
  if (event.kind === "directive.created") {
    const resource = event.action?.resource;
    console.log(
      [
        `seq=${event.seq}`,
        `kind=${event.kind}`,
        `id=${event.id}`,
        `target=${event.target}`,
        `until=${event.until}`,
        `action=${event.action?.kind}${event.action?.selector ? ":" + event.action.selector : ""}`,
        `scope=${JSON.stringify(event.scope)}`,
        `resource=${resource ? resource.type + ":" + resource.command : "-"}`,
        `highRisk=${event.highRisk ? JSON.stringify(event.highRisk.reasons) + ",ack=" + event.highRisk.acknowledged : "-"}`,
        `sessionId=${event.sessionId}`,
        `createdBy=${event.createdBy}`,
      ].join("\t"),
    );
  } else {
    console.log([`seq=${event.seq}`, `kind=${event.kind}`, `id=${event.id}`, `by=${event.by}`].join("\t"));
  }
}
