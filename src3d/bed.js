/* 起床之战 · 床铺 Bed —— 各队重生锚点(可被摧毁)
 * 鸭子类型复用 Fighter._applyDamage：具备 health/vestDur/helmetDur/isPlayer/team/_updatePlate/die
 * 床未被摧毁时该队无限复活；床被摧毁后无法再复活。
 */
(function (D3) {
  'use strict';

  var TEAM_COLORS = { alpha: 0x39C0FF, bravo: 0xFF5A5A, charlie: 0xFFC83D };
  var TEAM_NAMES  = { alpha: 'ALPHA', bravo: 'BRAVO', charlie: 'CHARLIE' };

  function Bed(team) {
    this.team = team;
    this.teamColor = TEAM_COLORS[team] || 0xffffff;
    this.name = (TEAM_NAMES[team] || team) + ' 床';
    this.isPlayer = false;
    this.maxHealth = 800; this.health = 800;
    this.vestDur = 0; this.helmetDur = 0;
    this.alive = true;
    this.kills = 0; this.deaths = 0;
    this.pos = new THREE.Vector3();
    this._build();
  }

  Bed.prototype._build = function () {
    var T = D3.toon;
    var g = new THREE.Group();
    var blanket = T.mat(this.teamColor, { steps: 3 });
    var wood = T.mat(0x8a5a2b, { steps: 3 });
    var pillow = T.mat(0xf2f2f2, { steps: 3 });
    function box(w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
    // 床垫（毯子·队色）
    g.add(box(2.0, 0.28, 1.15, blanket, 0, 0.42, 0));
    // 木框
    g.add(box(2.14, 0.16, 1.28, wood, 0, 0.24, 0));
    // 四腿
    var legY = 0.1;
    [[-0.95, -0.55], [0.95, -0.55], [-0.95, 0.55], [0.95, 0.55]].forEach(function (p) { g.add(box(0.16, 0.2, 0.16, wood, p[0], legY, p[1])); });
    // 枕头
    g.add(box(0.5, 0.22, 0.9, pillow, -0.7, 0.62, 0));
    // 床头板
    g.add(box(2.14, 0.6, 0.16, wood, 0, 0.55, -0.62));

    // 命中盒（略大，便于击中；不可见）
    var hb = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.3, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    hb.position.set(0, 0.6, 0); hb.userData = { bed: this };
    g.add(hb); this.hitbox = hb;

    // 定位光柱（便于找到床）
    var beamMat = new THREE.MeshBasicMaterial({ color: this.teamColor, transparent: true, opacity: 0.16, depthWrite: false });
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 26, 8, 1, true), beamMat);
    beam.position.set(0, 13, 0); g.add(beam); this.beam = beam;

    this.root = g;
    this._solidHitbox = hb; // 供渲染/射线
    // 头顶血条（依赖 this.root）
    this._makePlate();
  };

  Bed.prototype._makePlate = function () {
    if (typeof THREE.CanvasTexture !== 'function' || typeof THREE.Sprite !== 'function') return;
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 72;
    var ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    this._plateCv = cv; this._plateCtx = ctx;
    var tex = new THREE.CanvasTexture(cv);
    if (tex.minFilter !== undefined) tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(2.2, 0.6, 1); sp.position.set(0, 2.2, 0); sp.renderOrder = 999;
    this.plate = sp; this._plateTex = tex; this.root.add(sp);
    this._lastPlateHp = -1;
  };

  Bed.prototype._hex = function () { return '#' + this.teamColor.toString(16).padStart(6, '0'); };

  Bed.prototype._drawPlate = function () {
    if (!this.plate) return;
    var ctx = this._plateCtx, W = 256, H = 72;
    ctx.clearRect(0, 0, W, H);
    ctx.font = 'bold 24px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText('🛏 ' + this.name, W / 2, 18);
    ctx.fillStyle = this._hex(); ctx.fillText('🛏 ' + this.name, W / 2, 18);
    var bx = 28, by = 44, bw = 200, bh = 16, r = 7;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, bx - 3, by - 3, bw + 6, bh + 6, r + 2); ctx.fill();
    var pct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = pct > 0.5 ? '#4be08a' : (pct > 0.25 ? '#ffc83d' : '#ff5a5a');
    rr(ctx, bx, by, Math.max(2, bw * pct), bh, r); ctx.fill();
    if (this._plateTex) this._plateTex.needsUpdate = true;
  };
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  Bed.prototype._updatePlate = function () {
    if (!this.plate) return;
    this.plate.visible = this.alive;
    if (this.alive && this.health !== this._lastPlateHp) { this._drawPlate(); this._lastPlateHp = this.health; }
  };

  Bed.prototype.addToScene = function (scene) { scene.add(this.root); };

  Bed.prototype.place = function (pos, faceCenter) {
    this.pos.copy(pos); this.pos.y = 0;
    this.root.position.set(pos.x, 0, pos.z);
    // 床头朝向场地中心
    this.root.rotation.y = Math.atan2(-pos.x, -pos.z);
    this._updatePlate();
  };

  Bed.prototype.die = function (world, killer) {
    if (!this.alive) return;
    this.alive = false;
    if (this.plate) this.plate.visible = false;
    if (this.beam) this.beam.visible = false;
    // 碎裂特效
    if (world.effects && world.effects.explosion) world.effects.explosion(new THREE.Vector3(this.pos.x, 0.6, this.pos.z), 1.2);
    this._breaking = 2.0;
    if (world.onBedDestroyed) world.onBedDestroyed(this, killer);
  };

  Bed.prototype.update = function (dt) {
    if (this.beam && this.alive) this.beam.rotation.y += dt * 0.6;
    if (this._breaking > 0) {
      this._breaking -= dt;
      // 床体下沉 + 倾倒
      this.root.position.y -= dt * 0.6;
      this.root.rotation.z += dt * 0.8;
      if (this._breaking <= 0) this.root.visible = false;
    }
  };

  Bed.TEAM_COLORS = TEAM_COLORS;
  Bed.TEAM_NAMES = TEAM_NAMES;
  D3.Bed = Bed;
})(window.D3 = window.D3 || {});
