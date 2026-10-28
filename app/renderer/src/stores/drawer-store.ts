/**
 * 右抽屉视图状态（Phase 4A）：tab（card/work/pi/document/null）、
 * 每角色×引擎×项目的阅读状态（节开合/内层滚动/外层滚动/全文展开/队列上限）、
 * 文档只读子视图与版本守卫、撤回就地回执、触发元素与焦点返回。
 *
 * 不判边界、不造第二套数据；抽屉打开/关闭仍以 ui-store.drawerOpen 为准。
 */

import { create } from "zustand";
import { flushSync } from "react-dom";
import { getDesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import { useUiStore, type RuntimeId } from "@/stores/ui-store";
import {
  documentReadRequest,
  documentReadableRef,
  documentStatusText,
  documentErrorText,
  roleDocumentRefs,
  validateDocumentReadResult,
  type DocumentReadResult,
  type DocumentRef,
  type DocumentScope,
} from "@/chat/document-view";
import { matchDocumentRefByPath } from "@/chat/profile-docs";
import { useSettingsStore } from "@/stores/settings-store";
import { useLocaleStore, translate, type Locale } from "@/i18n";

/** 当前界面语言（i18n B1）：抽屉内生成的提示按当前 locale 渲染。 */
function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

export type DrawerTab = "card" | "work" | "pi" | "document" | "decisions" | "tasks" | null;

export interface ReadingState {
  sections: Record<string, boolean>;
  sectionScroll: Record<string, { top: number; left: number }>;
  scrollTop: number;
  full: Record<string, boolean>;
}

export interface WithdrawFeedback {
  /** id → 就地回执（成功清空；失败/异常保留）。 */
  text: Record<string, string>;
}

export type DocumentMode = "list" | "loading" | "content" | "error";

export interface DocumentViewState {
  roleId: string;
  origin: "card" | "work" | "report";
  mode: DocumentMode;
  refs: DocumentRef[];
  scope: DocumentScope | null;
  unavailable: string | null;
  loadingRefs: boolean;
  listError: string;
  selectedId: string | null;
  ref: DocumentRef | null;
  result: DocumentReadResult | null;
  statusText: string;
  errorCode: string;
  errorText: string;
  listScroll: number;
  /** 根文档点击目标（项目相对）；刷新后精确匹配 opaque ref，并用于返回焦点。 */
  targetRelativePath: string | null;
}

interface DrawerState {
  tab: DrawerTab;
  /** 队列子视图（同一 424 抽屉；不新增 rightTab 值）：来源决定返回文案。 */
  queueView: { origin: "work" | "card" } | null;
  reading: Record<string, ReadingState>;
  full: Record<string, Record<string, boolean>>;
  withdraw: Record<string, WithdrawFeedback>;
  withdrawPending: Record<string, boolean>;
  document: DocumentViewState | null;
  /** 抽屉每次打开/关闭/切换的幂等序号（动画与焦点用）。 */
  nonce: number;
  openTab: (tab: Exclude<DrawerTab, null>) => void;
  openQueue: (origin: "work" | "card", invoker?: HTMLElement | null) => void;
  backFromQueue: () => void;
  close: (options?: { restoreFocus?: boolean }) => void;
  toggleTab: (tab: Exclude<DrawerTab, null>) => void;
  setSectionOpen: (roleKey: string, section: string, open: boolean) => void;
  setSectionScroll: (roleKey: string, section: string, top: number, left: number) => void;
  setScrollTop: (roleKey: string, top: number) => void;
  toggleFull: (roleKey: string, id: string, open: boolean) => void;
  setDocumentScroll: (top: number) => void;
  openDocumentList: (
    roleId: string,
    origin: "card" | "work" | "report",
    targetRelativePath?: string,
  ) => Promise<void>;
  refreshDocumentList: () => Promise<void>;
  readDocument: (ref: DocumentRef) => Promise<void>;
  backToList: () => void;
  backToRole: () => void;
  invalidateDocumentRead: (options?: { closeTab?: boolean }) => void;
  withdrawQueued: (roleId: string, id: string) => Promise<void>;
  resetProject: () => void;
}

/** 阅读状态键：项目×引擎×角色（切换角色/引擎/项目不串读）。 */
export function readingKey(
  projectRoot: string | null,
  runtime: string,
  roleId: string,
): string {
  return JSON.stringify([projectRoot || "", runtime || "pi", roleId || ""]);
}

/** 当前视图的阅读键（组件与 store 共用单一判据）。 */
export function currentReadingKey(roleId: string | null): string {
  return readingKey(
    useChatStore.getState().projectRoot,
    useUiStore.getState().runtime,
    roleId || "",
  );
}

function emptyReading(): ReadingState {
  return { sections: {}, sectionScroll: {}, scrollTop: 0, full: {} };
}

function readingOf(state: DrawerState, key: string): ReadingState {
  return state.reading[key] || emptyReading();
}

let documentReadVersion = 0;
let drawerInvoker: HTMLElement | null = null;
let pendingFocusSelector: string | null = null;

/** 抽屉内容切换后要聚焦的选择器（返回角色资料等跨视图焦点）。 */
export function queueDrawerFocus(selector: string): void {
  pendingFocusSelector = selector;
}

export function consumeDrawerFocus(): string | null {
  const selector = pendingFocusSelector;
  pendingFocusSelector = null;
  return selector;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function setDrawerInvoker(element: HTMLElement | null): void {
  drawerInvoker = element;
}

export function getDrawerInvoker(): HTMLElement | null {
  return drawerInvoker;
}

function validInvoker(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected || (element as HTMLButtonElement).disabled) {
    return false;
  }
  if (typeof element.getClientRects !== "function" || element.getClientRects().length === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

/** 关闭后焦点返回：优先原触发元素，否则回退到给定元素。 */
export function restoreDrawerFocus(fallbackId: string): void {
  // 抽屉关闭的同一 tick 里背景仍带 inert；先解除（Drawer 的 effect 随后同向清理），
  // 否则对背景元素的 focus() 会被浏览器拒绝、焦点落回 body。
  document.querySelector(".col-left")?.removeAttribute("inert");
  document.querySelector(".col-mid")?.removeAttribute("inert");
  if (validInvoker(drawerInvoker)) {
    drawerInvoker.focus({ preventScroll: true });
    return;
  }
  const fallback = document.getElementById(fallbackId);
  if (fallback && validInvoker(fallback as HTMLElement)) {
    (fallback as HTMLElement).focus({ preventScroll: true });
  }
}

export function fallbackTabId(tab: DrawerTab): string {
  if (tab === "pi") return "tab-pi";
  if (tab === "work") return "tab-work";
  return "tab-card";
}

/** 仅测试驱动/上层打开抽屉时配合 ui-store 使用。 */
export function openDrawerTab(tab: Exclude<DrawerTab, null>, invoker?: HTMLElement | null): void {
  if (invoker) setDrawerInvoker(invoker);
  useDrawerStore.setState((state) => ({
    tab,
    queueView: null,
    nonce: state.nonce + 1,
  }));
  useUiStore.getState().setDrawerOpen(true);
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
  tab: null,
  queueView: null,
  reading: {},
  full: {},
  withdraw: {},
  withdrawPending: {},
  document: null,
  nonce: 0,

  openTab: (tab) => {
    const current = useUiStore.getState().drawerOpen ? get().tab || "card" : null;
    if (current === tab && !get().queueView) {
      set((state) => ({ tab: null, queueView: null, nonce: state.nonce + 1 }));
      useUiStore.getState().setDrawerOpen(false);
      return;
    }
    // 抽屉打开需在调用返回前完成 DOM 提交：调用方（焦点/滚动定位）会在同一 tick 操作
    // 刚打开的面板；否则 display:none 期间的 scrollTop 赋值会被浏览器丢弃。
    flushSync(() => {
      useDrawerStore.setState((state) => ({
        tab,
        queueView: null,
        nonce: state.nonce + 1,
      }));
      useUiStore.getState().setDrawerOpen(true);
    });
  },

  openQueue: (origin, invoker) => {
    if (invoker) setDrawerInvoker(invoker);
    useDrawerStore.setState((state) => ({
      tab: origin,
      queueView: { origin },
      nonce: state.nonce + 1,
    }));
    useUiStore.getState().setDrawerOpen(true);
  },

  backFromQueue: () => {
    if (!get().queueView) return;
    queueDrawerFocus(".queue-view-all");
    set((state) => ({ queueView: null, nonce: state.nonce + 1 }));
  },

  close: (options) => {
    const prior = get().tab;
    get().invalidateDocumentRead();
    set((state) => ({ tab: null, queueView: null, nonce: state.nonce + 1 }));
    useUiStore.getState().setDrawerOpen(false);
    if (options?.restoreFocus !== false) restoreDrawerFocus(fallbackTabId(prior));
  },

  toggleTab: (tab) => get().openTab(tab),

  setSectionOpen: (roleKey, section, open) => {
    set((state) => {
      const current = readingOf(state, roleKey);
      return {
        reading: {
          ...state.reading,
          [roleKey]: {
            ...current,
            sections: { ...current.sections, [section]: open === true },
          },
        },
      };
    });
  },

  setSectionScroll: (roleKey, section, top, left) => {
    set((state) => {
      const current = readingOf(state, roleKey);
      return {
        reading: {
          ...state.reading,
          [roleKey]: {
            ...current,
            sectionScroll: {
              ...current.sectionScroll,
              [section]: { top, left },
            },
          },
        },
      };
    });
  },

  setScrollTop: (roleKey, top) => {
    set((state) => {
      const current = readingOf(state, roleKey);
      return {
        reading: {
          ...state.reading,
          [roleKey]: { ...current, scrollTop: top },
        },
      };
    });
  },

  toggleFull: (roleKey, id, open) => {
    set((state) => {
      const current = readingOf(state, roleKey);
      return {
        reading: {
          ...state.reading,
          [roleKey]: {
            ...current,
            full: { ...current.full, [id]: open === true },
          },
        },
      };
    });
    set((state) => ({
      full: {
        ...state.full,
        [roleKey]: { ...(state.full[roleKey] || {}), [id]: open === true },
      },
    }));
  },

  setDocumentScroll: (top) => {
    const document = get().document;
    if (!document) return;
    set({ document: { ...document, listScroll: top } });
  },

  openDocumentList: async (roleId, origin, targetRelativePath) => {
    const projectRoot = useChatStore.getState().projectRoot;
    const runtime = useUiStore.getState().runtime;
    documentReadVersion += 1;
    // 同步使用当前 listing 已给的 opaque 文档引用（旧 renderer `role.documents` 同源），
    // 清单刷新在后台进行；这样「查看已列文档」点开即有条目，不依赖异步回包。
    const currentRole = useChatStore
      .getState()
      .roles.find((role) => role.roleId === roleId);
    const initialRefs = roleDocumentRefs(currentRole);
    const provisionalScope: DocumentScope | null =
      initialRefs.length > 0 && projectRoot
        ? {
            version: 1,
            projectViewId: initialRefs[0].projectViewId,
            projectRoot,
          }
        : null;
    const view: DocumentViewState = {
      roleId,
      origin,
      mode: "list",
      refs: initialRefs,
      scope: provisionalScope,
      unavailable: null,
      loadingRefs: true,
      listError: "",
      selectedId: null,
      ref: null,
      result: null,
      statusText: "",
      errorCode: "",
      errorText: "",
      listScroll: 0,
      targetRelativePath: targetRelativePath || null,
    };
    useDrawerStore.setState((state) => ({
      tab: "document",
      queueView: null,
      document: view,
      nonce: state.nonce + 1,
    }));
    useUiStore.getState().setDrawerOpen(true);
    if (!projectRoot) {
      useDrawerStore.setState({
        document: {
          ...view,
          loadingRefs: false,
          listError: translate(currentLocale(), "ui.sidebar.noProjectPeriod"),
        },
      });
      return;
    }
    const version = documentReadVersion;
    try {
      const bridge = getDesktopBridge();
      const raw = bridge?.listProject ? await bridge.listProject(projectRoot) : null;
      if (version !== documentReadVersion) return;
      const listing = asRecord(raw);
      if (!raw || asString(listing.projectRoot) !== projectRoot) {
        throw new Error("listing mismatch");
      }
      const scopeRecord = asRecord(listing.documentScope);
      const scope: DocumentScope | null =
        asString(scopeRecord.projectViewId) !== ""
          ? {
              version: typeof scopeRecord.version === "number" ? scopeRecord.version : 1,
              projectViewId: asString(scopeRecord.projectViewId),
              projectRoot: asString(scopeRecord.projectRoot) || projectRoot,
            }
          : null;
      const roles = Array.isArray(listing.roles) ? listing.roles : [];
      const role = roles.find((item) => asString(asRecord(item).roleId) === roleId);
      const refs = role ? roleDocumentRefs(role) : [];
      const current = get().document;
      if (!current || version !== documentReadVersion) return;
      const target = current.targetRelativePath;
      useDrawerStore.setState({
        document: {
          ...current,
          refs,
          scope,
          unavailable: asString(listing.documentReadUnavailable) || null,
          loadingRefs: false,
          listError: role
            ? ""
            : translate(currentLocale(), "ui.drawerStore.noSourceRole"),
        },
      });
      // 根文档点击：刷新后用 `relativePath` 精确匹配 opaque 引用；命中且 scope
      // 可读才走既有阅读态。未命中/无 scope/平台不支持停留列表态，由
      // DocumentView 展示既有结构化错误；不构造路径、不生成 documentId、不重试。
      if (target) {
        const latest = get().document;
        const matched = latest ? matchDocumentRefByPath(latest.refs, target) : null;
        if (matched && latest?.scope && documentReadableRef(matched, latest.scope)) {
          await get().readDocument(matched);
        }
      }
    } catch {
      if (version !== documentReadVersion) return;
      const current = get().document;
      if (!current) return;
      useDrawerStore.setState({
        document: {
          ...current,
          loadingRefs: false,
          listError: translate(currentLocale(), "ui.drawerStore.refreshFailed"),
        },
      });
    }
  },

  refreshDocumentList: async () => {
    const document = get().document;
    if (!document) return;
    await get().openDocumentList(document.roleId, document.origin);
  },

  readDocument: async (ref) => {
    const document = get().document;
    if (!document || !document.scope) return;
    if (document.mode === "list") get().setDocumentScroll(window.scrollY || 0);
    const projectRoot = useChatStore.getState().projectRoot;
    const runtime = useUiStore.getState().runtime;
    const request = documentReadRequest(ref, document.scope);
    if (!request) return;
    const version = (documentReadVersion += 1);
    const epoch = document.scope.projectViewId;
    useDrawerStore.setState({
      document: {
        ...document,
        ref,
        selectedId: ref.documentId,
        mode: "loading",
        statusText: "",
        errorCode: "",
        errorText: "",
      },
    });
    const stillCurrent = () => {
      const current = get().document;
      return (
        version === documentReadVersion &&
        !!current &&
        current.mode !== "list" &&
        useDrawerStore.getState().tab === "document" &&
        useChatStore.getState().projectRoot === projectRoot &&
        useUiStore.getState().runtime === runtime &&
        current.roleId === ref.roleId
      );
    };
    try {
      const bridge = getDesktopBridge();
      const raw = bridge?.readProjectDocument
        ? await bridge.readProjectDocument(request)
        : { ok: false, code: "UNSUPPORTED_ENVIRONMENT" };
      if (!stillCurrent()) return;
      const currentDocument = get().document;
      if (!currentDocument || !currentDocument.scope || currentDocument.scope.projectViewId !== epoch) {
        return;
      }
      const validation = validateDocumentReadResult(
        raw,
        request,
        ref,
        currentDocument.scope,
      );
      if (validation.ok) {
        useDrawerStore.setState({
          document: {
            ...currentDocument,
            mode: "content",
            result: validation.result,
            statusText: documentStatusText(validation.result, currentLocale()),
          },
        });
      } else {
        useDrawerStore.setState({
          document: {
            ...currentDocument,
            mode: "error",
            result: null,
            errorCode: validation.code,
            errorText: documentErrorText(validation.code, currentLocale()),
          },
        });
      }
    } catch {
      if (!stillCurrent()) return;
      const currentDocument = get().document;
      if (!currentDocument) return;
      useDrawerStore.setState({
        document: {
          ...currentDocument,
          mode: "error",
          result: null,
          errorCode: "IO_ERROR",
          errorText: documentErrorText("IO_ERROR", currentLocale()),
        },
      });
    }
  },

  backToList: () => {
    documentReadVersion += 1;
    const current = get().document;
    if (!current) return;
    const selectedId = current.selectedId;
    useDrawerStore.setState({
      document: { ...current, mode: "list", ref: null, result: null, errorCode: "", errorText: "" },
    });
    // 返回列表：焦点回原阅读按钮（flushSync 提交后微任务即聚焦，早于 rAF 兜底）。
    if (selectedId) {
      queueMicrotask(() => {
        const button = document.querySelector<HTMLElement>(
          '[data-doc-id="' + CSS.escape(selectedId) + '"]',
        );
        button?.focus({ preventScroll: true });
      });
    }
  },

  backToRole: () => {
    documentReadVersion += 1;
    const current = get().document;
    // 从根文档进入时焦点回触发按钮（data-root-doc-path 精确标记）；
    // 按钮已不在（角色/文档刷新）则选择器回退到既有“查看已列文档”入口。
    const target = current?.targetRelativePath;
    const selector = target
      ? '[data-root-doc-path="' + CSS.escape(target) + '"], .role-document-entry'
      : ".role-document-entry";
    queueDrawerFocus(selector);
    set((state) => ({
      tab: "card",
      queueView: null,
      document: current ? { ...current, mode: "list", ref: null } : null,
      nonce: state.nonce + 1,
    }));
    // flushSync 提交后微任务即聚焦（早于 rAF 兜底；不可见窗口 rAF 可能不触发）。
    queueMicrotask(() => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && element.getClientRects().length > 0) {
        element.focus({ preventScroll: true });
      }
    });
  },

  invalidateDocumentRead: (options) => {
    documentReadVersion += 1;
    const current = get().document;
    if (!current) return;
    if (options?.closeTab === false) {
      set({ document: null });
      return;
    }
    if (get().tab === "document") {
      set((state) => ({ tab: null, document: null, nonce: state.nonce + 1 }));
      useUiStore.getState().setDrawerOpen(false);
    } else {
      set({ document: null });
    }
  },

  withdrawQueued: async (roleId, id) => {
    const key = currentReadingKey(roleId);
    const pendingKey = key + "\u0000" + id;
    if (get().withdrawPending[pendingKey]) return;
    const projectRoot = useChatStore.getState().projectRoot;
    const runtime = useUiStore.getState().runtime;
    // 撤回中按钮必须禁用（真实进行态）；被浏览器移走的焦点在回执后归还同一动作。
    const active = document.activeElement as HTMLElement | null;
    const restoreFocus =
      !!active &&
      active.classList.contains("q-withdraw") &&
      active.getAttribute("data-id") === encodeURIComponent(id);
    set((state) => ({
      withdrawPending: { ...state.withdrawPending, [pendingKey]: true },
      withdraw: {
        ...state.withdraw,
        [key]: { text: { ...(state.withdraw[key]?.text || {}) } },
      },
    }));
    const writeFeedback = (text: string) => {
      set((state) => ({
        withdraw: {
          ...state.withdraw,
          [key]: { text: { ...(state.withdraw[key]?.text || {}), [id]: text } },
        },
      }));
    };
    // 旧 renderer 同义：撤回结果在该角色聊天流如实落一条 system 行（成功/失败都可追溯）。
    const appendSystem = (text: string) => {
      if (useChatStore.getState().projectRoot !== projectRoot) return;
      if (useUiStore.getState().runtime !== runtime) return;
      if (useUiStore.getState().selectedRoleId !== roleId) return;
      useChatStore.getState().appendSystemRow(roleId, "sys-call", text);
    };
    let res: Record<string, unknown> = {};
    try {
      const bridge = getDesktopBridge();
      res = bridge?.withdrawQueued
        ? asRecord(await bridge.withdrawQueued({ projectRoot, roleId, runtime }, id))
        : {
            ok: false,
            error: translate(currentLocale(), "ui.drawerStore.withdrawUnavailable"),
          };
      if (res.ok === true) {
        const okText = translate(currentLocale(), "ui.confirm.withdrawn", {
          summary: asString(res.summary) || "",
        });
        appendSystem(okText);
        set((state) => {
          const current = state.withdraw[key];
          const text = { ...(current?.text || {}) };
          delete text[id];
          return {
            withdraw: { ...state.withdraw, [key]: { text } },
            withdrawPending: { ...state.withdrawPending, [pendingKey]: false },
          };
        });
        return;
      }
      const failText = translate(currentLocale(), "ui.confirm.withdrawInvalid", {
        detail:
          asString(res.error) || translate(currentLocale(), "shared.common.unknownReason"),
      });
      writeFeedback(failText);
      appendSystem(failText);
    } catch (error) {
      const errorText = translate(currentLocale(), "ui.confirm.withdrawFailed", {
        detail: String(error),
      });
      writeFeedback(errorText);
      appendSystem(errorText);
    } finally {
      set((state) => ({
        withdrawPending: { ...state.withdrawPending, [pendingKey]: false },
      }));
      if (restoreFocus) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (useChatStore.getState().projectRoot !== projectRoot) return;
            if (useUiStore.getState().runtime !== runtime) return;
            if (useChatStore.getState().roleBusy === undefined) return;
            const button = document.querySelector<HTMLButtonElement>(
              '.q-withdraw[data-id="' +
                CSS.escape(encodeURIComponent(id)) +
                '"]',
            );
            if (
              button &&
              !button.disabled &&
              (document.activeElement === document.body ||
                document.activeElement === null)
            ) {
              button.focus({ preventScroll: true });
            }
          });
        });
      }
    }
  },

  resetProject: () => {
    documentReadVersion += 1;
    set((state) => ({
      tab: null,
      queueView: null,
      reading: {},
      full: {},
      withdraw: {},
      withdrawPending: {},
      document: null,
      nonce: state.nonce + 1,
      // 保留 document=null 的语义：切项目后迟到读取全部失效。
    }));
  },
}));

/** 当前引擎设置面板打开（左栏/缺配条入口共用）。 */
export function openSettingsDrawer(engine?: RuntimeId, invoker?: HTMLElement | null): void {
  const runtime = engine || useUiStore.getState().runtime;
  if (invoker) setDrawerInvoker(invoker);
  useSettingsStore.setState({ engine: runtime });
  // 顶层 tab 切换（设置）：清空队列子视图，显示设置基础视图。
  useDrawerStore.setState((state) => ({ tab: "pi", queueView: null, nonce: state.nonce + 1 }));
  useUiStore.getState().setDrawerOpen(true);
  void useSettingsStore.getState().load(runtime);
}

/** 数字角标（工作概览=待处理；角色资料=当前工作+排队）。 */
export function tabBadgeVisible(count: number): boolean {
  return count > 0;
}
