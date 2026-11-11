/**
 * game/data/config.js
 * 模块：config-data（数值与文案的唯一来源）
 * 项目：wuxia-roguelike ·《江湖夜雨》武侠肉鸽生存
 *
 * 形态约束（架构契约 §1 / §5.7）：
 *   - 经典 <script> + IIFE 挂载 window.WX.Config，不使用 ES Module；
 *   - 纯数据常量，运行时只读；不得 fetch/XHR 读取本地 JSON；
 *   - 无外部依赖；本文件不含业务逻辑、不操作 DOM。
 *
 * 结构总览（架构契约 §5.5）：
 *   meta      —— 配置标识与版本
 *   waves     —— 波次表（时间窗、刷怪间隔/上限、强度倍率、刷怪权重表）
 *   enemies   —— 敌人类型（基础属性与命名）
 *   upgrades  —— 升级强化池（weight/maxStack/modifiers）
 *   weapons   —— 武器表（起始武器 + 可获取武器）
 *   items     —— 道具表（消耗品/被动）
 *   balance   —— 单局、循环、世界、玩家、升级、掉落、精英、战斗口径
 *   text      —— 全部界面文案与提示（武侠命名）
 *
 * 属性修饰器约定（供 progression / arsenal / combat / player 读取）：
 *   modifiers: [{ stat, op: "add"|"mul", value }]
 *   可用 stat：
 *     damage           攻击伤害（加算）
 *     attackCooldown   攻击冷却倍率（乘算，越小越快）
 *     range            攻击范围倍率（乘算）
 *     moveSpeed        移速倍率（乘算）
 *     maxHp            气血上限（加算）
 *     damageTaken      受创倍率（乘算，小于 1 为减伤）
 *     pickupRadius     拾取半径倍率（乘算）
 *     expGain          经验获取倍率（乘算）
 *     critChance       暴击概率（加算）
 *
 * 版本：1.0.0（与架构契约 v1 对齐；结构变更须同步架构版本与模块契约）
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});

  var CONFIG = {
    meta: {
      id: 'wuxia-roguelike-config',
      version: '1.0.0',
      flowId: 'wuxia-roguelike',
      readonly: true,
      note: '纯数据常量：运行时只读；结构变更须同步架构契约版本'
    },

    /* ============================ 波次 ============================
     * 单局 210 秒 / 6 波，时间窗首尾相接；刷怪速度与强度逐波递增。
     * spawnTable[].weight 为相对权重，type 引用 enemies[].id。
     * hpMultiplier / speedMultiplier / damageMultiplier 作用于敌人基础值。
     */
    waves: [
      {
        index: 1,
        name: '初入江湖',
        startSec: 0,
        endSec: 35,
        spawnIntervalSec: 1.8,
        maxAlive: 10,
        hpMultiplier: 1.0,
        speedMultiplier: 1.0,
        damageMultiplier: 1.0,
        eliteChance: 0,
        spawnTable: [
          { type: 'bandit', weight: 10 }
        ]
      },
      {
        index: 2,
        name: '群盗来袭',
        startSec: 35,
        endSec: 75,
        spawnIntervalSec: 1.5,
        maxAlive: 14,
        hpMultiplier: 1.15,
        speedMultiplier: 1.0,
        damageMultiplier: 1.05,
        eliteChance: 0,
        spawnTable: [
          { type: 'bandit', weight: 7 },
          { type: 'bladesman', weight: 5 }
        ]
      },
      {
        index: 3,
        name: '刀客围杀',
        startSec: 75,
        endSec: 115,
        spawnIntervalSec: 1.3,
        maxAlive: 18,
        hpMultiplier: 1.3,
        speedMultiplier: 1.05,
        damageMultiplier: 1.1,
        eliteChance: 0.03,
        spawnTable: [
          { type: 'bandit', weight: 6 },
          { type: 'bladesman', weight: 6 },
          { type: 'brute', weight: 3 }
        ]
      },
      {
        index: 4,
        name: '恶客压境',
        startSec: 115,
        endSec: 150,
        spawnIntervalSec: 1.15,
        maxAlive: 22,
        hpMultiplier: 1.45,
        speedMultiplier: 1.1,
        damageMultiplier: 1.2,
        eliteChance: 0.05,
        spawnTable: [
          { type: 'bandit', weight: 6 },
          { type: 'bladesman', weight: 6 },
          { type: 'brute', weight: 4 }
        ]
      },
      {
        index: 5,
        name: '血战长街',
        startSec: 150,
        endSec: 185,
        spawnIntervalSec: 1.0,
        maxAlive: 26,
        hpMultiplier: 1.6,
        speedMultiplier: 1.15,
        damageMultiplier: 1.3,
        eliteChance: 0.08,
        spawnTable: [
          { type: 'bandit', weight: 5 },
          { type: 'bladesman', weight: 6 },
          { type: 'brute', weight: 5 }
        ]
      },
      {
        index: 6,
        name: '生死一线',
        startSec: 185,
        endSec: 210,
        spawnIntervalSec: 0.85,
        maxAlive: 30,
        hpMultiplier: 1.8,
        speedMultiplier: 1.2,
        damageMultiplier: 1.4,
        eliteChance: 0.1,
        spawnTable: [
          { type: 'bandit', weight: 4 },
          { type: 'bladesman', weight: 6 },
          { type: 'brute', weight: 6 }
        ]
      }
    ],

    /* ============================ 敌人 ============================
     * hp/speed/damage/radius/exp 为基础值，波次倍率在生成时叠加。
     * behavior 目前仅 chase（追击玩家）。
     */
    enemies: [
      {
        id: 'bandit',
        name: '山贼',
        description: '结伙劫道的寻常匪徒，身法平平，胜在人多势众。',
        hp: 22,
        speed: 62,
        damage: 8,
        radius: 15,
        exp: 3,
        behavior: 'chase',
        color: '#8a6d4b',
        accentColor: '#d8b98a'
      },
      {
        id: 'bladesman',
        name: '刀客',
        description: '单刀快马，出手迅疾，围杀最忌被其贴身。',
        hp: 16,
        speed: 98,
        damage: 7,
        radius: 13,
        exp: 4,
        behavior: 'chase',
        color: '#7c5a52',
        accentColor: '#e0b9a4'
      },
      {
        id: 'brute',
        name: '力士',
        description: '横练外家功夫，步履虽慢，一击却重逾千钧。',
        hp: 58,
        speed: 42,
        damage: 15,
        radius: 22,
        exp: 8,
        behavior: 'chase',
        color: '#5f6b57',
        accentColor: '#c9d3b4'
      }
    ],

    /* ============================ 强化 ============================
     * 升级时按 weight 从池中抽取 balance.leveling.choiceCount 项；
     * maxStack 为单项在单局内可选取次数上限。
     */
    upgrades: [
      {
        id: 'po-jia-jue',
        name: '破甲诀',
        description: '剑走偏锋，每击多伤六分。',
        weight: 10,
        maxStack: 5,
        modifiers: [
          { stat: 'damage', op: 'add', value: 6 }
        ]
      },
      {
        id: 'ji-feng-jian',
        name: '疾风剑式',
        description: '出招更急，冷却缩短一成二。',
        weight: 10,
        maxStack: 4,
        modifiers: [
          { stat: 'attackCooldown', op: 'mul', value: 0.88 }
        ]
      },
      {
        id: 'ling-bo-wei-bu',
        name: '凌波微步',
        description: '步法飘忽，移速增一成二。',
        weight: 10,
        maxStack: 4,
        modifiers: [
          { stat: 'moveSpeed', op: 'mul', value: 1.12 }
        ]
      },
      {
        id: 'tie-bu-shan',
        name: '铁布衫',
        description: '气血上限增二十。',
        weight: 9,
        maxStack: 5,
        modifiers: [
          { stat: 'maxHp', op: 'add', value: 20 }
        ]
      },
      {
        id: 'jin-zhong-zhao',
        name: '金钟罩',
        description: '受创减轻一成二。',
        weight: 8,
        maxStack: 3,
        modifiers: [
          { stat: 'damageTaken', op: 'mul', value: 0.88 }
        ]
      },
      {
        id: 'jian-qi-zong-heng',
        name: '剑气纵横',
        description: '剑势外扩，攻击范围增一成五。',
        weight: 8,
        maxStack: 3,
        modifiers: [
          { stat: 'range', op: 'mul', value: 1.15 }
        ]
      },
      {
        id: 'chao-yang-jue',
        name: '朝阳诀',
        description: '吐纳天地，经验获取增一成半。',
        weight: 7,
        maxStack: 4,
        modifiers: [
          { stat: 'expGain', op: 'mul', value: 1.15 }
        ]
      },
      {
        id: 'hui-xin-yi-ji',
        name: '会心一击',
        description: '看破破绽，暴击概率增一成。',
        weight: 7,
        maxStack: 3,
        modifiers: [
          { stat: 'critChance', op: 'add', value: 0.1 }
        ]
      }
    ],

    /* ============================ 武器 ============================
     * starting=true 为开局佩戴；其余经掉落/获取接入（见 balance.drops）。
     * kind：sweep（近身扇形挥击）| projectile（飞刃投射）。
     */
    weapons: [
      {
        id: 'iron-sword',
        name: '铁剑',
        description: '江湖人常备青锋，朴实无华，胜在稳妥。',
        starting: true,
        kind: 'sweep',
        damage: 12,
        cooldownSec: 0.55,
        range: 150,
        arcDeg: 120,
        maxTargets: 2,
        knockback: 36,
        projectile: null
      },
      {
        id: 'liu-ye-dao',
        name: '柳叶飞刀',
        description: '袖中飞刃，取敌于数丈之外。',
        starting: false,
        kind: 'projectile',
        damage: 9,
        cooldownSec: 0.9,
        range: 340,
        arcDeg: 0,
        maxTargets: 1,
        knockback: 12,
        projectile: {
          speed: 520,
          radius: 7,
          pierce: 1,
          lifetimeSec: 1.2
        }
      }
    ],

    /* ============================ 道具 ============================
     * kind：consumable（拾取即用）| passive（持有生效）。
     */
    items: [
      {
        id: 'jin-chuang-yao',
        name: '金疮药',
        description: '即刻回复三十点气血。',
        kind: 'consumable',
        maxStack: 5,
        heal: 30,
        modifiers: []
      },
      {
        id: 'hu-xin-jing',
        name: '护心镜',
        description: '贴身护住要害，受创减轻一成半。',
        kind: 'passive',
        maxStack: 2,
        modifiers: [
          { stat: 'damageTaken', op: 'mul', value: 0.85 }
        ]
      },
      {
        id: 'qing-gong-xie',
        name: '轻功鞋',
        description: '踏雪无痕，移速增一成。',
        kind: 'passive',
        maxStack: 3,
        modifiers: [
          { stat: 'moveSpeed', op: 'mul', value: 1.1 }
        ]
      },
      {
        id: 'ju-qi-dan',
        name: '聚气丹',
        description: '内息绵长，经验获取增两成。',
        kind: 'passive',
        maxStack: 3,
        modifiers: [
          { stat: 'expGain', op: 'mul', value: 1.2 }
        ]
      }
    ],

    /* ============================ 平衡口径 ============================ */
    balance: {
      run: {
        durationSec: 210,
        targetWaveCount: 6,
        victoryRule: 'survive'
      },
      loop: {
        fixedStepSec: 1 / 60,
        maxDeltaSec: 0.1
      },
      world: {
        width: 1280,
        height: 720,
        spawnMargin: 48
      },
      player: {
        maxHp: 100,
        moveSpeed: 215,
        radius: 15,
        invulnerableSec: 0.9,
        hitDamageCooldownSec: 0.7,
        pickupRadius: 80,
        expMagnetSpeed: 340,
        critChance: 0.05,
        critMultiplier: 1.8,
        startWeaponId: 'iron-sword'
      },
      leveling: {
        maxLevel: 15,
        choiceCount: 3,
        expThresholds: [8, 18, 30, 45, 63, 85, 111, 141, 175, 213, 255, 301, 351, 405, 463]
      },
      drops: {
        expOrbRadius: 5,
        expOrbLifetimeSec: 25,
        itemDropChance: 0.05,
        itemPool: ['jin-chuang-yao', 'hu-xin-jing', 'qing-gong-xie', 'ju-qi-dan'],
        weaponDropWaveIndex: 3,
        weaponDropId: 'liu-ye-dao'
      },
      elite: {
        hpMultiplier: 2.2,
        speedMultiplier: 0.92,
        damageMultiplier: 1.4,
        radiusMultiplier: 1.25,
        expMultiplier: 3.0
      },
      combat: {
        targetMode: 'nearest-in-range',
        hitFlashSec: 0.12
      }
    },

    /* ============================ 文案 ============================ */
    text: {
      title: '江湖夜雨',
      subtitle: '一剑一人，独闯风雨',
      menu: {
        tagline: '十年磨一剑，霜刃未曾试。',
        startButton: '踏入江湖',
        controlsHint: 'WASD / 方向键 移动 · 自动出招 · Esc 暂停'
      },
      hud: {
        hpLabel: '气血',
        levelLabel: '境界',
        expLabel: '修为',
        waveLabel: '波次',
        timeLeftLabel: '余时',
        killsLabel: '斩敌',
        elapsedLabel: '已战',
        secondsUnit: '秒'
      },
      levelUp: {
        title: '顿悟',
        subtitle: '择一法门，精进己身'
      },
      states: {
        pausedTitle: '静息',
        pausedHint: '按 P / Esc 继续'
      },
      result: {
        victoryTitle: '名震江湖',
        defeatTitle: '身死道消',
        victoryDesc: '最后一波敌影散去，长街血雨渐歇，你的名号自此传遍江湖。',
        defeatDesc: '刀光散尽，你倒在青石长街。江湖路远，来日再战。',
        restartButton: '再战江湖',
        statsKills: '斩敌',
        statsLevel: '境界',
        statsTime: '存活'
      },
      wave: {
        bannerPrefix: '第',
        bannerSuffix: '波',
        clearedText: '此波已清'
      },
      tips: [
        '靠近经验光点即可自动拾取。',
        '气血归零即败，撑过终波即胜。',
        '刀客身法极快，切勿被其贴身。'
      ]
    }
  };

  WX.Config = CONFIG;
})(typeof window !== 'undefined' ? window : this);
