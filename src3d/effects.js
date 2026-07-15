/* 3D 卡通特效 —— 曳光弹 / 命中火花 / 血雾 / 弹壳 / 击杀烟花
 * 池化管理，避免频繁创建销毁。init(scene) 后每帧 update(dt)。
 */
(function (D3) {
  'use strict';

  function Effects() {
    this.scene = null;
    this.tracers = [];
    this.sparks = [];
    this.decals = [];
    this.pool = [];
    this._tmp = new THREE.Vector3();
    this.MAX_DECALS = 70;
  }

  Effects.prototype.init = function (scene) { this.scene = scene; };

  // 曳光：从 muzzle 到命中点的发光线段，短暂显示后收缩消失
  Effects.prototype.tracer = function (from, to, color) {
    var dir = new THREE.Vector3().subVectors(to, from);
    var len = dir.length();
    if (len < 0.01) return;
    var geo = new THREE.CylinderGeometry(0.045, 0.02, len, 6);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color || 0xFFF3B0, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.copy(from);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.tracers.push({ mesh: mesh, life: 0.09, max: 0.09 });
  };

  // 命中火花 / 血雾：若干小方块向外飞散
  Effects.prototype.burst = function (point, color, count, spread, gravity) {
    count = count || 8;
    for (var i = 0; i < count; i++) {
      var m = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 })
      );
      m.position.copy(point);
      var v = new THREE.Vector3((Math.random()*2-1), Math.random()*1.2+0.2, (Math.random()*2-1));
      v.multiplyScalar((spread || 3) * (0.4 + Math.random()));
      this.scene.add(m);
      this.sparks.push({ mesh: m, vel: v, life: 0.5 + Math.random()*0.3, max: 0.8, grav: gravity == null ? 9 : gravity, spin: (Math.random()*2-1)*8 });
    }
  };

  Effects.prototype.impact = function (point, color) { this.burst(point, color || 0xFFE08A, 7, 3, 9); };
  Effects.prototype.blood = function (point) { this.burst(point, 0xC0392B, 12, 3.5, 10); };

  // 抛弹壳：从枪口右侧飞出的黄铜小盒
  Effects.prototype.casing = function (pos, rightX, rightZ) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.11), new THREE.MeshBasicMaterial({ color: 0xE8B23A, transparent: true, opacity: 1 }));
    m.position.copy(pos);
    var v = new THREE.Vector3(rightX + (Math.random()*0.4-0.2), 1.4 + Math.random()*0.6, rightZ + (Math.random()*0.4-0.2));
    v.multiplyScalar(2.2);
    this.scene.add(m);
    this.sparks.push({ mesh: m, vel: v, life: 1.1, max: 1.1, grav: 11, spin: (Math.random()*2-1)*20 });
  };

  // 贴花：墙面弹孔 / 地面血迹（朝向 dir 的小方片，池化淡出）
  Effects.prototype.decal = function (point, dir, kind) {
    var size = kind === 'blood' ? (0.5 + Math.random()*0.4) : (0.14 + Math.random()*0.1);
    var color = kind === 'blood' ? 0x6e0f0f : 0x15161c;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, depthWrite: false }));
    if (kind === 'blood') { m.position.set(point.x, 0.03, point.z); m.rotation.x = -Math.PI/2; m.rotation.z = Math.random()*Math.PI; }
    else {
      m.position.copy(point).addScaledVector(dir, -0.02); // 略贴向表面外侧
      // 让弹孔朝向射来方向（简化：面向 -dir）
      var look = new THREE.Vector3().copy(point).addScaledVector(dir, -1);
      m.lookAt(look);
    }
    this.scene.add(m);
    this.decals.push({ mesh: m, life: 9, max: 9 });
    // 超出上限回收最旧
    while (this.decals.length > this.MAX_DECALS) { var d0 = this.decals.shift(); this.scene.remove(d0.mesh); d0.mesh.geometry.dispose(); d0.mesh.material.dispose(); }
  };
  Effects.prototype.kill = function (point, color) { this.burst(point, color || 0xFFFFFF, 22, 5, 6); };

  // 手雷爆炸：火球碎片 + 烟尘 + 瞬时闪光球
  Effects.prototype.explosion = function (point) {
    this.burst(point, 0xFF7A1A, 26, 8, 7);
    this.burst(point, 0xFFD23D, 18, 6, 5);
    this.burst(point, 0x555555, 14, 4, 3);
    // 闪光球（快速膨胀消失）
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 12), new THREE.MeshBasicMaterial({ color: 0xFFE9A0, transparent: true, opacity: 0.95 }));
    ball.position.copy(point); this.scene.add(ball);
    this.sparks.push({ mesh: ball, vel: new THREE.Vector3(), life: 0.35, max: 0.35, grav: 0, spin: 0, grow: 9 });
    var light = new THREE.PointLight(0xffb04a, 6, 18); light.position.copy(point); light.position.y += 1; this.scene.add(light);
    this._flashes = this._flashes || []; this._flashes.push({ light: light, life: 0.3, max: 0.3 });
  };

  Effects.prototype.update = function (dt) {
    var i, t;
    for (i = this.tracers.length - 1; i >= 0; i--) {
      t = this.tracers[i]; t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); this.tracers.splice(i,1); }
      else { t.mesh.material.opacity = 0.9 * (t.life / t.max); }
    }
    for (i = this.sparks.length - 1; i >= 0; i--) {
      var s = this.sparks[i]; s.life -= dt;
      if (s.life <= 0) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); this.sparks.splice(i,1); continue; }
      s.vel.y -= s.grav * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.grow) { var sc = 1 + s.grow * dt; s.mesh.scale.multiplyScalar(sc); }
      if (s.mesh.position.y < 0.05 && !s.grow) { s.mesh.position.y = 0.05; s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6; }
      s.mesh.rotation.x += s.spin * dt; s.mesh.rotation.y += s.spin * dt;
      s.mesh.material.opacity = Math.min(1, s.life / (s.max*0.5));
    }
    if (this._flashes) {
      for (i = this._flashes.length - 1; i >= 0; i--) {
        var fl = this._flashes[i]; fl.life -= dt;
        if (fl.life <= 0) { this.scene.remove(fl.light); this._flashes.splice(i, 1); }
        else fl.light.intensity = 6 * (fl.life / fl.max);
      }
    }
    // 贴花淡出
    for (i = this.decals.length - 1; i >= 0; i--) {
      var dc = this.decals[i]; dc.life -= dt;
      if (dc.life <= 0) { this.scene.remove(dc.mesh); dc.mesh.geometry.dispose(); dc.mesh.material.dispose(); this.decals.splice(i, 1); }
      else if (dc.life < 2) dc.mesh.material.opacity = dc.mesh.material.opacity * 0 + 0.85 * (dc.life / 2);
    }
  };

  D3.Effects = new Effects();
})(window.D3 = window.D3 || {});
