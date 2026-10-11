// Pi适配器单测夹具。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。

import type { ResolvedRole } from "../../src/model/role.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

/** 构造一个简单的 gate：目标在允许集合内则允许，否则拒绝并给出按根分组的路径。 */
export function makeGate(allowed: { skill: string[]; project: string[] }): (p: string) => WriteDecision {
  return (targetPath: string): WriteDecision => {
    if (allowed.project.includes(targetPath)) {
      return { allowed: true, matchedEntry: { root: "project", path: targetPath, kind: "file", purpose: "fixture" } };
    }
    if (allowed.skill.includes(targetPath)) {
      return { allowed: true, matchedEntry: { root: "skill", path: targetPath, kind: "file", purpose: "fixture" } };
    }
    return { allowed: false, reason: `目标路径不在允许写集内：${targetPath}`, allowedByRoot: allowed };
  };
}

/** 构造一个最小可用的 ResolvedRole。 */
export function makeRole(): ResolvedRole {
  return {
    id: "Pi适配器",
    kind: "project",
    cardText: "# Pi 适配器角色\n负责把 Pi 的 TypeScript SDK 包成 ANS CLI 的运行时适配器。",
    boundary: {
      entries: [],
      boundarySource: "角色卡/Pi适配器/boundary.md",
      acceptance: { accepted: true, source: "demo:fixture" },
    },
    boundarySource: "角色卡/Pi适配器/boundary.md",
    location: {
      card: "角色卡/Pi适配器/role-card.md",
      boundary: "角色卡/Pi适配器/boundary.md",
    },
  };
}
