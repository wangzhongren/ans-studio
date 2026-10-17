// test/测试/existing-project-compat-verify/d-scope-audit.test.ts
// 测试角色：权限边界独立审计（任务书 §C「权限边界」；2026-10-17）。
//
// 做法：读取各属主的 `角色卡/<角色>/boundary.yaml`（Section 1 唯一写入白名单），把**本轮工作树**
// （`git status --short` 快照，2026-10-17 独立核对时点）的每个改动/新增文件逐一匹配到其属主的
// file / directory / conditional-directory 条目；任何文件若不在其属主白名单内，本用例即红。
//
// 说明：文件清单是**当轮快照**（不是从 git 动态取——避免测试依赖 git 状态而随提交漂移）；
// 越界审计的结论以本清单为准，报告里另记 `git status --short` 自查。
// 本文件与同目录其他文件属于测试角色边界 `test/测试/`（目录条目），一并自证。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

interface BoundaryEntry {
  kind: string;
  path: string;
}

/** 极简 YAML 白名单解析：只取 `- kind: …` 后紧跟的 `path: …`（本项目角色卡的固定形状）。 */
function parseBoundary(role: string): BoundaryEntry[] {
  const abs = path.join(REPO_ROOT, "角色卡", role, "boundary.yaml");
  const text = fs.readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/);
  const out: BoundaryEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const kind = /^\s*-\s+kind:\s*(\S+)\s*$/.exec(lines[i]);
    if (!kind) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^\s*-\s+kind:/.test(lines[j])) break;
      const p = /^\s+path:\s*(.+?)\s*$/.exec(lines[j]);
      if (p) {
        out.push({ kind: kind[1], path: p[1].replace(/^["']|["']$/g, "") });
        break;
      }
    }
  }
  return out;
}

function covered(entries: BoundaryEntry[], file: string): boolean {
  return entries.some((e) => {
    if (e.kind === "file") return e.path === file;
    const dir = e.path.endsWith("/") ? e.path : `${e.path}/`;
    return file === e.path || file.startsWith(dir);
  });
}

/** 本轮工作树快照：35 个修改文件 + 5 个新增文件（2026-10-17 独立核对时点）。 */
const CHANGED: { file: string; owner: string }[] = [
  // 桌面窗口（A2/A3 + C1–C3 + 单文件测试扩展）
  { file: "app/desktop/interface.ts", owner: "桌面窗口" },
  { file: "app/desktop/project.ts", owner: "桌面窗口" },
  { file: "app/main.ts", owner: "桌面窗口" },
  { file: "app/preload.cjs", owner: "桌面窗口" },
  { file: "test/桌面应用/ans-wiring.test.ts", owner: "桌面窗口" },
  { file: "test/桌面应用/interface.test.ts", owner: "桌面窗口" },
  { file: "test/桌面应用/project.test.ts", owner: "桌面窗口" },
  { file: "角色卡/桌面窗口/api-spec.md", owner: "桌面窗口" },
  { file: "角色卡/桌面窗口/changelog.md", owner: "桌面窗口" },
  { file: "角色卡/桌面窗口/feature-map.md", owner: "桌面窗口" },
  { file: "角色卡/桌面窗口/memo.md", owner: "桌面窗口" },
  // 桌面UI（D1/D2 + 单文件测试扩展）
  { file: "app/renderer/renderer.js", owner: "桌面UI" },
  { file: "app/renderer/styles.css", owner: "桌面UI" },
  { file: "app/renderer/ui-labels.js", owner: "桌面UI" },
  { file: "test/桌面应用/renderer.test.ts", owner: "桌面UI" },
  { file: "角色卡/桌面UI/api-spec.md", owner: "桌面UI" },
  { file: "角色卡/桌面UI/changelog.md", owner: "桌面UI" },
  { file: "角色卡/桌面UI/feature-map.md", owner: "桌面UI" },
  { file: "角色卡/桌面UI/memo.md", owner: "桌面UI" },
  // 编排（B1/B2）
  { file: "src/common/编排/finalize.ts", owner: "编排" },
  { file: "src/pipeline/orchestration/govern-session.ts", owner: "编排" },
  { file: "test/编排/governance-record.test.ts", owner: "编排" },
  { file: "角色卡/编排/api-spec.md", owner: "编排" },
  { file: "角色卡/编排/changelog.md", owner: "编排" },
  { file: "角色卡/编排/feature-map.md", owner: "编排" },
  { file: "角色卡/编排/memo.md", owner: "编排" },
  // 门禁引擎（A1 + F1）
  { file: "src/service/boundary/resolve-boundary.ts", owner: "门禁引擎" },
  { file: "src/service/gate/resolve-write.ts", owner: "门禁引擎" },
  { file: "test/门禁引擎/f6-denial-guidance.test.ts", owner: "门禁引擎" },
  { file: "test/门禁引擎/governance-seed-public-entry.test.ts", owner: "门禁引擎" },
  { file: "角色卡/门禁引擎/changelog.md", owner: "门禁引擎" },
  { file: "角色卡/门禁引擎/feature-map.md", owner: "门禁引擎" },
  { file: "角色卡/门禁引擎/memo.md", owner: "门禁引擎" },
  // 产品
  { file: "角色卡/产品/docs/design/2026-10-17_design_existing-project-compat.md", owner: "产品" },
  { file: "角色卡/产品/changelog.md", owner: "产品" },
  { file: "角色卡/产品/feature-map.md", owner: "产品" },
  { file: "角色卡/产品/memo.md", owner: "产品" },
  // 项目管理
  {
    file: "角色卡/项目管理/docs/design/2026-10-17_design_existing-project-compat-review.md",
    owner: "项目管理",
  },
  { file: "角色卡/项目管理/changelog.md", owner: "项目管理" },
  { file: "角色卡/项目管理/memo.md", owner: "项目管理" },
];

test("D1 权限边界：本轮每个改动文件都落在其属主 boundary.yaml 的 Section 1 内", () => {
  const cache = new Map<string, BoundaryEntry[]>();
  const violations: string[] = [];
  for (const { file, owner } of CHANGED) {
    let entries = cache.get(owner);
    if (!entries) {
      entries = parseBoundary(owner);
      cache.set(owner, entries);
      assert.ok(entries.length > 0, `${owner} 的 boundary.yaml 应可解析出条目`);
    }
    if (!covered(entries, file)) violations.push(`${file}（属主：${owner}）`);
  }
  assert.deepEqual(violations, [], `越界文件（不在属主 Section 1）：\n${violations.join("\n")}`);
});

test("D2 权限边界：本轮改动未落在测试角色自己的写入面之外（test/测试/ 目录条目）", () => {
  const entries = parseBoundary("测试");
  for (const file of [
    "test/测试/existing-project-compat-verify/fixture.ts",
    "test/测试/existing-project-compat-verify/a-state-preview.test.ts",
    "test/测试/existing-project-compat-verify/b-establish.test.ts",
    "test/测试/existing-project-compat-verify/c-invariants.test.ts",
    "test/测试/existing-project-compat-verify/d-scope-audit.test.ts",
  ]) {
    assert.equal(covered(entries, file), true, `${file} 应在测试角色 test/测试/ 边界内`);
  }
});

test("D3 文档产物：测试角色报告/证据路径在 test/测试/ 与 角色卡/测试/docs/ 白名单内", () => {
  const entries = parseBoundary("测试");
  assert.equal(covered(entries, "角色卡/测试/docs/change/2026-10-17_change_existing-project-compat-verify.md"), true);
  assert.equal(
    covered(entries, "角色卡/测试/docs/change/2026-10-17-existing-project-compat-verify-evidence/sha256-freeze.txt"),
    true,
  );
});
