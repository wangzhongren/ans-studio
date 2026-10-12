// 会话持久化与恢复（设计 D-1，重启恢复）单测。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（未安装则整组跳过，同 real-adapter.smoke 先例）。
//
// 覆盖：
//   1. **不给 `sessionDir` → in-memory**（逐字旧行为）：不落盘、无会话文件；
//   2. 给 `sessionDir` → 新建：目录自建、**首条消息前惰性不落盘**；追加消息后文件存在、非空、含该消息；
//   3. **同目录再选 → 恢复**：同一文件、`buildSessionContext().messages` 非空且含原文（entry 往返）；
//   4. 目录内多个会话 → 恢复**最近**的一个；
//   5. **端到端（faux provider，离线）**：真实 `createAgentSession` 跑一轮 → dispose（模拟关应用）→
//      以同一 sessionDir 重新构造 → 恢复出的 `session.state.messages` 即含上一轮内容（重启恢复的本层证据）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { selectSessionManager } from "../../src/common/pi-adapter/real-adapter.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";

type Pi = typeof import("@earendil-works/pi-coding-agent");

async function loadPi(): Promise<Pi | undefined> {
  try {
    return await import("@earendil-works/pi-coding-agent");
  } catch {
    return undefined;
  }
}

/** 造一条合法的 user 消息（UserMessage：role/content/timestamp），供 appendMessage 用。 */
function user(text: string): { role: "user"; content: string; timestamp: number } {
  return { role: "user", content: text, timestamp: Date.now() };
}

async function inTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-session-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// —————————————————————— 1. 不给 sessionDir → in-memory（旧行为） ——————————————————————

test("不给 sessionDir：选 in-memory（逐字旧行为），追加消息也不落盘", async (t) => {
  const pi = await loadPi();
  if (pi === undefined) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await inTempDir(async (dir) => {
    const sel = await selectSessionManager(pi.SessionManager, { cwd: dir });
    assert.equal(sel.mode, "in-memory");
    assert.equal(sel.manager.isPersisted(), false, "in-memory 不应持久化");
    assert.equal(sel.manager.getSessionFile(), undefined, "in-memory 无会话文件");

    sel.manager.appendMessage(user("你好"));
    assert.equal(sel.manager.getSessionFile(), undefined, "追加后仍无文件");
    // 内存会话本身照常可用（消息进内存投影）。
    assert.equal(sel.manager.buildSessionContext().messages.length, 1);
  });
});

// —————————————————————— 2. 给 sessionDir → 新建（惰性落盘） ——————————————————————

test("给 sessionDir：新建会话；首条消息前惰性不落盘，追加后文件存在、非空、含该消息", async (t) => {
  const pi = await loadPi();
  if (pi === undefined) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await inTempDir(async (dir) => {
    const sessionsDir = join(dir, ".ans", "sessions", "role-a");
    const sel = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: sessionsDir });
    assert.equal(sel.mode, "created");
    // 目录约定（与编排协调）：**本层负责建目录（含父级 .ans/sessions）**——绑定会话后目录即存在。
    assert.ok(existsSync(sessionsDir), "新建会话后目录应存在（本层 mkdir -p，编排不预建）");
    const file = sel.manager.getSessionFile();
    assert.ok(file !== undefined && file.startsWith(sessionsDir), `会话文件应在 sessionDir 内：${String(file)}`);
    // 目录已建，但**首条消息前无文件**（惰性）。
    assert.deepEqual(readdirSync(sessionsDir), [], "首条消息前不应有文件落盘");

    sel.manager.appendMessage(user("第一轮：请改 A 文件"));
    assert.ok(existsSync(file), "追加消息后应落盘");
    const text = readFileSync(file, "utf8").trim();
    assert.ok(text.length > 0, "会话文件非空");
    assert.match(text, /"type":"session"/, "首行应为会话 header");
    assert.match(text, /第一轮：请改 A 文件/, "消息 entry 应在文件中");
  });
});

// —————————————————————— 3. 同目录再选 → 恢复 ——————————————————————

test("同目录再选：恢复（同一文件），messages 非空且含原文（entry 往返）", async (t) => {
  const pi = await loadPi();
  if (pi === undefined) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await inTempDir(async (dir) => {
    const sessionsDir = join(dir, ".ans", "sessions", "role-a");

    const first = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: sessionsDir });
    assert.equal(first.mode, "created");
    first.manager.appendMessage(user("第一轮：请改 A 文件"));
    const file = first.manager.getSessionFile();
    assert.ok(file !== undefined);

    const second = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: sessionsDir });
    assert.equal(second.mode, "resumed");
    assert.equal(second.sessionFile, file, "应恢复同一文件");
    const ctx = second.manager.buildSessionContext();
    assert.ok(ctx.messages.length > 0, "恢复后 messages 非空");
    assert.match(JSON.stringify(ctx.messages), /第一轮：请改 A 文件/);

    // 恢复的会话继续追加 → 仍写同一文件（header + 2 条消息）。
    second.manager.appendMessage(user("第二轮：改完了"));
    const lines = readFileSync(file, "utf8").trim().split("\n");
    assert.ok(lines.length >= 3, `应含 header + 2 条消息：${lines.length} 行`);
  });
});

// —————————————————————— 4. 多会话目录 → 取最近 ——————————————————————

test("目录内多个会话：恢复最近的一个（按 modified）", async (t) => {
  const pi = await loadPi();
  if (pi === undefined) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await inTempDir(async (dir) => {
    const sessionsDir = join(dir, ".ans", "sessions", "role-a");

    const a = pi.SessionManager.create(dir, sessionsDir);
    a.appendMessage(user("旧会话 A"));
    const fileA = a.getSessionFile();
    await sleep(20); // 让 mtime 可分辨（恢复按 modified 降序）
    const b = pi.SessionManager.create(dir, sessionsDir);
    b.appendMessage(user("新会话 B"));
    const fileB = b.getSessionFile();
    assert.ok(fileA !== undefined && fileB !== undefined && fileA !== fileB);

    const sel = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: sessionsDir });
    assert.equal(sel.mode, "resumed");
    assert.equal(sel.sessionFile, fileB, "应恢复最近（B）");
    assert.match(JSON.stringify(sel.manager.buildSessionContext().messages), /新会话 B/);
    assert.equal(JSON.stringify(sel.manager.buildSessionContext().messages).includes("旧会话 A"), false);
  });
});

// —————————————————————— 5. 目录不可写 → 明确报错（不静默退化） ——————————————————————

test("会话目录不可写：明确抛错（含目录与原因），绝不静默退化成「不落盘」", async (t) => {
  if (process.platform === "win32") {
    t.skip("chmod 语义在 Windows 不适用");
    return;
  }
  const pi = await loadPi();
  if (pi === undefined) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await inTempDir(async (dir) => {
    const sessionsDir = join(dir, ".ans", "sessions", "role-a");
    mkdirSync(sessionsDir, { recursive: true });
    chmodSync(sessionsDir, 0o500); // r-x：可列不可写
    try {
      await assert.rejects(
        () => selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: sessionsDir }),
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          assert.match(message, /会话持久化目录不可用/, `错误应明确：${message}`);
          assert.match(message, /不会静默退化/, "应声明不退化为不落盘");
          return true;
        },
      );
    } finally {
      chmodSync(sessionsDir, 0o700); // 还原权限以便清理
    }
  });
});

// —————————————————————— 6. 端到端（faux）：重启恢复 ——————————————————————

test("端到端（faux provider，离线）：关掉再开（同 sessionDir 重建会话）后，恢复出的模型上下文含上一轮内容", async (t) => {
  const pi = await loadPi();
  if (pi === undefined) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  await inTempDir(async (dir) => {
    const sessionsDir = join(dir, ".ans", "sessions", "role-a");
    const { fauxProvider, fauxAssistantMessage, InMemoryCredentialStore } = await import("@earendil-works/pi-ai");

    const faux = fauxProvider();
    faux.setResponses([fauxAssistantMessage("收到：第一轮已记录")]);
    const runtime = await pi.ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    runtime.registerNativeProvider(faux.provider);
    const model = runtime.getModel(faux.provider.id, faux.models[0].id);
    assert.ok(model, "faux 模型应可解析");

    /** 「启动一次应用」：按 sessionDir 选会话管理器 → 构造 AgentSession。 */
    const boot = async (): Promise<{ sel: Awaited<ReturnType<typeof selectSessionManager>>; session: InstanceType<Pi["AgentSession"]> }> => {
      const sel = await selectSessionManager(pi.SessionManager, { cwd: dir, sessionDir: sessionsDir });
      const settingsManager = pi.SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
      const resourceLoader = new pi.DefaultResourceLoader({
        cwd: dir,
        agentDir: dir,
        extensionFactories: [],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        settingsManager,
      });
      await resourceLoader.reload();
      const { session } = await pi.createAgentSession({
        cwd: dir,
        noTools: "builtin",
        customTools: [],
        resourceLoader,
        model: model as never,
        modelRuntime: runtime,
        sessionManager: sel.manager,
        settingsManager,
      });
      return { sel, session };
    };

    // 第一次启动：跑一轮。
    const first = await boot();
    assert.equal(first.sel.mode, "created");
    await first.session.prompt("第一轮任务：请改 A 文件");
    first.session.dispose();
    const file = first.sel.manager.getSessionFile();
    assert.ok(file !== undefined && existsSync(file), "一轮后会话应已落盘");

    // 「关应用再开」：同 sessionDir 重新启动。
    const second = await boot();
    assert.equal(second.sel.mode, "resumed");
    const restored = (second.session.state as { messages: unknown[] }).messages;
    assert.ok(restored.length > 0, "恢复后模型上下文应非空（sdk.js:253-259 用会话投影播种）");
    assert.match(JSON.stringify(restored), /第一轮任务：请改 A 文件/, "恢复出的上下文应含上一轮的用户消息");
    second.session.dispose();
  });
});
