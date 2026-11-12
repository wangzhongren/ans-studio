/**
 * game/app/app.js
 * 模块：loop-app · 主循环、状态机与编排（挂 window.WX.App）
 *
 * 职责（架构契约 §3 / §5.3 / §5.4 / §5.6 / §6）：
 *   - requestAnimationFrame + 固定步长累加器（默认 1/60s，单帧 delta 截断 100ms）；
 *   - 状态机 BOOT → MENU → PLAYING ⇄ LEVEL_UP / PAUSED → GAME_OVER | VICTORY；
 *   - 波次/计时（WX.Config.waves），发 wave:started / wave:cleared；
 *   - 胜负与重开（run:ended / run:restart），window.blur 自动暂停；
 *   - 事件总线（WX.App.Bus）作为跨模块唯一通道，App 订阅并转交；
 *   - 只读视图快照（架构 §5.6）供 WX.UI 消费；
 *   - 驱动 player / combat / enemies / progression / arsenal（按契约 §5.5 最小接口）。
 *
 * 硬约束：
 *   - 经典 <script> + IIFE，挂载 window.WX.App；无 ES Module / import / export；
 *   - 无 fetch/XHR、无 CDN/外部字体/图片/音频、无构建链；
 *   - 只写本模块 game/app/，不改其他模块；事件名严格取自架构 §5.4，不新增。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var App = WX.App || (WX.App = {});

  var VERSION = '1.0.0';

  /** 架构契约 §5.3 冻结状态枚举。 */
  var STATES = {
    BOOT: 'BOOT',
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    LEVEL_UP: 'LEVEL_UP',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
    VICTORY: 'VICTORY'
  };

  var DEFAULT_STEP_SEC = 1 / 60;
  var DEFAULT_MAX_DELTA_SEC = 0.1;
  var DEFAULT_WORLD = { width: 1280, height: 720 };
  var MAX_STEPS_PER_FRAME = 6;

  var CANVAS_SELECTORS = ['#game-canvas', '#game', 'canvas'];

  /* 表现层常量（配色/排版），不属于平衡数值。 */
  var COLORS = {
    floor: '#12161c',
    grid: 'rgba(126, 146, 150, 0.07)',
    border: 'rgba(216, 199, 155, 0.30)',
    overlay: 'rgba(5, 7, 10, 0.55)',
    overlayDeep: 'rgba(5, 7, 10, 0.70)',
    title: '#f2ead4',
    subtitle: '#b9c3bd',
    shadow: 'rgba(0, 0, 0, 0.65)'
  };

  var GRID_STEP = 80;

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function num(value, fallback) {
    return isNumber(value) ? value : fallback;
  }

  function round(value, digits) {
    var p = Math.pow(10, digits || 0);
    return Math.round(value * p) / p;
  }

  /* ============================ 配置读取 ============================ */

  function readConfig() {
    var cfg = WX.Config || {};
    var balance = cfg.balance || {};
    var loopCfg = balance.loop || {};
    var worldCfg = balance.world || {};
    var runCfg = balance.run || {};
    var levelingCfg = balance.leveling || {};

    var waves = Array.isArray(cfg.waves) ? cfg.waves : [];
    var lastWaveEnd = 0;
    for (var i = 0; i < waves.length; i += 1) {
      var w = waves[i];
      if (w && isNumber(w.endSec) && w.endSec > lastWaveEnd) { lastWaveEnd = w.endSec; }
    }

    var stepSec = num(loopCfg.fixedStepSec, DEFAULT_STEP_SEC);
    if (!(stepSec > 0)) { stepSec = DEFAULT_STEP_SEC; }

    var maxDeltaSec = num(loopCfg.maxDeltaSec, DEFAULT_MAX_DELTA_SEC);
    if (!(maxDeltaSec > 0)) { maxDeltaSec = DEFAULT_MAX_DELTA_SEC; }

    var durationSec = num(runCfg.durationSec, lastWaveEnd);
    if (!(durationSec > 0)) { durationSec = lastWaveEnd; }

    return {
      raw: cfg,
      waves: waves,
      durationSec: durationSec,
      stepSec: stepSec,
      maxDeltaSec: maxDeltaSec,
      world: {
        width: Math.max(1, num(worldCfg.width, DEFAULT_WORLD.width)),
        height: Math.max(1, num(worldCfg.height, DEFAULT_WORLD.height))
      },
      expThresholds: Array.isArray(levelingCfg.expThresholds) ? levelingCfg.expThresholds : [],
      playerCfg: balance.player || {},
      drops: balance.drops || null,
      upgrades: Array.isArray(cfg.upgrades) ? cfg.upgrades : [],
      items: Array.isArray(cfg.items) ? cfg.items : [],
      weapons: Array.isArray(cfg.weapons) ? cfg.weapons : [],
      text: cfg.text || {}
    };
  }

  function findById(list, id) {
    if (!Array.isArray(list)) { return null; }
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) { return list[i]; }
    }
    return null;
  }

  /** 复制注入上下文并覆盖少量字段（不改动原 ctx 的其他模块视图）。 */
  function copyContext(base, extra) {
    var out = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) { out[key] = base[key]; }
    }
    if (extra) {
      for (key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) { out[key] = extra[key]; }
      }
    }
    return out;
  }

  /* ============================ 随机源 ============================ */

  function createRng(seed) {
    var M = WX.Engine && WX.Engine.Math;
    if (M && typeof M.createRandom === 'function') {
      return M.createRandom(seed);
    }
    /* 兜底（正常路径不会走到：WX.Engine 先于本模块加载且含 Math）。 */
    var state = (num(seed, 1) >>> 0) || 1;
    return {
      seed: state,
      next: function () {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      },
      float: function (a, b) {
        var lo = isNumber(a) ? a : 0;
        var hi = isNumber(b) ? b : lo;
        return lo + this.next() * (hi - lo);
      },
      int: function (a, b) {
        var lo = Math.ceil(num(a, 0));
        var hi = Math.floor(num(b, lo));
        return lo + Math.floor(this.next() * (hi - lo + 1));
      },
      chance: function (p) { return this.next() < (num(p, 0)); },
      pick: function (list) { return list && list.length ? list[Math.floor(this.next() * list.length)] : null; },
      weighted: function (list) { return this.pick(list); },
      shuffle: function (list, copy) {
        var arr = copy ? list.slice() : list;
        for (var i = arr.length - 1; i > 0; i -= 1) {
          var j = Math.floor(this.next() * (i + 1));
          var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
      }
    };
  }

  /* ============================ 实例工厂 ============================ */

  /**
   * @param {HTMLCanvasElement|string|undefined} canvasLike
   * @param {object} [options] { seed, canvas, fit }
   * @returns {object} app api
   */
  function createApp(canvasLike, options) {
    options = options || {};
    var config = readConfig();
    var Integration = App.Integration;
    var BusNS = App.Bus;

    if (!WX.Engine || typeof WX.Engine.create !== 'function') {
      throw new Error('[WX.App] 缺少 WX.Engine（请先加载 game/engine/）');
    }
    if (!Integration || typeof Integration.createDomain !== 'function') {
      throw new Error('[WX.App] 缺少 Integration 适配层（请先加载 game/app/integrations.js）');
    }
    if (!BusNS || typeof BusNS.create !== 'function') {
      throw new Error('[WX.App] 缺少 Bus（请先加载 game/app/bus.js）');
    }

    /* ---------------------------- 运行态 ---------------------------- */

    var state = STATES.BOOT;
    var running = false;
    var rafId = null;
    var lastTs = null;
    var accumulator = 0;
    var stepCount = 0;
    var elapsed = 0;
    var kills = 0;
    var expCollected = 0;
    var damageDealt = 0;
    var damageTaken = 0;
    var runCount = 0;
    var runSeed = 0;
    var rng = createRng((Date.now() & 0x7fffffff) || 1);
    var result = null;
    var uiErrorLogged = false;

    var upgradeChoices = [];
    var pendingLevelUps = [];
    var chosenUpgrades = [];
    var fallbackItems = [];
    var fallbackWeaponId = null;
    var weaponDropped = false;
    var choosingUpgrade = false;
    var modifiersCache = null;
    var modifiersDirty = true;

    /* ---------------------------- 引擎与总线 ---------------------------- */

    var canvasArg = resolveCanvasArg(canvasLike);
    var engine = WX.Engine.create(canvasArg, {
      fit: options.fit || 'contain',
      input: { target: global, preventDefault: true }
    });
    var world = engine.world && isNumber(engine.world.width)
      ? { width: engine.world.width, height: engine.world.height }
      : { width: config.world.width, height: config.world.height };

    var bus = BusNS.create({ strict: false });

    /* ---------------------------- 模块句柄 ---------------------------- */

    var player = null;
    var combat = null;
    var enemies = null;
    var progression = null;
    var arsenal = null;
    var ui = null;
    var scheduler = null;

    /* ctx 需要引用 api；先声明，boot 中赋值。 */
    var api = null;
    var ctx = null;
    var viewSource = null;

    /* ---------------------------- 通用访问器 ---------------------------- */

    function listEnemies() {
      return Integration.listEnemies(enemies);
    }

    function playerState() {
      if (player && typeof player.getState === 'function') {
        return player.getState();
      }
      return {
        x: world.width / 2,
        y: world.height / 2,
        radius: 15,
        hp: 0,
        maxHp: 0,
        level: 1,
        exp: 0,
        invulnerable: false,
        facing: -Math.PI / 2,
        alive: false,
        dead: true
      };
    }

    function progressionSnapshot() {
      return Integration.progressionState(progression, playerState());
    }

    function syncPlayerProgress() {
      if (!player || typeof player.setProgress !== 'function') { return; }
      var prog = progressionSnapshot();
      player.setProgress(prog.level, prog.exp);
    }

    function currentWaveNumber() {
      if (state === STATES.MENU || state === STATES.BOOT) { return 0; }
      if (!scheduler || !scheduler.hasWaves()) { return 0; }
      if (scheduler.current) { return scheduler.current.index; }
      if (scheduler.waveIndex >= 0 && scheduler.waves.length > 0) {
        var idx = Math.min(scheduler.waveIndex, scheduler.waves.length - 1);
        return scheduler.waves[idx].index;
      }
      return 0;
    }

    function thresholdFor(level) {
      var lv = Math.max(1, Math.floor(num(level, 1)));
      var thresholds = config.expThresholds;
      if (thresholds.length === 0) { return null; }
      if (lv - 1 < thresholds.length) { return thresholds[lv - 1]; }
      return null;
    }

    function startWeaponId() {
      return config.playerCfg.startWeaponId || null;
    }

    function currentWeaponId() {
      /* 唯一真源：arsenal.getActiveWeapon().id（兼容 getState().activeWeaponId）。 */
      var fromArsenal = Integration.arsenalWeaponId(arsenal);
      if (fromArsenal) { return fromArsenal; }
      return fallbackWeaponId || startWeaponId();
    }

    function currentWeaponConfig() {
      return findById(config.weapons, currentWeaponId());
    }

    /** 当前已持有武器 id 列表（arsenal 库存优先；缺失时用本地兜底）。 */
    function ownedWeaponIds() {
      if (arsenal) {
        if (typeof arsenal.getInventory === 'function') {
          var inv = arsenal.getInventory();
          if (inv && Array.isArray(inv.ownedWeaponIds)) { return inv.ownedWeaponIds.slice(); }
        }
        if (typeof arsenal.getWeaponList === 'function') {
          var list = arsenal.getWeaponList();
          var ids = [];
          for (var i = 0; i < list.length; i += 1) {
            if (list[i] && list[i].owned && typeof list[i].id === 'string') { ids.push(list[i].id); }
          }
          return ids;
        }
      }
      return fallbackWeaponId ? [fallbackWeaponId] : [];
    }

    /**
     * 把 arsenal 持有的武器同步进 combat 并切换 active。
     * 用 addWeapon（幂等、不重置既有冷却）+ setWeapon，避免 setWeapons 重建冷却。
     */
    function syncCombatWeapons() {
      if (!combat) { return false; }
      var ids = ownedWeaponIds();
      if (ids.length === 0) { return false; }
      var active = currentWeaponId();
      var i;

      if (typeof combat.addWeapon === 'function') {
        for (i = 0; i < ids.length; i += 1) { combat.addWeapon(ids[i]); }
        if (active && typeof combat.setWeapon === 'function') { combat.setWeapon(active); }
        return true;
      }
      if (typeof combat.setWeapons === 'function') {
        combat.setWeapons(ids);
        if (active && typeof combat.setWeapon === 'function') { combat.setWeapon(active); }
        return true;
      }
      return false;
    }

    /* ---------------------------- 修饰器聚合 ---------------------------- */

    function invalidateModifiers() {
      modifiersDirty = true;
      modifiersCache = null;
    }

    function upgradeModifierList() {
      var out = [];
      for (var i = 0; i < chosenUpgrades.length; i += 1) {
        var upgrade = findById(config.upgrades, chosenUpgrades[i]);
        if (upgrade && Array.isArray(upgrade.modifiers)) {
          out = out.concat(upgrade.modifiers);
        }
      }
      return out;
    }

    function itemModifierList() {
      var fromArsenal = Integration.arsenalModifiers(arsenal);
      if (fromArsenal) { return fromArsenal; }

      var ids = [];
      if (arsenal && typeof arsenal.getInventory === 'function') {
        var entries = Integration.inventoryEntries(arsenal);
        for (var i = 0; i < entries.length; i += 1) { ids.push(entries[i].id); }
      } else {
        ids = fallbackItems.slice();
      }

      var out = [];
      for (var j = 0; j < ids.length; j += 1) {
        var item = findById(config.items, ids[j]);
        if (item && Array.isArray(item.modifiers)) {
          out = out.concat(item.modifiers);
        }
      }
      return out;
    }

    /**
     * 当前生效的修饰器列表（与 WX.Config.upgrades[].modifiers 同构）。
     * 提供者优先：progression.getState().modifiers 若为数组则以其为准，
     * 否则用 App 记录的已选强化；道具修饰器取 arsenal 提供者，缺省用本地记录。
     */
    function getModifiers() {
      if (!modifiersDirty && modifiersCache) { return modifiersCache; }
      var mods = [];

      /* 强化修饰器：progression.getModifierList() 为权威数组（按层数展开）；
       * 缺省时才回退到 getState().modifiers 或 App 记录的已选强化。 */
      var progList = null;
      if (progression && typeof progression.getModifierList === 'function') {
        progList = progression.getModifierList();
      }
      if (Array.isArray(progList)) {
        mods = mods.concat(progList);
      } else {
        var prog = progressionSnapshot();
        if (prog.modifiers) {
          mods = mods.concat(prog.modifiers);
        } else {
          mods = mods.concat(upgradeModifierList());
        }
      }

      mods = mods.concat(itemModifierList());
      modifiersCache = mods;
      modifiersDirty = false;
      return mods;
    }

    /**
     * 聚合为 { add, mul, get(stat, base) }，便于 combat/arsenal 计算最终数值。
     * 契约未规定聚合形态，本方法为 App 侧便利扩展（不改契约接口）。
     */
    function getModifierStats() {
      var mods = getModifiers();
      var add = Object.create(null);
      var mul = Object.create(null);
      for (var i = 0; i < mods.length; i += 1) {
        var m = mods[i];
        if (!m || typeof m.stat !== 'string' || !isNumber(m.value)) { continue; }
        if (m.op === 'mul') {
          mul[m.stat] = (isNumber(mul[m.stat]) ? mul[m.stat] : 1) * m.value;
        } else {
          add[m.stat] = (isNumber(add[m.stat]) ? add[m.stat] : 0) + m.value;
        }
      }
      return {
        add: add,
        mul: mul,
        get: function (stat, base) {
          var b = isNumber(base) ? base : 0;
          var a = isNumber(add[stat]) ? add[stat] : 0;
          var mult = isNumber(mul[stat]) ? mul[stat] : 1;
          return b * mult + a;
        }
      };
    }

    /* ---------------------------- 战斗/生命转交 ---------------------------- */

    function applyDamage(enemy, amount) {
      if (!enemy) { return 0; }
      var dmg = isNumber(amount) && amount > 0 ? amount : 0;
      if (dmg <= 0) { return 0; }

      var dealt = 0;
      if (typeof enemy.takeDamage === 'function') {
        var r1 = enemy.takeDamage(dmg, 'player');
        dealt = isNumber(r1) ? r1 : dmg;
      } else if (typeof enemy.hit === 'function') {
        var r2 = enemy.hit(dmg);
        dealt = isNumber(r2) ? r2 : dmg;
      } else if (isNumber(enemy.hp)) {
        var before = enemy.hp;
        enemy.hp = Math.max(0, before - dmg);
        dealt = before - enemy.hp;
        if (enemy.hp <= 0 && enemy.dead !== true) { enemy.dead = true; }
      }
      damageDealt += dealt;
      return dealt;
    }

    function damagePlayer(amount, source) {
      if (!player || typeof player.takeDamage !== 'function') { return 0; }
      var actual = player.takeDamage(amount, source);
      if (isNumber(actual) && actual > 0) { damageTaken += actual; }
      return actual;
    }

    function healPlayer(amount) {
      if (!player || typeof player.heal !== 'function') { return 0; }
      return player.heal(amount);
    }

    /**
     * 击退转交（combat 经 ctx.applyKnockback 调用；dx/dy 已归一化，force 为力度）。
     * 只调用敌人公开入口，不直接改写敌人坐标/速度。
     */
    function applyKnockback(enemy, dx, dy, force) {
      if (!enemy) { return false; }
      var f = isNumber(force) ? force : 0;
      if (!(f > 0)) { return false; }
      if (typeof enemy.applyKnockback === 'function') {
        enemy.applyKnockback(dx, dy, f);
        return true;
      }
      if (typeof enemy.applyImpulse === 'function') {
        enemy.applyImpulse(dx * f, dy * f);
        return true;
      }
      return false;
    }

    /* ---------------------------- 道具 / 武器获取 ---------------------------- */

    function recordFallbackItem(id) {
      var item = findById(config.items, id);
      var maxStack = item && isNumber(item.maxStack) ? item.maxStack : 1;
      var count = 0;
      for (var i = 0; i < fallbackItems.length; i += 1) {
        if (fallbackItems[i] === id) { count += 1; }
      }
      if (count >= maxStack) { return false; }
      fallbackItems.push(id);
      return true;
    }

    /**
     * 获取道具：有 arsenal 时委托 grantItem；若 arsenal 未提供读取修饰器的通道
     * （getModifiers/getInventory），则本地记录/治疗作为兜底，避免效果丢失。
     */
    function grantItem(id) {
      if (!id) { return false; }
      var item = findById(config.items, id);
      var delegated = false;

      if (arsenal && typeof arsenal.grantItem === 'function') {
        arsenal.grantItem(id);
        delegated = true;
      }

      var hasProvider = arsenal && (
        typeof arsenal.getModifiers === 'function' ||
        typeof arsenal.getInventory === 'function'
      );

      if (!delegated || !hasProvider) {
        if (item && item.kind === 'consumable' && isNumber(item.heal)) {
          healPlayer(item.heal);
        } else {
          recordFallbackItem(id);
        }
      }

      invalidateModifiers();
      return true;
    }

    /**
     * 武器获取编排：
     *   - arsenal 存在：走 arsenal.grantWeapon(id)（只识别 weapons 配置），
     *     再由 onWeaponChanged 回调把武器同步进 combat；
     *   - arsenal 缺失：写本地兜底记录并直接 addWeapon/setWeapon 给 combat。
     */
    function grantWeapon(id) {
      if (!id) { return false; }

      if (arsenal && typeof arsenal.grantWeapon === 'function') {
        var granted = arsenal.grantWeapon(id, { source: 'app' });
        if (granted && granted.ok) {
          weaponDropped = true;
          syncCombatWeapons();
          invalidateModifiers();
          return true;
        }
        /* arsenal 判定为未知武器（配置外 id）时不静默视为成功。 */
        return false;
      }

      if (!weaponDropped) { weaponDropped = true; }
      fallbackWeaponId = id;
      if (combat && typeof combat.addWeapon === 'function') {
        combat.addWeapon(id);
        if (typeof combat.setWeapon === 'function') { combat.setWeapon(id); }
      }
      invalidateModifiers();
      return true;
    }

    function maybeDropItem() {
      var drops = config.drops;
      if (!drops) { return; }
      var chance = num(drops.itemDropChance, 0);
      if (!rng.chance(chance)) { return; }
      var pool = Array.isArray(drops.itemPool) ? drops.itemPool : [];
      if (pool.length === 0) { return; }
      var pickId = rng.pick(pool);
      if (pickId) { grantItem(pickId); }
    }

    /* ---------------------------- 事件处理 ---------------------------- */

    function handleEnemyKilled(payload) {
      kills += 1;
      if (!payload) { return; }
      var exp = num(payload.exp, 0);

      /* 掉落归 arsenal：存在即转交（掉落生成 + 拾取链路都在其内部）。 */
      if (arsenal && typeof arsenal.onEnemyKilled === 'function') {
        arsenal.onEnemyKilled(payload);
      } else {
        maybeDropItem(); /* arsenal 缺失时的本地兜底 */
      }

      /* 经验球归 progression：App 统一转交一次（创建时已关闭自动订阅）。 */
      if (progression) {
        if (typeof progression.handleEnemyKilled === 'function') {
          progression.handleEnemyKilled(payload);
        } else if (typeof progression.spawnExpDrop === 'function') {
          progression.spawnExpDrop(payload.x, payload.y, exp);
        } else if (typeof progression.addExp === 'function' && exp > 0) {
          progression.addExp(exp);
        }
      }

      syncPlayerProgress();
    }

    function handleExpPickup(payload) {
      expCollected += num(payload && payload.amount, 0);
    }

    function handleLevelUp(payload) {
      if (state !== STATES.PLAYING && state !== STATES.LEVEL_UP) { return; }
      var choices = payload && Array.isArray(payload.choices) ? payload.choices.slice() : [];
      pendingLevelUps.push({ level: num(payload && payload.level, null), choices: choices });
      if (state === STATES.PLAYING) { presentNextLevelUp(); }
    }

    function handleUpgradeChosen(payload) {
      /* choosingUpgrade 抑制 applyUpgrade 内可能同步发出的同帧重入（防一次升两级）。 */
      if (state !== STATES.LEVEL_UP || choosingUpgrade) { return; }
      chooseUpgrade(payload && payload.upgradeId);
    }

    function handleRunRestart() {
      restartRun();
    }

    function bindBus() {
      bus.on('enemy:killed', handleEnemyKilled);
      bus.on('exp:pickup', handleExpPickup);
      bus.on('level:up', handleLevelUp);
      bus.on('upgrade:chosen', handleUpgradeChosen);
      bus.on('run:restart', handleRunRestart);
    }

    /* ---------------------------- 升级选择 ---------------------------- */

    function presentNextLevelUp() {
      if (pendingLevelUps.length === 0) {
        if (state === STATES.LEVEL_UP) {
          state = STATES.PLAYING;
          setInputEnabled(true);
          accumulator = 0;
        }
        return;
      }

      var entry = pendingLevelUps[0];
      upgradeChoices = entry.choices.slice();
      state = STATES.LEVEL_UP;
      setInputEnabled(false);
      accumulator = 0;

      if (ui && typeof ui.showUpgrade === 'function') {
        try {
          ui.showUpgrade(upgradeChoices, function (id) { chooseUpgrade(id); });
          return;
        } catch (error) {
          if (global.console && global.console.error) {
            global.console.error('[WX.App] UI.showUpgrade 异常，回退自动选择', error);
          }
        }
      }
      /* 无 UI（或 UI 抛错）时自动选第一项，保证升级流程不冻结单局。 */
      chooseUpgrade(upgradeChoices.length > 0 ? upgradeChoices[0] : null);
    }

    function chooseUpgrade(id) {
      if (state !== STATES.LEVEL_UP) { return false; }

      var entry = pendingLevelUps.shift();
      if (!entry) {
        state = STATES.PLAYING;
        setInputEnabled(true);
        return false;
      }

      var chosen = null;
      if (typeof id === 'string' && entry.choices.indexOf(id) >= 0) {
        chosen = id;
      } else if (entry.choices.length > 0) {
        chosen = entry.choices[0];
      }

      if (chosen) {
        choosingUpgrade = true;
        try {
          if (progression && typeof progression.applyUpgrade === 'function') {
            progression.applyUpgrade(chosen);
          }
          chosenUpgrades.push(chosen);
          invalidateModifiers();
          if (player && typeof player.applyModifiers === 'function') {
            player.applyModifiers(getModifiers());
          }
        } finally {
          choosingUpgrade = false;
        }
      }

      if (ui && typeof ui.hideUpgrade === 'function') {
        try { ui.hideUpgrade(); } catch (error) {
          if (global.console && global.console.error) {
            global.console.error('[WX.App] UI.hideUpgrade 异常', error);
          }
        }
      }

      upgradeChoices = [];
      if (pendingLevelUps.length > 0) {
        presentNextLevelUp();
      } else {
        state = STATES.PLAYING;
        setInputEnabled(true);
        accumulator = 0;
      }
      return true;
    }

    /* ---------------------------- 波次 ---------------------------- */

    function handleWaveStarted(wave, info) {
      bus.emit('wave:started', {
        wave: wave.index,
        timeLeft: isNumber(info && info.timeLeft) ? info.timeLeft : 0
      });

      if (enemies && typeof enemies.spawnWave === 'function') {
        enemies.spawnWave(wave.index);
      }

      /* 武器掉落归 arsenal：由它按 weaponDropWaveIndex 在玩家附近生成地面掉落，
       * 拾取走 arsenal.update 的库存链路；缺失时才由 App 直接发放兜底。 */
      if (arsenal && typeof arsenal.onWaveStarted === 'function') {
        arsenal.onWaveStarted(wave.index);
      } else {
        var drops = config.drops;
        if (drops && drops.weaponDropId && isNumber(drops.weaponDropWaveIndex) &&
            wave.index >= drops.weaponDropWaveIndex && !weaponDropped) {
          grantWeapon(drops.weaponDropId);
        }
      }
    }

    function handleWaveCleared(wave) {
      bus.emit('wave:cleared', { wave: wave.index, timeLeft: 0 });
    }

    function handleWavesComplete() {
      finishRun('victory');
    }

    /* ---------------------------- 状态切换 ---------------------------- */

    function setInputEnabled(enabled) {
      if (engine && engine.input && typeof engine.input.setEnabled === 'function') {
        engine.input.setEnabled(enabled);
      }
    }

    function pause() {
      if (state !== STATES.PLAYING) { return false; }
      state = STATES.PAUSED;
      accumulator = 0;
      return true;
    }

    function resume() {
      if (state !== STATES.PAUSED) { return false; }
      state = STATES.PLAYING;
      accumulator = 0;
      lastTs = null;
      return true;
    }

    function togglePause() {
      if (state === STATES.PLAYING) { return pause(); }
      if (state === STATES.PAUSED) { return resume(); }
      return false;
    }

    function pollFrameInput() {
      if (!engine || !engine.input || typeof engine.input.wasPressed !== 'function') { return; }
      var pressed = engine.input.wasPressed;

      if (state === STATES.PLAYING || state === STATES.PAUSED) {
        if (pressed('escape') || pressed('p')) { togglePause(); }
        return;
      }

      /* 无 UI（或结果屏不可用）时的键盘兜底，便于静态走查/无界面运行。 */
      var hasResultUi = ui && typeof ui.showResult === 'function';
      if (!ui && state === STATES.MENU && (pressed('enter') || pressed(' '))) {
        startGame();
        return;
      }
      if (!hasResultUi && (state === STATES.GAME_OVER || state === STATES.VICTORY) &&
          (pressed('r') || pressed('enter'))) {
        restartRun();
      }
    }

    function onWindowBlur() {
      /* 架构 §5.3：window.blur 自动暂停（仅从 PLAYING 进入，升级面板不被打断）。 */
      pause();
    }

    function buildStats() {
      var ps = playerState();
      var prog = progressionSnapshot();
      return {
        kills: kills,
        level: num(prog.level, 1),
        exp: num(prog.exp, 0),
        elapsed: round(elapsed, 1),
        wave: currentWaveNumber(),
        wavesCleared: scheduler ? scheduler.clearedCount() : 0,
        hp: round(num(ps.hp, 0), 1),
        maxHp: round(num(ps.maxHp, 0), 1),
        damageDealt: Math.round(damageDealt),
        damageTaken: Math.round(damageTaken),
        expCollected: Math.round(expCollected)
      };
    }

    function finishRun(resultString) {
      if (state === STATES.GAME_OVER || state === STATES.VICTORY) { return false; }
      var outcome = resultString === 'victory' ? 'victory' : 'defeat';

      state = outcome === 'victory' ? STATES.VICTORY : STATES.GAME_OVER;
      accumulator = 0;
      upgradeChoices = [];
      pendingLevelUps.length = 0;
      /* UI 结果屏可用时由 DOM 接管重开；否则保留键盘（R/Enter）兜底。 */
      var hasResultUi = ui && typeof ui.showResult === 'function';
      setInputEnabled(!hasResultUi);

      var stats = buildStats();
      result = { result: outcome, stats: stats };

      if (ui && typeof ui.hideUpgrade === 'function') {
        try { ui.hideUpgrade(); } catch (error) { /* 面板已关闭/未打开 */ }
      }

      bus.emit('run:ended', { result: outcome, stats: stats });

      /* 监听器可能在 run:ended 内同步触发 run:restart；此时新局已开始，不再弹旧结果。 */
      if (state !== STATES.GAME_OVER && state !== STATES.VICTORY) { return true; }

      if (ui && typeof ui.showResult === 'function') {
        try {
          ui.showResult({ result: outcome, stats: stats }, function () { restartRun(); });
        } catch (error) {
          if (global.console && global.console.error) {
            global.console.error('[WX.App] UI.showResult 异常', error);
          }
        }
      }
      return true;
    }

    function resetRun() {
      runCount += 1;
      runSeed = isNumber(options.seed)
        ? (options.seed + runCount) >>> 0
        : ((Date.now() ^ Math.imul(runCount, 2654435761)) >>> 0);
      rng = createRng(runSeed);

      chosenUpgrades.length = 0;
      fallbackItems.length = 0;
      pendingLevelUps.length = 0;
      upgradeChoices = [];
      kills = 0;
      expCollected = 0;
      damageDealt = 0;
      damageTaken = 0;
      weaponDropped = false;
      fallbackWeaponId = null;
      result = null;
      stepCount = 0;
      elapsed = 0;
      accumulator = 0;
      lastTs = null;
      invalidateModifiers();

      /* 关掉上一局可能残留的升级/结算面板（UI 可选扩展，缺失则跳过）。 */
      if (ui) {
        if (typeof ui.hideUpgrade === 'function') {
          try { ui.hideUpgrade(); } catch (error) { /* 面板未打开 */ }
        }
        if (typeof ui.hideResult === 'function') {
          try { ui.hideResult(); } catch (error) { /* 面板未打开 */ }
        }
      }

      if (player && typeof player.reset === 'function') { player.reset(); }
      Integration.resetDomain(combat);
      Integration.resetDomain(enemies);
      Integration.resetDomain(progression);
      Integration.resetDomain(arsenal);

      if (player && typeof player.applyModifiers === 'function') {
        player.applyModifiers([]);
      }

      /* arsenal.reset 已恢复起始武器；再同步一次 combat，确保装备与 active 一致。 */
      syncCombatWeapons();

      state = STATES.PLAYING;
      setInputEnabled(true);
      syncPlayerProgress();

      if (scheduler) { scheduler.reset(); scheduler.begin(); }
    }

    function startGame() {
      if (state === STATES.PLAYING || state === STATES.LEVEL_UP || state === STATES.PAUSED) {
        return false;
      }
      resetRun();
      return true;
    }

    function restartRun() {
      resetRun();
      return true;
    }

    /* ---------------------------- 主循环 ---------------------------- */

    function stepWorld(step) {
      stepCount += 1;
      elapsed = stepCount * step;

      if (player && typeof player.update === 'function') {
        player.update(step, engine.input);
      }
      Integration.updateDomain(enemies, step);
      if (combat && typeof combat.update === 'function') {
        combat.update(step, listEnemies());
      }
      Integration.updateDomain(progression, step, playerState());
      Integration.updateDomain(arsenal, step, playerState());

      /* 即使本步触发升级冻结，也先把等级/经验同步给玩家实体（供快照/战斗读取）。 */
      syncPlayerProgress();

      /* 死亡优先于升级冻结：气血归零立即结算失败。 */
      var ps = playerState();
      if (ps && (ps.dead === true || (isNumber(ps.hp) && ps.hp <= 0 && player))) {
        finishRun('defeat');
        return;
      }
      if (state !== STATES.PLAYING) { return; }

      if (scheduler) {
        scheduler.update(elapsed);
        if (state !== STATES.PLAYING) { return; }
      } else if (config.durationSec > 0 && elapsed >= config.durationSec) {
        finishRun('victory');
        return;
      }
    }

    function frame(timestamp) {
      if (!running) { return; }
      rafId = global.requestAnimationFrame(frame);

      var ts = isNumber(timestamp) ? timestamp : Date.now();
      var delta = lastTs === null ? 0 : (ts - lastTs) / 1000;
      lastTs = ts;
      if (!(delta > 0)) { delta = 0; }
      if (delta > config.maxDeltaSec) { delta = config.maxDeltaSec; }

      if (engine.camera && typeof engine.camera.update === 'function') {
        engine.camera.update(delta);
      }

      pollFrameInput();

      if (state === STATES.PLAYING) {
        accumulator += delta;
        var steps = 0;
        while (accumulator >= config.stepSec && steps < MAX_STEPS_PER_FRAME &&
               state === STATES.PLAYING) {
          stepWorld(config.stepSec);
          accumulator -= config.stepSec;
          steps += 1;
        }
        if (steps >= MAX_STEPS_PER_FRAME) {
          /* 落后过多时丢弃余量，避免“死亡螺旋”。 */
          accumulator = 0;
        }
      } else {
        accumulator = 0;
      }

      renderFrame();
      updateUi();

      engine.endFrame();
    }

    function startLoop() {
      if (running) { return; }
      if (typeof global.requestAnimationFrame !== 'function') {
        if (global.console && global.console.error) {
          global.console.error('[WX.App] 环境缺少 requestAnimationFrame，无法启动主循环');
        }
        return;
      }
      running = true;
      lastTs = null;
      accumulator = 0;
      rafId = global.requestAnimationFrame(frame);
    }

    function stopLoop() {
      running = false;
      if (rafId !== null && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(rafId);
      }
      rafId = null;
      lastTs = null;
    }

    /* ---------------------------- 渲染 ---------------------------- */

    function drawArena(renderer) {
      if (!renderer) { return; }
      renderer.fillScreen(COLORS.floor);

      var x;
      var y;
      for (x = GRID_STEP; x < world.width; x += GRID_STEP) {
        renderer.drawLine(x, 0, x, world.height, COLORS.grid, 1);
      }
      for (y = GRID_STEP; y < world.height; y += GRID_STEP) {
        renderer.drawLine(0, y, world.width, y, COLORS.grid, 1);
      }
      renderer.strokeRect(8, 8, world.width - 16, world.height - 16, COLORS.border, 2);
    }

    function drawCenteredText(renderer, text, y, size, color) {
      if (!renderer || !text) { return; }
      renderer.drawText(String(text), world.width / 2, y, {
        size: size,
        color: color,
        align: 'center',
        baseline: 'middle',
        strokeColor: COLORS.shadow,
        strokeWidth: 4
      });
    }

    function drawFallbackOverlay(renderer) {
      var text = config.text || {};
      if (state === STATES.MENU || state === STATES.BOOT) {
        renderer.fillScreen(COLORS.overlayDeep);
        drawCenteredText(renderer, text.title || '江湖夜雨', world.height * 0.40, 54, COLORS.title);
        drawCenteredText(renderer, text.subtitle || '', world.height * 0.50, 20, COLORS.subtitle);
        drawCenteredText(renderer, '（未检测到 WX.UI：可在控制台调用 WX.App.startGame() 开局）',
          world.height * 0.62, 15, COLORS.subtitle);
        return;
      }
      if (state === STATES.PAUSED) {
        renderer.fillScreen(COLORS.overlay);
        var paused = (text.states && text.states.pausedTitle) || '静息';
        var hint = (text.states && text.states.pausedHint) || '按 P / Esc 继续';
        drawCenteredText(renderer, paused, world.height * 0.44, 46, COLORS.title);
        drawCenteredText(renderer, hint, world.height * 0.54, 18, COLORS.subtitle);
        return;
      }
      if (state === STATES.LEVEL_UP) {
        renderer.fillScreen(COLORS.overlay);
        var lvTitle = (text.levelUp && text.levelUp.title) || '顿悟';
        drawCenteredText(renderer, lvTitle, world.height * 0.44, 44, COLORS.title);
        return;
      }
      if (state === STATES.GAME_OVER || state === STATES.VICTORY) {
        renderer.fillScreen(COLORS.overlayDeep);
        var res = text.result || {};
        var title = state === STATES.VICTORY ? (res.victoryTitle || '名震江湖') : (res.defeatTitle || '身死道消');
        drawCenteredText(renderer, title, world.height * 0.42, 50, COLORS.title);
        drawCenteredText(renderer, '斩敌 ' + kills + ' · 存活 ' + Math.floor(elapsed) + ' 秒',
          world.height * 0.53, 18, COLORS.subtitle);
        drawCenteredText(renderer, '按 R 或在控制台调用 WX.App.startGame() 再战',
          world.height * 0.62, 15, COLORS.subtitle);
      }
    }

    function renderFrame() {
      if (!engine || typeof engine.beginFrame !== 'function') { return; }
      engine.beginFrame();
      var renderer = engine.renderer;

      drawArena(renderer);

      if (state === STATES.MENU || state === STATES.BOOT) {
        if (!ui) { drawFallbackOverlay(renderer); }
        else { renderer.fillScreen(COLORS.overlay); }
        return;
      }

      Integration.renderDomain(progression, renderer);
      Integration.renderDomain(enemies, renderer);
      Integration.renderDomain(combat, renderer);
      if (player && typeof player.render === 'function') {
        player.render(renderer);
      }
      Integration.renderDomain(arsenal, renderer);

      if (state === STATES.LEVEL_UP) {
        renderer.fillScreen(COLORS.overlay);
        if (!ui) { drawFallbackOverlay(renderer); }
      } else if (state === STATES.PAUSED) {
        renderer.fillScreen(COLORS.overlay);
        if (!ui) { drawFallbackOverlay(renderer); }
      } else if (state === STATES.GAME_OVER || state === STATES.VICTORY) {
        renderer.fillScreen(COLORS.overlayDeep);
        if (!ui) { drawFallbackOverlay(renderer); }
      }
    }

    function updateUi() {
      if (!ui || typeof ui.render !== 'function') { return; }
      try {
        ui.render(getSnapshot());
      } catch (error) {
        if (!uiErrorLogged) {
          uiErrorLogged = true;
          if (global.console && global.console.error) {
            global.console.error('[WX.App] UI.render 异常（后续同错误静默）', error);
          }
        }
      }
    }

    /* ---------------------------- 视图快照 ---------------------------- */

    function getSnapshot() {
      var ps = playerState();
      var prog = progressionSnapshot();
      var level = Math.max(1, Math.floor(num(prog.level, num(ps.level, 1))));
      var exp = Math.max(0, num(prog.exp, num(ps.exp, 0)));
      var expToNext = prog.expToNext;
      if (!isNumber(expToNext)) { expToNext = thresholdFor(level); }

      return {
        state: state,
        hp: num(ps.hp, 0),
        maxHp: num(ps.maxHp, 0),
        level: level,
        exp: exp,
        expToNext: expToNext,
        wave: currentWaveNumber(),
        timeLeft: scheduler ? scheduler.runTimeLeft() : Math.max(0, config.durationSec - elapsed),
        elapsed: elapsed,
        kills: kills,
        upgradeChoices: upgradeChoices.slice(),
        result: result ? result.result : null,
        stats: result ? result.stats : null
      };
    }

    /* ---------------------------- 上下文 ---------------------------- */

    function buildContext() {
      ctx = {
        /* 事件总线（架构 §5.4：跨模块唯一通道）。 */
        bus: bus,
        events: bus,
        emit: function (name, payload) { return bus.emit(name, payload); },
        publish: function (name, payload) { return bus.emit(name, payload); },
        on: bus.on,
        off: bus.off,

        /* 只读配置与运行环境。 */
        config: config.raw,
        world: { width: world.width, height: world.height },
        engine: engine,
        renderer: engine.renderer,
        input: engine.input,
        app: api,

        /* 玩家。 */
        getPlayer: function () { return player; },
        getPlayerState: playerState,
        getPlayerModifiers: function () { return getModifiers(); },
        getModifiers: function () { return getModifiers(); },
        getModifierStats: getModifierStats,
        applyDamage: applyDamage,
        damagePlayer: damagePlayer,
        healPlayer: healPlayer,
        applyKnockback: applyKnockback,

        /* 敌人 / 战场。 */
        getEnemies: listEnemies,
        getEnemyList: listEnemies,
        getWaveIndex: currentWaveNumber,

        /* 领域模块变更回调（arsenal/progression 的 ctx 约定）。 */
        onWeaponChanged: function () {
          syncCombatWeapons();
          invalidateModifiers();
        },
        onInventoryChanged: function () { invalidateModifiers(); },
        onModifiersChanged: function () { invalidateModifiers(); },

        /* 道具 / 武器（App 编排获取）。 */
        grantItem: grantItem,
        getWeaponId: currentWeaponId,
        getWeapon: currentWeaponConfig,
        getWeapons: function () { return config.weapons.slice(); },

        /* 状态与快照。 */
        getState: function () { return state; },
        getSnapshot: getSnapshot,
        isPlaying: function () { return state === STATES.PLAYING; },

        /* 可复现随机源（每局重置种子）。 */
        random: {
          next: function () { return rng.next(); },
          float: function (a, b) { return rng.float(a, b); },
          int: function (a, b) { return rng.int(a, b); },
          chance: function (p) { return rng.chance(p); },
          pick: function (list) { return rng.pick(list); },
          weighted: function (list, w) { return rng.weighted(list, w); },
          shuffle: function (list, copy) { return rng.shuffle(list, copy); }
        }
      };
      return ctx;
    }

    /* ---------------------------- API ---------------------------- */

    api = {
      VERSION: VERSION,
      states: STATES,
      world: world,
      bus: bus,
      engine: engine,
      canvas: engine.canvas,
      context: null,

      getSnapshot: getSnapshot,
      getState: getSnapshot,
      getView: getSnapshot,

      startGame: startGame,
      restart: restartRun,
      pause: pause,
      resume: resume,
      togglePause: togglePause,
      chooseUpgrade: chooseUpgrade,

      isRunning: function () { return running; },
      isPlaying: function () { return state === STATES.PLAYING; },
      currentState: function () { return state; },

      grantItem: grantItem,
      grantWeapon: grantWeapon,
      applyDamage: applyDamage,
      damagePlayer: damagePlayer,
      healPlayer: healPlayer,
      getModifiers: getModifiers,
      getModifierStats: getModifierStats,

      getPlayer: function () { return player; },
      getPlayerState: playerState,
      getEnemies: listEnemies,
      getScheduler: function () { return scheduler; },
      getRandom: function () { return rng; },

      player: null,
      combat: null,
      enemies: null,
      progression: null,
      arsenal: null,
      ui: null,

      destroy: destroy
    };

    Object.defineProperty(api, 'state', {
      enumerable: true,
      get: function () { return state; }
    });

    buildContext();
    api.context = ctx;

    /* ---------------------------- 模块装配 ---------------------------- */

    player = Integration.createDomain('Player', ctx);
    combat = Integration.createDomain('Combat', ctx);
    enemies = Integration.createDomain('Enemies', ctx);

    /* progression 关闭自动订阅 enemy:killed：由 App.handleEnemyKilled 统一转交一次，
     * 避免“自动订阅 + App.spawnExpDrop”导致每次击杀生成两枚经验球。 */
    var progressionCtx = copyContext(ctx, { autoSubscribeEnemyKilled: false });
    progression = Integration.createDomain('Progression', progressionCtx);

    arsenal = Integration.createDomain('Arsenal', ctx);

    /* 武器真源为 arsenal：把其持有的武器同步进 combat（起始武器已由 combat 自载，幂等）。 */
    syncCombatWeapons();

    api.player = player;
    api.combat = combat;
    api.enemies = enemies;
    api.progression = progression;
    api.arsenal = arsenal;

    /* 波次调度：先建好回调，begin() 在 startGame/restart 时调用。 */
    if (App.WaveScheduler && typeof App.WaveScheduler.create === 'function') {
      scheduler = App.WaveScheduler.create({
        waves: config.waves,
        durationSec: config.durationSec,
        onWaveStarted: handleWaveStarted,
        onWaveCleared: handleWaveCleared,
        onComplete: handleWavesComplete
      });
    }

    bindBus();

    /* UI 绑定：只读视图快照 + 受控回调（架构 §5.5 / §5.6）。 */
    viewSource = api;
    ui = Integration.createUI(viewSource);
    api.ui = ui;

    /* ---------------------------- 生命周期 ---------------------------- */

    function destroy() {
      stopLoop();
      if (typeof global.removeEventListener === 'function') {
        global.removeEventListener('blur', onWindowBlur);
      }
      bus.clear();
      if (engine && typeof engine.destroy === 'function') { engine.destroy(); }
    }

    setInputEnabled(true);
    state = STATES.MENU;

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('blur', onWindowBlur);
    }

    startLoop();

    /* 首帧渲染：不依赖 rAF 时序，便于 A12 打开立即看到静态背景。 */
    renderFrame();
    updateUi();
    engine.endFrame();

    return api;
  }

  /* ============================ Canvas 解析 ============================ */

  function resolveCanvasArg(canvasLike) {
    if (canvasLike) { return canvasLike; }
    var doc = global.document;
    if (!doc || typeof doc.querySelector !== 'function') { return undefined; }
    for (var i = 0; i < CANVAS_SELECTORS.length; i += 1) {
      var el = doc.querySelector(CANVAS_SELECTORS[i]);
      if (el) { return el; }
    }
    return undefined; /* 交给 Engine.create 自动创建并挂 body */
  }

  /* ============================ 单例与入口 ============================ */

  var instance = null;
  var pendingStart = false;
  var pendingArgs = null;

  function internalStart(canvasLike, options) {
    instance = createApp(canvasLike, options);
    return instance;
  }

  /**
   * 启动入口（index.html 调用）。幂等：重复调用返回同一实例。
   * DOM 尚未就绪时延迟到 DOMContentLoaded（入口脚本通常已在 body 末尾）。
   */
  App.start = function (canvasLike, options) {
    if (instance) { return instance; }

    if (typeof global.document !== 'undefined' && global.document.readyState === 'loading') {
      if (!pendingStart) {
        pendingStart = true;
        pendingArgs = { canvasLike: canvasLike, options: options };
        global.document.addEventListener('DOMContentLoaded', function onReady() {
          global.document.removeEventListener('DOMContentLoaded', onReady);
          pendingStart = false;
          var args = pendingArgs || {};
          pendingArgs = null;
          if (!instance) {
            try {
              internalStart(args.canvasLike, args.options);
            } catch (error) {
              if (global.console && global.console.error) {
                global.console.error('[WX.App] 延迟启动失败', error);
              }
            }
          }
        });
      }
      return App;
    }

    return internalStart(canvasLike, options);
  };

  function requireInstance() {
    if (!instance) {
      throw new Error('[WX.App] 尚未启动：请先调用 WX.App.start()');
    }
    return instance;
  }

  App.VERSION = VERSION;
  App.STATES = STATES;
  App.States = STATES;
  App.EVENT_NAMES = App.Bus && App.Bus.EVENT_NAMES ? App.Bus.EVENT_NAMES.slice() : [];

  App.getInstance = function () { return instance; };
  App.isRunning = function () { return !!instance && instance.isRunning(); };
  App.getSnapshot = function () { return instance ? instance.getSnapshot() : null; };
  App.getState = App.getSnapshot;
  App.getView = App.getSnapshot;
  App.startGame = function () { return requireInstance().startGame(); };
  App.restart = function () { return requireInstance().restart(); };
  App.pause = function () { return requireInstance().pause(); };
  App.resume = function () { return requireInstance().resume(); };
  App.togglePause = function () { return requireInstance().togglePause(); };
  App.chooseUpgrade = function (id) { return requireInstance().chooseUpgrade(id); };
  App.destroy = function () {
    if (instance && typeof instance.destroy === 'function') { instance.destroy(); }
    instance = null;
  };

  /* 调试/测试辅助：不改运行态，仅暴露纯函数工具。 */
  App.thresholdFor = function (level) {
    var cfg = WX.Config || {};
    var thresholds = cfg.balance && cfg.balance.leveling && cfg.balance.leveling.expThresholds;
    if (!Array.isArray(thresholds)) { return null; }
    var lv = Math.max(1, Math.floor(num(level, 1)));
    return lv - 1 < thresholds.length ? thresholds[lv - 1] : null;
  };

  WX.App = App;
})(typeof window !== 'undefined' ? window : this);
