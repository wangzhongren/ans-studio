import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureDiagnostics, createDiagnosticLogger, disposeDiagnostics, flushDiagnostics,
  getDiagnosticsStatus, DIAGNOSTIC_RETENTION_MS } from "../../../src/common/shared/diagnostics.ts";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-diagnostics-"));
  try { await run(root); } finally { await disposeDiagnostics(); await fs.rm(root, { recursive: true, force: true }); }
}
async function rows(root: string): Promise<Record<string, unknown>[]> {
  const names = (await fs.readdir(root)).filter((name) => /^ans-diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name));
  const texts = await Promise.all(names.map((name) => fs.readFile(path.join(root, name), "utf8")));
  return texts.flatMap((text) => text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)));
}

test("未配置不写盘，配置后门面记录有序元数据", async () => {
  await disposeDiagnostics();
  const log = createDiagnosticLogger({ component: "session", roleId: "A" });
  log.record("before_config");
  await fixture(async (root) => {
    configureDiagnostics({ directory: root });
    log.record("open", { count: 1, prompt: "private prompt", source: "private source" });
    log.record("send", { turnId: "t1", ok: true });
    await flushDiagnostics();
    const data = await rows(root);
    assert.deepEqual(data.map((row) => row.event), ["open", "send"]);
    assert.equal(data[0]?.roleId, "A");
    assert.equal(data[0]?.prompt, undefined);
    assert.equal(data[0]?.source, undefined);
    assert.equal(data[1]?.turnId, "t1");
  });
});

test("精确滚动24h边界：旧行清除，边界行保留，不碰非诊断文件", async () => fixture(async (root) => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const at = (offset: number) => new Date(now - DIAGNOSTIC_RETENTION_MS + offset).toISOString();
  const file = path.join(root, "ans-diagnostics-2026-10-12.jsonl");
  await fs.writeFile(file, [-1, 0, 1].map((offset) => JSON.stringify({ at: at(offset), offset })).join("\n") + "\n");
  await fs.writeFile(path.join(root, "user.jsonl"), "user-data");
  configureDiagnostics({ directory: root, clock: () => now });
  await flushDiagnostics();
  assert.deepEqual((await rows(root)).filter((row) => typeof row.offset === "number").map((row) => row.offset), [0, 1]);
  assert.equal(await fs.readFile(path.join(root, "user.jsonl"), "utf8"), "user-data");
}));

test("写入时清除24h前的最后一条旧日志", async () => fixture(async (root) => {
  let now = Date.parse("2026-10-13T12:00:00Z");
  configureDiagnostics({ directory: root, clock: () => now });
  const log = createDiagnosticLogger({ component: "test" });
  log.record("old"); await flushDiagnostics();
  now += DIAGNOSTIC_RETENTION_MS + 1;
  log.record("new"); await flushDiagnostics();
  assert.deepEqual((await rows(root)).map((row) => row.event), ["new"]);
}));

test("清理和日志追加串行，不丢并发事件", async () => fixture(async (root) => {
  configureDiagnostics({ directory: root });
  const log = createDiagnosticLogger({ component: "test" });
  for (let count = 0; count < 50; count++) log.record("event", { count });
  await flushDiagnostics();
  assert.deepEqual((await rows(root)).map((row) => row.count), Array.from({ length: 50 }, (_, i) => i));
}));

test("错误日志净化凭据和Bearer，不存原对象或源内容", async () => fixture(async (root) => {
  const name = "ANS_DIAGNOSTIC_TEST_API_KEY";
  const previous = process.env[name];
  process.env[name] = "diagnostic-private-sentinel";
  try {
    configureDiagnostics({ directory: root });
    const log = createDiagnosticLogger({ component: "test" });
    log.error("failed", new Error("diagnostic-private-sentinel Bearer bearer-sentinel token=token-sentinel"),
      { token: "private-token", argv: ["secret"], source: "source-sentinel", durationMs: 2, object: { private: true } });
    await flushDiagnostics();
    const text = JSON.stringify(await rows(root));
    for (const secret of ["diagnostic-private-sentinel", "bearer-sentinel", "token-sentinel", "private-token", "source-sentinel"])
      assert.ok(!text.includes(secret));
    assert.match(text, /REDACTED/);
    assert.equal((await rows(root))[0]?.level, "error");
  } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
}));

test("存储失败不抛业务异常，状态可查且仍固定24h", async () => fixture(async (root) => {
  const file = path.join(root, "occupied"); await fs.writeFile(file, "user-data");
  configureDiagnostics({ directory: file });
  assert.doesNotThrow(() => createDiagnosticLogger({ component: "test" }).record("open"));
  await flushDiagnostics();
  assert.ok(getDiagnosticsStatus().lastError);
  assert.equal(getDiagnosticsStatus().retentionMs, DIAGNOSTIC_RETENTION_MS);
  assert.equal(await fs.readFile(file, "utf8"), "user-data");
}));

test("维护定时器自动清理24h前记录", async () => {
  // 在独立进程以node mock timers推进一分钟，验证无新写入也会清理。
  const { spawnSync } = await import("node:child_process");
  const modulePath = new URL("../../../src/common/shared/diagnostics.ts", import.meta.url).href;
  const script = `import {mock} from 'node:test'; import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
    import {configureDiagnostics,createDiagnosticLogger,flushDiagnostics,disposeDiagnostics,DIAGNOSTIC_RETENTION_MS,DIAGNOSTIC_MAINTENANCE_MS} from ${JSON.stringify(modulePath)};
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'ans-log-timer-')); let now=Date.parse('2026-10-13T12:00:00Z');
    mock.timers.enable({apis:['setInterval']}); configureDiagnostics({directory:root,clock:()=>now});
    createDiagnosticLogger({component:'test'}).record('old'); await flushDiagnostics(); now+=DIAGNOSTIC_RETENTION_MS+1;
    mock.timers.tick(DIAGNOSTIC_MAINTENANCE_MS); await flushDiagnostics(); const remaining=await fs.readdir(root);
    await disposeDiagnostics(); mock.timers.reset(); await fs.rm(root,{recursive:true,force:true}); if(remaining.length) throw new Error('old log survived');`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
});

test("真实维护定时器不阻止进程正常退出", async () => fixture(async (root) => {
  const { spawnSync } = await import("node:child_process");
  const modulePath = new URL("../../../src/common/shared/diagnostics.ts", import.meta.url).href;
  const script = `import {configureDiagnostics,createDiagnosticLogger,flushDiagnostics} from ${JSON.stringify(modulePath)};
    configureDiagnostics({directory:${JSON.stringify(root)}}); createDiagnosticLogger({component:'exit-probe'}).record('ready'); await flushDiagnostics();`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await rows(root)).map((row) => row.event), ["ready"]);
}));
