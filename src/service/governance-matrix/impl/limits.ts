// 治理权力矩阵 Service：渲染上限常量（单一来源；C3/测试只从这里经 public.ts 导入）。
//
// 数值由 C1b 唯一定义；Model（C1a）只声明 MatrixRenderInfo 字段、不定义数值；
// 编排/Provider/测试不得另行定义同名或同义常量（G-3）。

/** 幕僚提示块总上限（Unicode 码点）。 */
export const GOVERNANCE_MATRIX_PROMPT_MAX_CHARS = 16000;

/** 工具文本总上限（Unicode 码点）。 */
export const GOVERNANCE_MATRIX_TOOL_MAX_CHARS = 48000;

/** 单角色块默认上限（Unicode 码点）。 */
export const GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS = 1500;

/** 单字段上限（Unicode 码点）。 */
export const GOVERNANCE_MATRIX_FIELD_MAX_CHARS = Object.freeze({
  displayName: 80,
  duty: 500,
  mainChain: 800,
  conventions: 300,
});
