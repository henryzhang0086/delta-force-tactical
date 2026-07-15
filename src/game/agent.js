/* 干员实体 —— 玩家与 AI 共用。承载血量/护甲/武器/道具/移动/射击/近战 */
(function (DF) {
  'use strict';

  var V = DF.V;

  function Agent(game, opts) {
    this.game = game;
    this.cfg = DF.CONFIG.agent;
    this.team = opts.team;                 // 'attacker' | 'defender'
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || '干员';
    this.color = opts.color || (this.team === 'attacker' ? '#4fc3f7' : '#ff7043');

    this.radius = this.cfg.radius;
    this.maxHealth = this.cfg.maxHealth;
    this.maxStamina = this.cfg.maxStamina;

    this.x = 0; this.y = 0; this.angle = 0;

    this.weapons = { primary: null, secondary: null, melee: null };
    this.slot = 'primary';
    this.items = [];

    this.kills = 0; this.deaths = 0;
    this.ai = null;

    this.resetState();
  }

  Agent.prototype.resetState = function () {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.alive = true;
    this.bleeding = 0;
    this.fireCd = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.using = null;         // 正在使用的道具
    this.useEnd = 0;
    this.painkillerUntil = 0;
    this.adrenalineUntil = 0;
    this.lastShotTime = -99;
    this.moving = false;
    this.hitFlash = 0;
  };

  // 装备战备套装
  Agent.prototype.equipLoadout = function (loadout) {
    var self = this;
    function mkWeapon(id) {
      if (!id) return null;
      var def = DF.getWeapon(id);
      if (!def) return null;
      return { def: def, ammo: def.mag, reserve: def.reserve };
    }
    this.weapons.primary = mkWeapon(loadout.primary);
    this.weapons.secondary = mkWeapon(loadout.secondary);
    this.weapons.melee = mkWeapon('knife');

    // 护甲
    var helmet = DF.getHelmet(loadout.helmet);
    var vest = DF.getVest(loadout.vest);
    this.helmetId = helmet.id; this.helmetMax = helmet.durability; this.helmetDur = helmet.durability;
    this.vestId = vest.id; this.vestMax = vest.durability; this.vestDur = vest.durability;
    this.weight = helmet.weight + vest.weight;

    // 道具
    this.items = (loadout.items || []).map(function (id) {
      var d = DF.getItem(id);
      return d ? { def: d, charges: d.charges } : null;
    }).filter(Boolean);

    // 默认武器槽
    this.slot = this.weapons.primary ? 'primary' : (this.weapons.secondary ? 'secondary' : 'melee');
    this.loadout = loadout;
  };

  Agent.prototype.currentWeapon = function () { return this.weapons[this.slot]; };

  Agent.prototype.speed = function () {
    var base = this.cfg.walkSpeed * (1 - this.weight * 0.5);
    if (this.game.time < this.adrenalineUntil) base *= 1.15;
    return base;
  };
  Agent.prototype.sprintSpeed = function () {
    return this.cfg.sprintSpeed * (1 - this.weight * 0.5) * (this.game.time < this.adrenalineUntil ? 1.15 : 1);
  };

  // 尝试移动（分轴碰撞）
  Agent.prototype.tryMove = function (dx, dy, dt, sprint) {
    var spd = (sprint && this.stamina > 0) ? this.sprintSpeed() : this.speed();
    var len = Math.hypot(dx, dy);
    this.moving = len > 0.01;
    if (!this.moving) return false;
    dx /= len; dy /= len;
    var nx = this.x + dx * spd * dt;
    var ny = this.y + dy * spd * dt;
    var map = this.game.map;
    if (!map.circleBlocked(nx, this.y, this.radius)) this.x = nx;
    if (!map.circleBlocked(this.x, ny, this.radius)) this.y = ny;
    return sprint && this.stamina > 0;
  };

  Agent.prototype.switchSlot = function (slot) {
    if (!this.weapons[slot]) return;
    if (this.slot === slot) return;
    this.slot = slot;
    this.reloading = false;
  };

  // 开火（返回是否成功射击）
  Agent.prototype.tryShoot = function (aimAngle) {
    if (!this.alive || this.reloading || this.using) return false;
    var w = this.currentWeapon();
    if (!w) return false;
    if (this.game.time < this.fireCd) return false;

    var def = w.def;
    if (def.category === 'melee') { return this.meleeAttack(aimAngle); }

    if (w.ammo <= 0) {
      // 空仓自动换弹
      this.reload();
      return false;
    }

    this.fireCd = this.game.time + 60 / def.rpm;
    w.ammo--;
    this.lastShotTime = this.game.time;

    var pellets = def.pellets || 1;
    var spread = this.effectiveSpread(def);
    for (var i = 0; i < pellets; i++) {
      var a = aimAngle + (Math.random() - 0.5) * spread * 2;
      var dir = V.fromAngle(a);
      var muzzle = { x: this.x + dir.x * (this.radius + 6), y: this.y + dir.y * (this.radius + 6) };
      this.game.spawnBullet({
        x: muzzle.x, y: muzzle.y, dir: dir, speed: def.velocity,
        owner: this, team: this.team, weapon: def,
        range: def.range, aimQuality: this.aimQuality(spread)
      });
    }
    this.game.particles.muzzle(this.x + Math.cos(aimAngle) * (this.radius + 6), this.y + Math.sin(aimAngle) * (this.radius + 6), aimAngle);
    if (this.game.audio) this.game.audio.shot(def.category);
    return true;
  };

  Agent.prototype.effectiveSpread = function (def) {
    var s = def.spread;
    if (this.moving) s *= 1.9;
    if (this.game.time < this.painkillerUntil) s *= 0.6;
    // 连续射击轻微增散
    return s;
  };
  Agent.prototype.aimQuality = function (spread) {
    return V.clamp(1 - spread * 6, 0.1, 0.95);
  };

  Agent.prototype.meleeAttack = function (aimAngle) {
    var def = this.weapons.melee.def;
    if (this.game.time < this.fireCd) return false;
    this.fireCd = this.game.time + 60 / def.rpm;
    if (this.game.audio) this.game.audio.knife();
    // 找前方范围内敌人
    var reach = def.range + this.radius;
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.game.agents.length; i++) {
      var t = this.game.agents[i];
      if (!t.alive || t.team === this.team) continue;
      var d = V.dist(this, t);
      if (d > reach + t.radius) continue;
      var toT = Math.atan2(t.y - this.y, t.x - this.x);
      if (Math.abs(V.wrapAngle(toT - aimAngle)) > 0.9) continue;
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) return true;
    // 背刺判定：攻击者位于目标背后（目标朝向与 攻击者->目标 方向一致）
    var toVictim = { x: best.x - this.x, y: best.y - this.y };
    var victimFace = V.fromAngle(best.angle);
    var backstab = V.dot(V.norm(toVictim), victimFace) > 0.3;
    var dmg = backstab ? DF.CONFIG.combat.meleeBackstab : DF.CONFIG.combat.meleeFront;
    this.game.applyMelee(this, best, dmg, backstab);
    return true;
  };

  Agent.prototype.reload = function () {
    if (this.reloading || this.using) return;
    var w = this.currentWeapon();
    if (!w || w.def.category === 'melee') return;
    if (w.ammo >= w.def.mag || w.reserve <= 0) return;
    this.reloading = true;
    this.reloadEnd = this.game.time + w.def.reload;
    if (this.game.audio) this.game.audio.reload();
  };

  Agent.prototype.useItem = function (idOrKey) {
    if (this.using || this.reloading || !this.alive) return;
    var slot = null;
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.charges <= 0) continue;
      if (it.def.id === idOrKey || it.def.key === idOrKey) { slot = it; break; }
    }
    if (!slot) return;
    this.using = slot;
    this.useEnd = this.game.time + slot.def.useTime;
  };

  Agent.prototype.heal = function (amt) {
    this.health = Math.min(this.maxHealth, this.health + amt);
  };

  // 应用一次伤害结算结果（由 game 调用）
  Agent.prototype.applyDamageResult = function (res, attacker) {
    this.health = res.health;
    this.vestDur = res.vestDur;
    this.helmetDur = res.helmetDur;
    this.hitFlash = 0.12;
    if (res.bledTrigger && this.game.rng.chance(this.cfg.bleedChance)) {
      this.bleeding = 1;
    }
    if (!res.killed && this.game.audio && this.isPlayer) this.game.audio.hurt();
    if (res.killed) this.die(attacker);
  };

  Agent.prototype.die = function (attacker) {
    if (!this.alive) return;
    this.alive = false;
    this.deaths++;
    this.game.particles.blood(this.x, this.y, this.angle);
    if (this.game.audio) this.game.audio.death();
    this.game.onAgentDeath(this, attacker);
  };

  Agent.prototype.update = function (dt) {
    if (!this.alive) return;

    // 换弹完成
    if (this.reloading && this.game.time >= this.reloadEnd) {
      var w = this.currentWeapon();
      if (w.def.reloadPerShell) {
        var add = Math.min(1, w.reserve);
        w.ammo += add; w.reserve -= add;
        if (w.ammo < w.def.mag && w.reserve > 0) this.reloadEnd = this.game.time + w.def.reload;
        else this.reloading = false;
      } else {
        var need = w.def.mag - w.ammo;
        var take = Math.min(need, w.reserve);
        w.ammo += take; w.reserve -= take;
        this.reloading = false;
      }
    }

    // 道具使用完成
    if (this.using && this.game.time >= this.useEnd) {
      this.using.def.apply(this);
      this.using.charges--;
      if (this.game.audio) this.game.audio.buy();
      this.using = null;
    }

    // 流血
    if (this.bleeding > 0) {
      this.health -= this.cfg.bleedDps * dt;
      if (this.health <= 0) { this.health = 0; this.die(null); return; }
    }

    // 体力回复（非冲刺时）
    if (!this._sprintingThisFrame) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.cfg.staminaRegen * dt);
    }
    this._sprintingThisFrame = false;

    if (this.hitFlash > 0) this.hitFlash -= dt;
  };

  Agent.prototype.render = function (ctx, isLocalPlayer) {
    if (!this.alive) {
      // 尸体
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    var r = this.radius;
    // 朝向枪线
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(this.angle) * (r + 12), this.y + Math.sin(this.angle) * (r + 12));
    ctx.stroke();

    // 身体
    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill();

    // 队伍描边 / 本地玩家高亮
    ctx.lineWidth = isLocalPlayer ? 3 : 2;
    ctx.strokeStyle = isLocalPlayer ? '#fff' : (this.team === 'attacker' ? '#1565c0' : '#b71c1c');
    ctx.stroke();

    // 头盔环（表示有盔）
    if (this.helmetDur > 0) {
      ctx.strokeStyle = 'rgba(180,220,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, r - 4, 0, Math.PI * 2); ctx.stroke();
    }

    // 血条（头顶，AI/队友）
    if (!isLocalPlayer) {
      var bw = 28, bh = 4, bx = this.x - bw / 2, by = this.y - r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = this.team === 'attacker' ? '#4caf50' : '#e53935';
      ctx.fillRect(bx, by, bw * (this.health / this.maxHealth), bh);
    }

    // 状态图标：流血 / 使用道具 / 破译
    if (this.bleeding > 0) {
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.arc(this.x + r, this.y - r, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (this.using) {
      ctx.fillStyle = '#66bb6a';
      ctx.fillRect(this.x - 10, this.y - r - 20, 20 * ((this.useEnd - this.game.time) / this.using.def.useTime <= 1 ? 1 - (this.useEnd - this.game.time) / this.using.def.useTime : 0), 3);
    }
  };

  DF.Agent = Agent;
})(window.DF = window.DF || {});
