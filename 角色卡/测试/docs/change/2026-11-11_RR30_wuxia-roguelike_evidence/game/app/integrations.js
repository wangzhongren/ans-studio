/**
 * game/app/integrations.js
 * 模块：loop-app · 领域/表现模块适配（挂 WX.App.Integration）
 *
 * 职责：按架构契约 §5.5 的“最小约定”装配领域模块，并对可选扩展方法做存在性适配。
 * 原则：
 *   - 只调用契约公开的方法（create/update/spawnWave/list/reset/render/getState 等）；
 *   - 模块尚未加载时返回 null，由 App 降级运行（不伪造领域逻辑）；
 *   - 不修改任何其他模块文件；接口不一致时在 App 侧做薄适配并记录到 README。
 *
 * 硬约束：经典 IIFE，无 ES Module / fetch / 外部依赖；不操作 DOM。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var App = WX.App || (WX.App = {});

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function num(value, fallback) {
    return isNumber(value) ? value : fallback;
  }

  function resolve(name) {
    return WX && WX[name] ? WX[name] : null;
  }

  /**
   * 按工厂创建领域模块。
   * @param {string} name WX 命名空间名（Player/Combat/Enemies/Progression/Arsenal）
   * @param {object} ctx  App 注入上下文
   * @returns {object|null}
   */
  function createDomain(name, ctx) {
    var ns = resolve(name);
    if (!ns || typeof ns.create !== 'function') { return null; }
    return ns.create(ctx);
  }

  /** UI 为单例：WX.UI.init(viewSource) 绑定；缺省返回 null。 */
  function createUI(viewSource) {
    var ns = resolve('UI');
    if (!ns) { return null; }
    if (typeof ns.init === 'function') {
      ns.init(viewSource);
    }
    return ns;
  }

  /** 通用可选方法调用：不存在返回 undefined，存在返回其返回值。 */
  function callOptional(target, method, arg1, arg2, arg3) {
    if (!target || typeof target[method] !== 'function') { return undefined; }
    return target[method](arg1, arg2, arg3);
  }

  /**
   * 敌人列表适配：优先契约 list()，兼容直接暴露数组的常见形态。
   * @returns {Array}
   */
  function listEnemies(enemies) {
    if (!enemies) { return []; }
    if (typeof enemies.list === 'function') {
      var list = enemies.list();
      return Array.isArray(list) ? list : [];
    }
    if (Array.isArray(enemies.entities)) { return enemies.entities; }
    if (Array.isArray(enemies.enemies)) { return enemies.enemies; }
    if (Array.isArray(enemies)) { return enemies; }
    return [];
  }

  /** 领域模块 update 适配：更新签名只传契约内参数，多余参数由模块自行忽略。 */
  function updateDomain(module, dt, extra) {
    if (!module || typeof module.update !== 'function') { return false; }
    module.update(dt, extra);
    return true;
  }

  /** 领域模块 reset 适配（整局重开）。 */
  function resetDomain(module) {
    if (!module || typeof module.reset !== 'function') { return false; }
    module.reset();
    return true;
  }

  /** 领域模块 render 适配（可选扩展；无则跳过）。 */
  function renderDomain(module, renderer) {
    if (!module || typeof module.render !== 'function') { return false; }
    module.render(renderer);
    return true;
  }

  /**
   * progression.getState() 适配为视图所需字段。
   * 契约 §5.5 只约定 getState 存在，字段由实现决定；缺项目回退到玩家快照/阈值表。
   */
  function progressionState(progression, fallback) {
    var base = fallback || {};
    var state = null;
    if (progression && typeof progression.getState === 'function') {
      state = progression.getState();
    }
    if (!state || typeof state !== 'object') { state = {}; }

    var level = num(state.level, num(base.level, 1));
    var exp = num(state.exp, num(base.exp, 0));
    var expToNext = num(state.expToNext, null);

    return {
      level: level,
      exp: exp,
      expToNext: expToNext,
      modifiers: Array.isArray(state.modifiers) ? state.modifiers : null,
      raw: state
    };
  }

  /**
   * arsenal 背包适配：getInventory() 可能是 id 字符串数组或条目对象数组。
   * @returns {Array<{id:string, entry:object|string}>}
   */
  function inventoryEntries(arsenal) {
    var out = [];
    if (!arsenal || typeof arsenal.getInventory !== 'function') { return out; }
    var inv = arsenal.getInventory();
    if (!Array.isArray(inv)) {
      if (inv && typeof inv === 'object') {
        for (var key in inv) {
          if (Object.prototype.hasOwnProperty.call(inv, key)) {
            out.push({ id: key, entry: inv[key] });
          }
        }
      }
      return out;
    }
    for (var i = 0; i < inv.length; i += 1) {
      var item = inv[i];
      if (typeof item === 'string') {
        out.push({ id: item, entry: item });
      } else if (item && typeof item.id === 'string') {
        out.push({ id: item.id, entry: item });
      }
    }
    return out;
  }

  /** arsenal 若直接提供数组形态 getModifiers()，返回该数组；否则 null。 */
  function arsenalModifiers(arsenal) {
    if (!arsenal || typeof arsenal.getModifiers !== 'function') { return null; }
    var mods = arsenal.getModifiers();
    return Array.isArray(mods) ? mods : null;
  }

  /**
   * arsenal 当前武器 id。
   * 真源优先级：getActiveWeapon().id → getState().activeWeaponId →
   * getWeaponId()/getCurrentWeaponId() → getState().weaponId（旧字段兼容）。
   */
  function arsenalWeaponId(arsenal) {
    if (!arsenal) { return null; }
    if (typeof arsenal.getActiveWeapon === 'function') {
      var weapon = arsenal.getActiveWeapon();
      if (weapon && typeof weapon.id === 'string') { return weapon.id; }
    }
    if (typeof arsenal.getState === 'function') {
      var st = arsenal.getState();
      if (st && typeof st.activeWeaponId === 'string') { return st.activeWeaponId; }
    }
    if (typeof arsenal.getWeaponId === 'function') {
      var id = arsenal.getWeaponId();
      if (typeof id === 'string') { return id; }
    }
    if (typeof arsenal.getCurrentWeaponId === 'function') {
      var id2 = arsenal.getCurrentWeaponId();
      if (typeof id2 === 'string') { return id2; }
    }
    if (typeof arsenal.getState === 'function') {
      var st2 = arsenal.getState();
      if (st2 && typeof st2.weaponId === 'string') { return st2.weaponId; }
    }
    return null;
  }

  App.Integration = {
    resolve: resolve,
    createDomain: createDomain,
    createUI: createUI,
    callOptional: callOptional,
    listEnemies: listEnemies,
    updateDomain: updateDomain,
    resetDomain: resetDomain,
    renderDomain: renderDomain,
    progressionState: progressionState,
    inventoryEntries: inventoryEntries,
    arsenalModifiers: arsenalModifiers,
    arsenalWeaponId: arsenalWeaponId,
    num: num,
    isNumber: isNumber
  };

  WX.App = App;
})(typeof window !== 'undefined' ? window : this);
