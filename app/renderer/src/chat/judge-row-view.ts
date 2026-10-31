/**
 * shell 判断结果行卡片（2026-10-25 UI 精修）。
 *
 * 只改渲染/样式：title/label 等视图字段语义不动；标题拆成主体 + 副标识两段渲染，
 * 但 textContent 仍逐字等于 view.title（完整信息不丢），aria-label 也保留全文。
 *
 * 无 JSX：node --test 可直接 react-dom/server 渲染断言。
 */

import { createElement, useSyncExternalStore, type ReactNode } from "react";
import { ChevronRight, ShieldCheck, ShieldX } from "lucide-react";
import type { Translator } from "../i18n/index.ts";
import { getDesktopBridge, type DesktopBridge } from "../lib/platform.ts";
import { shortTime } from "./tool-summary.ts";
import {
  judgePauseReplyResult,
  judgePauseState,
  type JudgePauseSnapshotLike,
  type ShellJudgeResultView,
} from "./judge.ts";
import { normalizeToolRowText } from "./tool-row-text.ts";

// —————— 「本次运行暂停自动审批」的渲染侧状态（shell-only；2026-10-31 判拒升级方案 §4.6）——————
// 权威状态在主进程（`shell:judge-state` 推送 / `shell:judge-get` 读取）；本模块只保存
// 最近一次报告值与请求在途状态，供判拒结果行与升级卡页脚共享（单一状态源）。
// 旧主进程缺 `setShellJudgePaused` ⇒ available:false：按钮禁用并给出说明，绝不假造暂停态。

export interface JudgePauseSnapshot extends JudgePauseSnapshotLike {
  available: boolean;
  paused: boolean;
  busy: boolean;
  justPaused: boolean;
  failed: boolean;
  error: string;
}

const EMPTY_PAUSE_SNAPSHOT: JudgePauseSnapshot = {
  available: false,
  paused: false,
  busy: false,
  justPaused: false,
  failed: false,
  error: "",
};

let pauseSnapshot: JudgePauseSnapshot = { ...EMPTY_PAUSE_SNAPSHOT };
let pauseBridgeInstalled = false;
const pauseListeners = new Set<() => void>();

export function getJudgePauseSnapshot(): JudgePauseSnapshot {
  return pauseSnapshot;
}

export function subscribeJudgePause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

/** 写入暂停状态（只在主进程报告/本模块请求回包时调用；测试可注入）。 */
export function setJudgePauseSnapshot(
  patch: Partial<JudgePauseSnapshot>,
): void {
  pauseSnapshot = { ...pauseSnapshot, ...patch };
  for (const listener of [...pauseListeners]) {
    try {
      listener();
    } catch {
      /* 订阅者异常不影响其它视图。 */
    }
  }
}

export function useJudgePauseSnapshot(): JudgePauseSnapshot {
  return useSyncExternalStore(
    subscribeJudgePause,
    getJudgePauseSnapshot,
    getJudgePauseSnapshot,
  );
}

/** 主进程推送/读取的开关载荷（`{version:1, paused?: boolean}`；旧主进程无 paused 字段 ⇒ 忽略）。 */
export function applyJudgePausePayload(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const record = payload as Record<string, unknown>;
  if (record.version !== 1 || typeof record.paused !== "boolean") return;
  setJudgePauseSnapshot({
    paused: record.paused,
    ...(record.paused === true ? {} : { justPaused: false }),
  });
}

/**
 * 接线暂停通道（`chat/ipc.ts` 在启动时调用一次）：探测 `setShellJudgePaused` 能力，
 * 订阅主进程状态并读取一次初始快照。能力缺席 ⇒ 保持 available:false（禁用 + 说明）。
 */
export function installJudgePauseBridge(bridge: DesktopBridge | null): void {
  if (pauseBridgeInstalled || !bridge) return;
  pauseBridgeInstalled = true;
  const available =
    typeof bridge.setShellJudgePaused === "function" &&
    typeof bridge.getShellJudgeState === "function" &&
    typeof bridge.onShellJudgeState === "function";
  setJudgePauseSnapshot({ available });
  if (!available) return;
  bridge.onShellJudgeState!((payload) => applyJudgePausePayload(payload));
  try {
    Promise.resolve(bridge.getShellJudgeState!()).then(
      (payload) => applyJudgePausePayload(payload),
      () => undefined,
    );
  } catch {
    /* 旧桥异常不影响界面：保持未暂停（不假造暂停态）。 */
  }
}

/** 暂停/恢复（只提交意图；以主进程回包为准）。返回是否成功获得主进程确认。 */
export async function requestJudgePause(paused: boolean): Promise<boolean> {
  const current = pauseSnapshot;
  if (!current.available || current.busy) return false;
  setJudgePauseSnapshot({
    busy: true,
    error: "",
    failed: false,
    justPaused: false,
  });
  const bridge = getDesktopBridge();
  let res: unknown = null;
  if (bridge?.setShellJudgePaused) {
    try {
      res = await bridge.setShellJudgePaused(paused === true);
    } catch {
      res = null;
    }
  }
  const result = judgePauseReplyResult(current.paused, res);
  setJudgePauseSnapshot({
    busy: false,
    paused: result.paused,
    error: result.error,
    failed: !result.ok,
    justPaused: result.ok && result.paused === true,
  });
  return result.ok;
}

/** 测试用：恢复暂停状态与接线标记（生产代码不调用）。 */
export function resetJudgePauseForTests(): void {
  pauseBridgeInstalled = false;
  pauseSnapshot = { ...EMPTY_PAUSE_SNAPSHOT };
  for (const listener of [...pauseListeners]) {
    try {
      listener();
    } catch {
      /* 同上。 */
    }
  }
}

export interface ShellJudgeRowCardProps {
  view: ShellJudgeResultView;
  t: Translator;
}

/** 标题括号前缀拆分：「已替你放行（…）」→ 主体 + 包含括号的副标识。 */
export function splitJudgeTitle(title: string): { main: string; meta: string } {
  const match = /[（(]/.exec(title);
  if (!match || match.index <= 0 || !/[）)]\s*$/.test(title)) {
    return { main: title, meta: "" };
  }
  return {
    main: title.slice(0, match.index).replace(/^\s+/, ""),
    meta: title.slice(match.index),
  };
}

function detailSection(label: string | null, ...children: ReactNode[]) {
  return createElement(
    "section",
    { className: "sj-detail-section" },
    label ? createElement("p", { className: "sj-d-label" }, label) : null,
    ...children,
  );
}

function codeBlock(text: string) {
  return createElement(
    "pre",
    { className: "sj-pre" },
    createElement("code", null, text),
  );
}

/** 「替代方案：a\n替代方案：b」→ 去掉前缀后的列表项；单条也按列表渲染。 */
function alternativeItems(text: string, t: Translator): string[] {
  const prefix = t("ui.judge.alternative", { value: "" });
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith(prefix) ? line.slice(prefix.length).trim() : line,
    )
    .filter(Boolean);
}

function pauseControls(
  snapshot: JudgePauseSnapshot,
  t: Translator,
): ReactNode {
  const state = judgePauseState(snapshot);
  const children: ReactNode[] = [];
  if (!state.available) {
    // 旧主进程未提供暂停通道：禁用并说明，不假装「已暂停/可暂停」。
    children.push(
      createElement(
        "button",
        {
          type: "button",
          className: "sj-pause-btn",
          disabled: true,
          title: t("ui.judge.bridgeMissing"),
          key: "pause",
        },
        t("ui.judge.pauseSession"),
      ),
    );
    children.push(
      createElement(
        "span",
        { className: "sj-pause-note", key: "bridge" },
        t("ui.judge.bridgeMissing"),
      ),
    );
  } else if (state.paused) {
    children.push(
      createElement(
        "span",
        { className: "sj-pause-badge", key: "badge" },
        t("ui.judge.pausedBadge"),
      ),
    );
    children.push(
      createElement(
        "button",
        {
          type: "button",
          className: "sj-pause-resume",
          disabled: state.busy,
          key: "resume",
          onClick: () => {
            void requestJudgePause(false);
          },
        },
        t("ui.judge.resume"),
      ),
    );
  } else {
    children.push(
      createElement(
        "button",
        {
          type: "button",
          className: "sj-pause-btn",
          disabled: state.busy,
          title: t("ui.judge.pauseSession"),
          key: "pause",
          onClick: () => {
            void requestJudgePause(true);
          },
        },
        t("ui.judge.pauseSession"),
      ),
    );
  }
  if (state.justPaused) {
    children.push(
      createElement(
        "span",
        { className: "sj-pause-note is-done", key: "done" },
        t("ui.judge.pauseSessionDone"),
      ),
    );
  }
  if (state.failed) {
    children.push(
      createElement(
        "span",
        { className: "sj-pause-note is-error", key: "error" },
        state.error || t("ui.judge.toggleFailed"),
      ),
    );
  }
  return createElement("div", { className: "sj-pause" }, ...children);
}

export function ShellJudgeRowCard({ view, t }: ShellJudgeRowCardProps) {
  const pauseSnapshot = useJudgePauseSnapshot();
  const allow = view.verdict === "allow";
  const title = splitJudgeTitle(view.title);
  const badgeLabel = t("ui.judge.titlePrefix", {
    label: t("ui.judge.mode.approval"),
  });
  const tierLabel = view.label || t("ui.judge.hardDenyLabel");
  const metaText = [
    view.engineText,
    view.operatorText,
    shortTime(view.at),
    view.tierText,
  ]
    .filter(Boolean)
    .join(" · ");
  const d = view.details;
  // deny 的判断理由/替代方案/客户说明已在展开区逐项渲染；这里只补 allow 的硬拒说明。
  const extraLines = view.verdict === "allow" ? view.lines : [];
  const alternativeList = d.alternative
    ? alternativeItems(d.alternative, t)
    : [];
  const evidenceItems = d.evidence.filter(
    (item) => normalizeToolRowText(item) !== normalizeToolRowText(d.command),
  );

  return createElement(
    "div",
    { className: "sys-text sj-body" },
    createElement(
      "div",
      { className: "sj-head" },
      createElement(
        "span",
        {
          className: "sj-verdict-icon " + (allow ? "is-allow" : "is-deny"),
          "aria-hidden": "true",
        },
        createElement(allow ? ShieldCheck : ShieldX, {
          size: 12,
          strokeWidth: 2,
        }),
      ),
      createElement(
        "span",
        { className: "sj-auto-badge " + (allow ? "is-allow" : "is-deny") },
        badgeLabel,
      ),
      createElement(
        "span",
        { className: "sj-title", "aria-label": view.title },
        createElement("strong", { className: "sj-title-main" }, title.main),
        title.meta
          ? createElement("span", { className: "sj-title-meta" }, title.meta)
          : null,
      ),
      view.denyOverride
        ? createElement("span", { className: "sj-tier-badge" }, tierLabel)
        : null,
    ),
    createElement(
      "div",
      {
        className: "sj-cmd" + (allow ? "" : " is-reason"),
        title: view.summary,
      },
      view.summary,
    ),
    createElement(
      "div",
      { className: "sj-foot" },
      createElement("div", { className: "sj-meta" }, metaText),
      view.verdict === "deny" ? pauseControls(pauseSnapshot, t) : null,
      createElement("details",
        { className: "sj-details" },
        createElement(
          "summary",
          null,
          createElement(ChevronRight, {
            className: "disclosure-chevron",
            size: 12,
            strokeWidth: 1.5,
            "aria-hidden": "true",
          }),
          t("ui.chatRow.judgeDetails"),
        ),
        createElement(
          "div",
          { className: "sj-details-body" },
          ...extraLines.map((line, index) =>
            createElement(
              "p",
              { className: "sj-detail-note", key: "line-" + index },
              line,
            ),
          ),
          view.retryHint
            ? createElement("p", { className: "sj-exit" }, view.retryHint)
            : null,
          d.command
            ? detailSection(
                t("ui.chatRow.commandOriginal"),
                codeBlock(d.command),
              )
            : null,
          d.reason
            ? detailSection(
                t("ui.judge.reasonLine", { reason: "" }),
                createElement("p", { className: "sj-d-value" }, d.reason),
              )
            : null,
          alternativeList.length > 0
            ? detailSection(
                t("ui.judge.alternative", { value: "" }),
                createElement(
                  "ul",
                  { className: "sj-list" },
                  ...alternativeList.map((item, index) =>
                    createElement("li", { key: "alternative-" + index }, item),
                  ),
                ),
              )
            : null,
          d.customerMessage
            ? createElement(
                "div",
                { className: "sj-callout" },
                createElement(
                  "p",
                  { className: "sj-d-label" },
                  t("ui.chatRow.customerMessage", { message: "" }),
                ),
                createElement(
                  "p",
                  { className: "sj-d-value" },
                  d.customerMessage,
                ),
                d.customerMessageSynthesized
                  ? createElement(
                      "p",
                      { className: "sj-detail-note" },
                      t("ui.chatRow.customerMessageNote"),
                    )
                  : null,
              )
            : d.customerMessageSynthesized
              ? createElement(
                  "p",
                  { className: "sj-detail-note" },
                  t("ui.chatRow.customerMessageNote"),
                )
              : null,
          d.cwd || d.toolCallId || evidenceItems.length > 0
            ? detailSection(
                t("ui.chatRow.evidence"),
                d.cwd || d.toolCallId
                  ? createElement(
                      "dl",
                      { className: "sj-kv-grid" },
                      d.cwd
                        ? createElement(
                            "div",
                            null,
                            createElement("dt", null, "cwd"),
                            createElement("dd", null, d.cwd),
                          )
                        : null,
                      d.toolCallId
                        ? createElement(
                            "div",
                            null,
                            createElement("dt", null, "toolCallId"),
                            createElement("dd", null, d.toolCallId),
                          )
                        : null,
                    )
                  : null,
                evidenceItems.length > 0
                  ? createElement(
                      "ul",
                      { className: "sj-list" },
                      ...evidenceItems.map((item, index) =>
                        createElement("li", { key: "evidence-" + index }, item),
                      ),
                    )
                  : null,
              )
            : null,
          d.hardDenyOverride
            ? createElement(
                "p",
                { className: "sj-detail-note" },
                t("ui.chatRow.hardDenyOverride"),
              )
            : null,
        ),
      ),
    ),
  );
}
