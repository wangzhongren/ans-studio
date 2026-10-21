/**
 * 治理状态 / 动作 / 预览 / 空态的纯映射（Phase 4B）。
 *
 * 文案逐字沿用旧 `ui-labels.js`（单一来源），只做「主进程事实 → 文案」的转写：
 * 不判边界、不读文件、不猜模型；缺省/未知一律不显示、不编辑语义。
 * `phase === "write"` 是「是否零副作用」的唯一依据（非 write 才可声明未写入任何文件）。
 */

export interface GovernanceActionInput {
  hasProject: boolean;
  hasRoles: boolean;
  recordState: string;
}

export type GovernanceAction = "establish" | "reaccept" | null;

/** 动作可见谓词唯一入口（旧 `governanceActionFor` 同口径）。 */
export function governanceActionFor(
  hasProject: boolean,
  hasRoles: boolean,
  recordState: string,
): GovernanceAction {
  if (hasProject !== true) return null;
  if (recordState === "pin-mismatch") return "reaccept";
  if (hasRoles === true && recordState === "missing") return "establish";
  return null;
}

export function projectRoleCount(roles: ReadonlyArray<unknown> | null): number {
  let count = 0;
  for (const role of roles || []) {
    if (!role || typeof role !== "object") continue;
    if ((role as { builtIn?: unknown }).builtIn !== true) count += 1;
  }
  return count;
}

const GOVERNANCE_MODEL_STATUS_TEXT: Record<string, string> = {
  single: "旧模型（su）",
  trio: "三权 · 五角色",
};

const GOVERNANCE_FLOW_STATUS_TEXT: Record<string, string> = {
  "awaiting-customer": "等待客户决定",
  "in-progress": "进行中",
  blocked: "阻塞",
  "escalated-to-customer": "已升级客户",
};

/** 治理模型展示名（未知 ⇒ 空串，不猜）。状态行专用「三权 · 五角色」。 */
export function governanceModelStatusText(model: string | null | undefined): string {
  const text = typeof model === "string" ? GOVERNANCE_MODEL_STATUS_TEXT[model] : "";
  return text ? "治理模型：" + text : "";
}

/** 迁移预览里的通用模型名（旧 `governanceModelText`）。 */
export function governanceModelText(model: unknown): string {
  if (model === "single") return "旧模型（su）";
  if (model === "trio") return "三权";
  return "";
}

export function governanceFlowStatusText(status: unknown): string {
  return typeof status === "string" && GOVERNANCE_FLOW_STATUS_TEXT[status]
    ? GOVERNANCE_FLOW_STATUS_TEXT[status]
    : "";
}

/** 状态行（旧 `governanceStatusText`）：模型 + 流程 + 流程状态；未知片段不显示。 */
export function governanceStatusText(
  model: unknown,
  flowId: unknown,
  flowStatus: unknown,
): string {
  const parts: string[] = [];
  const modelText = governanceModelStatusText(
    typeof model === "string" ? model : null,
  );
  if (modelText !== "") parts.push(modelText);
  if (typeof flowId === "string" && flowId !== "") parts.push("当前流程：" + flowId);
  const statusText = governanceFlowStatusText(flowStatus);
  if (statusText !== "") parts.push(statusText);
  return parts.join(" · ");
}

export function governanceMissingText(roleCount: unknown): string {
  const n =
    typeof roleCount === "number" && Number.isFinite(roleCount) && roleCount >= 0
      ? Math.floor(roleCount)
      : 0;
  return (
    "本项目有 " +
    n +
    " 个项目角色，但尚无治理记录（.ans/project.json）。项目角色可按各自边界工作；治理角色暂时无法写入。"
  );
}

export function governanceInvalidText(reason: unknown): string {
  const r =
    typeof reason === "string" && reason !== "" ? reason : "原因未提供";
  return "治理记录不可用：" + r + "；本版不自动覆盖";
}

export function governanceEmptyState(
  roleCount: unknown,
  primaryRoleId: unknown,
): { kind: "governance"; title: string; sub: string } {
  const primary =
    typeof primaryRoleId === "string" && primaryRoleId !== ""
      ? primaryRoleId
      : "主入口角色";
  return {
    kind: "governance",
    title: "尚无治理记录",
    sub:
      governanceMissingText(roleCount) +
      "与 " +
      primary +
      " 对话前，请先建立治理记录；也可在终端运行 ans govern <项目目录>。",
  };
}

// —————— 治理角色说明（旧 ui-labels 逐字；按 governanceFunction）——————

const GOVERNANCE_ROLE_HINT: Record<string, string> = {
  liaison:
    "客户默认入口：你说要做什么，我先确认目标、范围与验收，再交给提案 Draft 形成提案。我不写提案、不批准。本版起默认入口为主理 Lead；提案 Draft 与历史提案不变。",
  proposal: "通常由主理 Lead 交接打开；客户也可以直接找我。我只写提案，不批准。",
  nomination: "通常由流程单提名步骤打开；仅在客户明确要求时直接使用",
  schedule: "通常由已接受提案开启流程；只负责排步骤与派发，不批准方案",
  verification: "通常由交付回交后的验收步骤打开；只核对证据、出验收卡，不批准。",
};

export function governanceRoleEmptyHint(governanceFunction: unknown): string {
  return typeof governanceFunction === "string"
    ? GOVERNANCE_ROLE_HINT[governanceFunction] || ""
    : "";
}

// —————— pin 不符（reaccept）——————

export function pinCountOf(pinCount: unknown): number {
  return typeof pinCount === "number" && Number.isFinite(pinCount) && pinCount > 0
    ? Math.floor(pinCount)
    : 0;
}

export function shortHash(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 8) : "";
}

export interface PinChangedEntry {
  status: string;
  path: string;
  pinned?: string;
  actual?: string;
}

/** 归一不一致条目：优先 `changed`，旧 listing 用 `pinFiles` 承载同一事实。 */
export function changedEntries(record: Record<string, unknown> | null | undefined): PinChangedEntry[] {
  const source = Array.isArray(record?.changed)
    ? (record?.changed as unknown[])
    : Array.isArray(record?.pinFiles)
      ? (record?.pinFiles as unknown[])
      : [];
  const list: PinChangedEntry[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    list.push({
      status: typeof entry.status === "string" ? entry.status : "",
      path: typeof entry.path === "string" ? entry.path : "",
      pinned: typeof entry.pinned === "string" ? entry.pinned : undefined,
      actual: typeof entry.actual === "string" ? entry.actual : undefined,
    });
  }
  return list;
}

export function changedCounts(changed: ReadonlyArray<PinChangedEntry>): {
  modified: number;
  missing: number;
  unreadable: number;
} {
  const counts = { modified: 0, missing: 0, unreadable: 0 };
  for (const entry of changed) {
    if (entry.status === "modified") counts.modified += 1;
    else if (entry.status === "missing") counts.missing += 1;
    else if (entry.status === "unreadable") counts.unreadable += 1;
  }
  return counts;
}

/** pin-mismatch 状态行（逐字；只列非零类别）。 */
export function governancePinMismatchText(
  pinCount: unknown,
  changed: ReadonlyArray<PinChangedEntry>,
): string {
  const n = pinCountOf(pinCount);
  const counts = changedCounts(changed);
  const parts: string[] = [];
  if (counts.modified > 0) parts.push(counts.modified + " 个内容已变更");
  if (counts.missing > 0) parts.push(counts.missing + " 个缺失");
  if (counts.unreadable > 0) parts.push(counts.unreadable + " 个不可读");
  const detail = parts.length ? parts.join("、") : "存在不一致";
  return (
    "治理记录与盘上边界不一致：共 " +
    n +
    " 条 pin，其中 " +
    changed.length +
    " 个与记录不一致（" +
    detail +
    "）。未确认前，会话不能开启、写入会被拒绝。"
  );
}

export function governancePinMismatchEmptyState(
  pinCount: unknown,
  changed: ReadonlyArray<PinChangedEntry>,
): { kind: "governance"; title: string; sub: string; hint: string } {
  return {
    kind: "governance",
    title: "治理记录与盘上边界不一致",
    sub:
      governancePinMismatchText(pinCount, changed) +
      "确认接受后只会刷新 SHA-256 与留痕，不会修改任何边界文件内容。",
    hint: "也可在终端核对 git 历史后再处理。",
  };
}

export interface ReacceptPreviewView {
  title: string;
  fileLines: Array<{ status: string; path: string; text: string }>;
  writeLine: string;
  pinLine: string;
  warning: string;
  canConfirm: boolean;
  blockerLines: string[];
  previewDigest: string;
  pinCount: number;
  changed: PinChangedEntry[];
}

/** 重新接受预览视图（逐字沿用旧 `governanceReacceptPreviewView`）。 */
export function governanceReacceptPreviewView(preview: unknown): ReacceptPreviewView {
  const record = preview && typeof preview === "object" ? (preview as Record<string, unknown>) : {};
  const changed = changedEntries(record);
  const fileLines: ReacceptPreviewView["fileLines"] = [];
  for (const file of changed) {
    let text = "";
    if (file.status === "modified") {
      text =
        file.path +
        " — 内容已变更（pin " +
        shortHash(file.pinned) +
        "… → 现 " +
        shortHash(file.actual) +
        "…）";
    } else if (file.status === "missing") {
      text = file.path + " — 文件缺失（无法重新 pin）";
    } else if (file.status === "unreadable") {
      text = file.path + " — 文件不可读（无法重新 pin）";
    }
    if (text !== "") fileLines.push({ status: file.status, path: file.path, text });
  }
  const blockerLines: string[] = [];
  for (const item of Array.isArray(record.blockers) ? record.blockers : []) {
    if (item && typeof item === "object") {
      const message = (item as Record<string, unknown>).message;
      if (typeof message === "string" && message !== "") blockerLines.push(message);
    }
  }
  return {
    title: "重新接受治理边界（预览）",
    fileLines,
    writeLine: "将写入：.ans/project.json、docs/bootstrap-manifest.md",
    pinLine:
      "将重算这 " +
      pinCountOf(record.pinCount) +
      " 条 pin；不新增、不删除 pin 条目，不修改任何边界文件内容。",
    warning: "如果不认识这些改动，请先通过 git 历史或备份核对，不要直接接受。",
    canConfirm: record.canConfirm === true,
    blockerLines,
    previewDigest: typeof record.previewDigest === "string" ? record.previewDigest : "",
    pinCount: pinCountOf(record.pinCount),
    changed,
  };
}

export function governanceReacceptSuccessText(pinCount: unknown, changedCount: unknown): string {
  const n = pinCountOf(pinCount);
  const c =
    typeof changedCount === "number" && Number.isFinite(changedCount) && changedCount > 0
      ? Math.floor(changedCount)
      : 0;
  return (
    "已重新接受：更新 " +
    c +
    " 条 pin（共 " +
    n +
    " 条），写入 .ans/project.json 与 docs/bootstrap-manifest.md。项目已恢复可用。"
  );
}

/** 重新接受失败视图：phase 是零副作用的唯一依据。 */
export function governanceReacceptFailureView(
  phase: unknown,
  status: unknown,
  message: unknown,
): { lines: string[]; noRetry: boolean } {
  const lines: string[] = [];
  const msg = typeof message === "string" ? message : "";
  if (msg !== "") lines.push(msg);
  if (phase !== "write") {
    if (msg.indexOf("未写入任何文件") < 0) lines.push("本次未写入任何文件。");
    if (status === "no-record") lines.push("没有治理记录；请先建立治理记录。");
    else if (status === "invalid-record") lines.push("治理记录不可用；本版不提供修复。");
    else if (status === "not-needed") lines.push("边界与记录一致，无需重新接受。");
    else if (status === "preview-stale")
      lines.push("预览后边界文件又有变化，已取消本次写入；请重新检查。");
    else if (
      status === "missing-file" ||
      status === "unreadable-file" ||
      status === "unparseable-boundary"
    ) {
      lines.push("请先处理上述文件后重试。");
    } else if (status === "busy")
      lines.push("上一次操作仍在进行中；本次未写入任何文件。");
  }
  return { lines, noRetry: phase === "write" };
}

// —————— 建立治理记录 ——————

function asPreviewList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
}

export interface EstablishPreviewView {
  title: string;
  writeLines: string[];
  pinPaths: string[];
  pinCount: number;
  roleCount: number;
  adoptLine: string;
  model: string;
  suggestion: string;
  legacyRoleLines: string[];
  declaration: string;
  canConfirm: boolean;
  blockers: string[];
}

/** 建立预览视图：只转写预览回包字段，缺省如实「未报告」。 */
export function governanceEstablishPreviewView(preview: unknown): EstablishPreviewView {
  const record = preview && typeof preview === "object" ? (preview as Record<string, unknown>) : {};
  const writePaths = asPreviewList(record.writePaths);
  const pinPaths = asPreviewList(record.pinPaths);
  const adoptExisting = record.adoptExistingBoundary === true;
  const boundaryPath = typeof record.boundaryPath === "string" ? record.boundaryPath : "";
  const legacyRolePaths = asPreviewList(record.legacyBoundaryRoles);
  const blockers: string[] = [];
  for (const item of Array.isArray(record.blockers) ? record.blockers : []) {
    if (item && typeof item === "object") {
      const message = (item as Record<string, unknown>).message;
      if (typeof message === "string" && message !== "") blockers.push(message);
    }
  }
  return {
    title: "建立治理记录（预览）",
    writeLines: writePaths.length
      ? writePaths.map((path) => "将写入：" + path)
      : ["将写入：（未报告）"],
    pinPaths,
    pinCount:
      typeof record.pinCount === "number" && Number.isFinite(record.pinCount)
        ? Math.floor(record.pinCount)
        : pinPaths.length,
    roleCount:
      typeof record.roleCount === "number" && Number.isFinite(record.roleCount)
        ? Math.floor(record.roleCount)
        : 0,
    adoptLine: adoptExisting
      ? "将采纳既有治理边界文档（不覆盖其内容）。"
      : boundaryPath
        ? "将写入治理边界文档：" + boundaryPath + "。"
        : "治理边界文档：（未报告）",
    model: typeof record.governanceModel === "string" ? record.governanceModel : "",
    suggestion: record.suggestedGovernanceModel === "trio" ? "trio" : "",
    legacyRoleLines: legacyRolePaths.map(
      (path) => path + "（旧版 Markdown 边界；将被原样 pin，迁移属后续版本）",
    ),
    declaration: "不扩大任何角色写边界、不修改任何角色边界文件内容。",
    canConfirm: record.canConfirm !== false,
    blockers,
  };
}

/** 建立失败视图（旧 `governanceFailureView`）。 */
export function governanceFailureView(
  phase: unknown,
  code: unknown,
  message: unknown,
): { lines: string[]; noRetry: boolean } {
  const lines: string[] = [];
  if (typeof message === "string" && message !== "") lines.push(message);
  if (phase !== "write") {
    if (code === "already-established") lines.push("治理记录已存在；本次未写入任何文件。");
    else if (code === "busy") lines.push("上一次建立仍在进行中；本次未写入任何文件。");
    else if (code === "invalid-record")
      lines.push("治理记录不可用；本版不自动覆盖，修复路径待后续版本。");
    else {
      if (typeof code === "string" && code !== "") lines.push("错误码：" + code);
      lines.push("未写入任何文件。");
    }
  } else if (typeof code === "string" && code !== "") {
    lines.push("错误码：" + code);
  }
  return {
    lines,
    noRetry: code === "already-established" || code === "invalid-record",
  };
}

export function governanceModelOptionText(model: unknown): string {
  if (model === "single") return "单模型（single）";
  if (model === "trio") return "三权（trio）";
  return "";
}

export const GOVERNANCE_MODEL_UNWIRED =
  "当前桌面窗口未接线治理模型选择；本版不能按所选模型建立，按钮已禁用。";
export const GOVERNANCE_MODEL_SUGGEST =
  "检测到三权产物（docs/proposals / docs/nominations / docs/flows），建议选择 trio；请由你点选。";

// —————— 迁移预览（single → trio）——————

export const GOVERNANCE_MIGRATION_TEXT =
  "本项目使用旧治理模型（su）。可升级为三权模型。";
export const GOVERNANCE_MIGRATION_LABEL = "查看差异 / 升级";
export const GOVERNANCE_MIGRATION_LABEL_PENDING = "升级入口待本版后续";

export function governanceMigrationButtonView(wired: boolean): {
  label: string;
  disabled: boolean;
  title: string;
} {
  return wired
    ? {
        label: GOVERNANCE_MIGRATION_LABEL,
        disabled: false,
        title:
          "打开迁移预览（零写入）；确认后只改 .ans 的 governanceModel 并追加 manifest 记录。",
      }
    : {
        label: GOVERNANCE_MIGRATION_LABEL_PENDING,
        disabled: true,
        title: "迁移预览与写入尚未接线；本版不可用。",
      };
}

function migrationItemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path : "";
    const oldHash = typeof record.oldSha256 === "string" ? record.oldSha256 : "";
    const newHash = typeof record.newSha256 === "string" ? record.newSha256 : "";
    if (path !== "" && (oldHash !== "" || newHash !== "")) {
      return path + "（" + shortHash(oldHash) + "… → " + shortHash(newHash) + "…）";
    }
    if (path !== "") return path;
    if (typeof record.message === "string" && record.message !== "") return record.message;
    try {
      return JSON.stringify(item);
    } catch {
      return "";
    }
  }
  return item == null ? "" : String(item);
}

export interface MigrationPreviewView {
  title: string;
  modelLine: string;
  writeLines: string[];
  modelFieldLine: string;
  manifestLine: string;
  pinLines: string[];
  retainedLines: string[];
  digestLine: string;
  warning: string;
  canConfirm: boolean;
  digest: string;
}

export function governanceMigrationPreviewView(preview: unknown): MigrationPreviewView {
  const record = preview && typeof preview === "object" ? (preview as Record<string, unknown>) : {};
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(migrationItemText).filter((item) => item !== "") : [];
  const model =
    governanceModelText(record.model) ||
    (typeof record.model === "string" && record.model !== "" ? record.model : "旧模型");
  const target =
    governanceModelText(record.targetModel) ||
    (typeof record.targetModel === "string" && record.targetModel !== ""
      ? record.targetModel
      : "三权");
  const writePaths = listOf(record.writePaths);
  const pinChanges = listOf(record.pinChanges);
  const retainedFiles = listOf(record.retainedFiles);
  const digest = typeof record.snapshotDigest === "string" ? record.snapshotDigest : "";
  const modelFieldText =
    record.modelField === null
      ? '（字段缺失，将新增 governanceModel: "trio"）'
      : record.modelField === "single" || record.modelField === "trio"
        ? record.modelField
        : "（未报告）";
  return {
    title: "升级为三权治理模型（预览）",
    modelLine: "模型：" + model + " → " + target,
    writeLines: writePaths.length
      ? writePaths.map((path) => "将写入：" + path)
      : ["将写入：（未报告）"],
    modelFieldLine: "将写入 .ans 字段：" + modelFieldText,
    manifestLine:
      "将追加 manifest 记录：" +
      (typeof record.manifestLine === "string" && record.manifestLine !== ""
        ? record.manifestLine
        : "（未报告）"),
    pinLines: pinChanges.length
      ? pinChanges.map((item) => "pin 变更：" + item)
      : ["pin 变更：无（不重算 pin）"],
    retainedLines: [
      "保留文件：" + (retainedFiles.length ? retainedFiles.join("、") : "无"),
    ],
    digestLine: "预览摘要（前 8 位）：" + (digest !== "" ? shortHash(digest) : "（未报告）"),
    warning:
      "预览零写入。确认后只改 .ans 的 governanceModel 并追加 manifest 记录；不重写角色卡/边界/pin/历史会话。",
    canConfirm: digest !== "",
    digest,
  };
}

export function governanceMigrationSuccessText(): string {
  return '已升级为三权治理模型（.ans governanceModel = "trio"）。旧角色卡/边界/pin/历史会话保留。';
}

export function governanceMigrationFailureView(
  phase: unknown,
  status: unknown,
  message: unknown,
): { lines: string[]; noRetry: boolean } {
  const lines: string[] = [];
  const msg = typeof message === "string" ? message : "";
  if (msg !== "") lines.push(msg);
  const st = typeof status === "string" ? status : "";
  if (phase !== "write") {
    if (st === "already-trio") lines.push("已是三权治理模型，无需升级；本次未写入任何文件。");
    else if (st === "no-record")
      lines.push("没有治理记录（.ans/project.json）；本次未写入任何文件。");
    else if (st === "blocked") lines.push("升级被阻止；本次未写入任何文件。");
    else if (st === "preview-stale")
      lines.push("预览后 .ans 又有变化，已取消本次写入；请重新检查。");
    else if (st === "busy") lines.push("上一次升级仍在进行中；本次未写入任何文件。");
    else if (st === "invalid-request") lines.push("升级请求无效；本次未写入任何文件。");
    else {
      if (st !== "") lines.push("状态：" + st);
      lines.push("本次未写入任何文件。");
    }
  } else if (st === "write-failed") {
    lines.push("写入阶段失败，可能已写入部分文件，请核对现场。");
  } else if (st !== "") {
    lines.push("状态：" + st);
  }
  return {
    lines,
    noRetry: phase === "write" || st === "already-trio" || st === "no-record",
  };
}

// —————— 治理卡元信息 / 镜像 / 聚合 ——————

export const GOVERNANCE_DECISION_BADGE = "治理决定 · 客户最终批准";
export const GOVERNANCE_INTENT_BADGE = "需求确认 · 客户";
export const GOVERNANCE_QUEUE_NOTE = "等待前一个决定";
export const GOVERNANCE_MIRROR_BADGE = "镜像 · 主入口";

const GOVERNANCE_CARD_POWER: Record<string, string> = {
  proposal: "提案",
  appointment: "提名",
  "appointment-write": "提名",
  "schedule-write": "编排",
  acceptance: "验收",
  "intent-confirm": "需求确认",
};

export interface GovernanceCardMeta {
  governance: boolean;
  badge: string;
  power: string;
  flowId: string;
  stepId: string;
  lines: string[];
}

/** 治理卡元信息（旧 `governanceCardMetaView` 逐字；缺省不显示、不猜）。 */
export function governanceCardMetaView(request: unknown): GovernanceCardMeta {
  const req = request && typeof request === "object" ? (request as Record<string, unknown>) : {};
  const cardKind = typeof req.cardKind === "string" ? req.cardKind : "";
  const power = GOVERNANCE_CARD_POWER[cardKind] || "";
  const flowId = typeof req.flowId === "string" ? req.flowId : "";
  const stepId = typeof req.stepId === "string" ? req.stepId : "";
  const lines: string[] = [];
  if (flowId !== "") lines.push("流程：" + flowId);
  if (stepId !== "") lines.push("步骤：" + stepId);
  if (power !== "") lines.push("权力类型：" + power);
  const paths = Array.isArray(req.paths)
    ? req.paths.filter((path): path is string => typeof path === "string" && path !== "")
    : [];
  for (const path of paths) lines.push("将写路径：" + path);
  if (typeof req.summary === "string" && req.summary !== "") lines.push("摘要：" + req.summary);
  if (typeof req.artifactSha256 === "string" && req.artifactSha256 !== "")
    lines.push("哈希：" + req.artifactSha256);
  return {
    governance: power !== "",
    badge:
      power === ""
        ? ""
        : cardKind === "intent-confirm"
          ? GOVERNANCE_INTENT_BADGE
          : GOVERNANCE_DECISION_BADGE,
    power,
    flowId,
    stepId,
    lines,
  };
}

export function governanceMirrorSourceLabel(sourceName: unknown): string {
  const name =
    typeof sourceName === "string" && sourceName !== "" ? sourceName : "发起角色";
  return "来自 " + name + " 的治理决定 · 客户最终批准";
}

export function governanceQueueAggregateText(count: unknown): string {
  const n =
    typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return n > 0 ? "还有 " + n + " 个决定等待前一个决定" : "";
}
