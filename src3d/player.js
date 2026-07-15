/* 第三人称越肩控制器 —— 指针锁定鼠标视角 + WASD 移动 + 越肩相机 + 命中射线
 * new D3.Player(fighter, camera, canvas)；每帧 update(dt, world)
 */
(function (D3) {
  'use strict';

  // 逐武器后坐力档：v=垂直踢(弧度) h=水平摆(弧度)
  var RECOIL = {
    smg:      { v: 0.009, h: 0.006 },
    ar:       { v: 0.012, h: 0.006 },
    lmg:      { v: 0.014, h: 0.009 },
    sniper:   { v: 0.055, h: 0.010 },
    marksman: { v: 0.024, h: 0.007 },
    shotgun:  { v: 0.032, h: 0.014 },
    pistol:   { v: 0.016, h: 0.008 },
    melee:    { v: 0, h: 0 }
  };

  function Player(fighter, camera, canvas) {
    this.f = fighter;
    this.camera = camera;
    this.canvas = canvas;
    this.yaw = 0; this.pitch = -0.05;
    this.keys = {};
    this.firing = false;
    this.ads = false;
    this.throwType = 'frag';
    this.fovKick = 0;
    this.view = 'tps'; // 'tps' 越肩 / 'fps' 第一人称
    this.locked = false;
    this.recoil = 0;
    this.sens = 0.0024;
    this.baseFov = camera.fov || 62;
    this.stepAcc = 0;
    this.enabled = true;
    this._fwd = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this.vmKick = 0; this.vmBob = 0; this._wasReloadingVm = false;
    this.recoilRecover = 0; // 待回复的后坐俯仰量（松开扳机后平滑归位）
    this._wasAds = false;
    this.leanAmt = 0;       // 探头量 -1(左) .. 1(右)
    this.vehicle = null; this.wantInteract = false;
    this.airY = 0; this.airVel = 0; this.grounded = true; this._jumpLatch = false; // 跳跃
    this.prone = false; this._proneT = 0;   // 卧倒
    this._bind();
    this._buildViewmodel();
  }

  // 第一人称右下持枪视模型（挂在相机上，仅 FPS 可见；逐武器不同外形）
  Player.prototype._buildViewmodel = function () {
    var vm = new THREE.Group();
    this.camera.add(vm);
    vm.visible = false;
    this.vm = vm;
    this._vmBase = { x: 0.30, y: -0.28, z: -0.60 };
    this._vmAds = { x: 0.0, y: -0.13, z: -0.42 };
    this._vmWeaponId = null;
    this._buildGunModel();
  };

  // 逐武器持枪参数（类别默认 + 逐枪覆盖），让每把枪外形都不同
  Player.prototype._gunParams = function (cat, id) {
    var base = {
      ar:       { bodyLen: 0.50, bodyH: 0.13, barrelLen: 0.40, barrelR: 0.030, mag: 'curved', magLen: 0.22, stock: 'fixed', optic: 'red' },
      smg:      { bodyLen: 0.38, bodyH: 0.12, barrelLen: 0.22, barrelR: 0.028, mag: 'box', magLen: 0.24, stock: 'folding', optic: 'red' },
      lmg:      { bodyLen: 0.60, bodyH: 0.16, barrelLen: 0.52, barrelR: 0.036, mag: 'drum', magLen: 0.22, stock: 'fixed', optic: 'red' },
      sniper:   { bodyLen: 0.66, bodyH: 0.13, barrelLen: 0.66, barrelR: 0.030, mag: 'box', magLen: 0.18, stock: 'fixed', optic: 'bigtube' },
      marksman: { bodyLen: 0.60, bodyH: 0.13, barrelLen: 0.54, barrelR: 0.030, mag: 'box', magLen: 0.18, stock: 'fixed', optic: 'tube' },
      shotgun:  { bodyLen: 0.54, bodyH: 0.13, barrelLen: 0.44, barrelR: 0.036, mag: 'tube', magLen: 0.0, stock: 'fixed', optic: 'iron' },
      pistol:   { bodyLen: 0.28, bodyH: 0.11, barrelLen: 0.12, barrelR: 0.026, mag: 'grip', magLen: 0.16, stock: 'none', optic: 'iron' }
    };
    var d = {}; var src = base[cat] || base.ar; for (var kb in src) d[kb] = src[kb];
    var over = {
      ak12: { color: 0x3a2f22, barrelLen: 0.44 }, scar: { color: 0x394030, bodyLen: 0.56, magLen: 0.20 },
      famas: { color: 0x2c2c30, bodyLen: 0.46, optic: 'holo' }, aug: { color: 0x4a4030, mag: 'curved', optic: 'holo' },
      mce: { color: 0x3a4550 }, asval: { color: 0x2b2f36, barrelLen: 0.52 }, vector: { color: 0x2c3440, bodyLen: 0.34, magLen: 0.26 },
      mp5: { color: 0x30343c, mag: 'curved' }, p90: { color: 0x22252c, bodyLen: 0.42, mag: 'top' }, ump45: { color: 0x3a352c, mag: 'box' },
      m250: { color: 0x3a3630 }, mg36: { color: 0x2f3a30, mag: 'drum' }, pkm: { color: 0x3a2f22, mag: 'drum' },
      awm: { color: 0x2e3b30, barrelLen: 0.74 }, m700: { color: 0x3a2f26, optic: 'tube' }, m24: { color: 0x33402f },
      sv98: { color: 0x2e3b30 }, sr25: { color: 0x37322a, optic: 'tube' }, m14: { color: 0x4a3a26, mag: 'box', magLen: 0.26, optic: 'holo' }, qbu: { color: 0x3a3020 },
      spas: { color: 0x2a2a2e }, m870: { color: 0x3a2a1e }, g18: { color: 0x24242a }, deagle: { color: 0x4a4038, barrelLen: 0.16 }
    }[id];
    if (over) for (var ko in over) d[ko] = over[ko];
    if (d.color == null) d.color = 0x2a2e36;
    return d;
  };

  // 依据武器参数构建持枪外形，把零件放进 this.vm
  Player.prototype._buildGunModel = function () {
    var T = D3.toon, vm = this.vm;
    while (vm.children.length) vm.remove(vm.children[0]);
    var w = this.f.weapon || {}, cat = w.category || 'ar', id = w.id || 'ar';
    this._vmWeaponId = id;
    var p = this._gunParams(cat, id);
    var dark = T.mat(p.color, { steps: 3 }), steel = T.mat(0x565b63, { steps: 3 }), acc = T.mat(0x17191f, { steps: 3 });
    function box(w2, h, d2, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w2, h, d2), mat); m.position.set(x, y, z); vm.add(m); return m; }
    function cyl(r, len, mat, x, y, z) { var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); vm.add(m); return m; }
    var frontZ = 0.06 + p.bodyLen / 2;
    // 机匣
    box(0.11, p.bodyH, p.bodyLen, dark, 0, 0, 0.06);
    // 枪管 + 护木
    cyl(p.barrelR, p.barrelLen, steel, 0, 0.02, frontZ + p.barrelLen / 2);
    var hgLen = Math.min(p.barrelLen, 0.3); if (hgLen > 0.05) box(0.09, 0.08, hgLen, dark, 0, -0.01, frontZ + hgLen / 2);
    if (id === 'asval') cyl(p.barrelR + 0.02, 0.22, acc, 0, 0.02, frontZ + p.barrelLen - 0.05); // 消音器
    // 握把
    if (cat !== 'pistol') box(0.05, 0.12, 0.12, dark, 0, -0.12, -0.08);
    // 弹匣
    var mag = null, magY = -0.16;
    if (p.mag === 'curved') { magY = -(p.bodyH / 2 + 0.02); mag = box(0.07, p.magLen, 0.09, acc, 0, magY - p.magLen * 0.35 + 0.05, 0.12); magY = mag.position.y; }
    else if (p.mag === 'box') { magY = -(p.bodyH / 2 + p.magLen / 2 - 0.02); mag = box(0.07, p.magLen, 0.09, acc, 0, magY, 0.10); }
    else if (p.mag === 'drum') { magY = -0.14; mag = box(0.2, 0.2, 0.2, acc, 0, magY, 0.14); }
    else if (p.mag === 'top') { magY = p.bodyH / 2 + 0.05; mag = box(0.08, 0.08, p.bodyLen * 0.7, acc, 0, magY, 0.08); }
    else if (p.mag === 'grip') { magY = -0.10; mag = box(0.07, p.magLen, 0.08, acc, 0, magY, -0.02); }
    else if (p.mag === 'tube') { box(0.05, 0.05, p.barrelLen * 0.8, acc, 0, -0.05, frontZ + p.barrelLen * 0.35); } // 弹仓管(无匣)
    // 枪托
    if (p.stock === 'fixed') box(0.06, 0.13, 0.20, dark, 0, -0.04, -0.06 - p.bodyLen / 2 - 0.10);
    else if (p.stock === 'folding') box(0.05, 0.10, 0.12, dark, 0, -0.02, -0.06 - p.bodyLen / 2 - 0.06);
    // 瞄具
    var topY = p.bodyH / 2 + 0.03;
    if (p.optic === 'red') box(0.06, 0.06, 0.10, acc, 0, topY + 0.02, 0.04);
    else if (p.optic === 'holo') { box(0.08, 0.07, 0.14, acc, 0, topY + 0.03, 0.04); }
    else if (p.optic === 'tube') { cyl(0.055, 0.30, acc, 0, topY + 0.06, 0.08); box(0.08, 0.08, 0.06, acc, 0, topY + 0.02, -0.06); }
    else if (p.optic === 'bigtube') { cyl(0.07, 0.38, acc, 0, topY + 0.07, 0.08); box(0.1, 0.1, 0.07, acc, 0, topY + 0.02, -0.08); }
    else { box(0.02, 0.04, 0.03, acc, 0, topY + 0.02, frontZ); box(0.02, 0.05, 0.03, acc, 0, topY + 0.02, -0.06); } // 机瞄
    // 套筒(手枪)
    if (cat === 'pistol') box(0.09, 0.10, p.bodyLen, dark, 0, 0.03, 0.06);

    if (!mag) mag = box(0.001, 0.001, 0.001, acc, 0, magY, 0); // 占位，供换弹动画引用
    vm.mag = mag; vm._magY = mag.position.y;
  };

  // 武器变化时重建持枪外形
  Player.prototype._ensureViewmodel = function () {
    var id = this.f.weapon && this.f.weapon.id;
    if (id && id !== this._vmWeaponId) this._buildGunModel();
  };

  // 每帧驱动视模型动画：呼吸摆动 + 开火后坐 + 换弹下沉/换匣
  Player.prototype._updateViewmodel = function (dt, fps) {
    var vm = this.vm; if (!vm) return;
    var f = this.f;
    this._ensureViewmodel(); // 武器变化即换外形
    // 开镜瞄准时隐藏枪身，避免遮挡视野（HUD 会显示对应瞄准镜/红点分划）
    vm.visible = fps && f.alive && this.enabled && !this.ads;
    if (!vm.visible) { vm._adsK = 0; return; }

    var b = this._vmBase, a = this._vmAds;
    var adsK = this.ads ? Math.min(1, (vm._adsK || 0) + dt * 10) : Math.max(0, (vm._adsK || 0) - dt * 10);
    vm._adsK = adsK;
    var px = b.x + (a.x - b.x) * adsK;
    var py = b.y + (a.y - b.y) * adsK;
    var pz = b.z + (a.z - b.z) * adsK;

    // 走动呼吸摆动
    var sp = f._moveSpeed || 0;
    this.vmBob += dt * (4 + sp * 2.2);
    var bobA = Math.min(1, sp * 0.5) * (1 - adsK * 0.7);
    px += Math.sin(this.vmBob) * 0.012 * bobA;
    py += Math.abs(Math.sin(this.vmBob * 2)) * 0.010 * bobA;

    // 开火后坐（vmKick 衰减）
    this.vmKick *= Math.pow(0.0006, dt);
    if (this.vmKick < 0.001) this.vmKick = 0;
    pz += this.vmKick * 0.10;
    var rotX = -this.vmKick * 0.5;
    var rotZ = 0;

    // 换弹动画：枪身下沉+侧倾，弹匣抽离再插回
    if (f.reloading && f.weapon && f.weapon.reload) {
      var prog = 1 - Math.max(0, f.reloadTimer) / f.weapon.reload; // 0→1
      var dip = Math.sin(prog * Math.PI);
      py -= dip * 0.20;
      rotZ += dip * 0.5;
      rotX += dip * 0.25;
      // 弹匣在 0.2~0.5 抽出、0.5~0.8 插回
      var magDrop = (prog < 0.5) ? Math.min(1, prog / 0.3) : Math.max(0, 1 - (prog - 0.5) / 0.3);
      if (vm.mag) vm.mag.position.y = vm._magY - magDrop * 0.18;
    } else if (vm.mag) {
      vm.mag.position.y = vm._magY;
    }

    vm.position.set(px, py, pz);
    vm.rotation.set(rotX, 0, rotZ);
  };

  Player.prototype._bind = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      self.keys[e.code] = true;
      if (e.code === 'KeyR') self.f.startReload();
      if (e.code === 'KeyG') { self.wantThrow = true; self.throwType = 'frag'; }
      if (e.code === 'KeyC') { self.wantThrow = true; self.throwType = 'smoke'; }
      if (e.code === 'KeyF') { self.wantThrow = true; self.throwType = 'flash'; }
      if (e.code === 'KeyV') { self.view = (self.view === 'tps') ? 'fps' : 'tps'; }
      if (e.code === 'KeyT') { self.wantInteract = true; }
      if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ControlLeft','KeyG','KeyC','KeyF','KeyV','KeyT','KeyQ','KeyE'].indexOf(e.code) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    this.canvas.addEventListener('mousedown', function (e) {
      if (!self.locked) { self.canvas.requestPointerLock(); return; }
      if (e.button === 0) self.firing = true;
      if (e.button === 2) self.ads = true;
    });
    window.addEventListener('mouseup', function (e) { if (e.button === 0) self.firing = false; if (e.button === 2) self.ads = false; });
    this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('pointerlockchange', function () {
      self.locked = (document.pointerLockElement === self.canvas);
      if (!self.locked) self.firing = false;
    });
    document.addEventListener('mousemove', function (e) {
      if (!self.locked || !self.enabled) return;
      var s = self.sens * (self.ads ? 0.5 : 1);
      self.yaw -= e.movementX * s;
      self.pitch -= e.movementY * s;
      self.pitch = Math.max(-0.9, Math.min(0.55, self.pitch));
    });
  };

  Player.prototype.aimForward = function (out) {
    var cp = Math.cos(this.pitch), y = this.yaw;
    out.set(Math.sin(y) * cp, Math.sin(this.pitch), Math.cos(y) * cp).normalize();
    return out;
  };

  Player.prototype.update = function (dt, world) {
    var f = this.f;
    // 换弹音效（起手触发一次；狙击/精确射手加拴动声）
    if (f.reloading && !this._wasReloading && world.audio) {
      world.audio.reload && world.audio.reload();
      var cat = f.weapon && f.weapon.category;
      if ((cat === 'sniper' || cat === 'marksman') && world.audio.bolt) world.audio.bolt();
    }
    this._wasReloading = f.reloading;
    // 开镜/退镜咔哒
    if (this.ads !== this._wasAds) {
      if (world.audio) { if (this.ads) world.audio.adsIn && world.audio.adsIn(); else world.audio.adsOut && world.audio.adsOut(); }
      this._wasAds = this.ads;
    }
    if (!f.alive || !this.enabled) { if (this.vehicle) this._toggleVehicle(world); this._updateCamera(dt); return; }
    // 载具交互（T 上/下车）与驾驶
    if (this.wantInteract) { this.wantInteract = false; this._toggleVehicle(world); }
    if (this.vehicle) { this._driveVehicle(dt, world); return; }
    var k = this.keys;
    // 移动方向（相对相机水平朝向）
    var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    var rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    var mx = 0, mz = 0;
    if (k['KeyW']) { mx += fx; mz += fz; }
    if (k['KeyS']) { mx -= fx; mz -= fz; }
    if (k['KeyD']) { mx -= rx; mz -= rz; } // 屏幕向右
    if (k['KeyA']) { mx += rx; mz += rz; } // 屏幕向左
    // 触屏摇杆（激活时覆盖 WASD）：jx=屏幕右, jy=屏幕前，幅度即模拟速度
    var tmag = 1;
    if (this.touch && this.touch.moveActive) {
      var jx = this.touch.moveX, jy = this.touch.moveY;
      mx = fx * jy - rx * jx;
      mz = fz * jy - rz * jx;
      tmag = Math.min(1, Math.hypot(jx, jy));
    }
    var len = Math.hypot(mx, mz);
    // 卧倒（按住 Ctrl，需在地面）
    this.prone = !!k['ControlLeft'] && this.grounded;
    this._proneT += ((this.prone ? 1 : 0) - this._proneT) * Math.min(1, dt * 9);
    var sprint = k['ShiftLeft'] && len > 0 && !this.ads && !this.prone && this.grounded;
    this._sprinting = sprint;
    var base = DF.CONFIG.agent.walkSpeed / 26;
    var speed = sprint ? base * 1.7 : (this.prone ? base * 0.34 : base);
    speed *= tmag; // 触屏摇杆模拟量（键盘恒为 1）
    if (len > 0.01) {
      mx /= len; mz /= len;
      var moved = f.moveBy(mx * speed * dt, mz * speed * dt, world, dt);
      f._moveSpeed = moved / dt;
      // 脚步声（按位移节流；卧倒/空中不响）
      this.stepAcc += moved;
      var stride = sprint ? 1.5 : 2.0;
      if (this.stepAcc > stride) { this.stepAcc = 0; if (this.grounded && !this.prone && world.audio && world.audio.footstep) world.audio.footstep(); }
    }
    f.yaw = this.yaw;

    // 垂直：楼层/楼梯支撑 + 跳跃 + 重力（真实 pos.y，支持上二楼与跳窗）
    var stepUp = 0.66;
    var sh = world.supportHeight ? world.supportHeight : function () { return 0; };
    if (this.velY == null) this.velY = 0;
    if (this.grounded) {
      var sup = sh(f.pos.x, f.pos.z, f.pos.y + stepUp);
      if (sup > f.pos.y - 0.6) f.pos.y = sup;        // 站稳/上小台阶
      else { this.grounded = false; this.velY = 0; } // 走出边缘 → 坠落
      if (this.grounded && k['Space'] && !this.prone && !this._jumpLatch) {
        this.velY = 6.6; this.grounded = false; this._jumpLatch = true;
        if (world.audio && world.audio.whoosh) world.audio.whoosh();
      }
    }
    if (!k['Space']) this._jumpLatch = false;
    if (!this.grounded) {
      var prevY = f.pos.y;
      this.velY -= 20 * dt; f.pos.y += this.velY * dt;
      // 关键：用“下落前的高度”查询支撑，避免一帧越过薄楼板导致穿模坠楼（上二/三楼跳跃时）
      var land = sh(f.pos.x, f.pos.z, Math.max(prevY, f.pos.y) + 0.1);
      if (this.velY <= 0 && f.pos.y <= land) { f.pos.y = land; this.velY = 0; this.grounded = true; if (world.audio && world.audio.footstep) world.audio.footstep(); }
      if (f.pos.y < -6) { f.pos.y = 0; this.velY = 0; this.grounded = true; } // 安全兜底
    }
    // 姿态偏移传给模型（entity.update 使用）；airY 已并入 pos.y
    this.airY = 0; f.airY = 0;
    f.stanceY = -this._proneT * 0.35;

    // 投掷手雷（G 破片 / C 烟雾 / F 闪光）
    if (this.wantThrow) {
      this.wantThrow = false;
      var thrown = f.throwGrenade(world, this.aimForward(new THREE.Vector3()), this.throwType);
      if (thrown && world.audio && world.audio.whoosh) world.audio.whoosh();
    }

    // 开火（自动/半自动）
    if (this.firing) {
      var w = f.weapon;
      if (f.canFire()) {
        var origin = this._camPos.clone();
        var dir = this.aimForward(new THREE.Vector3());
        // 冲刺时散布加大
        if (sprint) { dir.x += (Math.random()*2-1)*0.03; dir.z += (Math.random()*2-1)*0.03; dir.normalize(); }
        var res = f.fire(origin, dir, world, this.ads ? 0 : (this.prone ? 0.5 : 1)); // ADS 打哪准哪 / 卧倒更稳
        this.vmKick = Math.min(1.4, this.vmKick + 0.7); // 视模型后坐
        // 逐武器后坐力：垂直踢 + 水平摆，ADS 明显更稳，连发递增
        var rc = RECOIL[w.category] || RECOIL.ar;
        var adsF = this.ads ? 0.34 : 1;
        this.recoil = Math.min(1, this.recoil + 0.12);
        var vk = rc.v * adsF * (1 + this.recoil * 0.5);
        this.pitch = Math.min(0.55, this.pitch + vk);
        this.recoilRecover += vk * 0.72; // 大部分后坐可自动回复
        this.yaw += (Math.random() * 2 - 1) * rc.h * adsF;
        if (world.addShake) world.addShake(rc.v * 0.6 * adsF);
        if (res && world.onPlayerHit) world.onPlayerHit(res);
      }
      if (!w.auto) this.firing = false; // 半自动：一次点击一发
    }
    this.recoil *= Math.pow(0.02, dt);
    // 后坐平滑回复：停火时较快归位，持续射击时缓慢归位（枪口稳定）
    if (this.recoilRecover > 0.00005) {
      var rate = this.firing ? 2.2 : 9.0;
      var give = Math.min(this.recoilRecover, this.recoilRecover * rate * dt);
      this.pitch -= give; this.recoilRecover -= give;
    }
    // 探头（Q 左 / E 右）：冲刺时不探头
    var leanT = ((k['KeyQ'] ? -1 : 0) + (k['KeyE'] ? 1 : 0));
    if (sprint) leanT = 0;
    this.leanAmt += (leanT - this.leanAmt) * Math.min(1, dt * 12);

    this._updateCamera(dt);
  };

  // 逐武器瞄准镜倍率
  Player.prototype._adsFov = function () {
    return (DF.weaponAdsFov) ? DF.weaponAdsFov(this.f.weapon) : 46;
  };

  Player.prototype._updateCamera = function (dt) {
    var f = this.f;
    // 跳跃升高 / 卧倒压低
    var stance = (this.airY || 0) - (this._proneT || 0) * 1.05;
    var head = new THREE.Vector3(f.pos.x, f.pos.y + 1.6 + stance, f.pos.z);
    var fwd = this.aimForward(this._fwd);
    var fps = this.view === 'fps';

    // FOV：瞄准变焦(逐武器) / 冲刺拉伸 / 击杀变焦冲击
    if (this.fovKick > 0.01) this.fovKick *= Math.pow(0.005, dt); else this.fovKick = 0;
    var targetFov = (this.ads ? this._adsFov() : (this._sprinting ? this.baseFov + 8 : this.baseFov)) - this.fovKick;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }

    // 自身模型可见性：FPS 隐藏(避免遮挡)，TPS 显示
    if (f.alive && this.enabled) f.char.body.visible = !fps; else f.char.body.visible = true;

    if (fps) {
      // 第一人称：相机在眼位，沿瞄准方向看
      var eye = new THREE.Vector3(f.pos.x, f.pos.y + 1.62 + stance, f.pos.z);
      this._camPos.copy(eye).addScaledVector(fwd, 0.12);
      // 探头：相机与射击原点沿右向侧移（可从掩体侧探身射击）
      if (Math.abs(this.leanAmt) > 0.001) {
        var rX = Math.cos(this.yaw), rZ = -Math.sin(this.yaw);
        this._camPos.x += rX * this.leanAmt * 0.6; this._camPos.z += rZ * this.leanAmt * 0.6;
        this._camPos.y -= Math.abs(this.leanAmt) * 0.06;
      }
      this.camera.position.lerp(this._camPos, 1 - Math.pow(0.00001, dt));
      // 关键：从(已探头偏移的)相机位置沿瞄准方向看，使屏幕中心=瞄准方向，探头时“打哪准哪”不偏
      this._look.copy(this._camPos).addScaledVector(fwd, 10);
      this.camera.lookAt(this._look);
      if (this.camera.rotation) this.camera.rotation.z -= this.leanAmt * 0.16; // 侧倾（仅视觉，不影响弹道）
      this._updateViewmodel(dt, true);
      return;
    }
    this._updateViewmodel(dt, false);

    // 第三人称越肩
    var rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    var dist = this.ads ? 2.0 : (this._sprinting ? 3.7 : 3.4);
    var shoulder = this.ads ? 0.4 : 0.7, up = 0.35;
    // 探头侧移：同时加到相机位与注视点，保证相机前向仍=瞄准方向（弹道与准星一致）
    var lx = rightX * this.leanAmt * 0.5, lz = rightZ * this.leanAmt * 0.5;
    this._camPos.set(
      head.x + rightX * shoulder - fwd.x * dist + lx,
      head.y + up - fwd.y * dist,
      head.z + rightZ * shoulder - fwd.z * dist + lz
    );
    if (this._camPos.y < 0.6) this._camPos.y = 0.6;
    this.camera.position.lerp(this._camPos, 1 - Math.pow(0.0001, dt));
    this._look.set(head.x + rightX*shoulder + fwd.x*8 + lx, head.y + up + fwd.y*8, head.z + rightZ*shoulder + fwd.z*8 + lz);
    this.camera.lookAt(this._look);
    if (Math.abs(this.leanAmt) > 0.001 && this.camera.rotation) this.camera.rotation.z -= this.leanAmt * 0.1; // 侧倾（仅视觉）
  };

  // —— 载具：上/下车 ——
  Player.prototype._toggleVehicle = function (world) {
    if (this.vehicle) {
      var v = this.vehicle; v.dismount(); this.vehicle = null;
      // 落到车体右侧地面
      this.f.pos.x = v.pos.x + Math.cos(v.angle) * 3.0;
      this.f.pos.z = v.pos.z - Math.sin(v.angle) * 3.0;
      this.f._moveSpeed = 0;
      if (world.audio && world.audio.adsOut) world.audio.adsOut();
      return;
    }
    var vs = world.vehicles; if (!vs || !vs.length) return;
    var best = null, bd = 4.4;
    for (var i = 0; i < vs.length; i++) {
      var v2 = vs[i]; if (v2.occupant || v2.alive === false) continue;
      var d = this.f.pos.distanceTo(v2.pos); if (d < bd) { bd = d; best = v2; }
    }
    if (best) { best.mount(this.f); this.vehicle = best; if (world.audio && world.audio.buy) world.audio.buy(); }
  };

  // —— 载具：驾驶（坦克/摩托车）——
  Player.prototype._driveVehicle = function (dt, world) {
    var v = this.vehicle, k = this.keys, f = this.f;
    if (!v.alive) { this._ejectVehicle(world); return; } // 被摧毁 → 弹出
    var forward = (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0);
    var turn = (k['KeyA'] ? 1 : 0) - (k['KeyD'] ? 1 : 0);
    if (v.drive) v.drive(forward, turn, dt, world);
    if (v.update) v.update(dt);
    var isBike = v.kind === 'bike';
    f.pos.x = v.pos.x; f.pos.z = v.pos.z; f.pos.y = 0; f.yaw = v.angle;
    f._moveSpeed = Math.abs(forward) * (isBike ? 5 : 3);
    if (isBike) {
      // 摩托：骑手可见(可被击中)，用手中武器前射
      if (f.char && f.char.body) f.char.body.visible = true;
      if (this.vm) this.vm.visible = false;
      if (this.firing && f.canFire()) {
        var origin = new THREE.Vector3(f.pos.x, 1.4, f.pos.z);
        var dir = this.aimForward(new THREE.Vector3());
        var res = f.fire(origin, dir, world, 0.7);
        if (res && world.onPlayerHit) world.onPlayerHit(res);
        if (!f.weapon.auto) this.firing = false;
      }
    } else {
      // 坦克：隐藏自身，炮塔随鼠标，炮弹飞向准星
      v.turret = this.yaw;
      if (f.char && f.char.body) f.char.body.visible = false;
      if (this.vm) this.vm.visible = false;
      if (this.firing && v.fire) { if (v.fire(this._vehicleAimPoint(world), world)) this.recoil = Math.min(1, this.recoil + 0.3); }
    }
    this._updateVehicleCamera(dt);
  };

  // 从相机中心射线求准星命中点（保证坦克炮弹落在准星处）
  Player.prototype._vehicleAimPoint = function (world) {
    var v = this.vehicle;
    var s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    var camPos = new THREE.Vector3(v.pos.x - s * 8.6, 4.8, v.pos.z - c * 8.6);
    var lookT = new THREE.Vector3(v.pos.x + s * 8, 1.6 + Math.sin(this.pitch) * 5, v.pos.z + c * 8);
    var dir = lookT.sub(camPos).normalize();
    world.raycaster.set(camPos, dir); world.raycaster.far = 300;
    var hits = world.raycaster.intersectObjects(world.solids, false);
    if (hits.length) return hits[0].point;
    if (dir.y < -0.01) { var t = -camPos.y / dir.y; if (t > 0) return camPos.addScaledVector(dir, t); }
    return camPos.addScaledVector(dir, 130);
  };

  Player.prototype._ejectVehicle = function (world) {
    var v = this.vehicle; this.vehicle = null;
    if (v) { if (v.occupant === this.f) v.occupant = null; this.f.pos.x = v.pos.x + Math.cos(v.angle) * 3.5; this.f.pos.z = v.pos.z - Math.sin(v.angle) * 3.5; }
    this.f.inVehicle = null; this.f._moveSpeed = 0;
    if (world.audio && world.audio.hurt) world.audio.hurt();
  };

  Player.prototype._updateVehicleCamera = function (dt) {
    var v = this.vehicle, bike = v.kind === 'bike';
    var s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    var dist = bike ? 6.0 : 8.6, up = bike ? 3.2 : 4.8;
    this._camPos.set(v.pos.x - s * dist, up, v.pos.z - c * dist);
    if (this._camPos.y < 1.0) this._camPos.y = 1.0;
    this.camera.position.lerp(this._camPos, 1 - Math.pow(0.0006, dt));
    this._look.set(v.pos.x + s * 8, (bike ? 1.4 : 1.6) + Math.sin(this.pitch) * 5, v.pos.z + c * 8);
    this.camera.lookAt(this._look);
    if (Math.abs(this.camera.fov - this.baseFov) > 0.05) { this.camera.fov += (this.baseFov - this.camera.fov) * Math.min(1, dt * 8); this.camera.updateProjectionMatrix(); }
  };

  D3.Player = Player;
})(window.D3 = window.D3 || {});
