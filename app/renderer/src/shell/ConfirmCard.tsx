/**
 * 确认卡族（Phase 3B）：shell 命令确认 / su 命令审批 / 恢复确认。
 *
 * fail-closed 纪律（沿旧渲染器与 UIUX 规范 §10.8）：
 * - 命令/证据逐字 `<pre>`（无 HTML 注入口）；默认焦点在「拒绝 / 取消」；
 * - Esc / 关闭（×）/「拒绝 / 取消」= 不放行 / 不执行；仅显式「放行执行 / 执行」才回 allow:true；
 * - 等待不设限、零忙碌动效；本轮 settled 或失效回执后收起旧卡，不保留全禁用「已失效」卡；
 * - 恢复卡失效/通道异常原地定格（动作禁用、如实提示），绝不呈现为已执行。
 *
 * 元素常驻 DOM（`hidden` 切换）以保持 `#shell-confirm/#recovery-confirm/#rc-details` 契约。
 */

import { useEffect, useRef } from "react";
import { ChevronRight, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/chat/chat-store";
import {
  recoveryActionView,
  recoveryTimeText,
  shellConfirmTitle,
  suApprovalTierLabel,
} from "@/chat/judge";
import { governanceView } from "@/chat/role-view";
import type { ConfirmCardRecord } from "@/chat/confirm-logic";
import { useConfirmStore } from "@/stores/confirm-store";

const SHELL_CONFIRM_DEFAULT_HINT =
  "点「拒绝」、按 Esc 或关闭本框 = 不放行（不会执行）。";
const SU_APPROVAL_WARNING =
  "批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。";
const RECOVERY_CONFIRM_DEFAULT_HINT =
  "点「取消」、按 Esc 或关闭本框 = 不执行；仅点「执行」才会执行。";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function recoveryRoleName(roleId: string): string {
  if (!roleId) return "(未标识)";
  const role = useChatStore
    .getState()
    .roles.find((candidate) => candidate.roleId === roleId);
  if (!role) return roleId;
  const gov = governanceView(role.governanceFunction);
  return gov ? gov.name : role.roleId;
}

function ShellConfirmCard({ card }: { card: ConfirmCardRecord | null }) {
  const respond = useConfirmStore((s) => s.respondShell);
  const denyRef = useRef<HTMLButtonElement>(null);
  const lastId = useRef<string>("");
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (card && card.id !== lastId.current) {
      if (!lastId.current && document.activeElement instanceof HTMLElement) {
        restoreRef.current = document.activeElement;
      }
      lastId.current = card.id;
      denyRef.current?.focus();
    }
    if (!card) {
      lastId.current = "";
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    }
  }, [card]);

  const payload = card ? asRecord(card.payload) : {};
  const suApproval = payload.policy === "su-approval";
  const roleId = asString(payload.roleId);
  const title = shellConfirmTitle(payload.policy, roleId);
  const command = asString(payload.command);
  const summary = asString(payload.summary);
  const tierLabel = suApproval ? suApprovalTierLabel(payload.tier) : "";
  const summaryText = suApproval && tierLabel
    ? summary
      ? tierLabel + " · " + summary
      : tierLabel
    : summary;
  const judgeNotice = asString(payload.judgeNotice);
  const reasonRaw = asString(payload.reasonRaw);
  const reasonPlain = asString(payload.reasonPlain);
  const reasonText =
    suApproval && reasonRaw
      ? reasonPlain
        ? reasonPlain + "\n命中原因：" + reasonRaw
        : "命中原因：" + reasonRaw
      : reasonPlain;
  const cwd = asString(payload.cwd);
  const argvLines = asStringArray(payload.argvLines);
  const rawNote = reasonRaw
    ? "审核原文（内部用语，仅供核查）：" + reasonRaw
    : "";
  const busy = card?.busy === true;

  return (
    <div
      id="shell-confirm"
      className={"sc-overlay" + (suApproval ? " is-su-approval" : "")}
      hidden={!card}
    >
      {card ? (
        <div
          className="sc-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sc-title"
          data-request-id={card.id}
        >
          <div className="sc-head">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldAlert
                size={20}
                strokeWidth={1.75}
                className="text-warning"
                aria-hidden="true"
              />
              <span id="sc-title" className="sc-title">
                {title}
              </span>
              {suApproval ? (
                <Badge
                  variant="outline"
                  className="h-[16px] rounded-[4px] border-warning-border bg-warning-bg px-1 text-[10px] text-warning"
                >
                  su 审批
                </Badge>
              ) : null}
            </div>
            <button
              id="sc-close"
              type="button"
              className="sc-close"
              title="关闭（不放行）"
              aria-label="关闭（不放行）"
              disabled={busy}
              onClick={() => void respond(false)}
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <pre id="sc-command" className="sc-command">
            {command}
          </pre>

          <p id="sc-summary" className="sc-summary" hidden={summaryText === ""}>
            {summaryText}
          </p>
          <p
            id="sc-judge-notice"
            className="sc-judge-notice"
            hidden={judgeNotice === ""}
          >
            {judgeNotice}
          </p>
          <p id="sc-reason" className="sc-reason">
            {reasonText}
          </p>

          <details id="sc-details" className="sc-details" key={card.id}>
            <summary>
              <span>详情（argv / cwd）</span>
              <ChevronRight
                size={12}
                strokeWidth={1.5}
                aria-hidden="true"
                className="disclosure-chevron"
              />
            </summary>
            <div className="sc-details-body">
              <p className="sc-kv">工作目录（cwd）</p>
              <p id="sc-cwd" className="sc-mono sc-wrap">
                {cwd}
              </p>
              <p className="sc-kv">规范化参数 argv</p>
              <pre id="sc-argv" className="sc-mono">
                {argvLines.join("\n")}
              </pre>
              <p id="sc-reason-raw" className="sc-hint" hidden={rawNote === ""}>
                {rawNote}
              </p>
            </div>
          </details>

          <div className="sc-actions">
            <Button
              id="sc-allow"
              variant="outline"
              className="min-w-[88px]"
              disabled={busy}
              onClick={() => void respond(true)}
            >
              放行执行
            </Button>
            <Button
              id="sc-deny"
              ref={denyRef}
              className="confirm-default-focus min-w-[88px]"
              disabled={busy}
              onClick={() => void respond(false)}
            >
              拒绝
            </Button>
          </div>

          <p id="sc-hint" className="sc-hint">
            {suApproval ? (
              <span className="sc-su-warning">{SU_APPROVAL_WARNING}</span>
            ) : null}
            {suApproval ? " " : ""}
            {SHELL_CONFIRM_DEFAULT_HINT}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function RecoveryConfirmCard({ card }: { card: ConfirmCardRecord | null }) {
  const respond = useConfirmStore((s) => s.respondRecovery);
  const dismiss = useConfirmStore((s) => s.dismissRecovery);
  const denyRef = useRef<HTMLButtonElement>(null);
  const lastId = useRef<string>("");
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (card && card.id !== lastId.current) {
      if (!lastId.current && document.activeElement instanceof HTMLElement) {
        restoreRef.current = document.activeElement;
      }
      lastId.current = card.id;
      denyRef.current?.focus();
    }
    if (!card) {
      lastId.current = "";
      const previous = restoreRef.current;
      restoreRef.current = null;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    }
  }, [card]);

  const payload = card ? asRecord(card.payload) : {};
  const action = asString(payload.action);
  const view = recoveryActionView(action);
  const actionText = view
    ? "动作：" + view.label + "（" + action + "）"
    : "动作：" + action;
  const targetRoleId = asString(payload.roleId);
  const evidence = asString(payload.evidence);
  const reason = asString(payload.reason);
  const requestedBy = asString(payload.requestedBy);
  const requestedAt = recoveryTimeText(payload.requestedAt);
  const itemId = asString(payload.itemId);
  const byText = requestedBy ? "提议方：" + requestedBy : "";
  const atText = requestedAt ? "提议时间：" + requestedAt : "";
  const itemText = itemId ? "目标条目：" + itemId : "";
  const detailsHidden = !byText && !atText && !itemText;
  const expired = !!card?.expiredReason;
  const inFlight = card?.busy === true && !expired;

  return (
    <div
      id="recovery-confirm"
      className={"sc-overlay" + (expired ? " is-expired" : "")}
      hidden={!card}
    >
      {card ? (
        <div
          className={"sc-card" + (expired ? " is-expired" : "")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rc-title"
          data-request-id={card.id}
        >
          <div className="sc-head">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldAlert
                size={20}
                strokeWidth={1.75}
                className="text-warning"
                aria-hidden="true"
              />
              <span id="rc-title" className="sc-title">
                恢复操作请求
              </span>
            </div>
            <button
              id="rc-close"
              type="button"
              className="sc-close"
              title="关闭（不执行）"
              aria-label="关闭（不执行）"
              disabled={inFlight}
              onClick={() => {
                if (expired) dismiss();
                else void respond(false);
              }}
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <p id="rc-action" className="rc-action">
            {actionText}
          </p>
          <p id="rc-note" className="rc-note" hidden={!view}>
            {view ? view.note : ""}
          </p>
          <p id="rc-role" className="rc-role">
            目标角色：{recoveryRoleName(targetRoleId)}
          </p>
          <p id="rc-reason" className="sc-reason" hidden={reason === ""}>
            {reason ? "原因（提议方提供）：" + reason : ""}
          </p>
          <p className="rc-evidence-label">证据（提议方提供，逐字）：</p>
          <pre id="rc-evidence" className="rc-evidence">
            {evidence}
          </pre>

          <details id="rc-details" className="sc-details" hidden={detailsHidden} key={card.id}>
            <summary>
              <span>详情（提议方 / 时间 / 条目）</span>
              <ChevronRight
                size={12}
                strokeWidth={1.5}
                aria-hidden="true"
                className="disclosure-chevron"
              />
            </summary>
            <div className="sc-details-body">
              <p id="rc-by" className="sc-kv" hidden={byText === ""}>
                {byText}
              </p>
              <p id="rc-at" className="sc-kv" hidden={atText === ""}>
                {atText}
              </p>
              <p id="rc-item" className="sc-kv" hidden={itemText === ""}>
                {itemText}
              </p>
            </div>
          </details>

          <div className="sc-actions">
            <Button
              id="rc-allow"
              variant="outline"
              className="min-w-[88px]"
              disabled={inFlight || expired}
              onClick={() => void respond(true)}
            >
              执行
            </Button>
            <Button
              id="rc-deny"
              ref={denyRef}
              className="confirm-default-focus min-w-[88px]"
              disabled={inFlight || expired}
              onClick={() => {
                if (expired) dismiss();
                else void respond(false);
              }}
            >
              取消
            </Button>
          </div>

          <p id="rc-hint" className="sc-hint">
            {expired ? card?.expiredReason : RECOVERY_CONFIRM_DEFAULT_HINT}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ConfirmCard() {
  const shellConfirm = useConfirmStore((s) => s.shellConfirm);
  const recoveryConfirm = useConfirmStore((s) => s.recoveryConfirm);
  const respondShell = useConfirmStore((s) => s.respondShell);
  const respondRecovery = useConfirmStore((s) => s.respondRecovery);

  useEffect(() => {
    if (!shellConfirm && !recoveryConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // 两卡同开时 Esc 先答上层（recovery）；两者 Esc 都 = 否决（fail-closed）。
        if (recoveryConfirm) {
          event.preventDefault();
          void respondRecovery(false);
          return;
        }
        if (shellConfirm) {
          event.preventDefault();
          void respondShell(false);
        }
        return;
      }
      if (event.key !== "Tab") return;
      const overlay = document.getElementById(
        recoveryConfirm ? "recovery-confirm" : "shell-confirm",
      );
      const card = overlay?.querySelector<HTMLElement>(".sc-card") || null;
      if (!card) return;
      const list = focusables(card);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !card.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !card.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shellConfirm, recoveryConfirm, respondShell, respondRecovery]);

  return (
    <>
      <ShellConfirmCard card={shellConfirm} />
      <RecoveryConfirmCard card={recoveryConfirm} />
    </>
  );
}
