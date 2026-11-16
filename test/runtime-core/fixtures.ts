import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { WriteGate } from "../../src/model/runtime.ts";
export function role(id = "core"): ResolvedRole {
  return { id, kind: "project", cardText: `# ${id}`, boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
}
export const allow: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" } });
export const deny: WriteGate = () => ({ allowed: false, reason: "fixture denied", allowedByRoot: { project: [], skill: [] } });
/** 有界等待：predicate 为真即返回，超时抛错如实红。默认 1500ms 保持不变（其余调用方行为逐字不变）；
 *  慢 runner 上「子进程先写盘再挂起」类场景由调用方显式放宽（见 shell-exec-timeout.test.ts 的 boundMs）。 */
export async function until(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) { if (Date.now() > end) throw new Error("fixture wait timed out"); await new Promise<void>((resolve) => setTimeout(resolve, 2)); }
}

/** K1（2026-11-16，KR-33）：中性项目根——`mkdtemp` 生成、无 `.git`。
 *  linked worktree 的 `.git` 是文件，产品按既有 fail-closed 口径判 `runtime-protection-scope-unknown`；
 *  测试夹具改用中性根后，断言与产品保护语义保持不变。调用方负责 `cleanup()`。 */
export async function neutralProjectRoot(prefix = "ans-runtime-core-neutral-"): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** Actual required-v1 protocol for controlled providers; no production bypass. */
export function registerControlledDisplayProfile(options: import('../../src/model/runtime.ts').RuntimeProviderOptions): void {
  if(options.toolDisplayMode!=='required-v1'||typeof options.projectToolEvent!=='function'||typeof options.registerToolDisplayProfile!=='function')throw new Error('controlled provider missing actual display contract');
  options.registerToolDisplayProfile({credentials:[]});
}
