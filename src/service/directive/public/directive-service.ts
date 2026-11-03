// src/service/directive/public/directive-service.ts
// 客户指令 Service 公共出口（编排 B-3）。只 re-export，不定义第二份。

export type {
  DirectiveConsumeVia,
  DirectiveCreateRequest,
  DirectiveCreateResult,
  DirectiveErrorCode,
  DirectiveListView,
  DirectiveMutationResult,
  DirectiveService,
  DirectiveServiceList,
  DirectiveServiceOptions,
} from "../abstract/directive-service.ts";
export { buildDirectiveService as createDirectiveService } from "../impl/directive-service.ts";
