/**
 * game/items/arsenal.js
 * 模块：arsenal（武器与道具）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责（架构契约 §3）：
 *   - 武器：默认持有起始武器（balance.player.startWeaponId），按掉落规则
 *     （balance.drops.weaponDropWaveIndex / weaponDropId）在波次中获取新武器，
 *     向 loop-app 提供当前武器配置（由 App 转发给 combat，本模块不引用 combat）；
 *   - 道具：按 balance.drops.itemDropChance / itemPool 在击杀时掉落；
 *     消耗品拾取即用（金疮药 → player.heal(30)），被动道具按 maxStack 叠加；
 *   - 效果接入：把被动道具效果聚合为与 WX.Config.items[].modifiers 同构的修饰器数组，
 *     经 App 注入的回调 / 拉取接口交给 player / combat / progression 消费；
 *     不直接改玩家、战斗内部状态，不结算伤害；
 *   - 重开：reset() 清空本局武器与道具层数、掉落物，恢复起始武器。
 *
 * 公开契约（架构契约 §5.5）：
 *   WX.Arsenal.create(ctx) -> {
 *     grantItem(id), getInventory(), applyModifiers(stats)
 *   }
 *   本模块按架构“最小约定”补充：grantWeapon / getActiveWeapon / getWeaponList /
 *   equipWeapon / onEnemyKilled / onWaveStarted / update / render / reset /
 *   getModifiers / getPlayerModifiers / getModifierTotals / spawnDrop / getPickups。
 *
 * 事件（架构契约 §5.4）：本模块**不发送任何事件**。§5.4 未登记 arsenal 事件，
 * 跨模块协作只经 App 注入的 ctx 回调与只读拉取接口完成（App 负责转发与编排）。
 *
 * 依赖（架构契约 §4）：只读 WX.Config 与 WX.Engine（Math 随机数 / Renderer 绘制原语）；
 * 不引用 combat / player / enemies / progression / app。
 *
 * 硬约束：经典 <script> + IIFE，挂载 window.WX.Arsenal；无 ES Module、无 fetch/XHR、
 * 无外部资源、无构建链；不硬编码平衡值（数值全部来自 WX.Config）。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var ArsenalNS = WX.Arsenal || (WX.Arsenal = {});

  var VERSION = '1.0.0';
  var TAU = Math.PI * 2;

  /*
   * 表现层常量：只影响掉落物绘制与拾取反馈，不是平衡数值。
   * 掉落概率、叠加上限、掉落波次等平衡口径一律读 WX.Config。
   */
  var VISUAL = {
    itemRadius: 11,
    weaponRadius: 15,
    bobSpeed: 3.2,
    bobHeight: 3.5,
    spinSpeed: 1.8,
    haloPulseSpeed: 2.6,
    feedbackLifeSec: 0.95,
    feedbackRiseSpeed: 36,
    labelSize: 13,
    dropDistanceMin: 140,
    dropDistanceMax: 180
  };

  var COLORS = {
    shadow: 'rgba(0, 0, 0, 0.28)',
    itemHalo: 'rgba(233, 198, 124, 0.75)',
    weaponHalo: 'rgba(247, 222, 158, 0.9)',
    itemConsumable: '#b8503f',
    itemConsumableAccent: '#f1ddb0',
    itemPassive: '#b98f38',
    itemPassiveAccent: '#f7ecc9',
    itemOutline: 'rgba(248, 238, 208, 0.9)',
    weaponBlade: '#e9efe6',
    weaponTip: '#fffaf0',
    weaponHilt: '#8d5f34',
    weaponAccent: '#f2d38a',
    label: '#f6ecd6',
    feedbackItem: '#ffe9b0',
    feedbackWeapon: '#fff4d2'
  };

  /* 仅在 WX.Config 缺失/字段非法时兜底；正常路径全部读配置。 */
  var FALLBACK = {
    worldWidth: 1280,
    worldHeight: 720,
    pickupRadius: 80,
    maxStepSec: 0.1
  };

  /* ============================ 基础工具 ============================ */

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function num(value, fallback) {
    return isNumber(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    if (max < min) { return (min + max) / 2; }
    if (value < min) { return min; }
    if (value > max) { return max; }
    return value;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function defaultSeed() {
    var now = typeof Date.now === 'function' ? Date.now() : 1;
    return (now & 0x7fffffff) || 1;
  }

  /** 兜底 PRNG（WX.Engine.Math 缺失时使用），接口与 createRandom 子集一致。 */
  function createFallbackRandom(seed) {
    var state = (isNumber(seed) ? seed : 1) >>> 0;
    if (state === 0) { state = 0x1a2b3c4d; }

    function next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    }

    return {
      seed: state,
      next: next,
      float: function (min, max) {
        if (typeof min !== 'number') { return next(); }
        var hi = typeof max === 'number' ? max : min;
        var lo = typeof max === 'number' ? min : 0;
        return lo + next() * (hi - lo);
      },
      chance: function (p) {
        if (!(p > 0)) { return false; }
        if (p >= 1) { return true; }
        return next() < p;
      },
      pick: function (list) {
        if (!list || list.length === 0) { return null; }
        return list[Math.floor(next() * list.length)];
      }
    };
  }

  function createRandom(seed) {
    var math = WX.Engine && WX.Engine.Math;
    if (math && typeof math.createRandom === 'function') {
      return math.createRandom(seed);
    }
    return createFallbackRandom(seed);
  }

  /* ============================ 配置读取 ============================ */

  /** 读取本模块需要的只读配置（架构契约 §5.7：数值全部来自 config-data）。 */
  function readConfig() {
    var cfg = WX.Config || {};
    var balance = cfg.balance || {};
    var drops = balance.drops || {};
    var playerCfg = balance.player || {};
    var worldCfg = balance.world || {};
    var loopCfg = balance.loop || {};

    return {
      weapons: Array.isArray(cfg.weapons) ? cfg.weapons : [],
      items: Array.isArray(cfg.items) ? cfg.items : [],
      worldWidth: Math.max(1, num(worldCfg.width, FALLBACK.worldWidth)),
      worldHeight: Math.max(1, num(worldCfg.height, FALLBACK.worldHeight)),
      pickupRadius: Math.max(0, num(playerCfg.pickupRadius, FALLBACK.pickupRadius)),
      startWeaponId: typeof playerCfg.startWeaponId === 'string' ? playerCfg.startWeaponId : null,
      maxStepSec: Math.max(0.001, num(loopCfg.maxDeltaSec, FALLBACK.maxStepSec)),
      drops: {
        itemDropChance: clamp(num(drops.itemDropChance, 0), 0, 1),
        itemPool: Array.isArray(drops.itemPool) ? drops.itemPool.slice() : null,
        weaponDropWaveIndex: Math.floor(num(drops.weaponDropWaveIndex, 0)),
        weaponDropId: typeof drops.weaponDropId === 'string' ? drops.weaponDropId : null
      }
    };
  }

  function indexById(list) {
    var map = {};
    for (var i = 0; i < list.length; i += 1) {
      var def = list[i];
      if (def && typeof def.id === 'string' && def.id) {
        map[def.id] = def;
      }
    }
    return map;
  }

  function resolveStartWeaponId(weapons, configuredId) {
    var i;
    if (configuredId) {
      for (i = 0; i < weapons.length; i += 1) {
        if (weapons[i] && weapons[i].id === configuredId) { return configuredId; }
      }
    }
    for (i = 0; i < weapons.length; i += 1) {
      if (weapons[i] && weapons[i].starting === true && typeof weapons[i].id === 'string') {
        return weapons[i].id;
      }
    }
    return weapons.length > 0 && typeof weapons[0].id === 'string' ? weapons[0].id : null;
  }

  function itemMaxStack(def) {
    var value = num(def && def.maxStack, 1);
    return Math.max(1, Math.floor(value));
  }

  function copyModifiers(list) {
    var out = [];
    if (!Array.isArray(list)) { return out; }
    for (var i = 0; i < list.length; i += 1) {
      var m = list[i];
      if (!m || typeof m.stat !== 'string' || !isNumber(m.value)) { continue; }
      out.push({
        stat: m.stat,
        op: m.op === 'add' ? 'add' : 'mul',
        value: m.value
      });
    }
    return out;
  }

  /* ============================ 工厂 ============================ */

  /**
   * 创建武器/道具系统。
   * @param {object} [ctx] loop-app 注入的上下文（全部字段可选）：
   *   getPlayer()            返回玩家实体（含 heal 方法）；优先；
   *   player                 玩家实体；getPlayer 缺失时使用；
   *   getPlayerState()       只读玩家快照（x/y/pickupRadius）；
   *   healPlayer(amount)     无可解析玩家实体时的回血通道（返回实际回复量）；
   *   getWaveIndex()/waveIndex  当前波次（update 中用于兜底触发武器掉落）；
   *   seed                   本局掉落随机种子（可复现）；
   *   onInventoryChanged(inventory, source)  库存变化回调；
   *   onModifiersChanged(modifiers, source)  道具修饰器变化回调；
   *   onWeaponChanged(weapon, source)        当前武器变化回调（App 转发 combat）；
   *   onItemsChanged / onItemModifiersChanged / onActiveWeaponChanged 为语义别名。
   * @returns {object} 武器/道具实例（见文件头公开契约）。
   */
  function createArsenal(ctx) {
    ctx = ctx || {};

    var cfg = readConfig();
    var weaponDefs = indexById(cfg.weapons);
    var itemDefs = indexById(cfg.items);
    var startWeaponId = resolveStartWeaponId(cfg.weapons, cfg.startWeaponId);
    var world = { width: cfg.worldWidth, height: cfg.worldHeight };
    var rng = createRandom(num(ctx.seed, defaultSeed()));

    /* 运行时状态：对外只经 getInventory() 等只读快照暴露。 */
    var ownedWeapons = {};
    var activeWeaponId = null;
    var itemStacks = {};
    var pickups = [];
    var feedback = [];
    var nextPickupId = 1;
    var weaponDropDone = false;
    var currentWaveIndex = 0;

    if (startWeaponId && weaponDefs[startWeaponId]) {
      ownedWeapons[startWeaponId] = true;
      activeWeaponId = startWeaponId;
    }

    /* ---------------------------- 内部工具 ---------------------------- */

    function callFirst(names, args) {
      for (var i = 0; i < names.length; i += 1) {
        var fn = ctx[names[i]];
        if (typeof fn === 'function') {
          try {
            fn.apply(ctx, args);
          } catch (err) {
            /* 上层回调异常不应破坏本模块库存一致性；此步跳过该回调。 */
          }
          return true;
        }
      }
      return false;
    }

    function resolvePlayerEntity() {
      if (typeof ctx.getPlayer === 'function') {
        var fromGetter = ctx.getPlayer();
        if (fromGetter) { return fromGetter; }
      }
      if (ctx.player) { return ctx.player; }
      return null;
    }

    function resolvePlayerState() {
      var entity = resolvePlayerEntity();
      if (entity && typeof entity.getState === 'function') {
        return entity.getState();
      }
      if (entity && isNumber(entity.x) && isNumber(entity.y)) {
        return entity;
      }
      if (typeof ctx.getPlayerState === 'function') {
        return ctx.getPlayerState();
      }
      return null;
    }

    /**
     * 回血通道：只调用玩家公开的 heal(amount) 或 App 注入的 healPlayer。
     * 返回实际回复量；无可用通道时返回 null（调用方保留掉落物等待下次）。
     */
    function healPlayer(amount, explicitPlayer) {
      var player = explicitPlayer || resolvePlayerEntity();
      if (player && typeof player.heal === 'function') {
        return player.heal(amount);
      }
      if (typeof ctx.healPlayer === 'function') {
        return ctx.healPlayer(amount);
      }
      return null;
    }

    function clampWorld(x, y, radius) {
      var r = isNumber(radius) ? radius : 0;
      return {
        x: clamp(x, r, world.width - r),
        y: clamp(y, r, world.height - r)
      };
    }

    function stepDelta(dt) {
      if (!isNumber(dt) || dt <= 0) { return 0; }
      return dt > cfg.maxStepSec ? cfg.maxStepSec : dt;
    }

    /** 玩家死亡后不再拾取（掉落物留在地面，重开时清空）。 */
    function isPlayerDead(state) {
      if (!state) { return false; }
      if (state.dead === true || state.alive === false) { return true; }
      return isNumber(state.hp) && state.hp <= 0;
    }

    function getModifierList() {
      var list = [];
      for (var i = 0; i < cfg.items.length; i += 1) {
        var def = cfg.items[i];
        if (!def || typeof def.id !== 'string') { continue; }
        var count = itemStacks[def.id] || 0;
        if (count <= 0) { continue; }
        var mods = Array.isArray(def.modifiers) ? def.modifiers : [];
        for (var c = 0; c < count; c += 1) {
          for (var m = 0; m < mods.length; m += 1) {
            var mod = mods[m];
            if (!mod || typeof mod.stat !== 'string' || !isNumber(mod.value)) { continue; }
            list.push({
              stat: mod.stat,
              op: mod.op === 'add' ? 'add' : 'mul',
              value: mod.value,
              itemId: def.id,
              source: 'item:' + def.id
            });
          }
        }
      }
      return list;
    }

    function getModifierTotals() {
      var list = getModifierList();
      var totals = {};
      for (var i = 0; i < list.length; i += 1) {
        var m = list[i];
        if (!hasOwn(totals, m.stat)) { totals[m.stat] = { add: 0, mul: 1 }; }
        if (m.op === 'add') {
          totals[m.stat].add += m.value;
        } else {
          totals[m.stat].mul *= m.value;
        }
      }
      return totals;
    }

    function emitInventoryChanged(source) {
      callFirst(['onInventoryChanged', 'onItemsChanged'], [arsenal.getInventory(), source || 'change']);
    }

    function emitModifiersChanged(source) {
      callFirst(['onModifiersChanged', 'onItemModifiersChanged'], [getModifierList(), source || 'change']);
    }

    function notifyWeaponChanged(source) {
      var weapon = arsenal.getActiveWeapon();
      if (!weapon) { return; }
      callFirst(['onWeaponChanged', 'onActiveWeaponChanged'], [weapon, source || 'change']);
    }

    function weaponSnapshot(def) {
      return {
        id: def.id,
        name: typeof def.name === 'string' ? def.name : def.id,
        description: typeof def.description === 'string' ? def.description : '',
        kind: def.kind === 'projectile' ? 'projectile' : 'sweep',
        starting: def.starting === true,
        owned: !!ownedWeapons[def.id],
        active: def.id === activeWeaponId,
        damage: num(def.damage, 0),
        cooldownSec: num(def.cooldownSec, 0),
        range: num(def.range, 0),
        arcDeg: num(def.arcDeg, 0),
        maxTargets: Math.max(1, Math.floor(num(def.maxTargets, 1))),
        knockback: num(def.knockback, 0)
      };
    }

    function pickupSnapshot(p) {
      var def = p.kind === 'weapon' ? weaponDefs[p.id] : itemDefs[p.id];
      return {
        uid: p.uid,
        kind: p.kind,
        id: p.id,
        name: def && typeof def.name === 'string' ? def.name : p.id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        age: p.age
      };
    }

    function resolveItemPool() {
      var pool = cfg.drops.itemPool;
      if (pool && pool.length > 0) { return pool; }
      var fallbackPool = [];
      for (var i = 0; i < cfg.items.length; i += 1) {
        if (cfg.items[i] && typeof cfg.items[i].id === 'string') {
          fallbackPool.push(cfg.items[i].id);
        }
      }
      return fallbackPool;
    }

    /** 从掉落池中挑一个未达 maxStack 的道具 id；全部满叠时返回 null。 */
    function pickItemDropId() {
      var pool = resolveItemPool();
      var available = [];
      for (var i = 0; i < pool.length; i += 1) {
        var id = pool[i];
        var def = itemDefs[id];
        if (!def) { continue; }
        if ((itemStacks[id] || 0) < itemMaxStack(def)) {
          available.push(id);
        }
      }
      if (available.length === 0) { return null; }
      return rng.pick(available);
    }

    /** 武器掉落位置：玩家附近（便于实际拾取）；无玩家时落在世界中心。 */
    function weaponDropAnchor() {
      var state = resolvePlayerState();
      var margin = VISUAL.weaponRadius + 8;
      if (state && isNumber(state.x) && isNumber(state.y)) {
        var angle = rng.float(0, TAU);
        var distance = VISUAL.dropDistanceMin +
          rng.float(0, VISUAL.dropDistanceMax - VISUAL.dropDistanceMin);
        return clampWorld(
          state.x + Math.cos(angle) * distance,
          state.y + Math.sin(angle) * distance,
          margin
        );
      }
      return clampWorld(world.width / 2, world.height / 2, margin);
    }

    function syncWaveFromContext() {
      if (typeof ctx.getWaveIndex === 'function') {
        var fromGetter = ctx.getWaveIndex();
        if (isNumber(fromGetter) && fromGetter > 0) { return Math.floor(fromGetter); }
      }
      if (isNumber(ctx.waveIndex) && ctx.waveIndex > 0) {
        return Math.floor(ctx.waveIndex);
      }
      return null;
    }

    function maybeSpawnWeaponDrop(waveIndex) {
      if (!isNumber(waveIndex)) { return null; }
      currentWaveIndex = Math.floor(waveIndex);

      var threshold = cfg.drops.weaponDropWaveIndex;
      var dropId = cfg.drops.weaponDropId;
      if (weaponDropDone || !dropId || !(threshold > 0) || currentWaveIndex < threshold) {
        return null;
      }
      weaponDropDone = true;
      if (!weaponDefs[dropId] || ownedWeapons[dropId]) { return null; }

      var anchor = weaponDropAnchor();
      return arsenal.spawnDrop('weapon', dropId, anchor.x, anchor.y);
    }

    function pushFeedback(pickup, result) {
      var def = pickup.kind === 'weapon' ? weaponDefs[pickup.id] : itemDefs[pickup.id];
      var name = def && typeof def.name === 'string' ? def.name : pickup.id;
      var text = name;
      if (result && result.kind === 'consumable' && result.healed > 0) {
        text = name + ' +' + Math.round(result.healed);
      }
      feedback.push({
        text: text,
        x: pickup.x,
        y: pickup.y - pickup.radius - 4,
        age: 0,
        life: VISUAL.feedbackLifeSec,
        color: pickup.kind === 'weapon' ? COLORS.feedbackWeapon : COLORS.feedbackItem
      });
    }

    function collectPickup(pickup, playerEntity) {
      if (pickup.kind === 'weapon') {
        var weaponResult = arsenal.grantWeapon(pickup.id, { source: 'pickup' });
        if (!weaponResult.ok) {
          return { ok: false, reason: weaponResult.reason || 'weapon-grant-failed' };
        }
        return { ok: true, kind: 'weapon', id: pickup.id, weapon: weaponResult };
      }
      var itemResult = arsenal.grantItem(pickup.id, { player: playerEntity, source: 'pickup' });
      if (itemResult.ok) {
        itemResult.name = itemDefs[pickup.id] && itemDefs[pickup.id].name
          ? itemDefs[pickup.id].name
          : pickup.id;
      }
      return itemResult;
    }

    function drawPickup(renderer, pickup) {
      var bob = Math.sin(pickup.age * VISUAL.bobSpeed + pickup.phase) * VISUAL.bobHeight;
      var cy = pickup.y + bob;
      var r = pickup.radius;
      var pulse = 0.55 + 0.45 * Math.abs(Math.sin(pickup.age * VISUAL.haloPulseSpeed + pickup.phase));

      /* 地面投影 + 光环脉冲（表现层，不影响逻辑位置）。 */
      renderer.fillCircle(pickup.x, pickup.y + 4, r * 0.7, COLORS.shadow);
      renderer.setAlpha(0.35 + 0.5 * pulse);
      renderer.strokeCircle(
        pickup.x,
        cy,
        r + 5 + pulse * 3,
        pickup.kind === 'weapon' ? COLORS.weaponHalo : COLORS.itemHalo,
        1.5
      );
      renderer.setAlpha(1);

      if (pickup.kind === 'weapon') {
        var angle = pickup.age * VISUAL.spinSpeed + pickup.phase;
        var dx = Math.cos(angle);
        var dy = Math.sin(angle);

        /* 旋转刀身 + 刀尖 + 横置刀柄 + 中心菱形。 */
        renderer.drawLine(
          pickup.x - dx * r * 0.25, cy - dy * r * 0.25,
          pickup.x + dx * r, cy + dy * r,
          COLORS.weaponBlade, 3
        );
        renderer.fillCircle(pickup.x + dx * r, cy + dy * r, 2.5, COLORS.weaponTip);
        renderer.drawLine(
          pickup.x - dx * r * 0.25 - dy * 5, cy - dy * r * 0.25 + dx * 5,
          pickup.x - dx * r * 0.25 + dy * 5, cy - dy * r * 0.25 - dx * 5,
          COLORS.weaponHilt, 3
        );
        renderer.fillPolygon([
          { x: pickup.x, y: cy - 4 },
          { x: pickup.x + 4, y: cy },
          { x: pickup.x, y: cy + 4 },
          { x: pickup.x - 4, y: cy }
        ], COLORS.weaponAccent);

        var weaponDef = weaponDefs[pickup.id];
        if (weaponDef && typeof weaponDef.name === 'string') {
          renderer.drawText(weaponDef.name, pickup.x, cy + r + 13, {
            size: VISUAL.labelSize,
            align: 'center',
            color: COLORS.label,
            strokeColor: 'rgba(18, 12, 8, 0.9)',
            strokeWidth: 3
          });
        }
        return;
      }

      var itemDef = itemDefs[pickup.id];
      var isConsumable = itemDef && itemDef.kind === 'consumable';
      var mainColor = isConsumable ? COLORS.itemConsumable : COLORS.itemPassive;
      var accentColor = isConsumable ? COLORS.itemConsumableAccent : COLORS.itemPassiveAccent;

      renderer.fillCircle(pickup.x, cy, r, mainColor);
      renderer.fillPolygon([
        { x: pickup.x, y: cy - r * 0.6 },
        { x: pickup.x + r * 0.6, y: cy },
        { x: pickup.x, y: cy + r * 0.6 },
        { x: pickup.x - r * 0.6, y: cy }
      ], accentColor);
      renderer.strokeCircle(pickup.x, cy, r, COLORS.itemOutline, 1.5);
    }

    /* ---------------------------- 公开接口 ---------------------------- */

    var arsenal = {};

    /**
     * 获取道具（掉落拾取 / App 直接发放共用）。
     *   - consumable：拾取即用，按配置 heal 调用玩家 heal；记录层数，达 maxStack 后不再生效；
     *   - passive：层数 +1（不超过 maxStack），修饰器按层数聚合，重算后通知。
     * @param {string} id WX.Config.items[].id
     * @param {object} [options] { player, source }
     * @returns {object} { ok, id, kind, count, maxStack, applied, capped, healed? }
     */
    arsenal.grantItem = function (id, options) {
      options = options || {};
      var def = hasOwn(itemDefs, id) ? itemDefs[id] : null;
      if (!def) {
        return { ok: false, id: id, reason: 'unknown-item' };
      }

      var kind = def.kind === 'passive' ? 'passive' : 'consumable';
      var maxStack = itemMaxStack(def);
      var count = itemStacks[id] || 0;

      if (count >= maxStack) {
        /* 达叠加上限：拾取物作废，不重复叠加、不重复回血。 */
        return {
          ok: true,
          id: id,
          kind: kind,
          count: count,
          maxStack: maxStack,
          applied: false,
          capped: true
        };
      }

      if (kind === 'consumable') {
        var healAmount = num(def.heal, 0);
        var healed = 0;
        if (healAmount > 0) {
          var healResult = healPlayer(healAmount, options.player);
          if (healResult === null) {
            /* 无可回血通道：保留掉落物，待玩家可解析时再拾取。 */
            return { ok: false, id: id, reason: 'no-player', kind: kind };
          }
          healed = healResult;
        }

        itemStacks[id] = count + 1;
        emitInventoryChanged('item');
        return {
          ok: true,
          id: id,
          kind: kind,
          count: count + 1,
          maxStack: maxStack,
          applied: true,
          capped: false,
          healed: healed
        };
      }

      itemStacks[id] = count + 1;
      emitInventoryChanged('item');
      emitModifiersChanged('item');
      return {
        ok: true,
        id: id,
        kind: kind,
        count: count + 1,
        maxStack: maxStack,
        applied: true,
        capped: false
      };
    };

    /**
     * 获取武器。首次获得即切换为当前武器并通知 App；重复获取不叠加、不重复生效。
     * @param {string} id WX.Config.weapons[].id
     * @param {object} [options] { source }
     * @returns {object} { ok, id, alreadyOwned, switched, active }
     */
    arsenal.grantWeapon = function (id, options) {
      options = options || {};
      var def = hasOwn(weaponDefs, id) ? weaponDefs[id] : null;
      if (!def) {
        return { ok: false, id: id, reason: 'unknown-weapon' };
      }

      if (ownedWeapons[id]) {
        return {
          ok: true,
          id: id,
          kind: 'weapon',
          alreadyOwned: true,
          switched: false,
          active: activeWeaponId === id
        };
      }

      ownedWeapons[id] = true;
      activeWeaponId = id;

      emitInventoryChanged('weapon');
      notifyWeaponChanged(options.source || 'grant');
      return {
        ok: true,
        id: id,
        kind: 'weapon',
        alreadyOwned: false,
        switched: true,
        active: true
      };
    };

    /**
     * 切换当前武器（仅限已持有的武器）。仅改本模块库存态，并由回调通知 App；
     * 不引用 combat，武器实际使用由 App 每步读取 getActiveWeapon() 转发。
     */
    arsenal.equipWeapon = function (id) {
      if (!ownedWeapons[id] || !weaponDefs[id]) {
        return { ok: false, id: id, reason: 'not-owned' };
      }
      if (activeWeaponId === id) {
        return { ok: true, id: id, switched: false, active: true };
      }
      activeWeaponId = id;
      emitInventoryChanged('equip');
      notifyWeaponChanged('equip');
      return { ok: true, id: id, switched: true, active: true };
    };

    /** 是否已持有某武器。 */
    arsenal.hasWeapon = function (id) {
      return !!ownedWeapons[id];
    };

    /** 某道具当前叠加层数。 */
    arsenal.getItemCount = function (id) {
      return itemStacks[id] || 0;
    };

    /**
     * 当前武器配置快照（App 每步读取并转发给 combat / 或直接读取其字段）。
     * 返回配置值的浅拷贝，附带本模块道具修饰器数组（供 combat 经 applyModifiers 应用）。
     * 无当前武器时返回 null。
     */
    arsenal.getActiveWeapon = function () {
      var def = activeWeaponId ? weaponDefs[activeWeaponId] : null;
      if (!def) { return null; }
      var projectile = def.projectile && typeof def.projectile === 'object'
        ? {
          speed: num(def.projectile.speed, 0),
          radius: num(def.projectile.radius, 0),
          pierce: Math.max(1, Math.floor(num(def.projectile.pierce, 1))),
          lifetimeSec: num(def.projectile.lifetimeSec, 0)
        }
        : null;
      var snapshot = weaponSnapshot(def);
      snapshot.projectile = projectile;
      snapshot.modifiers = getModifierList();
      return snapshot;
    };

    /** 按 id 读取武器配置快照；未知 id 返回 null。 */
    arsenal.getWeapon = function (id) {
      var def = hasOwn(weaponDefs, id) ? weaponDefs[id] : null;
      if (!def) { return null; }
      var snapshot = weaponSnapshot(def);
      snapshot.projectile = def.projectile && typeof def.projectile === 'object'
        ? {
          speed: num(def.projectile.speed, 0),
          radius: num(def.projectile.radius, 0),
          pierce: Math.max(1, Math.floor(num(def.projectile.pierce, 1))),
          lifetimeSec: num(def.projectile.lifetimeSec, 0)
        }
        : null;
      return snapshot;
    };

    /** 武器清单（配置顺序），含 owned/active 标记，便于 UI/调试读取。 */
    arsenal.getWeaponList = function () {
      var list = [];
      for (var i = 0; i < cfg.weapons.length; i += 1) {
        var def = cfg.weapons[i];
        if (!def || typeof def.id !== 'string') { continue; }
        list.push(weaponSnapshot(def));
      }
      return list;
    };

    /**
     * 库存只读快照：武器（含持有/激活标记）、已获得道具与层数、修饰器、地面掉落物。
     * 每次调用返回新对象，外部修改不会影响内部状态。
     */
    arsenal.getInventory = function () {
      var ownedWeaponIds = [];
      var i;
      for (i = 0; i < cfg.weapons.length; i += 1) {
        var weaponDef = cfg.weapons[i];
        if (weaponDef && ownedWeapons[weaponDef.id]) {
          ownedWeaponIds.push(weaponDef.id);
        }
      }

      var items = [];
      for (i = 0; i < cfg.items.length; i += 1) {
        var def = cfg.items[i];
        if (!def || typeof def.id !== 'string') { continue; }
        var count = itemStacks[def.id] || 0;
        if (count <= 0) { continue; }
        items.push({
          id: def.id,
          name: typeof def.name === 'string' ? def.name : def.id,
          description: typeof def.description === 'string' ? def.description : '',
          kind: def.kind === 'passive' ? 'passive' : 'consumable',
          count: count,
          maxStack: itemMaxStack(def),
          heal: num(def.heal, 0),
          modifiers: copyModifiers(def.modifiers)
        });
      }

      var drops = [];
      for (i = 0; i < pickups.length; i += 1) {
        drops.push(pickupSnapshot(pickups[i]));
      }

      return {
        weapons: arsenal.getWeaponList(),
        ownedWeaponIds: ownedWeaponIds,
        activeWeaponId: activeWeaponId,
        items: items,
        modifiers: getModifierList(),
        modifierTotals: getModifierTotals(),
        pickups: drops,
        weaponDropDone: weaponDropDone,
        waveIndex: currentWaveIndex
      };
    };

    /** 状态快照别名（与领域模块 getState 习惯保持一致）。 */
    arsenal.getState = function () {
      return arsenal.getInventory();
    };

    /** 地面掉落物只读列表。 */
    arsenal.getPickups = function () {
      var list = [];
      for (var i = 0; i < pickups.length; i += 1) {
        list.push(pickupSnapshot(pickups[i]));
      }
      return list;
    };

    /** 道具修饰器数组（与 WX.Config.items[].modifiers 同构，按层数展开）。 */
    arsenal.getModifiers = function () {
      return getModifierList();
    };

    /** 供 WX.Player 的 ctx.getPlayerModifiers 直接返回的修饰器数组。 */
    arsenal.getPlayerModifiers = function () {
      return getModifierList();
    };

    /** 按 stat 聚合的修饰器（{stat: {add, mul}}），便于调试/展示。 */
    arsenal.getModifierTotals = function () {
      return getModifierTotals();
    };

    /**
     * 契约接口：把道具修饰器应用到给定 stats（基值对象）。
     * 不修改入参，返回新对象；add 叠加、mul 相乘（初始 1）。
     * 例：applyModifiers({ damage: 12, moveSpeed: 1 }) →
     *     { damage: 12, moveSpeed: 1.1, damageTaken: 0.85 }
     */
    arsenal.applyModifiers = function (stats) {
      var out = {};
      var key;
      if (stats && typeof stats === 'object') {
        for (key in stats) {
          if (hasOwn(stats, key)) { out[key] = stats[key]; }
        }
      }

      var list = getModifierList();
      for (var i = 0; i < list.length; i += 1) {
        var m = list[i];
        var current = typeof out[m.stat] === 'number'
          ? out[m.stat]
          : (m.op === 'mul' ? 1 : 0);
        out[m.stat] = m.op === 'mul' ? current * m.value : current + m.value;
      }
      return out;
    };

    /**
     * 在指定坐标生成掉落物（掉落与 App 发放共用）。
     * @param {string} kind 'item' | 'weapon'
     * @param {string} id 配置 id
     * @param {number} x 世界坐标
     * @param {number} y 世界坐标
     * @returns {object|null} 掉落物快照
     */
    arsenal.spawnDrop = function (kind, id, x, y) {
      var isWeapon = kind === 'weapon';
      var def = isWeapon ? weaponDefs[id] : itemDefs[id];
      if (!def) { return null; }

      var radius = isWeapon ? VISUAL.weaponRadius : VISUAL.itemRadius;
      var pos = clampWorld(
        num(x, world.width / 2),
        num(y, world.height / 2),
        radius + 8
      );

      var pickup = {
        uid: nextPickupId,
        kind: isWeapon ? 'weapon' : 'item',
        id: id,
        x: pos.x,
        y: pos.y,
        radius: radius,
        age: 0,
        phase: rng.float(0, TAU)
      };
      nextPickupId += 1;
      pickups.push(pickup);
      emitInventoryChanged('drop');
      return pickupSnapshot(pickup);
    };

    /**
     * App 在敌人死亡时转发（订阅契约事件 `enemy:killed` 后调用）。
     * 按 balance.drops.itemDropChance 判定是否掉落道具，并从 itemPool 中挑一个未满叠的道具。
     * @param {object} payload 契约载荷 { enemyId, type, x, y, exp }（额外 wave 可选）
     * @returns {object|null} 生成的掉落物快照；未掉落返回 null
     */
    arsenal.onEnemyKilled = function (payload) {
      payload = payload || {};
      if (payload.itemDrop === false) { return null; }

      var x = num(payload.x, null);
      var y = num(payload.y, null);
      if (x === null || y === null) { return null; }

      if (isNumber(payload.wave) && payload.wave > 0) {
        currentWaveIndex = Math.floor(payload.wave);
        /* 若 App 未单独转发波次开始，这里作为武器掉落的兜底触发点。 */
        maybeSpawnWeaponDrop(currentWaveIndex);
      }

      var chance = cfg.drops.itemDropChance;
      if (!(chance > 0)) { return null; }
      if (!rng.chance(chance)) { return null; }

      var itemId = pickItemDropId();
      if (!itemId) { return null; }
      return arsenal.spawnDrop('item', itemId, x, y);
    };

    /**
     * App 在波次开始时转发。达到 balance.drops.weaponDropWaveIndex 时，
     * 若尚未发放且未持有 weaponDropId，则在玩家附近生成武器掉落（每局一次）。
     * @param {number} waveIndex 从 1 开始的波次序号
     * @returns {object|null} 武器掉落物快照；未触发返回 null
     */
    arsenal.onWaveStarted = function (waveIndex) {
      return maybeSpawnWeaponDrop(waveIndex);
    };

    /**
     * 每个逻辑步更新：掉落物漂浮动画、玩家拾取判定、掉落物拾取反馈衰减。
     * @param {number} dt 秒
     * @param {object} [player] 可选玩家实体或状态快照；缺省经 ctx 解析
     */
    arsenal.update = function (dt, player) {
      var step = stepDelta(dt);
      if (step <= 0) { return arsenal; }

      var i;
      for (i = feedback.length - 1; i >= 0; i -= 1) {
        feedback[i].age += step;
        if (feedback[i].age >= feedback[i].life) { feedback.splice(i, 1); }
      }

      var state = null;
      var entity = null;
      if (player && typeof player.getState === 'function') {
        state = player.getState();
        entity = player;
      } else if (player && isNumber(player.x) && isNumber(player.y)) {
        state = player;
        entity = resolvePlayerEntity();
      } else {
        state = resolvePlayerState();
        entity = resolvePlayerEntity();
      }

      var magnet = state && isNumber(state.pickupRadius) ? state.pickupRadius : cfg.pickupRadius;
      var canCollect = !isPlayerDead(state);

      for (i = pickups.length - 1; i >= 0; i -= 1) {
        var pickup = pickups[i];
        pickup.age += step;

        if (!state || !isNumber(state.x) || !isNumber(state.y)) { continue; }
        if (!canCollect) { continue; }

        var dx = pickup.x - state.x;
        var dy = pickup.y - state.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > magnet + pickup.radius) { continue; }

        var result = collectPickup(pickup, entity);
        if (result && result.ok) {
          pickups.splice(i, 1);
          pushFeedback(pickup, result);
        } else if (result && result.reason === 'no-player') {
          /* 无玩家实体：保留掉落物，下一逻辑步重试。 */
          continue;
        } else {
          /* 未知 id 等异常掉落：移除，避免永久滞留。 */
          pickups.splice(i, 1);
        }
      }

      var waveFromContext = syncWaveFromContext();
      if (waveFromContext !== null) {
        maybeSpawnWeaponDrop(waveFromContext);
      }

      return arsenal;
    };

    /**
     * 世界坐标绘制地面掉落物与拾取反馈（形状绘制，无外部图片）。
     * @param {object} renderer WX.Engine.Renderer 实例
     */
    arsenal.render = function (renderer) {
      if (!renderer) { return arsenal; }

      var prevAlpha = typeof renderer.getAlpha === 'function' ? renderer.getAlpha() : 1;
      var i;

      for (i = 0; i < pickups.length; i += 1) {
        drawPickup(renderer, pickups[i]);
      }

      for (i = 0; i < feedback.length; i += 1) {
        var item = feedback[i];
        var t = item.life > 0 ? item.age / item.life : 1;
        var alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        renderer.setAlpha(prevAlpha * alpha);
        renderer.drawText(item.text, item.x, item.y - item.age * VISUAL.feedbackRiseSpeed, {
          size: 14,
          align: 'center',
          color: item.color,
          strokeColor: 'rgba(18, 12, 8, 0.9)',
          strokeWidth: 3
        });
      }

      renderer.setAlpha(prevAlpha);
      return arsenal;
    };

    /**
     * 重开本局：清空武器/道具层数、地面掉落与拾取反馈，恢复起始武器，重设掉落随机序列。
     * @param {object} [options] { seed }
     * @returns {object} 重开后的库存快照
     */
    arsenal.reset = function (options) {
      options = options || {};

      ownedWeapons = {};
      itemStacks = {};
      pickups = [];
      feedback = [];
      nextPickupId = 1;
      weaponDropDone = false;
      currentWaveIndex = 0;
      activeWeaponId = null;
      rng = createRandom(num(options.seed, defaultSeed()));

      if (startWeaponId && weaponDefs[startWeaponId]) {
        ownedWeapons[startWeaponId] = true;
        activeWeaponId = startWeaponId;
      }

      emitInventoryChanged('reset');
      emitModifiersChanged('reset');
      notifyWeaponChanged('reset');
      return arsenal.getInventory();
    };

    return arsenal;
  }

  /* ============================ 导出 ============================ */

  ArsenalNS.VERSION = VERSION;
  ArsenalNS.create = createArsenal;

  WX.Arsenal = ArsenalNS;
})(typeof window !== 'undefined' ? window : this);
