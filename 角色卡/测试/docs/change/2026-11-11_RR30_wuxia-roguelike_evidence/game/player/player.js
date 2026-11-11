/**
 * game/player/player.js
 * 模块：player（玩家实体）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 职责（架构契约 §3）：
 *   - 移动：WASD/方向键输入向量 × 移速 × dt，限制在逻辑世界内（考虑半径）；
 *   - 生命：hp/maxHp；受伤走无敌帧，无敌期间忽略伤害，不重复扣血；
 *   - 死亡：hp 归零标记 dead（只触发一次）；整局结束编排归 loop-app；
 *   - 渲染：render(renderer) 使用形状绘制（身体/朝向/受击闪烁/无敌脉冲），无外部图片。
 *
 * 公开契约（架构契约 §5.5）：
 *   WX.Player.create(ctx) -> {
 *     update(dt, input?), takeDamage(amount, source?), getState()
 *   }
 *   本模块按架构“最小约定”补充：heal / reset / render / applyModifiers /
 *   setProgress / isAlive / isInvulnerable / getModifiers。
 *   只发契约事件 `player:hp-changed`，载荷 `{ hp, maxHp, invulnerable }`；
 *   不发 `run:ended`，不新增任何未登记事件。
 *
 * 依赖（架构契约 §4）：只读 WX.Config 与 WX.Engine（Math/Collision/Renderer 公开 API）；
 * 不直接引用其他领域模块；与 loop-app 通过注入的 ctx 交互（事件总线、可选修饰器提供者、
 * 可选 input 回退）。
 *
 * 硬约束：经典 <script> + IIFE，挂载 window.WX.Player；无 ES Module、无 fetch/XHR、
 * 无外部资源、无构建链；不操作 DOM。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var PlayerNS = WX.Player || (WX.Player = {});

  var VERSION = '1.0.0';
  var EPSILON = 1e-6;

  /*
   * 以下兜底值仅在 WX.Config 缺失或字段非法时生效；正常路径一律读 WX.Config，
   * 不在模块内维护一份可调平衡数值。
   */
  var FALLBACK = {
    maxHp: 100,
    moveSpeed: 215,
    radius: 15,
    invulnerableSec: 0.9,
    pickupRadius: 80,
    worldWidth: 1280,
    worldHeight: 720,
    maxStepSec: 0.1
  };

  /* 表现层常量（配色与闪烁节奏），不属于平衡数值。 */
  var COLORS = {
    body: '#3c6b70',
    sash: '#d8c79b',
    outline: '#f2ead4',
    weapon: '#e8e0c6',
    weaponTip: '#fffaf0',
    hurt: '#c25248',
    invulnRing: 'rgba(226, 245, 235, 0.85)',
    shadow: 'rgba(0, 0, 0, 0.25)'
  };

  var IDLE_FACING = -Math.PI / 2; /* 初始朝上（面向战场纵深） */
  var HURT_FLASH_SEC = 0.18;      /* 受击闪红的纯表现时长 */
  var BLINK_SPEED = 34;           /* 无敌帧闪烁节奏（弧度/秒） */

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

  function setAlpha(renderer, value) {
    if (renderer && typeof renderer.setAlpha === 'function') {
      renderer.setAlpha(value);
    }
  }

  /* ============================ 配置读取 ============================ */

  /** 读取本模块需要的只读配置（架构契约 §5.7：数值全部来自 config-data）。 */
  function readConfig() {
    var cfg = WX.Config || {};
    var balance = cfg.balance || {};
    var playerCfg = balance.player || {};
    var worldCfg = balance.world || {};
    var loopCfg = balance.loop || {};

    var maxStep = num(loopCfg.maxDeltaSec, FALLBACK.maxStepSec);
    if (!(maxStep > 0)) { maxStep = FALLBACK.maxStepSec; }

    return {
      maxHp: Math.max(1, num(playerCfg.maxHp, FALLBACK.maxHp)),
      moveSpeed: Math.max(0, num(playerCfg.moveSpeed, FALLBACK.moveSpeed)),
      radius: Math.max(1, num(playerCfg.radius, FALLBACK.radius)),
      invulnerableSec: Math.max(0, num(playerCfg.invulnerableSec, FALLBACK.invulnerableSec)),
      pickupRadius: Math.max(0, num(playerCfg.pickupRadius, FALLBACK.pickupRadius)),
      worldWidth: Math.max(1, num(worldCfg.width, FALLBACK.worldWidth)),
      worldHeight: Math.max(1, num(worldCfg.height, FALLBACK.worldHeight)),
      maxStepSec: maxStep
    };
  }

  /* ============================ 属性修饰器 ============================ */

  /**
   * 归一化修饰器来源，返回本模块关心的聚合值：
   *   { maxHpAdd, maxHpMul, moveSpeed, damageTaken }
   *
   * 支持两种形态：
   *   1) 数组（与 WX.Config.upgrades[].modifiers 同构）：
   *      [{ stat: 'maxHp', op: 'add', value: 20 }, ...]
   *   2) 聚合对象：
   *      { maxHp: 20, moveSpeed: 1.12, damageTaken: 0.88 }
   *      或 { maxHp: { op: 'add', value: 20 }, ... }
   *
   * 其余 stat（damage/range/attackCooldown/...）由 combat/arsenal 消费，本模块忽略。
   */
  function normalizeModifiers(source) {
    var out = { maxHpAdd: 0, maxHpMul: 1, moveSpeed: 1, damageTaken: 1 };
    if (!source) { return out; }

    function apply(stat, op, value) {
      if (typeof stat !== 'string' || !isNumber(value)) { return; }
      var mul = op === 'mul';
      if (stat === 'maxHp') {
        if (mul) { out.maxHpMul *= value; } else { out.maxHpAdd += value; }
        return;
      }
      if (stat === 'moveSpeed' || stat === 'damageTaken') {
        if (mul) { out[stat] *= value; } else { out[stat] += value; }
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
        /* 聚合总数：maxHp 视为加算，倍率类 stat 视为乘算。 */
        apply(key, key === 'maxHp' ? 'add' : 'mul', val);
      } else if (val && typeof val === 'object') {
        apply(key, val.op, val.value);
      }
    }
    return out;
  }

  /* ============================ 工厂 ============================ */

  /**
   * 创建玩家实体。
   * @param {object} [ctx] loop-app 注入的上下文（可选字段）：
   *   bus / events   事件总线（对象，含 emit(name, payload) 或 publish），或
   *   emit           App 直接把 emit 函数注入 ctx；
   *   input          可选回退输入源（update(dt) 未显式传 input 时使用）；
   *   getPlayerModifiers / getModifiers
   *                  可选修饰器提供者，每步调用，返回数组或聚合对象；
   *                  若提供，则以它为准（覆盖 applyModifiers 的推入值）。
   * @returns {object} 玩家实体（见文件头公开契约）。
   */
  function createPlayer(ctx) {
    ctx = ctx || {};

    var cfg = readConfig();
    var baseMaxHp = cfg.maxHp;
    var baseMoveSpeed = cfg.moveSpeed;
    var world = { width: cfg.worldWidth, height: cfg.worldHeight };

    /* 运行时状态：位置/生命/朝向对外只读；内部计时器封闭在闭包内。 */
    var player = {
      x: world.width / 2,
      y: world.height / 2,
      radius: cfg.radius,
      hp: baseMaxHp,
      maxHp: baseMaxHp,
      level: 1,
      exp: 0,
      facing: IDLE_FACING,
      dead: false
    };

    var mods = { maxHpAdd: 0, maxHpMul: 1, moveSpeed: 1, damageTaken: 1 };
    var invulnTimer = 0;
    var hurtFlash = 0;
    var elapsed = 0;

    /* ---------------------------- 内部工具 ---------------------------- */

    /** 经事件总线上报生命变化（契约 §5.4：唯一事件 player:hp-changed）。 */
    function emitHpChanged() {
      var bus = ctx.bus || ctx.events || null;
      var payload = {
        hp: player.hp,
        maxHp: player.maxHp,
        invulnerable: invulnTimer > 0
      };

      if (bus && typeof bus.emit === 'function') {
        bus.emit('player:hp-changed', payload);
        return;
      }
      if (bus && typeof bus.publish === 'function') {
        bus.publish('player:hp-changed', payload);
        return;
      }
      if (typeof ctx.emit === 'function') {
        ctx.emit('player:hp-changed', payload);
        return;
      }
      if (typeof ctx.publish === 'function') {
        ctx.publish('player:hp-changed', payload);
      }
      /* 无总线时静默：App 仍可用 getState() 拉取快照。 */
    }

    function clampPosition(x, y) {
      var collision = WX.Engine && WX.Engine.Collision;
      if (collision && typeof collision.clampToWorld === 'function') {
        return collision.clampToWorld(
          { x: x, y: y, radius: player.radius },
          world.width,
          world.height
        );
      }
      var r = player.radius;
      return {
        x: clamp(x, r, world.width - r),
        y: clamp(y, r, world.height - r)
      };
    }

    /** 应用修饰器聚合值；maxHp 变化时按差值同步当前气血。 */
    function applyModifiersInternal(source, silent) {
      var next = normalizeModifiers(source);
      var prevMax = player.maxHp;
      var prevHp = player.hp;

      mods.maxHpAdd = next.maxHpAdd;
      mods.maxHpMul = next.maxHpMul > 0 ? next.maxHpMul : 1;
      mods.moveSpeed = Math.max(0, next.moveSpeed);
      mods.damageTaken = Math.max(0, next.damageTaken);

      var newMax = Math.max(1, Math.round(baseMaxHp * mods.maxHpMul + mods.maxHpAdd));
      player.maxHp = newMax;

      if (newMax > prevMax) {
        /* 上限提升时同步补足差值（铁布衫等强化手感直观）。 */
        player.hp = Math.min(newMax, player.hp + (newMax - prevMax));
      } else if (player.hp > newMax) {
        player.hp = newMax;
      }
      if (player.hp < 0) { player.hp = 0; }

      if (!silent && (player.maxHp !== prevMax || player.hp !== prevHp)) {
        emitHpChanged();
      }
      return player;
    }

    /** 从注入上下文读取可选修饰器（App 推入之外的第二条通道）。 */
    function refreshModifiersFromContext() {
      var source = null;
      if (typeof ctx.getPlayerModifiers === 'function') {
        source = ctx.getPlayerModifiers(player);
      } else if (typeof ctx.getModifiers === 'function') {
        source = ctx.getModifiers(player);
      }
      if (source === null || source === undefined) { return; }
      applyModifiersInternal(source, false);
    }

    /**
     * 归一化输入为移动向量：
     *   - Engine.Input 实例（有 moveVector 方法）；
     *   - 纯向量 { x, y }；
     *   - 输入快照 { move: { x, y } }；
     *   - 缺省回退 ctx.input。
     * 长度 > 1 时归一化，保证对角线不加速。
     */
    function resolveMove(input) {
      var src = input;
      if (!src) { src = ctx.input || null; }
      if (!src) { return { x: 0, y: 0 }; }

      var raw = null;
      if (typeof src.moveVector === 'function') {
        raw = src.moveVector();
      } else if (src.move && isNumber(src.move.x) && isNumber(src.move.y)) {
        raw = src.move;
      } else if (isNumber(src.x) && isNumber(src.y)) {
        raw = src;
      }
      if (!raw) { return { x: 0, y: 0 }; }

      var mx = raw.x;
      var my = raw.y;
      var len = Math.sqrt(mx * mx + my * my);
      if (len < EPSILON) { return { x: 0, y: 0 }; }
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      return { x: mx, y: my };
    }

    function stepDelta(dt) {
      if (!isNumber(dt) || dt <= 0) { return 0; }
      return dt > cfg.maxStepSec ? cfg.maxStepSec : dt;
    }

    /* ---------------------------- 公开接口 ---------------------------- */

    /**
     * 每个逻辑步更新：计时器 → 修饰器同步 → 移动与边界约束。
     * @param {number} dt 秒（App 固定步长；本模块再做一次防御性截断）
     * @param {object} [input] Engine.Input / {x,y} / {move:{x,y}}
     */
    player.update = function (dt, input) {
      var step = stepDelta(dt);
      if (step <= 0) { return player; }

      elapsed += step;

      var wasInvulnerable = invulnTimer > 0;
      if (invulnTimer > 0) {
        invulnTimer -= step;
        if (invulnTimer < 0) { invulnTimer = 0; }
      }
      if (hurtFlash > 0) {
        hurtFlash -= step;
        if (hurtFlash < 0) { hurtFlash = 0; }
      }
      if (wasInvulnerable && invulnTimer <= 0) {
        /* 无敌帧结束时通知 UI 停止闪烁（仍是契约事件，不新增事件名）。 */
        emitHpChanged();
      }

      refreshModifiersFromContext();

      if (player.dead) { return player; }

      var move = resolveMove(input);
      if (move.x !== 0 || move.y !== 0) {
        var speed = baseMoveSpeed * Math.max(0, mods.moveSpeed);
        var nextPos = clampPosition(
          player.x + move.x * speed * step,
          player.y + move.y * speed * step
        );
        player.x = nextPos.x;
        player.y = nextPos.y;
        player.facing = Math.atan2(move.y, move.x);
      }

      if (player.hp <= 0 && !player.dead) {
        /* 防御性兜底：生命归零必然只进入死亡态一次。 */
        player.hp = 0;
        player.dead = true;
        emitHpChanged();
      }

      return player;
    };

    /**
     * 受伤：无敌帧内忽略；实际扣血经 damageTaken 修饰器缩放。
     * @param {number} amount 原始伤害
     * @param {object} [source] 伤害来源（敌人/投射物，仅记账，可缺省）
     * @returns {number} 实际扣除的气血（被无敌帧忽略时为 0）
     */
    player.takeDamage = function (amount, source) {
      if (player.dead) { return 0; }
      var incoming = isNumber(amount) ? amount : 0;
      if (incoming <= 0) { return 0; }
      if (invulnTimer > 0) { return 0; }

      var dealt = incoming * Math.max(0, mods.damageTaken);
      if (!isNumber(dealt) || dealt < 0) { dealt = 0; }

      var before = player.hp;
      player.hp = Math.max(0, before - dealt);
      var actual = before - player.hp;

      invulnTimer = cfg.invulnerableSec;
      hurtFlash = HURT_FLASH_SEC;

      if (player.hp <= 0) {
        player.hp = 0;
        player.dead = true; /* 死亡判定只触发一次 */
      }

      emitHpChanged();
      return actual;
    };

    /** 回复气血（金疮药等消耗品经 App 调用），不超过上限。 */
    player.heal = function (amount) {
      if (player.dead) { return 0; }
      var n = isNumber(amount) ? amount : 0;
      if (n <= 0) { return 0; }

      var before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + n);
      var healed = player.hp - before;
      if (healed > 0) { emitHpChanged(); }
      return healed;
    };

    /** 是否存活（契约死亡判定入口）。 */
    player.isAlive = function () {
      return !player.dead && player.hp > 0;
    };

    /** 当前是否处于无敌帧。 */
    player.isInvulnerable = function () {
      return invulnTimer > 0;
    };

    /** 只读状态快照（契约 §5.5 必需字段全部包含）。 */
    player.getState = function () {
      return {
        x: player.x,
        y: player.y,
        radius: player.radius,
        hp: player.hp,
        maxHp: player.maxHp,
        level: player.level,
        exp: player.exp,
        invulnerable: invulnTimer > 0,
        invulnerableRemaining: invulnTimer,
        facing: player.facing,
        pickupRadius: cfg.pickupRadius,
        moveSpeed: baseMoveSpeed * Math.max(0, mods.moveSpeed),
        alive: !player.dead && player.hp > 0,
        dead: player.dead
      };
    };

    /** 当前生效的修饰器聚合值（调试/重开保持用）。 */
    player.getModifiers = function () {
      return {
        maxHpAdd: mods.maxHpAdd,
        maxHpMul: mods.maxHpMul,
        moveSpeed: mods.moveSpeed,
        damageTaken: mods.damageTaken
      };
    };

    /**
     * 推入强化/道具修饰器（与 WX.Config.upgrades[].modifiers 同构的数组，
     * 或聚合对象）。若 ctx 提供了 getPlayerModifiers/getModifiers，则每步以它为准。
     */
    player.applyModifiers = function (source) {
      return applyModifiersInternal(source, false);
    };

    /* 语义别名，便于 App 以 set 风格调用。 */
    player.setModifiers = player.applyModifiers;

    /** App 同步 progression 的等级/经验，使 getState 快照字段完整（不参与升级判定）。 */
    player.setProgress = function (level, exp) {
      if (isNumber(level)) { player.level = Math.max(1, Math.floor(level)); }
      if (isNumber(exp)) { player.exp = Math.max(0, exp); }
      return player;
    };

    /**
     * 重开单局：复位位置/生命/计时器与死亡态，默认清空上一局修饰器。
     * @param {object} [options] { x, y, level, keepModifiers }
     */
    player.reset = function (options) {
      options = options || {};

      invulnTimer = 0;
      hurtFlash = 0;
      elapsed = 0;

      player.dead = false;
      player.level = Math.max(1, Math.floor(num(options.level, 1)));
      player.exp = 0;
      player.facing = IDLE_FACING;

      if (options.keepModifiers !== true) {
        applyModifiersInternal(null, true);
      }
      player.hp = player.maxHp;

      var startPos = clampPosition(
        num(options.x, world.width / 2),
        num(options.y, world.height / 2)
      );
      player.x = startPos.x;
      player.y = startPos.y;

      emitHpChanged();
      return player;
    };

    /**
     * 世界坐标绘制：身体圆形 + 腰带 + 朝向短兵 + 受击闪红 + 无敌帧脉冲。
     * 不依赖外部图片，只调用 WX.Engine.Renderer 公开原语。
     */
    player.render = function (renderer) {
      if (!renderer) { return player; }

      var x = player.x;
      var y = player.y;
      var r = player.radius;
      var prevAlpha = typeof renderer.getAlpha === 'function' ? renderer.getAlpha() : 1;

      var alpha = 1;
      if (player.dead) {
        alpha = 0.35;
      } else if (invulnTimer > 0) {
        /* 无敌帧闪烁：不整段消失，保持可读性。 */
        alpha = 0.62 + 0.3 * Math.abs(Math.sin(elapsed * BLINK_SPEED));
      }
      setAlpha(renderer, prevAlpha * alpha);

      /* 地面投影 */
      renderer.fillCircle(x, y + r * 0.7, r * 0.9, COLORS.shadow);

      /* 朝向短兵（战斗挥砍方向的可读提示） */
      var dx = Math.cos(player.facing);
      var dy = Math.sin(player.facing);
      if (!player.dead) {
        renderer.drawLine(
          x + dx * (r + 2), y + dy * (r + 2),
          x + dx * (r + 18), y + dy * (r + 18),
          COLORS.weapon, 3
        );
        renderer.fillCircle(x + dx * (r + 20), y + dy * (r + 20), 3, COLORS.weaponTip);
      }

      /* 青衫身体 + 腰带 + 描边 */
      renderer.fillCircle(x, y, r, hurtFlash > 0 && !player.dead ? COLORS.hurt : COLORS.body);
      renderer.fillCircle(x, y, r * 0.42, COLORS.sash);
      renderer.strokeCircle(x, y, r, COLORS.outline, 2);

      /* 无敌帧外环脉冲 */
      if (!player.dead && invulnTimer > 0) {
        var pulse = r + 6 + Math.sin(elapsed * BLINK_SPEED) * 2;
        renderer.strokeCircle(x, y, pulse, COLORS.invulnRing, 1.5);
      }

      setAlpha(renderer, prevAlpha);
      return player;
    };

    return player;
  }

  /* ============================ 导出 ============================ */

  PlayerNS.VERSION = VERSION;
  PlayerNS.create = createPlayer;

  WX.Player = PlayerNS;
})(typeof window !== 'undefined' ? window : this);
