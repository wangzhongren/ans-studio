// test/测试/g2-verify/scope-audit.test.ts —— G-2 独立复验「范围审计」域：
// ① 9 项客户批准裁定逐条落地核实；② 未批准项/设计非目标零实施；③ 看护永不改判定（源码/导入面审计）；
// ④ su 卡「看护职责」段（门禁引擎 G）诚实性与授权词避让；⑤ 恢复卡零计时器（行为钉，真等 1.2s）；
// ⑥ V1 无界面级告警（裁定 9，多维审计）。
// 注：裁定 1 经客户 2026-10-16 run-5 真机观察后复裁（静默默认 5min → 30s；渲染器接口改毫秒
// `renderClosurePrompt(silentMs)`；「保名改值」WATCHDOG_DEFAULT_SILENT_MINUTES 5 → 0.5）——
// 本文件已按复裁刷新为对新批准值的严格断言（非放松；修订记录见 PM 记档「客户裁定修订」）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WATCHDOG_TICK_MS,
  WATCHDOG_TICK_ENV,
  TURN_DEADLINE_RATIO,
  QUEUE_HEAD_AGE_MS,
  QUEUE_DEPTH,
  QUEUE_STUCK_COOLDOWN_MS,
  CMD_TIMEOUT_COOLDOWN_MS,
  REPEAT_FAIL_WINDOW_MS,
  REPEAT_FAIL_COUNT,
  REPEAT_FAIL_COOLDOWN_MS,
  STORM_WINDOW_MS,
  STORM_LIMIT,
  resolveWatchdogConfig,
} from "../../../app/desktop/watchdog.ts";
import {
  RECOVERY_ACTIONS as O1_ACTIONS,
  renderRecoveryReceipt,
  renderWatchdogAlert,
  renderWatchdogRecovery,
  renderWatchdogStormGuard,
} from "../../../src/common/编排/watchdog.ts";
import { RECOVERY_ACTIONS as CH_ACTIONS, isRecoveryAction, createRecoveryConfirmPresenter } from "../../../app/desktop/recovery-channel.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";
import { BUILT_IN_ROLE_CARD_TEXT } from "../../../src/common/门禁引擎/boundary-core.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

// ————————————————— ① 9 项裁定逐条 —————————————————

test("裁定 1（2026-10-18 修订）：完成态静默收束已移除——无 silenceMs/静默阈值；tick 30s 且仅 env 可调", () => {
  assert.equal(WATCHDOG_TICK_MS, 30 * 1000, "tick 缺省 30s");
  assert.equal(WATCHDOG_TICK_ENV, "ANS_DESKTOP_WATCHDOG_TICK_MS");
  const defaults = resolveWatchdogConfig({});
  assert.equal(defaults.tickMs, WATCHDOG_TICK_MS, "未设 env ⇒ 默认 tick");
  assert.equal("silenceMs" in defaults, false, "看护配置不再有静默阈值（客户 2026-10-18 移除收束）");
  assert.equal(resolveWatchdogConfig({ [WATCHDOG_TICK_ENV]: "5000" }).tickMs, 5000, "tick 可由 env 覆盖");
  // 源码钉：看护不再引用完成态收束实现；env 名仅出现在看护器文件
  const wd = read("app/desktop/watchdog.ts");
  assert.ok(wd.includes("setInterval(tick, config.tickMs)"), "start() 使用生效 tick");
  assert.equal(wd.includes("WATCHDOG_CLOSURE_PREFIX"), false, "看护不得再投 [系统·收束]");
  assert.equal(wd.includes("renderClosurePrompt"), false, "看护不得再调用收束渲染");
  assert.equal(wd.includes("silenceMs"), false, "看护配置不再有静默阈值");
  for (const f of ["app/renderer/renderer.js", "app/renderer/index.html", "app/renderer/styles.css", "app/main.ts", "app/desktop/interface.ts"]) {
    assert.ok(!read(f).includes("ANS_DESKTOP_WATCHDOG"), `${f} 不得暴露看护阈值 env（仅 env 可调，无设置项）`);
  }
});

test("裁定 2：阈值表＝§3.2 批准默认（100%/10min/5/10min-10min-15min×3-30min/15min≤5）；#1 由 90% 改 100%（2026-10-17 到点检查）", () => {
  assert.equal(TURN_DEADLINE_RATIO, 1.0, "#1 100%（到点即检查；客户 2026-10-17 去掉 90% 预警）");
  assert.equal(QUEUE_HEAD_AGE_MS, 10 * 60 * 1000, "#2 age 10min");
  assert.equal(QUEUE_DEPTH, 5, "#2 depth 5");
  assert.equal(QUEUE_STUCK_COOLDOWN_MS, 10 * 60 * 1000, "#2 冷却 10min");
  assert.equal(CMD_TIMEOUT_COOLDOWN_MS, 10 * 60 * 1000, "#3 冷却 10min（单次即报）");
  assert.equal(REPEAT_FAIL_WINDOW_MS, 15 * 60 * 1000, "#4 窗口 15min");
  assert.equal(REPEAT_FAIL_COUNT, 3, "#4 3 次");
  assert.equal(REPEAT_FAIL_COOLDOWN_MS, 30 * 60 * 1000, "#4 冷却 30min");
  assert.equal(STORM_WINDOW_MS, 15 * 60 * 1000, "风暴窗 15min");
  assert.equal(STORM_LIMIT, 5, "风暴 ≤5");
});

test("裁定 3：恢复动作集恰 {abort-turn, rebuild-session, redeliver}——编排/通道/schema 三面同一三值；增/减即拒绝", () => {
  const want = ["abort-turn", "rebuild-session", "redeliver"];
  assert.deepEqual([...O1_ACTIONS], want, "编排侧恰三值");
  assert.deepEqual([...CH_ACTIONS], want, "通道侧恰三值");
  const propose = describeTool("propose_recovery");
  const action = (propose.parameters.properties as Record<string, Record<string, unknown>>)["action"];
  assert.deepEqual(action.enum, want, "schema 枚举恰三值");
  assert.ok(isRecoveryAction("abort-turn") && isRecoveryAction("rebuild-session") && isRecoveryAction("redeliver"));
  for (const bad of ["disable-role", "delete-session", "edit-boundary", "stop", ""]) {
    assert.equal(isRecoveryAction(bad), false, `${bad} 不属于动作集（本批不含禁用角色/删会话/改边界类）`);
  }
});

test("裁定 4：恢复卡**不设限**——行为钉（挂起 1.2s 真实时间仍 pending、无计时器触发）+ 源码钉（mount 不带 cleanupAfterMs）", async () => {
  const cards: unknown[] = [];
  const presenter = createRecoveryConfirmPresenter({ present: (req) => cards.push(req), operatorId: "op" });
  let settled: boolean | undefined;
  const p = presenter.present({ roleId: "X", action: "abort-turn", evidence: "e" }).then((v) => {
    settled = v;
  });
  await new Promise((r) => setTimeout(r, 1200)); // 超过 shell 卡兜底清理量级（120s+5s）——恢复卡不受任何时限
  assert.equal(cards.length, 1, "卡已推");
  assert.equal(settled, undefined, "1.2s 后仍未结算（无计时器）");
  assert.equal(presenter.pendingCount(), 1, "仍挂起");
  presenter.rejectAllPending("窗口关闭"); // 唯一失效来源之一
  await p;
  assert.equal(settled, false, "关窗 ⇒ false（未获执行，fail-closed）");
  // 源码钉：恢复通道的 present 只传 (request, metadata) 两参（无 mount options/cleanupAfterMs —— shell 卡才传）
  const rc = read("app/desktop/recovery-channel.ts");
  assert.ok(rc.includes("**不设限**：无 cleanupAfterMs（裁定 4）"), "实现注释钉住裁定");
  assert.ok(rc.includes("core.mount((id) => ({ id, ...request }), metadata)"), "mount 恰两参（不设限实参级钉）");
  assert.ok(!/setTimeout|setInterval/.test(rc), "恢复通道零计时器");
});

test("裁定 6：工具名 role_status / session_tail / propose_recovery——schema 可描述、su 卡引用同名（无别名漂移）", () => {
  for (const name of ["role_status", "session_tail", "propose_recovery"]) {
    const d = describeTool(name);
    assert.ok(typeof d.description === "string" && d.description.length > 0, `${name} schema 可描述`);
  }
  const card = BUILT_IN_ROLE_CARD_TEXT;
  for (const name of ["role_status", "session_tail", "propose_recovery"]) assert.ok(card.includes(name), `su 卡引用 ${name}`);
});

test("裁定 8（2026-10-18 修订）：完成态静默收束已移除——看护无 silent 谓词/完成态状态机；四信号仍在", () => {
  const wd = read("app/desktop/watchdog.ts");
  assert.equal(/const silent =/.test(wd), false, "不再有静默谓词（验收通过即结束）");
  assert.equal(wd.includes("closureStates"), false, "不再有完成态收束状态机");
  assert.equal(wd.includes("silenceMs"), false, "不再有静默阈值");
  for (const term of ["turn-deadline", "queue-stuck", "cmd-timeout", "repeat-fail"]) {
    assert.ok(wd.includes(term), `告警信号仍保留：${term}`);
  }
});

test("裁定 9：V1 无界面级告警——无 OS 通知/托盘/新角标；watchdog 不进入渲染侧代码；告警只进 su 会话与聊天流系统行", () => {
  const files = ["app/main.ts", "app/desktop/interface.ts", "app/desktop/watchdog.ts", "app/desktop/session.ts", "app/renderer/renderer.js", "app/renderer/index.html", "app/renderer/styles.css", "app/renderer/tool-rows.js", "app/renderer/ui-labels.js"];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/new Notification\(|require\("electron"\)\.Notification|electron\.Notification/.test(src), `${f}：无 OS 通知`);
    assert.ok(!/\bTray\b/.test(src), `${f}：无系统托盘`);
  }
  // 渲染侧代码零 watchdog 引用（角标等界面级提示不存在；ui-labels 的注释提及设计文档不算 UI 面）
  for (const f of ["app/renderer/renderer.js", "app/renderer/index.html", "app/renderer/styles.css", "app/renderer/tool-rows.js"]) {
    assert.ok(!read(f).includes("watchdog"), `${f}：无看护专属界面元素（角标/托盘/弹窗）`);
  }
  // main.ts 的 watchdog 引用不推送任何额外 UI 通道
  for (const line of read("app/main.ts").split("\n")) {
    if (/[Ww]atchdog/.test(line)) assert.ok(!/\.send\(/.test(line), `main.ts 看护行不直推渲染通道：${line.trim()}`);
  }
});

// ————————————————— ② 非目标/未批准项零实施 —————————————————

test("非目标零实施：看护器不自动做恢复（无 abort/rebuild/drain 调用）；源码导入面不含任何判定/门禁件", () => {
  const wd = read("app/desktop/watchdog.ts");
  for (const forbidden of ["rebuildSession", "redeliverNudge", "manager.abort", ".abort(", "resolveWrite", "writeSet", "drainQueue("]) {
    assert.ok(!wd.includes(forbidden), `watchdog.ts 不得包含 ${forbidden}`);
  }
  // 导入面：仅只读件（时限求值/诊断/文案渲染）
  const imports = [...wd.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  for (const imp of imports) {
    assert.ok(
      imp.includes("runtime-core/timeout") || imp.includes("shared/diagnostics") || imp.includes("shared/runtime-shared") || imp.includes("编排/watchdog"),
      `导入面只含只读件：${imp}`,
    );
  }
  // watchdogDeliver 只入队＋触发既有 drain（不判定不放行）
  const session = read("app/desktop/session.ts");
  const m = /watchdogDeliver\(projectRoot: string[\s\S]*?\n  \}/.exec(session);
  assert.ok(m, "找得到 watchdogDeliver 实现");
  assert.ok(m![0].includes("enqueueDelivery"), "经既有投递机");
  assert.ok(!/resolveWrite|gate\(|writeSet|abort\(/.test(m![0]), "零判定/零放行/零中止");
});

// ————————————————— ③ 看护永不改判定（行为交叉） —————————————————

test("看护永不改判定：四类渲染输出的正文零授权语义（行为面——逐字检视）", () => {
  const banned = /已授权|已放行|获准|授予写权|授权写盘|代为授权|可以写/;
  const texts = [
    renderWatchdogAlert({ signal: "queue-stuck", roleId: "X", facts: ["队首已排队 12 分 0 秒（队列深度 3）"] }),
    renderWatchdogAlert({ signal: "cmd-timeout", roleId: "X", facts: ["02:10:03（结构化事实 display.process.timedOut=true）"] }),
    renderWatchdogRecovery({ signal: "queue-stuck", roleId: "X", hits: 3, suppressed: 2 }),
    renderWatchdogStormGuard(4),
    renderRecoveryReceipt({ outcome: "executed", action: "abort-turn", targetRoleId: "X", operatorId: "op", at: "2026-10-16T00:00:00.000Z" }),
    renderRecoveryReceipt({ outcome: "declined", action: "redeliver", targetRoleId: "X", operatorId: "op" }),
  ];
  for (const t of texts) {
    assert.ok(!banned.test(t), `正文不含授权语义：${t.slice(0, 60)}`);
  }
  assert.ok(renderWatchdogAlert({ signal: "turn-deadline", roleId: "X", facts: [] }).includes("不得据此假设任何写权"), "纪律句逐字在场");
});

// ————————————————— ④ G：su 卡看护职责段 —————————————————

test("G：su 卡「看护职责」段——三要素齐备；位置（J-1 段之后、末段边界之前）；段级零命中授权词", () => {
  const card = BUILT_IN_ROLE_CARD_TEXT;
  const at = card.indexOf("看护职责：");
  assert.ok(at > 0, "看护职责段在位");
  assert.ok(at > card.indexOf("落盘后自动开工（J-1）"), "位于 J-1 段之后");
  assert.ok(at < card.indexOf("边界（三种情形）"), "位于末段边界之前");
  const segment = card.slice(at, card.indexOf("边界（三种情形）"));
  for (const kw of [
    "收到后先核查、再动作",
    "role_status",
    "session_tail",
    "不得仅凭告警文本下结论",
    "docs/su/**",
    "只能提议",
    "propose_recovery",
    "执行与否由客户一键确认",
    "不得自行执行、不得承诺结果",
    "未获确认即未执行，取消亦如实回执",
    "不得据此假设任何写权",
    "状态正常，忽略",
    "E-1 回交与 H-1 派发",
  ]) {
    assert.ok(segment.includes(kw), `段内含三要素关键词：${kw}`);
  }
  for (const banned of ["授权", "获准", "放行"]) {
    assert.ok(!segment.includes(banned), `段级零命中授权词「${banned}」（措辞避让）`);
  }
});

// ————————————————— ⑤ W1-W5/R1/R2/O1/G/U1 逐项落点 —————————————————

test("范围落点：W1-W5/R1/R2/O1/G/U1 逐项文件与关键符号在位（存在性审计）", () => {
  const exists = (rel: string): boolean => fs.existsSync(path.join(REPO, rel));
  // 新增 4 文件
  for (const f of ["app/desktop/watchdog.ts", "app/desktop/confirm-card.ts", "app/desktop/recovery-channel.ts", "src/common/编排/watchdog.ts"]) {
    assert.ok(exists(f), `新增文件 ${f}`);
  }
  const pins: [string, string, string][] = [
    ["W1", "app/desktop/session.ts", "watchdogSnapshot(projectRoot: string)"],
    ["W1", "app/desktop/session.ts", "observeWatchdog"],
    ["W2", "app/desktop/session.ts", 'kind: "handback" | "dispatch" | "message" | "system"'],
    ["W2", "app/desktop/session.ts", "watchdogDeliver(projectRoot: string"],
    ["W4", "app/desktop/session.ts", "async rebuildSession(target: string | SessionTarget)"],
    ["W4", "app/desktop/session.ts", "async redeliverNudge(target: string | SessionTarget, itemId?: string)"],
    ["W5", "app/desktop/session.ts", "private async proposeRecovery("],
    ["W5", "app/main.ts", "recovery:confirm-request"],
    ["W5", "app/preload.cjs", "onRecoveryConfirm"],
    ["R1", "src/provider/runtime/tools.ts", "makeRoleStatusTool"],
    ["R1", "src/provider/runtime/tools.ts", "makeSessionTailTool"],
    ["R2", "src/provider/runtime/tools.ts", "makeProposeRecoveryTool"],
    ["R1", "src/provider/runtime/schema.ts", 'if (name === "role_status")'],
    ["R1", "src/provider/runtime/schema.ts", 'if (name === "session_tail")'],
    ["R2", "src/provider/runtime/schema.ts", 'if (name === "propose_recovery")'],
    ["O1", "src/pipeline/orchestration/run-role.ts", "const roleStatus = cap?.roleStatus === true ? input.roleStatus : undefined;"],
    ["O1", "src/common/编排/watchdog.ts", "export function renderWatchdogAlert"],
    ["O1", "src/common/编排/watchdog.ts", "export function renderRecoveryReceipt"],
    ["G", "src/common/门禁引擎/boundary-core.ts", "看护职责："],
    ["U1", "app/renderer/tool-rows.js", "SYSTEM_HEAD"],
    ["U1", "app/renderer/ui-labels.js", 'if (kind === "system") return "系统";'],
    ["U1", "app/renderer/renderer.js", "function renderRecoveryConfirm"],
    ["U1", "app/renderer/styles.css", ".msg-injected.is-system"],
  ];
  for (const [item, file, needle] of pins) {
    assert.ok(read(file).includes(needle), `${item}：${file} 应含 ${JSON.stringify(needle.slice(0, 48))}`);
  }
});
