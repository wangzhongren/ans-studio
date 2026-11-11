/**
 * game/enemies/enemies.js
 * 模块：enemies（敌人类型/属性、刷新生成、强度递增与精英）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责（架构契约 §3）：
 *   - 按 WX.Config.waves 的波次表定时生成敌人（spawnIntervalSec / maxAlive / spawnTable 权重）；
 *   - 敌人基础属性取 WX.Config.enemies，生成时叠加波次倍率；按 eliteChance 生成精英并叠加
 *     WX.Config.balance.elite 倍率；
 *   - 行为：chase（追击玩家），与玩家/同类做简单分离，限制在世界内；
 *   - 受击：暴露 takeDamage(amount, source) 供 combat 经 App 的 ctx.applyDamage 调用，
 *     命中闪光与可选击退反馈；hp<=0 只发一次契约事件 `enemy:killed`；
 *   - 渲染：render(renderer) 使用 WX.Engine.Renderer 形状原语（配色/体型/精英外观/血条）；
 *   - 维护实体列表清理与单局重置，重开后无残留。
 *
 * 公开契约（架构契约 §5.5）：
 *   WX.Enemies.create(ctx) -> {
 *     spawnWave(waveIndex), update(dt, waveCtx?), list(), reset()
 *   }
 *   本模块按架构“最小约定”补充：render / getState / getWave / stopSpawning。
 *   只发契约事件 `enemy:killed`，载荷冻结为 `{ enemyId, type, x, y, exp }`；
 *   不发 wave:* / run:* 或任何未登记事件（波次与胜负编排归 loop-app）。
 *
 * 依赖（架构契约 §4）：只读 WX.Config 与 WX.Engine（Math / Collision / Pool / Renderer 公开 API）；
 * 不直接引用其他领域模块；玩家对象与事件总线均由 loop-app 经 ctx 注入。
 *
 * 硬约束：经典 <script> + IIFE，挂载 window.WX.Enemies；无 ES Module、无 fetch/XHR、
 * 无外部资源、无构建链；不操作 DOM。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var EnemiesNS = WX.Enemies || (WX.Enemies = {});

  var VERSION = '1.0.0';
  var EPSILON = 1e-6;

  /*
   * 以下兜底值仅在 WX.Config 缺失或字段非法时生效；正常路径一律读 WX.Config，
   * 模块内不维护一份可调平衡数值。
   */
  var FALLBACK = {
    worldWidth: 1280,
    worldHeight: 720,
    spawnMargin: 48,
    maxDeltaSec: 0.1,
    spawnIntervalSec: 1.5,
    maxAlive: 10,
    playerRadius: 15,
    hitDamageCooldownSec: 0.7,
    hitFlashSec: 0.12
  };

  /* 表现层常量（配色与血条样式），不属于平衡数值。 */
  var COLORS = {
    shadow: 'rgba(0, 0, 0, 0.22)',
    outline: 'rgba(12, 14, 16, 0.55)',
    hitFlash: '#f4ead2',
    bodyFallback: '#8a6d4b',
    accentFallback: '#d8b98a',
    eliteRing: '#e8c46a',
    eliteHp: '#d9a441',
    hpBg: 'rgba(0, 0, 0, 0.55)',
    hpFg: '#b4453a',
    hpBorder: 'rgba(0, 0, 0, 0.6)'
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

  function roundTo(value, digits) {
    var p = Math.pow(10, typeof digits === 'number' ? digits : 0);
    return Math.round(value * p) / p;
  }

  /** Config 缺失 WX.Engine.Math 时的随机源兜底（正常路径不会走到）。 */
  function createFallbackRng() {
    function next() { return Math.random(); }
    return {
      next: next,
      float: function (min, max) {
        if (typeof min !== 'number') { return next(); }
        var hi = typeof max === 'number' ? max : min;
        var lo = typeof max === 'number' ? min : 0;
        return lo + next() * (hi - lo);
      },
      int: function (min, max) {
        var lo = Math.ceil(typeof min === 'number' ? min : 0);
        var hi = Math.floor(typeof max === 'number' ? max : lo);
        if (hi < lo) { return lo; }
        return lo + Math.floor(next() * (hi - lo + 1));
      },
      chance: function (p) {
        if (!(p > 0)) { return false; }
        if (p >= 1) { return true; }
        return next() < p;
      },
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
          var iw = weightOf(list[i], i);
          if (iw <= 0) { continue; }
          roll -= iw;
          if (roll < 0) { return list[i]; }
        }
        return list[list.length - 1];
      }
    };
  }

  /** WX.Engine.Pool 缺失时的最小同形对象池兜底（正常路径不会走到）。 */
  function createFallbackPool(options) {
    options = options || {};
    var createFn = typeof options.create === 'function' ? options.create : function () { return {}; };
    var resetFn = typeof options.reset === 'function' ? options.reset : function () {};
    var initial = typeof options.initial === 'number' ? Math.max(0, options.initial) : 0;
    var free = [];
    var active = [];
    var i;
    for (i = 0; i < initial; i += 1) { free.push(createFn()); }

    return {
      acquire: function () {
        var obj = free.length > 0 ? free.pop() : createFn();
        active.push(obj);
        return obj;
      },
      release: function (obj) {
        var idx = active.indexOf(obj);
        if (idx === -1) { return false; }
        active.splice(idx, 1);
        resetFn(obj);
        free.push(obj);
        return true;
      },
      releaseAll: function () {
        var count = active.length;
        for (var k = count - 1; k >= 0; k -= 1) {
          var obj = active.pop();
          resetFn(obj);
          free.push(obj);
        }
        return count;
      },
      forEachActive: function (fn) {
        var snapshot = active.slice();
        for (var k = 0; k < snapshot.length; k += 1) { fn(snapshot[k], k); }
      },
      activeItems: function () { return active; },
      get activeCount() { return active.length; },
      get freeCount() { return free.length; }
    };
  }

  /* ============================ 工厂 ============================ */

  /**
   * 创建敌人系统。
   * @param {object} [ctx] loop-app 注入的上下文（全部字段可选）：
   *   bus / events     事件总线对象（含 emit 或 publish）
   *   emit / publish   或直接注入发送函数
   *   getPlayer()      返回 WX.Player 实体（推荐；接触伤害需要其 takeDamage）
   *   player           或直接注入玩家实体
   *   getPlayerState() / playerState  只读玩家状态 {x,y,radius,dead}
   *   applyPlayerDamage(amount, source) 玩家实体不可用时的接触伤害通道
   *   enemyContactDamage === false     关闭本模块的接触伤害（由 App 自行结算）
   *   rng              自定义随机源（需含 weighted/chance/float/int）
   *   seed             随机种子（未提供 rng 时用于 WX.Engine.Math.createRandom）
   *   maxPoolSize      对象池上限（默认 512）
   * @returns {object} 敌人系统（见文件头公开契约）。
   */
  function createEnemies(ctx) {
    ctx = ctx || {};

    var cfg = WX.Config || {};
    var balance = cfg.balance || {};
    var worldCfg = balance.world || {};
    var playerCfg = balance.player || {};
    var eliteCfg = balance.elite || {};
    var combatCfg = balance.combat || {};
    var loopCfg = balance.loop || {};

    var world = {
      width: Math.max(1, num(worldCfg.width, FALLBACK.worldWidth)),
      height: Math.max(1, num(worldCfg.height, FALLBACK.worldHeight))
    };
    var spawnMargin = Math.max(0, num(worldCfg.spawnMargin, FALLBACK.spawnMargin));
    var maxStepSec = Math.max(0.001, num(loopCfg.maxDeltaSec, FALLBACK.maxDeltaSec));
    var contactInterval = Math.max(0, num(playerCfg.hitDamageCooldownSec, FALLBACK.hitDamageCooldownSec));
    var hitFlashSec = Math.max(0, num(combatCfg.hitFlashSec, FALLBACK.hitFlashSec));
    var defaultPlayerRadius = Math.max(1, num(playerCfg.radius, FALLBACK.playerRadius));
    var contactEnabled = ctx.enemyContactDamage !== false;
    var maxPoolSize = Math.max(64, Math.floor(num(ctx.maxPoolSize, 512)));

    var eliteMul = {
      hp: Math.max(0.01, num(eliteCfg.hpMultiplier, 1)),
      speed: Math.max(0, num(eliteCfg.speedMultiplier, 1)),
      damage: Math.max(0, num(eliteCfg.damageMultiplier, 1)),
      radius: Math.max(0.01, num(eliteCfg.radiusMultiplier, 1)),
      exp: Math.max(0, num(eliteCfg.expMultiplier, 1))
    };

    var waves = Array.isArray(cfg.waves) ? cfg.waves : [];
    var enemyDefs = {};
    if (Array.isArray(cfg.enemies)) {
      for (var di = 0; di < cfg.enemies.length; di += 1) {
        var def = cfg.enemies[di];
        if (def && typeof def.id === 'string') { enemyDefs[def.id] = def; }
      }
    }

    var engine = WX.Engine || {};
    var MathUtil = engine.Math || null;
    var Collision = engine.Collision || null;
    var PoolNS = engine.Pool || null;

    var rng = ctx.rng && typeof ctx.rng.weighted === 'function'
      ? ctx.rng
      : (MathUtil && typeof MathUtil.createRandom === 'function'
        ? MathUtil.createRandom(num(ctx.seed, (Date.now() & 0x7fffffff) || 1))
        : createFallbackRng());

    /* 运行时状态：当前波次、刷怪计时、实体 id 与对象池。 */
    var idCounter = 0;
    var currentWave = null;
    var spawnTimer = 0;
    var spawningEnabled = false;

    var pool = PoolNS && typeof PoolNS.create === 'function'
      ? PoolNS.create({
        name: 'enemy',
        create: createEnemyObject,
        reset: resetEnemy,
        initial: 8,
        max: maxPoolSize
      })
      : createFallbackPool({
        create: createEnemyObject,
        reset: resetEnemy,
        initial: 8
      });

    /* ---------------------------- 事件 ---------------------------- */

    /** 经注入的事件总线上报（契约 §5.4：本模块唯一事件 enemy:killed）。 */
    function emitEvent(name, payload) {
      var bus = ctx.bus || ctx.events || null;
      if (bus && typeof bus.emit === 'function') {
        bus.emit(name, payload);
        return;
      }
      if (bus && typeof bus.publish === 'function') {
        bus.publish(name, payload);
        return;
      }
      if (typeof ctx.emit === 'function') {
        ctx.emit(name, payload);
        return;
      }
      if (typeof ctx.publish === 'function') {
        ctx.publish(name, payload);
      }
      /* 无总线时静默：App 仍可用 list()/getState() 拉取状态。 */
    }

    /* ---------------------------- 实体生命周期 ---------------------------- */

    function createEnemyObject() {
      var enemy = {
        active: false,
        dead: true,
        enemyId: 0,
        type: '',
        name: '',
        x: 0,
        y: 0,
        radius: 1,
        hp: 0,
        maxHp: 0,
        speed: 0,
        damage: 0,
        exp: 0,
        behavior: 'chase',
        facing: 0,
        elite: false,
        age: 0,
        hitFlash: 0,
        contactTimer: 0,
        color: COLORS.bodyFallback,
        accentColor: COLORS.accentFallback
      };
      /* combat 经 App 的 ctx.applyDamage 调到这里；App 也可直接调用。 */
      enemy.takeDamage = function (amount, source) {
        return damageEnemy(enemy, amount, source);
      };
      return enemy;
    }

    function resetEnemy(enemy) {
      enemy.active = false;
      enemy.dead = true;
      enemy.enemyId = 0;
      enemy.type = '';
      enemy.name = '';
      enemy.x = 0;
      enemy.y = 0;
      enemy.radius = 1;
      enemy.hp = 0;
      enemy.maxHp = 0;
      enemy.speed = 0;
      enemy.damage = 0;
      enemy.exp = 0;
      enemy.behavior = 'chase';
      enemy.facing = 0;
      enemy.elite = false;
      enemy.age = 0;
      enemy.hitFlash = 0;
      enemy.contactTimer = 0;
      enemy.color = COLORS.bodyFallback;
      enemy.accentColor = COLORS.accentFallback;
    }

    /** 归还已死亡实例（延迟到下一个逻辑步开头，避免结算过程中的列表变更）。 */
    function cleanupDead() {
      var snapshot = pool.activeItems().slice();
      for (var i = 0; i < snapshot.length; i += 1) {
        var enemy = snapshot[i];
        if (enemy && enemy.dead) { pool.release(enemy); }
      }
    }

    function countAlive() {
      var list = pool.activeItems();
      var count = 0;
      for (var i = 0; i < list.length; i += 1) {
        var enemy = list[i];
        if (enemy && enemy.active && !enemy.dead) { count += 1; }
      }
      return count;
    }

    /** 死亡：标记 + 发一次契约事件，实际归还由 cleanupDead 统一处理。 */
    function killEnemy(enemy) {
      if (!enemy || enemy.dead) { return; }
      enemy.dead = true;
      enemy.hp = 0;
      emitEvent('enemy:killed', {
        enemyId: enemy.enemyId,
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        exp: enemy.exp
      });
    }

    /** 可选击退：仅当 source 显式给出 knockback 时生效（数值来自 combat 武器配置）。 */
    function applyKnockback(enemy, source) {
      if (!source || typeof source !== 'object') { return; }
      var power = num(source.knockback, 0);
      if (!(power > 0)) { return; }

      var dx = 0;
      var dy = 0;
      if (isNumber(source.x) && isNumber(source.y)) {
        dx = enemy.x - source.x;
        dy = enemy.y - source.y;
      } else if (isNumber(source.dx) || isNumber(source.dy)) {
        dx = num(source.dx, 0);
        dy = num(source.dy, 0);
      } else {
        dx = Math.cos(enemy.facing);
        dy = Math.sin(enemy.facing);
      }

      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < EPSILON) { return; }
      enemy.x += (dx / len) * power;
      enemy.y += (dy / len) * power;
    }

    /** combat 经 ctx.applyDamage 结算的实际入口。返回实际扣血量。 */
    function damageEnemy(enemy, amount, source) {
      if (!enemy || !enemy.active || enemy.dead) { return 0; }
      var incoming = num(amount, 0);
      if (!(incoming > 0)) { return 0; }

      var before = enemy.hp;
      enemy.hp = Math.max(0, before - incoming);
      enemy.hitFlash = Math.max(enemy.hitFlash, hitFlashSec);
      applyKnockback(enemy, source);

      var actual = before - enemy.hp;
      if (enemy.hp <= 0) { killEnemy(enemy); }
      return actual;
    }

    /* ---------------------------- 波次解析 ---------------------------- */

    /**
     * 波次索引解析：优先匹配 waves[].index（1 基，配置口径），
     * 无匹配时回退为 0 基数组下标；也接受波次配置对象本身。
     */
    function resolveWave(source) {
      if (source === undefined || source === null) { return null; }

      if (typeof source === 'number') {
        if (!isFinite(source)) { return null; }
        var n = Math.floor(source);
        var i;
        for (i = 0; i < waves.length; i += 1) {
          var wave = waves[i];
          if (wave && num(wave.index, i + 1) === n) { return wave; }
        }
        if (n >= 0 && n < waves.length) { return waves[n]; }
        return null;
      }

      if (typeof source === 'object') {
        if (Array.isArray(source.spawnTable) || isNumber(source.spawnIntervalSec)) {
          return source;
        }
        if (source.waveIndex !== undefined) { return resolveWave(source.waveIndex); }
        if (source.index !== undefined) { return resolveWave(source.index); }
        if (source.wave !== undefined) { return resolveWave(source.wave); }
      }
      return null;
    }

    function sameWave(a, b) {
      if (!a || !b) { return false; }
      if (a === b) { return true; }
      if (isNumber(a.index) && isNumber(b.index) && a.index === b.index) { return true; }
      return isNumber(a.spawnIntervalSec) &&
        a.spawnIntervalSec === b.spawnIntervalSec &&
        num(a.maxAlive, -1) === num(b.maxAlive, -1);
    }

    function adoptWave(wave) {
      currentWave = wave;
      spawnTimer = 0;
      spawningEnabled = true;
    }

    function syncWave(waveCtx) {
      if (waveCtx === undefined || waveCtx === null) { return; }

      if (typeof waveCtx === 'object') {
        if (waveCtx.active === false || waveCtx.done === true || waveCtx.ended === true) {
          spawningEnabled = false;
          spawnTimer = 0;
          return;
        }
      }

      var next = resolveWave(waveCtx);
      if (!next) { return; }
      if (sameWave(currentWave, next)) {
        currentWave = next;
        return;
      }
      adoptWave(next);
    }

    /* ---------------------------- 生成 ---------------------------- */

    /** 世界边缘 spawnMargin 外随机选点（由上/右/下/左四条边进入）。 */
    function spawnPosition(enemy) {
      var r = enemy.radius;
      var edge = rng.int(0, 3);
      if (edge === 0) {
        return { x: rng.float(r, Math.max(r, world.width - r)), y: -spawnMargin };
      }
      if (edge === 1) {
        return { x: world.width + spawnMargin, y: rng.float(r, Math.max(r, world.height - r)) };
      }
      if (edge === 2) {
        return { x: rng.float(r, Math.max(r, world.width - r)), y: world.height + spawnMargin };
      }
      return { x: -spawnMargin, y: rng.float(r, Math.max(r, world.height - r)) };
    }

    /** 按 spawnTable 权重选类型并叠加波次/精英倍率生成一个敌人。 */
    function spawnOne(wave) {
      var table = Array.isArray(wave.spawnTable) ? wave.spawnTable : [];
      var picked = rng.weighted(table, function (entry) {
        return entry ? num(entry.weight, 0) : 0;
      });
      if (!picked || typeof picked.type !== 'string') { return null; }

      var def = enemyDefs[picked.type];
      if (!def) { return null; }

      var isElite = rng.chance(clamp(num(wave.eliteChance, 0), 0, 1));
      var hpMul = Math.max(0, num(wave.hpMultiplier, 1));
      var speedMul = Math.max(0, num(wave.speedMultiplier, 1));
      var damageMul = Math.max(0, num(wave.damageMultiplier, 1));

      var enemy = pool.acquire();
      idCounter += 1;

      enemy.active = true;
      enemy.dead = false;
      enemy.enemyId = idCounter;
      enemy.type = def.id;
      enemy.name = typeof def.name === 'string' ? def.name : def.id;
      enemy.behavior = typeof def.behavior === 'string' ? def.behavior : 'chase';
      enemy.elite = isElite;

      enemy.radius = Math.max(1, num(def.radius, 12) * (isElite ? eliteMul.radius : 1));
      enemy.hp = Math.max(1, Math.round(num(def.hp, 1) * hpMul * (isElite ? eliteMul.hp : 1)));
      enemy.maxHp = enemy.hp;
      enemy.speed = Math.max(0, num(def.speed, 0) * speedMul * (isElite ? eliteMul.speed : 1));
      enemy.damage = Math.max(0, roundTo(
        num(def.damage, 0) * damageMul * (isElite ? eliteMul.damage : 1), 2
      ));
      enemy.exp = Math.max(0, roundTo(num(def.exp, 0) * (isElite ? eliteMul.exp : 1), 2));

      enemy.age = 0;
      enemy.hitFlash = 0;
      enemy.contactTimer = 0;
      enemy.color = typeof def.color === 'string' ? def.color : COLORS.bodyFallback;
      enemy.accentColor = typeof def.accentColor === 'string' ? def.accentColor : COLORS.accentFallback;

      var pos = spawnPosition(enemy);
      enemy.x = pos.x;
      enemy.y = pos.y;

      var playerState = resolvePlayerState(resolvePlayer());
      var targetX = playerState ? playerState.x : world.width / 2;
      var targetY = playerState ? playerState.y : world.height / 2;
      enemy.facing = Math.atan2(targetY - enemy.y, targetX - enemy.x);

      return enemy;
    }

    /** 按 spawnIntervalSec 计时、maxAlive 限制刷怪；到达上限时清空计时以便空位即刻补怪。 */
    function maybeSpawn(step) {
      if (!spawningEnabled || !currentWave) {
        spawnTimer = 0;
        return;
      }

      var maxAlive = Math.max(1, Math.floor(num(currentWave.maxAlive, FALLBACK.maxAlive)));
      if (countAlive() >= maxAlive) {
        spawnTimer = 0;
        return;
      }

      var interval = Math.max(0.05, num(currentWave.spawnIntervalSec, FALLBACK.spawnIntervalSec));
      spawnTimer -= step;
      if (spawnTimer > 0) { return; }

      spawnOne(currentWave);
      spawnTimer = interval;
    }

    /* ---------------------------- 玩家接入 ---------------------------- */

    function resolvePlayer() {
      if (typeof ctx.getPlayer === 'function') {
        var injected = ctx.getPlayer();
        if (injected) { return injected; }
      }
      return ctx.player || null;
    }

    function resolvePlayerState(player) {
      if (player) {
        if (typeof player.getState === 'function') {
          var state = player.getState();
          if (state) { return state; }
        }
        if (isNumber(player.x) && isNumber(player.y)) { return player; }
      }
      if (typeof ctx.getPlayerState === 'function') {
        var external = ctx.getPlayerState();
        if (external) { return external; }
      }
      return ctx.playerState || null;
    }

    function playerRadiusOf(playerState) {
      return Math.max(0, num(playerState && playerState.radius, defaultPlayerRadius));
    }

    /* ---------------------------- 更新与分离 ---------------------------- */

    function stepDelta(dt) {
      if (!isNumber(dt) || dt <= 0) { return 0; }
      return dt > maxStepSec ? maxStepSec : dt;
    }

    function updateEnemy(enemy, step, playerState) {
      if (!enemy || !enemy.active || enemy.dead) { return; }

      enemy.age += step;
      if (enemy.hitFlash > 0) { enemy.hitFlash = Math.max(0, enemy.hitFlash - step); }
      if (enemy.contactTimer > 0) { enemy.contactTimer = Math.max(0, enemy.contactTimer - step); }

      if (enemy.behavior !== 'chase' || !playerState) { return; }
      if (playerState.dead === true || playerState.alive === false) { return; }

      var dx = playerState.x - enemy.x;
      var dy = playerState.y - enemy.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < EPSILON) { return; }

      var ux = dx / dist;
      var uy = dy / dist;
      enemy.facing = Math.atan2(uy, ux);

      /* 追击但不压进玩家体内：停在两圆相切的位置，接触伤害由 contactPlayer 结算。 */
      var stopDist = enemy.radius + playerRadiusOf(playerState);
      var travel = Math.min(enemy.speed * step, Math.max(0, dist - stopDist));
      if (travel > 0) {
        enemy.x += ux * travel;
        enemy.y += uy * travel;
      }
    }

    function separationBetween(a, b) {
      if (Collision && typeof Collision.separationCircleCircle === 'function') {
        return Collision.separationCircleCircle(a, b);
      }
      var reach = a.radius + b.radius;
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      var distSq = dx * dx + dy * dy;
      if (distSq >= reach * reach) { return null; }
      var dist = Math.sqrt(distSq);
      if (dist < EPSILON) { return { overlap: reach, x: 1, y: 0 }; }
      return { overlap: reach - dist, x: dx / dist, y: dy / dist };
    }

    /** 敌人之间两两分离（同屏上限约 30，O(n^2) 可接受），各推一半。 */
    function separateEnemies() {
      var list = pool.activeItems();
      for (var i = 0; i < list.length; i += 1) {
        var a = list[i];
        if (!a || !a.active || a.dead) { continue; }
        for (var j = i + 1; j < list.length; j += 1) {
          var b = list[j];
          if (!b || !b.active || b.dead) { continue; }
          var sep = separationBetween(a, b);
          if (!sep) { continue; }
          var push = sep.overlap * 0.5;
          a.x += sep.x * push;
          a.y += sep.y * push;
          b.x -= sep.x * push;
          b.y -= sep.y * push;
        }
      }
    }

    /** 只推开敌人、不改玩家位置（玩家位置由 player 模块独占）。 */
    function separateFromPlayer(playerState) {
      pool.forEachActive(function (enemy) {
        if (!enemy.active || enemy.dead) { return; }
        var sep = separationBetween(enemy, playerState);
        if (!sep) { return; }
        enemy.x += sep.x * sep.overlap;
        enemy.y += sep.y * sep.overlap;
      });
    }

    /**
     * 限制在世界内：仅在敌心进入世界矩形后夹取中心（生成点在世界外，
     * 未入场前不夹取，避免刚生成就被拉进屏幕边缘）。
     */
    function constrainEnemy(enemy) {
      if (!enemy.active || enemy.dead) { return; }
      var entered = enemy.x >= 0 && enemy.x <= world.width &&
        enemy.y >= 0 && enemy.y <= world.height;
      if (!entered) { return; }
      /* 夹取中心到世界矩形：入场后不会再走出去；圆身边缘可略出界由画布裁剪，不产生跳变。 */
      enemy.x = clamp(enemy.x, 0, world.width);
      enemy.y = clamp(enemy.y, 0, world.height);
    }

    /** 接触伤害：按敌人 damage 调玩家 takeDamage，节奏来自 balance.player.hitDamageCooldownSec。 */
    function contactPlayer(enemy, player, playerState) {
      if (!enemy.active || enemy.dead || !playerState) { return; }
      if (playerState.dead === true || playerState.alive === false) { return; }
      if (enemy.contactTimer > 0) { return; }

      var reach = enemy.radius + playerRadiusOf(playerState) + 1.5;
      var dx = playerState.x - enemy.x;
      var dy = playerState.y - enemy.y;
      if (dx * dx + dy * dy > reach * reach) { return; }

      var dealt = 0;
      if (player && typeof player.takeDamage === 'function') {
        dealt = player.takeDamage(enemy.damage, enemy);
      } else if (typeof ctx.applyPlayerDamage === 'function') {
        dealt = ctx.applyPlayerDamage(enemy.damage, enemy);
      }
      if (num(dealt, 0) > 0) {
        enemy.contactTimer = contactInterval;
      }
    }

    /* ---------------------------- 渲染 ---------------------------- */

    function drawEnemy(renderer, enemy) {
      var x = enemy.x;
      var y = enemy.y;
      var r = enemy.radius;
      var flash = enemy.hitFlash > 0;

      renderer.fillCircle(x, y + r * 0.7, r * 0.9, COLORS.shadow);

      var fx = Math.cos(enemy.facing);
      var fy = Math.sin(enemy.facing);
      renderer.drawLine(
        x + fx * (r - 2), y + fy * (r - 2),
        x + fx * (r + 7), y + fy * (r + 7),
        enemy.elite ? COLORS.eliteRing : COLORS.outline, 2
      );

      renderer.fillCircle(x, y, r, flash ? COLORS.hitFlash : enemy.color);
      renderer.fillCircle(x, y, r * 0.4, enemy.accentColor);
      renderer.strokeCircle(
        x, y, r,
        enemy.elite ? COLORS.eliteRing : COLORS.outline,
        enemy.elite ? 3 : 1.5
      );

      if (enemy.elite) {
        var pulse = r + 4 + Math.sin(enemy.age * 5) * 1.5;
        renderer.strokeCircle(x, y, pulse, COLORS.eliteRing, 1.5);
      }

      if (enemy.hp < enemy.maxHp || enemy.elite) {
        var width = Math.max(18, r * 2.2);
        var ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
        renderer.drawBar(
          x - width / 2, y - r - 8, width, 3, ratio,
          COLORS.hpBg,
          enemy.elite ? COLORS.eliteHp : COLORS.hpFg,
          COLORS.hpBorder
        );
      }
    }

    /* ---------------------------- 公开接口 ---------------------------- */

    var api = {};

    /**
     * 开始/切换波次：waveIndex 可为 waves[].index（1 基，优先匹配）、
     * 0 基数组下标，或波次配置对象；传 false/null 停止刷怪。
     */
    api.spawnWave = function (waveIndex) {
      if (waveIndex === false || waveIndex === null) {
        spawningEnabled = false;
        spawnTimer = 0;
        return api;
      }
      var wave = resolveWave(waveIndex);
      if (!wave) { return api; }
      if (sameWave(currentWave, wave)) {
        currentWave = wave;
        return api;
      }
      adoptWave(wave);
      return api;
    };

    /**
     * 每逻辑步驱动：同步波次 → 清理死亡 → 追击移动 → 分离 → 边界 → 接触伤害 → 刷怪。
     * @param {number} dt 秒（App 固定步长；本模块再做一次防御性截断）
     * @param {object|number} [waveCtx] 波次上下文：
     *   数字/波次对象（等价 spawnWave）、{ waveIndex } / { index } / { wave }、
     *   或 { active:false } 表示本波结束停止刷怪；缺省沿用当前波次。
     */
    api.update = function (dt, waveCtx) {
      var step = stepDelta(dt);
      if (step <= 0) { return api; }

      syncWave(waveCtx);
      cleanupDead();

      var player = resolvePlayer();
      var playerState = resolvePlayerState(player);

      pool.forEachActive(function (enemy) {
        updateEnemy(enemy, step, playerState);
      });

      separateEnemies();

      if (playerState && playerState.dead !== true && playerState.alive !== false) {
        separateFromPlayer(playerState);
      }

      pool.forEachActive(function (enemy) {
        constrainEnemy(enemy);
      });

      if (contactEnabled) {
        pool.forEachActive(function (enemy) {
          contactPlayer(enemy, player, playerState);
        });
      }

      maybeSpawn(step);
      return api;
    };

    /** 活跃敌人快照（过滤已死亡实例；App/combat 可安全遍历）。 */
    api.list = function () {
      var out = [];
      pool.forEachActive(function (enemy) {
        if (enemy.active && !enemy.dead) { out.push(enemy); }
      });
      return out;
    };

    /** 世界坐标绘制全部活跃敌人。 */
    api.render = function (renderer) {
      if (!renderer) { return api; }
      pool.forEachActive(function (enemy) {
        if (!enemy.active || enemy.dead) { return; }
        drawEnemy(renderer, enemy);
      });
      return api;
    };

    /** 单局重置：清空实体与刷怪状态，重开后无残留。 */
    api.reset = function () {
      pool.releaseAll();
      currentWave = null;
      spawnTimer = 0;
      spawningEnabled = false;
      idCounter = 0;
      return api;
    };

    /** 停止刷怪（保留场上实体），用于波次结束/胜负结算。 */
    api.stopSpawning = function () {
      spawningEnabled = false;
      spawnTimer = 0;
      return api;
    };

    /** 只读波次摘要。 */
    api.getWave = function () {
      if (!currentWave) { return null; }
      return {
        index: num(currentWave.index, 0),
        name: typeof currentWave.name === 'string' ? currentWave.name : '',
        maxAlive: Math.max(0, Math.floor(num(currentWave.maxAlive, 0))),
        spawnIntervalSec: Math.max(0, num(currentWave.spawnIntervalSec, 0))
      };
    };

    /** 只读状态（调试/HUD 可选使用）。 */
    api.getState = function () {
      var alive = 0;
      var eliteCount = 0;
      pool.forEachActive(function (enemy) {
        if (!enemy.active || enemy.dead) { return; }
        alive += 1;
        if (enemy.elite) { eliteCount += 1; }
      });
      return {
        count: alive,
        eliteCount: eliteCount,
        maxAlive: currentWave ? Math.max(0, Math.floor(num(currentWave.maxAlive, 0))) : 0,
        waveIndex: currentWave ? num(currentWave.index, 0) : 0,
        spawning: spawningEnabled
      };
    };

    return api;
  }

  /* ============================ 导出 ============================ */

  EnemiesNS.VERSION = VERSION;
  EnemiesNS.create = createEnemies;

  WX.Enemies = EnemiesNS;
})(typeof window !== 'undefined' ? window : this);
