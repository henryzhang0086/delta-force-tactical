/* 经济系统 —— 纯逻辑，可 node 单测 */
(function (DF) {
  'use strict';

  function Economy(cfg) {
    this.cfg = cfg;
    this.money = cfg.startMoney;
    this.lossStreak = 0;
  }

  Economy.prototype.canAfford = function (cost) { return this.money >= cost; };

  Economy.prototype.spend = function (cost) {
    if (this.money < cost) return false;
    this.money -= cost;
    return true;
  };

  Economy.prototype.add = function (amount) {
    this.money = Math.min(this.cfg.maxMoney, this.money + amount);
  };

  // 小局结算奖励
  Economy.prototype.awardRoundEnd = function (won) {
    if (won) {
      this.add(this.cfg.winReward);
      this.lossStreak = 0;
    } else {
      var loss = Math.min(this.cfg.lossMax, this.cfg.lossBase + this.lossStreak * this.cfg.lossStep);
      this.add(loss);
      this.lossStreak++;
    }
  };

  Economy.prototype.awardKill = function (category) {
    if (category === 'melee') this.add(this.cfg.meleeKillReward);
    else if (category === 'sniper') this.add(this.cfg.sniperKillReward);
    else this.add(this.cfg.killReward);
  };

  Economy.prototype.awardDecrypt = function () { this.add(this.cfg.decryptReward); };

  DF.Economy = Economy;
})(typeof window !== 'undefined' ? (window.DF = window.DF || {}) : (module.exports = {}));
