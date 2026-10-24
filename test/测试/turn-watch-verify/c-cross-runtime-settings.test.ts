// test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts
// 测试角色：跨运行时/设置/角色卡/role_status 文案独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §3.1/§3.3/§3.4/§5.7/§5.9：
//   · resolveRuntimeTimeouts：三运行时默认检查 300000、兜底 3600000、构造 120000；Pi 读 env；
//   · 设置元数据：label「看护检查时限」、档位 1/2/5/10/15/30、默认标签「系统默认（5 分钟）」、help 逐字；
//     1 小时兜底不暴露（无设置字段/无 env 键）；
//   · su 卡「看护职责」：到点检查/不中止/仍在推进不动作/卡死才 propose_recovery/1 小时兜底/无自身检查；
//   · role_status 当前轮：「看护检查时限 + 1 小时最后兜底」，无「硬超时」。
//
// 独立构造：真实 SessionManager + 挂起句柄；不跑真实模型/命令。

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveRuntimeTimeouts } from "../../../src/common/runtime-core/timeout.ts";
import { RUNTIME_SETTINGS } from "../../../src/common/shared/runtime-settings.ts";
import { translate } from "../../../src/common/shared/i18n/index.ts";
import { PI_PANEL_KEYS } from "../../../app/desktop/pi-config.ts";
import { BUILT_IN_ROLE_CARD_TEXT } from "../../../src/common/门禁引擎/boundary-core.ts";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import type { RuntimeAdapter, SessionEvent } from "../../../src/model/runtime.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import { makeTempProject } from "./fixture.ts";

const dummyAdapter: RuntimeAdapter = {
  async composeContext() {
    return { systemPrompt: "" };
  },
  async bindRole() {
    return {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<SessionEvent>> {
                return new Promise<IteratorResult<SessionEvent>>(() => {}); // 保持挂起（busy 不解除）
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {},
    };
  },
};

function hangingHandle(): RoleSessionHandle {
  return {
    runtime: "pi",
    async send() {},
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              return new Promise<IteratorResult<SessionEvent>>(() => {});
            },
          };
        },
      };
    },
    async dispose() {},
  };
}

test("C1 三运行时默认时限：检查 300000、兜底 3600000、构造 120000；Pi 读 env", () => {
  for (const runtime of ["pi", "claude", "codex"] as const) {
    const t = resolveRuntimeTimeouts(runtime, {}, {});
    assert.equal(t.promptTimeoutMs, 300_000, `${runtime} 检查默认 5 分钟`);
    assert.equal(t.turnLastResortMs, 3_600_000, `${runtime} 兜底 1 小时`);
    assert.equal(t.constructTimeoutMs, 120_000, `${runtime} 构造 120 秒`);
  }
  assert.equal(resolveRuntimeTimeouts("pi", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "60000" }).promptTimeoutMs, 60_000);
  assert.equal(resolveRuntimeTimeouts("claude", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "60000" }).promptTimeoutMs, 60_000, "Claude 也读检查 env");
  assert.equal(resolveRuntimeTimeouts("codex", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "60000" }).promptTimeoutMs, 60_000, "Codex 也读检查 env");
  assert.equal(resolveRuntimeTimeouts("pi", { turnLastResortMs: 123 }, {}).turnLastResortMs, 123);
  assert.equal(resolveRuntimeTimeouts("pi", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "bogus" }).promptTimeoutMs, 300_000);
});

test("C2 设置元数据：labelKey/档位/默认标签/helpKey 经目录解析逐字；1 小时兜底不暴露", () => {
  const field = RUNTIME_SETTINGS.pi.fields.find((f) => f.key === "ANS_PI_PROMPT_TIMEOUT_MS");
  assert.ok(field, "Pi 面板须有 ANS_PI_PROMPT_TIMEOUT_MS 字段");
  // B4（2026-10-23）：共享元数据只保存目录 key；经 shared `translate` 解析回迁移前 zh-CN 文案（逐字保留）。
  assert.equal(translate("zh-CN", field!.labelKey), "看护检查时限");
  assert.equal("label" in field!, false, "B4：元数据不再携带 label 字面量");
  assert.deepEqual(field!.choices, ["", "60000", "120000", "300000", "600000", "900000", "1800000"]);
  assert.ok(
    field!.choiceLabelKeys !== undefined && field!.choiceLabelKeys.length === field!.choices!.length,
    "B4：choiceLabelKeys 在场且与 choices 等长",
  );
  assert.deepEqual(field!.choiceLabelKeys!.map((key) => translate("zh-CN", key)), [
    "系统默认（5 分钟）",
    "1 分钟",
    "2 分钟",
    "5 分钟",
    "10 分钟",
    "15 分钟",
    "30 分钟",
  ]);
  assert.equal(field!.control, "range");
  assert.deepEqual(field!.integer, { min: 1000 });
  // en-US 最小断言：同一批 key 在英文目录可解析（标签/默认档）。
  assert.equal(translate("en-US", field!.labelKey), "Watchdog check limit");
  assert.equal(translate("en-US", field!.choiceLabelKeys![0]), "System default (5 min)");
  // 评审 §3.3 的核心语义必须齐备（help 原文与评审的逐字差异见报告「偏差」节）：
  assert.ok(field!.helpKey, "B4：helpKey 在场");
  assert.equal("help" in field!, false, "B4：元数据不再携带 help 字面量");
  const help = translate("zh-CN", field!.helpKey!);
  for (const must of ["不中止本轮", "仍在推进则不动作", "1 小时为最后兜底", "留空＝系统默认（5 分钟）", "下一次开启会话时应用"]) {
    assert.ok(help.includes(must), `help 须含：${must}`);
  }
  // 1 小时兜底不暴露：无同名设置字段、面板里也没有。
  assert.equal(
    RUNTIME_SETTINGS.pi.fields.some((f) => /TURN_LAST_RESORT/i.test(f.key)),
    false,
    "不得暴露 turnLastResort 设置",
  );
  assert.equal(PI_PANEL_KEYS.includes("ANS_PI_TURN_LAST_RESORT_MS" as never), false);
  // 检查时限仍是面板字段（键名 histórico 保留）。
  assert.ok(PI_PANEL_KEYS.includes("ANS_PI_PROMPT_TIMEOUT_MS"));
});

test("C3 su 卡看护职责：到点检查/不中止/不动作/卡死才提议/1 小时兜底/自身无检查", () => {
  const text = BUILT_IN_ROLE_CARD_TEXT;
  for (const must of [
    "轮次到点检查",
    "到点检查不是超时",
    "不会因此中止本轮",
    "仍在推进，不动作",
    "只有确认卡死",
    "propose_recovery",
    "客户一键确认、应用执行",
    "1 小时为最后兜底",
    "唯一自动整轮上限",
    "没有到点检查",
  ]) {
    assert.ok(text.includes(must), `su 卡须含：${must}`);
  }
  for (const bad of ["轮次逼近超时", "硬超时"]) {
    assert.equal(text.includes(bad), false, `su 卡不得残留旧措辞：${bad}`);
  }
});

test("C5 三适配器整轮上限均接 turnLastResortMs（不再用 promptTimeoutMs 中止）", async () => {
  const fs = await import("node:fs");
  const read = (rel: string): string => fs.readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
  const claude = read("src/provider/claude/session.ts");
  assert.ok(claude.includes("turnLastResortMs"), "Claude 使用 turnLastResortMs");
  assert.ok(/waitForTurn\([^;]*turnLastResortMs/s.test(claude), "Claude waitForTurn 接最后兜底");
  const codex = read("src/provider/codex/session.ts");
  assert.ok(codex.includes("turnLastResortMs"), "Codex 使用 turnLastResortMs");
  assert.ok(/pausedDeadline\([^;]*lastResortMs/s.test(codex), "Codex pausedDeadline 接最后兜底");
  const pi = read("src/common/pi-adapter/real-adapter.ts");
  assert.ok(pi.includes("turnLastResortMs"), "Pi 主 prompt 使用 turnLastResortMs");
  const service = read("src/service/runtime/session.ts");
  assert.ok(service.includes("provider.options.turnLastResortMs"), "服务整轮包装使用最后兜底");
  assert.equal(/withPausableTimeout\([^;]*promptTimeoutMs/s.test(service), false, "服务不得再用 promptTimeoutMs 作 abort");
});

test("C4 role_status 当前轮：看护检查时限 + 1 小时最后兜底；无「硬超时」", async () => {
  const fx = makeTempProject();
  try {
    const listing = await listProject(fx.root);
    const captured: Record<string, unknown>[] = [];
    const mgr = new SessionManager({
      openRoleSession: async (input) => {
        captured.push(input as unknown as Record<string, unknown>);
        return hangingHandle();
      },
      createPiAdapterFactory: () => () => dummyAdapter,
      createDemoAdapter: () => dummyAdapter,
      getListing: (root: string) => (root === listing.projectRoot ? listing : undefined),
      buildProjectConfig,
      emitEvent: () => {},
    });
    const openSu = await mgr.open({ projectRoot: fx.root, roleId: "su", runtime: "pi" });
    assert.equal(openSu.ok, true, JSON.stringify(openSu));
    const openX = await mgr.open({ projectRoot: fx.root, roleId: "X", runtime: "pi" });
    assert.equal(openX.ok, true, JSON.stringify(openX));
    await mgr.send("占位", undefined, { projectRoot: fx.root, roleId: "X", runtime: "pi" });

    const suInput = captured.find((i) => i.roleId === "su") as { roleStatus?: (arg: { roleId: string }) => Promise<{ ok: boolean; text?: string }> };
    assert.equal(typeof suInput.roleStatus, "function");
    const r = await suInput.roleStatus!({ roleId: "X" });
    assert.equal(r.ok, true);
    const text = r.text ?? "";
    assert.ok(text.includes("看护检查时限 5 分 0 秒"), `role_status 当前轮须含检查时限：${text}`);
    assert.ok(text.includes("1 小时最后兜底"), "须含 1 小时最后兜底");
    assert.equal(text.includes("硬超时"), false, "不得残留「硬超时」");
  } finally {
    fx.cleanup();
  }
});
