// test/编排/governance-reaccept.test.ts
// 编排角色自测：**治理记录 pin 不符的重新接受**（B1+B2，2026-10-17）。
// 依据 PM 评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.2 / §5.5 / §六 / §八。
//
// 覆盖：
//   ① 预览：形状（两写路径/原顺序 pin/完整 digest）、blockers（缺失/不可读/坏 YAML/空 Section 1）、
//      零写入；`not-needed` / `no-record` / `invalid-record` / busy / invalid-request。
//   ② 写入：正常完成；`.ans` **只改 pin**（roles/source/未知字段/路径/顺序不变）；边界文件内容不变；
//      manifest 追加/保留/新建最小头部；完成后再预览 → not-needed。
//   ③ 守卫 G1–G8：仅 mismatch 可进入；两写路径硬编码；种子边界过门；digest 防竞态；缺失/不可读阻断；
//      内容解析预检；同项目互斥（与 establish 共用集合）；写入原子性与 write-failed 如实回执。
//
// 全部使用系统临时目录与假 `.ans`，用后清理；不碰真实项目、不调用真实模型。
// 命令：node --test "test/**/*.test.ts"（三层 glob；两层会静默漏测）

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE,
  previewGovernanceReacceptance,
  reacceptGovernancePins,
} from "../../src/common/编排/finalize.ts";
import { previewGovernanceReacceptance as previewFromPipeline } from "../../src/pipeline/orchestration/govern-session.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";

const GOV_REL = "角色卡/governance-boundary.yaml";
const ALPHA_REL = "角色卡/alpha/boundary.yaml";
const BETA_REL = "角色卡/beta/boundary.yaml";
const ANS_REL = ".ans/project.json";
const MANIFEST_REL = "docs/bootstrap-manifest.md";
const STALE = "0".repeat(64);

interface AnsPin {
  path: string;
  sha256: string;
}

interface AnsDocument {
  projectRoot: string;
  skillRoot: string;
  roles: Record<string, unknown>;
  governanceBoundary: {
    path: string;
    acceptance: { accepted: boolean; source: string; pin: AnsPin[] };
  };
  [key: string]: unknown;
}

async function withRoot<T>(fn: (ctx: { root: string; target: string }) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-governance-reaccept-"));
  try {
    return await fn({ root, target: join(root, "proj") });
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

function roleBoundaryYaml(id: string, relPath: string): string {
  return `role: ${id}\nentries:\n  - kind: file\n    path: ${relPath}\n    purpose: 测试条目\n`;
}

function governanceBoundaryYaml(): string {
  return [
    "role: 治理边界",
    "entries:",
    "  - kind: directory",
    "    path: 角色卡/",
    "    root: project",
    "    purpose: 治理目录",
    "",
  ].join("\n");
}

function writeAt(target: string, rel: string, content: string): void {
  const abs = join(target, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function shaOf(target: string, rel: string): string {
  return createHash("sha256").update(readFileSync(join(target, rel))).digest("hex");
}

/** 标准夹具：治理边界 + 两个角色边界；`.ans` 的 pin 与当刻内容一致（除指定 stale 项）。 */
function setupProject(target: string, stale: "none" | "alpha" = "alpha"): void {
  mkdirSync(target, { recursive: true });
  writeAt(target, "角色卡/alpha/role-card.md", "# alpha\n");
  writeAt(target, ALPHA_REL, roleBoundaryYaml("alpha", "src/alpha.ts"));
  writeAt(target, "角色卡/beta/role-card.md", "# beta\n");
  writeAt(target, BETA_REL, roleBoundaryYaml("beta", "src/beta.ts"));
  writeAt(target, GOV_REL, governanceBoundaryYaml());

  writeAns(target, {
    pins: [
      { path: GOV_REL, sha256: shaOf(target, GOV_REL) },
      { path: ALPHA_REL, sha256: stale === "alpha" ? STALE : shaOf(target, ALPHA_REL) },
      { path: BETA_REL, sha256: shaOf(target, BETA_REL) },
    ],
  });
}

function baseAnsDocument(target: string, pins: AnsPin[]): AnsDocument {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {
      alpha: {
        card: "角色卡/alpha/role-card.md",
        boundary: ALPHA_REL,
        // 未知嵌套字段也应原样保留
        note: "keep-me",
      },
      beta: { card: "角色卡/beta/role-card.md", boundary: BETA_REL },
    },
    governanceBoundary: {
      path: GOV_REL,
      acceptance: {
        accepted: true,
        source: "test:最初授权来源（不得改写）",
        pin: pins,
      },
    },
    customField: { keep: true, nested: ["a", "b"] },
  };
}

function writeAns(
  target: string,
  opts: {
    pins?: AnsPin[];
    accepted?: boolean;
    govPath?: string;
    source?: string;
    document?: AnsDocument;
  } = {},
): AnsDocument {
  const document =
    opts.document ??
    baseAnsDocument(target, opts.pins ?? []);
  if (opts.accepted !== undefined) document.governanceBoundary.acceptance.accepted = opts.accepted;
  if (opts.govPath !== undefined) document.governanceBoundary.path = opts.govPath;
  if (opts.source !== undefined) document.governanceBoundary.acceptance.source = opts.source;
  writeAt(target, ANS_REL, JSON.stringify(document, null, 2) + "\n");
  return document;
}

function readAns(target: string): AnsDocument {
  return JSON.parse(readFileSync(join(target, ANS_REL), "utf8")) as AnsDocument;
}

function assertZeroWrites(target: string, ansBefore: string): void {
  assert.equal(readFileSync(join(target, ANS_REL), "utf8"), ansBefore, ".ans 不得被改写");
  assert.equal(existsSync(join(target, MANIFEST_REL)), false, "不得写 manifest");
}

async function previewOk(target: string) {
  const result = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
  if (!result.ok) throw new Error(`preview failed: ${result.status} ${result.message}`);
  return result.preview;
}

// —————————————————————————————— 预览 ——————————————————————————————

test("preview：形状——两写路径、原顺序 pin、完整 digest；零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const preview = await previewOk(target);
    assert.equal(preview.projectRoot, target);
    assert.deepEqual(preview.writePaths, [ANS_REL, MANIFEST_REL], "G2：只写两个路径且顺序固定");
    assert.deepEqual(preview.pinPaths, [GOV_REL, ALPHA_REL, BETA_REL], "pin 原顺序、原路径");
    assert.equal(preview.pinCount, 3);
    assert.equal(preview.changed.length, 1);
    assert.deepEqual(preview.changed[0], {
      path: ALPHA_REL,
      pinned: STALE,
      actual: shaOf(target, ALPHA_REL),
      status: "modified",
    });
    assert.equal(preview.canConfirm, true);
    assert.deepEqual(preview.blockers, []);
    assert.match(preview.previewDigest, /^[0-9a-f]{64}$/);

    assertZeroWrites(target, before);
  });
});

test("preview：pin 目标缺失 → changed=missing + blocker，canConfirm=false；零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    unlinkSync(join(target, BETA_REL));
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const preview = await previewOk(target);
    assert.equal(preview.canConfirm, false);
    const missing = preview.changed.filter((f) => f.status === "missing");
    assert.deepEqual(missing.map((f) => f.path), [BETA_REL]);
    const blocker = preview.blockers.find((b) => b.code === "missing-file");
    assert.ok(blocker);
    assert.deepEqual(blocker.paths, [BETA_REL]);
    assert.match(blocker.message, /缺失/);

    assertZeroWrites(target, before);
  });
});

test("preview：pin 目标不可读 → unreadable blocker，canConfirm=false；零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    unlinkSync(join(target, BETA_REL));
    mkdirSync(join(target, BETA_REL));
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const preview = await previewOk(target);
    assert.equal(preview.canConfirm, false);
    assert.deepEqual(
      preview.changed.filter((f) => f.status === "unreadable").map((f) => f.path),
      [BETA_REL],
    );
    const blocker = preview.blockers.find((b) => b.code === "unreadable-file");
    assert.ok(blocker);
    assert.deepEqual(blocker.paths, [BETA_REL]);

    assertZeroWrites(target, before);
  });
});

test("preview：坏 YAML / Section 1 为空 → unparseable-boundary blocker；零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    writeAt(target, BETA_REL, "role: beta\nentries: [\n");
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const preview = await previewOk(target);
    assert.equal(preview.canConfirm, false);
    const blocker = preview.blockers.find((b) => b.code === "unparseable-boundary");
    assert.ok(blocker);
    assert.deepEqual(blocker.paths, [BETA_REL]);
    assertZeroWrites(target, before);
  });

  await withRoot(async ({ target }) => {
    setupProject(target);
    writeAt(target, BETA_REL, "role: beta\nentries: []\n");
    const preview = await previewOk(target);
    assert.equal(preview.canConfirm, false);
    const blocker = preview.blockers.find((b) => b.code === "unparseable-boundary");
    assert.ok(blocker);
    assert.deepEqual(blocker.paths, [BETA_REL], "YAML entries: [] 必须显式判空（不能只看 parseError）");
  });
});

test("preview：全部 pin 一致 → not-needed；无记录 → no-record；均零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target, "none");
    const preview = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
    assert.equal(preview.ok, false);
    if (!preview.ok) {
      assert.equal(preview.status, "not-needed");
      assert.match(preview.message, /无需重新接受/);
    }
  });

  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const preview = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
    assert.equal(preview.ok, false);
    if (!preview.ok) {
      assert.equal(preview.status, "no-record");
      assert.match(preview.message, /没有治理记录/);
    }
    assert.equal(existsSync(join(target, ".ans")), false);
  });
});

test("preview：invalid-record 各类形状（不可解析/未接受/路径空/pin 空/形状非法/未覆盖/路径逃逸）", async () => {
  type Case = {
    name: string;
    prepare: (target: string) => void;
  };
  const cases: Case[] = [
    { name: "不可解析", prepare: (t) => { mkdirSync(join(t, ".ans"), { recursive: true }); writeFileSync(join(t, ANS_REL), "{ not json", "utf8"); } },
    {
      name: "未接受",
      prepare: (t) => { setupProject(t); writeAns(t, { pins: [{ path: GOV_REL, sha256: shaOf(t, GOV_REL) }], accepted: false }); },
    },
    {
      name: "治理边界路径空",
      prepare: (t) => { setupProject(t); writeAns(t, { pins: [{ path: GOV_REL, sha256: shaOf(t, GOV_REL) }], govPath: "  " }); },
    },
    {
      name: "pin 空",
      prepare: (t) => { setupProject(t); writeAns(t, { pins: [] }); },
    },
    {
      name: "pin sha 非 64 hex",
      prepare: (t) => { setupProject(t); writeAns(t, { pins: [{ path: GOV_REL, sha256: "abc" }] }); },
    },
    {
      name: "治理边界未被覆盖",
      prepare: (t) => {
        setupProject(t);
        writeAns(t, {
          pins: [
            { path: ALPHA_REL, sha256: shaOf(t, ALPHA_REL) },
            { path: BETA_REL, sha256: shaOf(t, BETA_REL) },
          ],
        });
      },
    },
    {
      name: "pin 路径逃逸",
      prepare: (t) => {
        setupProject(t);
        writeAns(t, {
          pins: [
            { path: GOV_REL, sha256: shaOf(t, GOV_REL) },
            { path: "../outside.yaml", sha256: "0".repeat(64) },
          ],
        });
      },
    },
  ];

  for (const c of cases) {
    await withRoot(async ({ target }) => {
      c.prepare(target);
      const before = existsSync(join(target, ANS_REL)) ? readFileSync(join(target, ANS_REL), "utf8") : undefined;
      const preview = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
      assert.equal(preview.ok, false, c.name);
      if (!preview.ok) {
        assert.equal(preview.status, "invalid-record", `${c.name}：${preview.message}`);
        assert.match(preview.message, /本次未写入任何文件/);
      }
      if (before !== undefined) assert.equal(readFileSync(join(target, ANS_REL), "utf8"), before);
      assert.equal(existsSync(join(target, MANIFEST_REL)), false);
    });
  }
});

test("preview：invalid-request（projectRoot 缺失）；Pipeline 再导出为同一函数引用", async () => {
  const result = await previewGovernanceReacceptance({ projectRoot: "   " });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "invalid-request");

  assert.equal(previewFromPipeline, previewGovernanceReacceptance, "govern-session 只做薄再导出");
  assert.equal(GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE.includes("操作者点击确认"), true);
});

// —————————————————————————————— 写入 ——————————————————————————————

test("reaccept：正常完成——仅 .ans 与 manifest 变化；.ans 只改 pin（roles/source/未知字段/路径/顺序不变）", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const ansBefore = readAns(target);
    const boundaryHashesBefore = new Map(
      [GOV_REL, ALPHA_REL, BETA_REL].map((rel) => [rel, shaOf(target, rel)] as const),
    );
    const alphaNew = shaOf(target, ALPHA_REL);

    const preview = await previewOk(target);
    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.status, "completed");
    assert.equal(result.phase, "write");
    assert.deepEqual(result.wrote, [ANS_REL, MANIFEST_REL]);
    assert.deepEqual(result.pins?.map((p) => p.path), [GOV_REL, ALPHA_REL, BETA_REL]);
    assert.equal(result.pins?.[1].sha256, alphaNew);
    assert.equal(result.changed?.length, 1);

    const ansAfter = readAns(target);
    // 只改 pin；其余字段逐个保持。
    assert.deepEqual(ansAfter.roles, ansBefore.roles);
    assert.equal(ansAfter.governanceBoundary.acceptance.accepted, true);
    assert.equal(ansAfter.governanceBoundary.acceptance.source, "test:最初授权来源（不得改写）");
    assert.deepEqual(ansAfter.customField, { keep: true, nested: ["a", "b"] });
    assert.equal(ansAfter.projectRoot, ansBefore.projectRoot);
    assert.equal(ansAfter.skillRoot, ansBefore.skillRoot);

    const pinsAfter = ansAfter.governanceBoundary.acceptance.pin;
    assert.deepEqual(pinsAfter.map((p) => p.path), [GOV_REL, ALPHA_REL, BETA_REL], "路径与顺序完全不变");
    assert.equal(pinsAfter.length, 3, "条数不变");
    assert.deepEqual(
      pinsAfter.map((p) => p.sha256),
      [shaOf(target, GOV_REL), alphaNew, shaOf(target, BETA_REL)],
      "整表按当刻字节重算",
    );

    // 边界文件内容未被任何路径改写。
    for (const [rel, before] of boundaryHashesBefore) assert.equal(shaOf(target, rel), before, rel);

    // manifest：新节 + ISO 时间 + 变更数 + pin 总数 + 旧/新完整 64 位哈希。
    const manifest = readFileSync(join(target, MANIFEST_REL), "utf8");
    assert.match(manifest, /# Bootstrap 留痕（创世 finalize）/);
    assert.match(manifest, /此前的 manifest 不存在；以下为重新接受记录。/);
    assert.match(manifest, /## 重新接受记录（治理记录 pin 刷新）/);
    assert.match(
      manifest,
      new RegExp(`- \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z：操作者在桌面应用确认重新接受；变更 1 个边界文件（本次刷新 3 条 pin）`),
    );
    assert.ok(manifest.includes(`- ${ALPHA_REL}（旧 pin ${STALE} → 新 pin ${alphaNew}）`));
    assert.equal(manifest.includes("旧 pin " + "0".repeat(64) + " → 新 pin " + "0".repeat(64)), false);

    // 完成后共享载入器认作 pin-backed accepted，预览转为 not-needed。
    const loaded = await loadEffectiveConfig({
      projectRoot: target,
      skillRoot: target,
      fallback: { projectRoot: target, skillRoot: target, roles: {} },
    });
    assert.equal(loaded.source.kind, "ans");
    assert.equal(loaded.source.acceptance.accepted, true);
    assert.equal(loaded.source.downgradeReason, undefined);

    const again = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.status, "not-needed");
  });
});

test("reaccept：manifest 既有全文逐字节保留，记录追加在既有节末（下一个 ## 之前）", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const existing = [
      "# Bootstrap 留痕（创世 finalize）",
      "",
      "> 旧说明：pin 每轮 su settle 后自动刷新。",
      "",
      "## 重新接受记录（治理记录 pin 刷新）",
      "",
      "- 2026-01-01T00:00:00.000Z：一条旧记录",
      "",
      "## 其它节",
      "",
      "这一段必须保留。",
      "",
    ].join("\n");
    writeAt(target, MANIFEST_REL, existing);

    const preview = await previewOk(target);
    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.status, "completed", JSON.stringify(result));

    const manifest = readFileSync(join(target, MANIFEST_REL), "utf8");
    // 全部原有行原样保留。
    for (const line of existing.split("\n").filter((l) => l !== "")) {
      assert.ok(manifest.includes(line), `既有行丢失：${line}`);
    }
    const headingAt = manifest.indexOf("## 重新接受记录（治理记录 pin 刷新）");
    const oldAt = manifest.indexOf("- 2026-01-01T00:00:00.000Z：一条旧记录");
    const newAt = manifest.indexOf("：操作者在桌面应用确认重新接受；");
    const nextAt = manifest.indexOf("## 其它节");
    assert.ok(headingAt >= 0 && oldAt > headingAt, "旧记录保留在节内");
    assert.ok(newAt > oldAt, "新记录追加在节内旧记录之后");
    assert.ok(nextAt > newAt, "新记录追加在下一个 ## 之前");
    assert.ok(manifest.includes("这一段必须保留。"));
    assert.equal((manifest.match(/## 重新接受记录（治理记录 pin 刷新）/g) ?? []).length, 1);
  });
});

test("reaccept：manifest 无该节 → 文末新增；既有全文作为前缀原样保留", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const existing = "# Bootstrap 留痕（创世 finalize）\n\n旧内容，不得重排。\n";
    writeAt(target, MANIFEST_REL, existing);

    const preview = await previewOk(target);
    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.status, "completed", JSON.stringify(result));

    const manifest = readFileSync(join(target, MANIFEST_REL), "utf8");
    assert.ok(manifest.startsWith(existing), "既有全文必须是原样前缀");
    assert.match(manifest, /## 重新接受记录（治理记录 pin 刷新）/);
    assert.ok(manifest.indexOf("：操作者在桌面应用确认重新接受；") > manifest.indexOf("## 重新接受记录"));
  });
});

test("G1：仅 mismatch 可进入——一致 → not-needed/guard；无记录 → no-record/guard；均零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target, "none");
    const before = readFileSync(join(target, ANS_REL), "utf8");
    const preview = await previewOk(target).catch(() => undefined);
    assert.equal(preview, undefined, "一致的记录不应产生预览");

    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(result.status, "not-needed");
    assert.equal(result.phase, "guard");
    assert.deepEqual(result.wrote, []);
    assertZeroWrites(target, before);
  });

  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(result.status, "no-record");
    assert.equal(result.phase, "guard");
    assert.deepEqual(result.wrote, []);
    assert.equal(existsSync(join(target, ".ans")), false);
  });
});

test("G1：invalid-record 在写入侧同样零写入（不可解析/未接受/未覆盖）", async () => {
  const preparations: ((target: string) => void)[] = [
    (t) => { mkdirSync(join(t, ".ans"), { recursive: true }); writeFileSync(join(t, ANS_REL), "{ not json", "utf8"); },
    (t) => { setupProject(t); writeAns(t, { pins: [{ path: GOV_REL, sha256: shaOf(t, GOV_REL) }], accepted: false }); },
    (t) => {
      setupProject(t);
      writeAns(t, {
        pins: [
          { path: ALPHA_REL, sha256: shaOf(t, ALPHA_REL) },
          { path: BETA_REL, sha256: shaOf(t, BETA_REL) },
        ],
      });
    },
  ];

  for (const prepare of preparations) {
    await withRoot(async ({ target }) => {
      prepare(target);
      const before = readFileSync(join(target, ANS_REL), "utf8");
      const result = await reacceptGovernancePins({
        projectRoot: target,
        skillRoot: target,
        confirm: true,
        previewDigest: "a".repeat(64),
      });
      assert.equal(result.status, "invalid-record");
      assert.equal(result.phase, "guard");
      assert.deepEqual(result.wrote, []);
      assertZeroWrites(target, before);
    });
  }
});

test("G4：预览后文件再变 → preview-stale / precheck，零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);
    const before = readFileSync(join(target, ANS_REL), "utf8");

    // 预览后、确认前再修改一个被 pin 的边界文件（仍是合法 YAML）。
    writeAt(target, BETA_REL, roleBoundaryYaml("beta", "src/beta.ts") + "# 预览后的外部改动\n");

    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "preview-stale");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
    assert.match(result.message, /预览后边界文件又有变化/);
    assertZeroWrites(target, before);
  });
});

test("G5：写入侧缺失优先 → missing-file / precheck；不可读 → unreadable-file / precheck；均零写入", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);
    unlinkSync(join(target, BETA_REL));
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.status, "missing-file");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
    assert.match(result.message, /缺失/);
    assert.ok(result.message.includes(BETA_REL));
    assertZeroWrites(target, before);
  });

  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);
    unlinkSync(join(target, BETA_REL));
    mkdirSync(join(target, BETA_REL));
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.status, "unreadable-file");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
    assert.match(result.message, /不可读/);
    assert.ok(result.message.includes(BETA_REL));
    assertZeroWrites(target, before);
  });
});

test("G6：坏 YAML / entries: [] → unparseable-boundary / precheck；列出全部文件；零写入", async () => {
  for (const bad of ["role: beta\nentries: [\n", "role: beta\nentries: []\n"]) {
    await withRoot(async ({ target }) => {
      setupProject(target);
      // 先改坏文件，再取预览 digest（G4 必须通过），从而让 G6 成为拦截点。
      writeAt(target, BETA_REL, bad);
      const preview = await previewOk(target);
      assert.equal(preview.canConfirm, false);
      assert.ok(preview.blockers.some((b) => b.code === "unparseable-boundary"));
      const before = readFileSync(join(target, ANS_REL), "utf8");

      const result = await reacceptGovernancePins({
        projectRoot: target,
        skillRoot: target,
        confirm: true,
        previewDigest: preview.previewDigest,
      });
      assert.equal(result.status, "unparseable-boundary", `${bad} => ${result.message}`);
      assert.equal(result.phase, "precheck");
      assert.deepEqual(result.wrote, []);
      assert.ok(result.message.includes(BETA_REL), "必须点名文件");
      assertZeroWrites(target, before);
    });
  }
});

test("G3：两笔写仍经门禁前置（一次性种子边界放行）；G2 不接受调用方传入写路径", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);

    // 调用方多传的路径字段必须被忽略——机制只写硬编码的两项。
    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
      writePaths: ["src/evil.ts"],
    } as unknown as Parameters<typeof reacceptGovernancePins>[0]);

    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.deepEqual(result.wrote, [ANS_REL, MANIFEST_REL]);
    assert.equal(existsSync(join(target, "src/evil.ts")), false);
    assert.equal(existsSync(join(target, "src")), false);
  });
});

test("G7：同项目并发 → 第二次 busy/guard、零写入；首个正常完成（与 establish 共用集合）", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);
    const input = {
      projectRoot: target,
      skillRoot: target,
      confirm: true as const,
      previewDigest: preview.previewDigest,
    };

    const first = reacceptGovernancePins(input);
    const concurrentPreview = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
    assert.equal(concurrentPreview.ok, false);
    if (!concurrentPreview.ok) {
      assert.equal(concurrentPreview.status, "busy");
      assert.match(concurrentPreview.message, /仍在进行中/);
    }
    const second = await reacceptGovernancePins(input);
    assert.equal(second.status, "busy");
    assert.equal(second.phase, "guard");
    assert.deepEqual(second.wrote, []);

    const done = await first;
    assert.equal(done.status, "completed", JSON.stringify(done));
    assert.equal(existsSync(join(target, MANIFEST_REL)), true);
  });
});

test("G8：写入阶段失败 → write-failed / write，如实说明可能部分落盘；绝不出现「已恢复/已成功」", async () => {
  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);
    // `docs` 是文件 → manifest 写前 mkdir 失败（.ans 已先写）；manifest 读取按「不存在」处理（ENOTDIR）。
    writeFileSync(join(target, "docs"), "not a directory", "utf8");

    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "write-failed");
    assert.equal(result.phase, "write");
    assert.deepEqual(result.wrote, [ANS_REL, MANIFEST_REL], "两项均为已尝试写入");
    assert.match(result.message, /写入中断/);
    assert.match(result.message, /可能已写入部分文件/);
    assert.match(result.message, /不保证齐全/);
    assert.match(result.message, /请核对现场/);
    assert.equal(result.message.includes("未写入任何文件"), false);
    assert.equal(result.message.includes("已恢复"), false);
    assert.equal(result.message.includes("已成功"), false);

    // 如实：.ans 已落盘（pin 已刷新），manifest 未写出。
    const ans = readAns(target);
    assert.equal(ans.governanceBoundary.acceptance.pin[1].sha256, shaOf(target, ALPHA_REL));
    assert.equal(existsSync(join(target, MANIFEST_REL)), false);
  });
});

test("G8/AC17：manifest 存在但不可读 → blocked / precheck，零写入，message 点名 manifest", async () => {
  // 预览侧：manifest 是目录 → 不可读 → blocked。
  await withRoot(async ({ target }) => {
    setupProject(target);
    mkdirSync(join(target, MANIFEST_REL), { recursive: true });
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const preview = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
    assert.equal(preview.ok, false);
    if (!preview.ok) {
      assert.equal(preview.status, "blocked");
      assert.ok(preview.message.includes(MANIFEST_REL));
    }
    assert.equal(readFileSync(join(target, ANS_REL), "utf8"), before, ".ans 不得被改写");
  });

  // 写入侧：预览通过后再把 manifest 变成不可读目录（digest 只覆盖 pin，故 G4 仍通过），
  // 由 manifest 可读性在 precheck 拦截。
  await withRoot(async ({ target }) => {
    setupProject(target);
    const preview = await previewOk(target);
    mkdirSync(join(target, MANIFEST_REL), { recursive: true });
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const result = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: true,
      previewDigest: preview.previewDigest,
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.phase, "precheck");
    assert.deepEqual(result.wrote, []);
    assert.ok(result.message.includes(MANIFEST_REL));
    assert.equal(readFileSync(join(target, ANS_REL), "utf8"), before, ".ans 不得被改写");
  });
});

test("invalid-request：confirm 非 true / previewDigest 形状非法 / projectRoot 缺失，均 guard 零写入", async () => {
  const missingRoot = await reacceptGovernancePins({
    projectRoot: "  ",
    confirm: true,
    previewDigest: "a".repeat(64),
  });
  assert.equal(missingRoot.status, "invalid-request");
  assert.equal(missingRoot.phase, "guard");

  await withRoot(async ({ target }) => {
    setupProject(target);
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const noConfirm = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      confirm: false,
      previewDigest: "a".repeat(64),
    } as unknown as Parameters<typeof reacceptGovernancePins>[0]);
    assert.equal(noConfirm.status, "invalid-request");
    assert.equal(noConfirm.phase, "guard");

    for (const bad of ["", "xyz", "a".repeat(63), "a".repeat(65)]) {
      const result = await reacceptGovernancePins({
        projectRoot: target,
        skillRoot: target,
        confirm: true,
        previewDigest: bad,
      });
      assert.equal(result.status, "invalid-request", `digest=${bad}`);
      assert.equal(result.phase, "guard");
      assert.deepEqual(result.wrote, []);
    }
    assertZeroWrites(target, before);
  });
});
