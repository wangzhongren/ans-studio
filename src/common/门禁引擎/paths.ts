// 门禁引擎私有辅助：路径规范化、根归属与真实路径解析（纯函数，无业务副作用）
//
// **T25**：本文件的词法/真实路径原语已**收敛为单一来源**——不再自持实现，改为从跨角色共享模块
// `src/common/shared/path-primitives.ts`（属主：项目管理）**只读导入并同名转出**（同名 re-export）。
// 此前门禁引擎与 Pi适配器写入层**各持一份**路径规范化；二者必须**逐字同源**，否则「gate 认为在
// 根内」与「写入层认为在根内」可能漂移，留**误放行**空间（设计 §3.11 行 5/6、§6 风险 2–3）。
//
// 本文件此后只承担「转出」：既有的本角色内部消费方（io/boundary-*/resolve-write）与共享原语
// 测试（`test/项目管理/shared/path-primitives.test.ts` 的「逐字同源」用例）仍从此导入，行为逐字不变。
// 依赖方向：门禁引擎 → shared（单向），shared 不反向依赖本角色。

export {
  IS_WINDOWS,
  toPosix,
  isAbsoluteAny,
  normalizeLexical,
  compareKey,
  isUnderOrEqual,
  absRel,
  realResolve,
} from "../shared/path-primitives.ts";
