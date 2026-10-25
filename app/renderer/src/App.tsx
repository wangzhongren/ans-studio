/**
 * 新渲染器骨架（Phase 2）。
 *
 * 结构：自绘标题栏 → 左栏（shadcn resizable Group/Panel）＋中栏（会话头/空态/
 * 输入区）→ 右抽屉（Motion）→ shell 确认卡演示（AlertDialog）。
 * 全部数据为 demo；不接业务、不做边界判定、不接触 Node。
 */

import { useEffect, useRef } from "react";
import type { GroupImperativeHandle } from "react-resizable-panels";
import { CSPProvider } from "@base-ui/react/csp-provider";
import { PanelLeftOpen } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ChatStream } from "@/chat/ChatStream";
import { installChatRuntime } from "@/chat/ipc";
import { useChatStore } from "@/chat/chat-store";
import { ChatHeader } from "@/shell/ChatHeader";
import { Composer } from "@/shell/Composer";
import { ConfirmCard } from "@/shell/ConfirmCard";
import { Drawer } from "@/shell/Drawer";
import { Sidebar } from "@/shell/Sidebar";
import { TitleBar } from "@/shell/TitleBar";
import { installTestDriver } from "@/test-driver";
import { useLocaleStore } from "@/i18n";
import { useT } from "@/i18n";
import { useUiStore } from "@/stores/ui-store";

export default function App() {
  const t = useT();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const hint = useChatStore((s) => s.hint);
  const paneMeta = useChatStore((s) => s.paneMeta);
  // A1：历史投影诊断与上下文状态分开；这里只显示投影文本（没有就不显示）。
  const projectionText = selectedRoleId
    ? paneMeta[selectedRoleId]?.projectionText || ""
    : "";
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const groupHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    installChatRuntime();
    installTestDriver();
    // i18n B0：首屏镜像已在 store 创建时读入；这里补 lang/文件校正/广播订阅。
    void useLocaleStore.getState().init();
  }, []);

  useEffect(() => {
    const applyLayout = () => {
      const group = groupRef.current;
      const host = groupHostRef.current;
      if (!group || !host) return;
      const total = host.getBoundingClientRect().width;
      if (!(total > 0)) return;
      const state = useUiStore.getState();
      const px = state.sidebarCollapsed ? 0 : state.sidebarWidth;
      const percent = Math.max(0, Math.min(100, (px / total) * 100));
      group.setLayout({ sidebar: percent, main: 100 - percent });
    };

    applyLayout();
    const raf = requestAnimationFrame(applyLayout);
    const unsubscribe = useUiStore.subscribe(applyLayout);
    window.addEventListener("resize", applyLayout);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("resize", applyLayout);
    };
  }, []);

  const expandSidebar = () => {
    setSidebarCollapsed(false);
    requestAnimationFrame(() => {
      document.getElementById("sidebar-collapse")?.focus();
    });
  };

  return (
    <TooltipProvider delay={400}>
      <CSPProvider disableStyleElements>
        <div className="app-shell">
        <TitleBar />
        <div className={`app${collapsed ? " is-sidebar-collapsed" : ""}${drawerOpen ? " drawer-open" : ""}`}>
          <ResizablePanelGroup
            orientation="horizontal"
            groupRef={groupRef}
            elementRef={groupHostRef}
            className="app-body"
          >
            <ResizablePanel
              id="sidebar"
              defaultSize={collapsed ? 0 : sidebarWidth}
              minSize={0}
              maxSize={360}
            >
              <Sidebar />
            </ResizablePanel>
            <ResizablePanel id="main" minSize={0}>
              <main className="col-mid">
                <button
                  id="sidebar-expand"
                  className="sidebar-toggle sidebar-expand"
                  type="button"
                  aria-label={t("ui.app.expandSidebar")}
                  title={t("ui.app.expandSidebar")}
                  aria-expanded={!collapsed}
                  hidden={!collapsed}
                  onClick={expandSidebar}
                >
                  <PanelLeftOpen
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>

                <ChatHeader onOpenDrawer={() => setDrawerOpen(true)} />

                <div className="session-notice">
                  <span id="composer-hint" className="composer-hint">
                    {hint}
                  </span>
                  <span
                    id="history-projection-note"
                    className="context-state"
                    role={projectionText ? "status" : undefined}
                    aria-live={projectionText ? "polite" : undefined}
                    hidden={!projectionText}
                  >
                    {projectionText}
                  </span>
                </div>

                <ChatStream />

                <Composer />
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
          <Drawer />
        </div>
        <ConfirmCard />
        </div>
      </CSPProvider>
    </TooltipProvider>
  );
}
