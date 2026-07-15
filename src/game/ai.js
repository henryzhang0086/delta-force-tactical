/* AI 行为：目标获取 → 交战 / 导航 / 换弹 / 治疗 / 破译·防守 */
(function (DF) {
  'use strict';

  var V = DF.V;

  function AI(agent, game) {
    this.a = agent;
    this.game = game;
    this.cfg = DF.CONFIG.ai;
    this.target = null;
    this.acquiredAt = 0;
    this.lostAt = 0;
    this.lastKnown = null;
    this.repositionUntil = 0;
    this.strafeDir = game.rng.sign();
    this.strafeUntil = 0;
    this.goal = null;
  }

  AI.prototype.preferredRange = function () {
    var w = this.a.currentWeapon();
    if (!w) return 200;
    switch (w.def.category) {
      case 'sniper': return 560;
      case 'marksman': return 460;
      case 'lmg': return 400;
      case 'ar': return 360;
      case 'shotgun': return 90;
      case 'pistol': return 200;
      default: return 220; // smg
    }
  };

  AI.prototype.canSee = function (t) {
    if (!t.alive) return false;
    var d = V.dist(this.a, t);
    if (d > this.cfg.viewDistance) return false;
    var toT = Math.atan2(t.y - this.a.y, t.x - this.a.x);
    if (Math.abs(V.wrapAngle(toT - this.a.angle)) > (this.cfg.fovDeg * Math.PI / 180) / 2) {
      // 视野外，但极近距离仍能察觉
      if (d > 90) return false;
    }
    return !this.game.map.lineBlocked({ x: this.a.x, y: this.a.y }, { x: t.x, y: t.y });
  };

  AI.prototype.acquire = function () {
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.game.agents.length; i++) {
      var t = this.game.agents[i];
      if (!t.alive || t.team === this.a.team) continue;
      if (!this.canSee(t)) continue;
      var d = V.dist(this.a, t);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) {
      if (this.target !== best) { this.target = best; this.acquiredAt = this.game.time; }
      this.lastKnown = { x: best.x, y: best.y };
    } else if (this.target) {
      // 目标失联
      if (!this.canSee(this.target)) {
        this.lostAt = this.game.time;
        this.target = null;
      }
    }
  };

  // 朝目标点转向（带转速与瞄准误差）
  AI.prototype.faceToward = function (px, py, dt, aimError) {
    var desired = Math.atan2(py - this.a.y, px - this.a.x);
    if (aimError) desired += (Math.random() - 0.5) * aimError * 2;
    this.a.angle = V.lerpAngle(this.a.angle, desired, Math.min(1, dt * 9));
  };

  // 转向朝向移动方向平滑
  AI.prototype.faceMove = function (dx, dy, dt) {
    if (Math.abs(dx) + Math.abs(dy) < 0.01) return;
    var desired = Math.atan2(dy, dx);
    this.a.angle = V.lerpAngle(this.a.angle, desired, Math.min(1, dt * 6));
  };

  // 带避障的寻路移动
  AI.prototype.moveToward = function (px, py, dt, sprint) {
    var dx = px - this.a.x, dy = py - this.a.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 6) return;
    dx /= dist; dy /= dist;
    // whisker 避障：若前方碰撞，尝试偏转
    var look = this.a.radius + 26;
    var base = Math.atan2(dy, dx);
    var chosen = null;
    var offsets = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];
    for (var i = 0; i < offsets.length; i++) {
      var a = base + offsets[i];
      var tx = this.a.x + Math.cos(a) * look;
      var ty = this.a.y + Math.sin(a) * look;
      if (!this.game.map.circleBlocked(tx, ty, this.a.radius)) { chosen = a; break; }
    }
    if (chosen == null) chosen = base;
    var mvx = Math.cos(chosen), mvy = Math.sin(chosen);
    this.a._sprintingThisFrame = this.a.tryMove(mvx, mvy, dt, sprint);
  };

  AI.prototype.update = function (dt) {
    var a = this.a;
    if (!a.alive) return;
    if (a.using) return; // 使用道具中不动

    this.acquire();

    // 低血且脱战：治疗
    if (!this.target && a.health < 45 && this.game.time > this.lostAt + 1.5) {
      if (this.tryHeal()) return;
    }

    // 换弹：无弹或（脱战且弹量低）
    var w = a.currentWeapon();
    if (w && w.def.category !== 'melee') {
      if (w.ammo <= 0) this.a.reload();
      else if (!this.target && w.ammo < w.def.mag * 0.4) this.a.reload();
    }

    // 进攻方：占据站点且无近身威胁时优先破译（一边警戒一边破译）
    if (a.team === 'attacker' && this.game.objective.inRange(a) && !this.game.objective.done) {
      var closeThreat = this.target && V.dist(a, this.target) < 260;
      if (!closeThreat) {
        this.game.objective.tick(dt, a, this.game);
        if (this.target) this.faceToward(this.target.x, this.target.y, dt, this.cfg.aimError);
        return;
      }
    }

    if (this.target) {
      this.combat(dt);
    } else {
      this.navigate(dt);
    }
  };

  AI.prototype.tryHeal = function () {
    for (var i = 0; i < this.a.items.length; i++) {
      var it = this.a.items[i];
      if (it.charges > 0 && (it.def.id === 'medbox' || it.def.id === 'dek' || it.def.id === 'cat')) {
        this.a.useItem(it.def.id);
        return true;
      }
    }
    return false;
  };

  AI.prototype.combat = function (dt) {
    var a = this.a, t = this.target;
    var d = V.dist(a, t);
    var pref = this.preferredRange();

    this.faceToward(t.x, t.y, dt, this.cfg.aimError + (a.moving ? 0.06 : 0));

    // 走位：保持偏好距离 + 侧移
    if (this.game.time > this.strafeUntil) {
      this.strafeDir = this.game.rng.sign();
      this.strafeUntil = this.game.time + this.game.rng.range(0.6, 1.4);
    }
    var toT = Math.atan2(t.y - a.y, t.x - a.x);
    var move = { x: 0, y: 0 };
    if (d > pref * 1.15) { move.x += Math.cos(toT); move.y += Math.sin(toT); }
    else if (d < pref * 0.7) { move.x -= Math.cos(toT); move.y -= Math.sin(toT); }
    // 侧移
    var perp = toT + Math.PI / 2 * this.strafeDir;
    move.x += Math.cos(perp) * 0.7; move.y += Math.sin(perp) * 0.7;

    var mlen = Math.hypot(move.x, move.y);
    if (mlen > 0.01) {
      var mvx = move.x / mlen, mvy = move.y / mlen;
      // 避障
      var look = a.radius + 22;
      if (this.game.map.circleBlocked(a.x + mvx * look, a.y + mvy * look, a.radius)) {
        var alt = Math.atan2(mvy, mvx) + this.strafeDir * 0.8;
        mvx = Math.cos(alt); mvy = Math.sin(alt);
      }
      a._sprintingThisFrame = a.tryMove(mvx, mvy, dt, false);
    }

    // 开火条件：反应时间已过 + 大致对准 + 有视线
    var aligned = Math.abs(V.wrapAngle(toT - a.angle)) < 0.14;
    var reacted = this.game.time > this.acquiredAt + this.cfg.reactionTime;
    if (aligned && reacted && this.canSee(t)) {
      a.tryShoot(a.angle);
    }
  };

  AI.prototype.navigate = function (dt) {
    var a = this.a;
    var goal = this.pickGoal();
    // 防守方到位后：巡逻/警戒最近失联点
    var target = this.lastKnown && this.game.time < this.lostAt + 4 ? this.lastKnown : goal;
    var d = V.dist(a, target);

    if (d > 40) {
      this.moveToward(target.x, target.y, dt, a.team === 'attacker' && d > 200);
      this.faceMove(target.x - a.x, target.y - a.y, dt);
    } else {
      // 到达目标区域
      if (a.team === 'attacker') {
        // 进攻方：尝试破译（若在站点范围且无敌人可见）
        if (this.game.objective.inRange(a)) {
          this.game.objective.tick(dt, a, this.game);
        } else {
          this.wander(dt);
        }
      } else {
        // 防守方：警戒站点方向，缓慢巡逻
        this.wander(dt);
        this.faceToward(this.game.map.site.x, this.game.map.site.y, dt, 0.3);
      }
    }
  };

  AI.prototype.pickGoal = function () {
    var site = this.game.map.site;
    if (this.a.team === 'attacker') {
      // 稍微散开逼近站点
      if (!this.goal) this.goal = { x: site.x + this.game.rng.range(-70, 70), y: site.y + this.game.rng.range(20, 90) };
      return this.goal;
    } else {
      if (!this.goal) this.goal = { x: site.x + this.game.rng.range(-120, 120), y: site.y + this.game.rng.range(-60, 90) };
      return this.goal;
    }
  };

  AI.prototype.wander = function (dt) {
    if (this.game.time > this.repositionUntil) {
      this.repositionUntil = this.game.time + this.game.rng.range(1.5, 3.5);
      var site = this.game.map.site;
      this._wp = { x: site.x + this.game.rng.range(-140, 140), y: site.y + this.game.rng.range(-90, 110) };
    }
    if (this._wp) this.moveToward(this._wp.x, this._wp.y, dt, false);
  };

  DF.AI = AI;
})(window.DF = window.DF || {});
