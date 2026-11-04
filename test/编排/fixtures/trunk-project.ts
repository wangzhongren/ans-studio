// test/编排/fixtures/trunk-project.ts
// S2 测试夹具：真实文件系统项目（版本化文档/stable 文件/pinned run manifest/R9 冻结记录）+
// 真实 S1 `TrunkStore`/`FreezeRegistryStore` + S2 `TrunkService`。
//
// 不使用内存 fake：trunk 存储、R9 baseline、run manifest 全部走真实文件（临时项目根）。
// run manifest re-pin 端口为 **S3 替身**（写真实 run manifest + `repins` 附加字段；
// S3 将在 `src/common/编排/run-manifest.ts` 提供 `repinPinnedRun` 生产实现）。

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  readRunManifest,
  writeRunManifest,
  type RunDocKind,
  type RunManifest,
} from "../../../src/common/编排/run-manifest.ts";
import type { TrunkApplySnapshot, TrunkVersionRef } from "../../../src/model/trunk.ts";
import type { TrunkStore } from "../../../src/provider/trunk/public/trunk-store.ts";
import { createFsTrunkStore } from "../../../src/provider/trunk/public/trunk-store.ts";
import type { FreezeRegistryStore } from "../../../src/provider/version-change/public/version-change-store.ts";
import { createGuardFreezeRegistry } from "../../../src/provider/version-change/public/version-change-store.ts";
import type { RunRepinPort, TrunkService } from "../../../src/service/trunk/public/trunk-service.ts";
import { createTrunkService } from "../../../src/service/trunk/public/trunk-service.ts";

export const AT = "2026-11-04T12:00:00.000Z";
export const AT2 = "2026-11-04T12:30:00.000Z";
export const FLOW_ID = "demo";

export const PATHS = {
  intent: "docs/product/demo-intent-v1.md",
  proposal: "docs/proposals/demo-proposal-v1.md",
  modules: "docs/proposals/demo-modules-v1.md",
  roster: "docs/proposals/demo-roster-v1.md",
  topology: "docs/proposals/demo-topology-v1.md",
  architecture: "docs/contracts/demo-architecture-v1.md",
  assets: "docs/contracts/demo-assets-v1.md",
  teamPlan: "docs/scheduling/demo-team-v1.md",
  flow: "docs/flows/demo.yaml",
  workflow: "docs/workflow.md",
  roleCard: "角色卡/impl/role-card.md",
  boundary: "角色卡/impl/boundary.yaml",
} as const;

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function writeProjectFile(projectRoot: string, rel: string, content: string): Promise<string> {
  const abs = path.join(projectRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return sha256(content);
}

export async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-trunk-service-"));
}

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v3",
  `flowId: ${FLOW_ID}`,
  "version: 1",
  `intent: ${PATHS.intent}`,
  `proposal: ${PATHS.proposal}`,
  `architecture: ${PATHS.architecture}`,
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: 测试夹具",
  "roles:",
  "  - id: impl",
  "    displayName: 实现",
  "    purpose: 实现",
  "    capability: TS",
  "    modules:",
  "      - impl-core",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现模块",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  `    architectureSource: ${PATHS.architecture}`,
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "management: [convener, impl]",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: impl",
  "roles:",
  "  - id: impl",
  "    modules: [impl-core]",
  "```",
].join("\n");

const MODULES_TEXT = [
  "---",
  "schema: project-modules/v2",
  `flowId: ${FLOW_ID}`,
  "version: 1",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现模块",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  `    architectureSource: ${PATHS.architecture}`,
  "---",
  "# 模块清单",
].join("\n");

export function boundaryText(includeTests = false): string {
  const lines = [
    "role: impl",
    "entries:",
    "  - kind: directory",
    "    path: src/",
    "    purpose: 实现",
  ];
  if (includeTests) {
    lines.push("  - kind: directory", "    path: test/", "    purpose: 测试");
  }
  return `${lines.join("\n")}\n`;
}

export interface TrunkProject {
  root: string;
  runId: string;
  hashes: Record<string, string>;
  registry: FreezeRegistryStore;
  store: TrunkStore;
  service: TrunkService;
  snapshot(): TrunkApplySnapshot;
}

export interface CreateProjectOptions {
  /** 冻结的文档 key（默认全部版本化文档）；用于「未冻结」负例。 */
  freezeKeys?: Array<keyof typeof PATHS>;
  runRepin?: RunRepinPort;
  withRun?: boolean;
}

function runDocuments(hashes: Record<string, string>): RunManifest["documents"] {
  const ref = (rel: string, kind?: RunDocKind): { path: string; sha256: string } => {
    void kind;
    return { path: rel, sha256: hashes[rel] ?? "" };
  };
  return {
    intent: ref(PATHS.intent),
    proposal: ref(PATHS.proposal),
    modules: ref(PATHS.modules),
    roster: ref(PATHS.roster),
    topology: ref(PATHS.topology),
    architecture: ref(PATHS.architecture),
    assets: ref(PATHS.assets),
  };
}

export async function writePinnedRun(
  projectRoot: string,
  runId: string,
  hashes: Record<string, string>,
  options: { flowId?: string; d3?: RunManifest["d3"] } = {},
): Promise<RunManifest> {
  const manifest: RunManifest = {
    schema: "ans-run/v1",
    runId,
    flowId: options.flowId ?? FLOW_ID,
    state: "pinned",
    createdAt: AT,
    updatedAt: AT,
    pinnedAt: AT,
    pinnedBy: "app",
    schemas: { run: "ans-run/v1" },
    documents: runDocuments(hashes),
    execution: {
      teamPlan: { path: PATHS.teamPlan, sha256: hashes[PATHS.teamPlan]! },
      flow: { path: PATHS.flow, sha256: hashes[PATHS.flow]!, version: 1 },
    },
    rosterVersion: 1,
    d3: options.d3 ?? { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
  };
  const written = await writeRunManifest(projectRoot, manifest);
  if (!written.ok) throw new Error(`fixture: run manifest 写入失败：${written.reason}`);
  return written.manifest;
}

export async function createTrunkProject(options: CreateProjectOptions = {}): Promise<TrunkProject> {
  const root = await makeRoot();
  const hashes: Record<string, string> = {};
  const frontmatter = (schema: string, body: string) => `---\nschema: ${schema}\n---\n${body}`;
  const contents: Array<[string, string]> = [
    [PATHS.intent, frontmatter("project-intent/v1", "# demo intent v1\n")],
    [PATHS.proposal, "---\nschema: project-proposal/v2\nflowId: demo\nversion: 1\nintent: docs/product/demo-intent-v1.md\n---\n# demo proposal v1\n"],
    [PATHS.modules, MODULES_TEXT],
    [PATHS.roster, ROSTER_TEXT],
    [PATHS.topology, frontmatter("project-topology/v2", "# demo topology v1\n")],
    [PATHS.architecture, "---\nschema: project-architecture/v1\n---\n# demo architecture v1\n\nproposal: docs/proposals/demo-proposal-v1.md\n"],
    [PATHS.assets, frontmatter("project-assets/v1", "# demo assets v1\n")],
    [PATHS.teamPlan, frontmatter("teamPlanSchema:3", "# demo team plan v1\n")],
    [PATHS.flow, "version: 1\n"],
    [PATHS.workflow, "# workflow\n"],
    [PATHS.roleCard, "# role card impl\n"],
    [PATHS.boundary, boundaryText()],
  ];
  for (const [rel, content] of contents) hashes[rel] = await writeProjectFile(root, rel, content);

  const runId = "run-20261104-demo-a1b2c3d4";
  if (options.withRun !== false) await writePinnedRun(root, runId, hashes);

  const registry = createGuardFreezeRegistry(root, { migrationCompleted: () => true, now: () => new Date(AT) });
  const freezeKeys = options.freezeKeys ?? [
    "intent",
    "proposal",
    "modules",
    "roster",
    "topology",
    "architecture",
    "assets",
  ];
  const records = freezeKeys.map((key) => {
    const rel = PATHS[key];
    const version = Number(/-v(\d+)\.md$/i.exec(rel)?.[1] ?? "1");
    return {
      path: rel,
      version,
      sha256: hashes[rel]!,
      freeze: {
        schema: "doc-freeze/v1" as const,
        applicationId: "migration",
        reason: "migrated-legacy" as const,
        origin: "application" as const,
        frozenAt: AT,
      },
    };
  });
  if (records.length > 0) {
    const appended = await registry.appendDocFreezeRecords(records);
    if (!appended.ok) throw new Error(`fixture: 冻结记录写入失败：${appended.message}`);
  }

  const store = createFsTrunkStore(root);
  const service = createTrunkService({
    projectRoot: root,
    store,
    freezeRegistry: registry,
    ...(options.runRepin !== undefined ? { runRepin: options.runRepin } : {}),
    now: () => new Date(AT),
  });

  const project: TrunkProject = {
    root,
    runId,
    hashes,
    registry,
    store,
    service,
    snapshot(): TrunkApplySnapshot {
      const doc = (rel: string) => ({ path: rel, sha256: hashes[rel]! });
      return {
        trunkVersion: 0,
        runId,
        documents: {
          proposal: doc(PATHS.proposal),
          modules: doc(PATHS.modules),
          roster: doc(PATHS.roster),
          topology: doc(PATHS.topology),
          architecture: doc(PATHS.architecture),
          assets: doc(PATHS.assets),
        },
        execution: {
          teamPlan: doc(PATHS.teamPlan),
          flow: { ...doc(PATHS.flow), version: 1 },
        },
        workflow: doc(PATHS.workflow),
        roleCards: { impl: doc(PATHS.roleCard) },
        boundaries: { impl: doc(PATHS.boundary) },
      };
    },
  };
  return project;
}

/** 测试用 S3 替身：写真实 run manifest（refs 更新 + `repins` 附加字段，S3 生产实现后续替换）。 */
export function createRunRepinPort(projectRoot: string): RunRepinPort {
  return {
    async repin(input) {
      const read = await readRunManifest(projectRoot, input.runId);
      if (!read.ok) return { ok: false, code: read.code, message: read.reason };
      const run = read.manifest;
      const documents = { ...run.documents };
      let teamPlan = run.execution.teamPlan;
      let flow = run.execution.flow;
      for (const target of input.targets) {
        if (target.kind === "teamPlan") {
          teamPlan = { path: target.path, sha256: target.sha256 };
          continue;
        }
        if (target.kind === "flow") {
          flow = { path: target.path, sha256: target.sha256, version: flow?.version ?? 1 };
          continue;
        }
        documents[target.kind as RunDocKind] = { path: target.path, sha256: target.sha256 };
      }
      const repins = [
        ...((run as RunManifest & { repins?: unknown[] }).repins ?? []),
        {
          schema: "run-repin/v1",
          at: input.at,
          applicationId: input.applicationId,
          ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
          targets: input.targets,
        },
      ];
      const written = await writeRunManifest(projectRoot, {
        ...run,
        documents,
        execution: { teamPlan, flow },
        updatedAt: input.at,
        repins,
      } as RunManifest);
      return written.ok ? { ok: true, alreadyApplied: false } : { ok: false, code: written.code, message: written.reason };
    },
  };
}

/** 期望的当前主干引用（C2c `TrunkBaselinePort` 测试辅助）。 */
export function trunkRef(version: number, digest: string, runId: string): TrunkVersionRef {
  return { trunkVersion: version, runId, digest };
}
