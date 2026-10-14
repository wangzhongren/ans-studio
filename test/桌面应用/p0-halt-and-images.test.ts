// test/桌面应用/p0-halt-and-images.test.ts
// P0 收官环（2026-10-13 客户批准两项提案）桌面环的**单元证据**：
//
// ① P0-2「停当前轮次」三态：SessionManager.abort 如实回传——
//    - 真实编排句柄 + demo 替身（无 abort）⇒ `{ok:false, supported:false, error:"当前运行时不支持停止"}`；
//    - 句柄 abort 正常 ⇒ 透传 `{ok:true, supported:true}`（同一结果引用）；
//    - 句柄 abort 抛错 ⇒ `{ok:false, supported:true, error:<原文>}`（不吞）；
//    - 旧式替身（句柄不带 abort 方法）⇒ 与 supported:false 同一处理；未知角色 ⇒ 如实无会话。
// ② P0-1「图片端到端」：Interface 层**主进程重校验**（渲染侧声明一律不可信）——
//    - 坏 MIME（真字节非图）⇒ 整条拒发（ok:false，handle 不被触碰）；
//    - 超 5MB ⇒ 整条拒发；
//    - 合法图 ⇒ 组契约 `PromptOptions`（mimeType 以**嗅探结果**为准，声明值仅线索）→ manager → 句柄
//      组合来源与 ACK，图片数组原引用、内容保真；
//    - 队列**入队即定格**：忙时带图入队、settled 放行后图片数组**同一引用**投递（排队后到投递都带原图）。
//
// **不发真实模型请求**：全程假句柄 / demo 替身，无网络、无 Pi SDK、不落盘。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { openRoleSession as realOpenRoleSession, type RoleSessionHandle, type RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { PromptOptions } from "../../src/provider/pi/session.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { listProject, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import { createChatDemoAdapter } from "../../app/desktop/chat-adapter.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** 1×1 PNG（合法魔数 + 真实字节，过嗅探与限幅）。 */
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function listing(): ProjectListing {
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
  return { projectRoot: "/proj", roles: [mk("su", true), mk("A"), mk("B"), mk("C"), mk("桌面窗口")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

interface SentRec {
  text: string;
  opts?: RoleSessionSendOptions;
}

/** 假句柄：登记 (text, opts)；abort 行为可注入（undefined = 旧式替身不带方法）。 */
function makeCaptureHandle(
  roleId: string,
  sent: SentRec[],
  opts: { abortImpl?: () => Promise<{ ok: boolean; supported: boolean; error?: string }>; blocks?: Set<string> } = {},
  streams?: Record<string, OrchestrationEvent[]>,
): RoleSessionHandle {
  let i = 0;
  let stopped = false;
  const h: RoleSessionHandle = {
    async send(text: string, sendOpts?: PromptOptions): Promise<void> {
      if (opts.blocks?.has(text)) {
        // 模拟在飞轮次：块内等待外部放行（放行由测试 push settled 驱动忙态复位）。
        for (let tries = 0; tries < 400 && !stopped; tries += 1) await tick(5);
        if (stopped) return;
      }
      sent.push(sendOpts === undefined ? { text } : { text, opts: sendOpts });
    },
    events(): AsyncIterable<OrchestrationEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              for (let tries = 0; tries < 400; tries += 1) {
                if (stopped) return { value: undefined as unknown as OrchestrationEvent, done: true };
                const arr = (streams?.[roleId] ?? []);
                if (i < arr.length) return { value: arr[i++], done: false };
                await tick(5);
              }
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      stopped = true;
    },
  };
  if (opts.abortImpl !== undefined) {
    h.abort = opts.abortImpl;
  }
  return h;
}

function baseDeps(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    buildProjectConfig,
    getListing: (root: string) => (root === "/proj" ? listing() : undefined),
    emitEvent: () => {},
    ...extra,
  };
}

// ———————————————————— P0-2：停止入口三态 ————————————————————

test("P0-2 abort 三态：demo 替身 ⇒ supported:false（「当前运行时不支持停止」如实，绝不假装已停）", async () => {
  // 真实编排链路（real openRoleSession + demo 适配器）：句柄**恒实现** abort ⇒ supported:false 即真实回答。
  const events: OrchestrationEvent[] = [];
  const repoListing = await listProject(REPO_ROOT);
  const mgr = new SessionManager(
    baseDeps({
      openRoleSession: realOpenRoleSession,
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: createChatDemoAdapter,
      emitEvent: (env: { event: OrchestrationEvent }) => events.push(env.event),
      getListing: (root: string) => (root === repoListing.projectRoot ? repoListing : undefined),
    }) as never,
  );
  const r = await mgr.open({ projectRoot: repoListing.projectRoot, roleId: "桌面窗口", runtime: "demo" });
  assert.equal(r.ok, true);
  const res = await mgr.abort("桌面窗口");
  assert.deepEqual(
    { ok: res.ok, supported: res.supported },
    { ok: false, supported: false },
    "demo 替身不带 abort ⇒ supported:false",
  );
  assert.equal(res.error, "当前运行时不支持停止", "error 承载如实文案（契约钉死）");
  await mgr.stop();
});

test("P0-2 abort 三态：句柄正常 ⇒ 透传同一结果；抛错 ⇒ {ok:false, supported:true, error:<原文>} 不吞；旧式替身（无 abort 方法）与未知角色都如实", async () => {
  const okResult = { ok: true, supported: true };
  const sent: SentRec[] = [];
  const streams: Record<string, OrchestrationEvent[]> = { A: [], B: [], C: [] };
  const mgr = new SessionManager(
    baseDeps({
      openRoleSession: async (input: { roleId: string }) =>
        makeCaptureHandle(
          input.roleId,
          sent,
          {
            abortImpl:
              input.roleId === "A"
                ? async () => okResult
                : input.roleId === "B"
                  ? async () => {
                      throw new Error("SDK 中止失败（演示）");
                    }
                  : undefined, // C：旧式替身——句柄**不带** abort 方法
          },
          streams,
        ),
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
    }) as never,
  );
  for (const id of ["A", "B", "C"]) {
    const r = await mgr.open({ projectRoot: "/proj", roleId: id, runtime: "demo" });
    assert.equal(r.ok, true);
  }

  const ra = await mgr.abort("A");
  assert.equal(ra, okResult as unknown as object, "正常路径**同一结果**透传（不重组、不修饰）");
  const rb = await mgr.abort("B");
  assert.equal(rb.ok, false);
  assert.equal(rb.supported, true, "底层有 abort 但报错 ⇒ supported 仍为 true（能力在、这次失败）");
  assert.equal(rb.error, "SDK 中止失败（演示）", "错误原文如实上抛，不吞");
  const rc = await mgr.abort("C");
  assert.deepEqual(
    { ok: rc.ok, supported: rc.supported, error: rc.error },
    { ok: false, supported: false, error: "当前运行时不支持停止" },
    "方法缺席（旧式替身）与 supported:false 同一处理",
  );
  const ru = await mgr.abort("不存在");
  assert.equal(ru.ok, false, "未知角色：没有可停止的轮次（如实）");
  await mgr.stop();
});

// ———————————————————— P0-1：图片端到端（Interface 重校验 + 透传/定格） ————————————————————

test("P0-1 重校验拒绝路径：坏 MIME（真字节非图）与超 5MB 都**整条拒发**（句柄不被触碰；错误如实）", async () => {
  const sent: SentRec[] = [];
  const desktop = createDesktopInterface(
    baseDeps({
      listProjectFn: async () => listing(),
      openRoleSessionFn: async (input: { roleId: string }) => makeCaptureHandle(input.roleId, sent),
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
    }) as never,
  );
  await desktop.listProject({ projectRoot: "/proj" });
  const opened = await desktop.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(opened.ok, true);

  // 坏 MIME：base64 解码成功但真字节不是任何受支持图片（"hello world"）⇒ 拒。
  const bad = await desktop.sendSession({ text: "带坏图", images: [{ type: "image", data: "aGVsbG8gd29ybGQ=", mimeType: "image/png" }] });
  assert.equal(bad.ok, false, "真字节非图 ⇒ 拒（嗅探为准，声明 mime 不作数）");
  assert.ok((bad.error || "").includes("图片未发送"), "错误如实（图片未发送——本条未发出）");
  assert.equal(sent.length, 0, "整条拒发：句柄**未被触碰**（绝不丢图发文字）");

  // 超 5MB：约 9MB 的 base64（解码前粗算即超上限）⇒ 拒。
  const bigData = Buffer.alloc(5 * 1024 * 1024 + 1024).toString("base64");
  const big = await desktop.sendSession({ text: "带大图", images: [{ type: "image", data: bigData, mimeType: "image/png" }] });
  assert.equal(big.ok, false, "超限 ⇒ 拒");
  assert.ok((big.error || "").includes("图片未发送"), "错误如实");
  assert.equal(sent.length, 0, "句柄仍未被触碰");
});

test("P0-1 合法图：组契约 PromptOptions（mimeType 以**嗅探**为准）→ 句柄图片载荷保真并明确聊天来源", async () => {
  const sent: SentRec[] = [];
  const streams: Record<string, OrchestrationEvent[]> = { A: [] };
  const desktop = createDesktopInterface(
    baseDeps({
      listProjectFn: async () => listing(),
      openRoleSessionFn: async (input: { roleId: string }) => makeCaptureHandle(input.roleId, sent, {}, streams),
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
    }) as never,
  );
  await desktop.listProject({ projectRoot: "/proj" });
  await desktop.openSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });

  // 声明 mimeType 故意给错（image/gif）——类型以**真实字节嗅探**为准（应被改判为 image/png）。
  const res = await desktop.sendSession({
    text: "看图",
    images: [{ type: "image", data: TINY_PNG, mimeType: "image/gif" }],
  });
  assert.equal(res.ok, true, "合法图放行");
  assert.equal(sent.length, 1, "句柄恰被调用一次");
  assert.equal(sent[0].text, "看图");
  const imgs = sent[0].opts?.images;
  assert.ok(Array.isArray(imgs) && imgs.length === 1, "载荷带 images 数组");
  assert.equal(imgs![0].type, "image");
  assert.equal(imgs![0].data, TINY_PNG, "base64 数据**逐字**透传（不重编码）");
  assert.equal(imgs![0].mimeType, "image/png", "mimeType = 嗅探结果（声明值仅线索）");

  // 纯文本仍明确声明聊天来源，但不产生图片字段。先让上一轮以 settled 收尾
  //（忙态由真实事件流复位——与生产同形），再发第二条。
  streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(200);
  await desktop.sendSession({ text: "纯文本" });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].opts?.handback, { required: false }, "纯文本明确chat来源");
  assert.equal(Object.hasOwn(sent[1].opts!, "images"), false, "无图片不制造images字段");
});

test("P0-1 队列入队**定格**：忙时带图入队、settled 放行后图片数组**同一引用**投递（排队后到投递都带原图）", async () => {
  const sent: SentRec[] = [];
  const streams: Record<string, OrchestrationEvent[]> = { A: [] };
  let openedRoleId = "";
  const mgr = new SessionManager(
    baseDeps({
      openRoleSession: async (input: { roleId: string }) => {
        openedRoleId = input.roleId;
        // 第一条直接返回（但忙态要等 settled 事件复位——真实时序同形）；第二条带图走队列。
        return makeCaptureHandle(input.roleId, sent, {}, streams);
      },
      createPiAdapterFactory: () => {
        throw new Error("本用例不应构造 pi 适配器");
      },
      createDemoAdapter: () => {
        throw new Error("本用例不应构造 demo 适配器");
      },
    }) as never,
  );
  await mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);

  const r1 = await mgr.send("第一条");
  assert.equal(r1.ok, true);
  const opts2: PromptOptions = { images: [{ type: "image", data: TINY_PNG, mimeType: "image/png" }] };
  const r2 = await mgr.send("第二条带图", opts2);
  assert.equal(r2.ok, true);
  assert.equal(r2.queued, true, "忙 ⇒ 入队");
  assert.equal(sent.length, 1, "入队期间不并发投递");

  streams.A.push({ kind: "settled", summary: "A 一轮结束" }); // 忙态复位 ⇒ 队列按序放行
  await tick(200);
  assert.equal(sent.length, 2, "settled 后队列投递");
  assert.equal(sent[1].text, "第二条带图");
  assert.ok(sent[1].opts, "投递带载荷");
  assert.notEqual(sent[1].opts, opts2, "来源和ACK使用新外层包，不改客户原包");
  assert.equal(sent[1].opts?.images, opts2.images, "图片数组原引用——排队不变形");
  assert.deepEqual(sent[1].opts?.handback, { required: false }, "排队客户图片仍为chat");
  assert.equal(Object.hasOwn(opts2, "handback"), false, "客户原包不写入编排私有字段");
  assert.equal(sent[1].opts?.images?.[0].data, TINY_PNG, "原图逐字到达");
});
