/**
 * game/progression/progression.js
 * 模块：progression（经验与强化）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责（架构契约 §3 / §5.4 / §5.5）：
 *   - 经验掉落：消费 `enemy:killed`（载荷 `{ enemyId, type, x, y, exp }`），
 *     在敌人死亡处生成经验球（半径/寿命/吸附速度取自 WX.Config）；
 *   - 经验拾取：玩家进入 pickupRadius 后吸附，接触即拾取并累加经验，
 *     拾取时经事件总线发 `exp:pickup`（载荷 `{ amount }`）；
 *   - 等级：累计经验达到 `balance.leveling.expThresholds` 阈值时升级并发
 *     `level:up`（载荷 `{ level, choices: [upgradeId] }`），`maxLevel` 封顶；
 *   - 三选一：从 `WX.Config.upgrades` 按 weight 加权无放回抽取
 *     `balance.leveling.choiceCount` 项（排除已达 maxStack 的项）；
 *   - 强化生效：选择后维护每项已选层数，产出聚合属性修饰器，
 *     供 App / player / combat / arsenal 消费（不直接改其他领域模块内部状态）；
 *   - 重开：`reset()` 清空本局经验/等级/强化层数/经验球。
 *
 * 公开契约（架构契约 §5.5）：
 *   WX.Progression.create(ctx) -> {
 *     addExp(n), rollChoices(count), applyUpgrade(id), getState()
 *   }
 *   本模块按“最小约定”补充：update / render / handleEnemyKilled / spawnExpDrop /
 *   chooseUpgrade / handleUpgradeChosen / applyModifiers / getModifiers /
 *   getModifierList / getModifiersFor / getChoiceDetails / getUpgradeInfo /
 *   getOrbs / reset / destroy。
 *
 * 事件（仅契约 §5.4 已登记，不新增）：
 *   - `exp:pickup`     本模块 → app/ui       载荷 `{ amount }`（已计入 expGain 修饰器）
 *   - `level:up`       本模块 → app/ui       载荷 `{ level, choices: [upgradeId] }`
 *   - `upgrade:chosen` ui → app/progression  载荷 `{ upgradeId }`
 *       入站事件；App 收到后调用 `applyUpgrade(id)`。若由本模块统一广播，
 *       使用 `chooseUpgrade(id)`（先广播 `upgrade:chosen` 再应用，载荷仍只有 `{ upgradeId }`）。
 *
 * 依赖（架构契约 §4）：只读 WX.Config 与 WX.Engine（Math/Collision/Pool/Renderer 公开 API）；
 * 不直接 import 其他领域模块，跨模块一律经注入的 ctx 与事件总线。
 *
 * 归属说明：武器/道具掉落（`balance.drops.itemDropChance` / `itemPool` /
 * `weaponDropWaveIndex`）归 arsenal（`game/items/`，架构 §3「武器/道具获取」），
 * 本模块不重复实现，只负责经验掉落与拾取。
 *
 * 硬约束：经典 <script> + IIFE，挂 window.WX.Progression；无 ES Module、
 * 无 fetch/XHR、无外部资源、无构建链；不操作 DOM。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var ProgressionNS = WX.Progression || (WX.Progression = {});

  var VERSION = '1.0.0';
  var EPSILON = 1e-6;

  /*
   * 以下兜底值仅在 WX.Config 缺失或字段非法时生效；正常路径一律读 WX.Config，
   * 不在模块内维护一份可调平衡数值（与 player 模块相同约定）。
   */
  var FALLBACK = {
    maxLevel: 15,
    choiceCount: 3,
    expThresholds: [8, 18, 30, 45, 63, 85, 111, 141, 175, 213, 255, 301, 351, 405, 463],
    expOrbRadius: 5,
    expOrbLifetimeSec: 25,
    expMagnetSpeed: 340,
    pickupRadius: 80,
    worldWidth: 1280,
    worldHeight: 720,
    maxStepSec: 0.1
  };

  /* 表现层配色与节奏（非平衡数值）。 */
  var COLORS = {
    glow: 'rgba(190, 235, 255, 0.22)',
    core: '#eaf7ff',
    ring: 'rgba(150, 220, 255, 0.85)',
    trail: 'rgba(190, 235, 255, 0.55)',
    text: '#eaf7ff',
    textStroke: 'rgba(10, 22, 32, 0.75)'
  };

  var ORB_POOL_INITIAL = 24;
  var ORB_POOL_MAX = 512;
  var FLOATER_LIFE = 0.85;
  var FLOATER_RISE = 34;
  var FLOATER_LIMIT = 48;
  var PAYLOAD_MEMORY = 32;

  /*
   * 聚合对象形态的修饰器里，数值若不带 op 时按 config-data 的约定判定：
   * 这些 stat 为加算，其余为乘算（见 game/data/config.js 头部说明）。
   */
  var ADD_STATS = { damage: true, maxHp: true, critChance: true };

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

  function round2(value) {
    if (!isNumber(value)) { return 0; }
    return Math.round(value * 100) / 100;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /* ============================ 配置读取 ============================ */

  /** 归一化强化池：只保留结构合法的条目，modifiers 统一为 `{stat, op, value}`。 */
  function readUpgrades(cfg) {
    var list = [];
    var src = cfg && Array.isArray(cfg.upgrades) ? cfg.upgrades : [];
    for (var i = 0; i < src.length; i += 1) {
      var raw = src[i];
      if (!raw || typeof raw.id !== 'string' || raw.id === '') { continue; }

      var modifiers = [];
      if (Array.isArray(raw.modifiers)) {
        for (var j = 0; j < raw.modifiers.length; j += 1) {
          var mod = raw.modifiers[j];
          if (!mod || typeof mod.stat !== 'string' || !isNumber(mod.value)) { continue; }
          modifiers.push({
            stat: mod.stat,
            op: mod.op === 'mul' ? 'mul' : 'add',
            value: mod.value
          });
        }
      }

      list.push({
        id: raw.id,
        name: typeof raw.name === 'string' ? raw.name : raw.id,
        description: typeof raw.description === 'string' ? raw.description : '',
        weight: Math.max(0, num(raw.weight, 1)),
        maxStack: Math.max(1, Math.floor(num(raw.maxStack, 1))),
        modifiers: modifiers
      });
    }
    return list;
  }

  /** 读取本模块需要的只读配置（架构契约 §5.7：数值全部来自 config-data）。 */
  function readConfig() {
    var cfg = WX.Config || {};
    var balance = cfg.balance || {};
    var leveling = balance.leveling || {};
    var drops = balance.drops || {};
    var playerCfg = balance.player || {};
    var worldCfg = balance.world || {};
    var loopCfg = balance.loop || {};

    var thresholds = [];
    if (Array.isArray(leveling.expThresholds)) {
      for (var i = 0; i < leveling.expThresholds.length; i += 1) {
        var t = leveling.expThresholds[i];
        if (isNumber(t) && t > 0) { thresholds.push(t); }
      }
    }
    if (thresholds.length === 0) {
      thresholds = FALLBACK.expThresholds.slice();
    }

    var maxLevel = Math.max(1, Math.floor(num(leveling.maxLevel, FALLBACK.maxLevel)));
    if (thresholds.length + 1 < maxLevel) {
      /* 阈值表不足时以可升级次数封顶，避免出现无阈值可用的等级。 */
      maxLevel = thresholds.length + 1;
    }

    var upgrades = readUpgrades(cfg);
    var upgradeById = {};
    for (var u = 0; u < upgrades.length; u += 1) {
      upgradeById[upgrades[u].id] = upgrades[u];
    }

    var maxStep = num(loopCfg.maxDeltaSec, FALLBACK.maxStepSec);
    if (!(maxStep > 0)) { maxStep = FALLBACK.maxStepSec; }

    return {
      maxLevel: maxLevel,
      choiceCount: Math.max(0, Math.floor(num(leveling.choiceCount, FALLBACK.choiceCount))),
      thresholds: thresholds,
      upgrades: upgrades,
      upgradeById: upgradeById,
      expOrbRadius: Math.max(1, num(drops.expOrbRadius, FALLBACK.expOrbRadius)),
      expOrbLifetimeSec: Math.max(0.1, num(drops.expOrbLifetimeSec, FALLBACK.expOrbLifetimeSec)),
      magnetSpeed: Math.max(0, num(drops.expMagnetSpeed,
        num(playerCfg.expMagnetSpeed, FALLBACK.expMagnetSpeed))),
      basePickupRadius: Math.max(0, num(playerCfg.pickupRadius, FALLBACK.pickupRadius)),
      worldWidth: Math.max(1, num(worldCfg.width, FALLBACK.worldWidth)),
      worldHeight: Math.max(1, num(worldCfg.height, FALLBACK.worldHeight)),
      maxStepSec: maxStep
    };
  }

  /* ============================ 经验球对象池 ============================ */

  function newOrbObject() {
    return {
      active: false,
      x: 0,
      y: 0,
      amount: 0,
      radius: FALLBACK.expOrbRadius,
      age: 0,
      life: FALLBACK.expOrbLifetimeSec,
      magnet: false,
      vx: 0,
      vy: 0,
      phase: 0
    };
  }

  /** Engine.Pool 缺失时的等价兜底池（同一套 acquire/release/forEachActive 语义）。 */
  function createSimplePool() {
    var active = [];
    var free = [];

    return {
      acquire: function () {
        var obj = free.length > 0 ? free.pop() : newOrbObject();
        obj.active = true;
        active.push(obj);
        return obj;
      },
      release: function (obj) {
        var idx = active.indexOf(obj);
        if (idx === -1) { return false; }
        active.splice(idx, 1);
        obj.active = false;
        if (free.length < ORB_POOL_MAX) { free.push(obj); }
        return true;
      },
      releaseAll: function () {
        while (active.length > 0) {
          var obj = active.pop();
          obj.active = false;
          if (free.length < ORB_POOL_MAX) { free.push(obj); }
        }
      },
      forEachActive: function (fn) {
        var snapshot = active.slice();
        for (var i = 0; i < snapshot.length; i += 1) {
          fn(snapshot[i], i);
        }
      },
      get activeCount() {
        return active.length;
      }
    };
  }

  function createOrbPool() {
    var Pool = WX.Engine && WX.Engine.Pool;
    if (Pool && typeof Pool.create === 'function') {
      return Pool.create({
        name: 'exp-orb',
        create: newOrbObject,
        reset: function (orb) { orb.active = false; },
        initial: ORB_POOL_INITIAL,
        max: ORB_POOL_MAX
      });
    }
    return createSimplePool();
  }

  /* ============================ 工厂 ============================ */

  /**
   * 创建经验与强化系统。
   * @param {object} [ctx] loop-app 注入的上下文（全部字段可选）：
   *   bus / events            事件总线对象（含 emit/publish 与 on/subscribe/addListener）
   *   emit / publish          App 直接注入发送函数
   *   getPlayer()             返回玩家只读状态（x/y/radius/pickupRadius），每步调用
   *   player                  玩家实例（缺省用其 getState()）
   *   getPlayerState()        玩家状态提供者（getPlayer 的别名）
   *   onModifiersChanged(list, summary)
   *                           强化变化回调：推送给 App/Combat/Arsenal 的通道
   *   onModifiers             同上（兼容别名）
   *   random                  WX.Engine.Math.createRandom() 实例（可选，便于复现）
   *   seed                    随机种子（无 random 时生效）
   *   autoSubscribeEnemyKilled  是否自动订阅 `enemy:killed`（默认 true）
   *   autoSubscribeUpgradeChosen 是否自动订阅 `upgrade:chosen`（默认 false，显式开启）
   * @returns {object} 经验与强化系统（见文件头公开契约）。
   */
  function createProgression(ctx) {
    ctx = ctx || {};

    var cfg = readConfig();
    var EngineMath = WX.Engine && WX.Engine.Math;
    var seed = isNumber(ctx.seed) ? ctx.seed : ((Date.now() & 0x7fffffff) || 1);
    var rng = EngineMath && typeof EngineMath.createRandom === 'function'
      ? EngineMath.createRandom(seed)
      : null;

    var orbPool = createOrbPool();
    var floaters = [];
    var lastPayloads = [];
    var elapsed = 0;

    /* 本局成长状态（重开时整体清空）。 */
    var state = {
      level: 1,
      totalExp: 0,
      totalGained: 0,
      pendingLevels: [],
      awaitingChoice: false,
      choiceLevel: 0,
      lastChoices: [],
      stacks: {},
      collected: 0,
      atMaxLevel: false
    };

    /* 由强化层数聚合出的修饰器（只读快照对外复制）。 */
    var modifierList = [];
    var modifierSummary = {};
    var modifierDetail = {};
    var expGainMul = 1;
    var pickupMul = 1;

    /*
     * 外部修饰器通道（道具等）：只取本模块实际消费的 expGain / pickupRadius 两项。
     * 其余 stat 归 player/combat/arsenal 消费，避免重复叠加。
     */
    var externalDetail = {};

    /* ---------------------------- 事件 ---------------------------- */

    var bus = ctx.bus || ctx.events || null;
    var busBindings = [];

    function emit(name, payload) {
      if (bus && typeof bus.emit === 'function') {
        bus.emit(name, payload);
        return true;
      }
      if (bus && typeof bus.publish === 'function') {
        bus.publish(name, payload);
        return true;
      }
      if (typeof ctx.emit === 'function') {
        ctx.emit(name, payload);
        return true;
      }
      if (typeof ctx.publish === 'function') {
        ctx.publish(name, payload);
        return true;
      }
      /* 无总线时静默：App 仍可通过 getState() 拉取进度。 */
      return false;
    }

    function busOn(name, handler) {
      if (!bus) { return false; }
      if (typeof bus.on === 'function') {
        bus.on(name, handler);
        busBindings.push({ name: name, handler: handler, kind: 'on' });
        return true;
      }
      if (typeof bus.subscribe === 'function') {
        bus.subscribe(name, handler);
        busBindings.push({ name: name, handler: handler, kind: 'subscribe' });
        return true;
      }
      if (typeof bus.addListener === 'function') {
        bus.addListener(name, handler);
        busBindings.push({ name: name, handler: handler, kind: 'addListener' });
        return true;
      }
      return false;
    }

    function busOff(binding) {
      if (!bus) { return; }
      var off = binding.kind === 'on'
        ? bus.off
        : (binding.kind === 'subscribe' ? bus.unsubscribe : bus.removeListener);
      if (typeof off === 'function') {
        off.call(bus, binding.name, binding.handler);
      }
    }

    function notifyModifiers() {
      var fn = null;
      if (typeof ctx.onModifiersChanged === 'function') {
        fn = ctx.onModifiersChanged;
      } else if (typeof ctx.onModifiers === 'function') {
        fn = ctx.onModifiers;
      }
      if (!fn) { return; }
      try {
        fn(copyModifierList(), copyModifierSummary());
      } catch (err) {
        /* 回调异常不得中断成长流程。 */
      }
    }

    /* ---------------------------- 修饰器聚合 ---------------------------- */

    /** 把一条修饰器累加进 `{add, mul, hasAdd, hasMul}` 明细。 */
    function accumulateDetail(detail, entry) {
      if (!entry || typeof entry.stat !== 'string' || !isNumber(entry.value)) { return; }
      var d = detail[entry.stat];
      if (!d) {
        d = detail[entry.stat] = { add: 0, mul: 1, hasAdd: false, hasMul: false };
      }
      if (entry.op === 'mul') {
        d.mul *= entry.value;
        d.hasMul = true;
      } else {
        d.add += entry.value;
        d.hasAdd = true;
      }
    }

    /** 合并两份同 stat 明细（用于“强化 + 外部道具”叠加）。 */
    function mergeDetail(a, b) {
      if (!a) { return b || null; }
      if (!b) { return a; }
      return {
        add: a.add + b.add,
        mul: a.mul * b.mul,
        hasAdd: a.hasAdd || b.hasAdd,
        hasMul: a.hasMul || b.hasMul
      };
    }

    /** 明细换算为单值：`(1 + add) * mul`，非法值回退 fallback。 */
    function detailValue(detail, fallback) {
      if (!detail) { return fallback; }
      var add = detail.hasAdd ? detail.add : 0;
      var mul = detail.hasMul ? detail.mul : 1;
      var value = (1 + add) * mul;
      if (!isNumber(value) || value <= 0) { return fallback; }
      return value;
    }

    /**
     * 归一化外部修饰器来源（数组或聚合对象）为 `{stat, op, value}[]`。
     * 与 player 的 normalizeModifiers 同构约定：数组按条目 op，聚合对象数值按
     * ADD_STATS 判定加算/乘算。
     */
    function normalizeModifierSource(source) {
      var out = [];
      if (!source) { return out; }

      if (Array.isArray(source)) {
        for (var i = 0; i < source.length; i += 1) {
          var entry = source[i];
          if (!entry || typeof entry.stat !== 'string' || !isNumber(entry.value)) { continue; }
          out.push({
            stat: entry.stat,
            op: entry.op === 'mul' ? 'mul' : 'add',
            value: entry.value
          });
        }
        return out;
      }

      for (var key in source) {
        if (!hasOwn(source, key)) { continue; }
        var val = source[key];
        if (isNumber(val)) {
          out.push({
            stat: key,
            op: ADD_STATS[key] ? 'add' : 'mul',
            value: val
          });
        } else if (val && typeof val === 'object' && isNumber(val.value)) {
          out.push({
            stat: key,
            op: val.op === 'mul' ? 'mul' : 'add',
            value: val.value
          });
        }
      }
      return out;
    }

    /** 只保留本模块消费的 stat（expGain / pickupRadius）并聚合成明细。 */
    function buildExternalDetail(list) {
      var detail = {};
      for (var i = 0; i < list.length; i += 1) {
        var entry = list[i];
        if (entry.stat !== 'expGain' && entry.stat !== 'pickupRadius') { continue; }
        accumulateDetail(detail, entry);
      }
      return detail;
    }

    /** 依据已选层数重建聚合修饰器（数组 / 摘要 / 明细）。 */
    function recomputeModifiers() {
      modifierList = [];
      modifierSummary = {};
      modifierDetail = {};

      var ids = Object.keys(state.stacks);
      for (var i = 0; i < ids.length; i += 1) {
        var def = cfg.upgradeById[ids[i]];
        if (!def) { continue; }
        var count = state.stacks[ids[i]] || 0;
        for (var s = 0; s < count; s += 1) {
          for (var j = 0; j < def.modifiers.length; j += 1) {
            var mod = def.modifiers[j];
            modifierList.push({ stat: mod.stat, op: mod.op, value: mod.value });
          }
        }
      }

      for (var k = 0; k < modifierList.length; k += 1) {
        var entry = modifierList[k];
        var detail = modifierDetail[entry.stat];
        if (!detail) {
          detail = modifierDetail[entry.stat] = { add: 0, mul: 1, hasAdd: false, hasMul: false };
        }
        if (entry.op === 'mul') {
          detail.mul *= entry.value;
          detail.hasMul = true;
        } else {
          detail.add += entry.value;
          detail.hasAdd = true;
        }
      }

      for (var stat in modifierDetail) {
        if (!hasOwn(modifierDetail, stat)) { continue; }
        var det = modifierDetail[stat];
        if (det.hasMul && det.hasAdd) {
          modifierSummary[stat] = { add: det.add, mul: det.mul };
        } else if (det.hasMul) {
          modifierSummary[stat] = det.mul;
        } else {
          modifierSummary[stat] = det.add;
        }
      }

      var gain = mergeDetail(modifierDetail.expGain, externalDetail.expGain);
      expGainMul = detailValue(gain, 1);

      var pickup = mergeDetail(modifierDetail.pickupRadius, externalDetail.pickupRadius);
      pickupMul = detailValue(pickup, 1);
    }

    function copyModifierList() {
      var out = [];
      for (var i = 0; i < modifierList.length; i += 1) {
        var m = modifierList[i];
        out.push({ stat: m.stat, op: m.op, value: m.value });
      }
      return out;
    }

    function copyModifierSummary() {
      var out = {};
      for (var stat in modifierSummary) {
        if (!hasOwn(modifierSummary, stat)) { continue; }
        var value = modifierSummary[stat];
        out[stat] = (value && typeof value === 'object')
          ? { add: value.add, mul: value.mul }
          : value;
      }
      return out;
    }

    /* ---------------------------- 等级与阈值 ---------------------------- */

    /** 当前等级的累计经验基准（到达本级时已消耗的累计经验）。 */
    function cumulativeFloor() {
      if (state.level <= 1) { return 0; }
      var prev = cfg.thresholds[state.level - 2];
      return isNumber(prev) ? prev : 0;
    }

    function computeExpInfo() {
      var floor = cumulativeFloor();
      var target = state.level < cfg.maxLevel ? cfg.thresholds[state.level - 1] : null;

      if (!isNumber(target)) {
        /* 满级：经验条视为已满，避免 UI 出现除零。 */
        return {
          exp: 0,
          expToNext: 0,
          expRemaining: 0,
          expProgress: 1,
          expThreshold: null
        };
      }

      var span = Math.max(0, target - floor);
      var within = Math.max(0, state.totalExp - floor);
      var progress = span > EPSILON ? clamp(within / span, 0, 1) : 1;
      return {
        exp: within,
        expToNext: span,
        expRemaining: Math.max(0, span - within),
        expProgress: progress,
        expThreshold: target
      };
    }

    /**
     * 连续升级：一次大额经验可跨多个阈值；每跨一级只发一次 `level:up`，
     * 并按队列逐级发出，避免 App 同时收到多个待选面板。
     */
    function checkLevelUps() {
      var leveled = false;

      while (state.level < cfg.maxLevel) {
        var need = cfg.thresholds[state.level - 1];
        if (!isNumber(need)) { break; }
        if (state.totalExp + EPSILON < need) { break; }
        state.level += 1;
        state.pendingLevels.push(state.level);
        leveled = true;
      }

      if (state.level >= cfg.maxLevel) { state.atMaxLevel = true; }
      if (leveled && !state.awaitingChoice) { emitNextLevelUp(); }
    }

    /**
     * 从待升级队列取一级并发出 `level:up`。
     * 若强化池已全部达到 maxStack（无选项可选），跳过该级、不阻塞游戏。
     */
    function emitNextLevelUp() {
      if (state.awaitingChoice) { return false; }

      while (state.pendingLevels.length > 0) {
        var level = state.pendingLevels.shift();
        var choices = progress.rollChoices(cfg.choiceCount);
        if (choices.length === 0) { continue; }
        state.awaitingChoice = true;
        state.choiceLevel = level;
        emit('level:up', { level: level, choices: choices.slice() });
        return true;
      }

      state.lastChoices = [];
      return false;
    }

    function applyExp(amount) {
      var gained = num(amount, 0);
      if (!(gained > 0) || state.atMaxLevel) { return 0; }
      state.totalExp += gained;
      state.totalGained += gained;
      checkLevelUps();
      return gained;
    }

    /* ---------------------------- 加权抽取 ---------------------------- */

    function rand() {
      if (rng && typeof rng.next === 'function') { return rng.next(); }
      return Math.random();
    }

    /** 当前可选强化（未达 maxStack 且 weight > 0）。 */
    function availableUpgrades() {
      var out = [];
      for (var i = 0; i < cfg.upgrades.length; i += 1) {
        var def = cfg.upgrades[i];
        if (!(def.weight > 0)) { continue; }
        var stack = state.stacks[def.id] || 0;
        if (stack >= def.maxStack) { continue; }
        out.push(def);
      }
      return out;
    }

    /* ---------------------------- 经验球 ---------------------------- */

    function clampWorld(x, y, radius) {
      var collision = WX.Engine && WX.Engine.Collision;
      if (collision && typeof collision.clampToWorld === 'function') {
        return collision.clampToWorld(
          { x: x, y: y, radius: radius },
          cfg.worldWidth,
          cfg.worldHeight
        );
      }
      return {
        x: clamp(x, radius, cfg.worldWidth - radius),
        y: clamp(y, radius, cfg.worldHeight - radius)
      };
    }

    function releaseOrb(orb) {
      if (orb && orb.active) {
        orb.active = false;
        orbPool.release(orb);
      }
    }

    function rememberPayload(payload) {
      lastPayloads.push(payload);
      if (lastPayloads.length > PAYLOAD_MEMORY) { lastPayloads.shift(); }
    }

    function addFloater(x, y, text) {
      floaters.push({
        x: x,
        y: y,
        text: text,
        life: FLOATER_LIFE,
        maxLife: FLOATER_LIFE
      });
      if (floaters.length > FLOATER_LIMIT) { floaters.shift(); }
    }

    function updateFloaters(dt) {
      for (var i = floaters.length - 1; i >= 0; i -= 1) {
        var f = floaters[i];
        f.life -= dt;
        f.y -= FLOATER_RISE * dt;
        if (f.life <= 0) { floaters.splice(i, 1); }
      }
    }

    function resolvePlayer(explicit) {
      var p = explicit;
      if (!p && typeof ctx.getPlayer === 'function') { p = ctx.getPlayer(); }
      if (!p && ctx.player && typeof ctx.player.getState === 'function') {
        p = ctx.player.getState();
      }
      if (!p && typeof ctx.getPlayerState === 'function') { p = ctx.getPlayerState(); }
      return p && isNumber(p.x) && isNumber(p.y) ? p : null;
    }

    function effectivePickupRadius(player) {
      var base = player && isNumber(player.pickupRadius)
        ? player.pickupRadius
        : cfg.basePickupRadius;
      return Math.max(0, base * pickupMul);
    }

    /** 拾取一个经验球：先发 exp:pickup，再累加经验（可能触发 level:up）。 */
    function collectOrb(orb) {
      var base = orb.amount;
      var gained = base * expGainMul;
      var x = orb.x;
      var y = orb.y;

      releaseOrb(orb);
      state.collected += 1;

      emit('exp:pickup', { amount: round2(gained) });
      applyExp(gained);
      addFloater(x, y, '+' + Math.max(1, Math.round(gained)));
    }

    /* ---------------------------- 公开接口 ---------------------------- */

    var progress = {};

    /**
     * 每逻辑步更新：经验球寿命/吸附/拾取，以及飘字。
     * @param {number} dt 秒
     * @param {object} [playerState] 玩家只读状态；缺省时依次尝试
     *   ctx.getPlayer() / ctx.player.getState() / ctx.getPlayerState()
     */
    progress.update = function (dt, playerState) {
      var step = isNumber(dt) && dt > 0
        ? Math.min(dt, cfg.maxStepSec)
        : 0;
      if (step <= 0) { return progress; }

      elapsed += step;

      var player = resolvePlayer(playerState);
      var px = player ? player.x : 0;
      var py = player ? player.y : 0;
      var playerRadius = player ? Math.max(0, num(player.radius, 0)) : 0;
      var pickupRadius = effectivePickupRadius(player);

      orbPool.forEachActive(function (orb) {
        if (!orb.active) { return; }

        orb.age += step;
        if (orb.age >= orb.life) {
          releaseOrb(orb);
          return;
        }

        if (!player) { return; }

        var dx = px - orb.x;
        var dy = py - orb.y;
        var distSq = dx * dx + dy * dy;

        if (!orb.magnet) {
          if (distSq <= pickupRadius * pickupRadius) { orb.magnet = true; }
          if (!orb.magnet) { return; }
        }

        var reach = playerRadius + orb.radius;
        if (distSq <= reach * reach) {
          collectOrb(orb);
          return;
        }

        var dist = Math.sqrt(distSq);
        if (dist < EPSILON) {
          collectOrb(orb);
          return;
        }

        var speed = cfg.magnetSpeed;
        var stepLen = speed * step;
        var nx = dx / dist;
        var ny = dy / dist;
        orb.vx = nx * speed;
        orb.vy = ny * speed;

        if (stepLen >= dist - reach) {
          collectOrb(orb);
          return;
        }
        orb.x += nx * stepLen;
        orb.y += ny * stepLen;
      });

      updateFloaters(step);
      return progress;
    };

    /**
     * 直接累加经验（会乘 expGain 修饰器）。拾取路径由经验球自动调用；
     * App 一般无需手动调用，`exp:pickup` 仅作通知，不要求 App 再累加。
     */
    progress.addExp = function (amount) {
      var base = num(amount, 0);
      if (!(base > 0)) { return 0; }
      return applyExp(base * expGainMul);
    };

    /**
     * 加权无放回抽取 count 个强化 id（排除已达 maxStack 的项）。
     * @param {number} [count] 缺省平衡配置 choiceCount
     * @returns {string[]} 选项 id 数组（可能少于 count，若无足够候选）
     */
    progress.rollChoices = function (count) {
      var wanted = isNumber(count) ? Math.floor(count) : cfg.choiceCount;
      if (!(wanted > 0)) {
        state.lastChoices = [];
        return [];
      }

      var pool = availableUpgrades();
      var picked = [];

      while (picked.length < wanted && pool.length > 0) {
        var total = 0;
        var i;
        for (i = 0; i < pool.length; i += 1) { total += pool[i].weight; }
        if (total <= 0) { break; }

        var roll = rand() * total;
        var index = pool.length - 1;
        for (i = 0; i < pool.length; i += 1) {
          roll -= pool[i].weight;
          if (roll < 0) { index = i; break; }
        }
        picked.push(pool[index].id);
        pool.splice(index, 1);
      }

      state.lastChoices = picked.slice();
      return picked;
    };

    /**
     * 应用一次强化选择：校验 → 叠加层数 → 重建修饰器 → 回调通知 App。
     * 本方法**不**广播 `upgrade:chosen`（该事件方向为 ui → app/progression）；
     * 若需要由本模块统一广播，请改用 `chooseUpgrade(id)`。
     * @param {string} id 强化 id
     * @returns {{ok:boolean, upgradeId:string, reason?:string, stacks?:number,
     *           maxStack?:number, modifiers?:Array, modifierList?:Array,
     *           modifiersSummary?:object, nextLevelUp?:boolean}}
     */
    progress.applyUpgrade = function (id) {
      var def = typeof id === 'string' ? cfg.upgradeById[id] : null;
      if (!def) {
        return { ok: false, upgradeId: id, reason: 'unknown-upgrade' };
      }

      var stack = state.stacks[id] || 0;
      if (stack >= def.maxStack) {
        return {
          ok: false,
          upgradeId: id,
          reason: 'max-stack',
          stacks: stack,
          maxStack: def.maxStack
        };
      }

      state.stacks[id] = stack + 1;
      state.awaitingChoice = false;
      state.choiceLevel = 0;
      state.lastChoices = [];

      recomputeModifiers();
      notifyModifiers();

      var result = {
        ok: true,
        upgradeId: id,
        name: def.name,
        stacks: state.stacks[id],
        maxStack: def.maxStack,
        modifiers: def.modifiers.slice(),
        modifierList: copyModifierList(),
        modifiersSummary: copyModifierSummary(),
        nextLevelUp: false
      };

      /* 连续升级：本级选完后立即弹出下一级选项。 */
      result.nextLevelUp = emitNextLevelUp();
      return result;
    };

    /**
     * 应用强化并广播 `upgrade:chosen`（载荷冻结为 `{ upgradeId }`）。
     * 事件先于修饰器生效发出（与契约 §6 数据流一致）；仅当 App 希望由
     * progression 统一广播选择结果时使用。若 App 已自行广播，请调用
     * `applyUpgrade` 以避免重复事件/重复应用。
     */
    progress.chooseUpgrade = function (id) {
      var def = typeof id === 'string' ? cfg.upgradeById[id] : null;
      var canApply = def && (state.stacks[id] || 0) < def.maxStack;
      if (canApply) {
        emit('upgrade:chosen', { upgradeId: id });
      }
      return progress.applyUpgrade(id);
    };

    /** 便捷入口：接收 `upgrade:chosen` 载荷并应用（供 App 转交）。 */
    progress.handleUpgradeChosen = function (payload) {
      if (!payload || typeof payload.upgradeId !== 'string') {
        return { ok: false, reason: 'invalid-payload' };
      }
      return progress.applyUpgrade(payload.upgradeId);
    };

    /**
     * 推入外部修饰器（道具等）：只取本模块消费的 `expGain` / `pickupRadius`
     * 作用于经验获取与吸附半径；其余 stat 请由 App 推给 player/combat/arsenal，
     * 不并入 `getModifierList()`，避免重复叠加。传 `null` 清空。
     * @param {Array|object} source `[{stat, op, value}]` 或聚合对象
     */
    progress.applyModifiers = function (source) {
      var list = normalizeModifierSource(source);
      externalDetail = buildExternalDetail(list);
      recomputeModifiers();
      return progress;
    };

    /* 语义别名，便于 App 以 set 风格调用。 */
    progress.setModifiers = progress.applyModifiers;

    /** 在敌人死亡位置生成一个经验球（经验值以载荷为准，精英倍率由 enemies 结算）。 */
    progress.spawnExpDrop = function (x, y, exp) {
      var amount = num(exp, 0);
      if (!(amount > 0) || !isNumber(x) || !isNumber(y)) { return null; }

      var orb = orbPool.acquire();
      orb.active = true;
      orb.amount = amount;
      orb.radius = cfg.expOrbRadius;
      orb.age = 0;
      orb.life = cfg.expOrbLifetimeSec;
      orb.magnet = false;
      orb.vx = 0;
      orb.vy = 0;
      orb.phase = rand() * Math.PI * 2;

      var pos = clampWorld(x, y, cfg.expOrbRadius);
      orb.x = pos.x;
      orb.y = pos.y;
      return orb;
    };

    /**
     * 消费 `enemy:killed` 载荷：`{ enemyId, type, x, y, exp }`。
     * 默认已自动订阅总线；若 App 采用手动转交，请不要同时启用自动订阅
     * （同一 payload 对象重复投递会被去重）。
     */
    progress.handleEnemyKilled = function (payload) {
      if (!payload) { return null; }
      if (lastPayloads.indexOf(payload) !== -1) { return null; }

      var x = payload.x;
      var y = payload.y;
      if (!isNumber(x) || !isNumber(y)) { return null; }

      var amount = num(payload.exp, 0);
      if (!(amount > 0)) { return null; }

      rememberPayload(payload);
      return progress.spawnExpDrop(x, y, amount);
    };

    /** 自动订阅 `enemy:killed`（幂等）。 */
    progress.subscribe = function () {
      if (!enemyKillsBound) {
        enemyKillsBound = busOn('enemy:killed', progress.handleEnemyKilled);
      }
      if (ctx.autoSubscribeUpgradeChosen === true && !upgradeChosenBound) {
        upgradeChosenBound = busOn('upgrade:chosen', function (payload) {
          progress.handleUpgradeChosen(payload);
        });
      }
      return progress;
    };

    /** 解除本模块注册的总线订阅。 */
    progress.unsubscribe = function () {
      for (var i = 0; i < busBindings.length; i += 1) {
        busOff(busBindings[i]);
      }
      busBindings.length = 0;
      enemyKillsBound = false;
      upgradeChosenBound = false;
      return progress;
    };

    /** 只读状态快照（视图快照字段来源）。 */
    progress.getState = function () {
      var info = computeExpInfo();
      var stacks = {};
      var upgradeStates = [];
      var i;

      for (var id in state.stacks) {
        if (!hasOwn(state.stacks, id)) { continue; }
        stacks[id] = state.stacks[id];
      }
      for (i = 0; i < cfg.upgrades.length; i += 1) {
        var def = cfg.upgrades[i];
        if (!state.stacks[def.id]) { continue; }
        upgradeStates.push({
          id: def.id,
          name: def.name,
          stacks: state.stacks[def.id],
          maxStack: def.maxStack
        });
      }

      return {
        level: state.level,
        exp: round2(info.exp),
        expToNext: info.expToNext,
        expRemaining: round2(info.expRemaining),
        expProgress: info.expProgress,
        expThreshold: info.expThreshold,
        totalExp: round2(state.totalExp),
        maxLevel: cfg.maxLevel,
        atMaxLevel: state.atMaxLevel,
        awaitingChoice: state.awaitingChoice,
        choiceLevel: state.choiceLevel,
        choices: state.lastChoices.slice(),
        pendingLevelUps: state.pendingLevels.length,
        stacks: stacks,
        upgrades: upgradeStates,
        modifiers: copyModifierSummary(),
        modifierList: copyModifierList(),
        expGain: round2(expGainMul),
        pickupRadius: round2(effectivePickupRadius(null)),
        orbCount: orbPool.activeCount,
        collected: state.collected,
        totalGained: round2(state.totalGained)
      };
    };

    /** 聚合修饰器摘要：加算类 stat 为总和，乘算类 stat 为乘积。 */
    progress.getModifiers = function () {
      return copyModifierSummary();
    };

    /** 规范化修饰器数组（可直接交给 player/combat/arsenal 消费）。 */
    progress.getModifierList = function () {
      return copyModifierList();
    };

    /** 每 stat 的 `{ add, mul, hasAdd, hasMul }` 明细（调试/验收用）。 */
    progress.getModifierDetail = function () {
      var out = {};
      for (var stat in modifierDetail) {
        if (!hasOwn(modifierDetail, stat)) { continue; }
        var d = modifierDetail[stat];
        out[stat] = { add: d.add, mul: d.mul, hasAdd: d.hasAdd, hasMul: d.hasMul };
      }
      return out;
    };

    /** `getModifierList` 的别名：按消费方（player/combat/arsenal）拉取同一份修饰器。 */
    progress.getModifiersFor = function (consumer) {
      return copyModifierList();
    };

    /** 当前提供的选项 id（最近一次 rollChoices / level:up 的载荷）。 */
    progress.getChoices = function () {
      return state.lastChoices.slice();
    };

    /** 选项详情（含名称/描述/已叠层数），供 ui-hud 渲染面板。 */
    progress.getChoiceDetails = function () {
      var out = [];
      for (var i = 0; i < state.lastChoices.length; i += 1) {
        var info = progress.getUpgradeInfo(state.lastChoices[i]);
        if (info) { out.push(info); }
      }
      return out;
    };

    /** 单项强化详情（id 非法返回 null）。 */
    progress.getUpgradeInfo = function (id) {
      var def = typeof id === 'string' ? cfg.upgradeById[id] : null;
      if (!def) { return null; }
      var modifiers = [];
      for (var i = 0; i < def.modifiers.length; i += 1) {
        var m = def.modifiers[i];
        modifiers.push({ stat: m.stat, op: m.op, value: m.value });
      }
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        weight: def.weight,
        stacks: state.stacks[def.id] || 0,
        maxStack: def.maxStack,
        modifiers: modifiers
      };
    };

    /** 每项强化的已选层数（副本）。 */
    progress.getUpgradeStacks = function () {
      var out = {};
      for (var id in state.stacks) {
        if (hasOwn(state.stacks, id)) { out[id] = state.stacks[id]; }
      }
      return out;
    };

    /** 当前实际拾取半径（基础值 × pickupRadius 修饰器）。 */
    progress.getPickupRadius = function (playerState) {
      return effectivePickupRadius(resolvePlayer(playerState));
    };

    /** 经验球只读快照（调试/验收用）。 */
    progress.getOrbs = function () {
      var out = [];
      orbPool.forEachActive(function (orb) {
        if (!orb.active) { return; }
        out.push({
          x: orb.x,
          y: orb.y,
          amount: orb.amount,
          radius: orb.radius,
          age: orb.age,
          life: orb.life,
          magnet: orb.magnet
        });
      });
      return out;
    };

    /** 世界坐标绘制经验球与拾取飘字（形状绘制，无外部图片）。 */
    progress.render = function (renderer) {
      if (!renderer) { return progress; }

      var prevAlpha = typeof renderer.getAlpha === 'function'
        ? renderer.getAlpha()
        : 1;
      var pulse = 1 + Math.sin(elapsed * 3.2) * 0.12;

      orbPool.forEachActive(function (orb) {
        if (!orb.active) { return; }

        var remain = orb.life - orb.age;
        var fade = remain < 1.2 ? Math.max(0, remain / 1.2) : 1;
        if (typeof renderer.setAlpha === 'function') {
          renderer.setAlpha(prevAlpha * fade);
        }

        var radius = orb.radius;
        renderer.fillCircle(orb.x, orb.y, radius * 2.1 * pulse, COLORS.glow);

        if (orb.magnet && (orb.vx !== 0 || orb.vy !== 0)) {
          renderer.drawLine(
            orb.x - orb.vx * 0.03,
            orb.y - orb.vy * 0.03,
            orb.x,
            orb.y,
            COLORS.trail,
            2
          );
        }

        renderer.fillCircle(orb.x, orb.y, radius, COLORS.core);
        renderer.strokeCircle(orb.x, orb.y, radius * 1.35, COLORS.ring, 1);
      });

      if (typeof renderer.setAlpha === 'function') {
        renderer.setAlpha(prevAlpha);
      }

      for (var i = 0; i < floaters.length; i += 1) {
        var f = floaters[i];
        var alpha = f.life > f.maxLife * 0.4
          ? 1
          : Math.max(0, f.life / (f.maxLife * 0.4));
        renderer.drawText(f.text, f.x, f.y, {
          size: 13,
          weight: 'bold',
          color: COLORS.text,
          align: 'center',
          baseline: 'middle',
          alpha: alpha,
          strokeColor: COLORS.textStroke,
          strokeWidth: 2
        });
      }

      return progress;
    };

    /** 重开单局：清空经验/等级/强化层数/经验球/飘字（不发事件）。 */
    progress.reset = function () {
      state.level = 1;
      state.totalExp = 0;
      state.totalGained = 0;
      state.pendingLevels.length = 0;
      state.awaitingChoice = false;
      state.choiceLevel = 0;
      state.lastChoices = [];
      state.stacks = {};
      state.collected = 0;
      state.atMaxLevel = false;

      orbPool.releaseAll();
      floaters.length = 0;
      lastPayloads.length = 0;

      externalDetail = {};

      recomputeModifiers();
      notifyModifiers();
      return progress;
    };

    /** 释放资源：解绑订阅、归还经验球（App 卸载时调用）。 */
    progress.destroy = function () {
      progress.unsubscribe();
      orbPool.releaseAll();
      floaters.length = 0;
      lastPayloads.length = 0;
      return progress;
    };

    /* ---------------------------- 初始化 ---------------------------- */

    var enemyKillsBound = false;
    var upgradeChosenBound = false;

    recomputeModifiers();

    if (ctx.autoSubscribeEnemyKilled !== false) {
      enemyKillsBound = busOn('enemy:killed', progress.handleEnemyKilled);
    }
    if (ctx.autoSubscribeUpgradeChosen === true) {
      upgradeChosenBound = busOn('upgrade:chosen', function (payload) {
        progress.handleUpgradeChosen(payload);
      });
    }

    return progress;
  }

  /* ============================ 导出 ============================ */

  ProgressionNS.VERSION = VERSION;
  ProgressionNS.create = createProgression;

  WX.Progression = ProgressionNS;
})(typeof window !== 'undefined' ? window : this);
