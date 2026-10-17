// test/测试/governance-pin-recovery-verify/fixture.ts
// 测试角色：治理记录 pin 不符「重新接受」端到端独立验证夹具（2026-10-17）。
//
// 纪律（沿用本角色先例）：
//   · **独立构造、不复用实施方断言**：夹具/断言均为本角色自建；只读导入产品公开面
//     （`inspectPinnedBoundaries` 的 Service 出口、Pipeline 的预览/写入、桌面 Interface、
//     共享载入器与 `buildEffectiveProjectConfig`），不 import 任何实施方测试文件。
//   · 全部在系统临时目录内、用后清理；仓库不留夹具文件。
//   · 夹具形状贴近 finalize 的创世产物：`角色卡/governance-boundary.yaml`（三普通目录）+
//     N 个角色（`role-card.md` + `boundary.yaml`）+ `.ans/project.json`（**真实哈希 pin**）+
//     `docs/bootstrap-manifest.md`。pin 顺序与 finalize 同口径：治理文档在前，角色边界随后。
//   · 不读取 `.env`、不使用任何真实凭据。

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createDesktopInterface } from "../../../app/desktop/interface.ts";
import { buildEffectiveProjectConfig, buildProjectConfig } from "../../../app/desktop/project.ts";
import { loadEffectiveConfig } from "../../../src/common/shared/config-loader.ts";
import { listProject, type ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type { PinEntry } from "../../../src/model/boundary.ts";
import type { RuntimeAdapter, SessionEvent } from "../../../src/model/runtime.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

export const GOV_REL = "角色卡/governance-boundary.yaml";
export const ANS_REL = ".ans/project.json";
export const MANIFEST_REL = "docs/bootstrap-manifest.md";
export const ACCEPTANCE_SOURCE = "test:governance-pin-recovery-verify 夹具授权来源";

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
  fixtureNote: { owner: string; keep: boolean };
  [key: string]: unknown;
}

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function sha256OfFile(absPath: string): string {
  return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

/** 标准 YAML 边界（每角色文件内容稳定；修改时追加注释行以改变哈希）。 */
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

/** 治理边界文档（与 finalize 写出的三普通目录同形状）。 */
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

/** 既有 manifest：用于验证「逐字节保留 + 节末追加」。 */
export function manifestSeed(): string {
  return [
    "# Bootstrap 留痕（创世 finalize）",
    "",
    "- 2026-10-17T00:00:00.000Z：夹具初始留痕（应被逐字节保留）。",
    "",
  ].join("\n");
}

export interface PinnedProjectFixture {
  root: string;
  ids: string[];
  /** 构造时写入 `.ans` 的 pin（真实哈希）。 */
  pins: PinEntry[];
  cleanup(): void;
}

/**
 * 造夹具。缺省 3 个角色（alpha/beta/gamma），4 条 pin（治理文档 + 3 角色边界）。
 * · `withAns:false` → 不建 `.ans/`（missing 场景）；
 * · `ansRaw` → 以给定原文写 `.ans/project.json`（不可解析场景）。
 */
export function makePinnedProject(
  options: { ids?: string[]; withAns?: boolean; ansRaw?: string } = {},
): PinnedProjectFixture {
  const ids = options.ids ?? ["alpha", "beta", "gamma"];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-pin-recovery-verify-"));

  fs.mkdirSync(path.join(root, "角色卡"), { recursive: true });
  fs.writeFileSync(path.join(root, GOV_REL), governanceDocYaml(), "utf8");

  const roles: Record<string, { card: string; boundary: string }> = {};
  const pinPaths: string[] = [GOV_REL];
  for (const id of ids) {
    const dirAbs = path.join(root, "角色卡", id);
    fs.mkdirSync(dirAbs, { recursive: true });
    fs.writeFileSync(path.join(dirAbs, "role-card.md"), `# 角色 ${id}\n\n独立验证夹具角色。\n`, "utf8");
    const boundaryRel = `角色卡/${id}/boundary.yaml`;
    fs.writeFileSync(path.join(root, boundaryRel), roleBoundaryYaml(id), "utf8");
    roles[id] = { card: `角色卡/${id}/role-card.md`, boundary: boundaryRel };
    pinPaths.push(boundaryRel);
  }

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, MANIFEST_REL), manifestSeed(), "utf8");

  const pins: PinEntry[] = pinPaths.map((rel) => ({
    path: rel,
    sha256: sha256OfFile(path.join(root, rel)),
  }));

  if (options.withAns !== false) {
    fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
    if (options.ansRaw !== undefined) {
      fs.writeFileSync(path.join(root, ANS_REL), options.ansRaw, "utf8");
    } else {
      const record: AnsRecord = {
        projectRoot: toPosix(root),
        skillRoot: toPosix(root),
        roles,
        governanceBoundary: {
          path: GOV_REL,
          acceptance: { accepted: true, source: ACCEPTANCE_SOURCE, pin: pins },
        },
        // 未知字段：写入后必须原样保留（只替换 pin）。
        fixtureNote: { owner: "测试角色独立夹具", keep: true },
      };
      fs.writeFileSync(path.join(root, ANS_REL), JSON.stringify(record, null, 2) + "\n", "utf8");
    }
  }

  return {
    root,
    ids,
    pins,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}

export function readAns(root: string): AnsRecord {
  return JSON.parse(fs.readFileSync(path.join(root, ANS_REL), "utf8")) as AnsRecord;
}

export function readManifest(root: string): string {
  return fs.readFileSync(path.join(root, MANIFEST_REL), "utf8");
}

/** 外部修改一个被 pin 的角色边界（追加注释行 ⇒ 内容哈希改变）。 */
export function modifyBoundary(root: string, id: string, marker: string): string {
  const abs = path.join(root, "角色卡", id, "boundary.yaml");
  const content = roleBoundaryYaml(id) + `# 外部修改（${marker}）\n`;
  fs.writeFileSync(abs, content, "utf8");
  return content;
}

/** 直接写入边界原文（坏 YAML / 空 Section 1 场景）。 */
export function writeBoundaryRaw(root: string, id: string, raw: string): void {
  fs.writeFileSync(path.join(root, "角色卡", id, "boundary.yaml"), raw, "utf8");
}

export function deleteBoundary(root: string, id: string): void {
  // 注：Windows + 中文路径下 `fs.rmSync(singleFile)` 在本机 Node 上无报错也未删除（复现于 2026-10-17），
  // 改用 `unlinkSync`（同场景已验证可删除）。
  fs.unlinkSync(path.join(root, "角色卡", id, "boundary.yaml"));
}

export interface FileSnapshot {
  rel: string;
  kind: "file" | "dir";
  size?: number;
  mtimeMs: number;
  /** 仅文件：内容哈希（零写入/仅两文件变化的强证据）。 */
  sha256?: string;
}

/**
 * 完整目录树快照（相对路径 + 类型 + 大小 + mtime + 文件内容哈希）。
 * 读取本身不改 mtime；前后 `deepEqual` 即「零写入 / 零副作用」证据。
 */
export function snapshotTree(root: string): FileSnapshot[] {
  const out: FileSnapshot[] = [];
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
        out.push({
          rel: childRel,
          kind: "file",
          size: st.size,
          mtimeMs: st.mtimeMs,
          sha256: sha256OfFile(childAbs),
        });
      }
    }
  };
  walk(root, "");
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/** 仅按**内容哈希**比较文件集合：返回变化/新增/删除的相对路径（排序）。 */
export function changedFiles(before: FileSnapshot[], after: FileSnapshot[]): string[] {
  const b = new Map(before.filter((e) => e.kind === "file").map((e) => [e.rel, e]));
  const a = new Map(after.filter((e) => e.kind === "file").map((e) => [e.rel, e]));
  const changed: string[] = [];
  for (const [rel, entry] of a) {
    const prev = b.get(rel);
    if (prev === undefined || prev.sha256 !== entry.sha256) changed.push(rel);
  }
  for (const rel of b.keys()) {
    if (!a.has(rel)) changed.push(`-${rel}`);
  }
  for (const rel of a.keys()) {
    if (!b.has(rel)) changed.push(`+${rel}`);
  }
  return changed.sort();
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

/** 确定性桩会话适配器：立即 settled、dispose 无事——不触真实模型。 */
export function settledAdapter(): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as SessionEvent;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

export interface UiLabelsApi {
  governanceActionFor: (hasProject: boolean, hasRoles: boolean, recordState: string) => string | null;
}

/** 经典脚本在 Node 下装载：与既有测试同款（`globalThis.ANSUiLabels`）。 */
export async function loadUiLabels(): Promise<UiLabelsApi> {
  const href = new URL("../../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  return (globalThis as unknown as { ANSUiLabels: UiLabelsApi }).ANSUiLabels;
}
