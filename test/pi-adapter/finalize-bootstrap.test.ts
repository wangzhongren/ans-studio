// （历史）finalize_bootstrap 收口提议工具的**墓碑用例**（2026-10-12，A-4 最后一步删除后改写）。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 背景：`finalize_bootstrap` 自 A-4 起**无任何注入方**（编排 genesisFinalize 已删、桌面 finalizeBootstrap 已删）
// ⇒ 永不注册 = 死代码，已随 `FINALIZE_BOOTSTRAP_TOOL_NAME` / `makeFinalizeBootstrapTool` / `finalizeBootstrap`
// 注入槽一并删除；「同意才落盘」现由交互工具族（request_confirmation / request_choice）+ 编排 writeSet/F4 承担。
//
// 本文件从原「存在/注册条件/handler 措辞」用例改写为**墓碑断言**——原断言对象（该工具的 handler、注册槽）
// 已不存在，删除它们不是「为变绿放宽其它断言」，而是断言对象已随特性消亡；其余断言未动、新断言更严
// （编译期 + 运行期双重钉死不回归）。
//
// 覆盖：
//   1. 任何构造（含注入客户通道）下 `finalize_bootstrap` 都不在工具集里；
//   2. 运行期：`tools.ts` 不再导出 `FINALIZE_BOOTSTRAP_TOOL_NAME`；
//   3. 编译期：`FinalizeBootstrapFn` 类型已从冻结契约家删除（@ts-expect-error 墓碑，见下）；
//   4. 保留：`FinalizeStatus` / `FinalizeResult` 仍在冻结契约家可导入可用（编排仍在消费）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import type { FinalizeResult, FinalizeStatus } from "../../src/provider/pi/session.ts";
import type { CustomerInputFn } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

// 编译期墓碑：`FinalizeBootstrapFn` 已随工具删除（2026-10-12）。若它被加回，本行会报 TS2578
// （未使用的 @ts-expect-error），`npm run typecheck` 即失败——不靠人盯。
// @ts-expect-error FinalizeBootstrapFn 已删除（A-4 最后一步）；加回请先改架构讨论。
import type { FinalizeBootstrapFn } from "../../src/provider/pi/session.ts";

/** 一律放行的写门禁。 */
function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

// —————————————————————— 1. 墓碑：任何构造下都不出现 ——————————————————————

test("finalize_bootstrap 已删除：任何构造下都不在工具集里（含注入客户通道的构造）", () => {
  const plain = buildGovernedTools(allowGate()).map((t) => t.name);
  assert.equal(plain.includes("finalize_bootstrap"), false, "收口工具已删除，绝不应再注册");

  const channel: CustomerInputFn = async () => ({ outcome: "answered", value: { confirmed: true } });
  const withChannel = buildGovernedTools(allowGate(), {
    readRoot: process.cwd(),
    writeRoot: process.cwd(),
    customerInput: channel,
  }).map((t) => t.name);
  assert.equal(withChannel.includes("finalize_bootstrap"), false);
  // 取代它的是交互工具族（在注入了客户通道时应出现）。
  assert.ok(withChannel.includes("request_confirmation"), "交互工具族应在注入通道时注册");
  assert.ok(withChannel.includes("request_choice"));

  // 其余工具照常（删除收口面不得误伤）。
  assert.ok(plain.includes("write_file"));
  assert.ok(plain.includes("read_file"));
});

// —————————————————————— 2. 墓碑（运行期）：导出面已删 ——————————————————————

test("finalize_bootstrap 已删除：tools.ts 不再导出 FINALIZE_BOOTSTRAP_TOOL_NAME", async () => {
  const mod = await import("../../src/provider/pi/tools.ts");
  assert.equal("FINALIZE_BOOTSTRAP_TOOL_NAME" in mod, false, "该导出已删除；加回即回归性失败");
});

// —————————————————————— 3. 墓碑（编译期）：见文件头 @ts-expect-error ——————————————————————

test("finalize_bootstrap 已删除：FinalizeBootstrapFn 的编译期墓碑在位（@ts-expect-error 由 typecheck 执行）", () => {
  // 运行期无可断言之物（类型在编译期擦除）；本用例只留一条显式说明，真正执行者是 `npm run typecheck`
  // 对文件头 @ts-expect-error 的「未使用即报错」语义。
  assert.equal(typeof undefined, "undefined");
});

// —————————————————————— 4. 保留：两结果型仍在冻结契约家（编排仍消费） ——————————————————————

test("FinalizeStatus / FinalizeResult 仍可从冻结契约家 session.ts 导入并使用（编排仍消费）", async () => {
  const status: FinalizeStatus = "completed";
  const r: FinalizeResult = {
    ok: true,
    status,
    message: "已收口",
    wrote: [],
    pins: [],
    roles: [],
    projectJsonRel: ".ans/project.json",
    manifestRel: "docs/bootstrap-manifest.md",
  };
  assert.equal(r.status, "completed");
  assert.equal(r.ok, true);
  assert.equal(r.message, "已收口");
});
