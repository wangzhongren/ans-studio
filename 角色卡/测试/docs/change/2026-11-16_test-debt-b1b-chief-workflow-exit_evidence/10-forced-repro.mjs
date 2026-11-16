// B1b forced-equivalent repro: prove that a throwing desktop.disposeProjectDocuments()
// (Git host coordinator busy with an in-flight dispatch lease) skips the fixture server
// close and keeps the process alive; the fixed order closes the server and exits.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const base = "file:///C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/fix-test-debt-b1b/";
const { createDesktopInterface } = await import(base + "app/desktop/interface.ts");
const { beginGitHostAction, endGitHostAction, inspectGitHostCoordinator } = await import(base + "src/pipeline/orchestration/trunk-runtime.ts");

const mode = process.argv[2] ?? "leak";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-b1b-forced-"));
const server = createServer((_request, response) => { response.writeHead(200, { "content-type": "application/json" }); response.end("{}"); });
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const address = server.address();
const desktop = createDesktopInterface({
  pickDirectory: async () => root, emitEvent() {},
  envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json"),
  runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "B1B_FORCED_KEY", modelId: "forced-local" },
});
await desktop.pickProject();
await desktop.listProject({ projectRoot: root });
const coordinatorRoot = process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
const lease = beginGitHostAction({ projectRoot: coordinatorRoot, kind: "dispatch" });
const leaseState = { ok: lease.ok, ...(lease.ok ? {} : { code: lease.code }) };
let disposeThrew;
try { desktop.disposeProjectDocuments(); } catch (error) { disposeThrew = String(error); }
console.log("B1B_FORCED_STATE " + JSON.stringify({ mode, root, coordinatorRoot, lease: leaseState,
  disposeThrew, activeAction: inspectGitHostCoordinator({ projectRoot: root }).activeAction, serverListening: server.listening }));

if (mode === "fixed") {
  // 修复后的清理口径：server 关闭是独立且有保证的步骤，lease 结束后 dispose 重试成功。
  try { server.closeAllConnections(); } catch { /* no-op */ }
  if (server.listening) await new Promise(resolve => server.close(() => resolve()));
  if (lease.ok) endGitHostAction({ projectRoot: coordinatorRoot, leaseId: lease.leaseId });
  try { desktop.disposeProjectDocuments(); console.log("B1B_FORCED_DISPOSE_AFTER_LEASE ok"); } catch (error) { console.log("B1B_FORCED_DISPOSE_AFTER_LEASE threw " + String(error)); }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  console.log("B1B_FORCED_DONE resources=" + JSON.stringify(process.getActiveResourcesInfo()));
} else {
  console.log("B1B_FORCED_LEAKING resources=" + JSON.stringify(process.getActiveResourcesInfo()));
}
