/**
 * game/engine/collision.js
 * 模块：engine-core · 碰撞与空间查询（挂 WX.Engine.Collision）
 *
 * 实体约定：{ x, y, radius }（也接受 {x, y, r}）；矩形接受
 *   { x, y, width, height } 或 { x, y, w, h }（x/y 为左上角）。
 * 只做纯计算，不修改入参；解决重叠的分离量以返回值给出，由调用方决定是否应用。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var Engine = WX.Engine || (WX.Engine = {});
  var C = Engine.Collision || (Engine.Collision = {});
  var M = Engine.Math || (Engine.Math = {});

  function radiusOf(entity) {
    if (!entity) { return 0; }
    if (typeof entity.radius === 'number') { return entity.radius; }
    if (typeof entity.r === 'number') { return entity.r; }
    return 0;
  }

  function rectOf(rect) {
    if (!rect) { return { x: 0, y: 0, width: 0, height: 0 }; }
    return {
      x: typeof rect.x === 'number' ? rect.x : 0,
      y: typeof rect.y === 'number' ? rect.y : 0,
      width: typeof rect.width === 'number' ? rect.width : (rect.w || 0),
      height: typeof rect.height === 'number' ? rect.height : (rect.h || 0)
    };
  }

  C.radiusOf = radiusOf;

  /* ---------------------------- 基础检测 ---------------------------- */

  /** 圆-圆相交（相切算相交）。 */
  C.circleCircle = function (a, b) {
    var ra = radiusOf(a);
    var rb = radiusOf(b);
    var reach = ra + rb;
    return M.distanceSq(a.x, a.y, b.x, b.y) <= reach * reach;
  };

  /** 圆是否包含点。 */
  C.circlePoint = function (circle, px, py) {
    var r = radiusOf(circle);
    return M.distanceSq(circle.x, circle.y, px, py) <= r * r;
  };

  /** 点是否在矩形内（含边界）。 */
  C.pointInRect = function (px, py, rect) {
    var r = rectOf(rect);
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
  };

  /** AABB 相交（含边界）。 */
  C.rectRect = function (a, b) {
    var ra = rectOf(a);
    var rb = rectOf(b);
    return ra.x <= rb.x + rb.width &&
      ra.x + ra.width >= rb.x &&
      ra.y <= rb.y + rb.height &&
      ra.y + ra.height >= rb.y;
  };

  /** 圆-矩形相交：最近点法。 */
  C.circleRect = function (circle, rect) {
    var r = rectOf(rect);
    var cr = radiusOf(circle);
    var nearestX = M.clamp(circle.x, r.x, r.x + r.width);
    var nearestY = M.clamp(circle.y, r.y, r.y + r.height);
    return M.distanceSq(circle.x, circle.y, nearestX, nearestY) <= cr * cr;
  };

  C.circleAABB = C.circleRect;

  /* ---------------------------- 分离与解算 ---------------------------- */

  /**
   * 计算两圆重叠时的分离向量（把 a 推离 b）。
   * 返回 { overlap, x, y }（x/y 为单位方向），无重叠返回 null。
   */
  C.separationCircleCircle = function (a, b) {
    var ra = radiusOf(a);
    var rb = radiusOf(b);
    var reach = ra + rb;
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    var distSq = dx * dx + dy * dy;
    if (distSq >= reach * reach) { return null; }

    var dist = Math.sqrt(distSq);
    if (dist < M.EPSILON) {
      /* 完全重合：给一个确定性的水平分离，避免除零与抖动。 */
      return { overlap: reach, x: 1, y: 0 };
    }
    return {
      overlap: reach - dist,
      x: dx / dist,
      y: dy / dist
    };
  };

  /**
   * 把圆推出矩形（交互墙体/世界边界用）。返回 { overlap, x, y }，无重叠返回 null。
   */
  C.separationCircleRect = function (circle, rect) {
    var r = rectOf(rect);
    var cr = radiusOf(circle);
    var nearestX = M.clamp(circle.x, r.x, r.x + r.width);
    var nearestY = M.clamp(circle.y, r.y, r.y + r.height);
    var dx = circle.x - nearestX;
    var dy = circle.y - nearestY;
    var distSq = dx * dx + dy * dy;

    if (distSq > cr * cr) { return null; }

    var dist = Math.sqrt(distSq);
    if (dist < M.EPSILON) {
      /* 圆心在矩形内：沿最近边推出。 */
      var left = circle.x - r.x;
      var right = r.x + r.width - circle.x;
      var top = circle.y - r.y;
      var bottom = r.y + r.height - circle.y;
      var min = Math.min(left, right, top, bottom);
      if (min === left) { return { overlap: cr + left, x: -1, y: 0 }; }
      if (min === right) { return { overlap: cr + right, x: 1, y: 0 }; }
      if (min === top) { return { overlap: cr + top, x: 0, y: -1 }; }
      return { overlap: cr + bottom, x: 0, y: 1 };
    }
    return {
      overlap: cr - dist,
      x: dx / dist,
      y: dy / dist
    };
  };

  /**
   * 把实体限制在世界矩形内（考虑半径）。返回新坐标 {x, y}，不改入参。
   */
  C.clampToWorld = function (entity, worldWidth, worldHeight, margin) {
    var r = radiusOf(entity) + (typeof margin === 'number' ? margin : 0);
    return {
      x: M.clamp(entity.x, r, worldWidth - r),
      y: M.clamp(entity.y, r, worldHeight - r)
    };
  };

  /* ---------------------------- 广域查询 ---------------------------- */

  /** 距离平方（实体到点）。 */
  C.distanceSqTo = function (entity, px, py) {
    return M.distanceSq(entity.x, entity.y, px, py);
  };

  /**
   * 查询与圆相交的实体列表（圆-圆）。
   * @returns {Array} 命中的实体引用（不复制实体）。
   */
  C.queryCircle = function (entities, x, y, radius, filter) {
    var hits = [];
    if (!entities) { return hits; }
    for (var i = 0; i < entities.length; i += 1) {
      var e = entities[i];
      if (!e) { continue; }
      if (filter && !filter(e)) { continue; }
      var reach = radius + radiusOf(e);
      if (M.distanceSq(x, y, e.x, e.y) <= reach * reach) {
        hits.push(e);
      }
    }
    return hits;
  };

  /**
   * 范围内最近目标查询（combat 自动索敌用）。
   * @param {Array} entities 候选实体
   * @param {number} x,y 源点
   * @param {number} maxRange 最大距离（含）
   * @param {Function} [filter] 返回 false 的实体跳过
   * @returns {{target:object, distance:number}|null}
   */
  C.nearest = function (entities, x, y, maxRange, filter) {
    if (!entities || entities.length === 0) { return null; }
    var best = null;
    var bestSq = maxRange * maxRange;
    for (var i = 0; i < entities.length; i += 1) {
      var e = entities[i];
      if (!e) { continue; }
      if (filter && !filter(e)) { continue; }
      var dsq = M.distanceSq(x, y, e.x, e.y);
      if (dsq <= bestSq) {
        bestSq = dsq;
        best = e;
      }
    }
    if (!best) { return null; }
    return { target: best, distance: Math.sqrt(bestSq) };
  };

  /**
   * 扇形（近身横扫）内目标检测。
   * @param {object} origin {x, y}
   * @param {number} facing 朝向弧度
   * @param {number} arcRad 扇形总张角（弧度；>= 2*PI 视为全向，<= 0 视为无角度限制）
   * @param {number} range 半径
   * @param {object} target {x, y, radius}
   */
  C.inSector = function (origin, facing, arcRad, range, target) {
    var dx = target.x - origin.x;
    var dy = target.y - origin.y;
    var distSq = dx * dx + dy * dy;
    var reach = range + radiusOf(target);
    if (distSq > reach * reach) { return false; }
    if (arcRad >= M.TAU - M.EPSILON || arcRad <= 0) { return true; }
    /* 目标半径带来的角度余量：贴近原点的目标按距离容差放宽。 */
    var dist = Math.sqrt(distSq);
    var angle = Math.atan2(dy, dx);
    var diff = Math.abs(M.normalizeAngle(angle - facing));
    var halfArc = arcRad / 2;
    if (dist > M.EPSILON) {
      var angularSlack = Math.atan2(radiusOf(target), dist);
      return diff <= halfArc + angularSlack;
    }
    return true;
  };

  /**
   * 扇形内最近 targets 列表（按距离升序，最多 limit 个）。
   * 供 combat 的 sweep 武器按 maxTargets 取目标。
   */
  C.sectorTargets = function (entities, origin, facing, arcRad, range, limit, filter) {
    var hits = [];
    if (!entities) { return hits; }
    for (var i = 0; i < entities.length; i += 1) {
      var e = entities[i];
      if (!e) { continue; }
      if (filter && !filter(e)) { continue; }
      if (C.inSector(origin, facing, arcRad, range, e)) {
        hits.push({ entity: e, distanceSq: M.distanceSq(origin.x, origin.y, e.x, e.y) });
      }
    }
    hits.sort(function (a, b) { return a.distanceSq - b.distanceSq; });
    var out = [];
    var max = typeof limit === 'number' && limit > 0 ? limit : hits.length;
    for (var j = 0; j < hits.length && j < max; j += 1) {
      out.push(hits[j].entity);
    }
    return out;
  };

  /** 距离内最近目标的方位角（无目标返回 facing 原值）。 */
  C.angleTo = function (origin, target) {
    return Math.atan2(target.y - origin.y, target.x - origin.x);
  };
})(typeof window !== 'undefined' ? window : this);
