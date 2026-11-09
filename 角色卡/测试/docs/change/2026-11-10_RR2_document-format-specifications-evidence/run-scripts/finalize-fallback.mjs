// RR2 fallback evidence finalization (used only if the driver is stopped externally; app may still be running).
import fs from "node:fs";
import path from "node:path";

const RUN = "C:\\Users\\51054\\Desktop\\work\\ans-doc-format-run-2026-11-10\\round2";
const EVID = path.join(RUN, "evidence");
const TARGET = path.join(RUN, "target");
const USERDATA = path.join(RUN, "userData");
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const cp = (src, dst) => { try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch (e) { console.error("cp", src, e.message); } };
cp(path.join(TARGET, ".ans/state/tasks.jsonl"), path.join(EVID, "tasks-final.jsonl"));
cp(path.join(TARGET, ".ans/state/versions.jsonl"), path.join(EVID, "versions-final.jsonl"));
const diagDir = path.join(USERDATA, "ans", "diagnostics");
if (exists(diagDir)) { const d = path.join(EVID, "diagnostics"); fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(diagDir)) cp(path.join(diagDir, f), path.join(d, f)); }
const sessionsDir = path.join(TARGET, ".ans/sessions");
if (exists(sessionsDir)) { try { fs.rmSync(path.join(EVID, "sessions"), { recursive: true, force: true }); fs.cpSync(sessionsDir, path.join(EVID, "sessions"), { recursive: true }); } catch (e) { console.error("sessions", e); } }
const intent = path.join(TARGET, "docs/product/jinyong-rogue-2d-intent-v4.md");
if (exists(intent)) { fs.mkdirSync(path.join(EVID, "product"), { recursive: true }); cp(intent, path.join(EVID, "product", path.basename(intent))); }
console.log("fallback evidence copy done");
