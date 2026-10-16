// test/测试/g4-skill-verify/g-splicing.test.ts —— G-4 独立验证 G 域：**注入节拼接 ×3（Claude/Codex/Pi）＋假适配器**。
//
// 对抗性独立构造：自建 role/root/skill 夹具与**独立重打**的节文本（头/尾/行格式），
// 对四路 composeContext 做「零技能 = 基线；有技能 = 基线＋恰一段」差分口径核对，
// digest 由测试独立复算；空 projectRoot/坏件 ⇒ 逐字零渲染且不拒开会话。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { createFakeRuntimeAdapter, createPiRuntimeAdapter } from "../../../src/provider/pi/session.ts";
import { createClaudeRuntimeAdapter } from "../../../src/provider/claude/session.ts";
import { createCodexRuntimeAdapter } from "../../../src/provider/codex/session.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import type { InteractionGate, WriteGate } from "../../../src/model/runtime.ts";

const ROLE_ID = "G4验证角色";
const HEADER = "## 本角色已安装技能（动手前先读，按序）";
const FOOTER = "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。";

/** 最小交互门（本用例无等待）。 */
const gate = (): InteractionGate => {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  return {
    begin() { waiting += 1; },
    end() { waiting = Math.max(0, waiting - 1); for (const l of listeners) l(waiting > 0); },
    isWaiting: () => waiting > 0,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
};

const role = (id = ROLE_ID): ResolvedRole => ({
  id,
  kind: "project",
  cardText: `# 角色：${id}（G-4 拼接复验）`,
  boundary: { entries: [], boundarySource: "verify-fixture", acceptance: { accepted: true, source: "verify" } },
  boundarySource: "verify-fixture",
  location: { card: "fixture", boundary: "fixture" },
});

const allowGate: WriteGate = (target) => ({ allowed: true, matchedEntry: { kind: "file", root: "project", path: target, purpose: "verify" } });

function temp(run: (root: string) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g4-splice-"));
  return run(root).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

/** 落盘一个命中角色的技能；返回当刻字节 sha256（独立复算）。 */
function putSkill(root: string, name: string, roles = ROLE_ID, content = `# ${name}\n正文\n`): string {
  const dir = path.join(root, "docs", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "install.md"), [`# 安装登记：${name}`, `- 用途：${name} 用途`, `- 适用角色：${roles}`, "- 状态：installed", "- 安装日期：2026-10-16", ""].join("\n"));
  const bytes = Buffer.from(content, "utf8");
  fs.writeFileSync(path.join(dir, "SKILL.md"), bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

/** 独立重打的期望节（不 import 渲染器——漂移必红）。 */
const section = (entries: string[]) => [HEADER, ...entries, FOOTER].join("\n");
const line = (n: number, name: string, purpose: string, digest: string) => `${n}. docs/skills/${name}/SKILL.md（用途：${purpose}；sha256:${digest}；安装于 2026-10-16）`;

interface Path {
  name: string;
  bare: (root: string) => Promise<string>;
  withRoot: (root: string) => Promise<string>;
}

function makePaths(): Path[] {
  return [
    {
      name: "Pi 假适配器",
      bare: async (root) => (await createFakeRuntimeAdapter({ gate: allowGate, projectRoot: root }).composeContext(role())).systemPrompt,
      withRoot: async (root) => (await createFakeRuntimeAdapter({ gate: allowGate, projectRoot: root }).composeContext(role())).systemPrompt,
    },
    {
      name: "Pi 真实外壳",
      bare: async (root) => {
        process.env.G4_VERIFY_PI_KEY = "offline-placeholder";
        try {
          return (await createPiRuntimeAdapter({ gate: allowGate, projectRoot: root, skillRoot: root, providerId: "g4-verify", baseUrl: "https://g4.invalid/", modelId: "g4-model", contextWindow: 32768, apiKeyEnvVar: "G4_VERIFY_PI_KEY" }).composeContext(role())).systemPrompt;
        } finally {
          delete process.env.G4_VERIFY_PI_KEY;
        }
      },
      withRoot: async (root) => {
        process.env.G4_VERIFY_PI_KEY = "offline-placeholder";
        try {
          return (await createPiRuntimeAdapter({ gate: allowGate, projectRoot: root, skillRoot: root, providerId: "g4-verify", baseUrl: "https://g4.invalid/", modelId: "g4-model", contextWindow: 32768, apiKeyEnvVar: "G4_VERIFY_PI_KEY" }).composeContext(role())).systemPrompt;
        } finally {
          delete process.env.G4_VERIFY_PI_KEY;
        }
      },
    },
    {
      name: "Claude 适配器",
      bare: async (root) => (await createClaudeRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, tools: [], interactionGate: gate(), currentTurnId: () => undefined }).composeContext(role())).systemPrompt,
      withRoot: async (root) => (await createClaudeRuntimeAdapter({ runtime: "claude", projectRoot: root, skillRoot: root, tools: [], interactionGate: gate(), currentTurnId: () => undefined }).composeContext(role())).systemPrompt,
    },
    {
      name: "Codex 适配器",
      bare: async (root) => (await createCodexRuntimeAdapter({ runtime: "codex", projectRoot: root, skillRoot: root, tools: [], interactionGate: gate(), currentTurnId: () => "g4-verify", modelId: "g4-model", env: { CODEX_API_KEY: "offline-placeholder", PATH: process.env.PATH } }).composeContext(role())).systemPrompt,
      withRoot: async (root) => (await createCodexRuntimeAdapter({ runtime: "codex", projectRoot: root, skillRoot: root, tools: [], interactionGate: gate(), currentTurnId: () => "g4-verify", modelId: "g4-model", env: { CODEX_API_KEY: "offline-placeholder", PATH: process.env.PATH } }).composeContext(role())).systemPrompt,
    },
  ];
}

test("拼接 ×3＋假适配器：零技能＝基线（无节）；有技能＝基线＋恰一段（独立重打对照、digest 独立复算、只追加不改写）", async () => {
  for (const p of makePaths()) {
    await temp(async (root) => {
      const bare = await p.bare(root);
      assert.equal(bare.includes(HEADER), false, `${p.name}：零技能 ⇒ 零渲染`);
      const digest = putSkill(root, "splice-a", ROLE_ID, "拼接正文\n");
      const withSkill = await p.withRoot(root);
      const expected = section([line(1, "splice-a", "splice-a 用途", digest)]);
      assert.equal(withSkill, `${bare}\n\n${expected}`, `${p.name}：恰为「基线＋一段」且段文本逐字（含独立复算 digest）`);
      assert.equal(withSkill.split(HEADER).length, 2, `${p.name}：节标题恰出现一次`);
    });
  }
});

test("多技能/排序/坏件：命中两条按 name 排序编号；坏件（缺 SKILL.md/解析失败）跳过且不拒会话", async () => {
  for (const p of makePaths().slice(0, 2)) {
    // Pi 两路做全矩阵（假适配器可安全跑会话；真实外壳只 composeContext）。
    await temp(async (root) => {
      const d1 = putSkill(root, "zeta", ROLE_ID, "z\n");
      const d2 = putSkill(root, "alpha", ROLE_ID, "a\n");
      fs.mkdirSync(path.join(root, "docs", "skills", "broken"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs", "skills", "broken", "install.md"), "# 缺字段\n");
      const withSkills = await p.withRoot(root);
      assert.ok(withSkills.endsWith(section([line(1, "alpha", "alpha 用途", d2), line(2, "zeta", "zeta 用途", d1)])), `${p.name}：多技能按 name 排序编号`);
      assert.equal(withSkills.includes("broken"), false, `${p.name}：坏件不出现`);
      assert.ok(withSkills.includes("alpha") && withSkills.includes("zeta"));
    });
  }
  // 假适配器（Pi 假路径）真实开一场会话：坏件在场也不拒会（轮次照常 settled）。
  await temp(async (root) => {
    fs.mkdirSync(path.join(root, "docs", "skills", "broken"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "skills", "broken", "install.md"), "# 缺字段\n");
    const session = await createFakeRuntimeAdapter({ gate: allowGate, projectRoot: root, script: [] }).bindRole(role());
    await session.prompt("坏件在场的一轮");
    let settled = false;
    for await (const ev of session.events()) if (ev.kind === "settled") { settled = true; break; }
    assert.equal(settled, true, "坏件在场 ⇒ 会话照常开启与收尾（技能是资料不是判定链）");
    await session.dispose();
  });
});

test("空/别角色：空 projectRoot（假适配器缺省）⇒ 零渲染；技能只列别角色 ⇒ 该角色零渲染", async () => {
  await temp(async (root) => {
    putSkill(root, "other", "别的角色");
    const none = await createFakeRuntimeAdapter({ gate: allowGate }).composeContext(role());
    assert.equal(none.systemPrompt.includes(HEADER), false, "未给 projectRoot ⇒ 零渲染");
    const filtered = await createFakeRuntimeAdapter({ gate: allowGate, projectRoot: root }).composeContext(role());
    assert.equal(filtered.systemPrompt.includes(HEADER), false, "别角色的技能 ⇒ 本角色零渲染（过滤在渲染器内）");
  });
});
