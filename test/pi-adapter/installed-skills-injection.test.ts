// G-4「已安装技能」注入节接线测试（Pi 侧三处拼装点）。
// 归属：Pi适配器角色测试目录。
//
// 口径（客户 2026-10-16 批准；编排侧接口说明 §五）：注入节文本的**渲染单一来源**＝
// `src/common/编排/installed-skills.ts::renderInstalledSkillsSection`；适配器侧只做一件事：
// **非空 ⇒ 整段拼接（逐字不改写）**、**空串 ⇒ 零渲染**（对照会话逐字无变化）。
// 本文件钉住三处拼装点：
//   ① 假适配器（createFakeRuntimeAdapter.projectRoot）；
//   ② 真实外壳 composeContext（createPiRuntimeAdapter）；
//   ③ 真实适配器实际会话（createRealPiRuntimeAdapter.bindRole → SDK resourceLoader 的 systemPrompt
//      经 SDK 会话 `systemPrompt` 面可见）——用 faux 模型在进程内跑，不发任何网络请求。
//
// 依赖隔离：本文件**不静态 import** Pi 包（③ 经测试内动态 import；未安装时该例跳过）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createFakeRuntimeAdapter, createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { createRealPiRuntimeAdapter } from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { renderInstalledSkillsSection } from "../../src/common/编排/installed-skills.ts";
import { makeGate, makeRole } from "./fixtures.ts";

const ROLE_ID = "Pi适配器";
/** 冻结文案在测试内独立重打（模块常量漂移必红）——只钉两行锚，余下全文以渲染器对照。 */
const FROZEN_HEADER = "## 本角色已安装技能（动手前先读，按序）";
const FROZEN_FOOTER = "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。";

const log = { stage() {}, trace() {}, traceEnabled: false };

async function temp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "pi-skills-injection-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 落盘一个命中本角色的技能（登记 + 内容）；返回 SKILL.md 当刻字节的 sha256（独立重算）。 */
async function installSkill(root: string, name: string, content: string): Promise<string> {
  const dir = join(root, "docs", "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "install.md"),
    [`# ${name}`, "", `- 用途：接线测试用技能`, `- 适用角色：${ROLE_ID}`, `- 状态：installed`, `- 安装日期：2026-10-16`, ""].join("\n"),
  );
  await writeFile(join(dir, "SKILL.md"), content);
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

/** 旧行为基线（拼接前）的系统提示——逐字在此重打，接线改动漂移必红。 */
function legacyPrompt(role = makeRole()): string {
  return [`# 角色：${role.id}`, "", role.cardText.trim(), "", `## 边界来源`, role.boundarySource].join("\n");
}

const fake = (projectRoot?: string) =>
  createFakeRuntimeAdapter({ gate: makeGate({ skill: [], project: [] }), ...(projectRoot !== undefined ? { projectRoot } : {}) });

// —————————————————————— ① 假适配器 ——————————————————————

test("假适配器：命中技能 ⇒ 整段拼接（前缀逐字＝旧提示；节文本逐字＝渲染器输出；digest 独立重算对得上）", async () => {
  await temp(async (dir) => {
    const digest = await installSkill(dir, "demo-skill", "# demo\n正文只读。\n");
    const { systemPrompt } = await fake(dir).composeContext(makeRole());
    const section = renderInstalledSkillsSection(dir, ROLE_ID);
    assert.notEqual(section, "", "前置：渲染器有输出");
    assert.equal(systemPrompt, `${legacyPrompt()}\n\n${section}`, "旧提示逐字保留 + 空行分隔 + 节文本逐字原样（未改写/未重排）");
    assert.ok(systemPrompt.startsWith(legacyPrompt()), "旧提示是逐字前缀，节只追加在末尾");
    assert.ok(systemPrompt.includes(FROZEN_HEADER));
    assert.ok(systemPrompt.endsWith(FROZEN_FOOTER), "节尾＝冻结尾句（无尾随换行）");
    assert.ok(systemPrompt.includes(`docs/skills/demo-skill/SKILL.md（用途：接线测试用技能；sha256:${digest}；安装于 2026-10-16）`));
    assert.equal(systemPrompt.split("## 本角色已安装技能").length, 2, "节只出现一次");
  });
});

test("假适配器：未给 projectRoot 或空技能树 ⇒ 逐字零渲染（等于旧提示）", async () => {
  assert.equal((await fake().composeContext(makeRole())).systemPrompt, legacyPrompt(), "缺省不注入");
  await temp(async (dir) => {
    assert.equal((await fake(dir).composeContext(makeRole())).systemPrompt, legacyPrompt(), "无 docs/skills ⇒ 零渲染");
    await mkdir(join(dir, "docs", "skills"), { recursive: true });
    assert.equal((await fake(dir).composeContext(makeRole())).systemPrompt, legacyPrompt(), "空目录 ⇒ 零渲染");
  });
});

test("假适配器：技能的适用角色不含本角色 ⇒ 零渲染（过滤判据在渲染器内，接线侧不做判定）", async () => {
  await temp(async (dir) => {
    const skillDir = join(dir, "docs", "skills", "other-role-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "install.md"), ["- 用途：别角色的技能", "- 适用角色：某别的角色", "- 状态：installed", "- 安装日期：2026-10-16", ""].join("\n"));
    await writeFile(join(skillDir, "SKILL.md"), "# other\n");
    assert.equal((await fake(dir).composeContext(makeRole())).systemPrompt, legacyPrompt(), "角色不命中 ⇒ 不注入");
  });
});

test("假适配器：坏件（登记缺失但好件同在）⇒ 好件照常注入、注入文本不被破坏", async () => {
  await temp(async (dir) => {
    await installSkill(dir, "good-skill", "# good\n");
    await mkdir(join(dir, "docs", "skills", "broken-skill"), { recursive: true }); // 无 install.md
    const { systemPrompt } = await fake(dir).composeContext(makeRole());
    assert.ok(systemPrompt.includes("good-skill"), "好件照常注入（坏件不拒会）");
    assert.ok(!systemPrompt.includes("broken-skill"), "坏件不出现");
  });
});

// —————————————————————— ② 真实外壳 composeContext ——————————————————————

test("真实外壳 composeContext：projectRoot 流入注入节（非空拼接、别角色零渲染）", async () => {
  const saved = process.env.P1_INSTALLED_SKILLS_CREDENTIAL;
  process.env.P1_INSTALLED_SKILLS_CREDENTIAL = "offline-placeholder";
  try {
    await temp(async (dir) => {
      await installSkill(dir, "shell-skill", "# shell\n");
      const facade = (root: string) =>
        createPiRuntimeAdapter({
          gate: makeGate({ skill: [], project: [] }),
          projectRoot: root,
          skillRoot: root,
          providerId: "p1-installed-skills",
          baseUrl: "https://p1.invalid/",
          modelId: "p1-model",
          contextWindow: 32768,
          apiKeyEnvVar: "P1_INSTALLED_SKILLS_CREDENTIAL",
        });
      const { systemPrompt } = await facade(dir).composeContext(makeRole());
      assert.ok(systemPrompt.startsWith(legacyPrompt() + "\n"), "旧提示逐字在前");
      assert.ok(systemPrompt.includes(FROZEN_HEADER), "节已拼入");
      assert.ok(systemPrompt.includes("docs/skills/shell-skill/SKILL.md"));
    });
  } finally {
    if (saved === undefined) delete process.env.P1_INSTALLED_SKILLS_CREDENTIAL;
    else process.env.P1_INSTALLED_SKILLS_CREDENTIAL = saved;
  }
});

// —————————————————————— ③ 真实适配器实际会话（faux 模型，进程内） ——————————————————————

async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
  let native: Awaited<ReturnType<typeof pi.createAgentSession>>["session"] | undefined;
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
    loadPi: async () => ({ ...pi, async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
      const result = await pi.createAgentSession(input); native = result.session; return result;
    } }),
  };
  return { ai, faux, dependencies, get native() { return native!; } };
}

test("真实适配器实际会话：注入节进入 SDK resourceLoader systemPrompt（非空逐字在、空目录零渲染）", async (t) => {
  let piInstalled = true;
  try { await import("@earendil-works/pi-coding-agent"); } catch { piInstalled = false; }
  if (!piInstalled) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }

  const config = resolvePiProviderConfig(
    { providerId: "p1-skills", baseUrl: "https://p1.invalid/", modelId: "p1-model", apiKeyEnvVar: "P1_SKILLS_FAKE", contextWindow: 32768 },
    { P1_SKILLS_FAKE: "offline-placeholder" },
  );
  const sdk = await engine();

  await temp(async (dir) => {
    const digest = await installSkill(dir, "session-skill", "# session\n");
    const session = await createRealPiRuntimeAdapter(
      { runtime: "pi", projectRoot: dir, skillRoot: dir, tools: [], interactionGate: createInteractionGate(), currentTurnId: () => "t", config, logger: log },
      sdk.dependencies,
    ).bindRole(makeRole());
    const prompt = sdk.native.systemPrompt;
    assert.ok(prompt.includes(FROZEN_HEADER), "节标题进入实际会话系统提示");
    assert.ok(prompt.includes(`sha256:${digest}`), "digest 为 SKILL.md 当刻字节（独立重算对得上）");
    assert.ok(prompt.includes(FROZEN_FOOTER));
    assert.ok(prompt.indexOf(FROZEN_HEADER) > prompt.indexOf("## 边界来源"), "节在边界来源之后（只追加、不改写原有段）");
    await session.dispose();
  });

  await temp(async (dir) => {
    const session = await createRealPiRuntimeAdapter(
      { runtime: "pi", projectRoot: dir, skillRoot: dir, tools: [], interactionGate: createInteractionGate(), currentTurnId: () => "t", config, logger: log },
      sdk.dependencies,
    ).bindRole(makeRole());
    assert.ok(!sdk.native.systemPrompt.includes(FROZEN_HEADER), "无技能 ⇒ 零渲染（对照逐字无变化）");
    await session.dispose();
  });
});
