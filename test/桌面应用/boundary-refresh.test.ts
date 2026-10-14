// test/桌面应用/boundary-refresh.test.ts
// 桌面窗口（O-1，2026-10-12 真机现象 + 客户「这个问题也要修复一下」）：**边界变更后，持有旧快照的会话必须能刷新**。
//
// 真机：su 已改好 `角色卡/任务清单测试/boundary.yaml`（盘上条目齐全、pin 一致），但该角色的**活会话**仍用
// 开会话时解析的旧边界 ⇒ 写被拒（「目标路径未匹配任何边界条目」）。
// 本文件的证据：信号 = **读盘内容哈希**（可信信号，非界面推测）；检出陈旧 ⇒ **作废重建**（dispose → 按新
// 边界重开）并**如实记一行**（措辞按 D-1 两分支：恢复 / 新建）；未变 ⇒ **不得**误重开（不丢上下文）；
// 检查点：发言前 / 续接（点角色）/ 投递前 / su 一轮结束的全量扫描；**su 自身同样适用**。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { DispatchTaskFn } from "../../src/provider/pi/session.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION_SRC = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
const IFACE_SRC = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "interface.ts"), "utf8");

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/** 注入确定性载入器（避免命盘 `.ans` 解析）：无 `.ans` → 回退运行期同意（即入参 fallback）。 */
const STUB_LOADER = async (opts: { fallback: import("../../src/model/role.ts").ProjectConfig }) => ({
  project: opts.fallback,
  source: {
    kind: "builtin-fallback" as const,
    path: "",
    acceptance: opts.fallback.governanceBoundary!.acceptance,
    pinPaths: [],
  },
});

/** 造一个**真实临时项目目录**（指纹走真读盘——本用例的信号就是文件内容哈希）。 */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o1-"));
  fs.mkdirSync(path.join(dir, "角色卡", "A"), { recursive: true });
  fs.writeFileSync(path.join(dir, "角色卡", "A", "boundary.yaml"), "entries: []\n", "utf8");
  return dir;
}

function listing(dir: string): ProjectListing {
  const mk = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: builtIn ? "" : `角色卡/${roleId}/role-card.md`,
    boundaryPath: builtIn ? "" : `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: builtIn
      ? { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }
      : {
          entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
    builtIn: builtIn ? true : undefined,
  });
  return { projectRoot: dir, roles: [mk("su", true), mk("A")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  envelopes: { roleId: string; event: OrchestrationEvent }[];
  openCalls: string[];
  dispatchOf: (roleId: string) => DispatchTaskFn | undefined;
}

function makeHarness(l: ProjectListing): Harness {
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const envelopes: { roleId: string; event: OrchestrationEvent }[] = [];
  const openCalls: string[] = [];
  const openInputs: Record<string, { dispatchTask?: DispatchTaskFn }> = {};
  const stopped: Record<string, boolean> = {};

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string): Promise<void> {
        (sent[roleId] = sent[roleId] || []).push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 400; tries += 1) {
                  if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] || [];
                  if (i < arr.length) return { value: arr[i++], done: false };
                  await new Promise((r) => setTimeout(r, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {
        stopped[roleId] = true;
      },
    };
  };

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openCalls.push(input.roleId);
      openInputs[input.roleId] = { dispatchTask: (input as { dispatchTask?: DispatchTaskFn }).dispatchTask };
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === l.projectRoot ? l : undefined),
    emitEvent: (env) => envelopes.push(env),
    loadEffectiveConfig: STUB_LOADER,
  });
  return { mgr, streams, sent, envelopes, openCalls, dispatchOf: (roleId) => openInputs[roleId]?.dispatchTask };
}

test("O-1：边界文件内容变更 ⇒ 活会话作废重建（如实行含文件名与 D-1 措辞）；未变 ⇒ 不重建（不丢上下文）", async () => {
  const dir = makeProject();
  const h = makeHarness(listing(dir));
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  assert.equal(h.openCalls.filter((r) => r === "A").length, 1);

  const r1 = await h.mgr.send("一");
  assert.equal(r1.ok, true);
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);
  assert.equal(h.openCalls.filter((r) => r === "A").length, 1, "边界未变：发送前后都不得重建（不误重开丢上下文）");
  assert.ok(!h.envelopes.some((e) => /边界已更新/.test(String(e.event.summary || ""))), "未变不记重建行");

  // 模拟 su 改好 boundary.yaml：**下一条发言前**应自动作废重建，且本条照常发出（落到新会话）。
  fs.writeFileSync(path.join(dir, "角色卡", "A", "boundary.yaml"), "entries:\n  - root: project\n", "utf8");
  const r2 = await h.mgr.send("二");
  assert.equal(r2.ok, true, "重建后本条消息照常发出");
  assert.equal(h.openCalls.filter((r) => r === "A").length, 2, "陈旧 ⇒ 作废重建（新开一次会话）");
  assert.ok(h.sent.A.includes("二"), "发言落到新把手（按新边界）");
  const line = h.envelopes.map((e) => String(e.event.summary || "")).find((s) => s.includes("边界已更新"));
  assert.ok(line, "应有**如实**重建行（不静默）");
  assert.ok(line!.includes("角色卡/A/boundary.yaml"), "行内含变更文件名");
  assert.ok(line!.includes("按新边界重开"), "行内说明按新边界重开");
  assert.ok(line!.includes("上下文恢复结果以引擎实际返回为准"), "重开不根据任意文件存在猜原生恢复成功");

  // 重建后指纹已刷新：再发不再重建（连续操作不反复重开）。
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);
  const r3 = await h.mgr.send("三");
  assert.equal(r3.ok, true);
  assert.equal(h.openCalls.filter((r) => r === "A").length, 2, "指纹已更新 ⇒ 不重复重建");
  await h.mgr.stop(null);
});

test("O-1：su（内置治理角色）同样适用——`.ans` pin 刷新（.ans/project.json 内容变化）即触发重建", async () => {
  const dir = makeProject();
  fs.mkdirSync(path.join(dir, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".ans", "project.json"), '{"pins":[]}\n', "utf8");
  const h = makeHarness(listing(dir));
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  const r1 = await h.mgr.send("一");
  assert.equal(r1.ok, true);
  h.streams.su.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);
  assert.equal(h.openCalls.filter((r) => r === "su").length, 1, "未变不重建");

  // pin 刷新（.ans/project.json 被重写）→ su 的会话同样作废重建（内置角色不豁免）。
  fs.writeFileSync(path.join(dir, ".ans", "project.json"), '{"pins":[{"path":"x","sha256":"y"}]}\n', "utf8");
  const r2 = await h.mgr.send("二");
  assert.equal(r2.ok, true);
  assert.equal(h.openCalls.filter((r) => r === "su").length, 2, "su 的会话同样作废重建");
  const line = h.envelopes.map((e) => String(e.event.summary || "")).find((s) => s.includes("边界已更新"));
  assert.ok(line && line.includes(".ans/project.json"), "如实行指出变化的是 .ans/project.json");
  await h.mgr.stop(null);
});

test("O-1：投递路径同样检查——目标边界陈旧 ⇒ 重建后再投（队列不丢、不并发）", async () => {
  const dir = makeProject();
  const h = makeHarness(listing(dir));
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("占位（让 A 忙）");
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su");
  assert.ok(typeof dispatch === "function", "su 会话应注入派发能力");
  await dispatch!({ roleId: "A", task: "队列活" });
  await tick(100);
  assert.deepEqual(h.sent.A, ["占位（让 A 忙）"], "A 忙：派发排队（不并发）");

  // 趁排队期间改 A 的边界 → settled 放行前应先作废重建，再投（队列保留、内容不丢）。
  fs.writeFileSync(path.join(dir, "角色卡", "A", "boundary.yaml"), "entries:\n  - root: project\n  - root: project\n", "utf8");
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(300);
  assert.equal(h.openCalls.filter((r) => r === "A").length, 2, "投递前检出陈旧 ⇒ 作废重建");
  assert.equal(h.sent.A.length, 2, "重建后按序投递（队列不丢）");
  assert.ok(h.sent.A[1].includes("队列活"), "投递内容落到新会话");
  assert.ok(h.envelopes.some((e) => /边界已更新/.test(String(e.event.summary || ""))), "如实行");
  await h.mgr.stop(null);
});

test("O-1 接线钉：信号=读盘内容哈希；检查点=发言/续接/投递/su-settle 扫描；措辞按 D-1 两分支", () => {
  assert.ok(SESSION_SRC.includes('createHash("sha256")'), "信号 = 内容哈希（可信信号，非界面推测）");
  assert.ok(SESSION_SRC.includes("private async boundaryDiff("), "差异检查（逐文件比对）");
  assert.ok(SESSION_SRC.includes("await this.rebuildIfBoundaryStale(targetRoleId, true);"), "发言前检查（send 路径；目标角色入口定格——2026-10-13 竞态修复）");
  assert.ok(SESSION_SRC.includes("this.rebuildIfBoundaryStale(key, userInitiated, selectionVersion);"), "续接（点角色）路径检查保持本次选择版本");
  assert.ok(
    SESSION_SRC.includes("const rebuilt = await this.rebuildIfBoundaryStale(this.sessionKey(projectRoot, resolvedTarget, runtime), false);"),
    "投递前检查（后台路径同样适用）"
  );
  assert.ok(SESSION_SRC.includes("if (entry.busy) return undefined;"), "在跑的轮次不打断（下一时机再查）");
  assert.ok(SESSION_SRC.includes("async refreshStaleBoundaries()"), "全量扫描入口（su settle 触发）");
  assert.ok(IFACE_SRC.includes("void manager.refreshStaleBoundaries();"), "Interface：su 一轮结束（边界可能刚被改）时触发扫描");
  assert.ok(
    SESSION_SRC.includes("上下文恢复结果以引擎实际返回为准") &&
      SESSION_SRC.includes('handle.contextSource === "resumed"') && SESSION_SRC.includes('handle.contextSource === "recovered"'),
    "上下文来源只由引擎实际返回，native resumed/recovered 显式映射，不从文件存在猜恢复"
  );
});
