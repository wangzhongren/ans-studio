/**
 * game/engine/camera.js
 * 模块：engine-core · 相机/视口（挂 WX.Engine.Camera）
 *
 * 约定：
 *   - camera.x / camera.y 为**视口中心**的世界坐标（默认世界中心）；
 *   - camera.zoom 为相对适配缩放的倍率（1 = 世界完整可见）；
 *   - 视口矩形由 world 尺寸与 zoom 推出，供 Renderer 套用变换与裁剪；
 *   - shake 只影响渲染偏移，不影响逻辑坐标，避免影响碰撞与索敌。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});
  var Cam = Engine.Camera || (Engine.Camera = {});

  function WorldCamera(options) {
    options = options || {};
    this.worldWidth = typeof options.worldWidth === 'number' ? options.worldWidth : 1280;
    this.worldHeight = typeof options.worldHeight === 'number' ? options.worldHeight : 720;
    this.minZoom = typeof options.minZoom === 'number' ? options.minZoom : 1;
    this.maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : 2;
    var initialZoom = typeof options.zoom === 'number' && options.zoom > 0 ? options.zoom : 1;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, initialZoom));
    this.x = typeof options.x === 'number' ? options.x : this.worldWidth / 2;
    this.y = typeof options.y === 'number' ? options.y : this.worldHeight / 2;

    /* 抖动：强度（世界像素）与剩余时间（秒）。 */
    this._shakeIntensity = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  Cam.create = function (options) {
    return new WorldCamera(options);
  };

  /** 设置中心（世界坐标，未裁剪）。 */
  WorldCamera.prototype.setPosition = function (x, y) {
    this.x = x;
    this.y = y;
    return this;
  };

  WorldCamera.prototype.centerOnWorld = function () {
    this.x = this.worldWidth / 2;
    this.y = this.worldHeight / 2;
    return this;
  };

  WorldCamera.prototype.setZoom = function (zoom) {
    var z = typeof zoom === 'number' ? zoom : 1;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    return this;
  };

  /** 平滑跟随目标（供后续镜头/大地图扩展；本版固定竞技场一般不需要）。 */
  WorldCamera.prototype.follow = function (target, smoothing, dt) {
    if (!target) { return this; }
    var s = typeof smoothing === 'number' ? smoothing : 6;
    var t = 1 - Math.exp(-Math.max(0, s) * Math.max(0, dt));
    this.x += (target.x - this.x) * t;
    this.y += (target.y - this.y) * t;
    return this;
  };

  /** 视口在 zoom 下的世界尺寸。 */
  WorldCamera.prototype.viewSize = function () {
    return {
      width: this.worldWidth / this.zoom,
      height: this.worldHeight / this.zoom
    };
  };

  /** 视口矩形（世界坐标，左上角 + 尺寸）。 */
  WorldCamera.prototype.viewRect = function () {
    var size = this.viewSize();
    return {
      x: this.x - size.width / 2,
      y: this.y - size.height / 2,
      width: size.width,
      height: size.height
    };
  };

  /** 把视口夹在世界边界内（zoom >= 1 时不会露出世界外）。 */
  WorldCamera.prototype.clampToWorld = function () {
    var size = this.viewSize();
    var halfW = size.width / 2;
    var halfH = size.height / 2;
    if (size.width >= this.worldWidth) {
      this.x = this.worldWidth / 2;
    } else {
      this.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.x));
    }
    if (size.height >= this.worldHeight) {
      this.y = this.worldHeight / 2;
    } else {
      this.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.y));
    }
    return this;
  };

  /** 触发屏幕抖动（命中反馈用）；同强度叠加取较大值。 */
  WorldCamera.prototype.shake = function (intensity, duration) {
    var d = typeof duration === 'number' ? duration : 0.18;
    this._shakeIntensity = Math.max(this._shakeIntensity, typeof intensity === 'number' ? intensity : 4);
    this._shakeDuration = Math.max(this._shakeDuration, d);
    this._shakeElapsed = 0;
    return this;
  };

  /**
   * 每帧更新抖动衰减（由 loop-app 在渲染前调用）。
   * 结果写入 camera.shakeX / camera.shakeY（世界像素），返回 this。
   */
  WorldCamera.prototype.update = function (dt) {
    if (this._shakeDuration <= 0) {
      this.shakeX = 0;
      this.shakeY = 0;
      return this;
    }
    this._shakeElapsed += Math.max(0, dt);
    var remain = this._shakeDuration - this._shakeElapsed;
    if (remain <= 0) {
      this._shakeDuration = 0;
      this._shakeElapsed = 0;
      this._shakeIntensity = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return this;
    }
    /* 衰减 + 高频交替：不用随机数，保证可复现。 */
    var ratio = remain / this._shakeDuration;
    var amp = this._shakeIntensity * ratio * ratio;
    var phase = this._shakeElapsed * 47;
    this.shakeX = Math.sin(phase) * amp;
    this.shakeY = Math.cos(phase * 1.37) * amp;
    return this;
  };

  WorldCamera.prototype.reset = function () {
    this.setZoom(1);
    this.centerOnWorld();
    this._shakeIntensity = 0;
    this._shakeDuration = 0;
    this._shakeElapsed = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    return this;
  };

  WX.Engine.Camera = Cam;
})(typeof window !== 'undefined' ? window : this);
