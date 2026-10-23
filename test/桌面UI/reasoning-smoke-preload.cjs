// test/桌面UI/reasoning-smoke-preload.cjs
// 推理显示冒烟的离线 IPC 替身 preload。
//
// 复用 Phase 4B 的受控白名单桩与 `window.desktop.__smoke.emit` 夹具直推能力
// （同一套离线通道、不接触真实模型/网络/文件系统）；本文件只作为推理冒烟的
// 显式入口，避免两处复制同一份 bridge 白名单产生漂移。

require("./phase4b-smoke-preload.cjs");
