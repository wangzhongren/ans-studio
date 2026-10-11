// src/common/编排/exit-codes.ts
// 退出码约定（编排全域统一）：**0 = 成功；非 0 = 失败**。
//
// 凡令命令行以某码结束处（Interface / Pipeline），一律引用本模块常量，不手写数字，
// 避免“各处随手 return”。两个非 0 码都表示失败，仅用于区分错误类别、便于诊断。

/** 成功。 */
export const EXIT_OK = 0;

/** 用法/参数错误：未知角色、未知参数、多余参数、缺少必需参数（含缺少注入的 project/scope）。 */
export const EXIT_USAGE = 2;

/** 运行时失败：角色/边界解析失败、边界 parseError、会话建立（bindRole）或会话中途出错。 */
export const EXIT_FAILURE = 1;
