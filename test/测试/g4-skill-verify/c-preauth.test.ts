// test/测试/g4-skill-verify/c-preauth.test.ts —— G-4 独立验证 C 域：**su 预授权（docs/skills）**。
//
// 对抗性独立构造：**经 `openRoleSession` 真实装配**捕获 gate（与 implementer 的 governCommand/CLI
// 入口不同的路径：会话式入口），自建项目夹具（创世态 su / 普通项目角色 X），直接对 gate 做矩阵探测：
// ① docs/skills 与 docs/mcp 树内免确认直写（含子路径/绝对路径）；
// ② 树外仍 F4 拒 → 经确认发行后才放行（被拒在确认之前，逐条确认语义未变）；
// ③ 前缀负例（docs/skills2 / docs/skill）与 `..` 归一穿越不在预授权内；
// ④ docs/mcp 已并入预授权（V2 第四棵——旧「未预授权」断言已翻转，含零新增确认与 docs/mcp2 前缀负例）；
// ⑤ 非 su 角色不变（docs/mcp 同样不扩散）；⑥ 重建后仍有效。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";
import type { CustomerInputRequest, RuntimeAdapter, WriteGate } from "../../../src/model/runtime.ts";
import { makeTempProject } from "./fixture.ts";

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

/** 桩适配器：捕获 gate 与能力面；bindRole 返回最小假会话（本用例不跑轮次）。 */
function captureAdapter(sink: Captured): (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter {
  return (gate, capabilities) => {
    sink.gate = gate;
    sink.caps = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        return {
          async prompt(): Promise<void> {},
          events() {
            return (async function* () {})();
          },
          async dispose(): Promise<void> {},
        };
      },
    };
  };
}

/** 创世态项目（su 的治理种子边界：角色卡/、docs/、.ans/）——沿 resolveBoundarySection 第 3 步实况。 */
function genesisProject(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    builtInRoles: ["su"],
    genesisBootstrap: { source: "G-4 独立验证：客户导入空项目" },
  };
}

/** 普通项目：角色 X 自己的边界（src/X.ts）＋已接受证据（非创世）。 */
function projectWithRole(root: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "G-4 独立验证夹具" } },
  };
}

test("su 预授权矩阵：docs/skills 与 docs/mcp 树内免确认直写；树外/前缀负例/穿越注释拒绝", async () => {
  const { root } = await makeTempProject();
  const asked: CustomerInputRequest[] = [];
  const switchable = async (req: CustomerInputRequest) => {
    asked.push(req);
    return { outcome: "answered" as const, value: { confirmed: true } };
  };
  try {
    const sink: Captured = {};
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(root), customerInput: switchable },
      { createAdapter: captureAdapter(sink) },
    );
    const gate = sink.gate!;
    assert.ok(gate, "su 会话应捕获 gate");

    // ① 树内直写（相对/子路径/绝对）——全程零确认请求。
    for (const p of [
      "docs/skills/t1/SKILL.md",
      "docs/skills/t1/install.md",
      "docs/skills/a/b/深层.md",
      path.join(root, "docs", "skills", "t1", "SKILL.md"),
      "docs/mcp/t1.md",
      "docs/mcp/a/b/嵌套.md",
      path.join(root, "docs", "mcp", "t1.md"),
    ]) {
      const d = gate(p);
      assert.equal(d.allowed, true, `预授权树内应放行：${p}`);
    }
    assert.equal(asked.length, 0, "预授权直写不触确认通道（零卡）");

    // ② 树外：确认前 F4 拒；经确认（preview 列路径）发行后放行——逐条确认语义未变。
    const before = gate("docs/其他.md");
    assert.equal(before.allowed, false, "树外未确认仍拒");
    const capsInput = sink.caps?.customerInput;
    assert.ok(capsInput, "su 会话应拿到（包装后的）客户通道");
    await capsInput({ kind: "confirm", title: "写 docs/其他.md", preview: "docs/其他.md" }, { turnId: "T-1" });
    assert.equal(asked.length, 1, "树外写盘走确认通道（恰好一次）");
    assert.equal(gate("docs/其他.md").allowed, true, "经确认发行后放行");
    assert.equal(gate("角色卡/Y/role-card.md").allowed, false, "同一确认不含的其它路径仍拒（精确集合）");

    // ③ 前缀负例与穿越归一。
    assert.equal(gate("docs/skills2/t1/SKILL.md").allowed, false, "docs/skills2 不被 docs/skills 前缀覆盖（段比较）");
    assert.equal(gate("docs/skill/x.md").allowed, false, "docs/skill 不被覆盖");
    assert.equal(gate("docs/skills/../su2/x.md").allowed, false, "「..」归一逃出其外 ⇒ 拒");
    assert.equal(gate("docs/skills/../skills/合法.md").allowed, true, "「..」归一回到树内 ⇒ 按归一后判放行");

    // ④ docs/mcp 已并入预授权（G-4 V2 裁定：第四棵）——树内直写零新增确认；前缀负例同技能口径。
    assert.equal(gate("docs/mcp/any.md").allowed, true, "docs/mcp 已预授权（四棵之内）——免确认直写");
    assert.equal(gate("docs/mcp2/any.md").allowed, false, "docs/mcp2 不被 docs/mcp 前缀覆盖（段比较）");
    assert.equal(asked.length, 1, "docs/mcp 直写不触确认通道（零新增卡——与 ② 的恰一次合计）");

    await handle.dispose();

    // ⑥ 重建（dispose+重开，同 W4/O-1 口径）后仍有效。
    const sink2: Captured = {};
    const handle2 = await openRoleSession(
      { roleId: "su", project: genesisProject(root), customerInput: switchable },
      { createAdapter: captureAdapter(sink2) },
    );
    assert.equal(sink2.gate!("docs/skills/t2/SKILL.md").allowed, true, "重建后预授权仍生效（新会话同口径）");
    assert.equal(sink2.gate!("docs/mcp/t2.md").allowed, true, "重建后 MCP 预授权同样仍生效");
    assert.equal(asked.length, 1, "重建后直写仍零新增确认");
    await handle2.dispose();
  } finally {
    // cleanup
    const fs = await import("node:fs");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("非 su 角色不变：项目角色写自己的边界可以、写 docs/skills 被拒（预授权不扩散）", async () => {
  const { root } = await makeTempProject();
  try {
    const sink: Captured = {};
    const handle = await openRoleSession(
      { roleId: "X", project: projectWithRole(root) },
      { createAdapter: captureAdapter(sink) },
    );
    const gate = sink.gate!;
    // 无 customerInput ⇒ 静态 scope undefined（不收窄到「客户确认才发行」）——按角色边界直判。
    assert.equal(gate("src/X.ts").allowed, true, "项目角色写自己的边界条目照常放行");
    assert.equal(gate("docs/skills/t9/SKILL.md").allowed, false, "docs/skills 不在 X 的边界内 ⇒ 拒（预授权只属 su）");
    assert.equal(gate("docs/mcp/t9.md").allowed, false, "docs/mcp 同样不属 X（预授权只属 su，四棵均不扩散）");
    assert.equal(gate("docs/su/memo.md").allowed, false, "docs/su 同样不属 X");
    await handle.dispose();
  } finally {
    const fs = await import("node:fs");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
