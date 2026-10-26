// app/desktop/view-image.ts
// 桌面窗口（2026-10-26）：`view_image` 的桌面侧投递能力——把工具读取的图片作为**下一轮用户提示的
// 图片附件**排队给同一角色（`projectRoot/roleId/runtime` 在开会话时定格，绝不按 `activeRoleId` 猜）。
//
// 契约：形状单一来源＝契约家 `src/model/runtime.ts`（`ViewImageFn`/`ViewImageInput`/`PromptImage`；
// 运行时核心 2026-10-26 两轮附件设计）。本模块只提供桌面侧实现与工厂——开工/重建时随
// `openRoleSession` 入参 `viewImage` 注入，编排原样转交运行时核心；未注入 ⇒ `view_image` 不注册。
//
// 纪律：
//  · 只经 `SessionManager.send` 的既有投递机：角色忙（工具在本轮内）⇒ 按到达序入队，settle 后投递；
//    直发失败/会话不可用 ⇒ 如实回执 `{ok:false,message}`，绝不谎称「图片已提供」；
//  · 投递是一条**后台系统提示**（`background:true` + `kind:"system"`）——不冒充客户消息、不抢活动角色；
//  · `PromptOptions.images` 装入工具给的 `PromptImage`（对象原引用，不重新编码/不复制字节）；
//  · 图片数据缺失/非法 ⇒ 明确失败并且**不投任何文本**（不制造「说了有图、实际无图」的假消息）；
//  · 本层不读文件、不做图片格式/大小判定（读取与校验属工具层），只排队投递。

import type { PromptImage, ViewImageFn, ViewImageInput } from "../../src/model/runtime.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";

/** 投递目标：开会话时定格，闭包内不再从 `activeRoleId` 推导。 */
export interface ViewImageTarget {
  projectRoot: string;
  roleId: string;
  runtime: RuntimeKind;
}

/** 投递所需的窄接口（`SessionManager.send` 的结构子集；避免与 session.ts 循环导入）。 */
export interface ViewImageSend {
  (
    text: string,
    opts: { images: PromptImage[] },
    target: ViewImageTarget,
    metadata: { background: true; kind: "system" },
  ): Promise<{ ok: boolean; error?: string }>;
}

export interface ViewImageDeliveryDeps {
  target: ViewImageTarget;
  send: ViewImageSend;
}

/** 提示文本（单一来源；测试据此断言，不另写第二份）。 */
export function buildViewImagePrompt(path: string): string {
  return `这是 view_image 请求的图片：${path}；请查看后判断`;
}

/** 结构校验（只保证能安全进入 `PromptOptions.images`；格式/大小判定属工具层）。 */
function isPromptImage(value: unknown): value is PromptImage {
  if (typeof value !== "object" || value === null) return false;
  const image = value as Partial<PromptImage>;
  return (
    image.type === "image" &&
    typeof image.data === "string" &&
    image.data !== "" &&
    typeof image.mimeType === "string" &&
    image.mimeType !== ""
  );
}

/**
 * 构造一次会话的 `ViewImageFn`：
 *  · 载荷非法 ⇒ `{ok:false,message}`，不调用投递；
 *  · `send` 成功（直发或入队）⇒ `{ok:true}`（入队即「已交给投递机」，settle 后按序送达）；
 *  · `send` 失败/抛错 ⇒ `{ok:false,message}`（带底层原始原因，不吞）。
 */
export function createViewImageDelivery(deps: ViewImageDeliveryDeps): ViewImageFn {
  const target = deps.target;
  return async (input: ViewImageInput) => {
    const path = typeof input?.path === "string" ? input.path : "";
    if (path.trim() === "") {
      return { ok: false, message: "view_image 请求缺少图片路径；未投递。" };
    }
    const image: unknown = input?.image;
    if (!isPromptImage(image)) {
      return { ok: false, message: "view_image 请求不含可投递的图片数据；未投递。" };
    }
    try {
      const sent = await deps.send(
        buildViewImagePrompt(path),
        { images: [image] },
        target,
        { background: true, kind: "system" },
      );
      if (!sent.ok) {
        return { ok: false, message: `view_image 图片投递失败：${sent.error ?? "未知原因"}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, message: `view_image 图片投递失败：${error instanceof Error ? error.message : String(error)}` };
    }
  };
}
