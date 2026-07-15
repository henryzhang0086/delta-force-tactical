/* 怪物(PvE 生存模式) —— Minecraft 小怪：僵尸 / 史莱姆 / 苦力怕
 * 目标：靠近玩家/队友近战；苦力怕贴脸自爆。可被子弹击杀(复用 Fighter._applyDamage 的鸭子类型)。
 */
(function (D3) {
  'use strict';

  var STATS = {
    zombie:  { hp: 55, speed: 3.1, dmg: 10, cd: 0.8, range: 1.6, reward: 100, name: '僵尸' },
    slime:   { hp: 34, speed: 3.9, dmg: 7,  cd: 0.7, range: 1.5, reward: 70,  name: '史莱姆' },
    creeper: { hp: 46, speed: 3.5, dmg: 0,  cd: 1.0, range: 2.4, reward: 140, name: '苦力怕' }
  };

  function part(geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }

  function buildMesh(type) {
    var T = D3.toon, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    if (type === 'slime') {
      var s = T.mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x6DBE45, { outline: 0.02, opacity: 0.9, transparent: true, tex: 'leaves' });
      s.position.y = 0.45; body.add(s);
      body.add(part(new THREE.BoxGeometry(0.12, 0.12, 0.02), T.mat(0x123a12,{steps:2,outline:false,cast:false}), -0.16, 0.5, 0.46));
      body.add(part(new THREE.BoxGeometry(0.12, 0.12, 0.02), T.mat(0x123a12,{steps:2,outline:false,cast:false}), 0.16, 0.5, 0.46));
      g.userData.bob = body;
    } else if (type === 'creeper') {
      var head = T.mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0x4FA63B, { outline: 0.02, tex: 'leaves' }); head.position.y = 1.35; body.add(head);
      var tor = T.mesh(new THREE.BoxGeometry(0.46, 0.72, 0.28), 0x4FA63B, { outline: 0.02, tex: 'leaves' }); tor.position.y = 0.78; body.add(tor);
      var legF = [[-0.13, 0.16], [0.13, 0.16], [-0.13, -0.16], [0.13, -0.16]];
      legF.forEach(function (xz) { var lg = T.mesh(new THREE.BoxGeometry(0.2, 0.32, 0.2), 0x4FA63B, { outline: 0.02, tex: 'leaves' }); lg.position.set(xz[0], 0.16, xz[1]); body.add(lg); });
      // 苦力怕黑脸
      [[-0.12, 1.4, 0.24, 0.12, 0.16], [0.12, 1.4, 0.24, 0.12, 0.16], [0, 1.28, 0.24, 0.12, 0.2]].forEach(function (f) { body.add(part(new THREE.BoxGeometry(f[3], f[4], 0.02), T.mat(0x0c1a0c,{steps:2,outline:false,cast:false}), f[0], f[1], f[2])); });
    } else { // zombie
      var zh = T.mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), 0x4A7A3A, { outline: 0.02 }); zh.position.y = 1.6; body.add(zh);
      body.add(part(new THREE.BoxGeometry(0.09,0.09,0.02), T.mat(0x1a0a0a,{steps:2,outline:false,cast:false}), -0.11,1.62,0.24));
      body.add(part(new THREE.BoxGeometry(0.09,0.09,0.02), T.mat(0x1a0a0a,{steps:2,outline:false,cast:false}), 0.11,1.62,0.24));
      var zt = T.mesh(new THREE.BoxGeometry(0.46, 0.7, 0.24), 0x2F5F8A, { outline: 0.02, tex:'wood' }); zt.position.y = 1.05; body.add(zt);
      var armL = T.mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), 0x4A7A3A, { outline: 0.02 }); armL.position.set(-0.33, 1.15, 0.2); armL.rotation.x = -1.4; body.add(armL);
      var armR = T.mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), 0x4A7A3A, { outline: 0.02 }); armR.position.set(0.33, 1.15, 0.2); armR.rotation.x = -1.4; body.add(armR);
      var lL = T.mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), 0x28324a, { outline: 0.02 }); lL.position.set(-0.12, 0.35, 0); body.add(lL);
      var lR = T.mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), 0x28324a, { outline: 0.02 }); lR.position.set(0.12, 0.35, 0); body.add(lR);
      g.userData.legs = [lL, lR];
    }
    return g;
  }

  function Monster(type) {
    var st = STATS[type] || STATS.zombie;
    this.type = type; this.st = st;
    this.team = 'monster'; this.isPlayer = false; this.kills = 0;
    this.maxHealth = st.hp; this.health = st.hp; this.vestDur = 0; this.helmetDur = 0;
    this.alive = false; this.radius = 0.5;
    this.pos = new THREE.Vector3(); this.yaw = 0;
    this.atkCd = 0; this.fuse = 0; this._phase = Math.random() * 6;
    this.char = { root: buildMesh(type) };
    // 命中盒
    this.headHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial()); this.headHitbox.visible = false;
    this.bodyHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.5), new THREE.MeshBasicMaterial()); this.bodyHitbox.visible = false;
    this.headHitbox.position.set(0, type === 'slime' ? 0.5 : 1.6, 0);
    this.bodyHitbox.position.set(0, type === 'slime' ? 0.45 : 0.9, 0);
    this.headHitbox.userData = { fighter: this, part: 'head' };
    this.bodyHitbox.userData = { fighter: this, part: 'body' };
    this.char.root.add(this.headHitbox); this.char.root.add(this.bodyHitbox);
  }

  Monster.prototype.addToScene = function (scene) { scene.add(this.char.root); };
  Monster.prototype._updatePlate = function () {};
  Monster.prototype.spawn = function (pos) { this.pos.copy(pos); this.pos.y = 0; this.health = this.maxHealth; this.alive = true; this.char.root.visible = true; this.char.root.position.copy(this.pos); };

  Monster.prototype.die = function (world, killer) {
    if (!this.alive) return; this.alive = false;
    this.char.root.visible = false;
    world.effects.kill(new THREE.Vector3(this.pos.x, 1, this.pos.z), this.type === 'creeper' ? 0x4FA63B : 0x8fbf5a);
    if (world.onMonsterKill) world.onMonsterKill(killer, this);
  };

  Monster.prototype._nearestTarget = function (world) {
    var best = null, bd = Infinity;
    for (var i = 0; i < world.fighters.length; i++) { var f = world.fighters[i]; if (!f.alive) continue; var d = this.pos.distanceTo(f.pos); if (d < bd) { bd = d; best = f; } }
    return best ? { f: best, d: bd } : null;
  };

  Monster.prototype._moveBy = function (dx, dz, world) {
    var nx = this.pos.x + dx, nz = this.pos.z + dz, r = this.radius, cols = world.colliders;
    for (var i = 0; i < cols.length; i++) { var c = cols[i];
      if (nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ) {
        var pL = (nx+r)-c.minX, pR = c.maxX-(nx-r), pT = (nz+r)-c.minZ, pB = c.maxZ-(nz-r), m = Math.min(pL,pR,pT,pB);
        if (m===pL) nx=c.minX-r; else if (m===pR) nx=c.maxX+r; else if (m===pT) nz=c.minZ-r; else nz=c.maxZ+r;
      }
    }
    var maxR = world.radius - 0.5, dd = Math.hypot(nx, nz); if (dd > maxR) { nx = nx/dd*maxR; nz = nz/dd*maxR; }
    this.pos.x = nx; this.pos.z = nz;
  };

  Monster.prototype._damage = function (victim, dmg, world) {
    var res = DF.combat.resolveDamage({ baseDamage: dmg, headshot: false, distance: 0, range: 999, health: victim.health, vestDur: victim.vestDur, helmetDur: victim.helmetDur, cfg: DF.CONFIG.combat, category: 'ar' });
    victim.health = res.health; victim.vestDur = res.vestDur; victim.helmetDur = res.helmetDur; victim._updatePlate();
    if (victim.isPlayer && world.onPlayerHurt) world.onPlayerHurt(res.dealt, false, this.pos);
    if (res.killed && victim.alive) victim.die(world, this);
  };

  Monster.prototype.update = function (dt, world) {
    if (!this.alive) return;
    if (this.atkCd > 0) this.atkCd -= dt;
    this._phase += dt;
    var tgt = this._nearestTarget(world);
    if (tgt) {
      var tx = tgt.f.pos.x - this.pos.x, tz = tgt.f.pos.z - this.pos.z, d = tgt.d;
      this.yaw = Math.atan2(tx, tz);
      if (this.type === 'creeper') {
        if (d < this.st.range) { this.fuse += dt; if (this.fuse > 1.1) this._explode(world); }
        else this.fuse = Math.max(0, this.fuse - dt);
        // 引信闪烁
        this.char.root.scale.setScalar(1 + Math.sin(this._phase * 20) * this.fuse * 0.12);
      }
      if (d > this.st.range - 0.3) {
        var sp = this.st.speed * (this.type === 'slime' ? (0.5 + Math.abs(Math.sin(this._phase * 4)) * 1.2) : 1);
        this._moveBy((tx/(d||1))*sp*dt, (tz/(d||1))*sp*dt, world);
      } else if (this.type !== 'creeper' && this.atkCd <= 0) {
        this.atkCd = this.st.cd; this._damage(tgt.f, this.st.dmg, world);
        if (world.audio) world.audio.hit && world.audio.hit();
      }
    }
    // 同步网格 + 动画
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.yaw;
    if (this.type === 'slime' && this.char.root.userData.bob) this.char.root.userData.bob.position.y = Math.abs(Math.sin(this._phase * 4)) * 0.4;
    if (this.type === 'zombie' && this.char.root.userData.legs) { var sw = Math.sin(this._phase * 6) * 0.5; this.char.root.userData.legs[0].rotation.x = sw; this.char.root.userData.legs[1].rotation.x = -sw; }
  };

  Monster.prototype._explode = function (world) {
    if (!this.alive) return;
    var p = new THREE.Vector3(this.pos.x, 0.6, this.pos.z);
    world.effects.explosion(p);
    if (world.audio && world.audio.explosion) world.audio.explosion();
    var R = 4.2;
    for (var i = 0; i < world.fighters.length; i++) { var f = world.fighters[i]; if (!f.alive) continue; var d = f.pos.distanceTo(this.pos); if (d < R) this._damage(f, 55 * (1 - d / R), world); }
    if (world.playerFighter && world.playerFighter.pos.distanceTo(this.pos) < R * 1.5 && world.onExplosionShake) world.onExplosionShake(0.3);
    this.alive = false; this.char.root.visible = false;
    if (world.onMonsterKill) world.onMonsterKill(null, this);
  };

  Monster.STATS = STATS;
  D3.Monster = Monster;
})(window.D3 = window.D3 || {});
