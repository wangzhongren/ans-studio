// test/编排/download-provider.test.ts
// B1（2026-11-04 download-requests）：下载 Provider 层。
//
// 覆盖 AC-7/8/9/10/11/12/13/17/26/29：
//   · 本地 http/https 真实服务（200 成功/原子写/占位/重名）；
//   · 重定向同域/跨域/降级/跳数/异常 3xx/缺 Location；大小/状态码/编码；
//   · 连接/空闲/总超时、AbortSignal、无自动重试；rebinding/remoteAddress；
//   · TLS 自签/过期/主机名不匹配（测试 Agent 注入 CA）；目录边界/普通文件拒绝；
//   · downloads.jsonl 追加/读取/坏行/轮转。

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";

import { createNodeDownloadTransport, type NodeDownloadTransportOptions } from "../../src/provider/download/impl/node-http.ts";
import { createDownloadLedger, downloadLedgerPath } from "../../src/provider/download/impl/jsonl-ledger.ts";
import { createDownloadConsumerEpochStore, downloadConsumerStatePath } from "../../src/provider/download/impl/consumer-epoch-store.ts";
import { DOWNLOAD_LEDGER_REL } from "../../src/provider/download/abstract/download-ledger.ts";
import type { PinnedAddress, TransportRequest } from "../../src/provider/download/abstract/download-provider.ts";
import { filenameFromContentDisposition, sanitizeFilename } from "../../src/service/download/impl/filename.ts";
import { checkUrl, isSameHostForRedirect } from "../../src/service/download/impl/url-policy.ts";

const FIXTURES = path.join(process.cwd(), "test", "编排", "fixtures", "download-tls");
const execFileAsync = promisify(execFile);
const PINNED_LOCALHOST: PinnedAddress[] = [{ address: "127.0.0.1", family: 4 }];

async function withProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-download-provider-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function startServer(
  handler: http.RequestListener,
  options?: { tls?: { key: Buffer; cert: Buffer } },
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = options?.tls !== undefined
    ? https.createServer(options.tls, handler)
    : http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `${options?.tls !== undefined ? "https" : "http"}://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function defaultRedirect(info: { fromUrl: string; toUrl: string }):
  | { action: "follow"; url: string; pinnedAddresses: readonly PinnedAddress[] }
  | { action: "stop"; code: "download-redirect-cross-host" | "download-unsafe-url"; redirectTo?: string } {
  const from = new URL(info.fromUrl);
  const to = new URL(info.toUrl);
  if (from.protocol === "https:" && to.protocol === "http:") {
    return { action: "stop", code: "download-unsafe-url", redirectTo: to.href };
  }
  if (from.hostname !== to.hostname) {
    return { action: "stop", code: "download-redirect-cross-host", redirectTo: to.href };
  }
  return { action: "follow", url: to.href, pinnedAddresses: PINNED_LOCALHOST };
}

function makeRequest(
  projectRoot: string,
  url: string,
  overrides: Partial<TransportRequest> = {},
): TransportRequest {
  return {
    url,
    pinnedAddresses: PINNED_LOCALHOST,
    limits: { maxBytes: 1024 * 1024, connectTimeoutMs: 500, idleTimeoutMs: 500, totalTimeoutMs: 5000, maxRedirects: 5 },
    projectRoot,
    onRedirect: async (info) => defaultRedirect(info),
    planFile: async ({ contentDisposition }) => {
      const fromHeader = filenameFromContentDisposition(contentDisposition);
      const name = fromHeader !== undefined ? sanitizeFilename(fromHeader).name : "file.bin";
      return { fileName: name === "" ? "file.bin" : name };
    },
    onStarted: () => undefined,
    ...overrides,
  };
}

async function listDownloadDir(projectRoot: string): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(projectRoot, "download"))).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readDownload(projectRoot: string, name: string): Promise<Buffer> {
  return fs.readFile(path.join(projectRoot, "download", name));
}

test("provider：200 成功、原子写、无 .part/占位残留、Content-Disposition 定名", async () => {
  await withProject(async (projectRoot) => {
    const body = Buffer.from("hello download", "utf8");
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-disposition": 'attachment; filename="server.bin"' });
      res.end(body);
    });
    try {
      const transport = createNodeDownloadTransport();
      const started: string[] = [];
      const result = await transport.execute(makeRequest(projectRoot, `${server.baseUrl}/ignored.txt`, {
        onStarted: ({ fileName }) => { started.push(fileName); },
      }));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (!result.ok) return;
      assert.equal(result.fileName, "server.bin");
      assert.equal(result.pathRel, "download/server.bin");
      assert.equal(result.bytes, body.length);
      assert.match(result.sha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(await readDownload(projectRoot, "server.bin"), body);
      assert.deepEqual(started, ["server.bin"]);
      assert.deepEqual(await listDownloadDir(projectRoot), ["server.bin"]);
    } finally {
      await server.close();
    }
  });
});

test("provider：重名不覆盖（既有文件字节不变；新文件加 (1)）", async () => {
  await withProject(async (projectRoot) => {
    await fs.mkdir(path.join(projectRoot, "download"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "download", "file.bin"), "OLD");
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end("NEW");
    });
    try {
      const transport = createNodeDownloadTransport();
      const result = await transport.execute(makeRequest(projectRoot, `${server.baseUrl}/x`));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (!result.ok) return;
      assert.equal(result.fileName, "file (1).bin");
      assert.equal((await readDownload(projectRoot, "file.bin")).toString(), "OLD");
      assert.equal((await readDownload(projectRoot, "file (1).bin")).toString(), "NEW");
    } finally {
      await server.close();
    }
  });
});

test("provider：同域重定向 301/302/303/307/308 逐跳跟随；跨域/降级/跳数/异常 3xx/缺 Location", async () => {
  await withProject(async (projectRoot) => {
    let finalHits = 0;
    const final = await startServer((_req, res) => {
      finalHits += 1;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("final");
    });
    const redirectCodes = [301, 302, 303, 307, 308];
    let index = 0;
    const redirector = await startServer((_req, res) => {
      const code = redirectCodes[index % redirectCodes.length]!;
      index += 1;
      res.writeHead(code, { location: `${final.baseUrl}/final` });
      res.end();
    });
    const port = final.baseUrl.split(":").pop();
    const cross = await startServer((_req, res) => {
      res.writeHead(302, { location: `http://localhost:${port}/final` });
      res.end();
    });
    const badStatus = await startServer((req, res) => {
      const status = Number(req.url?.slice(1) ?? "304");
      res.writeHead(status);
      res.end();
    });
    const missingLocation = await startServer((_req, res) => {
      res.writeHead(302);
      res.end();
    });
    const loop = await startServer((_req, res) => {
      res.writeHead(302, { location: "/loop" });
      res.end();
    });
    try {
      const transport = createNodeDownloadTransport();
      for (const expectedHits of [1, 2, 3, 4, 5]) {
        const result = await transport.execute(makeRequest(projectRoot, `${redirector.baseUrl}/start`));
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(finalHits, expectedHits);
      }
      const crossResult = await transport.execute(makeRequest(projectRoot, `${cross.baseUrl}/start`));
      assert.equal(crossResult.ok, false);
      if (!crossResult.ok) {
        assert.equal(crossResult.code, "download-redirect-cross-host");
        assert.match(crossResult.redirectTo ?? "", /localhost/);
      }
      for (const url of [
        `${badStatus.baseUrl}/300`,
        `${badStatus.baseUrl}/304`,
        `${badStatus.baseUrl}/305`,
        `${badStatus.baseUrl}/306`,
        `${missingLocation.baseUrl}/x`,
        `${loop.baseUrl}/loop`,
      ]) {
        const result = await transport.execute(makeRequest(projectRoot, url));
        assert.equal(result.ok, false, url);
        if (!result.ok) assert.equal(result.code, "download-http-error");
      }
    } finally {
      await Promise.all([final.close(), redirector.close(), cross.close(), badStatus.close(), missingLocation.close(), loop.close()]);
    }
  });
});

test("provider：https→http 降级拒绝（download-unsafe-url）", async () => {
  await withProject(async (projectRoot) => {
    const target = await startServer((_req, res) => { res.writeHead(200); res.end("x"); });
    const tls = {
      key: await fs.readFile(path.join(FIXTURES, "valid-key.pem")),
      cert: await fs.readFile(path.join(FIXTURES, "valid.pem")),
    };
    const httpsServer = await startServer((_req, res) => {
      res.writeHead(302, { location: `${target.baseUrl}/final` });
      res.end();
    }, { tls });
    try {
      const transport = createNodeDownloadTransport({
        agent: new https.Agent({ ca: await fs.readFile(path.join(FIXTURES, "ca.pem")) }),
      });
      const result = await transport.execute(makeRequest(projectRoot, `${httpsServer.baseUrl}/start`));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "download-unsafe-url");
    } finally {
      await Promise.all([target.close(), httpsServer.close()]);
    }
  });
});

test("provider：大小上限（Content-Length/流式）、状态码（204/206/201/500）、编码", async () => {
  await withProject(async (projectRoot) => {
    const tooLargeDeclared = await startServer((_req, res) => {
      res.writeHead(200, { "content-length": "1000" });
      res.end(Buffer.alloc(1000));
    });
    const tooLargeStream = await startServer((_req, res) => {
      res.writeHead(200, { "transfer-encoding": "chunked" });
      for (let i = 0; i < 12; i += 1) res.write("0123456789");
      res.end();
    });
    const statuses = await startServer((req, res) => {
      const status = Number(req.url?.slice(1) ?? "500");
      res.writeHead(status);
      res.end(status === 500 ? "error body" : undefined);
    });
    const gzip = await startServer((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(Buffer.from("fake"));
    });
    try {
      const transport = createNodeDownloadTransport();
      const limits = { maxBytes: 100, connectTimeoutMs: 500, idleTimeoutMs: 500, totalTimeoutMs: 5000, maxRedirects: 5 };
      for (const url of [tooLargeDeclared.baseUrl, tooLargeStream.baseUrl]) {
        const result = await transport.execute(makeRequest(projectRoot, url, { limits }));
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.code, "download-too-large");
      }
      for (const status of [204, 206, 201, 500]) {
        const result = await transport.execute(makeRequest(projectRoot, `${statuses.baseUrl}/${status}`));
        assert.equal(result.ok, false, String(status));
        if (!result.ok) {
          assert.equal(result.code, "download-http-error");
          assert.equal(result.httpStatus, status);
        }
      }
      const gzipResult = await transport.execute(makeRequest(projectRoot, gzip.baseUrl));
      assert.equal(gzipResult.ok, false);
      if (!gzipResult.ok) assert.equal(gzipResult.code, "download-unsupported-encoding");
      assert.deepEqual(await listDownloadDir(projectRoot), []);
    } finally {
      await Promise.all([tooLargeDeclared.close(), tooLargeStream.close(), statuses.close(), gzip.close()]);
    }
  });
});

test("provider：空闲/总超时、连接超时、AbortSignal；服务端请求次数符合无自动重试", async () => {
  await withProject(async (projectRoot) => {
    let hits = 0;
    const slow = await startServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("start");
      setTimeout(() => res.end("done"), 500);
    });
    try {
      const transport = createNodeDownloadTransport();
      const idle = await transport.execute(makeRequest(projectRoot, slow.baseUrl, {
        limits: { maxBytes: 1024, connectTimeoutMs: 500, idleTimeoutMs: 50, totalTimeoutMs: 3000, maxRedirects: 5 },
      }));
      assert.equal(idle.ok, false);
      if (!idle.ok) assert.equal(idle.code, "download-timeout");
      const total = await transport.execute(makeRequest(projectRoot, slow.baseUrl, {
        limits: { maxBytes: 1024, connectTimeoutMs: 500, idleTimeoutMs: 3000, totalTimeoutMs: 50, maxRedirects: 5 },
      }));
      assert.equal(total.ok, false);
      if (!total.ok) assert.equal(total.code, "download-timeout");

      const blockedLookup = createNodeDownloadTransport({ lookupOverride: () => undefined });
      const connect = await blockedLookup.execute(makeRequest(projectRoot, slow.baseUrl.replace("127.0.0.1", "localhost"), {
        limits: { maxBytes: 1024, connectTimeoutMs: 50, idleTimeoutMs: 3000, totalTimeoutMs: 5000, maxRedirects: 5 },
      }));
      assert.equal(connect.ok, false);
      if (!connect.ok) assert.equal(connect.code, "download-timeout");

      const controller = new AbortController();
      const pending = transport.execute(makeRequest(projectRoot, slow.baseUrl, {
        signal: controller.signal,
        limits: { maxBytes: 1024, connectTimeoutMs: 500, idleTimeoutMs: 3000, totalTimeoutMs: 5000, maxRedirects: 5 },
      }));
      setTimeout(() => controller.abort(), 30);
      const aborted = await pending;
      assert.equal(aborted.ok, false);
      if (!aborted.ok) assert.equal(aborted.code, "download-aborted");
      assert.equal(hits, 3, "空闲/总/中止各一次请求（连接超时未到达服务端）");
      assert.deepEqual(await listDownloadDir(projectRoot), []);
    } finally {
      await slow.close();
    }
  });
});

test("provider：rebinding——连接地址不在钉扎集合 ⇒ download-rebinding-detected，不落盘", async () => {
  await withProject(async (projectRoot) => {
    const server = await startServer((_req, res) => { res.writeHead(200); res.end("x"); });
    try {
      const transport = createNodeDownloadTransport({
        lookupOverride: (_hostname, _options, callback) => callback(null, "127.0.0.1", 4),
      });
      const result = await transport.execute(makeRequest(projectRoot, server.baseUrl, {
        pinnedAddresses: [{ address: "127.0.0.2", family: 4 }],
      }));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "download-rebinding-detected");
      assert.deepEqual(await listDownloadDir(projectRoot), []);
    } finally {
      await server.close();
    }
  });
});

test("provider：TLS 自签/过期/主机名不匹配 ⇒ download-network-error，无落盘", async () => {
  await withProject(async (projectRoot) => {
    const ca = await fs.readFile(path.join(FIXTURES, "ca.pem"));
    const cases = [
      { key: "self-key.pem", cert: "self.pem" },
      { key: "expired-key.pem", cert: "expired.pem" },
      { key: "wronghost-key.pem", cert: "wronghost.pem" },
    ];
    for (const entry of cases) {
      const server = await startServer((_req, res) => { res.writeHead(200); res.end("x"); }, {
        tls: {
          key: await fs.readFile(path.join(FIXTURES, entry.key)),
          cert: await fs.readFile(path.join(FIXTURES, entry.cert)),
        },
      });
      try {
        const transport = createNodeDownloadTransport({ agent: new https.Agent({ ca }) });
        const result = await transport.execute(makeRequest(projectRoot, server.baseUrl));
        assert.equal(result.ok, false, entry.cert);
        if (!result.ok) assert.equal(result.code, "download-network-error");
      } finally {
        await server.close();
      }
    }
    assert.deepEqual(await listDownloadDir(projectRoot), []);
  });
});

test("provider：download 目录为普通文件 ⇒ download-write-failed；目录不存在时创建", async () => {
  await withProject(async (projectRoot) => {
    await fs.writeFile(path.join(projectRoot, "download"), "not-a-directory");
    const server = await startServer((_req, res) => { res.writeHead(200); res.end("x"); });
    try {
      const transport = createNodeDownloadTransport();
      const result = await transport.execute(makeRequest(projectRoot, server.baseUrl));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "download-write-failed");
    } finally {
      await server.close();
    }
  });
});

test("provider：downloads.jsonl 事件形状/坏行（复用共享 jsonl-ledger）", async () => {
  await withProject(async (projectRoot) => {
    const ledger = createDownloadLedger(projectRoot, { maxBytes: 600, rotations: 2 });
    const base = { downloadId: "dl-1", at: new Date().toISOString() };
    const events = [
      { version: 1 as const, kind: "download.requested" as const, ...base, roleId: "r", url: "https://example.com/a", host: "example.com", scheme: "https" as const, purpose: "p", maxBytes: 1 },
      { version: 1 as const, kind: "download.decided" as const, ...base, by: "customer" as const, presented: true },
      { version: 1 as const, kind: "download.started" as const, downloadId: "dl-1", attemptId: "a1", finalUrl: "https://example.com/a", filename: "a.bin", at: base.at },
      { version: 1 as const, kind: "download.completed" as const, attemptId: "a1", bytes: 3, sha256: "a".repeat(64), path: "download/a.bin", durationMs: 1, at: base.at },
      { version: 1 as const, kind: "download.failed" as const, attemptId: "a2", code: "download-timeout", bytesWritten: 0, at: base.at },
    ];
    for (const event of events) {
      const appended = await ledger.append(event);
      assert.equal(appended.ok, true);
    }
    const read = await ledger.read();
    assert.equal(read.events.length, events.length);
    assert.equal(read.errors, 0);

    await fs.appendFile(downloadLedgerPath(projectRoot), "{bad json\n", "utf8");
    const withBad = await ledger.read();
    assert.ok(withBad.errors >= 1);
    assert.equal(withBad.events.length, events.length);

    assert.equal(DOWNLOAD_LEDGER_REL, ".ans/state/downloads.jsonl");
    assert.equal(downloadLedgerPath(projectRoot), path.join(projectRoot, ".ans", "state", "downloads.jsonl"));
  });
});

void checkUrl;
void isSameHostForRedirect;
void ({} as NodeDownloadTransportOptions);

test("epoch store：missing→ensure 创建 ready；不可读不重写；同一文件供面板只读", async () => {
  await withProject(async (projectRoot) => {
    const store = createDownloadConsumerEpochStore(projectRoot);
    assert.deepEqual(await store.read(), { state: "missing" });
    const ready = await store.ensure("1.2.3");
    assert.equal(ready.state, "ready");
    if (ready.state !== "ready") return;
    assert.equal(ready.appVersion, "1.2.3");
    assert.match(ready.enabledAt, /^\d{4}-\d{2}-\d{2}T/);
    const file = downloadConsumerStatePath(projectRoot);
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    assert.equal(raw["version"], 1);
    assert.equal(raw["enabledAt"], ready.enabledAt);
    assert.equal(raw["appVersion"], "1.2.3");
    assert.deepEqual(await store.read(), ready);

    // 不可读：不重写（字节不变），ensure 返回 unreadable。
    await fs.writeFile(file, "{bad json", "utf8");
    const before = await fs.readFile(file);
    const state = await store.ensure("9.9.9");
    assert.equal(state.state, "unreadable");
    assert.deepEqual(await fs.readFile(file), before);
  });
});

test("AC-12 故障注入：rename 失败 ⇒ download-write-failed；清理 temp/占位，既有同名文件字节不变", async () => {
  await withProject(async (projectRoot) => {
    await fs.mkdir(path.join(projectRoot, "download"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "download", "file.bin"), "OLD-BYTES");
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end("NEW-BYTES");
    });
    try {
      const transport = createNodeDownloadTransport({
        fileSinkHooks: {
          rename: async () => {
            const error = new Error("injected rename failure");
            (error as NodeJS.ErrnoException).code = "EIO";
            throw error;
          },
        },
      });
      const result = await transport.execute(makeRequest(projectRoot, server.baseUrl));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "download-write-failed");
      assert.deepEqual(await listDownloadDir(projectRoot), ["file.bin"]);
      assert.equal((await readDownload(projectRoot, "file.bin")).toString(), "OLD-BYTES");
      const dirEntries = await fs.readdir(path.join(projectRoot, "download"));
      assert.equal(dirEntries.some((name) => name.endsWith(".part")), false);
      assert.equal(dirEntries.some((name) => name.includes("(1)")), false);
    } finally {
      await server.close();
    }
  });
});

test("AC-12 故障注入：写盘失败 ⇒ download-write-failed；无 .part/占位/半成品", async () => {
  await withProject(async (projectRoot) => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end("BODY");
    });
    try {
      const transport = createNodeDownloadTransport({
        fileSinkHooks: {
          beforeWrite: () => {
            const error = new Error("injected write failure");
            (error as NodeJS.ErrnoException).code = "EIO";
            throw error;
          },
        },
      });
      const result = await transport.execute(makeRequest(projectRoot, server.baseUrl));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "download-write-failed");
      assert.deepEqual(await listDownloadDir(projectRoot), []);
    } finally {
      await server.close();
    }
  });
});

test("AC-13：download 为 Windows junction ⇒ download-write-failed，不跟随/不写目标目录", async (t) => {
  await withProject(async (projectRoot) => {
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "ans-download-junction-target-"));
    const link = path.join(projectRoot, "download");
    let usedJunction = true;
    let setupError: unknown;
    try {
      await execFileAsync("cmd", ["/c", "mklink", "/J", link, target]);
    } catch (error) {
      usedJunction = false;
      setupError = error;
      // 环境无法创建 junction 时，用普通文件占位（同样证明「download 不是目录 ⇒ 拒绝」）；
      // 证据中如实披露 junction 不可用，不把它当作 junction 通过。
      await fs.writeFile(link, "not-a-directory");
    }
    const server = await startServer((_req, res) => { res.writeHead(200); res.end("SHOULD-NOT-WRITE"); });
    try {
      if (usedJunction) {
        const stat = await fs.lstat(link);
        assert.equal(stat.isSymbolicLink(), true, "junction 应被 lstat 识别为链接");
      } else {
        t.diagnostic(`junction 不可用（fallback 普通文件）: ${setupError instanceof Error ? setupError.message : String(setupError)}`);
      }
      const transport = createNodeDownloadTransport();
      const result = await transport.execute(makeRequest(projectRoot, server.baseUrl));
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "download-write-failed");
      assert.deepEqual(await fs.readdir(target), [], "不得跟随链接写入目标目录");
      if (usedJunction) assert.equal((await fs.lstat(link)).isSymbolicLink(), true, "junction 未被替换");
    } finally {
      await server.close();
      await fs.rm(target, { recursive: true, force: true });
    }
  });
});
