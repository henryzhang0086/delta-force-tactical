/* 轻量粒子系统：枪口火花 / 血迹 / 弹壳 / 破译火花 / 文字飘字 */
(function (DF) {
  'use strict';

  function Particles() {
    this.list = [];
    this.floaters = []; // 伤害飘字
  }

  Particles.prototype.spawn = function (x, y, opts) {
    opts = opts || {};
    var n = opts.count || 6;
    var V = DF.V;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (opts.speed || 120) * (0.4 + Math.random() * 0.8);
      this.list.push({
        x: x, y: y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        life: (opts.life || 0.4) * (0.6 + Math.random() * 0.6),
        maxLife: opts.life || 0.4,
        size: opts.size || 3,
        color: opts.color || '#ffcc55',
        drag: opts.drag != null ? opts.drag : 0.9,
        gravity: opts.gravity || 0
      });
    }
  };

  Particles.prototype.muzzle = function (x, y, angle) {
    var V = DF.V;
    for (var i = 0; i < 4; i++) {
      var a = angle + (Math.random() - 0.5) * 0.5;
      var sp = 260 + Math.random() * 180;
      this.list.push({ x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:0.09, maxLife:0.09, size:3.5, color:'#ffdd66', drag:0.8, gravity:0 });
    }
  };

  Particles.prototype.blood = function (x, y, angle) {
    this.spawn(x, y, { count: 9, speed: 160, life: 0.5, size: 3, color: '#c62828', vx: Math.cos(angle)*80, vy: Math.sin(angle)*80, drag: 0.88 });
  };

  Particles.prototype.spark = function (x, y) {
    this.spawn(x, y, { count: 5, speed: 130, life: 0.3, size: 2, color: '#bbccff', drag: 0.85 });
  };

  Particles.prototype.floater = function (x, y, text, color) {
    this.floaters.push({ x: x, y: y, text: text, color: color || '#fff', life: 0.9, vy: -40 });
  };

  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt;
    }
    for (var j = this.floaters.length - 1; j >= 0; j--) {
      var f = this.floaters[j];
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94;
      if (f.life <= 0) this.floaters.splice(j, 1);
    }
  };

  Particles.prototype.render = function (ctx) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (var j = 0; j < this.floaters.length; j++) {
      var f = this.floaters[j];
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.fillStyle = f.color;
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  };

  DF.Particles = Particles;
})(window.DF = window.DF || {});
