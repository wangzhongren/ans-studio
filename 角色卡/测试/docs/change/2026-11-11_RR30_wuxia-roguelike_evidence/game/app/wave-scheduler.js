/**
 * game/app/wave-scheduler.js
 * 模块：loop-app · 波次时间轴（挂 WX.App.WaveScheduler）
 *
 * 职责：按 WX.Config.waves[] 的 startSec/endSec 时间窗推进波次，向回调上报
 * “波次开始 / 波次结束 / 全部波次结束”。本调度器不直接发事件、不碰实体：
 * App 在回调里发契约事件 wave:started / wave:cleared 并驱动 enemies.spawnWave。
 *
 * 胜负口径（架构契约 §5.3 / 意图）：生存制——活到 durationSec 且终波结束即胜利；
 * 若 waves 为空，则以 durationSec 单独判定结束。
 *
 * 硬约束：经典 IIFE，无 ES Module / fetch / 外部依赖；纯逻辑，不操作 DOM。
 */
(function (global) {
  'use strict';

  var WX = global.WX || (global.WX = {});
  var App = WX.App || (WX.App = {});

  function pickWaves(waves) {
    var out = [];
    if (!Array.isArray(waves)) { return out; }
    for (var i = 0; i < waves.length; i += 1) {
      var w = waves[i];
      if (!w) { continue; }
      var start = typeof w.startSec === 'number' ? w.startSec : 0;
      var end = typeof w.endSec === 'number' ? w.endSec : start;
      out.push({
        index: typeof w.index === 'number' ? w.index : i + 1,
        name: w.name || '',
        startSec: start,
        endSec: end,
        raw: w
      });
    }
    out.sort(function (a, b) { return a.startSec - b.startSec; });
    return out;
  }

  /**
   * @param {object} options
   *   waves       WX.Config.waves
   *   durationSec 单局总时长（缺省取末波 endSec 或 0）
   *   onWaveStarted(wave, info)
   *   onWaveCleared(wave, info)
   *   onComplete()            全部波次结束/时长达标，仅触发一次
   */
  function WaveScheduler(options) {
    options = options || {};
    this.waves = pickWaves(options.waves);
    this.durationSec = typeof options.durationSec === 'number'
      ? options.durationSec
      : (this.waves.length > 0 ? this.waves[this.waves.length - 1].endSec : 0);

    this.onWaveStarted = typeof options.onWaveStarted === 'function' ? options.onWaveStarted : null;
    this.onWaveCleared = typeof options.onWaveCleared === 'function' ? options.onWaveCleared : null;
    this.onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;

    this.reset();
  }

  WaveScheduler.prototype.reset = function () {
    this.waveIndex = -1;
    this.current = null;
    this.completed = false;
    this.elapsed = 0;
    return this;
  };

  /** 是否存在有效波次配置。 */
  WaveScheduler.prototype.hasWaves = function () {
    return this.waves.length > 0;
  };

  /** 当前波次（配置快照）；无波次返回 null。 */
  WaveScheduler.prototype.currentWave = function () {
    return this.current;
  };

  /** 当前波次的剩余秒数（无波次返回 0）。 */
  WaveScheduler.prototype.waveTimeLeft = function () {
    if (!this.current) { return 0; }
    var left = this.current.endSec - this.elapsed;
    return left > 0 ? left : 0;
  };

  /** 单局剩余秒数（不小于 0）。 */
  WaveScheduler.prototype.runTimeLeft = function () {
    var left = this.durationSec - this.elapsed;
    return left > 0 ? left : 0;
  };

  /** 已完成的波次数（用于统计）。 */
  WaveScheduler.prototype.clearedCount = function () {
    return this.waveIndex;
  };

  WaveScheduler.prototype._startWave = function (index) {
    this.waveIndex = index;
    this.current = this.waves[index];
    if (this.onWaveStarted) {
      this.onWaveStarted(this.current, {
        elapsed: this.elapsed,
        timeLeft: this.waveTimeLeft(),
        waveNumber: index + 1,
        totalWaves: this.waves.length
      });
    }
  };

  /**
   * 从 t=0 开始（单局开始/重开）。立即上报第一波开始。
   */
  WaveScheduler.prototype.begin = function () {
    this.reset();
    if (this.waves.length === 0) { return this; }
    this._startWave(0);
    return this;
  };

  /**
   * 推进到给定单局时间（秒）。幂等：同一 elapsed 重复调用不会重复触发事件。
   * 跨多个波次边界时按顺序逐个上报。
   */
  WaveScheduler.prototype.update = function (elapsed) {
    if (this.completed) { return this; }
    var t = typeof elapsed === 'number' && elapsed > 0 ? elapsed : 0;
    if (t > this.elapsed) { this.elapsed = t; }

    if (this.waves.length === 0) {
      /* 无波次配置：只按单局时长判定结束。 */
      if (this.durationSec > 0 && this.elapsed >= this.durationSec) {
        this.completed = true;
        if (this.onComplete) { this.onComplete(); }
      }
      return this;
    }

    /* 事件里只暴露契约字段 wave/timeLeft；info 供 App 内部使用。 */
    while (this.waveIndex >= 0 && this.waveIndex < this.waves.length) {
      var wave = this.waves[this.waveIndex];
      if (this.elapsed < wave.endSec) { break; }

      var clearedIndex = this.waveIndex;
      var cleared = this.waves[clearedIndex];
      this.current = null;
      if (this.onWaveCleared) {
        this.onWaveCleared(cleared, {
          elapsed: this.elapsed,
          timeLeft: 0,
          waveNumber: clearedIndex + 1,
          totalWaves: this.waves.length
        });
      }

      var nextIndex = clearedIndex + 1;
      if (nextIndex < this.waves.length) {
        this._startWave(nextIndex);
      } else {
        this.waveIndex = this.waves.length;
        this.current = null;
        this.completed = true;
        if (this.onComplete) { this.onComplete(); }
        break;
      }
    }

    return this;
  };

  App.WaveScheduler = {
    create: function (options) {
      return new WaveScheduler(options);
    },
    WaveScheduler: WaveScheduler
  };

  WX.App = App;
})(typeof window !== 'undefined' ? window : this);
