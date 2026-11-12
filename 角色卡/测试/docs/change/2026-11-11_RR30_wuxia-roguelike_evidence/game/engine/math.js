/**
 * game/engine/math.js
 * 模块：engine-core · 数学工具（挂 WX.Engine.Math）
 *
 * 内容：clamp / lerp / 向量与角度 / 角度归一化 / 距离与方向 / 可复现随机数。
 * 全部为纯函数或纯工厂，不改动全局状态；不依赖 Config 与其他模块。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});
  var M = Engine.Math || (Engine.Math = {});

  var TAU = Math.PI * 2;

  /* ---------------------------- 标量 ---------------------------- */

  M.TAU = TAU;
  M.PI = Math.PI;
  M.EPSILON = 1e-6;

  M.clamp = function (value, min, max) {
    if (value < min) { return min; }
    if (value > max) { return max; }
    return value;
  };

  M.clamp01 = function (value) {
    return M.clamp(value, 0, 1);
  };

  M.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  M.invLerp = function (a, b, value) {
    if (a === b) { return 0; }
    return (value - a) / (b - a);
  };

  M.mapRange = function (value, inMin, inMax, outMin, outMax) {
    if (inMin === inMax) { return outMin; }
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  };

  M.smoothstep = function (t) {
    t = M.clamp01(t);
    return t * t * (3 - 2 * t);
  };

  M.sign = function (value) {
    return value > 0 ? 1 : (value < 0 ? -1 : 0);
  };

  M.approach = function (current, target, step) {
    if (current < target) { return Math.min(current + step, target); }
    if (current > target) { return Math.max(current - step, target); }
    return target;
  };

  /** 与帧率无关的指数逼近（damping）；dt 为秒，rate 越大越快。 */
  M.damp = function (current, target, rate, dt) {
    var t = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
    return current + (target - current) * t;
  };

  M.roundTo = function (value, digits) {
    var p = Math.pow(10, digits || 0);
    return Math.round(value * p) / p;
  };

  M.approx = function (a, b, epsilon) {
    return Math.abs(a - b) <= (typeof epsilon === 'number' ? epsilon : M.EPSILON);
  };

  /* ---------------------------- 角度 ---------------------------- */

  M.degToRad = function (deg) {
    return deg * Math.PI / 180;
  };

  M.radToDeg = function (rad) {
    return rad * 180 / Math.PI;
  };

  /** 归一化到 [-PI, PI)。 */
  M.normalizeAngle = function (rad) {
    var a = (rad + Math.PI) % TAU;
    if (a < 0) { a += TAU; }
    return a - Math.PI;
  };

  /** 归一化到 [0, TAU)。 */
  M.normalizeAnglePositive = function (rad) {
    var a = rad % TAU;
    return a < 0 ? a + TAU : a;
  };

  /** 最短角差，结果在 [-PI, PI)。 */
  M.angleDiff = function (from, to) {
    return M.normalizeAngle(to - from);
  };

  M.angleLerp = function (from, to, t) {
    return M.normalizeAngle(from + M.angleDiff(from, to) * t);
  };

  /** 以固定步长把角度转向目标（弧度）。 */
  M.angleApproach = function (current, target, step) {
    return M.normalizeAngle(current + M.clamp(M.angleDiff(current, target), -step, step));
  };

  /* ---------------------------- 向量 ---------------------------- */

  M.vec = function (x, y) {
    return { x: x || 0, y: y || 0 };
  };

  M.length = function (x, y) {
    return Math.sqrt(x * x + y * y);
  };

  M.lengthSq = function (x, y) {
    return x * x + y * y;
  };

  M.distance = function (ax, ay, bx, by) {
    return M.length(bx - ax, by - ay);
  };

  M.distanceSq = function (ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    return dx * dx + dy * dy;
  };

  /** 归一化；零向量返回 {x:0,y:0}。 */
  M.normalizeVec = function (x, y) {
    var len = M.length(x, y);
    if (len < M.EPSILON) { return { x: 0, y: 0 }; }
    return { x: x / len, y: y / len };
  };

  M.angleOf = function (x, y) {
    return Math.atan2(y, x);
  };

  /** 从 from 指向 to 的单位向量。 */
  M.direction = function (fromX, fromY, toX, toY) {
    return M.normalizeVec(toX - fromX, toY - fromY);
  };

  /** 按速度把点朝目标推进（不超过目标）。返回新坐标。 */
  M.moveTowards = function (fromX, fromY, toX, toY, maxStep) {
    var dx = toX - fromX;
    var dy = toY - fromY;
    var dist = M.length(dx, dy);
    if (dist <= maxStep || dist < M.EPSILON) {
      return { x: toX, y: toY };
    }
    return { x: fromX + (dx / dist) * maxStep, y: fromY + (dy / dist) * maxStep };
  };

  /** 把点限制在 [minX,minX+width] x [minY,minY+height] 的矩形内。 */
  M.clampToRect = function (x, y, width, height, radius) {
    var r = typeof radius === 'number' ? radius : 0;
    return {
      x: M.clamp(x, r, width - r),
      y: M.clamp(y, r, height - r)
    };
  };

  /** 极坐标转直角坐标（angle 弧度）。 */
  M.fromAngle = function (angle, length) {
    var len = typeof length === 'number' ? length : 1;
    return { x: Math.cos(angle) * len, y: Math.sin(angle) * len };
  };

  /* ---------------------------- 可复现随机数 ---------------------------- */

  /**
   * 带种子的确定性 PRNG（mulberry32）。
   * 返回 { seed, next(), float(min,max), int(min,max), chance(p), pick(list),
   *        weighted(list, getWeight), shuffle(list) }。
   * 无副作用、不碰 Math.random；同种子同序列，便于复现与验收。
   */
  M.createRandom = function (seed) {
    var state = (typeof seed === 'number' ? seed : 0x9e3779b9) >>> 0;
    if (state === 0) { state = 0x1a2b3c4d; }

    function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    var rng = {
      seed: state,
      next: next,

      /** 浮点区间 [min, max)。 */
      float: function (min, max) {
        if (typeof min !== 'number') { return next(); }
        var hi = typeof max === 'number' ? max : min;
        var lo = typeof max === 'number' ? min : 0;
        return lo + next() * (hi - lo);
      },

      /** 整数区间 [min, max] 闭区间。 */
      int: function (min, max) {
        var lo = Math.ceil(typeof min === 'number' ? min : 0);
        var hi = Math.floor(typeof max === 'number' ? max : lo);
        if (hi < lo) { return lo; }
        return lo + Math.floor(next() * (hi - lo + 1));
      },

      /** 概率判定：p ∈ [0,1]。 */
      chance: function (p) {
        if (!(p > 0)) { return false; }
        if (p >= 1) { return true; }
        return next() < p;
      },

      /** 等概率取一项；空数组返回 null。 */
      pick: function (list) {
        if (!list || list.length === 0) { return null; }
        return list[Math.floor(next() * list.length)];
      },

      /**
       * 权重抽取。getWeight 可为函数 (item) => number，或字符串键名。
       * 全零/空表返回 null。
       */
      weighted: function (list, getWeight) {
        if (!list || list.length === 0) { return null; }
        var weightOf = typeof getWeight === 'function'
          ? getWeight
          : function (item) { return item && typeof item.weight === 'number' ? item.weight : 1; };
        var total = 0;
        var i;
        for (i = 0; i < list.length; i += 1) {
          var w = weightOf(list[i], i);
          if (w > 0) { total += w; }
        }
        if (total <= 0) { return null; }
        var roll = next() * total;
        for (i = 0; i < list.length; i += 1) {
          var itemWeight = weightOf(list[i], i);
          if (itemWeight <= 0) { continue; }
          roll -= itemWeight;
          if (roll < 0) { return list[i]; }
        }
        return list[list.length - 1];
      },

      /** 原地 Fisher-Yates 洗牌并返回同一数组；传 copy=true 返回新数组。 */
      shuffle: function (list, copy) {
        if (!list) { return list; }
        var arr = copy ? list.slice() : list;
        for (var i = arr.length - 1; i > 0; i -= 1) {
          var j = Math.floor(next() * (i + 1));
          var tmp = arr[i];
          arr[i] = arr[j];
          arr[j] = tmp;
        }
        return arr;
      }
    };

    return rng;
  };

  /** 全局默认随机源（种子来自 Date.now，仅用于表现层抖动；逻辑请用 createRandom 自持实例）。 */
  var defaultRng = M.createRandom((Date.now() & 0x7fffffff) || 1);
  M.random = defaultRng;
  M.rand = function (min, max) {
    return defaultRng.float(min, max);
  };
})(typeof window !== 'undefined' ? window : this);
