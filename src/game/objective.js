/* 密钥破译目标：进攻方站在站点内按住 F 累计进度，满则进攻方胜 */
(function (DF) {
  'use strict';

  function Objective(cfg, site) {
    this.cfg = cfg;
    this.site = site;
    this.progress = 0;         // 0~1
    this.decrypting = false;
    this.decryptedBy = null;
    this.done = false;
  }

  Objective.prototype.reset = function () {
    this.progress = 0;
    this.decrypting = false;
    this.decryptedBy = null;
    this.done = false;
  };

  Objective.prototype.inRange = function (agent) {
    return DF.V.dist(agent, this.site) <= this.cfg.radius;
  };

  // agent 尝试破译（按住 F 且在范围内且存活）
  Objective.prototype.tick = function (dt, agent, game) {
    if (this.done) return;
    this.decrypting = true;
    this.decryptedBy = agent;
    this.progress += dt / this.cfg.decryptTime;
    if (game && game.audio && Math.random() < 0.25) game.audio.decrypt();
    if (this.progress >= 1) {
      this.progress = 1;
      this.done = true;
    }
  };

  Objective.prototype.endFrame = function () {
    // 未被 tick 的帧：停止破译动画（进度保留，不倒退——已完成部分锁定）
    this.decrypting = false;
  };

  DF.Objective = Objective;
})(window.DF = window.DF || {});
