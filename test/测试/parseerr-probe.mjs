import { runRole } from "../../src/pipeline/orchestration/run-role.ts";
const project = { projectRoot: process.cwd(), skillRoot: process.cwd(),
  roles: { 编排: { card: "README.md", boundary: "角色卡/编排/不存在的边界.yaml" } },
  governanceBoundary: { path: "角色卡/编排/不存在的边界.yaml", acceptance: { accepted: true, source: "t" } } };
const r = await runRole({ roleId: "编排", taskId: "T-1", project, scope: { writeSet: [], conditions: [] } },
  { createAdapter: () => ({ composeContext: async () => ({ systemPrompt: "" }), bindRole: async () => ({ prompt: async () => {}, events: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ value: undefined, done: true }) }) }), dispose: async () => {} }) }) });
console.log("code=", r.code);
