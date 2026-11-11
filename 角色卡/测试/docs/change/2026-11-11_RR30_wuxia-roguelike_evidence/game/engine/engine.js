/**
 * game/engine/engine.js
 * 模块：engine-core（渲染与输入引擎）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责：
 *   - 创建并持有 Canvas / Renderer / Camera / Input 的组合实例（WX.Engine.create）；
 *   - 提供逻辑世界尺寸常量与 DPR、resize 适配的统一入口；
 *   - 只做渲染/输入/数学基础设施，不承载任何游戏业务规则（业务归 loop-app 与领域模块）。
 *
 * 硬约束（架构契约 §1）：
 *   - 经典 <script> + IIFE 挂载 window.WX.Engine，不使用 ES Module；
 *   - 不 fetch/XHR 本地 JSON、无外部依赖、无构建链；
 *   - 不启动 rAF 主循环：固定步长循环归 loop-app（架构契约 §5.3）。
 *
 * 加载顺序：config（WX.Config）→ engine（本目录，按文件名顺序）。本文件不依赖其他
 * engine 文件先加载，组合函数在调用时（App.start 之后）才解析 Renderer/Input 等。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});

  /* ---------------------------- 版本与常量 ---------------------------- */

  Engine.VERSION = '1.0.0';
  Engine.ENGINE_NAME = 'wuxia-engine';

  /** 逻辑世界尺寸（架构契约：1280x720 逻辑坐标）。优先读只读配置，缺省同值。 */
  Engine.DEFAULT_WORLD = { width: 1280, height: 720 };

  if (!Engine.WORLD) {
    Engine.WORLD = Engine.DEFAULT_WORLD;
  }

  /**
   * 取逻辑世界尺寸：显式参数 > WX.Config.balance.world > 默认 1280x720。
   * 不修改 Config，只读取。
   */
  Engine.getWorldSize = function (options) {
    var w = Engine.DEFAULT_WORLD.width;
    var h = Engine.DEFAULT_WORLD.height;
    var cfg = WX.Config;
    if (cfg && cfg.balance && cfg.balance.world) {
      if (typeof cfg.balance.world.width === 'number') { w = cfg.balance.world.width; }
      if (typeof cfg.balance.world.height === 'number') { h = cfg.balance.world.height; }
    }
    if (options) {
      if (typeof options.worldWidth === 'number') { w = options.worldWidth; }
      if (typeof options.worldHeight === 'number') { h = options.worldHeight; }
    }
    return { width: w, height: h };
  };

  /* ---------------------------- Canvas 解析 ---------------------------- */

  /** 解析 canvas：元素 / CSS 选择器字符串 / {width,height} 描述 / 缺省时自动创建。 */
  Engine.resolveCanvas = function (canvasLike) {
    var doc = global.document;

    if (canvasLike && canvasLike.nodeType === 1 && typeof canvasLike.getContext === 'function') {
      return canvasLike;
    }
    if (typeof canvasLike === 'string' && doc && doc.querySelector) {
      var found = doc.querySelector(canvasLike);
      if (found) { return found; }
    }
    if (canvasLike && typeof canvasLike.getContext === 'function') {
      return canvasLike;
    }
    if (doc && typeof doc.createElement === 'function') {
      var created = doc.createElement('canvas');
      if (typeof canvasLike === 'string' && canvasLike.charAt(0) === '#') {
        created.id = canvasLike.slice(1);
      } else {
        created.id = created.id || 'wx-canvas';
      }
      /* 未指定父节点时挂到 body，保证 clientWidth/DPR 适配可测量。 */
      var parent = (canvasLike && canvasLike.parent) || doc.body || null;
      if (parent && typeof parent.appendChild === 'function') {
        parent.appendChild(created);
      }
      return created;
    }
    return null;
  };

  /* ---------------------------- 组合实例 ---------------------------- */

  /**
   * 创建引擎组合实例。
   * @param {HTMLCanvasElement|string} [canvasLike] canvas 元素、选择器或 {width,height}。
   * @param {object} [options]
   *   worldWidth/worldHeight  逻辑世界尺寸（缺省读 Config.balance.world 或 1280x720）
   *   background              画布底色（letterbox 填充，缺省深墨色）
   *   fit                     'contain'（默认，等比留边）| 'stretch'（拉伸铺满）
   *   pixelRatio              显式 DPR；缺省 devicePixelRatio（上限 3）
   *   input                   Input.create 的可选项（target 等）
   * @returns {object} { canvas, ctx, renderer, camera, input, world, resize, beginFrame, endFrame, destroy }
   */
  Engine.create = function (canvasLike, options) {
    options = options || {};
    var canvas = Engine.resolveCanvas(canvasLike);
    if (!canvas) {
      throw new Error('[WX.Engine] 无法解析或创建 canvas');
    }

    var world = Engine.getWorldSize(options);

    if (!Engine.Renderer || typeof Engine.Renderer.create !== 'function') {
      throw new Error('[WX.Engine] 缺少 Renderer 模块（请先加载 game/engine/renderer.js）');
    }
    if (!Engine.Camera || typeof Engine.Camera.create !== 'function') {
      throw new Error('[WX.Engine] 缺少 Camera 模块（请先加载 game/engine/camera.js）');
    }
    if (!Engine.Input || typeof Engine.Input.create !== 'function') {
      throw new Error('[WX.Engine] 缺少 Input 模块（请先加载 game/engine/input.js）');
    }

    var renderer = Engine.Renderer.create(canvas, {
      worldWidth: world.width,
      worldHeight: world.height,
      fit: options.fit || 'contain',
      pixelRatio: options.pixelRatio,
      background: options.background
    });

    var camera = Engine.Camera.create({
      width: world.width,
      height: world.height,
      worldWidth: world.width,
      worldHeight: world.height
    });

    var input = Engine.Input.create({
      target: options.input && options.input.target ? options.input.target : global,
      canvas: canvas,
      preventDefault: !options.input || options.input.preventDefault !== false,
      screenToWorld: function (clientX, clientY) {
        return renderer.screenToWorld(clientX, clientY);
      }
    });

    var api = {
      canvas: canvas,
      ctx: renderer.ctx,
      renderer: renderer,
      camera: camera,
      input: input,
      world: { width: world.width, height: world.height },

      /** 窗口/画布尺寸变化时重算 DPR 与适配变换。 */
      resize: function () {
        renderer.resize();
        return api;
      },

      /** 开始一帧：清屏并套用相机/适配变换（loop-app 每帧调用一次；可传相机覆盖默认）。 */
      beginFrame: function (cameraOverride) {
        renderer.beginFrame(cameraOverride || camera);
        return renderer.ctx;
      },

      /** 结束一帧：复位变换（loop-app 每帧末调用）。 */
      endFrame: function () {
        input.endFrame();
        renderer.endFrame();
      },

      /** 释放监听（重开/卸载时调用）。 */
      destroy: function () {
        input.destroy();
        renderer.destroy();
      }
    };

    return api;
  };

  /* ---------------------------- 兼容入口 ---------------------------- */

  /** 允许 loop-app 直接访问子模块（Engine.Renderer / Engine.Input / Engine.Math ...）。 */
  Engine.getModule = function (name) {
    return Engine[name] || null;
  };

  WX.Engine = Engine;
})(typeof window !== 'undefined' ? window : this);
