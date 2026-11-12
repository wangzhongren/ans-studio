/**
 * game/engine/renderer.js
 * 模块：engine-core · Canvas 2D 渲染器（挂 WX.Engine.Renderer）
 *
 * 设计：
 *   - 逻辑坐标固定为世界坐标（架构契约 §5.x：1280x720），所有绘制 API 均用世界坐标；
 *   - 画布按 devicePixelRatio 放大后备缓冲，再按 fit 模式把世界映射到 CSS 像素；
 *   - beginFrame(camera) 清屏、铺底色、套用相机/适配变换并裁剪到世界边界；
 *   - endFrame() 复位变换，避免状态泄漏到下一帧；
 *   - 不涉及任何业务规则，只提供绘图原语（本游戏不依赖外部图片，形状绘制即精灵占位）。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});

  var DEFAULT_BG = '#0b0e12';
  var DEFAULT_FONT = '"KaiTi","STKaiti","Kaiti SC","SimSun",serif';
  var MAX_DPR = 3;
  var TAU = Math.PI * 2;

  function Renderer(canvas, options) {
    options = options || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.worldWidth = typeof options.worldWidth === 'number' ? options.worldWidth : 1280;
    this.worldHeight = typeof options.worldHeight === 'number' ? options.worldHeight : 720;
    this.fit = options.fit === 'stretch' || options.fit === 'cover' ? options.fit : 'contain';
    this.background = options.background || DEFAULT_BG;
    this.fontFamily = options.fontFamily || DEFAULT_FONT;
    this.maxDpr = typeof options.maxDpr === 'number' ? options.maxDpr : MAX_DPR;
    this.pixelRatioOverride = typeof options.pixelRatio === 'number' && options.pixelRatio > 0
      ? options.pixelRatio
      : null;

    this.dpr = 1;
    this.cssWidth = this.worldWidth;
    this.cssHeight = this.worldHeight;
    this.scaleX = 1;
    this.scaleY = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    /* 当前帧变换（供 screenToWorld / worldToScreen 使用）。 */
    this._view = {
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      valid: false
    };

    this.stats = { drawCalls: 0, frames: 0 };
    this._clipActive = false;

    this._onResize = null;
    if (global && typeof global.addEventListener === 'function') {
      var self = this;
      this._onResize = function () { self.resize(); };
      global.addEventListener('resize', this._onResize);
      global.addEventListener('orientationchange', this._onResize);
    }

    this.resize();
  }

  /* ============================ 尺寸 / DPR ============================ */

  Renderer.prototype._measureCssSize = function () {
    var canvas = this.canvas;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;

    if (!w || !h) {
      var rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : null;
      if (rect && rect.width && rect.height) {
        w = rect.width;
        h = rect.height;
      }
    }
    if (!w || !h) {
      var styleW = parseFloat(canvas.style && canvas.style.width);
      var styleH = parseFloat(canvas.style && canvas.style.height);
      if (styleW && styleH) {
        w = styleW;
        h = styleH;
      }
    }
    if (!w || !h) {
      w = global.innerWidth || this.worldWidth;
      h = global.innerHeight || this.worldHeight;
    }
    if (!w || !h) {
      w = this.worldWidth;
      h = this.worldHeight;
    }
    return { width: w, height: h };
  };

  Renderer.prototype._measureDpr = function () {
    if (this.pixelRatioOverride) {
      return Math.min(this.maxDpr, Math.max(1, this.pixelRatioOverride));
    }
    var ratio = global.devicePixelRatio;
    if (!(typeof ratio === 'number' && ratio > 0)) { ratio = 1; }
    return Math.min(this.maxDpr, Math.max(1, ratio));
  };

  /**
   * 重算 DPR、后备缓冲与适配变换。窗口尺寸/DPR 变化后由 resize 监听自动调用，
   * 也可由 App 在布局变化后显式调用。
   */
  Renderer.prototype.resize = function () {
    var size = this._measureCssSize();
    var dpr = this._measureDpr();

    this.cssWidth = size.width;
    this.cssHeight = size.height;
    this.dpr = dpr;

    var bw = Math.max(1, Math.round(size.width * dpr));
    var bh = Math.max(1, Math.round(size.height * dpr));

    if (this.canvas.width !== bw) { this.canvas.width = bw; }
    if (this.canvas.height !== bh) { this.canvas.height = bh; }

    if (this.fit === 'stretch') {
      this.scaleX = size.width / this.worldWidth;
      this.scaleY = size.height / this.worldHeight;
      this.offsetX = 0;
      this.offsetY = 0;
    } else if (this.fit === 'cover') {
      var cover = Math.max(size.width / this.worldWidth, size.height / this.worldHeight);
      this.scaleX = cover;
      this.scaleY = cover;
      this.offsetX = (size.width - this.worldWidth * cover) / 2;
      this.offsetY = (size.height - this.worldHeight * cover) / 2;
    } else {
      /* contain：等比缩放并居中留边。 */
      var contain = Math.min(size.width / this.worldWidth, size.height / this.worldHeight);
      this.scaleX = contain;
      this.scaleY = contain;
      this.offsetX = (size.width - this.worldWidth * contain) / 2;
      this.offsetY = (size.height - this.worldHeight * contain) / 2;
    }

    this._view.valid = false;
    return this;
  };

  /** 当前视口信息（世界坐标 + CSS 像素尺度）。 */
  Renderer.prototype.getViewport = function () {
    if (this._view.valid) {
      return {
        left: this._view.left,
        top: this._view.top,
        scaleX: this._view.scaleX,
        scaleY: this._view.scaleY,
        cssWidth: this.cssWidth,
        cssHeight: this.cssHeight,
        dpr: this.dpr
      };
    }
    return {
      left: 0,
      top: 0,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      dpr: this.dpr
    };
  };

  /* ============================ 帧生命周期 ============================ */

  /**
   * 开始一帧：清屏、铺底色、套用相机变换并裁剪到世界边界。
   * @param {object} [camera] Engine.Camera 实例（可为空 = 无相机，世界完整可见）
   * @returns {CanvasRenderingContext2D}
   */
  Renderer.prototype.beginFrame = function (camera) {
    var ctx = this.ctx;
    if (!ctx) { return null; }

    /* 上一帧的世界裁剪必须恢复，否则会裁掉本帧清屏（clip 不受 setTransform 影响）。 */
    if (this._clipActive) {
      ctx.restore();
      this._clipActive = false;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    var zoom = 1;
    var left = 0;
    var top = 0;
    var shakeX = 0;
    var shakeY = 0;

    if (camera) {
      zoom = camera.zoom > 0 ? camera.zoom : 1;
      var rect = typeof camera.viewRect === 'function'
        ? camera.viewRect()
        : { x: 0, y: 0, width: this.worldWidth, height: this.worldHeight };
      left = rect.x;
      top = rect.y;
      shakeX = camera.shakeX || 0;
      shakeY = camera.shakeY || 0;
    }

    var scaleX = this.scaleX * zoom;
    var scaleY = this.scaleY * zoom;
    left -= shakeX;
    top -= shakeY;

    this._view.left = left;
    this._view.top = top;
    this._view.scaleX = scaleX;
    this._view.scaleY = scaleY;
    this._view.valid = true;

    /* 世界 → CSS 像素 → 后备缓冲像素。 */
    ctx.setTransform(
      this.dpr * scaleX, 0,
      0, this.dpr * scaleY,
      this.dpr * (this.offsetX - left * scaleX),
      this.dpr * (this.offsetY - top * scaleY)
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.worldWidth, this.worldHeight);
    ctx.clip();
    this._clipActive = true;

    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 1;

    this.stats.drawCalls = 0;
    this.stats.frames += 1;
    return ctx;
  };

  /** 结束一帧：复位变换与透明度。 */
  Renderer.prototype.endFrame = function () {
    var ctx = this.ctx;
    if (!ctx) { return; }
    if (this._clipActive) {
      ctx.restore();
      this._clipActive = false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this._view.valid = false;
  };

  /* ============================ 坐标换算 ============================ */

  /** 世界坐标 → 画布局部 CSS 像素。 */
  Renderer.prototype.worldToScreen = function (worldX, worldY) {
    var v = this.getViewport();
    return {
      x: this.offsetX + (worldX - v.left) * v.scaleX,
      y: this.offsetY + (worldY - v.top) * v.scaleY
    };
  };

  /** 客户端坐标（鼠标事件 clientX/clientY）→ 世界坐标。 */
  Renderer.prototype.screenToWorld = function (clientX, clientY) {
    var v = this.getViewport();
    var localX = clientX;
    var localY = clientY;

    if (typeof this.canvas.getBoundingClientRect === 'function') {
      var rect = this.canvas.getBoundingClientRect();
      localX = clientX - rect.left;
      localY = clientY - rect.top;
    }

    var sx = v.scaleX || 1;
    var sy = v.scaleY || 1;
    return {
      x: v.left + (localX - this.offsetX) / sx,
      y: v.top + (localY - this.offsetY) / sy
    };
  };

  /* ============================ 状态直通 ============================ */

  Renderer.prototype.save = function () {
    this.ctx.save();
    return this;
  };

  Renderer.prototype.restore = function () {
    this.ctx.restore();
    return this;
  };

  Renderer.prototype.translate = function (x, y) {
    this.ctx.translate(x, y);
    return this;
  };

  Renderer.prototype.rotate = function (rad) {
    this.ctx.rotate(rad);
    return this;
  };

  Renderer.prototype.scale = function (sx, sy) {
    this.ctx.scale(sx, typeof sy === 'number' ? sy : sx);
    return this;
  };

  Renderer.prototype.setAlpha = function (alpha) {
    this.ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    return this;
  };

  Renderer.prototype.getAlpha = function () {
    return this.ctx.globalAlpha;
  };

  /* ============================ 形状绘制 ============================ */

  Renderer.prototype.clear = function (color) {
    var ctx = this.ctx;
    if (this._clipActive) {
      ctx.restore();
      this._clipActive = false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this._view.valid = false;
    return this;
  };

  Renderer.prototype.fillRect = function (x, y, w, h, color) {
    var ctx = this.ctx;
    ctx.fillStyle = color || '#fff';
    ctx.fillRect(x, y, w, h);
    this.stats.drawCalls += 1;
    return this;
  };

  Renderer.prototype.strokeRect = function (x, y, w, h, color, lineWidth) {
    var ctx = this.ctx;
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = typeof lineWidth === 'number' ? lineWidth : 1;
    ctx.strokeRect(x, y, w, h);
    this.stats.drawCalls += 1;
    return this;
  };

  Renderer.prototype.fillCircle = function (x, y, radius, color) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.01, radius), 0, TAU);
    ctx.fillStyle = color || '#fff';
    ctx.fill();
    this.stats.drawCalls += 1;
    return this;
  };

  Renderer.prototype.strokeCircle = function (x, y, radius, color, lineWidth) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.01, radius), 0, TAU);
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = typeof lineWidth === 'number' ? lineWidth : 1;
    ctx.stroke();
    this.stats.drawCalls += 1;
    return this;
  };

  /** 圆环（外圆填充 + 内圆挖空用底色覆盖时调用方自行处理；此处用描边）。 */
  Renderer.prototype.strokeRing = function (x, y, radius, lineWidth, color) {
    return this.strokeCircle(x, y, radius, color, lineWidth);
  };

  Renderer.prototype.drawLine = function (x1, y1, x2, y2, color, lineWidth, dash) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = typeof lineWidth === 'number' ? lineWidth : 1;
    if (dash && dash.length) {
      ctx.setLineDash(dash);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    this.stats.drawCalls += 1;
    return this;
  };

  /**
   * 折线/多边形路径。
   * points 可为 [{x,y}, ...] 或 [[x,y], ...]。
   */
  Renderer.prototype._path = function (points, close) {
    var ctx = this.ctx;
    if (!points || points.length === 0) { return false; }
    ctx.beginPath();
    for (var i = 0; i < points.length; i += 1) {
      var p = points[i];
      var px = Array.isArray(p) ? p[0] : p.x;
      var py = Array.isArray(p) ? p[1] : p.y;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    if (close) { ctx.closePath(); }
    return true;
  };

  Renderer.prototype.fillPolygon = function (points, color) {
    if (!this._path(points, true)) { return this; }
    var ctx = this.ctx;
    ctx.fillStyle = color || '#fff';
    ctx.fill();
    this.stats.drawCalls += 1;
    return this;
  };

  Renderer.prototype.strokePolygon = function (points, color, lineWidth, close) {
    if (!this._path(points, close !== false)) { return this; }
    var ctx = this.ctx;
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = typeof lineWidth === 'number' ? lineWidth : 1;
    ctx.stroke();
    this.stats.drawCalls += 1;
    return this;
  };

  /** 扇形（近身横扫/技能范围表现）。 */
  Renderer.prototype.fillSector = function (x, y, radius, startAngle, endAngle, color) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, Math.max(0.01, radius), startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color || '#fff';
    ctx.fill();
    this.stats.drawCalls += 1;
    return this;
  };

  Renderer.prototype.strokeSector = function (x, y, radius, startAngle, endAngle, color, lineWidth) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, Math.max(0.01, radius), startAngle, endAngle);
    ctx.closePath();
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = typeof lineWidth === 'number' ? lineWidth : 1;
    ctx.stroke();
    this.stats.drawCalls += 1;
    return this;
  };

  /** 圆角矩形（不依赖 ctx.roundRect，兼容旧浏览器）。 */
  Renderer.prototype.fillRoundRect = function (x, y, w, h, radius, color) {
    var ctx = this.ctx;
    var r = Math.max(0, Math.min(radius || 0, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fillStyle = color || '#fff';
    ctx.fill();
    this.stats.drawCalls += 1;
    return this;
  };

  Renderer.prototype.strokeRoundRect = function (x, y, w, h, radius, color, lineWidth) {
    var ctx = this.ctx;
    var r = Math.max(0, Math.min(radius || 0, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = typeof lineWidth === 'number' ? lineWidth : 1;
    ctx.stroke();
    this.stats.drawCalls += 1;
    return this;
  };

  /* ============================ 精灵占位 / 文本 / 条 ============================ */

  /**
   * 形状占位精灵（本游戏不使用外部图片）。
   * options: { color, accent, stroke, strokeWidth, radius, shape: 'rect'|'circle'|'diamond' }
   * x/y 为左上角，w/h 为尺寸；circle/diamond 使用中心与半径推导。
   */
  Renderer.prototype.drawSprite = function (x, y, w, h, options) {
    options = options || {};
    var color = options.color || '#8a6d4b';
    var accent = options.accent || null;
    var stroke = options.stroke || null;
    var shape = options.shape || 'rect';

    if (shape === 'circle') {
      var cx = x + w / 2;
      var cy = y + h / 2;
      var cr = Math.min(w, h) / 2;
      this.fillCircle(cx, cy, cr, color);
      if (accent) { this.fillCircle(cx, cy, cr * 0.45, accent); }
      if (stroke) { this.strokeCircle(cx, cy, cr, stroke, options.strokeWidth || 1); }
      return this;
    }

    if (shape === 'diamond') {
      var dx = x + w / 2;
      var dy = y + h / 2;
      var hw = w / 2;
      var hh = h / 2;
      this.fillPolygon([
        { x: dx, y: dy - hh },
        { x: dx + hw, y: dy },
        { x: dx, y: dy + hh },
        { x: dx - hw, y: dy }
      ], color);
      if (stroke) {
        this.strokePolygon([
          { x: dx, y: dy - hh },
          { x: dx + hw, y: dy },
          { x: dx, y: dy + hh },
          { x: dx - hw, y: dy }
        ], stroke, options.strokeWidth || 1, true);
      }
      return this;
    }

    this.fillRoundRect(x, y, w, h, options.radius || 0, color);
    if (accent) {
      this.fillRect(x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5, accent);
    }
    if (stroke) {
      this.strokeRoundRect(x, y, w, h, options.radius || 0, stroke, options.strokeWidth || 1);
    }
    return this;
  };

  /**
   * 文本。options: { size, family, weight, color, align, baseline, maxWidth,
   *                strokeColor, strokeWidth, alpha }
   */
  Renderer.prototype.drawText = function (text, x, y, options) {
    options = options || {};
    var ctx = this.ctx;
    var size = typeof options.size === 'number' ? options.size : 16;
    var family = options.family || this.fontFamily;
    var weight = options.weight || 'normal';

    ctx.font = weight + ' ' + size + 'px ' + family;
    ctx.textAlign = options.align || 'left';
    ctx.textBaseline = options.baseline || 'middle';

    var prevAlpha = ctx.globalAlpha;
    if (typeof options.alpha === 'number') {
      ctx.globalAlpha = prevAlpha * options.alpha;
    }

    var content = text === undefined || text === null ? '' : String(text);
    var maxWidth = typeof options.maxWidth === 'number' ? options.maxWidth : undefined;

    if (options.strokeColor && options.strokeWidth) {
      ctx.strokeStyle = options.strokeColor;
      ctx.lineWidth = options.strokeWidth;
      if (maxWidth) {
        ctx.strokeText(content, x, y, maxWidth);
      } else {
        ctx.strokeText(content, x, y);
      }
    }

    ctx.fillStyle = options.color || '#fff';
    if (maxWidth) {
      ctx.fillText(content, x, y, maxWidth);
    } else {
      ctx.fillText(content, x, y);
    }

    ctx.globalAlpha = prevAlpha;
    this.stats.drawCalls += 1;
    return this;
  };

  /** 测量文本宽度（CSS/世界像素同尺度，因变换为纯缩放）。 */
  Renderer.prototype.measureText = function (text, size, weight) {
    var ctx = this.ctx;
    ctx.font = (weight || 'normal') + ' ' + (typeof size === 'number' ? size : 16) +
      'px ' + this.fontFamily;
    return ctx.measureText(String(text === undefined || text === null ? '' : text)).width;
  };

  /**
   * 进度条（敌人血条 / 冷却条 / 经验条辅助）。
   * ratio ∈ [0,1]；bg 为底，fg 为前景，可选 border。
   */
  Renderer.prototype.drawBar = function (x, y, w, h, ratio, bg, fg, border) {
    var ctx = this.ctx;
    var r = typeof ratio === 'number' ? Math.max(0, Math.min(1, ratio)) : 0;
    ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    if (r > 0) {
      ctx.fillStyle = fg || '#8f2f2f';
      ctx.fillRect(x, y, w * r, h);
    }
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    this.stats.drawCalls += 1;
    return this;
  };

  /** 屏幕闪白/闪红等整屏效果（世界坐标铺满）。 */
  Renderer.prototype.fillScreen = function (color) {
    return this.fillRect(0, 0, this.worldWidth, this.worldHeight, color);
  };

  /** 调试信息（实体数/FPS 等，供 qa 走查开关使用）。 */
  Renderer.prototype.drawDebugInfo = function (lines, x, y) {
    var px = typeof x === 'number' ? x : 12;
    var py = typeof y === 'number' ? y : 12;
    var list = Array.isArray(lines) ? lines : [lines];
    for (var i = 0; i < list.length; i += 1) {
      this.drawText(String(list[i]), px, py + i * 18, {
        size: 13,
        color: '#9fe3b6',
        strokeColor: 'rgba(0,0,0,0.7)',
        strokeWidth: 3
      });
    }
    return this;
  };

  Renderer.prototype.destroy = function () {
    if (this._onResize && global && typeof global.removeEventListener === 'function') {
      global.removeEventListener('resize', this._onResize);
      global.removeEventListener('orientationchange', this._onResize);
    }
    this._onResize = null;
  };

  var R = Engine.Renderer || (Engine.Renderer = {});
  R.create = function (canvas, options) {
    return new Renderer(canvas, options);
  };
  R.Renderer = Renderer;
  R.DEFAULT_BACKGROUND = DEFAULT_BG;
  R.DEFAULT_FONT = DEFAULT_FONT;

  WX.Engine.Renderer = R;
})(typeof window !== 'undefined' ? window : this);
