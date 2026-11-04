// test/测试/download-requests-ac22.test.ts
// AC-22 补证（2026-11-04 客户裁定 A：下载卡与决策卡只在**同一 customer-input 通道**排队；
// 不实施跨通道仲裁）。跨层装配：真实 customer-input 通道 + 真实 C1 卡片组装（buildDownloadCardRequest）
// + 真实 B1 下载 Pipeline（Provider 传输为本地替身）。不启动 Electron、不触网。
//
// 场景：
//   1) 决策卡在前、下载卡在后：决策卡呈现；下载卡进入 waiting（onQueued）；决策卡作答后下载卡才呈现；
//      下载卡仍须自身作答（不被决策卡结算影响）；最终下载成功。
//   2) 反向：下载卡在前、决策卡在后：决策卡排队；下载卡作答后决策卡呈现并各自结算。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createCustomerInputChannel,
  type DesktopCustomerInputFn,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import { buildDownloadCardRequest, toDownloadApprovalOutcome } from "../../app/desktop/download-request.ts";
import { createDownloadRequestRuntimeForTest } from "../../src/pipeline/orchestration/download-request.ts";
import type {
  DownloadApprovalPresenter,
  DownloadApprovalRequest,
} from "../../src/pipeline/orchestration/download-request.ts";
import type { DownloadTransport, HostResolver } from "../../src/provider/download/public/download-provider.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";

const PUBLIC_IP = "93.184.216.34";

const resolver: HostResolver = {
  async resolve() {
    return { addresses: [{ address: PUBLIC_IP, family: 4 }] };
  },
};

const transport: DownloadTransport = {
  async execute(request) {
    await request.onStarted({ finalUrl: request.url, fileName: "ac22.bin" });
    return {
      ok: true,
      finalUrl: request.url,
      fileName: "ac22.bin",
      pathRel: "download/ac22.bin",
      bytes: 3,
      sha256: "a".repeat(64),
      durationMs: 1,
    };
  },
};

interface Harness {
  root: string;
  channel: ReturnType<typeof createCustomerInputChannel>;
  payloads: OperatorRequestPayload[];
  queued: OperatorRequestPayload[];
  runtime: ReturnType<typeof createDownloadRequestRuntimeForTest>;
  presentedAt: (label: string) => number;
  presentedCount: () => number;
  cleanup: () => Promise<void>;
}

async function makeHarness(): Promise<Harness> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-ac22-"));
  const payloads: OperatorRequestPayload[] = [];
  const queued: OperatorRequestPayload[] = [];
  const presentations: Record<string, number> = {};
  let reqSeq = 0;
  let downloadShown = 0;

  const channel = createCustomerInputChannel({
    presenter: (payload) => {
      payloads.push(payload);
      if (payload.request && payload.request.cardKind === "download") downloadShown += 1;
    },
    operatorId: "ac22-customer",
    onQueued: (payload) => queued.push(payload),
    judge: { isGroupEnabled: () => false },
  });

  const presenter: DownloadApprovalPresenter = {
    async present(request: DownloadApprovalRequest, hooks) {
      const card = buildDownloadCardRequest(request);
      const requestId = `req-ac22-${++reqSeq}`;
      let notified = false;
      const notify = (): void => {
        if (notified) return;
        notified = true;
        presentations[requestId] = downloadShown;
        try {
          hooks.onPresented({ requestId });
        } catch {
          /* 与 C1 同：呈现回调失败不影响卡片 */
        }
      };
      const context = {
        roleId: "worker",
        runtime: "pi",
        projectRoot: root,
        governanceModel: "trio",
        onPresented: notify,
      } as Parameters<DesktopCustomerInputFn>[1];
      const outcome = await channel.customerInput(card.request, context, card.metadata);
      return toDownloadApprovalOutcome(outcome);
    },
  };

  const runtime = createDownloadRequestRuntimeForTest(
    {
      projectRoot: root,
      roleId: "worker",
      runtime: "pi",
      appVersion: "ac22-test",
      present: presenter,
    },
    { resolver, provider: transport },
  );

  return {
    root,
    channel,
    payloads,
    queued,
    runtime,
    presentedAt: (label) => presentations[label] ?? -1,
    presentedCount: () => downloadShown,
    cleanup: async () => {
      await runtime.dispose();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function decisionCard(): CustomerInputRequest {
  return {
    kind: "choice",
    cardKind: "decision",
    application: true,
    flowId: "flow-ac22",
    title: "决策卡（AC-22）",
    options: [
      { id: "alpha", label: "方案 Alpha", recommended: true },
      { id: "beta", label: "方案 Beta" },
    ],
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("AC-22（裁定 A）：决策卡在前 → 下载卡 waiting → 决策卡作答后下载卡呈现 → 各自结算", async () => {
  const h = await makeHarness();
  try {
    // 1) 决策卡先呈现（真实通道，同项目）。
    const decisionPending = h.channel.customerInput(
      decisionCard(),
      {
        roleId: "worker",
        runtime: "pi",
        projectRoot: h.root,
        governanceModel: "trio",
      } as Parameters<DesktopCustomerInputFn>[1],
      undefined,
    );
    await waitFor(() => h.payloads.length === 1, "决策卡呈现");
    assert.equal(h.payloads[0]!.request.cardKind, "decision");

    // 2) 下载请求进入同一通道：下载卡排队，不呈现。
    let downloadDone = false;
    const downloadPending = h.runtime
      .download({ url: "http://example.com/ac22.bin", purpose: "AC-22 下载" })
      .finally(() => {
        downloadDone = true;
      });
    await waitFor(() => h.queued.length === 1, "下载卡排队");
    assert.equal(h.queued[0]!.request.cardKind, "download");
    assert.equal(h.payloads.length, 1, "决策卡未决时下载卡不得呈现");
    assert.equal(h.presentedCount(), 0, "下载 presenter 尚未呈现");
    assert.equal(downloadDone, false);

    // 3) 决策卡作答 → 下载卡才呈现；下载仍必须自身作答。
    h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "choice", selected: ["alpha"] } });
    const decisionOutcome = await decisionPending;
    assert.equal(decisionOutcome?.outcome, "answered");
    await waitFor(() => h.payloads.length === 2, "下载卡呈现");
    assert.equal(h.payloads[1]!.request.cardKind, "download");
    assert.equal(h.presentedCount(), 1);
    assert.equal(downloadDone, false, "下载卡未作答前不得结算");

    // 4) 下载卡作答 → 下载完成（未被决策卡结算影响/取消）。
    h.channel.respond({ id: h.payloads[1]!.id, decision: { kind: "confirm", confirmed: true } });
    const result = await downloadPending;
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) {
      assert.equal(result.path, "download/ac22.bin");
      assert.equal(result.approval.kind, "customer");
    }
  } finally {
    await h.cleanup();
  }
});

test("AC-22（裁定 A）反向：下载卡在前 → 决策卡 waiting → 下载卡作答后决策卡呈现并各自结算", async () => {
  const h = await makeHarness();
  try {
    // 1) 下载卡先呈现。
    const downloadPending = h.runtime.download({ url: "http://example.com/ac22.bin", purpose: "AC-22 反向" });
    await waitFor(() => h.payloads.length === 1, "下载卡呈现");
    assert.equal(h.payloads[0]!.request.cardKind, "download");

    // 2) 决策卡进入同一通道：排队、不呈现（不实现跨通道仲裁）。
    const decisionPending = h.channel.customerInput(
      decisionCard(),
      {
        roleId: "worker",
        runtime: "pi",
        projectRoot: h.root,
        governanceModel: "trio",
      } as Parameters<DesktopCustomerInputFn>[1],
      undefined,
    );
    await waitFor(() => h.queued.length === 1, "决策卡排队");
    assert.equal(h.queued[0]!.request.cardKind, "decision");
    assert.equal(h.payloads.length, 1, "下载卡未决时决策卡不得呈现");

    // 3) 下载卡作答 → 决策卡呈现；决策卡仍需自身作答。
    h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
    const downloadResult = await downloadPending;
    assert.equal(downloadResult.ok, true, JSON.stringify(downloadResult));
    await waitFor(() => h.payloads.length === 2, "决策卡呈现");
    assert.equal(h.payloads[1]!.request.cardKind, "decision");

    h.channel.respond({ id: h.payloads[1]!.id, decision: { kind: "choice", selected: ["beta"] } });
    const decisionOutcome = await decisionPending;
    assert.equal(decisionOutcome?.outcome, "answered");
  } finally {
    await h.cleanup();
  }
});
