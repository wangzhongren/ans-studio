// 一次性质探针(测试角色):确认 createPiRuntimeAdapter 经懒加载真正载入 Pi 包并建会话。
import { createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";

const gate = () => ({ allowed: false, reason: "probe", allowedByRoot: { skill: [], project: [] } });
const adapter = createPiRuntimeAdapter({ gate, projectRoot: process.cwd(), skillRoot: process.cwd() });

const role = {
  id: "编排", kind: "project", cardText: "# 探针",
  boundary: { entries: [], boundarySource: "probe", acceptance: { accepted: true, source: "probe" } },
  boundarySource: "probe", location: { card: "x", boundary: "y" },
};

try {
  const ctx = await adapter.composeContext(role);
  console.log("composeContext.ok:", typeof ctx.systemPrompt === "string");
  const session = await adapter.bindRole(role);
  console.log("bindRole.ok:", ["prompt", "events", "dispose"].every((k) => typeof session[k] === "function"));
  await session.dispose();
  console.log("dispose.ok: true");
  console.log("PI_PROBE_RESULT: passed");
} catch (err) {
  console.log("PI_PROBE_RESULT: failed:", err && err.message ? err.message : String(err));
  process.exitCode = 1;
}
