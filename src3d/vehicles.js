/* 载具系统 —— 轻轨运输车(可乘载移动平台/可抢夺) + 坦克(可驾驶火炮)
 * RailTram：沿站点往返，站台内的干员随车移动；控制权由车上人数决定。
 * Tank：可上车驾驶，炮塔随鼠标，开炮造成范围伤害。
 * 依赖 D3.toon；伤害经 world.explodeAt 结算（game 提供）。
 */
(function (D3) {
  'use strict';

  function box(w, h, d, color, opts) { return D3.toon.mesh(new THREE.BoxGeometry(w, h, d), color, opts || {}); }

  // ===================== 轻轨运输车 =====================
  function RailTram(path, opts) {
    opts = opts || {};
    this.path = path;                       // [Vector3,...] 站点序列
    this.speed = opts.speed || 7;
    this.dwell = opts.dwell || 5;           // 到站停留(秒)
    this.halfX = 5.2; this.halfZ = 16.0;    // 平台半宽/半长(局部)——大型车厢，可在内部激战
    this.wallH = 2.4;
    this.deckTop = 0.14;
    this.pos = path[0].clone(); this.pos.y = 0;
    this.prev = this.pos.clone();
    this.angle = 0;
    this.loop = !!opts.loop;                 // 环线(绕外围一圈)
    this.stations = opts.stations || null;   // 停靠站点的 waypoint 索引数组
    this._target = path.length > 1 ? 1 : 0;
    this._dir = 1; this._dwellT = 2.0;
    this.controller = null;
    this.solids = [];
    this._build();
  }

  RailTram.prototype._build = function () {
    var g = new THREE.Group(), self = this;
    var hx = this.halfX, hz = this.halfZ;
    var bodyCol = 0x9aa6b4, trimCol = 0x35506e, floorCol = 0x39414c, seatCol = 0x2f6f8f, metalCol = 0xbfc6cd;
    function cyl(r, len, color, x, y, z, rotZ) { var m = D3.toon.mesh(new THREE.CylinderGeometry(r, r, len, 10), color, { outline: false }); if (rotZ != null) m.rotation.z = rotZ; m.position.set(x, y, z); g.add(m); return m; }

    // —— 底盘 ——
    var deck = box(hx * 2, 0.14, hz * 2, floorCol, { outline: 0.02 }); deck.position.y = 0.07; deck.receiveShadow = true; g.add(deck);
    var aisle = box(1.5, 0.03, hz * 2 - 0.8, 0x4a5560, {}); aisle.position.y = 0.145; g.add(aisle);
    var frame = box(hx * 2 - 0.3, 0.3, hz * 2 - 0.2, 0x21252b, {}); frame.position.y = -0.12; g.add(frame);
    [-hz + 2.6, hz - 2.6].forEach(function (z) {
      var bogie = box(hx * 1.5, 0.5, 2.8, 0x16181d, {}); bogie.position.set(0, -0.38, z); g.add(bogie);
      [-hx * 0.72, hx * 0.72].forEach(function (x) {
        for (var wd = 0; wd < 2; wd++) cyl(0.55, 0.32, 0x0c0e11, x, -0.5, z - 0.9 + wd * 1.8, Math.PI / 2);
      });
    });

    // —— 侧墙(下实体墙=掩体 + 车窗玻璃 + 上檐) + 车内长椅 ——
    function sideWall(sx) {
      var lower = box(0.18, 0.95, hz * 2 - 0.8, bodyCol, { outline: 0.02 }); lower.position.set(sx, 0.6, 0); g.add(lower); self.solids.push(lower);
      var upper = box(0.18, 0.55, hz * 2 - 0.8, bodyCol, { outline: 0.02 }); upper.position.set(sx, 2.15, 0); g.add(upper);
      var belt = box(0.22, 0.1, hz * 2 - 0.8, trimCol, {}); belt.position.set(sx, 1.08, 0); g.add(belt);
      var nWin = 7, gap = (hz * 2 - 1.6) / nWin, inSign = sx < 0 ? 1 : -1;
      for (var i = 0; i < nWin; i++) {
        var cz = -hz + 0.9 + gap * (i + 0.5);
        var pane = box(0.06, 0.78, gap * 0.76, 0x9fd6ff, { transparent: true, opacity: 0.32, outline: false, emissive: 0x2a4a6a, emissiveIntensity: 0.28 });
        pane.position.set(sx, 1.55, cz); g.add(pane);
        var mull = box(0.22, 0.82, 0.12, trimCol, {}); mull.position.set(sx, 1.55, cz - gap * 0.5); g.add(mull);
      }
      // 内侧长椅
      var nSeat = 6, sgap = (hz * 2 - 4.4) / (nSeat - 1);
      for (var s = 0; s < nSeat; s++) {
        var sz = -hz + 2.2 + sgap * s;
        var seat = box(1.0, 0.4, 1.3, seatCol, { outline: 0.02 }); seat.position.set(sx + inSign * 0.75, 0.5, sz); g.add(seat);
        var back = box(0.2, 0.7, 1.3, seatCol, {}); back.position.set(sx + inSign * 0.28, 0.8, sz); g.add(back);
      }
    }
    sideWall(-hx); sideWall(hx);

    // —— 端墙 + 驾驶室 + 门 ——
    var frontWall = box(hx * 2 - 0.4, 1.7, 0.2, bodyCol, { outline: 0.02 }); frontWall.position.set(0, 0.95, -hz); g.add(frontWall); this.solids.push(frontWall);
    var windshield = box(hx * 2 - 1.4, 0.8, 0.08, 0x9fd6ff, { transparent: true, opacity: 0.32, outline: false, emissive: 0x2a4a6a, emissiveIntensity: 0.3 }); windshield.position.set(0, 2.05, -hz - 0.02); g.add(windshield);
    var rearWall = box(hx * 2 - 0.4, 2.35, 0.2, bodyCol, { outline: 0.02 }); rearWall.position.set(0, 1.25, hz); g.add(rearWall); this.solids.push(rearWall);
    // 侧门(不同色标识)
    [-hx, hx].forEach(function (sx) { var door = box(0.22, 1.7, 1.5, 0x2b3b52, { outline: 0.02 }); door.position.set(sx, 0.95, 0); g.add(door); });
    // 车前灯
    [-hx * 0.55, hx * 0.55].forEach(function (x) { var hl = box(0.42, 0.32, 0.16, 0xfff4c8, { emissive: 0xfff0a0, emissiveIntensity: 1.3, outline: false }); hl.position.set(x, 0.55, -hz - 0.1); g.add(hl); });
    var headlight = new THREE.PointLight(0xfff0c0, 0.7, 22); headlight.position.set(0, 1.4, -hz - 1.2); g.add(headlight);
    // 目的地灯牌
    var sign = box(3.0, 0.5, 0.06, 0x0e1a2c, { emissive: 0x39C0FF, emissiveIntensity: 0.85, outline: false }); sign.position.set(0, 2.75, -hz - 0.02); g.add(sign);

    // —— 车顶 ——
    var roof = box(hx * 2 + 0.2, 0.28, hz * 2, trimCol, { outline: 0.02 }); roof.position.y = 2.55; g.add(roof);
    var roofDome = box(hx * 1.5, 0.22, hz * 2 - 1.0, 0x475a70, {}); roofDome.position.y = 2.78; g.add(roofDome);
    [-hz * 0.5, 0, hz * 0.5].forEach(function (z) { var ac = box(1.7, 0.42, 1.5, 0x313846, {}); ac.position.set(0, 2.9, z); g.add(ac); });
    // 受电弓
    var panBase = box(1.2, 0.15, 0.5, 0x222831, {}); panBase.position.set(0, 2.95, -hz * 0.2); g.add(panBase);
    cyl(0.04, 1.1, metalCol, -0.4, 3.4, -hz * 0.2, Math.PI / 5); cyl(0.04, 1.1, metalCol, 0.4, 3.4, -hz * 0.2, -Math.PI / 5);
    var panBar = box(1.6, 0.08, 0.1, metalCol, {}); panBar.position.set(0, 3.95, -hz * 0.2); g.add(panBar);

    // —— 车内细节 ——
    // 立柱扶手
    for (var p = 0; p < 6; p++) { var px = (p % 2 ? 1 : -1) * hx * 0.5; var pz = -hz + 3.5 + Math.floor(p / 2) * (hz * 0.66); cyl(0.07, 2.0, metalCol, px, 1.15, pz); }
    // 顶部横向扶手杆 + 吊环
    [-hx * 0.5, hx * 0.5].forEach(function (x) {
      var bar = box(0.08, 0.08, hz * 2 - 3.4, metalCol, {}); bar.position.set(x, 2.05, 0); g.add(bar);
      for (var h = 0; h < 8; h++) { var strap = box(0.05, 0.28, 0.05, 0x2b2f36, {}); strap.position.set(x, 1.8, -hz + 2.4 + h * ((hz * 2 - 4.8) / 7)); g.add(strap); }
    });
    // 顶灯条(自发光)
    [-hx * 0.4, hx * 0.4].forEach(function (x) { var strip = box(0.3, 0.08, hz * 2 - 2.4, 0xffffff, { emissive: 0xfff4d6, emissiveIntensity: 0.75, outline: false }); strip.position.set(x, 2.66, 0); g.add(strip); });
    // 车内氛围灯
    var il1 = new THREE.PointLight(0xfff0d0, 0.55, 16); il1.position.set(0, 2.3, -hz * 0.45); g.add(il1);
    var il2 = new THREE.PointLight(0xfff0d0, 0.55, 16); il2.position.set(0, 2.3, hz * 0.45); g.add(il2);

    // —— 控制旗（显示控制方颜色）——
    var pole2 = box(0.1, 1.4, 0.1, 0x222831, {}); pole2.position.set(0, 2.9 + 0.7, hz * 0.3); g.add(pole2);
    var flag = box(1.2, 0.65, 0.06, 0xdddddd, { emissive: 0xffffff, emissiveIntensity: 0.12, outline: false }); flag.position.set(0.65, 2.9 + 1.0, hz * 0.3); g.add(flag); this.flag = flag;

    this.root = g;
  };

  RailTram.prototype.addToScene = function (scene) { scene.add(this.root); };

  // 世界坐标是否落在平台足印内
  RailTram.prototype.contains = function (x, z) {
    var dx = x - this.pos.x, dz = z - this.pos.z;
    var ca = Math.cos(-this.angle), sa = Math.sin(-this.angle);
    var lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
    return Math.abs(lx) < this.halfX - 0.2 && Math.abs(lz) < this.halfZ - 0.2;
  };

  RailTram.prototype.ridersByTeam = function (world) {
    var c = { alpha: 0, bravo: 0, charlie: 0 };
    for (var i = 0; i < world.fighters.length; i++) {
      var f = world.fighters[i]; if (!f.alive) continue;
      if (this.contains(f.pos.x, f.pos.z)) c[f.team] = (c[f.team] || 0) + 1;
    }
    return c;
  };

  // 当前控制方：车上人数唯一最多者，否则 null（争夺中/无人）
  RailTram.prototype.controllingTeam = function (world) {
    var c = this.ridersByTeam(world);
    var best = null, bn = 0, tie = false;
    ['alpha', 'bravo', 'charlie'].forEach(function (t) { if (c[t] > bn) { bn = c[t]; best = t; tie = false; } else if (c[t] === bn && bn > 0) tie = true; });
    return (bn > 0 && !tie) ? best : null;
  };

  RailTram.prototype.setController = function (team, colorHex) {
    this.controller = team;
    if (this.flag && this.flag.material && this.flag.material.color) {
      this.flag.material.color.set(team ? colorHex : 0xdddddd);
      if (this.flag.material.emissive) this.flag.material.emissive.set(team ? colorHex : 0xffffff);
    }
  };

  RailTram.prototype._isStation = function (idx) { return this.stations ? this.stations.indexOf(idx) >= 0 : true; };

  RailTram.prototype.update = function (dt, world) {
    this.prev.copy(this.pos);
    if (this._dwellT > 0) { this._dwellT -= dt; }
    else {
      var b = this.path[this._target];
      var dx = b.x - this.pos.x, dz = b.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 0.001) this.angle = Math.atan2(dx, dz);
      var step = this.speed * dt;
      if (dist <= step) {
        this.pos.x = b.x; this.pos.z = b.z;
        var arrived = this._target;
        if (this.loop) { this._target = (this._target + 1) % this.path.length; }
        else {
          this._target += this._dir;
          if (this._target > this.path.length - 1) { this._target = this.path.length - 2; this._dir = -1; }
          else if (this._target < 0) { this._target = 1; this._dir = 1; }
        }
        if (this._isStation(arrived)) this._dwellT = this.dwell;
      } else { this.pos.x += dx / dist * step; this.pos.z += dz / dist * step; }
    }
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.angle;
    // 载人：把足印内的干员随车平移
    var delX = this.pos.x - this.prev.x, delZ = this.pos.z - this.prev.z;
    if ((delX || delZ) && world && world.fighters) {
      for (var i = 0; i < world.fighters.length; i++) {
        var f = world.fighters[i]; if (!f.alive) continue;
        if (this.contains(f.pos.x, f.pos.z)) { f.pos.x += delX; f.pos.z += delZ; }
      }
    }
  };

  // 沿站点铺设可视轨道（返回 group，可加入场景）；loop=true 时闭合成环
  D3.buildRailTrack = function (path, loop) {
    var g = new THREE.Group();
    var count = loop ? path.length : path.length - 1;
    for (var s = 0; s < count; s++) {
      var a = path[s], b = path[(s + 1) % path.length];
      var dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
      var seg = new THREE.Group();
      var rL = box(0.18, 0.14, len, 0x8a8f98, {}); rL.position.set(-1.5, 0.07, 0); seg.add(rL);
      var rR = box(0.18, 0.14, len, 0x8a8f98, {}); rR.position.set(1.5, 0.07, 0); seg.add(rR);
      var n = Math.max(2, Math.floor(len / 1.8));
      for (var i = 0; i <= n; i++) {
        var sleeper = box(3.5, 0.1, 0.4, 0x5a3a1e, {});
        sleeper.position.set(0, 0.03, -len / 2 + (len) * (i / n)); seg.add(sleeper);
      }
      seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      seg.rotation.y = ang;
      g.add(seg);
    }
    return g;
  };

  // 站台（月台+雨棚+立柱+站牌+长椅），朝向 angle
  D3.buildStation = function (pos, angle, name) {
    var g = new THREE.Group();
    var slab = box(7, 0.3, 6, 0x59616d, { outline: 0.02 }); slab.position.y = 0.22; slab.receiveShadow = true; g.add(slab);
    var edge = box(7, 0.12, 0.3, 0xffcc33, {}); edge.position.set(0, 0.34, -3); g.add(edge); // 月台警戒边
    [[-3, -2.4], [3, -2.4], [-3, 2.4], [3, 2.4]].forEach(function (p) { var c = box(0.22, 2.6, 0.22, 0x3a4450, {}); c.position.set(p[0], 1.5, p[1]); g.add(c); });
    var canopy = box(7.4, 0.22, 6, 0x35506e, { outline: 0.02 }); canopy.position.y = 2.9; g.add(canopy);
    var sign = box(3.0, 0.6, 0.12, 0x0e1a2c, { emissive: 0x39C0FF, emissiveIntensity: 0.85, outline: false }); sign.position.set(0, 2.2, -2.95); g.add(sign);
    var bench = box(3.0, 0.4, 0.7, 0x2f6f8f, { outline: 0.02 }); bench.position.set(0, 0.55, 2.2); g.add(bench);
    var back = box(3.0, 0.6, 0.18, 0x2f6f8f, {}); back.position.set(0, 0.85, 2.5); g.add(back);
    var lamp = new THREE.PointLight(0xfff0d0, 0.5, 14); lamp.position.set(0, 2.6, 0); g.add(lamp);
    g.position.set(pos.x, 0, pos.z); g.rotation.y = angle;
    return g;
  };

  // ===================== 坦克 =====================
  function Tank(pos, opts) {
    opts = opts || {};
    this.pos = pos.clone(); this.pos.y = 0;
    this.angle = opts.angle || 0;
    this.turret = this.angle;
    this.team = opts.team || null;
    this.occupant = null;
    this.alive = true;
    this.kind = 'tank';
    // 装甲耐久（小口径难以击穿，需持续火力/爆炸物）
    this.maxHealth = 1000; this.health = 1000;
    this.vestDur = 0; this.helmetDur = 0; this.isPlayer = false; this.kills = 0;
    this.hitFlash = 0;
    this.speed = 6.2; this.turnRate = 1.5;
    this.cooldown = 0; this.reloadTime = 2.4;
    this.name = '坦克';
    this._build();
  }

  Tank.prototype._build = function () {
    var g = new THREE.Group();
    var base = this.team === 'alpha' ? 0x3a5a4a : (this.team === 'bravo' ? 0x5a3a3a : (this.team === 'charlie' ? 0x5a5333 : 0x40463c));
    // 车体
    var hull = box(2.5, 0.85, 3.6, base, { outline: 0.03 }); hull.position.y = 0.75; hull.castShadow = true; g.add(hull);
    var glacis = box(2.3, 0.5, 1.0, base, {}); glacis.position.set(0, 0.55, 1.9); g.add(glacis);
    // 履带
    var trL = box(0.6, 0.6, 3.8, 0x23262b, {}); trL.position.set(-1.25, 0.35, 0); g.add(trL);
    var trR = box(0.6, 0.6, 3.8, 0x23262b, {}); trR.position.set(1.25, 0.35, 0); g.add(trR);
    for (var i = 0; i < 5; i++) { var wl = box(0.66, 0.5, 0.5, 0x15171b, {}); wl.position.set(-1.25, 0.28, -1.5 + i * 0.75); g.add(wl); var wr = box(0.66, 0.5, 0.5, 0x15171b, {}); wr.position.set(1.25, 0.28, -1.5 + i * 0.75); g.add(wr); }
    // 炮塔（独立转向）
    var turret = new THREE.Group();
    var tb = box(1.7, 0.75, 1.9, base, { outline: 0.03 }); tb.position.y = 0; turret.add(tb);
    var mantlet = box(0.7, 0.5, 0.6, 0x2b2f36, {}); mantlet.position.set(0, 0, 1.0); turret.add(mantlet);
    var barrel = D3.toon.mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.6, 10), 0x2b2f36, {});
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, 2.3); turret.add(barrel);
    var cupola = box(0.6, 0.35, 0.6, base, {}); cupola.position.set(-0.35, 0.5, -0.3); turret.add(cupola);
    turret.position.set(0, 1.35, 0);
    g.add(turret); this.turretObj = turret;
    // 命中盒（子弹/炮弹判定；不可见）
    var hb = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 4.4), new THREE.MeshBasicMaterial({ visible: false }));
    hb.position.set(0, 1.1, 0); hb.userData = { tank: this }; g.add(hb); this.hitbox = hb;
    this._makePlate(g);
    this.root = g;
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.angle;
  };

  Tank.prototype._makePlate = function (g) {
    if (typeof THREE.CanvasTexture !== 'function' || typeof THREE.Sprite !== 'function') return;
    var cv = document.createElement('canvas'); cv.width = 200; cv.height = 40;
    var ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    this._plateCtx = ctx; var tex = new THREE.CanvasTexture(cv);
    if (tex.minFilter !== undefined) tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(3.4, 0.68, 1); sp.position.set(0, 3.4, 0); sp.renderOrder = 999;
    this.plate = sp; this._plateTex = tex; this._lastHp = -1; g.add(sp);
  };
  Tank.prototype._updatePlate = function () {
    if (!this.plate || !this._plateCtx) return;
    if (this.health === this._lastHp) return; this._lastHp = this.health;
    var ctx = this._plateCtx, W = 200, H = 40; ctx.clearRect(0, 0, W, H);
    ctx.font = 'bold 18px "Segoe UI",sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#cfe0f5'; ctx.fillText('🛡 坦克', W / 2, 15);
    var bx = 20, by = 22, bw = 160, bh = 12, pct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = pct > 0.5 ? '#4be08a' : (pct > 0.25 ? '#ffc83d' : '#ff5a5a');
    ctx.fillRect(bx, by, Math.max(2, bw * pct), bh);
    if (this._plateTex) this._plateTex.needsUpdate = true;
    this.plate.visible = this.alive;
  };

  Tank.prototype.addToScene = function (scene) { scene.add(this.root); };
  Tank.prototype.mount = function (f) { this.occupant = f; if (f) f.inVehicle = this; };
  Tank.prototype.dismount = function () { var f = this.occupant; if (f) f.inVehicle = null; this.occupant = null; return f; };

  // 装甲毁伤（占员在内时不承伤，改由坦克承受）
  Tank.prototype.die = function (world, killer) {
    if (!this.alive) return; this.alive = false;
    if (world.effects && world.effects.explosion) world.effects.explosion(new THREE.Vector3(this.pos.x, 1.4, this.pos.z));
    if (world.audio && world.audio.explosion) world.audio.explosion();
    if (this.turretObj) this.turretObj.rotation.x = -0.22;         // 炮塔下垂(残骸)
    if (this.plate) this.plate.visible = false;
    var occ = this.occupant;
    if (occ) {
      occ.inVehicle = null;
      if (occ.health !== undefined) { occ.health -= 45; occ._updatePlate && occ._updatePlate(); if (occ.health <= 0 && occ.alive) occ.die(world, killer); }
    }
    this.occupant = null;
  };

  Tank.prototype.drive = function (forward, turn, dt, world) {
    this.angle += turn * this.turnRate * dt;
    if (forward) {
      var mvx = Math.sin(this.angle) * forward * this.speed * dt;
      var mvz = Math.cos(this.angle) * forward * this.speed * dt;
      var nx = this.pos.x + mvx, nz = this.pos.z + mvz;
      // 场地边界
      var maxR = (world.radius || 52) - 2.4, d = Math.hypot(nx, nz);
      if (d > maxR) { nx = nx / d * maxR; nz = nz / d * maxR; }
      this.pos.x = nx; this.pos.z = nz;
    }
  };

  Tank.prototype.update = function (dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.alive) { this.root.position.set(this.pos.x, 0, this.pos.z); this.root.rotation.y = this.angle; }
    if (this.turretObj && this.alive) this.turretObj.rotation.y = this.turret - this.angle;
    if (this._updatePlate) this._updatePlate();
  };

  Tank.prototype.canFire = function () { return this.cooldown <= 0; };

  // 炮塔前端炮口（世界坐标）
  Tank.prototype.muzzleWorld = function () {
    var t = this.turret; return new THREE.Vector3(this.pos.x + Math.sin(t) * 4.2, 1.55, this.pos.z + Math.cos(t) * 4.2);
  };

  // 开炮：炮弹飞向准星命中点(aimPoint)，命中处范围爆炸——瞄准与弹道一致
  Tank.prototype.fire = function (aimPoint, world) {
    if (this.cooldown > 0 || !this.alive) return false;
    this.cooldown = this.reloadTime;
    var muzzle = this.muzzleWorld();
    var dir = aimPoint.clone().sub(muzzle);
    if (dir.length() < 0.5) dir.set(Math.sin(this.turret), 0, Math.cos(this.turret));
    dir.normalize();
    var ray = world.raycaster; ray.set(muzzle, dir); ray.far = 260;
    var hits = ray.intersectObjects(world.solids, false);
    var point = hits.length ? hits[0].point : aimPoint.clone();
    if (world.effects && world.effects.tracer) world.effects.tracer(muzzle, point, 0xffd27a);
    if (world.effects && world.effects.explosion) world.effects.explosion(point);
    if (world.audio && world.audio.explosion) world.audio.explosion();
    if (world.explodeAt) world.explodeAt(point, 7.5, 170, this.occupant);
    if (world.addShake) world.addShake(0.3);
    return true;
  };

  // ===================== 摩托车 =====================
  function Motorcycle(pos, opts) {
    opts = opts || {};
    this.kind = 'bike';
    this.pos = pos.clone(); this.pos.y = 0;
    this.angle = opts.angle || 0;
    this.team = opts.team || null;
    this.occupant = null; this.alive = true;
    this.maxHealth = 180; this.health = 180; this.vestDur = 0; this.helmetDur = 0; this.isPlayer = false; this.kills = 0;
    this.speed = 17; this.turnRate = 2.3; this.name = '摩托车';
    this._build();
  }
  Motorcycle.prototype._build = function () {
    var g = new THREE.Group();
    var body = this.team === 'alpha' ? 0x2f6f9f : (this.team === 'bravo' ? 0x9f3f3f : 0x2b2f36);
    var frame = box(0.4, 0.4, 2.0, body, { outline: 0.03 }); frame.position.set(0, 0.75, 0); g.add(frame);
    var tank = box(0.5, 0.4, 0.7, body, { outline: 0.03 }); tank.position.set(0, 1.0, -0.1); g.add(tank);
    var seat = box(0.45, 0.18, 0.8, 0x1a1c22, { outline: 0.02 }); seat.position.set(0, 1.05, 0.5); g.add(seat);
    // 车轮
    var wf = D3.toon.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 14), 0x0e1013, { outline: false }); wf.rotation.z = Math.PI / 2; wf.position.set(0, 0.55, -1.15); g.add(wf);
    var wr = D3.toon.mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.32, 14), 0x0e1013, { outline: false }); wr.rotation.z = Math.PI / 2; wr.position.set(0, 0.6, 1.05); g.add(wr);
    // 前叉 + 车把
    var fork = box(0.12, 0.9, 0.12, 0x888e96, {}); fork.position.set(0, 0.9, -1.05); fork.rotation.x = 0.3; g.add(fork);
    var bar = box(0.9, 0.1, 0.1, 0x888e96, {}); bar.position.set(0, 1.25, -0.9); g.add(bar);
    var head = box(0.28, 0.24, 0.14, 0xfff4c8, { emissive: 0xfff0a0, emissiveIntensity: 1.1, outline: false }); head.position.set(0, 1.0, -1.25); g.add(head);
    this.root = g; this.root.position.set(this.pos.x, 0, this.pos.z); this.root.rotation.y = this.angle;
  };
  Motorcycle.prototype.addToScene = function (scene) { scene.add(this.root); };
  Motorcycle.prototype.mount = function (f) { this.occupant = f; };          // 骑手暴露(可被击中)
  Motorcycle.prototype.dismount = function () { var f = this.occupant; this.occupant = null; return f; };
  Motorcycle.prototype.drive = function (forward, turn, dt, world) {
    if (Math.abs(forward) > 0.01) this.angle += turn * this.turnRate * dt; // 有速度才转向
    if (forward) {
      var nx = this.pos.x + Math.sin(this.angle) * forward * this.speed * dt;
      var nz = this.pos.z + Math.cos(this.angle) * forward * this.speed * dt;
      var maxR = (world.radius || 52) - 1.5, dd = Math.hypot(nx, nz);
      if (dd > maxR) { nx = nx / dd * maxR; nz = nz / dd * maxR; }
      // 简单掩体规避（撞墙减速停下）
      var cols = world.colliders, blocked = false;
      for (var i = 0; i < cols.length; i++) { var c = cols[i]; if ((c.yBase || 0) > 1) continue; if (nx > c.minX - 0.6 && nx < c.maxX + 0.6 && nz > c.minZ - 0.6 && nz < c.maxZ + 0.6) { blocked = true; break; } }
      if (!blocked) { this.pos.x = nx; this.pos.z = nz; }
    }
    this._spd = forward;
  };
  Motorcycle.prototype.update = function (dt) {
    if (this.alive) { this.root.position.set(this.pos.x, 0, this.pos.z); this.root.rotation.y = this.angle; }
  };
  Motorcycle.prototype.die = function (world, killer) {
    if (!this.alive) return; this.alive = false;
    if (world.effects && world.effects.explosion) world.effects.explosion(new THREE.Vector3(this.pos.x, 0.8, this.pos.z));
    if (world.audio && world.audio.explosion) world.audio.explosion();
    this.root.rotation.z = 1.3; // 倒地
    var occ = this.occupant; if (occ) { occ.inVehicle = null; }
    this.occupant = null;
  };

  D3.RailTram = RailTram;
  D3.Tank = Tank;
  D3.Motorcycle = Motorcycle;
})(window.D3 = window.D3 || {});
