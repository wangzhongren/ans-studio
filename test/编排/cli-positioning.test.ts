// test/编排/cli-positioning.test.ts
// P1-4（产品提案 2026-10-13，客户批准）：`ans role run` 的产品定位——定位 + 指路。
//
// 覆盖：① 指路文案含两个必写实的点（不提供 shell/会话保持；桌面应用）；
//       ② `-h`/`--help` → 帮助（stdout 含用法与指路句）且**不开会话**（适配器工厂零调用）、
//          不依赖注入（缺 project/scope 也可用）；作用域外零波及（仅打印，不触配置/不落盘）；
//       ③ 一次性会话启动时打印轻量指路行（`[message]` 事件，位于既有启动提示处；每场恰一次）；
//       ④ 用法错误路径**不**打印指路（常规提示不打扰——只在真正开跑时出现）。
// 注：真实入口 `ans role run --help`（无 --task）的**令牌路由**归装配 parseInvocation
// （当前把该位形判为「缺少 --task」的 unknown）——装配放行后本命令帮助即端到端生效
// （跨角色登记见 docs/change/2026-10-13_change_cli-positioning.md）；本测试覆盖命令层（本角色边界）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent } from "../../src/provider/pi/session.ts";
import { runRoleCommand } from "../../src/interface/cli/run.ts";
import { EXIT_OK, EXIT_USAGE } from "../../src/common/编排/exit-codes.ts";
import { CLI_POSITIONING } from "../../src/common/编排/cli-positioning.ts";

// —— 夹具：临时项目（角色卡 + 边界），同 exit-codes.test.ts 手法 ——
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-cli-positioning-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: 测试条目\n"
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:fixture" },
    },
  };
}
function cleanup(project: ProjectConfig): void {
  fs.rmSync(project.projectRoot, { recursive: true, force: true });
}
const scopeX = (): TaskScope => ({ writeSet: ["src/a.ts"], conditions: [] });

// —— 假适配器：立即 settled、dispose 无事 ——
const okAdapter = (): RuntimeAdapter => ({
  async composeContext() {
    return { systemPrompt: "" };
  },
  async bindRole(): Promise<RoleSession> {
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
});

/** 捕获 process.stdout（console.log 底层同走 stdout.write——启动提示行经 console.log 输出）。
 *
 * **必须转发 + 记录，绝不吞掉写入**：`node --test` 的子进程结果上报协议帧同样经
 * `process.stdout.write` 走（V8 序列化帧与普通文本交错），吞掉写入会让测试计数被吞
 * （实测：本文件 6 例只被计入 2 例）。故补丁在记录的同时一律转交原方法。
 */
function captureStdout(): { restore: () => void; output: () => string } {
  const chunks: string[] = [];
  const original = process.stdout.write;
  const forward = original.bind(process.stdout) as (...a: unknown[]) => boolean;
  process.stdout.write = ((chunk: unknown, ...args: unknown[]): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return forward(chunk, ...args);
  }) as typeof process.stdout.write;
  return {
    restore: () => {
      process.stdout.write = original;
    },
    output: () => chunks.join(""),
  };
}

// —————————————————————— ① 文案本身：两点写实 ——————————————————————

test("P1-4 指路句：不提供 shell 与会话保持 + 桌面应用，两点写实", () => {
  assert.match(CLI_POSITIONING, /shell/);
  assert.match(CLI_POSITIONING, /会话保持/);
  assert.match(CLI_POSITIONING, /桌面应用/);
  assert.match(CLI_POSITIONING, /一次性执行/);
});

// —————————————————————— ② 帮助：-h / --help ——————————————————————

for (const flag of ["--help", "-h"]) {
  test(`runRoleCommand ${flag} → 0：stdout 含用法与指路句；不开会话（工厂零调用）`, async () => {
    const project = makeTempProject();
    let factoryCalls = 0;
    const cap = captureStdout();
    let code: number;
    try {
      code = await runRoleCommand([flag], {
        createAdapter: () => {
          factoryCalls += 1;
          return okAdapter();
        },
        project,
        scope: scopeX(),
      } as never);
    } finally {
      cap.restore();
      cleanup(project);
    }
    assert.equal(code, EXIT_OK);
    const out = cap.output();
    assert.match(out, /用法：ans role run <角色> --task <任务>/, `帮助应含用法行：${out}`);
    assert.ok(out.includes(CLI_POSITIONING), `帮助输出应含指路句：${out}`);
    assert.equal(factoryCalls, 0, "帮助不得开会话");
  });
}

test("runRoleCommand --help 不依赖注入（缺 project/scope 也可用）", async () => {
  const cap = captureStdout();
  let code: number;
  try {
    code = await runRoleCommand(["--help"], { createAdapter: okAdapter } as never);
  } finally {
    cap.restore();
  }
  assert.equal(code, EXIT_OK);
  assert.ok(cap.output().includes(CLI_POSITIONING));
});

// —————————————————————— ③ 一次性会话启动：轻量指路行 ——————————————————————

test("一次性会话启动打印轻量指路行（[message] 事件，位于既有启动提示处；每场恰一次）", async () => {
  const project = makeTempProject();
  const cap = captureStdout();
  let code: number;
  try {
    code = await runRoleCommand(["X", "--task", "T-1"], {
      createAdapter: okAdapter,
      project,
      scope: scopeX(),
    } as never);
  } finally {
    cap.restore();
    cleanup(project);
  }
  assert.equal(code, EXIT_OK);
  const out = cap.output();
  // 指路行经事件流以既有 `[message]` 形态呈现，且与既有工具集提示行同在（启动提示处）。
  assert.ok(out.includes(`[message] ${CLI_POSITIONING}`), `应含指路行：${out}`);
  assert.match(out, /受治理工具集已建立/);
  // 轻量：整场会话该句恰出现一次（不逐轮重复）。
  assert.equal(out.split(CLI_POSITIONING).length, 2, `指路句应恰出现一次：${out}`);
});

// —————————————————————— ④ 用法错误路径：不打扰 ——————————————————————

test("用法错误路径不打印指路（只在真正开跑时出现，不夹带新噪音）", async () => {
  const cap = captureStdout();
  let code: number;
  try {
    code = await runRoleCommand([], { createAdapter: okAdapter });
  } finally {
    cap.restore();
  }
  assert.equal(code, EXIT_USAGE);
  assert.ok(!cap.output().includes(CLI_POSITIONING), "用法错误只走 stderr，不夹带指路");
});
