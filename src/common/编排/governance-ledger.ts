// src/common/编排/governance-ledger.ts
// 治理账本（三方治理 V1，评审 §5.7）：**append-only** 的 `.ans/governance/ledger.jsonl`。
//
// 契约（`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.7）：
//   · 位置 `<projectRoot>/.ans/governance/ledger.jsonl`，UTF-8，一行一条 JSON；
//   · append-only：只追加、不重写、不删除；进程内按 `projectRoot` **串行**（promise 链）；
//   · `mkdir -p .ans/governance` → 追加 → `fsync`；**失败不回滚、不抛给角色**——只记诊断并如实
//     返回 `{ok:false}`（「账本失败不翻转客户决定」，§九-16）；
//   · **门禁只读账本，不读 Markdown `status`**；读取失败/坏行由调用方（门禁）**fail-closed**；
//   · **角色不可写账本**：`.ans/**` 在三人 `forbiddenWritePaths` 内（门禁引擎注册表），编排的 gate
//     包装先于 `resolveWrite` 判定；本模块只由应用（编排/桌面）调用。
//
// 失败语义（钉死）：
//   · `readGovernanceLedger` 对「文件不存在」返回空账本、**不报错**（尚无决定是正常初始态）；
//   · 对不可读/坏行返回 `errors`（坏行跳过，不猜测内容）；门禁见 `errors` 非空即拒；
//   · `appendGovernanceLedger` 永不抛错；诊断由 `common/shared/diagnostics.ts` 落盘（应用侧）。
//   · `flushGovernanceLedger` 仅用于测试/宿主等待在飞追加落盘；不改变串行链语义。

import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import type { GovernanceJudgeAudit, HandOffIntentKind, RuntimeKind } from "../../model/runtime.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";

/** 账本的项目相对路径（评审 §5.7 固定值）。 */
export const GOVERNANCE_LEDGER_REL = ".ans/governance/ledger.jsonl";

/**
 * 账本事件的权力归属（评审 §5.7；2026-10-18 四角色 W6-A 增补）。
 *
 * - `"liaison"`：联络官 Liaison 的**沟通权**（不是决定权）——`intent.handed-off` 与 Liaison 的
 *   `artifact.observed` 使用（四角色评审 §7.1 逐字值；门禁不读 `power`，它只是审计标记）。
 */
export type GovernancePower =
  | "proposal"
  | "nomination"
  | "schedule"
  | "acceptance"
  | "verification"
  | "app"
  | "customer"
  | "liaison";

/** 客户决定的细分类型（门禁按它判定，不靠自然语言；评审 §5.7/§5.8）。 */
export type GovernanceDecisionKind =
  | "proposal-accept"
  | "proposal-accept-quick"
  | "proposal-revise"
  | "proposal-reject"
  | "appointment"
  | "appointment-write"
  | "schedule-write"
  | "acceptance"
  /** 需求确认（Liaison 在 hand_off_intent 前的客户专属卡；判断 agent 永不代批）。 */
  | "intent-confirm"
  | "migration"
  | "unclassified"; // 缺 cardKind 或选项 id 非标准：门禁一律拒绝，提示重发

/**
 * `dispatch.accepted` 的触发来源（四角色评审 §7.1）：区分「客户决定后推进」「意图交接后投递」
 * 「settle 后推进」；三者都仍是 `actorRoleId:"app"`, `power:"app"`，**都不是客户批准**。
 * 旧条目缺 `trigger` 仍合法（不追改历史）。
 *
 * 2026-10-19：`"settle"` 也用于**应用自动派发**——流程齐备（执行步骤全部 done 且均有
 * `dispatch.accepted`、无未结算决定、验收步骤 pending）后自动派发 Proof / 验收时，写
 * `dispatch.accepted{targetRoleId:"verifier", stepId:"verification", trigger:"settle"}`；
 * 该条同时是**自动派发去重键**（同一 flowId+stepId 已存在即不重复派发）。自动派发不是验收决定。
 */
export type GovernanceLedgerTrigger = "customer-decision" | "intent-handoff" | "settle";

/** 账本条目（评审 §5.7 逐字形状；只增不改，未知字段读取时原样保留）。 */
export interface GovernanceLedgerEntry {
  at: string; // ISO
  kind:
    | "customer.decision"
    | "dispatch.accepted"
    | "artifact.observed"
    | "governance.established"
    | "governance.reaccepted"
    | "governance.migrated"
    // W6-A（四角色评审 §7.1）：意图交接与澄清。两者都**不是**客户批准，任何门禁不读。
    | "intent.handed-off"
    | "clarification.requested";
  flowId?: string;
  /** 流程步骤 id。`dispatch.accepted` 的去重键是 flowId+stepId（与 targetRoleId 无关）。 */
  stepId?: string;
  /** 本事件的动作人（角色 id，或 "app"/"customer"）。 */
  actorRoleId: string;
  power: GovernancePower;
  /** 仅 customer.decision：决定类型（门禁判定用）。 */
  decisionKind?: GovernanceDecisionKind;
  artifactPath?: string; // 项目相对路径
  artifactVersion?: number;
  artifactSha256?: string; // 应用算，角色不自算
  /** 仅写盘确认：本次客户确认/发行的具体路径（逐条）。 */
  paths?: string[];
  /** 本次事件的目标角色（派发/写卡/验收）。应用自动派发 Proof / 验收时 = `"verifier"`。 */
  targetRoleId?: string;
  targetRoleIds?: string[];
  /** W6-A：意图交接/澄清所引用的意图记录（`docs/intents/<intentId>.md` 的 slug）。 */
  intentId?: string;
  /** W6-A：仅 intent.handed-off——交接种类（initial 每个 intentId 仅一次）。 */
  handoffKind?: HandOffIntentKind;
  /** W6-A：仅 dispatch.accepted——触发来源（见 GovernanceLedgerTrigger）；缺席＝旧条目。 */
  trigger?: GovernanceLedgerTrigger;
  /**
   * W6-A：仅 intent.handed-off——所属轮次（每轮一次守卫；同会话同轮第二次成功交接被拒）。
   * 不属于客户决定的 `decisionEvidence`；`sessionId` 与它合起来定位一轮。
   */
  turnId?: string;
  customerDecision?: "accepted" | "accepted-quick" | "appointed" | "rejected" | "changes-requested" | "none";
  decisionEvidence?: {
    /**
     * 2026-10-18 双开关评审 §7.4/§10.1：`"judge"` 表示该决定由客户委托的判断 agent 代批；
     * `judge` 子对象是**有界审计证据**。`actorRoleId`/`power` 照旧（仍是发起治理角色/职能），
     * 绝不写 `actorRoleId:"judge"`；`kind` 不参与任何门禁（门禁只读 `decisionKind`/`customerDecision`）。
     */
    kind: "customer-input" | "judge" | "desktop-governance-record" | "customer-message";
    toolCallId?: string;
    turnId?: string;
    sessionId?: string;
    action?: "establish" | "reaccept" | "migrate";
    previewDigest?: string;
    /** 仅 `kind:"judge"`：有界判断审计（reason ≤1KB、evidence ≤10 条、pathDecisions ≤50 条）。 */
    judge?: GovernanceJudgeAudit;
  };
  messageSummary?: string;
  runtime?: RuntimeKind;
  sessionId?: string;
}

/** 只读快照（同步门禁消费；由会话在 open/send 时异步刷新）。 */
export interface GovernanceLedgerSnapshot {
  entries: readonly GovernanceLedgerEntry[];
  errors: readonly string[];
}

/** 空快照（无账本/无决定时的缺省值；门禁据此 fail-closed）。 */
export const EMPTY_GOVERNANCE_LEDGER_SNAPSHOT: GovernanceLedgerSnapshot = {
  entries: [],
  errors: [],
};

/** 追加结果：失败只如实返回，不抛。 */
export type GovernanceLedgerAppendResult = { ok: true } | { ok: false; message: string };

/**
 * 追加原语（**仅测试注入**）：覆盖 `open(..., "a")` 返回的句柄。
 * 生产调用不给——单一实现仍走 node:fs/promises。给测试用是为了在离线环境模拟 fsync 失败
 * （不能也不应通过真实磁盘故障来测）。
 */
export interface GovernanceLedgerAppendOptions {
  openFile?: (absPath: string) => Promise<{
    write(content: string): Promise<unknown>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }>;
}

/** 进程内按项目根的串行链（评审 §5.7：按 `projectRoot` 串行）。 */
const appendChains = new Map<string, Promise<void>>();

/** 账本绝对路径。 */
export function governanceLedgerPath(projectRoot: string): string {
  return path.join(projectRoot, ".ans", "governance", "ledger.jsonl");
}

function normalizeRoot(projectRoot: string): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  return path.resolve(projectRoot);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entryShapeError(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "不是 JSON 对象";
  for (const key of ["at", "kind", "actorRoleId", "power"] as const) {
    if (typeof value[key] !== "string" || value[key].trim() === "") return `缺少字符串字段 ${key}`;
  }
  return undefined;
}

/**
 * 追加一条账本条目（append-only + fsync；失败只诊断，不回滚、不抛给角色）。
 * 进程内按 `projectRoot` 串行：并发调用按进入顺序逐条落盘，不交错、不丢行。
 */
export async function appendGovernanceLedger(
  projectRoot: string,
  entry: GovernanceLedgerEntry,
  options: GovernanceLedgerAppendOptions = {},
): Promise<GovernanceLedgerAppendResult> {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return { ok: false, message: "projectRoot 缺失，未写治理账本。" };
  const shapeError = entryShapeError(entry);
  if (shapeError !== undefined) return { ok: false, message: `账本条目形状非法（${shapeError}），未写治理账本。` };

  const absPath = governanceLedgerPath(root);
  const key = root;

  const run = async (): Promise<GovernanceLedgerAppendResult> => {
    const log = createDiagnosticLogger({ component: "orchestration.governance-ledger", projectRoot: root });
    try {
      await mkdir(path.dirname(absPath), { recursive: true });
      const handle = options.openFile !== undefined ? await options.openFile(absPath) : await open(absPath, "a");
      try {
        await handle.write(JSON.stringify(entry) + "\n");
        // fsync：失败不回滚（行可能已落盘但不保证持久）；只如实失败。
        await handle.sync();
      } finally {
        await handle.close();
      }
      log.record("governance.ledger.append", { kind: entry.kind, actorRoleId: entry.actorRoleId });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("governance.ledger.append.failed", err, { kind: entry.kind, actorRoleId: entry.actorRoleId });
      return { ok: false, message: `治理账本追加失败：${message}（客户决定不变、门禁不放宽、写盘不阻断）。` };
    }
  };

  const previous = appendChains.get(key) ?? Promise.resolve();
  const current = previous.then(run, run); // 前一条失败不影响下一条（链只保证顺序）
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  appendChains.set(key, tail);
  try {
    return await current;
  } finally {
    // 链尾仍是自己 → 清理（避免 Map 无限增长）；否则由更晚的调用清理。
    if (appendChains.get(key) === tail) appendChains.delete(key);
  }
}

/**
 * 等待某项目在飞账本追加全部落盘（测试/宿主收口用）。
 * 返回后不代表写入成功——单条结果仍由 `appendGovernanceLedger` 的返回值/诊断表达。
 */
export async function flushGovernanceLedger(projectRoot: string): Promise<void> {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return;
  await (appendChains.get(root) ?? Promise.resolve());
}

/**
 * 读取账本。文件不存在 → 空账本（无错误）；不可读/坏行 → `errors`（坏行跳过，不猜内容）。
 * 门禁见 `errors` 非空即 fail-closed（评审 §6.2）。
 */
export async function readGovernanceLedger(
  projectRoot: string,
): Promise<{ entries: GovernanceLedgerEntry[]; errors: string[] }> {
  const root = normalizeRoot(projectRoot);
  if (root === undefined) return { entries: [], errors: ["projectRoot 缺失，无法读取治理账本。"] };
  const absPath = governanceLedgerPath(root);
  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { entries: [], errors: [] };
    return { entries: [], errors: [`治理账本不可读：${err instanceof Error ? err.message : String(err)}`] };
  }

  const entries: GovernanceLedgerEntry[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      errors.push(`第 ${i + 1} 行不是合法 JSON：${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const shapeError = entryShapeError(parsed);
    if (shapeError !== undefined) {
      errors.push(`第 ${i + 1} 行账本条目形状非法：${shapeError}`);
      continue;
    }
    entries.push(parsed as GovernanceLedgerEntry);
  }
  return { entries, errors };
}

/** 读取并转换为只读快照（会话 open/send 时刷新用；评审 §5.7「同步门禁消费」）。 */
export async function refreshGovernanceLedgerSnapshot(projectRoot: string): Promise<GovernanceLedgerSnapshot> {
  const { entries, errors } = await readGovernanceLedger(projectRoot);
  return { entries, errors };
}
