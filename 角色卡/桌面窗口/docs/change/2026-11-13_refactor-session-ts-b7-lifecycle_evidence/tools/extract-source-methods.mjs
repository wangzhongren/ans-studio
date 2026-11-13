// B7 取证：从 git show HEAD:app/desktop/session.ts（e37da80）提取 47 方法原文与行范围。
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(HERE, "../../../../../.."));
const text = execSync("git show HEAD:app/desktop/session.ts", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, "\n");
const lines = text.split("\n");
const lineStarts = []; { let o = 0; for (const l of lines) { lineStarts.push(o); o += l.length + 1; } }
const lineOf = (off) => { let n = 0; for (let i = 0; i < lineStarts.length; i += 1) { if (lineStarts[i] <= off) n = i; else break; } return n; };
const NAMES = ["openObservedRoleSession","ownsControllerDisposal","disposeObservedHandle","observeWatchdog","noteWatchdogActivity","profileRevision","profileChanged","hasBusyRuntime","hasStaleProfile","liveSessionViews","listBackgroundTasks","readBackgroundTask","stopBackgroundTask","healStaleOrigin","beginDeliveryOrigin","captureDeliveryOrigin","sendDelivery","sendFacts","trimDeliveryOrigins","failDeliveryOrigin","activeEntry","disposeEntry","evictBeyondLimit","isPrimarySession","open","openBackground","sendBackground","isRoleBusy","hasLiveSession","wasLastTurnAborted","hasPendingDelivery","waitForRoleSettle","waitForRoleIdle","openInternal","openInternalUnsafe","consume","send","abort","stop","isOpen","openForRoleId","liveRoleIds","findLiveRuntime","ensureFreshRoleSession","rebuildSession","rebuildSessionUnsafe","isCustomerInitiatedTurn"];
function matchBrace(src, open) {
  const stack = [{ kind: "code", expr: false, depth: 0 }];
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i], next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top.kind === "template") {
      if (ch === "\\") { i += 1; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && next === "{") { stack.push({ kind: "code", expr: true, depth: 0 }); i += 1; continue; }
      continue;
    }
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; i -= 1; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1; i += 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i += 1; while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 1; i += 1; } continue; }
    if (ch === "`") { stack.push({ kind: "template" }); continue; }
    if (ch === "{") { top.depth += 1; continue; }
    if (ch === "}") {
      if (top.expr && top.depth === 0) { stack.pop(); continue; }
      if (top.expr) { top.depth -= 1; continue; }
      top.depth -= 1;
      if (top.depth === 0) return i;
      continue;
    }
  }
  throw new Error("unbalanced");
}
const methods = [];
for (const name of NAMES) {
  const re = new RegExp(`^  (?:private |public |protected )?(?:async )?${name.replace(/\$/g, "\\$")}\\s*[<(]`);
  let startLine = -1;
  for (let i = 0; i < lines.length; i += 1) if (re.test(lines[i])) { startLine = i + 1; break; }
  if (startLine < 0) throw new Error("method not found in HEAD: " + name);
  const startOff = lineStarts[startLine - 1];
  let openOff = -1;
  for (let i = startOff; i < text.length; i += 1) {
    if (text[i] !== "{") continue;
    const close = matchBrace(text, i);
    if (lineOf(close) >= startLine - 1 && (openOff < 0 || i < openOff)) {
      // 取「其配对 close 之后是新声明或类尾」的第一个块不易判定；用方法体在原文中的已知 end：
      openOff = i; break;
    }
  }
  // 重新按 B6 口径：从声明行起首个「配对 close 所在行以 `  }` 收尾且下一个非空行是声明/注释/类尾」的 `{`
  let bodyOpen = -1, endLine = -1;
  if (lines[startLine - 1].trimEnd().endsWith("}") && lines[startLine - 1].includes("{")) { bodyOpen = startLine; endLine = startLine; }
  for (let i = startLine - 1; bodyOpen < 0 && i < Math.min(lines.length, startLine + 40); i += 1) {
    const t = lines[i].trimEnd();
    if (!t.endsWith("{")) continue;
    const braceOff = lineStarts[i] + t.lastIndexOf("{");
    const close = matchBrace(text, braceOff);
    const closeLine = lineOf(close) + 1;
    if (lines[closeLine - 1] === "  }") { bodyOpen = i + 1; endLine = closeLine; break; }
  }
  if (bodyOpen < 0) throw new Error("body not found in HEAD: " + name);
  const methodText = lines.slice(startLine - 1, endLine).join("\n") + "\n";
  methods.push({ name, startLine, endLine, bodyOpenLine: bodyOpen, text: methodText });
}
fs.writeFileSync(path.join(HERE, "methods-source.json"), JSON.stringify({ sourceOfTruth: "git show HEAD:app/desktop/session.ts (e37da80)", totalLines: lines.length, methods }, null, 2), "utf8");
console.log("source methods:", methods.length, "lines:", lines.length);
