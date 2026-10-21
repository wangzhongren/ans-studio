/**
 * 4B 驱动扩展：`window.__ansRenderer.governance`（治理预览/确认/状态）。
 *
 * 只调真实 store 动作；不提供假实现、不写文件。
 */

import { useGovernanceStore } from "@/stores/governance-store";
import type { GovernanceMode, GovernanceModelChoice } from "@/stores/governance-store";

export const extend = {
  governance: {
    state() {
      const state = useGovernanceStore.getState();
      return {
        open: state.open,
        mode: state.mode,
        modelChoice: state.modelChoice,
        loading: state.loading,
        busy: state.busy,
        canConfirm: state.canConfirm,
        previewDigest: state.previewDigest,
        result: state.result,
        error: state.error,
        nextStep: state.nextStep,
      };
    },
    open(mode?: GovernanceMode) {
      return useGovernanceStore.getState().openPreview(mode);
    },
    selectModel(model: GovernanceModelChoice) {
      return useGovernanceStore.getState().selectModel(model);
    },
    confirm() {
      return useGovernanceStore.getState().confirm();
    },
    cancel() {
      useGovernanceStore.getState().cancel();
    },
  },
};
