/**
 * 4B IPC 扩展：报告持久化 / 交付历史回执更新（经 4A 注册器自动安装）。
 *
 * 只把主进程推送交给 report-store（scope×report/attempt 键、晚到丢弃）；
 * 不解析业务正文、不新增持久化。
 */

import type { DesktopBridge } from "@/lib/platform";
import { useReportStore } from "@/stores/report-store";

export function install(bridge: DesktopBridge): () => void {
  const offReport = bridge.onReportPersistenceUpdated?.((payload) => {
    useReportStore.getState().applyUpdate(payload);
  });
  const offDelivery = bridge.onDeliveryHistoryUpdated?.((payload) => {
    useReportStore.getState().applyUpdate(payload);
  });
  return () => {
    if (typeof offReport === "function") offReport();
    if (typeof offDelivery === "function") offDelivery();
  };
}
