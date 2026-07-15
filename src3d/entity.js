/* 战斗单位 Fighter —— 玩家与 AI 共用
 * 封装：卡通人物、生命/护甲、武器/弹药、移动碰撞、命中射线、伤害结算(复用 DF.combat)
 */
(function (D3) {
  'use strict';

  var TEAM_COLORS = { alpha: 0x39C0FF, bravo: 0xFF5A5A, charlie: 0xFFC83D };
  var TEAM_NAMES  = { alpha: 'ALPHA', bravo: 'BRAVO', charlie: 'CHARLIE' };

  function Fighter(team, isPlayer) {
    this.team = team;
    this.teamColor = TEAM_COLORS[team];
    this.isPlayer = !!isPlayer;
    this.name = TEAM_NAMES[team];

    this.char = D3.buildCharacter(this.teamColor, {});
    this.char.headHitbox.userData = { fighter: this, part: 'head' };
    this.char.bodyHitbox.userData = { fighter: this, part: 'body' };

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.42;

    this.maxHealth = 100; this.health = 100;
    this.vestDur = 0; this.helmetDur = 0;
    this.alive = false;
    this.kills = 0; this.deaths = 0;

    this.weapon = DF.WEAPONS.qbz95;
    this.ammo = 0; this.reserve = 0;
    this.reloading = false; this.reloadTimer = 0;
    this.fireTimer = 0;
    this.nades = { frag: 2, smoke: 1, flash: 1 }; this.nadeCooldown = 0;

    this._moveSpeed = 0;
    this._tmpDir = new THREE.Vector3();
    // AI 字段（ai.js 使用）
    this.ai = null;
    // 头顶姓名血条（仅浏览器；桩环境跳过）
    this.plate = null; this._lastPlateHp = -1;
  }

  Fighter.prototype._hex = function () { return '#' + this.teamColor.toString(16).padStart(6, '0'); };

  // 创建头顶名牌+血条（Sprite 始终朝向镜头）
  Fighter.prototype._makePlate = function () {
    if (this.plate || this.isPlayer) return;
    if (typeof THREE.CanvasTexture !== 'function' || typeof THREE.Sprite !== 'function') return;
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 72;
    var ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    this._plateCv = cv; this._plateCtx = ctx;
    var tex = new THREE.CanvasTexture(cv);
    if (tex.minFilter !== undefined) tex.minFilter = THREE.LinearFilter;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    var sp = new THREE.Sprite(mat); sp.scale.set(1.6, 0.45, 1); sp.position.set(0, 2.4, 0);
    sp.renderOrder = 999;
    this.plate = sp; this._plateTex = tex;
    this.char.root.add(sp);
  };

  Fighter.prototype._drawPlate = function () {
    if (!this.plate) return;
    var ctx = this._plateCtx, W = 256, H = 72;
    ctx.clearRect(0, 0, W, H);
    // 姓名
    ctx.font = 'bold 26px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(this.name, W/2, 20);
    ctx.fillStyle = this._hex(); ctx.fillText(this.name, W/2, 20);
    // 血条底
    var bx = 38, by = 44, bw = 180, bh = 14, r = 6;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; roundRect(ctx, bx-3, by-3, bw+6, bh+6, r+2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, bx, by, bw, bh, r); ctx.fill();
    // 血条填充
    var pct = Math.max(0, this.health / this.maxHealth);
    var col = pct > 0.5 ? '#4be08a' : (pct > 0.25 ? '#ffc83d' : '#ff5a5a');
    ctx.fillStyle = col; roundRect(ctx, bx, by, Math.max(2, bw * pct), bh, r); ctx.fill();
    if (this._plateTex) this._plateTex.needsUpdate = true;
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  }

  Fighter.prototype._updatePlate = function () {
    if (!this.plate) return;
    this.plate.visible = this.alive;
    if (this.alive && this.health !== this._lastPlateHp) { this._drawPlate(); this._lastPlateHp = this.health; }
  };

  Fighter.prototype.addToScene = function (scene) { scene.add(this.char.root); };

  Fighter.prototype.equip = function (loadout) {
    var wid = loadout.primary || loadout.secondary || 'qbz95';
    this.weapon = DF.WEAPONS[wid] || DF.WEAPONS.qbz95;
    this.ammo = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    // 护甲耐久
    this.vestDur = loadout.vest ? DF.getVest(loadout.vest).durability : 0;
    this.helmetDur = loadout.helmet ? DF.getHelmet(loadout.helmet).durability : 0;
    this.reloading = false; this.reloadTimer = 0; this.fireTimer = 0;
    this.nades = { frag: 2, smoke: 1, flash: 1 }; this.nadeCooldown = 0;
  };

  // 投掷手雷（type: frag|smoke|flash；dirOverride 可传相机瞄准方向）
  Fighter.prototype.throwGrenade = function (world, dirOverride, type) {
    type = type || 'frag';
    if (!this.alive || !this.nades[type] || this.nades[type] <= 0 || this.nadeCooldown > 0) return false;
    this.nades[type]--; this.nadeCooldown = 0.9;
    var origin = new THREE.Vector3(this.pos.x, 1.6, this.pos.z);
    var dir = dirOverride ? dirOverride.clone() : new THREE.Vector3(Math.sin(this.yaw), 0.15, Math.cos(this.yaw));
    dir.y = Math.max(0.08, dir.y);
    if (world.spawnGrenade) world.spawnGrenade(this, origin, dir, type);
    return true;
  };

  Fighter.prototype.spawn = function (pos, loadout) {
    this.pos.copy(pos); this.pos.y = pos.y || 0; // 尊重出生高度(可在楼上出生)
    this.health = this.maxHealth; this.alive = true;
    this.inVehicle = null; // 重生/换回合清除载具占用，避免残留“幽灵坦克”状态
    this.equip(loadout);
    this.char.setDead(false);
    this.char.root.position.copy(this.pos);
    this.char.setColor(this.teamColor);
    this._makePlate(); this._lastPlateHp = -1; this._updatePlate();
  };

  Fighter.prototype.die = function (world, killer) {
    if (!this.alive) return;
    this.alive = false; this.deaths++;
    this.char.startDeath();
    if (this.plate) this.plate.visible = false;
    world.effects.kill(this._headPos(), this.teamColor);
    if (this.isPlayer) world.audio && world.audio.death && world.audio.death();
    if (world.onKill) world.onKill(killer, this);
  };

  Fighter.prototype._headPos = function () { var v = new THREE.Vector3(); this.char.headHitbox.getWorldPosition(v); return v; };

  // 移动并解算碰撞（圆 vs AABB + 场地半径 + 单位互推）
  Fighter.prototype.moveBy = function (dx, dz, world, dt) {
    var nx = this.pos.x + dx, nz = this.pos.z + dz;
    var r = this.radius;
    // AABB 掩体（考虑高度分层：脚在掩体上方/下方时可通过）
    var footY = this.pos.y || 0, headY = footY + 1.7;
    var cols = world.colliders;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ) {
        var cb = c.yBase || 0, ctop = cb + c.h;
        if (headY <= cb + 0.02 || footY >= ctop - 0.02) continue; // 垂直不重叠 → 可从上/下方穿过
        // 推出最近的一边
        var penL = (nx + r) - c.minX, penR = c.maxX - (nx - r);
        var penT = (nz + r) - c.minZ, penB = c.maxZ - (nz - r);
        var minPen = Math.min(penL, penR, penT, penB);
        if (minPen === penL) nx = c.minX - r;
        else if (minPen === penR) nx = c.maxX + r;
        else if (minPen === penT) nz = c.minZ - r;
        else nz = c.maxZ + r;
      }
    }
    // 场地边界（圆形）
    var maxR = world.radius - 0.5;
    var d = Math.hypot(nx, nz);
    if (d > maxR) { nx = nx / d * maxR; nz = nz / d * maxR; }
    // 单位互推（软）
    for (var j = 0; j < world.fighters.length; j++) {
      var o = world.fighters[j];
      if (o === this || !o.alive) continue;
      var ox = nx - o.pos.x, oz = nz - o.pos.z, od = Math.hypot(ox, oz), min = r + o.radius;
      if (od > 0 && od < min) { var push = (min - od); nx += ox / od * push * 0.5; nz += oz / od * push * 0.5; }
    }
    var moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.x = nx; this.pos.z = nz;
    return moved;
  };

  // 是否可以开火（冷却+弹药+换弹）
  Fighter.prototype.canFire = function () { return this.alive && !this.reloading && this.ammo > 0 && this.fireTimer <= 0; };

  // 开火：从 origin 沿 dir 做命中射线；spreadScale 缩放散布(ADS 传 0 = 打哪准哪)
  Fighter.prototype.fire = function (origin, dir, world, spreadScale) {
    if (!this.canFire()) { if (this.ammo <= 0 && !this.reloading) this.startReload(); return null; }
    var w = this.weapon;
    if (spreadScale == null) spreadScale = 1;
    this.ammo--; this.fireTimer = 60 / w.rpm;
    this.char.flashMuzzle();
    if (world.audio) world.audio.shot(w.category);

    var pellets = w.pellets || 1;
    var sp = w.spread * spreadScale;
    var muzzle = this.char.getMuzzle(new THREE.Vector3());
    if (world.onShotFired) world.onShotFired(this, muzzle);
    if (world.effects.casing) world.effects.casing(muzzle, Math.cos(this.yaw), -Math.sin(this.yaw));
    var hitResult = null;
    for (var p = 0; p < pellets; p++) {
      var d = dir.clone();
      if (pellets > 1 || sp > 0) {
        d.x += (Math.random()*2-1) * sp; d.y += (Math.random()*2-1) * sp * 0.5; d.z += (Math.random()*2-1) * sp;
        d.normalize();
      }
      var res = this._raycastShot(origin, d, world, muzzle);
      if (res && res.killed) hitResult = res;
      else if (res && !hitResult) hitResult = res;
    }
    return hitResult;
  };

  Fighter.prototype._raycastShot = function (origin, dir, world, muzzle) {
    var ray = world.raycaster;
    ray.set(origin, dir);
    ray.far = (this.weapon.range || 600) / 20 + 40;
    // 组装候选：solids + 敌方 hitbox
    var list = world._solidList || (world._solidList = []);
    list.length = 0;
    for (var i = 0; i < world.solids.length; i++) list.push(world.solids[i]);
    for (var j = 0; j < world.fighters.length; j++) {
      var f = world.fighters[j];
      if (!f.alive || f.team === this.team || f.inVehicle) continue; // 载具内的干员不可被直接命中
      list.push(f.char.headHitbox); list.push(f.char.bodyHitbox);
    }
    if (world.vehicles) {
      for (var vh = 0; vh < world.vehicles.length; vh++) {
        var vc = world.vehicles[vh];
        if (!vc.alive || !vc.hitbox || !vc.occupant || vc.occupant.team === this.team) continue; // 仅打敌方乘员的坦克
        list.push(vc.hitbox);
      }
    }
    if (world.monsters) {
      for (var mo = 0; mo < world.monsters.length; mo++) {
        var mm = world.monsters[mo];
        if (!mm.alive || mm.team === this.team) continue;
        list.push(mm.headHitbox); list.push(mm.bodyHitbox);
      }
    }
    if (world.beds) {
      for (var bi = 0; bi < world.beds.length; bi++) {
        var bd = world.beds[bi];
        if (!bd.alive || bd.team === this.team) continue;
        list.push(bd.hitbox);
      }
    }
    var hits = ray.intersectObjects(list, false);
    if (!hits.length) {
      // 空枪：曳光射向远处
      var end = origin.clone().addScaledVector(dir, 60);
      world.effects.tracer(muzzle, end, this._tracerColor());
      return null;
    }
    var h = hits[0];
    world.effects.tracer(muzzle, h.point, this._tracerColor());
    var ud = h.object.userData;
    if (ud && ud.fighter) {
      var victim = ud.fighter;
      var headshot = ud.part === 'head';
      world.effects.blood(h.point);
      world.effects.decal(h.point, dir, 'blood');
      return this._applyDamage(victim, headshot, h.distance * 20, world, h.point);
    } else if (ud && ud.bed) {
      world.effects.impact(h.point, ud.bed.teamColor || 0xffd54a);
      if (world.effects.burst) world.effects.burst(h.point, ud.bed.teamColor || 0xffd54a);
      return this._applyDamage(ud.bed, false, h.distance * 20, world, h.point);
    } else if (ud && ud.tank) {
      // 装甲：小口径杀伤大幅衰减，狙击稍好，爆炸物最有效
      var tk = ud.tank;
      world.effects.impact(h.point, 0xffd54a);
      if (world.effects.burst) world.effects.burst(h.point, 0xffcc66);
      var armorF = this.weapon.category === 'sniper' ? 0.62 : (this.weapon.category === 'lmg' ? 0.5 : 0.4);
      var dmg = this.weapon.damage * armorF;
      tk.health -= dmg; tk.hitFlash = 0.1; if (tk._updatePlate) tk._updatePlate();
      if (world.audio && world.audio.hit) world.audio.hit();
      var killed = false;
      if (tk.health <= 0 && tk.alive) { this.kills++; tk.die(world, this); killed = true; }
      return { killed: killed, headshot: false, dealt: dmg, victim: tk, point: h.point };
    } else {
      world.effects.impact(h.point, 0xFFE08A);
      world.effects.decal(h.point, dir, 'bullet');
      return null;
    }
  };

  Fighter.prototype._tracerColor = function () { return this.isPlayer ? 0xBFefff : (this.team==='bravo'?0xffb0b0:(this.team==='charlie'?0xffe6a0:0xffffff)); };

  Fighter.prototype._applyDamage = function (victim, headshot, distPx, world, hitPoint) {
    var res = DF.combat.resolveDamage({
      baseDamage: this.weapon.damage, headshot: headshot,
      distance: distPx, range: this.weapon.range,
      health: victim.health, vestDur: victim.vestDur, helmetDur: victim.helmetDur,
      cfg: DF.CONFIG.combat, category: this.weapon.category
    });
    victim.health = res.health; victim.vestDur = res.vestDur; victim.helmetDur = res.helmetDur;
    victim._updatePlate();
    if (world.audio) { if (res.killed) {} else if (headshot) world.audio.headshot(); else world.audio.hit(); }
    if (victim.isPlayer && world.onPlayerHurt) world.onPlayerHurt(res.dealt, headshot, this.pos);
    if (res.killed) { this.kills++; victim.die(world, this); }
    return { killed: res.killed, headshot: headshot, dealt: res.dealt, victim: victim, point: hitPoint };
  };

  Fighter.prototype.startReload = function () {
    if (this.reloading || this.ammo >= this.weapon.mag || this.reserve <= 0) return;
    this.reloading = true; this.reloadTimer = this.weapon.reload;
  };

  Fighter.prototype._finishReload = function () {
    var need = this.weapon.mag - this.ammo;
    var take = Math.min(need, this.reserve);
    this.ammo += take; this.reserve -= take; this.reloading = false;
  };

  Fighter.prototype.update = function (dt, world) {
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.nadeCooldown > 0) this.nadeCooldown -= dt;
    // 空仓自动换弹
    if (this.alive && !this.reloading && this.ammo <= 0 && this.reserve > 0) this.startReload();
    if (this.reloading) { this.reloadTimer -= dt; if (this.reloadTimer <= 0) this._finishReload(); }
    // AI 跟随楼层高度：可走楼梯上下楼、站上层楼板，避免贴地穿模（玩家由 Player 控制器管理，跳跃不受此影响）
    if (!this.isPlayer && this.alive && !this.inVehicle && world && world.supportHeight) {
      var sup = world.supportHeight(this.pos.x, this.pos.z, this.pos.y + 0.7);
      // 大落差(走出楼板边缘/楼梯口)平滑下坠，小台阶直接贴合
      if (sup < this.pos.y - 0.1) this.pos.y = Math.max(sup, this.pos.y - 14 * dt);
      else this.pos.y = sup;
    }
    // 同步网格（叠加跳跃升高 / 卧倒压低 / 乘车升高）
    this.char.root.position.set(this.pos.x, this.pos.y + (this.airY || 0) + (this.stanceY || 0), this.pos.z);
    this.char.root.rotation.y = this.yaw;
    this.char.update(dt, this._moveSpeed, true);
    this._updatePlate();
    this._moveSpeed *= 0.6; // 衰减，move 时重设
  };

  Fighter.TEAM_COLORS = TEAM_COLORS;
  Fighter.TEAM_NAMES = TEAM_NAMES;
  D3.Fighter = Fighter;
})(window.D3 = window.D3 || {});
