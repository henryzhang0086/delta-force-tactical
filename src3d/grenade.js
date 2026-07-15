/* 手雷系统 —— 抛物线飞行 + 落地反弹 + 定时爆炸 + 范围伤害(带 LOS 衰减)
 * 由 game 提供 world.spawnGrenade(owner, origin, dir) 调用创建。
 */
(function (D3) {
  'use strict';

  var GRAV = 16;
  var FUSE = 1.5;
  var RADIUS = 6.5;
  var MAX_DMG = 110;
  var THROW_SPEED = 17;

  var BODY = { frag: 0x3c5a2e, smoke: 0x54606e, flash: 0xd8d2a0 };
  var STRIPE = { frag: 0xffcc33, smoke: 0xbfd0dc, flash: 0xff5a5a };

  function Grenade(owner, origin, dir, world, type) {
    this.owner = owner;
    this.world = world;
    this.type = type || 'frag';
    this.pos = origin.clone();
    this.vel = dir.clone().normalize().multiplyScalar(THROW_SPEED);
    this.vel.y += 5.5; // 上抛弧线
    this.fuse = this.type === 'smoke' ? 1.2 : FUSE;
    this.dead = false;
    // 网格
    var T = D3.toon;
    this.mesh = T.mesh(new THREE.SphereGeometry(0.18, 10, 10), BODY[this.type] || BODY.frag, { outline: 0.02 });
    this.mesh.position.copy(this.pos);
    var stripe = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 12), T.glow(STRIPE[this.type] || STRIPE.frag));
    stripe.rotation.x = Math.PI / 2; this.mesh.add(stripe);
    world.scene.add(this.mesh);
    this._spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
  }

  Grenade.prototype.update = function (dt) {
    if (this.dead) return;
    this.fuse -= dt;
    this.vel.y -= GRAV * dt;
    var np = this.pos.clone().addScaledVector(this.vel, dt);

    // 地面反弹
    if (np.y < 0.18) { np.y = 0.18; this.vel.y = -this.vel.y * 0.45; this.vel.x *= 0.7; this.vel.z *= 0.7; }
    // 场地边界
    var maxR = this.world.radius - 0.4, d = Math.hypot(np.x, np.z);
    if (d > maxR) { var nx = np.x / d, nz = np.z / d; np.x = nx * maxR; np.z = nz * maxR; this.vel.x = -this.vel.x * 0.4; this.vel.z = -this.vel.z * 0.4; }
    // 掩体反弹（AABB 近似）
    var cols = this.world.colliders;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (np.x > c.minX && np.x < c.maxX && np.z > c.minZ && np.z < c.maxZ && np.y < c.h) {
        var penL = np.x - c.minX, penR = c.maxX - np.x, penT = np.z - c.minZ, penB = c.maxZ - np.z;
        var m = Math.min(penL, penR, penT, penB);
        if (m === penL) { np.x = c.minX; this.vel.x = -Math.abs(this.vel.x) * 0.4; }
        else if (m === penR) { np.x = c.maxX; this.vel.x = Math.abs(this.vel.x) * 0.4; }
        else if (m === penT) { np.z = c.minZ; this.vel.z = -Math.abs(this.vel.z) * 0.4; }
        else { np.z = c.maxZ; this.vel.z = Math.abs(this.vel.z) * 0.4; }
      }
    }
    this.pos.copy(np);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this._spin.x * dt; this.mesh.rotation.z += this._spin.z * dt;

    if (this.fuse <= 0) this.explode();
  };

  Grenade.prototype.explode = function () {
    if (this.dead) return;
    this.dead = true;
    var w = this.world, p = this.pos;
    w.scene.remove(this.mesh);

    if (this.type === 'smoke') {
      if (w.spawnSmoke) w.spawnSmoke(p);
      if (w.audio && w.audio.whoosh) w.audio.whoosh();
      return;
    }
    if (this.type === 'flash') {
      w.effects.explosion ? w.effects.explosion(p) : w.effects.kill(p, 0xffffff);
      if (w.audio && w.audio.explosion) w.audio.explosion();
      if (w.onFlash) w.onFlash(p, this.owner);
      return;
    }
    // frag：视觉大爆炸 + 范围伤害
    w.effects.explosion ? w.effects.explosion(p) : w.effects.kill(p, 0xffaa33);
    if (w.audio && w.audio.explosion) w.audio.explosion();
    var targets = w.fighters.concat(w.monsters || []);
    for (var i = 0; i < targets.length; i++) {
      var f = targets[i]; if (!f.alive) continue;
      var dist = f.pos.distanceTo(p);
      if (dist > RADIUS) continue;
      var blocked = _blocked(p, f.pos, w);      // 被掩体挡住伤害减半
      var falloff = 1 - dist / RADIUS;
      var dmg = MAX_DMG * falloff * (blocked ? 0.4 : 1);
      _damage(f, dmg, this.owner, w);
    }
    if (w.playerFighter && w.playerFighter.pos.distanceTo(p) < RADIUS * 1.6 && w.onExplosionShake) {
      w.onExplosionShake(Math.max(0.1, 0.4 * (1 - w.playerFighter.pos.distanceTo(p) / (RADIUS * 1.6))));
    }
  };

  function _blocked(a, b, world) {
    var dir = new THREE.Vector3().subVectors(b, a); var dist = dir.length(); dir.normalize();
    var eye = new THREE.Vector3(a.x, 1, a.z);
    world.raycaster.set(eye, dir); world.raycaster.far = dist - 0.5;
    return world.raycaster.intersectObjects(world.solids, false).length > 0;
  }

  function _damage(victim, dmg, owner, world) {
    var res = DF.combat.resolveDamage({
      baseDamage: dmg, headshot: false, distance: 0, range: 999,
      health: victim.health, vestDur: victim.vestDur, helmetDur: victim.helmetDur,
      cfg: DF.CONFIG.combat, category: 'ar'
    });
    victim.health = res.health; victim.vestDur = res.vestDur; victim.helmetDur = res.helmetDur;
    victim._updatePlate();
    if (victim.isPlayer && world.onPlayerHurt) world.onPlayerHurt(res.dealt, false, owner ? owner.pos : null);
    if (res.killed && victim.alive) { if (owner && owner !== victim) owner.kills++; victim.die(world, owner); }
  }

  D3.Grenade = Grenade;
  D3.GRENADE = { RADIUS: RADIUS, THROW_SPEED: THROW_SPEED };
})(window.D3 = window.D3 || {});
