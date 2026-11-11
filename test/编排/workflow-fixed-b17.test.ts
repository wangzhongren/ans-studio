// test/编排/workflow-fixed-b17.test.ts
// T3「两条固定工作流路径」B17（2026-11-11，编排侧）：fixed A8 激活 hash 由应用计算并回填。
//
// RR12 失败事实：nominator 已按名单写出角色三文件，但 `activate_role_documents` v2 需要
// roster/三文档的 64-hex sha256；模型无法取得/计算应用侧 hash（任务文本也禁止猜 hash/用 shell），
// 导致 0/2 role.activated。B17 后模型只传 path，应用在激活前读取真实字节计算并覆盖四份 hash；
// 不可读 ⇒ activation-document-invalid fail-closed。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fillFixedActivationHashes } from "../../src/common/编排/workflow-service.ts";

const ROSTER = "---\nschema: project-roster/v4\nflowId: snake\nversion: 1\n---\n# roster\n";
const CARD = "# Role card\n";
const BOUNDARY_MD = "## Section 1\n- src/\n";
const BOUNDARY_YAML = "role: worker\nentries: []\n";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-fixed-b17-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
function sha(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}
function activationInput(root: string, overrides?: { roster?: string; card?: string; boundaryMd?: string; boundaryYaml?: string }) {
  return {
    projectRoot: root,
    input: {
      operationId: "op-b17-1",
      flowId: "snake",
      workflowId: "wf-b17-1",
      proposalDecisionId: "decision-b17",
      targetRoleId: "worker",
      roster: { path: overrides?.roster ?? "docs/proposals/snake-roster-v1.md" },
      documents: {
        card: { path: overrides?.card ?? "角色卡/worker/role-card.md" },
        boundaryMd: { path: overrides?.boundaryMd ?? "角色卡/worker/boundary.md" },
        boundaryYaml: { path: overrides?.boundaryYaml ?? "角色卡/worker/boundary.yaml" },
      },
    },
  };
}

test("B17：path-only 输入 ⇒ 应用按真实字节计算 roster/三文档 SHA-256 并回填；模型自报 hash 被覆盖", async () => {
  const root = await tempRoot();
  try {
    await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER);
    await writeFile(root, "角色卡/worker/role-card.md", CARD);
    await writeFile(root, "角色卡/worker/boundary.md", BOUNDARY_MD);
    await writeFile(root, "角色卡/worker/boundary.yaml", BOUNDARY_YAML);
    const filled = await fillFixedActivationHashes(activationInput(root));
    assert.equal(filled.ok, true, filled.ok === false ? filled.message : "");
    if (!filled.ok) return;
    assert.equal(filled.input.roster.path, "docs/proposals/snake-roster-v1.md");
    assert.equal(filled.input.roster.sha256, sha(ROSTER));
    assert.equal(filled.input.documents.card.sha256, sha(CARD));
    assert.equal(filled.input.documents.boundaryMd.sha256, sha(BOUNDARY_MD));
    assert.equal(filled.input.documents.boundaryYaml.sha256, sha(BOUNDARY_YAML));
    // 模型自报的（错误）hash 不得被采信：覆盖为应用计算值。
    const forged = activationInput(root);
    const forgedInput = {
      ...forged.input,
      roster: { ...forged.input.roster, sha256: "f".repeat(64) },
      documents: {
        ...forged.input.documents,
        card: { ...forged.input.documents.card, sha256: "e".repeat(64) },
      },
    };
    const overwritten = await fillFixedActivationHashes({ ...forged, input: forgedInput });
    assert.equal(overwritten.ok, true);
    if (!overwritten.ok) return;
    assert.equal(overwritten.input.roster.sha256, sha(ROSTER));
    assert.equal(overwritten.input.documents.card.sha256, sha(CARD));
  } finally {
    await cleanup(root);
  }
});

test("B17：roster/任一角色文档不可读 ⇒ activation-document-invalid fail-closed（不伪造 hash）", async () => {
  const root = await tempRoot();
  try {
    await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER);
    await writeFile(root, "角色卡/worker/role-card.md", CARD);
    await writeFile(root, "角色卡/worker/boundary.md", BOUNDARY_MD);
    // boundary.yaml 缺失
    const missingDoc = await fillFixedActivationHashes(activationInput(root));
    assert.equal(missingDoc.ok, false);
    if (!missingDoc.ok) {
      assert.equal(missingDoc.code, "activation-document-invalid");
      assert.match(missingDoc.message, /boundaryYaml/u);
    }
    // roster 缺失
    const missingRoster = await fillFixedActivationHashes(activationInput(root, { roster: "docs/proposals/missing-roster.md" }));
    assert.equal(missingRoster.ok, false);
    if (!missingRoster.ok) {
      assert.equal(missingRoster.code, "activation-document-invalid");
      assert.match(missingRoster.message, /roster/u);
    }
  } finally {
    await cleanup(root);
  }
});
