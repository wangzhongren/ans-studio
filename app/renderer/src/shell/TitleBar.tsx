/**
 * 自绘标题栏（36px）。
 *
 * - 整条是拖动区（-webkit-app-region: drag），按钮 no-drag。
 * - 窗口三按钮只在 `window.desktop` 提供对应方法时可用；缺席即禁用并可见标注。
 * - 双击拖动区最大化由系统按原生行为处理——此处**不**挂 dblclick。
 */

import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import {
  callWindowControl,
  getWindowControlAvailability,
  queryMaximized,
  subscribeMaximized,
} from "@/lib/platform";

function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  const availability = getWindowControlAvailability();

  useEffect(() => {
    if (!availability.isMaximized) return;
    let alive = true;
    void queryMaximized().then((value) => {
      if (alive) setMaximized(value);
    });
    const off = subscribeMaximized((value) => setMaximized(value === true));
    return () => {
      alive = false;
      off();
    };
  }, [availability.isMaximized]);

  return maximized;
}

export function TitleBar() {
  const availability = getWindowControlAvailability();
  const maximized = useMaximized();
  const windowControlsAvailable =
    availability.minimize && availability.maximize && availability.close;

  return (
    <header className="titlebar" id="titlebar">
      <div className="titlebar-left">
        {!windowControlsAvailable ? (
          <span className="titlebar-note" role="status">
            窗口控制不可用
          </span>
        ) : null}
      </div>
      <div className="titlebar-brand">
        <span className="titlebar-mark">ANS</span>
        <span className="titlebar-sub">治理会话工作台</span>
      </div>
      <div className="titlebar-controls">
        <button
          id="win-min"
          className="win-btn"
          type="button"
          title={availability.minimize ? "最小化" : "当前环境未提供窗口控制"}
          aria-label="最小化"
          disabled={!availability.minimize}
          onClick={() => callWindowControl("minimizeWindow")}
        >
          <Minus size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          id="win-max"
          className="win-btn"
          type="button"
          title={
            availability.maximize
              ? maximized
                ? "还原"
                : "最大化"
              : "当前环境未提供窗口控制"
          }
          aria-label={maximized ? "还原" : "最大化"}
          disabled={!availability.maximize}
          onClick={() => callWindowControl("toggleMaximize")}
        >
          {maximized ? (
            <Copy size={12} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Square size={12} strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
        <button
          id="win-close"
          className="win-btn win-btn-close"
          type="button"
          title={availability.close ? "关闭" : "当前环境未提供窗口控制"}
          aria-label="关闭"
          disabled={!availability.close}
          onClick={() => callWindowControl("closeWindow")}
        >
          <X size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
