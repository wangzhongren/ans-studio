// 一次性探针(测试角色):尝试一次真实模型轮次,核实"模型轮次未验证"是否属实。
import { createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
const gate = () => ({ allowed: false, reason: "p", allowedByRoot: { skill: [], project: [] } });
const adapter = createPiRuntimeAdapter({ gate, projectRoot: process.cwd(), skillRoot: process.cwd() });
const role = { id: "编排", kind: "project", cardText: "# 探针",
  boundary: { entries: [], boundarySource: "probe", acceptance: { accepted: true, source: "probe" } },
  boundarySource: "probe", location: { card: "x", boundary: "y" } };
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT_${ms}ms`)), ms));
try {
  const session = await adapter.bindRole(role);
  await Promise.race([session.prompt("用一个词回答:你好"), timeout(45000)]);
  let n = 0; for await (const _ of session.events()) { n++; if (n > 50) break; }
  console.log("MODEL_TURN: ok, events=", n);
  await session.dispose();
} catch (err) {
  console.log("MODEL_TURN: failed:", (err && err.message ? err.message : String(err)).slice(0, 300));
}
