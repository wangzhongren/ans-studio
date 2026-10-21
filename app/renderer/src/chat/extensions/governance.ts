/**
 * 4B IPC 扩展：治理流程下一步的状态行（经 4A 注册器自动安装）。
 *
 * `governance:next-step` 只显示状态行；不打开/切换会话、不派发、不代答。
 */

import type { DesktopBridge } from "@/lib/platform";
import { useGovernanceStore } from "@/stores/governance-store";

export function install(bridge: DesktopBridge): () => void {
  const off = bridge.onGovernanceNextStep?.((payload) => {
    useGovernanceStore.getState().setNextStep(payload);
  });
  return () => {
    if (typeof off === "function") off();
  };
}
