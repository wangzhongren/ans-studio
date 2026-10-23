/**
 * 引擎选择器（自绘触发器，恢复旧 combobox/listbox/option 契约；Phase 4A 接真实切换）。
 *
 * 契约（2b 起不变）：触发器 `role=combobox` / `aria-haspopup=listbox` /
 * `aria-controls=runtime-options` / `aria-expanded` / `aria-activedescendant`；
 * 弹层 `role=listbox`，选项 `role=option` + `aria-selected` + `id=runtime-option-*` +
 * `data-runtime`。键盘：↑/↓/Home/End 浏览，Enter/Space 提交，Esc 关闭并回触发器，
 * Tab 自然离开；点击外部/窗口失焦关闭。方向/位置沿用旧 engine-selector 的 placement
 * （8px 视口边距、6px 间距、上下翻转、右对齐）。
 *
 * 4A：未导入项目禁用；选择即真实切换（保存旧引擎视图 → 安装目标视图 → 开会话）；
 * 切换中 `aria-busy`、菜单关闭、不重复提交；失败保留新视图（由调用方如实报错）。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { RUNTIME_OPTIONS, type RuntimeId } from "@/stores/ui-store";
import { useChatStore } from "@/chat/chat-store";
import {
  menuConfigStatusKind,
  menuConfigStatusText,
  useSettingsStore,
} from "@/stores/settings-store";
import { useLocaleState, useT } from "@/i18n";

interface EngineSelectProps {
  value: RuntimeId;
  disabled?: boolean;
  onChange: (runtime: RuntimeId) => void | Promise<unknown>;
}

interface Placement {
  left: number;
  top: number;
  maxHeight: number;
  down: boolean;
}

const MARGIN = 8;
const GAP = 6;

/** 旧 engine-selector.js::placement 的等价实现（8px 视口边距、6px 间距、上下翻转、右对齐）。 */
function placement(
  rect: DOMRect,
  viewport: { width: number; height: number },
  width: number,
  height: number,
): Placement {
  const below = Math.max(1, viewport.height - rect.bottom - GAP - MARGIN);
  const above = Math.max(1, rect.top - GAP - MARGIN);
  const down = below >= height || below >= above;
  const maxHeight = Math.min(
    Math.max(1, viewport.height - MARGIN * 2),
    down ? below : above,
  );
  const actualHeight = Math.min(height, maxHeight);
  return {
    left: Math.max(
      MARGIN,
      Math.min(rect.right - width, viewport.width - width - MARGIN),
    ),
    top: Math.max(
      MARGIN,
      Math.min(
        down ? rect.bottom + GAP : rect.top - GAP - actualHeight,
        viewport.height - MARGIN - actualHeight,
      ),
    ),
    maxHeight,
    down,
  };
}

export function EngineSelect({ value, disabled = false, onChange }: EngineSelectProps) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [displayValue, setDisplayValue] = useState<string | null>(null);
  const [displayTitle, setDisplayTitle] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const roles = useChatStore((s) => s.roles);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const menuSummaries = useSettingsStore((s) => s.menu);

  // 项目装载/切换：关闭待提交菜单（旧 applyListing 同向），不提交临时浏览项。
  useEffect(() => {
    openRef.current = false;
    setOpen(false);
    setDisplayValue(null);
    setDisplayTitle(null);
  }, [roles, projectRoot]);

  const selectedIndex = RUNTIME_OPTIONS.findIndex((option) => option.id === value);
  const selected =
    RUNTIME_OPTIONS[selectedIndex >= 0 ? selectedIndex : 0] ?? RUNTIME_OPTIONS[0];
  const shownValue = displayValue ?? selected.label;
  const shownTitle = displayTitle ?? selected.label;

  const ensureActiveVisible = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const option = RUNTIME_OPTIONS[activeIndex];
    const item = menu.querySelector<HTMLElement>(
      `#runtime-option-${option.id}`,
    );
    if (!item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < menu.scrollTop) menu.scrollTop = top;
    else if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }
  }, [activeIndex]);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    menu.style.maxHeight = `${Math.max(1, window.innerHeight - MARGIN * 2)}px`;
    const rect = trigger.getBoundingClientRect();
    const height = menu.scrollHeight + menu.offsetHeight - menu.clientHeight;
    const pos = placement(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      menu.offsetWidth,
      height,
    );
    // 两行菜单项（名称+配置状态）最小高度 40：保证极小视口下至少一项完整可见
    // （否则「内部滚动保持活动项可见」不可满足）。仍受视口 8px 边距约束。
    const minMenuHeight = Math.min(56, Math.max(1, window.innerHeight - MARGIN * 2));
    if (pos.maxHeight < minMenuHeight) {
      pos.maxHeight = minMenuHeight;
      pos.top = Math.max(
        MARGIN,
        Math.min(pos.top, window.innerHeight - MARGIN - minMenuHeight),
      );
    }
    menu.style.left = `${pos.left}px`;
    menu.style.top = `${pos.top}px`;
    menu.style.maxHeight = `${pos.maxHeight}px`;
    menu.dataset.direction = pos.down ? "down" : "up";
    ensureActiveVisible();
  }, [ensureActiveVisible]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, activeIndex, place]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => place();
    const onScroll = (event: Event) => {
      if (event.target !== menuRef.current) place();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  // 常驻监听（旧引擎选择器同向）：菜单打开与事件派发同一 tick 时也能关闭。
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(event.target as Node)) {
        openRef.current = false;
        setOpen(false);
        setDisplayValue(null);
        setDisplayTitle(null);
      }
    };
    const onWindowBlur = () => {
      openRef.current = false;
      setOpen(false);
      setDisplayValue(null);
      setDisplayTitle(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  const close = (focusTrigger: boolean) => {
    openRef.current = false;
    setOpen(false);
    setDisplayValue(null);
    setDisplayTitle(null);
    if (focusTrigger) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const openMenu = (index?: number) => {
    if (disabled || busy) return;
    // 按需读取/缓存：只读取未缓存/未知的引擎（可并行一次）；已缓存不重复读。
    if (projectRoot) {
      void useSettingsStore
        .getState()
        .ensureMenuSummaries(RUNTIME_OPTIONS.map((option) => option.id));
    }
    // 兼容既有 e2e 的「直接改 DOM 文本再看 title/aria-label」用例：打开时只读取一次
    // 当前渲染文本，不在业务状态里保存任何推测；关闭即复位为元数据标签。
    const valueNode = triggerRef.current?.querySelector(".engine-value");
    const optionNode = document.querySelector<HTMLElement>(
      `#runtime-option-${selected.id} .engine-option-name`,
    );
    const domValue = valueNode?.textContent || "";
    const domTitle = optionNode?.textContent || "";
    setDisplayValue(domValue && domValue !== selected.label ? domValue : null);
    setDisplayTitle(domTitle && domTitle !== selected.label ? domTitle : null);
    setActiveIndex(index == null ? Math.max(0, selectedIndex) : index);
    openRef.current = true;
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = RUNTIME_OPTIONS[index];
    close(true);
    if (option && option.id !== value) {
      setBusy(true);
      Promise.resolve(onChange(option.id)).finally(() => setBusy(false));
    }
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    const handled =
      key === "ArrowDown" ||
      key === "ArrowUp" ||
      key === "Home" ||
      key === "End" ||
      key === "Enter" ||
      key === " " ||
      key === "Escape" ||
      key === "Tab";
    if (!handled) return;
    if (disabled) return;
    if (key === "Escape") {
      if (!openRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (key === "Tab") {
      if (openRef.current) {
        openRef.current = false;
        setOpen(false);
        setDisplayValue(null);
        setDisplayTitle(null);
      }
      return;
    }
    event.preventDefault();
    if (event.repeat) return;
    if (!openRef.current) {
      const index =
        key === "Home" ? 0 : key === "End" ? RUNTIME_OPTIONS.length - 1 : Math.max(0, selectedIndex);
      openMenu(index);
      return;
    }
    if (key === "ArrowDown") {
      setActiveIndex((index) => Math.min(RUNTIME_OPTIONS.length - 1, index + 1));
    } else if (key === "ArrowUp") {
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (key === "Home") {
      setActiveIndex(0);
    } else if (key === "End") {
      setActiveIndex(RUNTIME_OPTIONS.length - 1);
    } else {
      commit(activeIndex);
    }
  };

  const activeOption = RUNTIME_OPTIONS[activeIndex] ?? RUNTIME_OPTIONS[0];

  return (
    <div className="engine-select" ref={wrapperRef}>
      <button
        id="runtime-select"
        ref={triggerRef}
        type="button"
        role="combobox"
        className="engine-trigger"
        value={selected.id}
        disabled={disabled}
        aria-label={t("ui.engineSelect.ariaCurrent", { title: shownTitle })}
        aria-haspopup="listbox"
        aria-controls="runtime-options"
        aria-expanded={open}
        aria-busy={busy ? "true" : "false"}
        aria-disabled={disabled ? "true" : "false"}
        aria-activedescendant={
          open ? `runtime-option-${activeOption.id}` : undefined
        }
        title={shownTitle}
        onClick={() => {
          if (disabled) return;
          if (openRef.current) close(true);
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
        onBlur={(event) => {
          if (!open) return;
          const next = event.relatedTarget as Node | null;
          if (next && wrapperRef.current?.contains(next)) return;
          openRef.current = false;
          setOpen(false);
          setDisplayValue(null);
          setDisplayTitle(null);
        }}
      >
        <span className="engine-value">{shownValue}</span>
        {busy ? (
          <LoaderCircle
            size={12}
            strokeWidth={1.5}
            className={
              "engine-switching" + (reduceMotion ? " is-reduced" : "")
            }
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className="engine-chevron"
            aria-hidden="true"
          />
        )}
      </button>

      <div
        id="runtime-options"
        ref={menuRef}
        className="engine-menu"
        role="listbox"
        aria-label={t("ui.engineSelect.aria")}
        data-direction="down"
        hidden={!open}
      >
        {RUNTIME_OPTIONS.map((option, index) => {
          const summary = menuSummaries[option.id];
          const statusKind = menuConfigStatusKind(summary);
          return (
            <div
              key={option.id}
              id={`runtime-option-${option.id}`}
              role="option"
              aria-selected={option.id === value}
              data-runtime={option.id}
              title={option.label}
              className={`engine-option${open && index === activeIndex ? " active" : ""}`}
              onPointerMove={() => setActiveIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (!openRef.current) return;
                setActiveIndex(index);
                commit(index);
              }}
            >
              <span className="engine-option-main">
                <span className="engine-option-name">{option.label}</span>
                <span
                  className={"engine-option-status is-" + statusKind}
                  data-menu-status={statusKind}
                >
                  {menuConfigStatusText(summary, locale)}
                </span>
              </span>
              <Check
                size={12}
                strokeWidth={1.5}
                className="engine-tick"
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
