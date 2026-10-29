/**
 * 贴底输入区（Phase 3B）：发送/停止/附件（选图、粘贴、拖入、缩略图、移除）/双开关/一次性警告。
 *
 * - 发送：`sendSession(text, images, target, {clientMessageId})`；ok/queued/failure 如实呈现；
 *   未接受拒发恢复原文与附件，已接受轮次由真实 settled 报告结果。
 * - 停止本轮：`abortSession(target)` 三态如实一行（已请求/不支持/失败），不做乐观「已停止」。
 * - 双开关：主进程权威（shell:judge-state / decision:judge-state）；桥缺失禁用并显示固定文案，
 *   single 项目禁用「替我决策」；默认关、互不影响、重载复位；开启后一次性警告（知道了 / 约 9 秒）。
 * - 附件：渲染侧只读 File API 字节并交主进程校验；不触碰 Node/fs。
 * - textarea 保持非受控（DOM value 是唯一文本源，兼容旧 e2e 直接写值）；按角色保存草稿与附件。
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Scale, ShieldCheck, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getDesktopBridge } from "@/lib/platform";
import { reportRendererDiagnostic } from "@/chat/diagnostics";
import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import {
  attachmentTitle,
  clientImageProblem,
  type ImageFileLike,
} from "@/chat/confirm-logic";
import {
  judgeToggleView,
  judgeWarningLines,
  JUDGE_GROUP_APPROVAL,
  JUDGE_GROUP_DECISION,
  type JudgeGroup,
} from "@/chat/judge";
import { useConfirmStore } from "@/stores/confirm-store";
import { RUNTIME_OPTIONS, useUiStore } from "@/stores/ui-store";
import { useLocaleState, useT } from "@/i18n";

interface Attachment {
  id: string;
  key: string;
  name: string;
  mime: string;
  size: number;
  dataBase64: string;
  previewUrl: string;
  revoke: boolean;
}

interface Draft {
  text: string;
  attachments: Attachment[];
}

/** 草稿键：runtime×role（内存；成功发送/显式移除/切项目才清）。 */
function draftKey(runtime: string, roleId: string): string {
  return runtime + "\u0000" + roleId;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "cmid-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function resultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readFileBase64(file: File, readFailedText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(readFailedText));
    reader.onload = () => {
      const value = String(reader.result || "");
      const index = value.indexOf("base64,");
      resolve(index >= 0 ? value.slice(index + "base64,".length) : "");
    };
    reader.readAsDataURL(file);
  });
}

function releaseAttachments(list: Attachment[]): void {
  for (const attachment of list) {
    if (attachment.revoke && attachment.previewUrl.indexOf("blob:") === 0) {
      try {
        URL.revokeObjectURL(attachment.previewUrl);
      } catch {
        /* 资源清理失败不影响消息事实。 */
      }
    }
  }
}

let attachSeq = 0;

export function Composer() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState("");
  const [halting, setHalting] = useState(false);
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  const draftsRef = useRef(new Map<string, Draft>());
  const currentKeyRef = useRef("");
  const projectRef = useRef<string | null>(null);
  const runtime = useUiStore((s) => s.runtime);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const roles = useChatStore((s) => s.roles);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const sessionOpenRoleId = useChatStore((s) => s.sessionOpenRoleId);
  const roleBusy = useChatStore((s) => s.roleBusy);
  const governanceModel = useChatStore((s) => s.governanceModel);
  const appendLocalUser = useChatStore((s) => s.appendLocalUser);
  const appendSystemRow = useChatStore((s) => s.appendSystemRow);
  const setHint = useChatStore((s) => s.setHint);
  const setRoleError = useChatStore((s) => s.setRoleError);

  const judge = useConfirmStore((s) => s.judge);
  const warning = useConfirmStore((s) => s.warning);
  const setJudgeEnabled = useConfirmStore((s) => s.setJudgeEnabled);
  const acknowledgeWarning = useConfirmStore((s) => s.acknowledgeWarning);

  const role = findRole(roles, selectedRoleId);
  const roleName = role ? roleDisplayName(role, locale) : t("ui.role.noneSelected");
  const runtimeLabel =
    RUNTIME_OPTIONS.find((option) => option.id === runtime)?.label || "Claude";
  const selectedRoleName = role ? roleDisplayName(role, locale) : t("ui.composer.currentRole");
  const sessionOpen = !!selectedRoleId && sessionOpenRoleId === selectedRoleId;
  const busy = !!selectedRoleId && roleBusy[selectedRoleId] === true;
  const bridge = getDesktopBridge();
  const canSend = sessionOpen && !!projectRoot;

  const singleDisabled = governanceModel === "single";
  const approvalView = judgeToggleView(
    JUDGE_GROUP_APPROVAL,
    judge.approval.available,
    judge.approval.enabled,
    judge.approval.busy,
    null,
    locale,
  );
  const decisionView = judgeToggleView(
    JUDGE_GROUP_DECISION,
    judge.decision.available,
    judge.decision.enabled,
    judge.decision.busy,
    { singleDisabled },
    locale,
  );
  const warningLines = judgeWarningLines(warning.groups, locale);

  attachmentsRef.current = attachments;

  const draftFor = (key: string): Draft => {
    let draft = draftsRef.current.get(key);
    if (!draft) {
      draft = { text: "", attachments: [] };
      draftsRef.current.set(key, draft);
    }
    return draft;
  };

  const grow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(160, Math.max(28, el.scrollHeight))}px`;
  };

  // 切换项目：内存草稿/附件全部清除（不新增持久化；旧项目内容不得带进新项目）。
  useEffect(() => {
    if (projectRef.current === projectRoot) return;
    projectRef.current = projectRoot;
    draftsRef.current.clear();
    currentKeyRef.current = "";
    attachmentsRef.current = [];
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.value = "";
    setStatus("");
  }, [projectRoot]);

  // 角色/引擎切换：保存上一视图（runtime×role）的原文与附件，恢复目标视图的草稿。
  useEffect(() => {
    const nextKey = selectedRoleId ? draftKey(runtime, selectedRoleId) : "";
    const previous = currentKeyRef.current;
    if (previous === nextKey) return;
    const el = textareaRef.current;
    if (previous) {
      const draft = draftFor(previous);
      draft.text = el?.value || "";
      draft.attachments = attachmentsRef.current;
    }
    const draft = nextKey ? draftFor(nextKey) : { text: "", attachments: [] };
    if (el) el.value = draft.text;
    setAttachments(draft.attachments);
    attachmentsRef.current = draft.attachments;
    currentKeyRef.current = nextKey;
    setStatus("");
    grow();
    // textarea 高度按新内容重算
    requestAnimationFrame(grow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId, runtime]);

  const syncDraft = (key: string) => {
    if (!key) return;
    const draft = draftFor(key);
    draft.text = textareaRef.current?.value || "";
    draft.attachments = attachmentsRef.current;
  };

  const applyAttachments = (next: Attachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
    if (currentKeyRef.current) draftFor(currentKeyRef.current).attachments = next;
  };

  const addAttachmentForRole = (targetKey: string, attachment: Attachment) => {
    if (targetKey && targetKey === currentKeyRef.current) {
      applyAttachments([...attachmentsRef.current, attachment]);
      return;
    }
    if (!targetKey) return;
    const draft = draftFor(targetKey);
    draft.attachments = [...draft.attachments, attachment];
  };

  const send = async () => {
    const el = textareaRef.current;
    const text = (el?.value || "").trim();
    const roleId = selectedRoleId;
    if (!el || !roleId) return;
    if (!text) {
      // 图片随消息发送，不单独发图（队列条目正文形状钉死非空正文）。
      setStatus(t("ui.composer.emptyMessageHint"));
      setHint(t("ui.composer.emptyMessageHint"));
      return;
    }
    if (!projectRoot) {
      setStatus(t("ui.sidebar.noProjectPeriod"));
      return;
    }
    if (!bridge?.sendSession) {
      setStatus(t("ui.composer.sendChannelUnavailable"));
      return;
    }
    if (sessionOpenRoleId !== roleId) {
      // 防御路径：正常流程点角色即已开会话；若未开，先补开再发。
      await useChatStore.getState().selectRole(roleId);
      if (
        useUiStore.getState().selectedRoleId !== roleId ||
        useChatStore.getState().sessionOpenRoleId !== roleId
      ) {
        return; // 补开失败/用户已切换：保留输入和附件，不追加假气泡
      }
    }
    const rawDraft = el.value;
    const sent = attachmentsRef.current.slice();
    const images = sent.map((attachment) => ({
      type: "image",
      data: attachment.dataBase64,
      mimeType: attachment.mime,
    }));
    const target = { projectRoot, roleId, runtime };
    const sendKey = draftKey(runtime, roleId);
    const clientMessageId = uuid();
    const displayText = images.length > 0
      ? t("ui.composer.imageCount", { count: images.length }) + text
      : text;
    // 提交后即腾出输入框；未接受拒发时恢复原文与附件。
    syncDraft(sendKey);
    el.value = "";
    draftFor(sendKey).text = "";
    applyAttachments([]);
    grow();
    setStatus("");
    setHint("");
    appendLocalUser(roleId, displayText, clientMessageId);
    let res: Record<string, unknown> = {};
    try {
      res = resultRecord(
        await bridge.sendSession(text, images, target, { clientMessageId }),
      );
    } catch (error) {
      res = { ok: false, transportException: true, error: String(error) };
      reportRendererDiagnostic("renderer.event-error", {
        errorType: "send",
        errorMessage: String(error),
      });
    }
    if (res.ok === false) {
      const reason =
        typeof res.error === "string" && res.error !== ""
          ? res.error
          : t("ui.composer.sendFailed");
      const accepted = res.inputAccepted === true;
      const outcome = typeof res.outcome === "string" ? res.outcome : "";
      if (!accepted) {
        // 未接受：恢复草稿（仅在本会话仍是同一角色/引擎、且用户没有输入新内容时）。
        const stillHere =
          useUiStore.getState().selectedRoleId === roleId &&
          useUiStore.getState().runtime === runtime &&
          useChatStore.getState().projectRoot === projectRoot;
        if (stillHere && el.value === "") {
          el.value = rawDraft;
          draftFor(sendKey).text = rawDraft;
          applyAttachments(sent);
          grow();
        } else if (!stillHere) {
          // 迟到的旧引擎拒发：只把原文/附件放回该引擎视图的草稿（不触碰当前视图）。
          const draft = draftFor(sendKey);
          if (draft.text === "") {
            draft.text = rawDraft;
            draft.attachments = sent;
          }
        }
        if (stillHere) {
          setRoleError(roleId, true);
          // 主进程明确报告会话仍当前（sessionCurrent:true）时保留句柄；缺省/显式 false 才失效。
          if (res.sessionCurrent !== true) {
            useChatStore.getState().invalidateSession(roleId);
          }
          appendSystemRow(
            roleId,
            "sys-call",
            (res.transportException
              ? t("ui.composer.sendExceptionPrefix")
              : t("ui.composer.sendFailedPrefix")) + reason,
          );
          setStatus(t("ui.composer.sendFailedPrefix") + reason);
          setHint(t("ui.composer.sendFailedPrefix") + reason);
        }
        return;
      }
      // 已接受：轮次事实由 settled 报告；这里只按返回快照如实更新错误标记/提示。
      releaseAttachments(sent);
      const sameView =
        useUiStore.getState().selectedRoleId === roleId &&
        useUiStore.getState().runtime === runtime &&
        useChatStore.getState().projectRoot === projectRoot;
      if (outcome === "completed" || outcome === "aborted") {
        if (sameView) setRoleError(roleId, false);
        setHint("");
        return;
      }
      if (outcome === "failed" || outcome === "timed_out") {
        if (sameView) setRoleError(roleId, true);
        return;
      }
      if (typeof res.turnId === "string" && res.turnId) {
        setHint(t("ui.composer.sendNotReturned"), {
          kind: "send",
          roleId,
          runtime,
          projectRoot,
          clientMessageId,
          turnId: res.turnId,
        });
        return;
      }
      if (sameView) setRoleError(roleId, true);
      return;
    }
    releaseAttachments(sent);
    if (res.queued === true) {
      if (useChatStore.getState().hasClientAck(clientMessageId)) {
        // 迟到入队回包：真实事件已 ACK 该条输入——不复活「已入队」提示/队列行。
        setStatus("");
        setHint("");
        return;
      }
      const position = Number(res.position) || 1;
      const queuedMsg = t("ui.composer.queuedPosition", { position });
      appendSystemRow(roleId, "sys-queue", queuedMsg);
      setHint(queuedMsg, {
        kind: "queue",
        roleId,
        runtime,
        projectRoot,
        clientMessageId,
      });
      return;
    }
    setStatus("");
    setHint("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const native = event.nativeEvent;
    if (composingRef.current || native.isComposing || native.keyCode === 229) {
      return;
    }
    event.preventDefault();
    if (!(textareaRef.current?.value || "").trim()) return;
    void send();
  };

  const halt = async () => {
    const roleId = selectedRoleId;
    if (!roleId || halting) return;
    const target = { projectRoot, roleId, runtime };
    setHalting(true);
    let res: Record<string, unknown> = {};
    try {
      if (!bridge?.abortSession) {
        appendSystemRow(roleId, "sys-call", t("shared.common.stopUnsupportedPeriod"));
        setHalting(false);
        return;
      }
      res = resultRecord(await bridge.abortSession(target));
    } catch (error) {
      appendSystemRow(roleId, "sys-call", t("ui.composer.stopFailedPrefix") + String(error));
      setHalting(false);
      return;
    }
    if (res.ok === true) {
      appendSystemRow(
        roleId,
        "sys-call",
        t("ui.composer.stopRequested"),
      );
    } else if (res.supported !== true) {
      appendSystemRow(roleId, "sys-call", t("shared.common.stopUnsupportedPeriod"));
    } else {
      appendSystemRow(
        roleId,
        "sys-call",
        t("ui.composer.stopFailedPrefix") +
          (typeof res.error === "string" && res.error
            ? res.error
            : t("shared.common.unknownReason")),
      );
    }
    setHalting(false);
  };

  const makeAttachment = (
    image: Record<string, unknown>,
    dataBase64: string,
    previewUrl: string,
    revoke: boolean,
  ): Attachment | null => {
    if (!dataBase64) return null;
    return {
      id: "att-" + ++attachSeq,
      key: "att-" + attachSeq,
      name: typeof image.name === "string" ? image.name : t("ui.composer.imageFallbackName"),
      mime: typeof image.mime === "string" ? image.mime : "image/png",
      size: typeof image.size === "number" ? image.size : 0,
      dataBase64,
      previewUrl,
      revoke,
    };
  };

  const pickImage = async () => {
    const requestRole = selectedRoleId;
    const requestKey = requestRole ? draftKey(runtime, requestRole) : "";
    if (!bridge?.pickImage) {
      setStatus(t("ui.composer.pickChannelUnavailable"));
      return;
    }
    try {
      const result = resultRecord(await bridge.pickImage());
      if (result.ok === true && result.image && typeof result.image === "object") {
        const image = result.image as Record<string, unknown>;
        const dataBase64 = typeof image.dataBase64 === "string" ? image.dataBase64 : "";
        if (!dataBase64) {
          setStatus(t("ui.composer.pickFailedNoData"));
          return;
        }
        const mime = typeof image.mime === "string" ? image.mime : "image/png";
        const attachment = makeAttachment(
          image,
          dataBase64,
          "data:" + mime + ";base64," + dataBase64,
          false,
        );
        if (attachment && requestKey) addAttachmentForRole(requestKey, attachment);
        if (requestKey && requestKey === currentKeyRef.current) setStatus("");
      } else if (result.cancelled === true) {
        setStatus("");
      } else {
        setStatus(
          t("ui.composer.pickFailedPrefix") +
            (typeof result.error === "string"
              ? result.error
              : t("shared.common.unknownReason")),
        );
      }
    } catch (error) {
      setStatus(t("ui.composer.pickFailedPrefix") + String(error));
    }
  };

  const attachBrowserFile = async (file: File) => {
    const requestRole = selectedRoleId;
    const requestKey = requestRole ? draftKey(runtime, requestRole) : "";
    const problem = clientImageProblem(file as ImageFileLike, locale);
    if (problem) {
      setStatus(problem);
      setHint(problem);
      return;
    }
    let dataBase64 = "";
    try {
      dataBase64 = await readFileBase64(file, t("ui.composer.readFileFailed"));
    } catch (error) {
      setStatus(t("ui.composer.readImageFailedPrefix") + String(error));
      return;
    }
    if (!bridge?.attachImage) {
      setStatus(t("ui.composer.attachValidationUnavailable"));
      return;
    }
    let result: Record<string, unknown> = {};
    try {
      result = resultRecord(
        await bridge.attachImage({
          name: file.name || t("ui.composer.pastedImage"),
          mime: file.type || "",
          dataBase64,
        }),
      );
    } catch (error) {
      setStatus(t("ui.composer.imageValidationFailedPrefix") + String(error));
      return;
    }
    if (result.ok !== true || !result.image || typeof result.image !== "object") {
      setStatus(
        typeof result.error === "string" && result.error
          ? result.error
          : t("ui.composer.imageValidationFailed"),
      );
      return;
    }
    const image = result.image as Record<string, unknown>;
    // 生产 CSP 为 `img-src 'self' data:`：缩略图一律用 data URL（不使用 blob:，避免 CSP 违规）。
    const mime = typeof image.mime === "string" ? image.mime : "image/png";
    const previewUrl = "data:" + mime + ";base64," + dataBase64;
    const attachment = makeAttachment(image, dataBase64, previewUrl, false);
    if (attachment && requestKey) addAttachmentForRole(requestKey, attachment);
    if (requestKey && requestKey === currentKeyRef.current) {
      setStatus("");
      setHint("");
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const data = event.clipboardData;
    if (!data || !data.items) return;
    const files: File[] = [];
    for (let index = 0; index < data.items.length; index += 1) {
      const item = data.items[index];
      if (item.kind === "file" && item.type && item.type.indexOf("image/") === 0) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return; // 无图：走默认粘贴（文字）
    event.preventDefault();
    files.forEach((file) => void attachBrowserFile(file));
  };

  const onDropFiles = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove("is-dropping");
    const files = event.dataTransfer?.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (String(file.type || "").indexOf("image/") === 0) {
        void attachBrowserFile(file);
      } else {
        setStatus(t("ui.composer.imageOnly"));
      }
    });
  };

  const removeAttachment = (key: string) => {
    const target = attachmentsRef.current.find((item) => item.key === key);
    if (target) releaseAttachments([target]);
    applyAttachments(attachmentsRef.current.filter((item) => item.key !== key));
  };

  const onJudgeToggle = (group: JudgeGroup) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      void setJudgeEnabled(group, event.target.checked === true);
    };
  };

  const approvalStatus = judge.approval.error || approvalView.note || "";
  const decisionStatus = judge.decision.error || decisionView.note || "";
  const approvalStatusIsNote =
    !judge.approval.error && approvalView.note !== "";
  const decisionStatusIsNote = !judge.decision.error && decisionView.note !== "";

  return (
    <div className="composer">
      <div
        id="attach-row"
        className="attach-row"
        hidden={attachments.length === 0}
      >
        {attachments.map((attachment) => (
          <span
            className="attach-chip"
            key={attachment.id}
            data-key={attachment.key}
            title={attachmentTitle(attachment.name, attachment.size)}
          >
            <img alt="" src={attachment.previewUrl} />
            <button
              className="attach-rm"
              type="button"
              data-key={attachment.key}
              title={t("ui.composer.removeImage")}
              aria-label={t("ui.composer.removeImage")}
              onClick={() => removeAttachment(attachment.key)}
            >
              <X size={12} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      <div
        id="composer-capsule"
        className="capsule"
        onDragEnter={(event) => {
          event.preventDefault();
          event.currentTarget.classList.add("is-dropping");
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.currentTarget.classList.add("is-dropping");
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.currentTarget.classList.remove("is-dropping");
        }}
        onDrop={onDropFiles}
      >
        <Textarea
          id="inp-message"
          ref={textareaRef}
          rows={1}
          defaultValue=""
          placeholder={
            role
              ? t("ui.composer.placeholderToRole", { role: selectedRoleName })
              : t("ui.composer.placeholderSelectRole")
          }
          aria-label={t("ui.composer.ariaMessage")}
          spellCheck={false}
          className="min-h-7 max-h-40 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-[22px] shadow-none focus-visible:border-0 focus-visible:outline-none dark:bg-transparent"
          onInput={grow}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />

        <div className="composer-bottom">
          <div className="composer-trust-line">
            <span className="composer-trust-title">
              {t("ui.composer.trustGroupTitle")}
            </span>
            <span
              id="judge-switch-hint"
              className="composer-trust-hint"
              title={t("ui.decisionDialog.switchHint")}
            >
              {t("ui.decisionDialog.switchHint")}
            </span>
          </div>
          <div className="composer-controls">
          <button
            id="btn-attach-image"
            className="cap-icon"
            type="button"
            title={
              bridge?.pickImage
                ? t("ui.composer.addImage")
                : t("ui.composer.addImageUnavailable")
            }
            aria-label={t("ui.composer.ariaAddImage")}
            disabled={!bridge?.pickImage || !sessionOpen}
            onClick={() => void pickImage()}
          >
            <ImagePlus size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <div
            className="composer-trust"
            role="group"
            aria-label={t("ui.composer.trustGroupTitle")}
          >
            <label
              className={
                "composer-auto-approve" +
                (approvalView.enabled ? " is-on" : "") +
                (!approvalView.available ? " is-unsupported" : "")
              }
              data-trust="approval"
              title={approvalView.title}
            >
              <ShieldCheck
                className="trust-icon"
                size={13}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <input
                type="checkbox"
                id="auto-approve-toggle"
                checked={approvalView.checked}
                disabled={approvalView.disabled}
                aria-label={t("ui.judge.shellOff")}
                onChange={onJudgeToggle(JUDGE_GROUP_APPROVAL)}
              />
              <span id="auto-approve-label">{approvalView.label}</span>
            </label>
            <span
              id="auto-approve-status"
              className={
                "composer-judge-status" + (approvalStatusIsNote ? " is-note" : "")
              }
              role="status"
              aria-live="polite"
              hidden={approvalStatus === ""}
            >
              {approvalStatus}
            </span>

            <label
              className={
                "composer-auto-approve" +
                (decisionView.enabled ? " is-on" : "") +
                (!decisionView.available || decisionView.singleDisabled
                  ? " is-unsupported"
                  : "")
              }
              data-trust="decision"
              title={decisionView.title}
            >
              <Scale
                className="trust-icon"
                size={13}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <input
                type="checkbox"
                id="judge-decision-toggle"
                checked={decisionView.checked}
                disabled={decisionView.disabled}
                aria-label={t("ui.judge.decisionOff")}
                onChange={onJudgeToggle(JUDGE_GROUP_DECISION)}
              />
              <span id="judge-decision-label">{decisionView.label}</span>
            </label>
            <span
              id="judge-decision-status"
              className={
                "composer-judge-status" + (decisionStatusIsNote ? " is-note" : "")
              }
              role="status"
              aria-live="polite"
              hidden={decisionStatus === ""}
            >
              {decisionStatus}
            </span>
          </div>

          <span id="composer-scope" className="composer-scope">
            {roleName} / {runtimeLabel}
          </span>
          <span className="composer-keyboard">
            {t("ui.composer.enterHint")}
          </span>

          <div className="composer-actions">
            <Button
              id="btn-halt"
              variant="destructive"
              size="sm"
              className="danger-ghost"
              type="button"
              hidden={!busy}
              disabled={halting}
              title={t("ui.composer.stopTitle")}
              aria-label={t("ui.composer.stopTitle")}
              onClick={() => void halt()}
            >
              <Square size={12} strokeWidth={1.5} aria-hidden="true" />
              {t("shared.common.stopTurn")}
            </Button>
            <Button
              id="btn-send"
              size="sm"
              type="button"
              disabled={!canSend}
              className={
                canSend
                  ? undefined
                  : "disabled:bg-secondary disabled:text-text-2 disabled:opacity-100"
              }
              title={
                canSend
                  ? t("ui.composer.sendWithEnter")
                  : t("ui.composer.sessionNotOpen")
              }
              aria-label={t("ui.composer.ariaSend")}
              aria-describedby="composer-demo-status"
              onClick={() => void send()}
            >
              {t("ui.composer.send")}
              <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
          </div>
        </div>
      </div>

      <div
        id="shell-judge-warning"
        className="judge-warning"
        role="status"
        aria-live="polite"
        hidden={!warning.visible}
      >
        <div id="shell-judge-warning-text" className="judge-warning-text">
          {warningLines.map((line, index) => (
            <p key={index} className={line.strong ? "jw-strong" : undefined}>
              {line.text}
            </p>
          ))}
        </div>
        <button
          id="shell-judge-warning-close"
          className="judge-warning-close"
          type="button"
          title={t("ui.composer.dismissHint")}
          aria-label={t("ui.judge.warningClose")}
          onClick={acknowledgeWarning}
        >
          {t("ui.judge.warningClose")}
        </button>
      </div>

      <div className="compose-note">
        <span id="composer-demo-status" role="status" aria-live="polite">
          {status ||
            (canSend
              ? t("ui.composer.footerWorking")
              : t("ui.composer.footerIdle"))}
        </span>
        <span id="runtime-note" className="runtime-note">
          {t("ui.composer.writeBoundaryNote")}
        </span>
      </div>
    </div>
  );
}
