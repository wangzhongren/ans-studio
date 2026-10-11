// test/编排/runtime-selection.test.ts
// 运行时选择测试（约定：--runtime demo|pi / ANS_RUNTIME，默认 demo；装配解析并注入）。
// 断言：
//   - 选 pi 时**确实**走到真实 Pi 适配器工厂（经注入探针记录调用；默认工厂即 createPiAdapterFactory）；
//   - 选 demo / 未指定时沿用注入的 createAdapter，不误触 pi；
//   - 无凭据（prompt 阶段失败）的错误路径返回非 0，不崩溃、不假装成功。
//
// 注：真实模型轮次仍需 Pi 凭据，本测试不触网——用假适配器覆盖编排/选择逻辑。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type {
  RuntimeAdapter,
  RoleSession,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import type { AdapterFactoryBuilder } from "../../src/pipeline/orchestration/run-role.ts";
import { selectAdapterFactory, createPiAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { runRoleCommand } from "../../src/interface/cli/run.ts";
import { EXIT_OK, EXIT_FAILURE } from "../../src/common/编排/exit-codes.ts";

// —— 夹具：临时项目（角色 X + 边界文件）——
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-runtime-"));
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
const scopeX = (): TaskScope => ({ writeSet: ["src/a.ts"], conditions: [] });

// —— 假适配器 ——
function okAdapter(): RuntimeAdapter {
  return {
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
  };
}
// 模拟 pi 适配器在**缺凭据**下的行为：bindRole 能构造成功，到 prompt 才失败。
function promptThrowingAdapter(): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      return {
        async prompt(): Promise<void> {
          throw new Error("缺少 Pi 凭据：prompt 阶段失败（无 API key）");
        },
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            /* 无事件 */
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

interface BuilderProbe {
  builder: AdapterFactoryBuilder;
  calls: { n: number; project?: ProjectConfig };
}
function makeBuilderProbe(kind: "ok" | "throw"): BuilderProbe {
  const calls: { n: number; project?: ProjectConfig } = { n: 0 };
  const builder: AdapterFactoryBuilder = (project) => {
    calls.n += 1;
    calls.project = project;
    return () => (kind === "ok" ? okAdapter() : promptThrowingAdapter());
  };
  return { builder, calls };
}
interface FactoryProbe {
  factory: (gate: WriteGate) => RuntimeAdapter;
  calls: { n: number };
  marker: { __demo: boolean };
}
function makeFactoryProbe(kind: "ok" | "throw"): FactoryProbe {
  const calls = { n: 0 };
  const marker = { __demo: true };
  const factory = (gate: WriteGate): RuntimeAdapter => {
    void gate;
    calls.n += 1;
    const a = kind === "ok" ? okAdapter() : promptThrowingAdapter();
    (a as unknown as { __demo?: boolean }).__demo = true;
    return a;
  };
  return { factory, calls, marker };
}

// —————————————————————— selectAdapterFactory（纯函数）——————————————————————

test("selectAdapterFactory：pi 走注入的 piFactory（记录调用），不动 demo 工厂", () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  const pi = makeBuilderProbe("ok");
  try {
    selectAdapterFactory("pi", project, { createAdapter: demo.factory, piFactory: pi.builder });
    assert.equal(pi.calls.n, 1);
    assert.equal(pi.calls.project, project);
    assert.equal(demo.calls.n, 0);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("selectAdapterFactory：demo 原样沿用注入的 createAdapter，不触 pi", () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  const pi = makeBuilderProbe("ok");
  try {
    const factory = selectAdapterFactory("demo", project, { createAdapter: demo.factory, piFactory: pi.builder });
    assert.equal(factory, demo.factory); // 未包装、未调用，直接沿用装配注入的工厂
    assert.equal(pi.calls.n, 0);
    assert.equal(demo.calls.n, 0); // 纯选择不构造 adapter，构造发生在会话编排时
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("selectAdapterFactory：pi 无注入探针时默认落到真实 createPiAdapterFactory（非 demo 工厂）", () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  try {
    const factory = selectAdapterFactory("pi", project, { createAdapter: demo.factory });
    assert.equal(typeof factory, "function");
    assert.notEqual(factory, demo.factory); // 未回落到注入的 demo 工厂
    // 真实构建器本身可调用（返回 (gate)=>adapter 的闭包；实际构造在调用该闭包时才发生）。
    assert.equal(typeof createPiAdapterFactory(project), "function");
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

// —————————————————————— runRoleCommand 端到端选择 ——————————————————————

test("runRoleCommand：argv --runtime pi → 走到 pi 工厂（探针记录）→ 0", async () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  const pi = makeBuilderProbe("ok");
  try {
    const code = await runRoleCommand(["X", "--task", "T-1", "--runtime", "pi"], {
      createAdapter: demo.factory,
      project,
      scope: scopeX(),
      piAdapterFactory: pi.builder,
    } as never);
    assert.equal(code, EXIT_OK);
    assert.equal(pi.calls.n, 1);
    assert.equal(demo.calls.n, 0);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRoleCommand：注入 runtime=pi（无 argv 旗标）→ 走到 pi 工厂 → 0", async () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  const pi = makeBuilderProbe("ok");
  try {
    const code = await runRoleCommand(["X", "--task", "T-1"], {
      createAdapter: demo.factory,
      project,
      scope: scopeX(),
      runtime: "pi",
      piAdapterFactory: pi.builder,
    } as never);
    assert.equal(code, EXIT_OK);
    assert.equal(pi.calls.n, 1);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRoleCommand：未指定 runtime → 默认 demo，沿注入 createAdapter，不触 pi", async () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  const pi = makeBuilderProbe("ok");
  try {
    const code = await runRoleCommand(["X", "--task", "T-1"], {
      createAdapter: demo.factory,
      project,
      scope: scopeX(),
      piAdapterFactory: pi.builder,
    } as never);
    assert.equal(code, EXIT_OK);
    assert.equal(demo.calls.n, 1);
    assert.equal(pi.calls.n, 0);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRoleCommand：--runtime pi 且适配器 prompt 缺凭据失败 → 非 0（EXIT_FAILURE）", async () => {
  const project = makeTempProject();
  const demo = makeFactoryProbe("ok");
  const pi = makeBuilderProbe("throw");
  try {
    const code = await runRoleCommand(["X", "--task", "T-1", "--runtime", "pi"], {
      createAdapter: demo.factory,
      project,
      scope: scopeX(),
      piAdapterFactory: pi.builder,
    } as never);
    assert.equal(code, EXIT_FAILURE);
    assert.notEqual(code, EXIT_OK);
    assert.equal(pi.calls.n, 1);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
