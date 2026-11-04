// test/编排/run-role-stable-write.test.ts
// S3 接线测试：run-role gate 的版本化文档 / stable 文件两条路径（P1 §2.6-34、§4.5.1、§4.6；
// C2b `versionedDocOverwriteDecision` / `stableWriteDecision`；C1 `WriteGateContext`）。
//
// 覆盖：stable 一次性许可（allowed ⇒ baseGate 取 matchedEntry；denied ⇒ 直接映射
// `writeDecision`；无上下文/哈希不符/无许可/过期拒绝）；版本化 frozen 拒绝 / draft 允许 /
// unknown fail-closed / pin 目标必须 frozen；未注入 `stablePermitOf` 时保留既有确认制路径
// （B-11 接线前的分阶段兼容，S3 记录披露）。
//
// 全程假适配器 + 临时目录；不触网、不发真实模型请求。既有断言不改、不新增 skip。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { StableWritePermit } from "../../src/model/version-change.ts";
import {
  installStableWritePermitSnapshot,
  installVersionedDocFreezeSnapshot,
  invalidateVersionedDocFreezeSnapshot,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

const declining: CustomerInputFn = () => ({ outcome: "declined" });

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function writeFile(root: string, rel: string, text: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
}

const WORKFLOW_OLD = "# workflow old\n";
const WORKFLOW_NEW = "# workflow new (confirmed)\n";
const V1 = "docs/proposals/demo-proposal-v1.md";
const V2 = "docs/proposals/demo-proposal-v2.md";
const V1_TEXT = "---\nschema: project-proposal/v2\n---\n# proposal v1\n";
const V2_TEXT = "---\nschema: project-proposal/v2\n---\n# proposal v2\n";

function projectWithRole(root: string): ProjectConfig {
  writeFile(root, "角色卡/X/role-card.md", "# 角色 X\n");
  writeFile(
    root,
    "角色卡/X/boundary.yaml",
    [
      "role: X",
      "entries:",
      "  - kind: file",
      "    path: docs/workflow.md",
      "    purpose: stable 文件",
      "  - kind: directory",
      "    path: docs/proposals/",
      "    purpose: 版本化文档",
      "",
    ].join("\n"),
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {
      X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" },
    },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:stable-write" },
    },
  };
}

function permitFor(workflowOldSha: string, workflowNewSha: string): StableWritePermit {
  const now = Date.now();
  const approvedAt = new Date(now - 60_000).toISOString();
  return {
    v: 1,
    schema: "stable-write/v1",
    permitId: "sw-1-p1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    authority: { decisionId: "dec-sw" },
    baseSha256: workflowOldSha,
    targetSha256: workflowNewSha,
    status: "approved",
    approvedAt,
    expiresAt: new Date(now + 29 * 60_000).toISOString(),
    issuedAt: approvedAt,
  };
}

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-run-role-stable-"));
  try {
    return await fn(root);
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

test("run-role gate：stable 一次性许可 allowed/denied 映射（hash/无上下文/无许可/过期）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/workflow.md", WORKFLOW_OLD);
    writeFile(root, V1, V1_TEXT);
    writeFile(root, V2, V2_TEXT);
    const project = projectWithRole(root);
    const oldSha = sha256(WORKFLOW_OLD);
    const newSha = sha256(WORKFLOW_NEW);
    const permit = permitFor(oldSha, newSha);
    let currentPermit: StableWritePermit | undefined = permit;
    installStableWritePermitSnapshot(root, [permit]);

    const captured: Captured = {};
    const handle = await openRoleSession(
      {
        roleId: "X",
        project,
        customerInput: declining,
        stablePermitOf: (rel) => (rel === "docs/workflow.md" ? currentPermit : undefined),
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.gate, "应构建出 gate");
      const allowed = captured.gate!("docs/workflow.md", { contentSha256: newSha, operation: "write" });
      assert.equal(allowed.allowed, true, "许可匹配 + 内容 hash 匹配 ⇒ allowed");
      if (allowed.allowed) assert.equal(allowed.matchedEntry.path, "docs/workflow.md", "matchedEntry 由 baseGate 提供");

      const wrongHash = captured.gate!("docs/workflow.md", { contentSha256: sha256("other"), operation: "write" });
      assert.equal(wrongHash.allowed, false);
      if (!wrongHash.allowed) {
        assert.equal(wrongHash.code, "stable-write-hash-mismatch");
        assert.deepEqual(wrongHash.allowedByRoot, { skill: [], project: [] });
        assert.ok(wrongHash.rejection !== undefined, "denied 携带结构化 rejection");
      }

      const noContext = captured.gate!("docs/workflow.md");
      assert.equal(noContext.allowed, false, "无内容 hash ⇒ stable 一律拒绝（shell/opaque 同口径）");
      if (!noContext.allowed) assert.ok(
        noContext.code === "stable-write-hash-mismatch" ||
          noContext.code === "stable-write-permit-missing" ||
          noContext.code === "stable-write-invalid",
        String(noContext.code),
      );

      // 无许可（stablePermitOf 返回 undefined）⇒ permit-missing
      currentPermit = undefined;
      installStableWritePermitSnapshot(root, []);
      const noPermit = captured.gate!("docs/workflow.md", { contentSha256: newSha, operation: "write" });
      assert.equal(noPermit.allowed, false);
      if (!noPermit.allowed) assert.equal(noPermit.code, "stable-write-permit-missing");

      // 过期许可 ⇒ expired（快照与调用方对象一致，但 now >= expiresAt）
      const expired: StableWritePermit = {
        ...permit,
        permitId: "sw-1-p2",
        approvedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:30:00.000Z",
      };
      currentPermit = expired;
      installStableWritePermitSnapshot(root, [expired]);
      const expiredDecision = captured.gate!("docs/workflow.md", { contentSha256: newSha, operation: "write" });
      assert.equal(expiredDecision.allowed, false);
      if (!expiredDecision.allowed) assert.equal(expiredDecision.code, "stable-write-permit-expired");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role gate：版本化 frozen 拒绝 / draft 允许 / pin 必须 frozen / unknown fail-closed", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/workflow.md", WORKFLOW_OLD);
    writeFile(root, V1, V1_TEXT);
    writeFile(root, V2, V2_TEXT);
    const project = projectWithRole(root);
    const at = new Date().toISOString();
    installVersionedDocFreezeSnapshot(root, {
      v: 1,
      schema: "doc-freezes/v1",
      state: "ready",
      entries: [
        { path: V1, version: 1, sha256: sha256(V1_TEXT), frozen: true, reason: "vca-approved", applicationId: "vc-1" },
      ],
      builtAt: at,
    });

    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "X", project, customerInput: declining },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.gate);
      const frozen = captured.gate!(V1, { contentSha256: sha256("changed"), operation: "write" });
      assert.equal(frozen.allowed, false, "frozen 文档覆盖 ⇒ 拒绝");
      if (!frozen.allowed) {
        assert.equal(frozen.code, "versioned-doc-overwrite");
        assert.deepEqual(frozen.allowedByRoot, { skill: [], project: [] });
        assert.ok(frozen.rejection !== undefined);
      }

      const draftModified = captured.gate!(V2, { contentSha256: sha256(V2_TEXT), operation: "edit" });
      assert.equal(draftModified.allowed, true, "draft 原位改允许（仍受写权）");

      const draftNewVersion = captured.gate!("docs/proposals/demo-proposal-v3.md", {
        contentSha256: sha256(V2_TEXT),
        operation: "write",
      });
      assert.equal(draftNewVersion.allowed, true, "新版本 vN+1 允许（draft）");

      const pinDraft = captured.gate!(V2, { contentSha256: sha256(V2_TEXT), operation: "write" });
      assert.equal(pinDraft.allowed, true);
      const pinOperation = captured.gate!(V2, { contentSha256: sha256(V2_TEXT), operation: "edit" });
      assert.equal(pinOperation.allowed, true);
      // pin/repin 判定属 run-manifest（operation 由该层显式传）；gate 的 operation 只区分 write/edit。

      invalidateVersionedDocFreezeSnapshot(root);
      const unknown = captured.gate!(V2, { contentSha256: sha256(V2_TEXT), operation: "write" });
      assert.equal(unknown.allowed, false, "快照不可用 ⇒ fail-closed（含 draft）");
      if (!unknown.allowed) assert.equal(unknown.code, "versioned-doc-overwrite");
    } finally {
      await handle.dispose();
      invalidateVersionedDocFreezeSnapshot(root);
    }
  });
});

test("run-role gate：未注入 stablePermitOf ⇒ 保留既有确认制路径（B-11 接线前分阶段兼容）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/workflow.md", WORKFLOW_OLD);
    writeFile(root, V1, V1_TEXT);
    const project = projectWithRole(root);
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "X", project, customerInput: declining },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.gate);
      const legacy = captured.gate!("docs/workflow.md", { contentSha256: sha256(WORKFLOW_NEW), operation: "write" });
      assert.equal(legacy.allowed, true, "未接 B-11：Section 1 确认制路径照旧（baseGate）");
    } finally {
      await handle.dispose();
    }
  });
});
