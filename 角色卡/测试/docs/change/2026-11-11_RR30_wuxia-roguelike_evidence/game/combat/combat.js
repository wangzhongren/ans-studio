/**
 * game/combat/combat.js
 * 模块：combat（自动战斗：自动索敌 / 冷却 / 范围伤害 / 命中反馈与伤害结算）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责（架构契约 §3）：
 *   - 自动索敌：nearest-in-range（武器 range 经 range 修饰器缩放），无目标不出手；
 *   - 冷却：按武器 cooldownSec（经 attackCooldown 修饰器缩放）自动出手；
 *       · sweep：以最近目标方向为轴心的扇形（arcDeg / maxTargets）；
 *       · projectile：生成飞刃投射物（speed / radius / pierce / lifetimeSec）；
 *   - 伤害结算：基础 damage + damage 修饰器，按 critChance / critMultiplier 暴击；
 *     伤害**只经** `ctx.applyDamage(enemy, amount)`（架构契约 §5.5 冻结）；
 *   - 命中反馈：hitFlashSec 命中闪光 + 挥砍扇形/飞刃轨迹，供 UI 与玩家感知；
 *   - 击退：经可选 `ctx.applyKnockback(enemy, dx, dy, force)`（或 enemy 自带的
 *     applyKnockback/applyImpulse）转交，本模块不直接改写敌人状态。
 *
 * 契约（架构契约 §5.5）：
 *   WX.Combat.create(ctx) -> { update(dt, entities), getWeaponState() }
 *   本模块按“最小约定”补充：setWeapons / addWeapon / setWeapon / reset / render。
 *
 * 事件（架构契约 §5.4）：本模块**不发送任何事件**。`enemy:killed` 由 enemies 模块
 * 在敌人死亡时发送、`enemy` 的死亡判定归 enemies/App；combat 只在伤害结算后停止
 * 把已死亡实体当作目标，不重复发击杀、不新增未登记事件。
 *
 * 依赖（架构契约 §4）：只读 WX.Config 与 WX.Engine（Collision/Math/Renderer 公开 API）；
 * 不引用 enemies / player / progression / arsenal 等模块，玩家与敌人实体均由 App 注入。
 *
 * 硬约束：经典 <script> + IIFE，挂载 window.WX.Combat；无 ES Module、无 fetch/XHR、
 * 无外部资源、无构建链。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var CombatNS = WX.Combat || (WX.Combat = {});

  var VERSION = '1.0.0';
  var EPSILON = 1e-6;
  var TAU = Math.PI * 2;

  /* 以下兜底值仅在 WX.Config 缺失/字段非法时生效；正常路径一律读 Config。 */
  var FALLBACK = {
    critChance: 0.05,
    critMultiplier: 1.8,
    hitFlashSec: 0.12,
    playerRadius: 15,
    worldWidth: 1280,
    worldHeight: 720,
    maxStepSec: 0.1,
    weaponDamage: 10,
    weaponCooldownSec: 0.6,
    weaponRange: 150,
    projectileSpeed: 360,
    projectileRadius: 6,
    projectilePierce: 1,
    projectileLifetimeSec: 1.0
  };

  /* 表现层常量（配色、挥砍残影时长、投射物离场余量），不属于平衡数值。 */
  var COLORS = {
    slashFill: 'rgba(236, 228, 200, 0.28)',
    slashStroke: 'rgba(255, 248, 228, 0.9)',
    hit: 'rgba(255, 244, 214, 0.95)',
    hitFlash: '#fff6dc',
    crit: 'rgba(255, 196, 92, 0.95)',
    critFlash: '#ffd27a',
    blade: '#eae2c8',
    bladeGlow: 'rgba(230, 240, 220, 0.22)',
    bladeTrail: 'rgba(220, 235, 220, 0.5)'
  };
  var SLASH_SEC = 0.16;
  var PROJECTILE_MARGIN = 64;
  var MIN_COOLDOWN_SEC = 0.05; /* 防止零/负冷却导致每帧无限出手的守卫值 */

  /* ============================ 基础工具 ============================ */

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function num(value, fallback) {
    return isNumber(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    if (value < min) { return min; }
    if (value > max) { return max; }
    return value;
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function radiusOf(entity) {
    if (!entity) { return 0; }
    if (isNumber(entity.radius)) { return entity.radius; }
    if (isNumber(entity.r)) { return entity.r; }
    return 0;
  }

  function normalizeAngle(rad) {
    var a = (rad + Math.PI) % TAU;
    if (a < 0) { a += TAU; }
    return a - Math.PI;
  }

  /* ============================ 配置读取 ============================ */

  function readConfig() {
    var cfg = WX.Config || {};
    var balance = cfg.balance || {};
    var playerCfg = balance.player || {};
    var combatCfg = balance.combat || {};
    var worldCfg = balance.world || {};
    var loopCfg = balance.loop || {};

    var maxStep = num(loopCfg.maxDeltaSec, FALLBACK.maxStepSec);
    if (!(maxStep > 0)) { maxStep = FALLBACK.maxStepSec; }

    return {
      weapons: Array.isArray(cfg.weapons) ? cfg.weapons : [],
      startWeaponId: typeof playerCfg.startWeaponId === 'string' ? playerCfg.startWeaponId : null,
      critChance: Math.max(0, num(playerCfg.critChance, FALLBACK.critChance)),
      critMultiplier: Math.max(1, num(playerCfg.critMultiplier, FALLBACK.critMultiplier)),
      hitFlashSec: Math.max(0, num(combatCfg.hitFlashSec, FALLBACK.hitFlashSec)),
      targetMode: combatCfg.targetMode || 'nearest-in-range',
      worldWidth: Math.max(1, num(worldCfg.width, FALLBACK.worldWidth)),
      worldHeight: Math.max(1, num(worldCfg.height, FALLBACK.worldHeight)),
      playerRadius: Math.max(1, num(playerCfg.radius, FALLBACK.playerRadius)),
      maxStepSec: maxStep
    };
  }

  /* ============================ 属性修饰器 ============================ */

  /**
   * 归一化强化/道具修饰器，返回 combat 消费的聚合值：
   *   { damageAdd, damageMul, cooldownMul, rangeMul, critAdd, critMul }
   *
   * 支持与 WX.Config.upgrades[].modifiers 同构的数组，或聚合对象：
   *   [{ stat: 'damage', op: 'add', value: 6 }]
   *   { damage: 6, attackCooldown: 0.88, range: 1.15, critChance: 0.1 }
   *
   * 其余 stat（maxHp / moveSpeed / damageTaken / expGain ...）由 player/App 消费，忽略。
   */
  function normalizeModifiers(source) {
    var out = {
      damageAdd: 0,
      damageMul: 1,
      cooldownMul: 1,
      rangeMul: 1,
      critAdd: 0,
      critMul: 1
    };
    if (!source) { return out; }

    function apply(stat, op, value) {
      if (typeof stat !== 'string' || !isNumber(value)) { return; }
      var mul = op === 'mul';
      if (stat === 'damage') {
        if (mul) { out.damageMul *= value; } else { out.damageAdd += value; }
        return;
      }
      if (stat === 'attackCooldown') {
        if (mul) { out.cooldownMul *= value; } else { out.cooldownMul += value; }
        return;
      }
      if (stat === 'range') {
        if (mul) { out.rangeMul *= value; } else { out.rangeMul += value; }
        return;
      }
      if (stat === 'critChance') {
        if (mul) { out.critMul *= value; } else { out.critAdd += value; }
      }
    }

    if (Array.isArray(source)) {
      for (var i = 0; i < source.length; i += 1) {
        var entry = source[i];
        if (!entry) { continue; }
        apply(entry.stat, entry.op, entry.value);
      }
      return out;
    }

    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) { continue; }
      var val = source[key];
      if (isNumber(val)) {
        /* 聚合总数：damage/critChance 默认加算，其余默认乘算。 */
        apply(key, (key === 'damage' || key === 'critChance') ? 'add' : 'mul', val);
      } else if (val && typeof val === 'object') {
        apply(key, val.op, val.value);
      }
    }
    return out;
  }

  /* ============================ 武器定义 ============================ */

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function normalizeWeaponDef(source, fallbackId) {
    if (!source || typeof source !== 'object') { return null; }
    var id = typeof source.id === 'string' ? source.id : fallbackId;
    if (typeof id !== 'string' || id === '') { return null; }

    var projectile = null;
    if (source.projectile && typeof source.projectile === 'object') {
      projectile = {
        speed: Math.max(1, num(source.projectile.speed, FALLBACK.projectileSpeed)),
        radius: Math.max(1, num(source.projectile.radius, FALLBACK.projectileRadius)),
        pierce: Math.max(1, Math.floor(num(source.projectile.pierce, FALLBACK.projectilePierce))),
        lifetimeSec: Math.max(0.05,
          num(source.projectile.lifetimeSec, FALLBACK.projectileLifetimeSec))
      };
    }

    return {
      id: id,
      name: typeof source.name === 'string' ? source.name : id,
      kind: source.kind === 'projectile' ? 'projectile' : 'sweep',
      damage: Math.max(0, num(source.damage, FALLBACK.weaponDamage)),
      cooldownSec: Math.max(MIN_COOLDOWN_SEC,
        num(source.cooldownSec, FALLBACK.weaponCooldownSec)),
      range: Math.max(1, num(source.range, FALLBACK.weaponRange)),
      arcDeg: Math.max(0, num(source.arcDeg, 0)),
      maxTargets: Math.max(1, Math.floor(num(source.maxTargets, 1))),
      knockback: Math.max(0, num(source.knockback, 0)),
      projectile: projectile
    };
  }

  /* ============================ 工厂 ============================ */

  /**
   * 创建自动战斗实例。
   * @param {object} [ctx] loop-app 注入的上下文（可选字段）：
   *   applyDamage(enemy, amount)           **契约必需**：唯一的伤害结算入口；
   *   applyKnockback(enemy, dx, dy, force) 可选击退通道（也可由 enemy.applyKnockback 提供）；
   *   player / getPlayer()                玩家实例（提供 getState()）或状态对象；
   *   playerState                         可直接注入的玩家只读快照；
   *   getPlayerModifiers(player) / getModifiers(player)
   *                                       可选修饰器提供者，每步调用；
   *   seed                                可选随机种子（暴击判定可复现）。
   * @returns {object} { update, getWeaponState, setWeapons, addWeapon, setWeapon, reset, render }
   */
  function createCombat(ctx) {
    ctx = ctx || {};

    var cfg = readConfig();
    var MathLib = WX.Engine && WX.Engine.Math;
    var rng = MathLib && typeof MathLib.createRandom === 'function'
      ? MathLib.createRandom(isNumber(ctx.seed) ? ctx.seed : (Date.now() & 0x7fffffff))
      : null;

    var weapons = [];
    var activeId = null;
    var projectiles = [];
    var effects = [];
    var modifiers = normalizeModifiers(null);
    var elapsed = 0;

    var combat = {};
    combat.version = VERSION;

    /* ---------------------------- 内部：实体与玩家 ---------------------------- */

    function isTargetable(entity) {
      if (!entity) { return false; }
      if (entity.dead === true || entity.alive === false || entity.active === false) { return false; }
      if (isNumber(entity.hp) && entity.hp <= 0) { return false; }
      return isNumber(entity.x) && isNumber(entity.y);
    }

    function resolveEntities(entities) {
      if (!entities) { return []; }
      if (Array.isArray(entities)) { return entities; }
      if (typeof entities.list === 'function') {
        var list = entities.list();
        return Array.isArray(list) ? list : [];
      }
      return [];
    }

    function readPlayerState() {
      if (ctx.playerState && isNumber(ctx.playerState.x) && isNumber(ctx.playerState.y)) {
        return ctx.playerState;
      }
      var player = ctx.player;
      if (!player && typeof ctx.getPlayer === 'function') {
        player = ctx.getPlayer();
      }
      if (!player) { return null; }
      if (typeof player.getState === 'function') {
        var state = player.getState();
        return (state && isNumber(state.x) && isNumber(state.y)) ? state : null;
      }
      if (isNumber(player.x) && isNumber(player.y)) { return player; }
      return null;
    }

    function playerAlive(state) {
      if (!state) { return false; }
      if (state.dead === true || state.alive === false) { return false; }
      if (isNumber(state.hp) && state.hp <= 0) { return false; }
      return true;
    }

    function readModifiers(playerState) {
      var source = null;
      var arg = ctx.player || playerState || null;
      if (typeof ctx.getPlayerModifiers === 'function') {
        source = ctx.getPlayerModifiers(arg);
      } else if (typeof ctx.getModifiers === 'function') {
        source = ctx.getModifiers(arg);
      }
      return normalizeModifiers(source);
    }

    /* ---------------------------- 内部：索敌 ---------------------------- */

    function findNearest(entities, x, y, range) {
      var collision = WX.Engine && WX.Engine.Collision;
      if (collision && typeof collision.nearest === 'function') {
        var hit = collision.nearest(entities, x, y, range, isTargetable);
        return hit ? hit.target : null;
      }

      /* 引擎缺失时的等价兜底：范围内最近的合法目标。 */
      var best = null;
      var bestSq = range * range;
      for (var i = 0; i < entities.length; i += 1) {
        var e = entities[i];
        if (!isTargetable(e)) { continue; }
        var dx = e.x - x;
        var dy = e.y - y;
        var dsq = dx * dx + dy * dy;
        if (dsq <= bestSq) {
          bestSq = dsq;
          best = e;
        }
      }
      return best;
    }

    function collectSectorTargets(entities, origin, facing, arcRad, range, limit) {
      var collision = WX.Engine && WX.Engine.Collision;
      if (collision && typeof collision.sectorTargets === 'function') {
        return collision.sectorTargets(
          entities, origin, facing, arcRad, range, limit, isTargetable
        );
      }

      var hits = [];
      for (var i = 0; i < entities.length; i += 1) {
        var e = entities[i];
        if (!isTargetable(e)) { continue; }
        var dx = e.x - origin.x;
        var dy = e.y - origin.y;
        var distSq = dx * dx + dy * dy;
        var reach = range + radiusOf(e);
        if (distSq > reach * reach) { continue; }
        if (arcRad > 0 && arcRad < TAU - EPSILON) {
          var dist = Math.sqrt(distSq);
          var slack = dist > EPSILON ? Math.atan2(radiusOf(e), dist) : 0;
          var diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - facing));
          if (diff > arcRad / 2 + slack) { continue; }
        }
        hits.push({ entity: e, distSq: distSq });
      }
      hits.sort(function (a, b) { return a.distSq - b.distSq; });

      var out = [];
      var max = limit > 0 ? limit : hits.length;
      for (var j = 0; j < hits.length && j < max; j += 1) {
        out.push(hits[j].entity);
      }
      return out;
    }

    /* ---------------------------- 内部：伤害 / 击退 / 反馈 ---------------------------- */

    function finalDamage(weapon) {
      return Math.max(0, weapon.damage * modifiers.damageMul + modifiers.damageAdd);
    }

    function finalCooldown(weapon) {
      var cd = weapon.cooldownSec * modifiers.cooldownMul;
      if (!(cd > 0)) { cd = weapon.cooldownSec; }
      return Math.max(MIN_COOLDOWN_SEC, cd);
    }

    function finalRange(weapon) {
      return Math.max(1, weapon.range * modifiers.rangeMul);
    }

    function finalCritChance() {
      return clamp01((cfg.critChance + modifiers.critAdd) * modifiers.critMul);
    }

    function rollCrit(chance) {
      if (!(chance > 0)) { return false; }
      if (chance >= 1) { return true; }
      if (rng && typeof rng.next === 'function') { return rng.next() < chance; }
      return Math.random() < chance;
    }

    function applyKnockback(enemy, dx, dy, force) {
      if (!enemy || !(force > 0)) { return; }
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < EPSILON) { return; }
      var nx = dx / len;
      var ny = dy / len;

      /* 契约未冻结击退通道：优先经 App 注入的回调，其次敌人自带的入口；
       * 都没有时跳过，绝不直接改写敌人坐标/速度。 */
      if (typeof ctx.applyKnockback === 'function') {
        ctx.applyKnockback(enemy, nx, ny, force);
        return;
      }
      if (typeof enemy.applyKnockback === 'function') {
        enemy.applyKnockback(nx, ny, force);
        return;
      }
      if (typeof enemy.applyImpulse === 'function') {
        enemy.applyImpulse(nx * force, ny * force);
      }
    }

    function addHitEffect(x, y, radius, crit) {
      effects.push({
        kind: 'hit',
        x: x,
        y: y,
        radius: radius,
        crit: !!crit,
        duration: Math.max(0.01, cfg.hitFlashSec),
        timer: Math.max(0.01, cfg.hitFlashSec)
      });
    }

    function addSlashEffect(x, y, angle, arc, range) {
      effects.push({
        kind: 'slash',
        x: x,
        y: y,
        angle: angle,
        arc: arc,
        range: range,
        duration: SLASH_SEC,
        timer: SLASH_SEC
      });
    }

    function updateEffects(dt) {
      for (var i = effects.length - 1; i >= 0; i -= 1) {
        effects[i].timer -= dt;
        if (effects[i].timer <= 0) { effects.splice(i, 1); }
      }
    }

    /**
     * 结算一次命中：伤害只经 ctx.applyDamage(enemy, amount)（契约 §5.5）。
     * @returns {{hit:boolean, crit:boolean, amount:number}}
     */
    function damageEnemy(enemy, weapon, dirX, dirY) {
      var base = finalDamage(weapon);
      var crit = rollCrit(finalCritChance());
      var amount = Math.max(0, Math.round(base * (crit ? cfg.critMultiplier : 1)));
      var applied = false;

      if (amount > 0 && typeof ctx.applyDamage === 'function') {
        ctx.applyDamage(enemy, amount);
        applied = true;
      }

      if (applied) {
        applyKnockback(enemy, dirX, dirY, weapon.knockback);
        addHitEffect(enemy.x, enemy.y, radiusOf(enemy), crit);
      }
      return { hit: applied, crit: applied && crit, amount: amount };
    }

    /* ---------------------------- 内部：出手 ---------------------------- */

    function fireSweep(slot, target, playerState, entities) {
      var weapon = slot.def;
      var origin = { x: playerState.x, y: playerState.y };
      var facing = Math.atan2(target.y - origin.y, target.x - origin.x);
      var range = finalRange(weapon);
      var arcRad = degToRad(weapon.arcDeg);

      var targets = collectSectorTargets(
        entities, origin, facing, arcRad, range, weapon.maxTargets
      );

      var hits = 0;
      var crits = 0;
      for (var i = 0; i < targets.length; i += 1) {
        var enemy = targets[i];
        var dx = enemy.x - origin.x;
        var dy = enemy.y - origin.y;
        var result = damageEnemy(enemy, weapon, dx, dy);
        if (result.hit) {
          hits += 1;
          if (result.crit) { crits += 1; }
        }
      }

      addSlashEffect(origin.x, origin.y, facing, arcRad, range);
      slot.lastAttack = { at: elapsed, hits: hits, crits: crits };
    }

    function fireProjectile(slot, target, playerState) {
      var weapon = slot.def;
      var projectileDef = weapon.projectile;
      if (!projectileDef) { return; }

      var angle = Math.atan2(target.y - playerState.y, target.x - playerState.x);
      var dirX = Math.cos(angle);
      var dirY = Math.sin(angle);
      var spawnDist = num(playerState.radius, cfg.playerRadius) + projectileDef.radius + 2;

      projectiles.push({
        x: playerState.x + dirX * spawnDist,
        y: playerState.y + dirY * spawnDist,
        dirX: dirX,
        dirY: dirY,
        angle: angle,
        radius: projectileDef.radius,
        speed: projectileDef.speed,
        weapon: weapon,
        pierceLeft: projectileDef.pierce,
        life: projectileDef.lifetimeSec,
        hitSet: []
      });

      slot.lastAttack = { at: elapsed, hits: 0, crits: 0 };
    }

    function fireWeapon(slot, target, playerState, entities) {
      if (slot.def.kind === 'projectile' && slot.def.projectile) {
        fireProjectile(slot, target, playerState);
      } else {
        fireSweep(slot, target, playerState, entities);
      }
    }

    function updateProjectiles(dt, entities) {
      for (var i = projectiles.length - 1; i >= 0; i -= 1) {
        var p = projectiles[i];

        p.x += p.dirX * p.speed * dt;
        p.y += p.dirY * p.speed * dt;
        p.life -= dt;

        if (p.life <= 0 ||
            p.x < -PROJECTILE_MARGIN || p.x > cfg.worldWidth + PROJECTILE_MARGIN ||
            p.y < -PROJECTILE_MARGIN || p.y > cfg.worldHeight + PROJECTILE_MARGIN) {
          projectiles.splice(i, 1);
          continue;
        }

        var removed = false;
        for (var j = 0; j < entities.length; j += 1) {
          var enemy = entities[j];
          if (!isTargetable(enemy)) { continue; }
          if (p.hitSet.indexOf(enemy) >= 0) { continue; }

          var reach = p.radius + radiusOf(enemy);
          var dx = enemy.x - p.x;
          var dy = enemy.y - p.y;
          if (dx * dx + dy * dy > reach * reach) { continue; }

          p.hitSet.push(enemy);
          damageEnemy(enemy, p.weapon, p.dirX, p.dirY);
          p.pierceLeft -= 1;

          if (p.pierceLeft <= 0) {
            projectiles.splice(i, 1);
            removed = true;
            break;
          }
        }
        if (removed) { continue; }
      }
    }

    /* ---------------------------- 内部：武器槽 ---------------------------- */

    function findWeaponConfig(id) {
      for (var i = 0; i < cfg.weapons.length; i += 1) {
        if (cfg.weapons[i] && cfg.weapons[i].id === id) { return cfg.weapons[i]; }
      }
      return null;
    }

    function resolveWeaponSource(source) {
      if (typeof source === 'string') { return findWeaponConfig(source); }
      if (source && typeof source === 'object') { return source; }
      return null;
    }

    function createSlot(source) {
      var def = normalizeWeaponDef(resolveWeaponSource(source));
      if (!def) { return null; }
      return { def: def, cooldownRemaining: 0, lastAttack: null };
    }

    function findSlot(id) {
      for (var i = 0; i < weapons.length; i += 1) {
        if (weapons[i].def.id === id) { return weapons[i]; }
      }
      return null;
    }

    function findStartWeapon() {
      if (cfg.startWeaponId) {
        var start = findWeaponConfig(cfg.startWeaponId);
        if (start) { return start; }
      }
      for (var i = 0; i < cfg.weapons.length; i += 1) {
        if (cfg.weapons[i] && cfg.weapons[i].starting === true) { return cfg.weapons[i]; }
      }
      return cfg.weapons.length > 0 ? cfg.weapons[0] : null;
    }

    function loadStartingWeapons() {
      var start = findStartWeapon();
      if (!start) { return; }
      var slot = createSlot(start);
      if (!slot) { return; }
      weapons.push(slot);
      activeId = slot.def.id;
    }

    function activeSlot() {
      if (activeId) {
        var found = findSlot(activeId);
        if (found) { return found; }
      }
      return weapons.length > 0 ? weapons[0] : null;
    }

    function weaponSnapshot(slot) {
      var weapon = slot.def;
      var cooldown = finalCooldown(weapon);
      var snapshot = {
        id: weapon.id,
        name: weapon.name,
        kind: weapon.kind,
        damage: finalDamage(weapon),
        cooldown: cooldown,
        cooldownRemaining: slot.cooldownRemaining,
        cooldownRatio: cooldown > 0 ? clamp01(slot.cooldownRemaining / cooldown) : 0,
        ready: slot.cooldownRemaining <= 0,
        range: finalRange(weapon),
        arcDeg: weapon.arcDeg,
        maxTargets: weapon.maxTargets,
        knockback: weapon.knockback,
        projectile: weapon.projectile ? {
          speed: weapon.projectile.speed,
          radius: weapon.projectile.radius,
          pierce: weapon.projectile.pierce,
          lifetimeSec: weapon.projectile.lifetimeSec
        } : null,
        critChance: finalCritChance(),
        critMultiplier: cfg.critMultiplier,
        lastAttack: slot.lastAttack ? {
          at: slot.lastAttack.at,
          hits: slot.lastAttack.hits,
          crits: slot.lastAttack.crits
        } : null
      };
      return snapshot;
    }

    function stepDelta(dt) {
      if (!isNumber(dt) || dt <= 0) { return 0; }
      return dt > cfg.maxStepSec ? cfg.maxStepSec : dt;
    }

    /* ---------------------------- 公开接口 ---------------------------- */

    /**
     * 每个逻辑步：推进冷却与投射物/特效，按最近目标自动出手。
     * @param {number} dt 秒
     * @param {Array|{list:Function}} entities 敌人列表（或含 list() 的敌人管理器）
     */
    combat.update = function (dt, entities) {
      var step = stepDelta(dt);
      if (step <= 0) { return combat; }

      elapsed += step;
      var list = resolveEntities(entities);

      var playerState = readPlayerState();
      modifiers = readModifiers(playerState);

      updateEffects(step);
      updateProjectiles(step, list);

      if (!playerState || !playerAlive(playerState)) { return combat; }

      for (var i = 0; i < weapons.length; i += 1) {
        var slot = weapons[i];

        if (slot.cooldownRemaining > 0) {
          slot.cooldownRemaining -= step;
          if (slot.cooldownRemaining < 0) { slot.cooldownRemaining = 0; }
        }
        if (slot.cooldownRemaining > 0) { continue; }

        var target = findNearest(list, playerState.x, playerState.y, finalRange(slot.def));
        if (!target) { continue; }

        fireWeapon(slot, target, playerState, list);
        slot.cooldownRemaining = finalCooldown(slot.def);
      }

      return combat;
    };

    /**
     * 当前武器（active）的只读状态；附全部已装备武器的冷却摘要。
     * 供 UI 显示冷却/武器名，不涉及跨模块事件。
     */
    combat.getWeaponState = function () {
      var list = [];
      for (var i = 0; i < weapons.length; i += 1) {
        var slot = weapons[i];
        list.push({
          id: slot.def.id,
          kind: slot.def.kind,
          cooldownRemaining: slot.cooldownRemaining,
          ready: slot.cooldownRemaining <= 0,
          active: slot.def.id === activeId
        });
      }

      var active = activeSlot();
      if (!active) {
        return {
          id: null,
          name: null,
          kind: null,
          damage: 0,
          cooldown: 0,
          cooldownRemaining: 0,
          cooldownRatio: 0,
          ready: false,
          range: 0,
          arcDeg: 0,
          maxTargets: 0,
          knockback: 0,
          projectile: null,
          critChance: finalCritChance(),
          critMultiplier: cfg.critMultiplier,
          lastAttack: null,
          weapons: list
        };
      }

      var snapshot = weaponSnapshot(active);
      snapshot.weapons = list;
      return snapshot;
    };

    /** 以 id 或武器定义数组整体替换装备（App 拾取/重开时调用）。 */
    combat.setWeapons = function (sources) {
      var list = Array.isArray(sources) ? sources : (sources ? [sources] : []);

      weapons = [];
      activeId = null;
      for (var i = 0; i < list.length; i += 1) {
        var slot = createSlot(list[i]);
        if (!slot) { continue; }
        if (findSlot(slot.def.id)) { continue; }
        weapons.push(slot);
      }
      if (weapons.length === 0) { loadStartingWeapons(); }
      activeId = weapons.length > 0 ? weapons[0].def.id : null;
      return combat;
    };

    /** 追加一把武器（id 或定义）；重复 id 幂等，返回该武器的状态快照。 */
    combat.addWeapon = function (source) {
      var slot = createSlot(source);
      if (!slot) { return null; }

      var existing = findSlot(slot.def.id);
      if (existing) { return weaponSnapshot(existing); }

      weapons.push(slot);
      if (!activeId) { activeId = slot.def.id; }
      return weaponSnapshot(slot);
    };

    /** 切换 active 武器（仅影响 getWeaponState 的主武器展示；已装备武器均自动出手）。 */
    combat.setWeapon = function (id) {
      var slot = findSlot(id);
      if (!slot) { return false; }
      activeId = slot.def.id;
      return true;
    };

    /** 重开单局：清空投射物/特效/冷却，恢复起始武器。 */
    combat.reset = function () {
      weapons = [];
      activeId = null;
      projectiles = [];
      effects = [];
      modifiers = normalizeModifiers(null);
      elapsed = 0;
      loadStartingWeapons();
      return combat;
    };

    /**
     * 世界坐标绘制：飞刃投射物、挥砍扇形残影、命中/暴击闪光。
     * App 应在敌人绘制之后、UI 之前调用，保证命中反馈覆盖在敌人之上。
     */
    combat.render = function (renderer) {
      if (!renderer) { return combat; }

      var prevAlpha = typeof renderer.getAlpha === 'function' ? renderer.getAlpha() : 1;
      var i;

      /* 飞刃 */
      for (i = 0; i < projectiles.length; i += 1) {
        var p = projectiles[i];
        var c = Math.cos(p.angle);
        var s = Math.sin(p.angle);

        if (typeof renderer.setAlpha === 'function') { renderer.setAlpha(prevAlpha); }
        renderer.fillCircle(p.x, p.y, p.radius * 1.8, COLORS.bladeGlow);
        renderer.fillPolygon([
          { x: p.x + c * p.radius * 2.0, y: p.y + s * p.radius * 2.0 },
          { x: p.x - s * p.radius * 0.6, y: p.y + c * p.radius * 0.6 },
          { x: p.x - c * p.radius * 1.4, y: p.y - s * p.radius * 1.4 },
          { x: p.x + s * p.radius * 0.6, y: p.y - c * p.radius * 0.6 }
        ], COLORS.blade);
        renderer.drawLine(
          p.x - c * p.radius * 3.2, p.y - s * p.radius * 3.2,
          p.x - c * p.radius * 1.0, p.y - s * p.radius * 1.0,
          COLORS.bladeTrail, 2
        );
      }

      /* 挥砍残影 + 命中闪光 */
      for (i = 0; i < effects.length; i += 1) {
        var effect = effects[i];
        var t = effect.duration > 0 ? clamp01(effect.timer / effect.duration) : 0;

        if (effect.kind === 'slash') {
          var half = effect.arc / 2;
          var startAngle = effect.angle - half;
          var endAngle = effect.angle + half;

          if (typeof renderer.setAlpha === 'function') {
            renderer.setAlpha(prevAlpha * (0.15 + 0.55 * t));
          }
          renderer.fillSector(effect.x, effect.y, effect.range, startAngle, endAngle,
            COLORS.slashFill);
          if (typeof renderer.setAlpha === 'function') {
            renderer.setAlpha(prevAlpha * (0.35 + 0.5 * t));
          }
          renderer.strokeSector(effect.x, effect.y, effect.range, startAngle, endAngle,
            COLORS.slashStroke, 2 + 2 * t);
        } else {
          var progress = 1 - t;
          var ring = effect.radius + (effect.crit ? 16 : 9) * progress;
          if (typeof renderer.setAlpha === 'function') {
            renderer.setAlpha(prevAlpha * (0.2 + 0.8 * t));
          }
          renderer.strokeCircle(effect.x, effect.y, ring,
            effect.crit ? COLORS.crit : COLORS.hit, effect.crit ? 2.5 : 1.5);
          if (t > 0.35) {
            if (typeof renderer.setAlpha === 'function') {
              renderer.setAlpha(prevAlpha * 0.9 * t);
            }
            renderer.fillCircle(effect.x, effect.y, effect.radius * 0.5 * t,
              effect.crit ? COLORS.critFlash : COLORS.hitFlash);
          }
        }
      }

      if (typeof renderer.setAlpha === 'function') { renderer.setAlpha(prevAlpha); }
      return combat;
    };

    /* ---------------------------- 初始化 ---------------------------- */

    loadStartingWeapons();
    return combat;
  }

  /* ============================ 导出 ============================ */

  CombatNS.VERSION = VERSION;
  CombatNS.create = createCombat;

  WX.Combat = CombatNS;
})(typeof window !== 'undefined' ? window : this);
