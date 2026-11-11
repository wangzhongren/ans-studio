/**
 * game/engine/pool.js
 * 模块：engine-core · 对象池（挂 WX.Engine.Pool）
 *
 * 目的：敌人 / 投射物 / 经验球 / 飘字在数百实体规模下复用对象，
 * 避免主循环内的频繁分配触发 GC 抖动。
 *
 * 用法：
 *   var pool = WX.Engine.Pool.create({
 *     name: 'projectile',
 *     create: function () { return { active: false }; },
 *     reset: function (obj) { obj.active = false; },
 *     initial: 64
 *   });
 *   var obj = pool.acquire();   // 复用或新建
 *   pool.release(obj);          // 归还并 reset
 *   pool.releaseAll();          // 整局重开时批量归还
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});

  function noop() {}

  /**
   * @param {object} [options]
   *   create  () => object        对象工厂（缺省返回 {})
   *   reset   (obj) => void       归还时的复位（缺省 noop）
   *   initial number             预分配数量（默认 0）
   *   max     number             池容量上限（默认 4096；超出则丢弃释放的对象）
   *   onAcquire / onRelease      可选观测回调（调试用）
   */
  function Pool(options) {
    options = options || {};
    this.name = options.name || 'pool';
    this._create = typeof options.create === 'function' ? options.create : function () { return {}; };
    this._reset = typeof options.reset === 'function' ? options.reset : noop;
    this._onAcquire = typeof options.onAcquire === 'function' ? options.onAcquire : null;
    this._onRelease = typeof options.onRelease === 'function' ? options.onRelease : null;
    this._max = typeof options.max === 'number' && options.max > 0 ? options.max : 4096;

    this._free = [];
    this._active = [];
    this.created = 0;

    var initial = typeof options.initial === 'number' ? Math.max(0, options.initial) : 0;
    for (var i = 0; i < initial; i += 1) {
      this._free.push(this._create());
      this.created += 1;
    }
  }

  /** 取一个对象（复用空闲或新建）。 */
  Pool.prototype.acquire = function () {
    var obj;
    if (this._free.length > 0) {
      obj = this._free.pop();
    } else {
      obj = this._create();
      this.created += 1;
    }
    if (this._onAcquire) { this._onAcquire(obj); }
    this._active.push(obj);
    return obj;
  };

  /** 归还对象：调用 reset 后放回空闲栈（重复归还会被忽略）。 */
  Pool.prototype.release = function (obj) {
    if (!obj) { return false; }
    var idx = this._active.indexOf(obj);
    if (idx === -1) { return false; }
    this._active.splice(idx, 1);
    this._reset(obj);
    if (this._onRelease) { this._onRelease(obj); }
    if (this._free.length < this._max) {
      this._free.push(obj);
    } else {
      this.created -= 1;
    }
    return true;
  };

  /** 归还所有活跃对象（整局重置）。 */
  Pool.prototype.releaseAll = function () {
    var count = this._active.length;
    for (var i = count - 1; i >= 0; i -= 1) {
      var obj = this._active.pop();
      this._reset(obj);
      if (this._onRelease) { this._onRelease(obj); }
      if (this._free.length < this._max) {
        this._free.push(obj);
      } else {
        this.created -= 1;
      }
    }
    return count;
  };

  /** 遍历活跃对象（安全：允许回调中 release）。 */
  Pool.prototype.forEachActive = function (fn) {
    var snapshot = this._active.slice();
    for (var i = 0; i < snapshot.length; i += 1) {
      fn(snapshot[i], i);
    }
  };

  Object.defineProperty(Pool.prototype, 'activeCount', {
    get: function () { return this._active.length; }
  });

  Object.defineProperty(Pool.prototype, 'freeCount', {
    get: function () { return this._free.length; }
  });

  Object.defineProperty(Pool.prototype, 'size', {
    get: function () { return this._active.length + this._free.length; }
  });

  /** 当前活跃对象数组（只读用途；不要直接增删）。 */
  Pool.prototype.activeItems = function () {
    return this._active;
  };

  /**
   * 固定容量数组式遍历缓冲：避免 forEach 回调分配。
   * 适合主循环里 update 全部活跃对象。
   */
  Pool.prototype.updateActive = function (dt, updateFn) {
    var list = this._active;
    var i = list.length - 1;
    for (; i >= 0; i -= 1) {
      var item = list[i];
      if (updateFn(item, dt) === false) {
        this.release(item);
      }
    }
  };

  var P = Engine.Pool || (Engine.Pool = {});

  P.create = function (options) {
    return new Pool(options);
  };

  P.Pool = Pool;

  WX.Engine.Pool = P;
})(typeof window !== 'undefined' ? window : this);
