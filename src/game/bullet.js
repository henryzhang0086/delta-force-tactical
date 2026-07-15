/* 弹道：沿方向飞行，命中墙/干员即结算 */
(function (DF) {
  'use strict';

  function Bullet(opts) {
    this.x = opts.x; this.y = opts.y;
    this.px = opts.x; this.py = opts.y;       // 上一帧位置（用于连续碰撞）
    this.dir = opts.dir;                       // 归一化方向
    this.speed = opts.speed;
    this.owner = opts.owner;                   // 发射者 agent
    this.team = opts.team;
    this.weapon = opts.weapon;
    this.aimQuality = opts.aimQuality;
    this.life = opts.range / opts.speed + 0.05;
    this.dead = false;
  }

  Bullet.prototype.update = function (dt, game) {
    if (this.dead) return;
    this.px = this.x; this.py = this.y;
    this.x += this.dir.x * this.speed * dt;
    this.y += this.dir.y * this.speed * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    var p1 = { x: this.px, y: this.py }, p2 = { x: this.x, y: this.y };

    // 墙壁碰撞
    var wallT = game.map.raycastWalls(p1, p2);

    // 干员碰撞（找最近的、非同队、存活）
    var hitAgent = null, hitT = wallT;
    for (var i = 0; i < game.agents.length; i++) {
      var a = game.agents[i];
      if (!a.alive || a.team === this.team) continue;
      var hit = DF.geom.segCircle(p1, p2, { x: a.x, y: a.y }, a.radius);
      if (hit && hit.t < hitT) { hitT = hit.t; hitAgent = a; }
    }

    if (hitAgent) {
      this.dead = true;
      var hx = this.px + (this.x - this.px) * hitT;
      var hy = this.py + (this.y - this.py) * hitT;
      game.onBulletHitAgent(this, hitAgent, hx, hy);
    } else if (wallT < 1) {
      this.dead = true;
      var wx = this.px + (this.x - this.px) * wallT;
      var wy = this.py + (this.y - this.py) * wallT;
      game.particles.spark(wx, wy);
    }
  };

  Bullet.prototype.render = function (ctx) {
    ctx.strokeStyle = this.team === 'attacker' ? '#ffe27a' : '#ff8a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.px, this.py);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
  };

  DF.Bullet = Bullet;
})(window.DF = window.DF || {});
