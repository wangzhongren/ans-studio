// test/测试/existing-project-compat-verify/fixture.ts
// 测试角色：**已有角色但无治理记录的项目兼容（B+C V1）** 独立验证夹具（2026-10-17）。
//
// 纪律（沿用本角色先例）：
//   · **独立构造、不复用实施方断言**：本目录的夹具/断言均为本角色自建；只读导入产品公开面
//     （`listProject`/`buildEffectiveProjectConfig`/`resolveBoundarySection`/`resolveWrite`/
//     `loadEffectiveConfig`/桌面 Interface），不 import 任何实施方测试文件。
//   · 全部在系统临时目录内进行、用后清理；仓库不留夹具文件。
//   · 与客户现场同形状：N 个角色目录，每目录 `role-card.md` + **仅** `boundary.md`（旧版 Markdown），
//     项目根无 `.ans/project.json`（构造依据：PM 评审 §八-4——「只有 boundary.md」指**边界文件**，
//     `role-card.md` 必须存在，否则 `listProject` 不枚举）。

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDesktopInterface } from "../../../app/desktop/interface.ts";
import { buildEffectiveProjectConfig, buildProjectConfig } from "../../../app/desktop/project.ts";
import { loadEffectiveConfig } from "../../../src/common/shared/config-loader.ts";
import { resolveBoundarySection } from "../../../src/common/门禁引擎/boundary-core.ts";
import { listProject, type ProjectListing } from "../../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../../src/service/gate/resolve-write.ts";
import type { BoundarySection1 } from "../../../src/model/boundary.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";
import type { TaskScope, WriteDecision } from "../../../src/model/decision.ts";

export const GOV_REL = "角色卡/governance-boundary.yaml";
export const ANS_REL = ".ans/project.json";
export const MANIFEST_REL = "docs/bootstrap-manifest.md";

export interface AnsPin {
  path: string;
  sha256: string;
}

export interface AnsRecord {
  projectRoot: string;
  skillRoot: string;
  roles: Record<string, { card: string; boundary: string }>;
  governanceBoundary: {
    path: string;
    acceptance: { accepted: boolean; source: string; pin?: AnsPin[] };
  };
  genesisBootstrap?: unknown;
  [key: string]: unknown;
}

/** 旧版 Markdown 边界（表格式 Section 1；加载器可解析，非散文）。 */
export function legacyBoundaryMarkdown(id: string): string {
  return [
    `# 角色 ${id} 边界`,
    "",
    "## Section 1：可修改文件与目录",
    "",
    "| 类型 | 路径 | 用途 |",
    "| --- | --- | --- |",
    `| 文件 | \`src/${id}.ts\` | 角色代码 |`,
    "",
  ].join("\n");
}

/** 标准 YAML 边界（用于混合形态：只影响 pin 列表与 legacy 提示，不影响主路径）。 */
export function roleBoundaryYaml(id: string): string {
  return [
    `role: ${id}`,
    "entries:",
    "  - kind: file",
    `    path: src/${id}.ts`,
    "    purpose: 角色代码",
    "",
  ].join("\n");
}

/** 标准治理边界文档（与 finalize 写出的三普通目录同形状；条目带 purpose 以满足严格 YAML 解析）。 */
export function governanceDocYaml(): string {
  return [
    "role: 治理边界",
    "entries:",
    "  - kind: directory",
    "    path: 角色卡/",
    "    root: project",
    "    purpose: 角色目录",
    "  - kind: directory",
    "    path: docs/",
    "    root: project",
    "    purpose: 项目文档",
    "  - kind: directory",
    "    path: .ans/",
    "    root: project",
    "    purpose: 配置与 pin",
    "",
  ].join("\n");
}

export interface FixtureProject {
  root: string;
  ids: string[];
  /** 以 YAML 边界的角色（其余为 legacy boundary.md）。 */
  yamlIds: string[];
  cleanup(): void;
}

/**
 * 造 S1 夹具：每个角色目录有 `role-card.md` + 边界文件（缺省 legacy `boundary.md`），
 * **无 `.ans/project.json`**。
 */
export function makeS1Project(
  ids: string[] = ["alpha", "beta", "gamma"],
  yamlIds: string[] = [],
): FixtureProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-compat-verify-"));
  for (const id of ids) {
    const dir = path.join(root, "角色卡", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "role-card.md"), `# 角色 ${id}\n\n独立验证夹具角色。\n`, "utf8");
    if (yamlIds.includes(id)) {
      fs.writeFileSync(path.join(dir, "boundary.yaml"), roleBoundaryYaml(id), "utf8");
    } else {
      fs.writeFileSync(path.join(dir, "boundary.md"), legacyBoundaryMarkdown(id), "utf8");
    }
  }
  return {
    root,
    ids,
    yamlIds,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}

/** 空项目（只有根目录）。 */
export function makeEmptyProject(): { root: string; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-compat-verify-empty-"));
  return {
    root,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}

/** 写一份**结构上可用**的 `.ans/project.json`（载入器只校验 pin 形状，不逐文件比对——设计所载）。 */
export function writeUsableAns(root: string, ids: string[]): void {
  const roles: AnsRecord["roles"] = {};
  for (const id of ids) {
    const boundaryName = fs.existsSync(path.join(root, "角色卡", id, "boundary.yaml"))
      ? "boundary.yaml"
      : "boundary.md";
    roles[id] = { card: `角色卡/${id}/role-card.md`, boundary: `角色卡/${id}/${boundaryName}` };
  }
  const record: AnsRecord = {
    projectRoot: root.split(path.sep).join("/"),
    skillRoot: root.split(path.sep).join("/"),
    roles,
    governanceBoundary: {
      path: GOV_REL,
      acceptance: {
        accepted: true,
        source: "test:独立验证夹具（结构可用）",
        pin: [{ path: GOV_REL, sha256: "a".repeat(64) }],
      },
    },
  };
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ANS_REL), JSON.stringify(record, null, 2) + "\n", "utf8");
}

/**
 * 写一份 **真实 pin** 的 `.ans/project.json`（2026-10-17 pin 逐文件校验接入后的新契约）：
 * pin 目标与 finalize 同口径——治理边界文档 + 全部角色边界；哈希取**当刻盘上实际字节**。
 * 用于「全部一致 → present」；`writeUsableAns` 仍保留给「坏 pin / 结构可用」类场景。
 */
export function writeRealPinnedAns(root: string, ids: string[]): void {
  const govAbs = path.join(root, GOV_REL);
  fs.mkdirSync(path.dirname(govAbs), { recursive: true });
  if (!fs.existsSync(govAbs)) fs.writeFileSync(govAbs, governanceDocYaml(), "utf8");
  const roles: AnsRecord["roles"] = {};
  const pinPaths: string[] = [GOV_REL];
  for (const id of ids) {
    const boundaryName = fs.existsSync(path.join(root, "角色卡", id, "boundary.yaml"))
      ? "boundary.yaml"
      : "boundary.md";
    roles[id] = { card: `角色卡/${id}/role-card.md`, boundary: `角色卡/${id}/${boundaryName}` };
    pinPaths.push(`角色卡/${id}/${boundaryName}`);
  }
  const record: AnsRecord = {
    projectRoot: root.split(path.sep).join("/"),
    skillRoot: root.split(path.sep).join("/"),
    roles,
    governanceBoundary: {
      path: GOV_REL,
      acceptance: {
        accepted: true,
        source: "test:独立验证夹具（真实 pin）",
        pin: pinPaths.map((rel) => ({ path: rel, sha256: sha256OfFile(path.join(root, rel)) })),
      },
    },
  };
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ANS_REL), JSON.stringify(record, null, 2) + "\n", "utf8");
}

export function readAns(root: string): AnsRecord {
  return JSON.parse(fs.readFileSync(path.join(root, ANS_REL), "utf8")) as AnsRecord;
}

export function sha256OfFile(absPath: string): string {
  return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

export interface TreeEntry {
  rel: string;
  kind: "file" | "dir";
  size?: number;
  mtimeMs: number;
}

/**
 * 目录树快照（相对路径 + 类型 + 大小 + mtime）。用于 V1/V5/V6/V7 的「零写入 / 零副作用」证据：
 * 前后逐条相等（含目录，可发现新建目录）。读取本身不改 mtime。
 */
export function snapshotTree(root: string): TreeEntry[] {
  const out: TreeEntry[] = [];
  const walk = (abs: string, rel: string): void => {
    let dirents;
    try {
      dirents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name));
    for (const d of dirents) {
      const childAbs = path.join(abs, d.name);
      const childRel = rel === "" ? d.name : `${rel}/${d.name}`;
      const st = fs.statSync(childAbs);
      if (d.isDirectory()) {
        out.push({ rel: childRel, kind: "dir", mtimeMs: st.mtimeMs });
        walk(childAbs, childRel);
      } else if (d.isFile()) {
        out.push({ rel: childRel, kind: "file", size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  };
  walk(root, "");
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/** 桌面 Interface（真实装配默认依赖；只注入 pickDirectory/emitEvent/emitProjectChanged 收集器）。 */
export function makeDesktop(root: string): {
  iface: ReturnType<typeof createDesktopInterface>;
  projectChanged: () => number;
} {
  let changed = 0;
  const iface = createDesktopInterface({
    pickDirectory: async () => root,
    emitEvent: () => {},
    emitProjectChanged: () => {
      changed += 1;
    },
  });
  return { iface, projectChanged: () => changed };
}

export interface EffectiveView {
  listing: ProjectListing;
  project: ProjectConfig;
}

/** 走桌面**唯一授权链**（`.ans` 优先；无则运行期同意回退；不可用 fail-closed）。 */
export async function effectiveOf(root: string): Promise<EffectiveView> {
  const listing = await listProject(root);
  const effective = await buildEffectiveProjectConfig(listing, { buildProjectConfig, loadEffectiveConfig });
  return { listing, project: effective.project };
}

/** 用真实 `resolveBoundarySection` 取某角色边界。 */
export async function boundaryOf(root: string, roleId: string): Promise<BoundarySection1> {
  const { project } = await effectiveOf(root);
  return resolveBoundarySection(roleId, project);
}

export interface GatedWrite {
  decision: WriteDecision;
  boundary: BoundarySection1;
  project: ProjectConfig;
}

/** 用真实 `resolveBoundarySection` + `resolveWrite` 求值一次写入。 */
export async function gateWrite(
  root: string,
  roleId: string,
  targetRel: string,
  scope?: TaskScope,
): Promise<GatedWrite> {
  const { project } = await effectiveOf(root);
  const boundary = await resolveBoundarySection(roleId, project);
  const decision = resolveWrite(targetRel, boundary, scope, {
    skillRoot: project.skillRoot,
    projectRoot: project.projectRoot,
  });
  return { decision, boundary, project };
}

/** F6 首句（设计 §三 逐字钉）：不允许被改写或重复。 */
export const F6_FIRST_SENTENCE = "边界未被接受或缺少证据来源（F6）：拒绝一切写入。";
