import type { ResolvedRole } from "../../src/model/role.ts";
import type { WriteGate } from "../../src/model/runtime.ts";
export function role(id = "core"): ResolvedRole {
  return { id, kind: "project", cardText: `# ${id}`, boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
}
export const allow: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" } });
export const deny: WriteGate = () => ({ allowed: false, reason: "fixture denied", allowedByRoot: { project: [], skill: [] } });
export async function until(predicate: () => boolean): Promise<void> {
  const end = Date.now() + 1500;
  while (!predicate()) { if (Date.now() > end) throw new Error("fixture wait timed out"); await new Promise<void>((resolve) => setTimeout(resolve, 2)); }
}

/** Actual required-v1 protocol for controlled providers; no production bypass. */
export function registerControlledDisplayProfile(options: import('../../src/model/runtime.ts').RuntimeProviderOptions): void {
  if(options.toolDisplayMode!=='required-v1'||typeof options.projectToolEvent!=='function'||typeof options.registerToolDisplayProfile!=='function')throw new Error('controlled provider missing actual display contract');
  options.registerToolDisplayProfile({credentials:[]});
}
