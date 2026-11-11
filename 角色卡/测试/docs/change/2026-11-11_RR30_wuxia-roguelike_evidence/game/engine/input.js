/**
 * game/engine/input.js
 * 模块：engine-core · 键盘 / 指针输入（挂 WX.Engine.Input）
 *
 * 约定：
 *   - 键盘同时按 event.code 与 event.key（小写）登记，isDown('KeyW'|'w'|'ArrowUp') 均可命中；
 *   - pressed / released 为“本帧边沿”，由 loop-app 每帧末调用 endFrame() 清空；
 *   - 移动向量 moveVector() 汇总 WASD 与方向键并归一化；
 *   - 指针坐标同时给出画布 CSS 坐标与世界坐标（世界坐标经 renderer.screenToWorld 映射）；
 *   - 失焦（window.blur）清空按键，避免“卡键”；不抢占输入框内的按键。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});

  /* 常用别名 → 规范键名（小写）。 */
  var ALIASES = {
    esc: 'escape',
    spacebar: ' ',
    space: ' ',
    up: 'arrowup',
    down: 'arrowdown',
    left: 'arrowleft',
    right: 'arrowright',
    enter: 'enter',
    return: 'enter',
    shift: 'shift',
    ctrl: 'control',
    alt: 'alt',
    del: 'delete',
    bs: 'backspace'
  };

  var PREVENT_CODES = {
    ArrowUp: true,
    ArrowDown: true,
    ArrowLeft: true,
    ArrowRight: true,
    Space: true
  };

  function normalizeName(name) {
    if (name === null || name === undefined) { return ''; }
    var n = String(name);
    if (ALIASES[n.toLowerCase()]) { return ALIASES[n.toLowerCase()]; }
    if (n.length === 1) { return n.toLowerCase(); }
    return n.toLowerCase();
  }

  function isTypingTarget(el) {
    if (!el || !el.tagName) { return false; }
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') { return true; }
    if (el.isContentEditable) { return true; }
    return false;
  }

  function Input(options) {
    options = options || {};
    this.target = options.target || global;
    this.canvas = options.canvas || null;
    this.preventDefault = options.preventDefault !== false;
    this.enabled = options.enabled !== false;
    this.screenToWorld = typeof options.screenToWorld === 'function' ? options.screenToWorld : null;

    this.down = Object.create(null);
    this.pressed = Object.create(null);
    this.released = Object.create(null);
    this.focused = true;

    this.pointer = {
      x: 0,
      y: 0,
      localX: 0,
      localY: 0,
      worldX: 0,
      worldY: 0,
      down: false,
      inside: false,
      type: 'mouse'
    };
    this._pointerPressed = false;
    this._pointerReleased = false;

    this._handlers = [];
    this._bind();
  }

  /* ============================ 事件绑定 ============================ */

  Input.prototype._add = function (target, type, handler, opts) {
    if (!target || typeof target.addEventListener !== 'function') { return; }
    target.addEventListener(type, handler, opts || false);
    this._handlers.push({ target: target, type: type, handler: handler, opts: opts || false });
  };

  Input.prototype._bind = function () {
    var self = this;
    var target = this.target || global;

    this._add(target, 'keydown', function (event) {
      if (!self.enabled) { return; }
      if (isTypingTarget(event.target)) { return; }
      self._onKeyDown(event);
    });

    this._add(target, 'keyup', function (event) {
      if (!self.enabled) { return; }
      if (isTypingTarget(event.target)) { return; }
      self._onKeyUp(event);
    });

    this._add(target, 'blur', function () {
      self.focused = false;
      self._clearKeys();
    });

    this._add(target, 'focus', function () {
      self.focused = true;
    });

    var pointerTarget = this.canvas || target;

    this._add(pointerTarget, 'mousemove', function (event) {
      self._updatePointer(event.clientX, event.clientY, 'mouse');
    });

    this._add(pointerTarget, 'mouseenter', function (event) {
      self.pointer.inside = true;
      self._updatePointer(event.clientX, event.clientY, 'mouse');
    });

    this._add(pointerTarget, 'mouseleave', function () {
      self.pointer.inside = false;
    });

    this._add(pointerTarget, 'mousedown', function (event) {
      self._updatePointer(event.clientX, event.clientY, 'mouse');
      self.pointer.down = true;
      self._pointerPressed = true;
    });

    this._add(target, 'mouseup', function (event) {
      if (event && typeof event.clientX === 'number') {
        self._updatePointer(event.clientX, event.clientY, 'mouse');
      }
      self.pointer.down = false;
      self._pointerReleased = true;
    });

    this._add(pointerTarget, 'touchstart', function (event) {
      if (!event.touches || event.touches.length === 0) { return; }
      var t = event.touches[0];
      self._updatePointer(t.clientX, t.clientY, 'touch');
      self.pointer.down = true;
      self._pointerPressed = true;
    }, { passive: true });

    this._add(pointerTarget, 'touchmove', function (event) {
      if (!event.touches || event.touches.length === 0) { return; }
      var t = event.touches[0];
      self._updatePointer(t.clientX, t.clientY, 'touch');
    }, { passive: true });

    this._add(pointerTarget, 'touchend', function () {
      self.pointer.down = false;
      self._pointerReleased = true;
    }, { passive: true });
  };

  /* ============================ 键盘 ============================ */

  Input.prototype._onKeyDown = function (event) {
    var code = event.code;
    var key = event.key;

    if (this.preventDefault && code && PREVENT_CODES[code]) {
      event.preventDefault();
    }
    if (this.preventDefault && code === 'Space') {
      event.preventDefault();
    }

    var canonical = normalizeName(key);
    var codeName = code ? String(code).toLowerCase() : '';

    if (code) { this.down[code] = true; }
    if (codeName) { this.down[codeName] = true; }
    if (key) { this.down[key.toLowerCase()] = true; }
    if (canonical) { this.down[canonical] = true; }

    if (!event.repeat) {
      if (code) { this.pressed[code] = true; }
      if (codeName) { this.pressed[codeName] = true; }
      if (key) { this.pressed[key.toLowerCase()] = true; }
      if (canonical) { this.pressed[canonical] = true; }
    }
  };

  Input.prototype._onKeyUp = function (event) {
    var code = event.code;
    var key = event.key;
    var canonical = normalizeName(key);
    var codeName = code ? String(code).toLowerCase() : '';

    if (code) { delete this.down[code]; }
    if (codeName) { delete this.down[codeName]; }
    if (key) { delete this.down[key.toLowerCase()]; }
    if (canonical) { delete this.down[canonical]; }

    if (code) { this.released[code] = true; }
    if (canonical) { this.released[canonical] = true; }
  };

  Input.prototype._clearKeys = function () {
    this.down = Object.create(null);
    this.pressed = Object.create(null);
    this.released = Object.create(null);
  };

  /* ============================ 查询 ============================ */

  /** 某键当前是否按下；接受 'KeyW' / 'w' / 'ArrowUp' / 'up' / 'Esc' 等。 */
  Input.prototype.isDown = function (name) {
    var n = normalizeName(name);
    if (n && this.down[n]) { return true; }
    if (typeof name === 'string') {
      if (this.down[name]) { return true; }
      if (this.down[name.toLowerCase()]) { return true; }
    }
    return false;
  };

  /** 本帧是否刚按下。 */
  Input.prototype.wasPressed = function (name) {
    var n = normalizeName(name);
    if (n && this.pressed[n]) { return true; }
    if (typeof name === 'string') {
      if (this.pressed[name]) { return true; }
      if (this.pressed[name.toLowerCase()]) { return true; }
    }
    return false;
  };

  /** 本帧是否刚松开。 */
  Input.prototype.wasReleased = function (name) {
    var n = normalizeName(name);
    if (n && this.released[n]) { return true; }
    if (typeof name === 'string') {
      if (this.released[name]) { return true; }
      if (this.released[name.toLowerCase()]) { return true; }
    }
    return false;
  };

  /** 消费一次“刚按下”，后续同帧查询不再命中（UI/App 防重复触发）。 */
  Input.prototype.consumePressed = function (name) {
    if (!this.wasPressed(name)) { return false; }
    var n = normalizeName(name);
    delete this.pressed[n];
    if (typeof name === 'string') {
      delete this.pressed[name];
      delete this.pressed[name.toLowerCase()];
    }
    return true;
  };

  /** 任一键“刚按下”。 */
  Input.prototype.anyPressed = function () {
    for (var k in this.pressed) {
      if (Object.prototype.hasOwnProperty.call(this.pressed, k)) { return true; }
    }
    return false;
  };

  /** 本帧刚按下的键名列表（调试/快捷键用）。 */
  Input.prototype.pressedKeys = function () {
    var out = [];
    for (var k in this.pressed) {
      if (Object.prototype.hasOwnProperty.call(this.pressed, k)) { out.push(k); }
    }
    return out;
  };

  /**
   * 移动轴：WASD / 方向键，返回归一化向量 {x, y}（对角线不加速）。
   * x 右为正、y 下为正（与 Canvas 世界坐标一致）。
   */
  Input.prototype.moveVector = function () {
    var x = 0;
    var y = 0;
    if (this.isDown('a') || this.isDown('arrowleft')) { x -= 1; }
    if (this.isDown('d') || this.isDown('arrowright')) { x += 1; }
    if (this.isDown('w') || this.isDown('arrowup')) { y -= 1; }
    if (this.isDown('s') || this.isDown('arrowdown')) { y += 1; }
    if (x !== 0 && y !== 0) {
      var inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x: x, y: y };
  };

  /* ============================ 指针 ============================ */

  Input.prototype._updatePointer = function (clientX, clientY, type) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') { return; }
    this.pointer.x = clientX;
    this.pointer.y = clientY;
    this.pointer.type = type || 'mouse';
    if (this.canvas && typeof this.canvas.getBoundingClientRect === 'function') {
      var rect = this.canvas.getBoundingClientRect();
      this.pointer.localX = clientX - rect.left;
      this.pointer.localY = clientY - rect.top;
      this.pointer.inside = clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom;
    }
    if (this.screenToWorld) {
      var worldPos = this.screenToWorld(clientX, clientY);
      if (worldPos) {
        this.pointer.worldX = worldPos.x;
        this.pointer.worldY = worldPos.y;
      }
    }
  };

  /** 设置世界坐标映射（renderer 就绪后注入）。 */
  Input.prototype.setScreenToWorld = function (mapper) {
    this.screenToWorld = typeof mapper === 'function' ? mapper : null;
    return this;
  };

  Input.prototype.isPointerDown = function () {
    return this.pointer.down;
  };

  Input.prototype.pointerPressed = function () {
    return this._pointerPressed;
  };

  Input.prototype.pointerReleased = function () {
    return this._pointerReleased;
  };

  /* ============================ 帧边界 / 生命周期 ============================ */

  /**
   * 每帧末调用：清空边沿状态（pressed/released/指针 pressed）。
   * loop-app 应在世界更新与渲染之后调用一次。
   */
  Input.prototype.endFrame = function () {
    this.pressed = Object.create(null);
    this.released = Object.create(null);
    this._pointerPressed = false;
    this._pointerReleased = false;
    return this;
  };

  /**
   * 只读帧快照（App 每逻辑步取一次）。
   * down/pressed/released 为内部表的引用，调用方**只读**，不得增删改。
   */
  Input.prototype.getSnapshot = function () {
    var move = this.moveVector();
    return {
      down: this.down,
      pressed: this.pressed,
      released: this.released,
      move: move,
      pointer: {
        x: this.pointer.x,
        y: this.pointer.y,
        localX: this.pointer.localX,
        localY: this.pointer.localY,
        worldX: this.pointer.worldX,
        worldY: this.pointer.worldY,
        down: this.pointer.down,
        inside: this.pointer.inside,
        type: this.pointer.type
      },
      focused: this.focused
    };
  };

  /** 启用/停用输入采集（升级面板/暂停时可由 App 控制）。 */
  Input.prototype.setEnabled = function (enabled) {
    this.enabled = !!enabled;
    if (!enabled) { this._clearKeys(); }
    return this;
  };

  Input.prototype.destroy = function () {
    for (var i = 0; i < this._handlers.length; i += 1) {
      var h = this._handlers[i];
      if (h.target && typeof h.target.removeEventListener === 'function') {
        h.target.removeEventListener(h.type, h.handler, h.opts);
      }
    }
    this._handlers.length = 0;
    this._clearKeys();
  };

  var I = Engine.Input || (Engine.Input = {});
  I.create = function (options) {
    return new Input(options);
  };
  I.Input = Input;
  I.normalizeName = normalizeName;

  WX.Engine.Input = I;
})(typeof window !== 'undefined' ? window : this);
