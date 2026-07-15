/* Game3D —— 三方乱斗主控：场景/相机/光照/回合制/胜负/每局换图
 * 赛制：三方各 3 人，单局最后存活的队伍胜；先赢 3 局的队伍夺冠。
 */
(function (D3) {
  'use strict';

  var TEAMS = ['alpha','bravo','charlie'];
  var ROUNDS_TO_WIN = 3;
  var ROUND_TIME = 90;

  function Game3D(canvas, hudRoot) {
    this.canvas = canvas;
    this.hudRoot = hudRoot;
    this.audio = new DF.Audio();
    // 运行期扩展音效（不改动原版 src/ 文件）
    var A = this.audio;
    A.footstep = function () { if (this.ensure) this.ensure(); this._blip(80 + Math.random() * 30, 0.05, 'sine', 0.05, 0.7); };
    A.explosion = function () { if (this.ensure) this.ensure(); this._noise(0.5, 0.55, 780); this._noise(0.18, 0.45, 3200); this._blip(58, 0.5, 'sawtooth', 0.42, 0.28); this._blip(150, 0.24, 'square', 0.22, 0.5); };
    A.whoosh = function () { this._noise(0.16, 0.16, 2800); };
    A.whistle = function () { var s = this; [720, 960, 1180].forEach(function (f, i) { setTimeout(function () { s._blip(f, 0.12, 'triangle', 0.18); }, i * 85); }); };
    A.heartbeat = function () { this._blip(58, 0.16, 'sine', 0.32, 0.7); };
    // 更饱满的分层枪声：初炸(高频脆响) + 枪身(低频冲击) + 机械回声 + 尾音
    A.shot = function (category) {
      if (this.ensure) this.ensure(); if (!this.ctx) return;
      var tone = (DF.WEAPON_TONE && DF.WEAPON_TONE[category]) || 220;
      var boom = category === 'sniper' ? 1.35 : (category === 'shotgun' ? 1.5 : (category === 'lmg' ? 1.2 : 1));
      this._noise(0.045, 0.34 * boom, 5200);           // 初炸脆响
      this._noise(0.14 * boom, 0.30 * boom, 1100 + tone); // 枪身冲击
      this._blip(tone, 0.06, 'sawtooth', 0.14, 0.4);   // 基频
      this._blip(tone * 0.5, 0.10 * boom, 'square', 0.10 * boom, 0.5); // 低频体感
      if (category === 'sniper') this._blip(tone * 2.2, 0.03, 'square', 0.08); // 高频破音
    };
    // 开镜/退镜咔哒
    A.adsIn = function () { this._blip(520, 0.03, 'sine', 0.10); this._blip(760, 0.04, 'sine', 0.08); };
    A.adsOut = function () { this._blip(680, 0.03, 'sine', 0.08); this._blip(430, 0.035, 'sine', 0.07); };
    // 拴动/上膛（狙击换弹配合）
    A.bolt = function () { var s = this; this._noise(0.05, 0.12, 3000); setTimeout(function () { s._noise(0.05, 0.14, 2400); }, 120); };
    // 子弹擦过
    A.whiz = function () { this._noise(0.05, 0.10, 3600); this._blip(1400 + Math.random() * 400, 0.05, 'sine', 0.05, 0.5); };
    A.error = function () { this._blip(180, 0.09, 'square', 0.14, 0.7); };
    // 环境风声/雨声循环（随天气；极轻柔，营造氛围）
    A.startAmbient = function (kind, intensity) {
      if (this.ensure) this.ensure(); if (!this.ctx) return;
      this.stopAmbient();
      var t = this.ctx.currentTime, sr = this.ctx.sampleRate;
      var len = Math.floor(sr * 2), buf = this.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      var f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.value = kind === 'rain' ? 2600 : (kind === 'snow' ? 480 : (kind === 'ember' ? 340 : 620));
      var g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(intensity || 0.03, t + 2.5);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
      this._amb = { src: src, g: g };
    };
    A.stopAmbient = function () {
      if (!this._amb) return;
      try { var t = this.ctx ? this.ctx.currentTime : 0; this._amb.g.gain.cancelScheduledValues(t); this._amb.g.gain.setValueAtTime(this._amb.g.gain.value, t); this._amb.g.gain.linearRampToValueAtTime(0.0001, t + 0.3); this._amb.src.stop(t + 0.35); } catch (e) {}
      this._amb = null;
    };
    // 背景音乐（程序化：低频 pad + 缓慢滤波 + 军事感琶音循环）
    A.startMusic = function () {
      if (this.ensure) this.ensure(); if (!this.ctx || this._music) return;
      var ctx = this.ctx, t = ctx.currentTime;
      var out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(0.7, t + 3); out.connect(this.master);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(out);
      var padGain = ctx.createGain(); padGain.gain.value = 0.06; padGain.connect(lp);
      var oscs = []; [110, 164.81, 220].forEach(function (f) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; if (o.detune) o.detune.value = (Math.random() * 10 - 5); o.connect(padGain); o.start(t); oscs.push(o); });
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; var lg = ctx.createGain(); lg.gain.value = 320; lfo.connect(lg); if (lp.frequency) lg.connect(lp.frequency); lfo.start(t);
      var self = this, scale = [220, 261.63, 329.63, 392, 440], step = 0, timer = null;
      if (typeof setInterval === 'function') {
        timer = setInterval(function () {
          if (!self._music || !self.ctx) return;
          var n = scale[step % scale.length] * (step % 8 < 4 ? 1 : 1.5); step++;
          var tt = self.ctx.currentTime, o = self.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = n;
          var g = self.ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.05, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.34);
          o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.4);
        }, 380);
      }
      this._music = { out: out, oscs: oscs, lfo: lfo, timer: timer };
    };
    A.stopMusic = function () {
      if (!this._music) return; var m = this._music; this._music = null;
      try { var t = this.ctx.currentTime; m.out.gain.cancelScheduledValues(t); m.out.gain.linearRampToValueAtTime(0.0001, t + 0.6); m.oscs.forEach(function (o) { o.stop(t + 0.7); }); m.lfo.stop(t + 0.7); if (m.timer && typeof clearInterval === 'function') clearInterval(m.timer); } catch (e) {}
    };
    A.toggleMusic = function () { if (this._music) this.stopMusic(); else this.startMusic(); };
    this.playerKills = 0;
    this.shakeAmt = 0;
    this.grenades = [];
    this.paused = false; this.showingBoard = false; this._everLocked = false; this._hbT = 0;
    this.slowmoT = 0;
    this.settings = this._loadSettings();
    this._proj = new THREE.Vector3();

    // 渲染器
    var r = this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    if (r.outputEncoding !== undefined) r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    // 轻量色彩分级（CSS 滤镜，零成本增强卡通质感）
    if (canvas.style) canvas.style.filter = 'saturate(1.14) contrast(1.06) brightness(1.02)';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, this._aspect(), 0.1, 500);
    this.camera.position.set(0, 6, 12);
    this.scene.add(this.camera); // 使第一人称视模型(相机子节点)可渲染

    // 玩家枪口动态点光（开火瞬间照亮周边，AAA 级枪火反馈）
    this._muzzleLight = new THREE.PointLight(0xffe6a8, 0, 16, 2);
    this._muzzleLight.position.set(0, 1.6, 0);
    this.scene.add(this._muzzleLight);
    this._muzzleT = 0;

    // 光照
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x40506a, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
    this.sun.position.set(28, 46, 20); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    var sc = this.sun.shadow.camera; sc.left=-64; sc.right=64; sc.top=64; sc.bottom=-64; sc.near=1; sc.far=200;
    this.sun.shadow.bias = -0.0004;
    // 补光（对面弱方向光，卡通感更立体）
    this.fill = new THREE.DirectionalLight(0xbcd0ff, 0.35); this.fill.position.set(-24, 18, -16); this.scene.add(this.fill);
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.sky = null; this.map = null; this.mapGroup = null;
    this.fighters = [];
    this.effects = D3.Effects; this.effects.init(this.scene);

    var self0 = this;
    this.smokes = []; this.pickups = []; this.monsters = []; this.beds = []; this.vehicles = [];
    this.tram = null; this.railGroup = null;
    this.mode = 'ffa'; this.wave = 0; this.score = 0; this.resources = 0;
    this.world = {
      scene: this.scene, camera: this.camera, colliders: [], solids: [], fighters: this.fighters,
      radius: 34, effects: this.effects, audio: this.audio, raycaster: new THREE.Raycaster(),
      playerFighter: null, smokes: this.smokes, monsters: this.monsters, beds: this.beds, vehicles: this.vehicles, platforms: [],
      supportHeight: function (x, z, maxY) { return self0._supportHeight(x, z, maxY); },
      onKill: this._onKill.bind(this), onPlayerHurt: this._onPlayerHurt.bind(this), onPlayerHit: this._onPlayerHit.bind(this),
      onExplosionShake: function (a) { self0.addShake(a); },
      addShake: function (a) { self0.addShake(a); },
      spawnGrenade: function (owner, origin, dir, type) { self0.grenades.push(new D3.Grenade(owner, origin, dir, self0.world, type)); },
      spawnSmoke: function (pos) { self0._spawnSmoke(pos); },
      onFlash: function (pos, owner) { self0._onFlash(pos, owner); },
      spawnPickup: function (pos, victim) { self0._spawnPickup(pos, victim); },
      onMonsterKill: function (killer, victim) { self0._onMonsterKill(killer, victim); },
      onBedDestroyed: function (bed, killer) { self0._onBedDestroyed(bed, killer); },
      onShotFired: function (f, muzzle) { self0._onShotFired(f, muzzle); },
      explodeAt: function (pos, radius, dmg, owner) { self0._explodeAt(pos, radius, dmg, owner); }
    };

    this.wins = { alpha:0, bravo:0, charlie:0 };
    this.round = 0;
    this.phase = 'init';
    this.phaseTimer = 0;
    this.roundTimer = ROUND_TIME;
    this.spectate = false;
    this.playerFighter = null;
    this.player = null;
    this._last = 0;
    this._specAng = 0;

    D3.HUD.init(hudRoot);
    var self = this;
    window.addEventListener('resize', function () { self._resize(); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Enter' && self.phase === 'matchend') self.resetMatch();
      if (e.code === 'KeyM') { self.audio.toggleMusic && self.audio.toggleMusic(); }
      if (e.code === 'Tab') { e.preventDefault(); if (!self.showingBoard) { self.showingBoard = true; self._refreshScoreboard(); } }
      // 起床之战：B 开关商店 / 数字键购买
      if (self.mode === 'bed') {
        if (e.code === 'KeyB') { e.preventDefault(); self.toggleShop(); return; }
        if (self.phase === 'live' && self._shopOpen && /^Digit[1-6]$/.test(e.code)) { self.buyWeapon(parseInt(e.code.slice(5), 10) - 1); return; }
      }
      // 赛前选武器（FFA / 海岛）：数字键 1-9 选前 9 把，字母键 A-Z 选其余（数字不够用字母）
      if ((self.mode === 'ffa' || self.mode === 'island' || self.mode === 'tower') && self.phase === 'countdown') {
        var idx = -1, dm = /^Digit([1-9])$/.exec(e.code), lm = /^Key([A-Z])$/.exec(e.code);
        if (dm) idx = parseInt(dm[1], 10) - 1;
        else if (lm) idx = 9 + (lm[1].charCodeAt(0) - 65);
        if (idx >= 0 && idx < self.WEAPON_CHOICES.length) { self.pickWeapon(idx); e.preventDefault(); }
      }
    });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Tab') { self.showingBoard = false; D3.HUD.hideScoreboard(); }
    });
    document.addEventListener('pointerlockchange', function () {
      var locked = (document.pointerLockElement === self.canvas);
      if (locked) { self._everLocked = true; if (self.paused) self._resume(); }
      else if (self._everLocked && !self.paused && self.phase !== 'matchend') self._pause();
    });

    this.composer = null;
    this._initPostFX();
  }

  // 后期处理管线：Bloom 泛光 + FXAA 抗锯齿 + 伽马校正（失败则回退直渲染）
  Game3D.prototype._initPostFX = function () {
    try {
      if (typeof THREE.EffectComposer !== 'function' || typeof THREE.UnrealBloomPass !== 'function' || typeof THREE.RenderPass !== 'function') return;
      var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
      var comp = new THREE.EffectComposer(this.renderer);
      comp.addPass(new THREE.RenderPass(this.scene, this.camera));
      var bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.6, 0.86); // strength, radius, threshold(高阈值避免过曝)
      comp.addPass(bloom); this.bloom = bloom;
      if (THREE.ShaderPass && THREE.FXAAShader) {
        var fxaa = new THREE.ShaderPass(THREE.FXAAShader);
        fxaa.material.uniforms['resolution'].value.set(1 / w, 1 / h);
        comp.addPass(fxaa); this.fxaa = fxaa;
      }
      if (THREE.ShaderPass && THREE.GammaCorrectionShader) {
        var gamma = new THREE.ShaderPass(THREE.GammaCorrectionShader);
        comp.addPass(gamma);
      }
      comp.setSize(w, h);
      this.composer = comp;
    } catch (e) { this.composer = null; if (window.__report) window.__report('后期处理初始化失败(已回退): ' + e.message); }
  };

  Game3D.prototype._pause = function () {
    this.paused = true;
    var self = this, p = this.player, A = this.audio;
    D3.HUD.showPause({
      sens: p ? p.sens : 0.0024, volume: this.settings.volume,
      onResume: function () { if (D3.isTouch) self._resume(); else self.canvas.requestPointerLock(); },
      onRestart: function () { self.resetMatch(); self._resume(); if (!D3.isTouch) self.canvas.requestPointerLock(); },
      onSens: function (v) { if (p) p.sens = v; self.settings.sens = v; self._saveSettings(); },
      onVolume: function (v) { self.settings.volume = v; if (A.master) A.master.gain.value = v; self._saveSettings(); }
    });
  };
  Game3D.prototype._resume = function () { this.paused = false; D3.HUD.hidePause(); };

  // 玩家赛前选武器（保留护甲, 只换主武器）；不再随机刷新，展示全部武器
  Game3D.prototype.WEAPON_CHOICES = ['mce','asval','vector','aug','awm','m250'];
  Game3D.prototype._rollWeaponChoices = function () {
    // 列出全部可选武器（近战除外），固定顺序，每局一致，不随机
    var ids = [];
    for (var id in DF.WEAPONS) {
      if (!DF.WEAPONS.hasOwnProperty(id)) continue;
      var w = DF.WEAPONS[id];
      if (!w || w.category === 'melee') continue;
      ids.push(id);
    }
    this.WEAPON_CHOICES = ids;
  };
  Game3D.prototype.pickWeapon = function (idx) {
    var ids = this.WEAPON_CHOICES; if (idx < 0 || idx >= ids.length) return;
    var pf = this.playerFighter; if (!pf) return;
    var w = DF.WEAPONS[ids[idx]]; if (!w) return;
    pf.weapon = w; pf.ammo = w.mag; pf.reserve = w.reserve;
    this._playerChoice = idx;
    this.audio.click && this.audio.click();
    this._showLoadout();
  };
  Game3D.prototype._showLoadout = function () {
    var ids = this.WEAPON_CHOICES;
    var items = ids.map(function (id) {
      var w = DF.WEAPONS[id];
      return { id: id, name: w.name, cat: w.category.toUpperCase(), dmg: w.damage, mag: w.mag, rpm: w.rpm, auto: !!w.auto };
    });
    var self = this;
    D3.HUD.showLoadout(items, this._playerChoice == null ? -1 : this._playerChoice, function (i) { self.pickWeapon(i); });
  };

  Game3D.prototype._refreshScoreboard = function () {
    var teams = {};
    ['alpha','bravo','charlie'].forEach(function (tk) { teams[tk] = { wins: 0, alive: 0, members: [] }; });
    for (var i = 0; i < this.fighters.length; i++) {
      var f = this.fighters[i], td = teams[f.team];
      td.members.push({ kills: f.kills, deaths: f.deaths, alive: f.alive, isPlayer: f.isPlayer });
      if (f.alive) td.alive++;
    }
    teams.alpha.wins = this.wins.alpha; teams.bravo.wins = this.wins.bravo; teams.charlie.wins = this.wins.charlie;
    D3.HUD.showScoreboard(teams);
  };

  Game3D.prototype._loadSettings = function () {
    var def = { sens: 0.0024, volume: 0.35 };
    try { if (typeof localStorage !== 'undefined') { var s = JSON.parse(localStorage.getItem('df3d_settings') || '{}'); if (s.sens) def.sens = s.sens; if (s.volume != null) def.volume = s.volume; } } catch (e) {}
    return def;
  };
  Game3D.prototype._saveSettings = function () {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('df3d_settings', JSON.stringify(this.settings)); } catch (e) {}
  };

  Game3D.prototype._aspect = function () { return (this.canvas.clientWidth||window.innerWidth) / (this.canvas.clientHeight||window.innerHeight); };
  Game3D.prototype._resize = function () {
    var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); if (this.fxaa) this.fxaa.material.uniforms['resolution'].value.set(1 / w, 1 / h); }
  };

  // 按回合档位随机选战备
  Game3D.prototype._pickLoadout = function (preferHigh) {
    var tiers = [1000, 1000, 2500, 4000, 6000];
    var tier = tiers[Math.min(this.round, tiers.length-1)];
    var pool = DF.LOADOUTS.filter(function (l) { return l.cost <= tier && l.primary; });
    if (!pool.length) pool = DF.LOADOUTS;
    return pool[(Math.random()*pool.length)|0];
  };

  Game3D.prototype._buildTeams = function () {
    // 队伍编制由 teamRoster/teamSize 决定；血量由 hpBase 决定
    var teamList = this.teamRoster || (this.mode === 'pve' ? ['alpha'] : TEAMS);
    var size = this.teamSize || 3, hp = this.hpBase || 100;
    for (var t = 0; t < teamList.length; t++) {
      for (var i = 0; i < size; i++) {
        var isPlayer = (teamList[t] === 'alpha' && i === 0);
        var f = new D3.Fighter(teamList[t], isPlayer);
        f.maxHealth = hp; f.health = hp;
        f.addToScene(this.scene);
        if (isPlayer) { this.playerFighter = f; this.world.playerFighter = f; this.player = new D3.Player(f, this.camera, this.canvas); }
        else { D3.AI.init(f, 0.42 + Math.random()*0.4); }
        this.fighters.push(f);
      }
    }
  };

  Game3D.prototype.start = function (mode) {
    this.mode = mode || 'ffa';
    // 队伍编制与血量（海岛=两队各5人；战斗模式提高血量，人不易速死）
    if (this.mode === 'pve') { this.teamRoster = ['alpha']; this.teamSize = 3; this.hpBase = 130; }
    else if (this.mode === 'island') { this.teamRoster = ['alpha', 'bravo']; this.teamSize = 5; this.hpBase = 160; }
    else if (this.mode === 'tower') { this.teamRoster = ['alpha', 'bravo']; this.teamSize = 10; this.hpBase = 150; }
    else if (this.mode === 'tdm') { this.teamRoster = ['alpha', 'bravo']; this.teamSize = 5; this.hpBase = 150; }
    else { this.teamRoster = TEAMS; this.teamSize = 3; this.hpBase = 140; }
    if (D3.HUD.setTeamActive) { D3.HUD.setTeamActive('charlie', this.teamRoster.indexOf('charlie') >= 0); }
    this._buildTeams();
    // 应用已保存设置
    if (this.player) this.player.sens = this.settings.sens;
    if (this.audio.master) this.audio.master.gain.value = this.settings.volume;
    if (this.audio.startMusic) this.audio.startMusic();
    if (this.mode === 'pve') { D3.HUD.setPve && D3.HUD.setPve(true); this._startPve(); }
    else if (this.mode === 'bed') { D3.HUD.setBedMode && D3.HUD.setBedMode(true); this._startBed(); }
    else if (this.mode === 'rail') { D3.HUD.setRailMode && D3.HUD.setRailMode(true); this._startRail(); }
    else if (this.mode === 'tdm') { D3.HUD.setTdmMode && D3.HUD.setTdmMode(true); this._startTdm(); }
    else this.newRound();
    var self = this;
    function loop(ts) {
      var dt = self._last ? Math.min(0.05, (ts - self._last)/1000) : 0.016;
      self._last = ts;
      self.update(dt);
      if (self.composer) self.composer.render(); else self.renderer.render(self.scene, self.camera);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  };

  Game3D.prototype.newRound = function () {
    this.round++;
    // 清理旧图 + 残留手雷
    if (this.mapGroup) { this.scene.remove(this.mapGroup); this._disposeGroup(this.mapGroup); }
    if (this.sky) this.scene.remove(this.sky);
    for (var gi = 0; gi < this.grenades.length; gi++) { if (this.grenades[gi].mesh) this.scene.remove(this.grenades[gi].mesh); }
    this.grenades.length = 0;
    for (var si = 0; si < this.smokes.length; si++) { this.scene.remove(this.smokes[si].group); this._disposeGroup(this.smokes[si].group); }
    this.smokes.length = 0;
    for (var pi = 0; pi < this.pickups.length; pi++) { this.scene.remove(this.pickups[pi].mesh); }
    this.pickups.length = 0;
    this._clearVehicles();

    // 生成新图（海岛/室内塔楼用固定图，其余每局随机）
    this.map = (this.mode === 'island' && D3.MapGen.generateIsland) ? D3.MapGen.generateIsland()
      : (this.mode === 'tower' && D3.MapGen.generateTower) ? D3.MapGen.generateTower()
      : D3.MapGen.generate();
    this.mapGroup = this.map.group; this.scene.add(this.mapGroup);
    this.world.colliders = this.map.colliders;
    this.world.solids = this.map.solids;
    this.world.platforms = this.map.platforms || [];
    this.world.radius = this.map.radius;

    // 天空 / 雾 / 光照按主题
    var th = this.map.theme;
    this.sky = D3.toon.skyDome(th.sky1, th.sky2, 340); this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogD * 0.5); // 大地图减淡雾，保证远景可见
    this.renderer.setClearColor(th.sky2, 1);
    this.hemi.intensity = th.amb;
    this.sun.color.set(th.sun);
    // 室内地图（封顶无户外）压低平行光，避免阳光灌入过曝
    this.sun.intensity = (th.sunI != null) ? th.sunI : 1.15;
    this.fill.intensity = (th.sunI != null) ? th.sunI * 0.6 : 0.35;
    this.renderer.toneMappingExposure = th.exposure || 1.02;
    this._spawnWeather(th);
    this.audio.startAmbient && this.audio.startAmbient(th.weather, th.weather === 'rain' ? 0.05 : 0.026);

    // 重生三方
    var spawns = this.map.spawns;
    for (var t = 0; t < TEAMS.length; t++) {
      var arr = spawns[TEAMS[t]], idx = 0;
      for (var f = 0; f < this.fighters.length; f++) {
        var fi = this.fighters[f];
        if (fi.team !== TEAMS[t]) continue;
        var sp = arr[idx % arr.length]; idx++;
        var lo = fi.isPlayer ? this._pickLoadout(true) : this._pickLoadout(false);
        fi.spawn(sp, lo);
        // 面向中心
        fi.yaw = Math.atan2(-sp.x, -sp.z);
      }
    }
    if (this.player) { this.player.yaw = this.playerFighter.yaw; this.player.pitch = -0.05; this.player.enabled = false; }
    this.spectate = false;
    if (this.mode === 'island') this._spawnIslandVehicles();

    this.roundTimer = ROUND_TIME;
    this.phase = 'countdown';
    this.phaseTimer = 15; // 选枪阶段 15 秒后开始比赛
    this.playerKills = 0; D3.HUD.setKills(0);
    this._playerChoice = null;
    this._rollWeaponChoices(); // 展示全部武器（不随机）
    D3.HUD.setLow(false);
    D3.HUD.hideBanner();
    D3.HUD.showBanner('第 ' + this.round + ' 局', '战场：' + this.map.themeName, '#8fd0ff');
    setTimeout(function () { if (self.phase === 'countdown') D3.HUD.hideBanner(); }, 1800); // 选枪期间横幅短暂显示后隐去，避免遮挡表格
    this._showLoadout();
    if (this.audio.whistle) this.audio.whistle();
    this._updateHUDTeams();
  };

  Game3D.prototype._aliveByTeam = function () {
    var a = { alpha:0, bravo:0, charlie:0 };
    for (var i = 0; i < this.fighters.length; i++) if (this.fighters[i].alive) a[this.fighters[i].team]++;
    return a;
  };

  Game3D.prototype._updateHUDTeams = function () {
    D3.HUD.setTeams(this._aliveByTeam(), this.wins, ROUNDS_TO_WIN);
  };

  Game3D.prototype._onKill = function (killer, victim) {
    D3.HUD.kill(killer ? killer.team : victim.team, killer ? killer.name : '战场', victim.team, victim.name, false);
    // 阵亡掉落
    if (Math.random() < 0.6) this._spawnPickup(victim.pos, victim);
    if (killer && killer === this.playerFighter) {
      this.playerKills++; D3.HUD.setKills(this.playerKills); D3.HUD.killPopup(victim.name);
      this.audio.buy();
      this.slowmoT = 0.13; if (this.player) this.player.fovKick = 6; this.addShake(0.08); // 击杀慢镜+变焦
    }
    if (victim.isPlayer) { this.spectate = true; if (this.player) this.player.enabled = false; }
    // 起床之战：击杀给资源，阵亡者起复活计时（床存活才会复活）
    if (this.mode === 'bed') {
      victim._respawnTimer = this.BED_RESPAWN;
      if (killer && killer === this.playerFighter) { this._addResources(60); }
    }
    // 团队竞技：击杀累计队伍分数，阵亡者定时重生
    if (this.mode === 'tdm') {
      victim._respawnTimer = this.TDM_RESPAWN;
      if (killer && killer.team && killer !== victim && killer.team !== victim.team) {
        this.tdmScore[killer.team] = (this.tdmScore[killer.team] || 0) + 1;
      }
    }
    this._updateHUDTeams();
  };
  Game3D.prototype._onPlayerHurt = function (dealt, headshot, attackerPos) {
    this.audio.hurt();
    this.addShake(0.12 + Math.min(0.2, dealt / 120));
    var angle = null;
    if (attackerPos && this.player) {
      var dx = attackerPos.x - this.playerFighter.pos.x, dz = attackerPos.z - this.playerFighter.pos.z;
      var toAtk = Math.atan2(dx, dz);           // 世界系: 攻击者方位
      angle = toAtk - this.player.yaw;           // 相对玩家朝向
    }
    D3.HUD.hurt(angle);
  };
  Game3D.prototype._onPlayerHit = function (res) {
    if (!res) return;
    D3.HUD.hitMarker(res.killed);
    // 浮动伤害数字（把命中点投影到屏幕）
    if (res.point && res.dealt > 0) {
      var sc = this._toScreen(res.point);
      if (sc) D3.HUD.dmgNumber(sc.x, sc.y, res.dealt, res.headshot);
    }
  };

  // 世界坐标 -> 屏幕像素（桩环境无 project 时返回 null）
  Game3D.prototype._toScreen = function (v) {
    if (typeof v.project !== 'function') return null;
    this._proj.copy(v).project(this.camera);
    var w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    if (this._proj.z > 1) return null;
    return { x: (this._proj.x * 0.5 + 0.5) * w, y: (-this._proj.y * 0.5 + 0.5) * h };
  };

  // 支撑高度：给定 (x,z) 与允许的最高台面 maxY，返回脚下最高可站立面（含斜坡楼梯），无则地面 0
  Game3D.prototype._supportHeight = function (x, z, maxY) {
    var best = (maxY >= -0.05) ? 0 : -1e9;
    var ps = this.world.platforms; if (!ps) return best;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      var top;
      if (p.ramp) {
        var tv = p.axis === 'x' ? (x - p.minX) / (p.maxX - p.minX) : (z - p.minZ) / (p.maxZ - p.minZ);
        if (p.dir === -1) tv = 1 - tv;
        tv = Math.max(0, Math.min(1, tv));
        top = p.y0 + (p.y1 - p.y0) * tv;
      } else top = p.y;
      if (top <= maxY + 0.02 && top > best) best = top;
    }
    return best;
  };

  Game3D.prototype.addShake = function (a) { this.shakeAmt = Math.min(0.5, this.shakeAmt + a); };

  // 玩家开火：枪口点光脉冲
  Game3D.prototype._onShotFired = function (f, muzzle) {
    if (f !== this.playerFighter || !muzzle || !this._muzzleLight) return;
    this._muzzleLight.position.set(muzzle.x, muzzle.y, muzzle.z);
    this._muzzleLight.intensity = 2.6;
    this._muzzleT = 0.05;
    if (this.effects && this.effects.burst) this.effects.burst(muzzle, 0xffd27a, 3, 1.1, 2);
  };
  Game3D.prototype._updateMuzzleLight = function (dt) {
    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      this._muzzleLight.intensity = this._muzzleT > 0 ? 2.6 * (this._muzzleT / 0.05) : 0;
    }
  };

  // 通用范围爆炸伤害（坦克炮/后续武器复用）
  Game3D.prototype._explodeAt = function (pos, radius, dmg, owner) {
    var targets = this.fighters.concat(this.monsters || []).concat(this.beds || []).concat(this.vehicles || []);
    for (var i = 0; i < targets.length; i++) {
      var v = targets[i]; if (!v.alive) continue;
      if (owner && v === owner.inVehicle) continue; // 不炸自己所乘坦克
      if (owner && owner.team && v.team === owner.team && v !== owner) continue; // 不误伤己方(含己方床)
      var dist = v.pos.distanceTo(pos); if (dist > radius) continue;
      var falloff = 1 - dist / radius;
      var res = DF.combat.resolveDamage({
        baseDamage: dmg * falloff, headshot: false, distance: 0, range: 999,
        health: v.health, vestDur: v.vestDur, helmetDur: v.helmetDur,
        cfg: DF.CONFIG.combat, category: 'ar'
      });
      v.health = res.health; v.vestDur = res.vestDur; v.helmetDur = res.helmetDur; v._updatePlate();
      if (v.isPlayer && this.world.onPlayerHurt) this.world.onPlayerHurt(res.dealt, false, owner ? owner.pos : null);
      if (res.killed && v.alive) { if (owner && owner !== v) owner.kills++; v.die(this.world, owner); }
    }
    if (this.playerFighter && this.playerFighter.pos.distanceTo(pos) < radius * 1.5) this.addShake(0.3);
  };

  Game3D.prototype._applyShake = function (dt) {
    if (this.shakeAmt <= 0.0001 || this.spectate) { this.shakeAmt = Math.max(0, this.shakeAmt - dt); return; }
    var s = this.shakeAmt;
    // 开镜瞄准时大幅抑制机位抖动，保证瞄准镜视野稳定（不让枪械振动影响视野）
    var k = (this.player && this.player.ads) ? 0.06 : 0.5;
    this.camera.position.x += (Math.random() * 2 - 1) * s * k;
    this.camera.position.y += (Math.random() * 2 - 1) * s * k;
    this.camera.position.z += (Math.random() * 2 - 1) * s * k;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
  };

  Game3D.prototype._drawMinimap = function () {
    if (D3.HUD.drawMinimap) D3.HUD.drawMinimap(this.fighters, this.playerFighter, this.world.radius);
  };

  // —— 天气粒子（雪/尘/雨/火星）——
  Game3D.prototype._spawnWeather = function (th) {
    if (this.weather) { this.scene.remove(this.weather.points); this.weather = null; }
    if (!th.weather || th.weather === 'none') return;
    if (typeof THREE.Points !== 'function' || typeof THREE.BufferGeometry !== 'function') return;
    var kind = th.weather;
    var N = kind === 'rain' ? 900 : (kind === 'snow' ? 600 : 380);
    var R = this.world.radius + 4, H = 34;
    var pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i*3] = (Math.random()*2-1)*R; pos[i*3+1] = Math.random()*H; pos[i*3+2] = (Math.random()*2-1)*R;
      if (kind === 'rain') { vel[i*3]=0.5; vel[i*3+1]=-28-Math.random()*8; vel[i*3+2]=0.5; }
      else if (kind === 'snow') { vel[i*3]=(Math.random()*2-1)*0.8; vel[i*3+1]=-1.4-Math.random()*1.2; vel[i*3+2]=(Math.random()*2-1)*0.8; }
      else if (kind === 'ember') { vel[i*3]=(Math.random()*2-1)*0.5; vel[i*3+1]=0.8+Math.random()*1.2; vel[i*3+2]=(Math.random()*2-1)*0.5; }
      else { vel[i*3]=(Math.random()*2-1)*1.2; vel[i*3+1]=(Math.random()*2-1)*0.3; vel[i*3+2]=(Math.random()*2-1)*1.2; }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var colr = kind === 'snow' ? 0xffffff : (kind === 'rain' ? 0x9fc0e8 : (kind === 'ember' ? 0xffa648 : 0xd8c89a));
    var mat = new THREE.PointsMaterial({ color: colr, size: kind === 'rain' ? 0.5 : (kind === 'ember' ? 0.28 : 0.34), transparent: true, opacity: kind === 'rain' ? 0.5 : 0.75, depthWrite: false });
    var pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    this.scene.add(pts);
    this.weather = { points: pts, vel: vel, kind: kind, R: R, H: H, N: N };
  };
  Game3D.prototype._updateWeather = function (dt) {
    var w = this.weather; if (!w) return;
    var attr = w.points.geometry.getAttribute('position'); if (!attr) return;
    var p = attr.array, v = w.vel, R = w.R, H = w.H;
    for (var i = 0; i < w.N; i++) {
      p[i*3] += v[i*3]*dt; p[i*3+1] += v[i*3+1]*dt; p[i*3+2] += v[i*3+2]*dt;
      if (p[i*3+1] < 0) { p[i*3+1] = H; p[i*3] = (Math.random()*2-1)*R; p[i*3+2] = (Math.random()*2-1)*R; }
      else if (p[i*3+1] > H) { p[i*3+1] = 0; }
    }
    attr.needsUpdate = true;
  };

  // —— 烟雾弹 ——
  Game3D.prototype._spawnSmoke = function (pos) {
    var group = new THREE.Group(), meshes = [];
    for (var i = 0; i < 12; i++) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(1.1 + Math.random() * 0.6, 8, 8),
        new THREE.MeshToonMaterial({ color: 0xbfc6cd, transparent: true, opacity: 0.0, gradientMap: D3.toon.gradientMap(3) }));
      var a = Math.random() * Math.PI * 2, r = Math.random() * 3;
      m.position.set(Math.cos(a) * r, 0.4 + Math.random() * 1.6, Math.sin(a) * r);
      m.userData.baseY = m.position.y;
      group.add(m); meshes.push(m);
    }
    group.position.copy(pos); group.position.y = 0; this.scene.add(group);
    this.smokes.push({ group: group, meshes: meshes, pos: pos.clone(), radius: 4.6, life: 10, t: 0 });
  };
  Game3D.prototype._updateSmokes = function (dt) {
    for (var i = this.smokes.length - 1; i >= 0; i--) {
      var s = this.smokes[i]; s.t += dt; s.life -= dt;
      var grow = Math.min(1, s.t / 1.1);
      var fade = s.life < 2 ? s.life / 2 : 1;
      var op = 0.62 * fade;
      for (var j = 0; j < s.meshes.length; j++) {
        var m = s.meshes[j];
        var sc = 0.4 + grow * 1.0; m.scale.set(sc, sc, sc);
        m.material.opacity = op;
        m.position.y = m.userData.baseY + Math.sin((s.t + j) * 0.6) * 0.12;
        m.rotation.y += dt * 0.3;
      }
      // 有效遮蔽半径随成长
      s.radius = 4.6 * grow;
      if (s.life <= 0) { this.scene.remove(s.group); this._disposeGroup(s.group); this.smokes.splice(i, 1); }
    }
  };

  // —— 闪光弹 ——
  Game3D.prototype._onFlash = function (pos, owner) {
    var eye = new THREE.Vector3(pos.x, pos.y, pos.z);
    for (var i = 0; i < this.fighters.length; i++) {
      var f = this.fighters[i]; if (!f.alive) continue;
      var d = f.pos.distanceTo(pos); if (d > 18) continue;
      // 视线遮挡则免疫
      var fe = new THREE.Vector3(f.pos.x, 1.6, f.pos.z);
      var dir = new THREE.Vector3().subVectors(eye, fe); var dist = dir.length(); dir.normalize();
      this.world.raycaster.set(fe, dir); this.world.raycaster.far = dist - 0.4;
      if (this.world.raycaster.intersectObjects(this.world.solids, false).length) continue;
      // 是否面向闪光（背对减免）
      var toFlash = Math.atan2(pos.x - f.pos.x, pos.z - f.pos.z);
      var facing = Math.cos(toFlash - f.yaw); // 1=正对
      var inten = (1 - d / 18) * (0.45 + 0.55 * Math.max(0, facing));
      if (inten <= 0.05) continue;
      if (f.isPlayer) { D3.HUD.flashBlind(Math.min(1, inten * 1.3)); }
      else { f.ai.flashedT = Math.max(f.ai.flashedT || 0, 2.2 * inten); }
    }
  };

  // —— 掉落拾取 ——
  Game3D.prototype.PICKUP_COLORS = { health: 0xff5a5a, ammo: 0xffc83d, armor: 0x39C0FF };
  Game3D.prototype._spawnPickup = function (pos, victim) {
    if (this.pickups.length > 20) return;
    var types = ['health', 'ammo', 'armor'], type = types[(Math.random() * types.length) | 0];
    var mesh = D3.toon.mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), this.PICKUP_COLORS[type], { outline: 0.03, emissive: this.PICKUP_COLORS[type], emissiveIntensity: 0.2 });
    mesh.position.set(pos.x, 0.6, pos.z);
    this.scene.add(mesh);
    this.pickups.push({ mesh: mesh, pos: new THREE.Vector3(pos.x, 0.6, pos.z), type: type, t: 0 });
  };
  Game3D.prototype._updatePickups = function (dt) {
    var pf = this.playerFighter;
    for (var i = this.pickups.length - 1; i >= 0; i--) {
      var p = this.pickups[i]; p.t += dt;
      p.mesh.rotation.y += dt * 2; p.mesh.position.y = 0.6 + Math.sin(p.t * 3) * 0.12;
      if (pf && pf.alive && pf.pos.distanceTo(p.pos) < 1.4) {
        this._applyPickup(p.type);
        this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); this.pickups.splice(i, 1);
      }
    }
  };
  Game3D.prototype._applyPickup = function (type) {
    var pf = this.playerFighter; if (!pf) return;
    var msg = '';
    if (type === 'health') { pf.health = Math.min(pf.maxHealth, pf.health + 45); msg = '+45 生命'; }
    else if (type === 'ammo') { pf.reserve += pf.weapon.mag * 2; pf.ammo = pf.weapon.mag; msg = '弹药补给'; }
    else { pf.vestDur = Math.min(110, pf.vestDur + 55); msg = '+55 护甲'; }
    this.audio.buy && this.audio.buy();
    D3.HUD.toast && D3.HUD.toast(msg, '#' + this.PICKUP_COLORS[type].toString(16).padStart(6, '0'));
  };

  // 动态准星 + 手雷数 + 残血心跳 + 计分板刷新
  Game3D.prototype._updateCombatHUD = function (dt) {
    var p = this.player, pf = this.playerFighter;
    if (p && pf && pf.alive) {
      // 逐武器瞄准镜
      D3.HUD.setScope(p.ads ? (DF.weaponScope ? DF.weaponScope(pf.weapon) : 'reddot') : null);
      var spread;
      if (p.ads) spread = 2.5;
      else spread = 5 + Math.min(10, pf._moveSpeed * 1.1) + (p.firing ? 6 : 0) + (p._sprinting ? 8 : 0);
      if (p.prone) spread *= 0.6; // 卧倒更稳
      D3.HUD.setSpread(spread);
      D3.HUD.setNades(pf.nades);
      // 残血心跳
      if (pf.health < 30) { this._hbT -= dt; if (this._hbT <= 0) { this.audio.heartbeat && this.audio.heartbeat(); this._hbT = 0.75; } }
    } else { D3.HUD.setScope(false); }
    if (this.showingBoard) this._refreshScoreboard();
  };

  Game3D.prototype._checkRoundEnd = function () {
    var alive = this._aliveByTeam();
    var teamsLeft = TEAMS.filter(function (t) { return alive[t] > 0; });
    if (teamsLeft.length <= 1) {
      var winner = teamsLeft[0] || null;
      this._endRound(winner);
    }
  };

  Game3D.prototype._endRound = function (winner) {
    this.phase = 'roundend';
    this.phaseTimer = 3.6;
    if (winner) {
      this.wins[winner]++;
      var nm = D3.Fighter.TEAM_NAMES[winner];
      var isYou = winner === 'alpha';
      D3.HUD.showBanner((isYou?'🏆 ':'')+nm + ' 获胜', '本局第 '+this.round+' 局 · '+nm+' 清场', D3.Fighter.TEAM_COLORS[winner] ? '#'+D3.Fighter.TEAM_COLORS[winner].toString(16).padStart(6,'0') : '#fff');
      if (isYou) this.audio.win(); else this.audio.lose();
    } else {
      D3.HUD.showBanner('平局', '本局无人存活', '#cfe0f5');
    }
    this._updateHUDTeams();
    // 是否有队伍夺冠
    var champ = null;
    for (var i = 0; i < TEAMS.length; i++) if (this.wins[TEAMS[i]] >= ROUNDS_TO_WIN) champ = TEAMS[i];
    this._champ = champ;
  };

  Game3D.prototype._endMatch = function (champ) {
    this.phase = 'matchend';
    var nm = D3.Fighter.TEAM_NAMES[champ];
    var isYou = champ === 'alpha';
    // 统计 MVP（击杀最高）
    var mvp = null; for (var i = 0; i < this.fighters.length; i++) { if (!mvp || this.fighters[i].kills > mvp.kills) mvp = this.fighters[i]; }
    var mvpTxt = mvp ? ('MVP：' + (mvp.isPlayer ? '你' : (D3.Fighter.TEAM_NAMES[mvp.team] + ' 干员')) + ' · ' + mvp.kills + ' 击杀') : '';
    D3.HUD.showBanner((isYou?'🎉 冠军 · ':'')+nm+' 夺冠', mvpTxt + '　|　按 Enter 重开', '#'+D3.Fighter.TEAM_COLORS[champ].toString(16).padStart(6,'0'));
    if (isYou) this.audio.win(); else this.audio.lose();
  };

  Game3D.prototype.resetMatch = function () {
    if (this.mode === 'pve') { this.wave = 0; this.score = 0; this._startPve(); return; }
    if (this.mode === 'bed') { this._startBed(); return; }
    if (this.mode === 'rail') { this._startRail(); return; }
    if (this.mode === 'tdm') { this._startTdm(); return; }
    this.wins = { alpha:0, bravo:0, charlie:0 };
    this.round = 0;
    this.newRound();
  };

  // ——————————————— 起床之战 BedWars ———————————————
  Game3D.prototype.BED_RESPAWN = 5.0;   // 复活延迟(秒)
  Game3D.prototype.BED_TRICKLE = 12;    // 资源涓流(每秒)
  // 商店：id -> 资源价格
  Game3D.prototype.BED_SHOP = ['mp5','asval','mce','aug','m250','awm'];
  Game3D.prototype.BED_COST = { mp5:0, asval:180, mce:280, aug:340, m250:520, awm:700 };

  Game3D.prototype._clearBeds = function () {
    for (var i = 0; i < this.beds.length; i++) this.scene.remove(this.beds[i].root);
    this.beds.length = 0;
  };

  Game3D.prototype._spawnBeds = function () {
    this._clearBeds();
    var spawns = this.map.spawns;
    for (var t = 0; t < TEAMS.length; t++) {
      var tk = TEAMS[t], arr = spawns[tk];
      // 床放在该队出生点的形心，稍微外移到场地边缘
      var cx = 0, cz = 0; for (var i = 0; i < arr.length; i++) { cx += arr[i].x; cz += arr[i].z; }
      cx /= arr.length; cz /= arr.length;
      var bed = new D3.Bed(tk); bed.addToScene(this.scene);
      bed.place(new THREE.Vector3(cx, 0, cz), true);
      this.beds.push(bed);
    }
  };

  Game3D.prototype._bedFor = function (team) {
    for (var i = 0; i < this.beds.length; i++) if (this.beds[i].team === team) return this.beds[i];
    return null;
  };
  Game3D.prototype._bedAlive = function (team) { var b = this._bedFor(team); return !!(b && b.alive); };
  Game3D.prototype._teamAliveCount = function (team) { var n = 0; for (var i = 0; i < this.fighters.length; i++) if (this.fighters[i].team === team && this.fighters[i].alive) n++; return n; };
  // 队伍仍在局内：床未毁 或 尚有存活成员
  Game3D.prototype._teamInPlay = function (team) { return this._bedAlive(team) || this._teamAliveCount(team) > 0; };
  Game3D.prototype._teamsInPlay = function () { var self = this; return TEAMS.filter(function (t) { return self._teamInPlay(t); }); };

  Game3D.prototype._addResources = function (n) {
    this.resources = Math.max(0, this.resources + n);
    D3.HUD.setResources && D3.HUD.setResources(this.resources);
  };

  Game3D.prototype._bedStatus = function () {
    var st = {};
    for (var t = 0; t < TEAMS.length; t++) st[TEAMS[t]] = { bedAlive: this._bedAlive(TEAMS[t]), alive: this._teamAliveCount(TEAMS[t]) };
    return st;
  };
  Game3D.prototype._updateBedHUD = function () { D3.HUD.setBedStatus && D3.HUD.setBedStatus(this._bedStatus()); };

  // 商店开关 + 购买
  Game3D.prototype.toggleShop = function () {
    if (this.mode !== 'bed' || this.phase !== 'live' || !this.playerFighter || !this.playerFighter.alive) return;
    this._shopOpen = !this._shopOpen;
    if (this._shopOpen) this._showShop(); else D3.HUD.hideLoadout();
  };
  Game3D.prototype._showShop = function () {
    var self = this, cur = this.playerFighter ? this.playerFighter.weapon.id : null;
    var items = this.BED_SHOP.map(function (id) { var w = DF.WEAPONS[id]; return { id: id, name: w.name.split(' ')[0], cat: w.category.toUpperCase(), cost: self.BED_COST[id] || 0, owned: id === cur }; });
    D3.HUD.showShop(items, this.resources, function (i) { self.buyWeapon(i); });
  };
  Game3D.prototype.buyWeapon = function (idx) {
    if (this.mode !== 'bed') return;
    var id = this.BED_SHOP[idx]; if (!id) return;
    var pf = this.playerFighter; if (!pf || !pf.alive) return;
    if (pf.weapon.id === id) { D3.HUD.toast && D3.HUD.toast('已装备该武器', '#8fd0ff'); return; }
    var cost = this.BED_COST[id] || 0;
    if (this.resources < cost) { D3.HUD.toast && D3.HUD.toast('资源不足（需 ' + cost + '）', '#ff8a8a'); this.audio.error && this.audio.error(); return; }
    this._addResources(-cost);
    var w = DF.WEAPONS[id];
    pf.weapon = w; pf.ammo = w.mag; pf.reserve = w.reserve; pf.reloading = false; pf.reloadTimer = 0;
    pf._ownedWeapon = id; // 复活后沿用
    this.audio.buy && this.audio.buy();
    D3.HUD.toast && D3.HUD.toast('购买 ' + w.name.split(' ')[0], '#7CFFB0');
    if (this._shopOpen) this._showShop();
  };

  Game3D.prototype._startBed = function () {
    this.resources = 300; D3.HUD.setResources && D3.HUD.setResources(this.resources);
    this.playerKills = 0; D3.HUD.setKills(0);
    this._shopOpen = false; D3.HUD.hideLoadout();
    // 清理
    this._clearMonsters();
    for (var g = 0; g < this.grenades.length; g++) if (this.grenades[g].mesh) this.scene.remove(this.grenades[g].mesh);
    this.grenades.length = 0;
    for (var pi = 0; pi < this.pickups.length; pi++) this.scene.remove(this.pickups[pi].mesh);
    this.pickups.length = 0;
    this._genMap();
    this._spawnBeds();
    // 全员就位
    var spawns = this.map.spawns;
    for (var t = 0; t < TEAMS.length; t++) {
      var arr = spawns[TEAMS[t]], idx = 0;
      for (var f = 0; f < this.fighters.length; f++) {
        var fi = this.fighters[f]; if (fi.team !== TEAMS[t]) continue;
        var sp = arr[idx % arr.length]; idx++;
        fi._respawnTimer = null;
        fi.spawn(sp, this._bedLoadout(fi));
        fi.yaw = Math.atan2(-sp.x, -sp.z);
      }
    }
    if (this.player) { this.player.yaw = this.playerFighter.yaw; this.player.pitch = -0.05; this.player.enabled = false; }
    this.spectate = false;
    this.phase = 'countdown'; this.phaseTimer = 3.2;
    D3.HUD.setLow(false);
    D3.HUD.showBanner('起床之战', '战场：' + this.map.themeName + ' · 摧毁敌方床铺！', '#ff8a3d');
    if (this.audio.whistle) this.audio.whistle();
    this._updateBedHUD();
  };

  // 起床之战武器：玩家沿用已购买的武器，AI 随机基础武器
  Game3D.prototype._bedLoadout = function (fi) {
    var primary = fi.isPlayer ? (fi._ownedWeapon || 'mce') : ['mp5','asval','mce'][(Math.random()*3)|0];
    return { primary: primary, vest: 'tg', helmet: 'mc' };
  };

  // 阵亡成员在床存活时于本方床边复活
  Game3D.prototype._respawnAtBed = function (fi) {
    var bed = this._bedFor(fi.team);
    var base = bed ? bed.pos : new THREE.Vector3();
    var a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 1.2;
    var sp = new THREE.Vector3(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
    fi.spawn(sp, this._bedLoadout(fi));
    // 复活保留玩家当前购买的武器
    fi.yaw = Math.atan2(-sp.x, -sp.z);
    fi._respawnTimer = null;
    if (fi.isPlayer) {
      this.spectate = false;
      if (this.player) { this.player.enabled = true; this.player.yaw = fi.yaw; this.player.pitch = -0.05; }
      D3.HUD.toast && D3.HUD.toast('重生！', '#7CFFB0');
    }
  };

  Game3D.prototype._onBedDestroyed = function (bed, killer) {
    var nm = D3.Fighter.TEAM_NAMES[bed.team];
    D3.HUD.showBanner('💥 ' + nm + ' 床铺被摧毁', nm + ' 无法再复活！', '#ff5a5a');
    this._bannerT = 2.2;
    this.audio.explosion && this.audio.explosion();
    if (killer && killer === this.playerFighter) this._addResources(200);
    this._updateBedHUD();
  };

  Game3D.prototype._endBed = function (winner) {
    this.phase = 'matchend';
    if (winner) {
      var nm = D3.Fighter.TEAM_NAMES[winner], isYou = winner === 'alpha';
      D3.HUD.showBanner((isYou ? '🎉 胜利 · ' : '') + nm + ' 存活到最后', '起床之战冠军　|　按 Enter 重开', '#' + D3.Fighter.TEAM_COLORS[winner].toString(16).padStart(6, '0'));
      if (isYou) this.audio.win(); else this.audio.lose();
    } else {
      D3.HUD.showBanner('平局', '所有床铺与队伍均已覆灭　|　按 Enter 重开', '#cfe0f5');
    }
  };

  Game3D.prototype._updateBed = function (dt) {
    // 湖面等已在 update 中处理；这里管理相位
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      if (this.player) this.player._updateCamera(dt);
      for (var bi = 0; bi < this.beds.length; bi++) this.beds[bi].update(dt);
      D3.HUD.setCountdown(Math.max(1, Math.ceil(this.phaseTimer)));
      this._drawMinimap(); this._updateWeather(dt);
      if (this.phaseTimer <= 0) {
        this.phase = 'live'; D3.HUD.hideBanner(); D3.HUD.setCountdown(null);
        this.audio.whistle && this.audio.whistle(); if (this.player) this.player.enabled = true;
      }
      return;
    }
    if (this.phase === 'live') {
      // 资源涓流
      this._resTrickle = (this._resTrickle || 0) + dt;
      if (this._resTrickle >= 1) { this._resTrickle -= 1; this._addResources(this.BED_TRICKLE); }
      // AI + 玩家
      for (var i = 0; i < this.fighters.length; i++) { var f = this.fighters[i]; if (f.ai && f.alive) D3.AI.think(f, this.world, dt); }
      if (this.player) this.player.update(dt, this.world);
      for (var j = 0; j < this.fighters.length; j++) this.fighters[j].update(dt, this.world);
      for (var b = 0; b < this.beds.length; b++) this.beds[b].update(dt);
      for (var g = this.grenades.length - 1; g >= 0; g--) { this.grenades[g].update(dt); if (this.grenades[g].dead) this.grenades.splice(g, 1); }
      this._updateSmokes(dt); this._updatePickups(dt); this._updateWeather(dt);
      this.effects.update(dt); this._applyShake(dt); this._drawMinimap(); this._updateCombatHUD(dt);

      // 复活处理：床存活的阵亡者倒计时复活
      for (var r = 0; r < this.fighters.length; r++) {
        var fi = this.fighters[r];
        if (fi.alive) continue;
        if (!this._bedAlive(fi.team)) continue; // 床已毁：不复活
        if (fi._respawnTimer == null) fi._respawnTimer = this.BED_RESPAWN;
        fi._respawnTimer -= dt;
        if (fi._respawnTimer <= 0) this._respawnAtBed(fi);
      }

      this._updateBedHUD();
      if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) D3.HUD.hideBanner(); }

      // HUD 存活信息
      if (this.playerFighter.alive) {
        D3.HUD.setVitals(this.playerFighter.health, this.playerFighter.maxHealth, this.playerFighter.vestDur);
        D3.HUD.setWeapon(this.playerFighter.weapon.name, this.playerFighter.ammo, this.playerFighter.reserve, this.playerFighter.reloading);
      }
      if (this.spectate || !this.playerFighter.alive) {
        // 玩家阵亡：床存活则等待复活，床毁则观战
        if (!this._bedAlive('alpha')) this._spectateCam(dt);
      }

      // 胜负判定：仅剩一队在局内
      var left = this._teamsInPlay();
      if (left.length <= 1) { this._endBed(left[0] || null); return; }
      return;
    }
    if (this.phase === 'matchend') { this.effects.update(dt); this._spectateCam(dt); this._updateWeather(dt); for (var k = 0; k < this.beds.length; k++) this.beds[k].update(dt); }
  };


  // ——————————————— 轻轨争夺战 RailWar ———————————————
  Game3D.prototype.RAIL_RESPAWN = 5.0;
  Game3D.prototype.RAIL_TARGET = 100;   // 控制点累计目标

  Game3D.prototype._clearVehicles = function () {
    for (var i = 0; i < this.vehicles.length; i++) {
      var v = this.vehicles[i];
      // 卸载乘员，避免玩家/AI 残留 inVehicle 指向被移除的载具（跨回合“幽灵坦克”bug）
      if (v.occupant) { v.occupant.inVehicle = null; v.occupant = null; }
      this.scene.remove(v.root);
    }
    this.vehicles.length = 0;
    if (this.tram) { this.scene.remove(this.tram.root); this.tram = null; }
    if (this.railGroup) { this.scene.remove(this.railGroup); this._disposeGroup(this.railGroup); this.railGroup = null; }
    if (this.player) this.player.vehicle = null; // 玩家脱离已清除的载具，恢复常规操控/镜头
  };

  Game3D.prototype._spawnRail = function () {
    var R = this.world.radius;
    // 绕外围一圈的环形轻轨线：P 个平滑路点 + K 个停靠站
    var rr = R - 8;                 // 环线半径(留出边界余量)
    var P = 28, K = 7;              // 平滑度 / 站点数
    var path = [];
    for (var i = 0; i < P; i++) { var a = i / P * Math.PI * 2; path.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr)); }
    var stations = [];
    for (var s = 0; s < K; s++) stations.push(Math.round(s * P / K) % P);
    this.railGroup = D3.buildRailTrack(path, true);
    // 站台（放在环线内侧，朝向轨道）
    var inward = 9;
    for (var si = 0; si < stations.length; si++) {
      var p = path[stations[si]];
      var rad = Math.atan2(p.x, p.z);                       // 指向外的方位角
      var sp = new THREE.Vector3(p.x - (p.x / rr) * inward, 0, p.z - (p.z / rr) * inward);
      this.railGroup.add(D3.buildStation(sp, rad));
    }
    this.scene.add(this.railGroup);
    this.tram = new D3.RailTram(path, { speed: 11, dwell: 3.5, loop: true, stations: stations });
    this.tram.addToScene(this.scene);
    // 轻轨侧墙纳入子弹遮挡
    for (var w = 0; w < this.tram.solids.length; w++) this.world.solids.push(this.tram.solids[w]);
    // 两台可驾驶坦克（中立，先到先得）
    this.vehicles.length = 0;
    var t1 = new D3.Tank(new THREE.Vector3(-R * 0.32, 0, R * 0.30), { angle: 0.6 }); t1.addToScene(this.scene); this.vehicles.push(t1);
    var t2 = new D3.Tank(new THREE.Vector3(R * 0.32, 0, -R * 0.30), { angle: Math.PI - 0.6 }); t2.addToScene(this.scene); this.vehicles.push(t2);
  };

  // 海岛环境载具：轻轨环线 + 坦克 + 摩托车（供 FFA/海岛使用）
  Game3D.prototype._spawnIslandVehicles = function () {
    var R = this.world.radius;
    var rr = R - 10, P = 30, K = 8, path = [];
    for (var i = 0; i < P; i++) { var a = i / P * Math.PI * 2; path.push(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr)); }
    var stations = []; for (var s = 0; s < K; s++) stations.push(Math.round(s * P / K) % P);
    this.railGroup = D3.buildRailTrack(path, true);
    var inward = 9;
    for (var si = 0; si < stations.length; si++) { var p = path[stations[si]]; var rad = Math.atan2(p.x, p.z); this.railGroup.add(D3.buildStation(new THREE.Vector3(p.x - (p.x / rr) * inward, 0, p.z - (p.z / rr) * inward), rad)); }
    this.scene.add(this.railGroup);
    this.tram = new D3.RailTram(path, { speed: 12, dwell: 4, loop: true, stations: stations });
    this.tram.addToScene(this.scene);
    for (var w = 0; w < this.tram.solids.length; w++) this.world.solids.push(this.tram.solids[w]);
    this.vehicles.length = 0;
    var t1 = new D3.Tank(new THREE.Vector3(-R * 0.3, 0, R * 0.28), { angle: 0.6 }); t1.addToScene(this.scene); this.vehicles.push(t1);
    var t2 = new D3.Tank(new THREE.Vector3(R * 0.3, 0, -R * 0.28), { angle: Math.PI - 0.6 }); t2.addToScene(this.scene); this.vehicles.push(t2);
    for (var b = 0; b < 4; b++) { var ba = (b / 4) * Math.PI * 2 + 0.4, bd = R * 0.5; var bk = new D3.Motorcycle(new THREE.Vector3(Math.cos(ba) * bd, 0, Math.sin(ba) * bd), { angle: ba }); bk.addToScene(this.scene); this.vehicles.push(bk); }
  };

  Game3D.prototype._startRail = function () {
    this.railScore = { alpha: 0, bravo: 0, charlie: 0 };
    this.playerKills = 0; D3.HUD.setKills(0);
    if (this.player) this.player.vehicle = null;
    this._clearVehicles(); this._clearMonsters();
    for (var g = 0; g < this.grenades.length; g++) if (this.grenades[g].mesh) this.scene.remove(this.grenades[g].mesh);
    this.grenades.length = 0;
    for (var pi = 0; pi < this.pickups.length; pi++) this.scene.remove(this.pickups[pi].mesh);
    this.pickups.length = 0;
    this._genMap();
    this._spawnRail();
    var spawns = this.map.spawns;
    for (var t = 0; t < TEAMS.length; t++) {
      var arr = spawns[TEAMS[t]], idx = 0;
      for (var f = 0; f < this.fighters.length; f++) {
        var fi = this.fighters[f]; if (fi.team !== TEAMS[t]) continue;
        var sp = arr[idx % arr.length]; idx++;
        fi._respawnTimer = null;
        fi.spawn(sp, this._railLoadout(fi));
        fi.yaw = Math.atan2(-sp.x, -sp.z);
      }
    }
    if (this.player) { this.player.yaw = this.playerFighter.yaw; this.player.pitch = -0.05; this.player.enabled = false; }
    this.spectate = false;
    this.phase = 'countdown'; this.phaseTimer = 3.2;
    D3.HUD.setLow(false);
    D3.HUD.showBanner('轻轨争夺战', '战场：' + this.map.themeName + ' · 登车控制轻轨！(T 上/下坦克)', '#8fd0ff');
    if (this.audio.whistle) this.audio.whistle();
    this._updateRailHUD();
  };

  Game3D.prototype._railLoadout = function (fi) {
    var primary = fi.isPlayer ? (fi._ownedWeapon || 'mce') : ['mce','asval','aug','m250','vector'][(Math.random()*5)|0];
    return { primary: primary, vest: 'hmp', helmet: 'mhs' };
  };

  Game3D.prototype._respawnRail = function (fi) {
    var arr = this.map.spawns[fi.team], sp = arr[(Math.random()*arr.length)|0];
    fi.spawn(sp, this._railLoadout(fi));
    fi.yaw = Math.atan2(-sp.x, -sp.z); fi._respawnTimer = null;
    if (fi.isPlayer) {
      this.spectate = false;
      if (this.player) { this.player.enabled = true; this.player.yaw = fi.yaw; this.player.pitch = -0.05; }
      D3.HUD.toast && D3.HUD.toast('重生！', '#7CFFB0');
    }
  };

  Game3D.prototype._updateRailHUD = function () {
    if (!D3.HUD.setRailStatus) return;
    var ctrl = this.tram ? this.tram.controllingTeam(this.world) : null;
    D3.HUD.setRailStatus(this.railScore, ctrl, this.RAIL_TARGET);
  };

  Game3D.prototype._endRail = function (winner) {
    this.phase = 'matchend';
    if (winner) {
      var nm = D3.Fighter.TEAM_NAMES[winner], isYou = winner === 'alpha';
      D3.HUD.showBanner((isYou ? '🎉 胜利 · ' : '') + nm + ' 掌控轻轨', '控制点达成 ' + this.RAIL_TARGET + '　|　按 Enter 重开', '#' + D3.Fighter.TEAM_COLORS[winner].toString(16).padStart(6, '0'));
      if (isYou) this.audio.win(); else this.audio.lose();
    } else { D3.HUD.showBanner('平局', '按 Enter 重开', '#cfe0f5'); }
  };

  Game3D.prototype._updateRail = function (dt) {
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      if (this.tram) this.tram.update(dt, this.world);
      for (var vi = 0; vi < this.vehicles.length; vi++) this.vehicles[vi].update(dt);
      if (this.player) this.player._updateCamera(dt);
      D3.HUD.setCountdown(Math.max(1, Math.ceil(this.phaseTimer)));
      this._drawMinimap(); this._updateWeather(dt);
      if (this.phaseTimer <= 0) { this.phase = 'live'; D3.HUD.hideBanner(); D3.HUD.setCountdown(null); this.audio.whistle && this.audio.whistle(); if (this.player) this.player.enabled = true; }
      return;
    }
    if (this.phase === 'live') {
      // 轻轨先移动并载人，再跑单位（保证同帧网格同步）
      if (this.tram) this.tram.update(dt, this.world);
      for (var i = 0; i < this.fighters.length; i++) { var f = this.fighters[i]; if (f.ai && f.alive) D3.AI.think(f, this.world, dt); }
      if (this.player) this.player.update(dt, this.world);
      for (var j = 0; j < this.fighters.length; j++) this.fighters[j].update(dt, this.world);
      for (var vv = 0; vv < this.vehicles.length; vv++) this.vehicles[vv].update(dt);
      for (var g = this.grenades.length - 1; g >= 0; g--) { this.grenades[g].update(dt); if (this.grenades[g].dead) this.grenades.splice(g, 1); }
      this._updateSmokes(dt); this._updatePickups(dt); this._updateWeather(dt);
      this.effects.update(dt); this._applyShake(dt); this._drawMinimap(); this._updateCombatHUD(dt);

      // 控制计分（每秒结算）
      this._railT = (this._railT || 0) + dt;
      if (this._railT >= 1) {
        this._railT -= 1;
        var ct = this.tram ? this.tram.controllingTeam(this.world) : null;
        if (ct) {
          this.railScore[ct] += 3;
          this.tram.setController(ct, D3.Fighter.TEAM_COLORS[ct]);
        }
      }

      // 复活（床战式定时复活）
      for (var r = 0; r < this.fighters.length; r++) {
        var fi = this.fighters[r]; if (fi.alive) continue;
        if (this.player && this.player.vehicle && this.player.vehicle.occupant === fi) continue;
        if (fi._respawnTimer == null) fi._respawnTimer = this.RAIL_RESPAWN;
        fi._respawnTimer -= dt;
        if (fi._respawnTimer <= 0) this._respawnRail(fi);
      }

      this._updateRailHUD();
      if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) D3.HUD.hideBanner(); }
      if (this.playerFighter.alive && !(this.player && this.player.vehicle)) {
        D3.HUD.setVitals(this.playerFighter.health, this.playerFighter.maxHealth, this.playerFighter.vestDur);
        D3.HUD.setWeapon(this.playerFighter.weapon.name, this.playerFighter.ammo, this.playerFighter.reserve, this.playerFighter.reloading);
      }
      if ((this.spectate || !this.playerFighter.alive) && !(this.player && this.player.vehicle)) this._spectateCam(dt);

      // 胜负
      var win = null;
      for (var t = 0; t < TEAMS.length; t++) if (this.railScore[TEAMS[t]] >= this.RAIL_TARGET) win = TEAMS[t];
      if (win) { this._endRail(win); return; }
      return;
    }
    if (this.phase === 'matchend') { this.effects.update(dt); this._spectateCam(dt); this._updateWeather(dt); if (this.tram) this.tram.update(dt, this.world); }
  };

  // ——————————————— 团队竞技 Team Deathmatch（紧凑竞技场·持续重生·击杀达标）———————————————
  Game3D.prototype.TDM_RESPAWN = 4.0;   // 阵亡重生延迟(秒)
  Game3D.prototype.TDM_TARGET = 50;     // 击杀达标即获胜

  Game3D.prototype._genArena = function () {
    if (this.mapGroup) { this.scene.remove(this.mapGroup); this._disposeGroup(this.mapGroup); }
    if (this.sky) this.scene.remove(this.sky);
    this.map = D3.MapGen.generateArena();
    this.mapGroup = this.map.group; this.scene.add(this.mapGroup);
    this.world.colliders = this.map.colliders; this.world.solids = this.map.solids; this.world.radius = this.map.radius;
    this.world.platforms = this.map.platforms || [];
    var th = this.map.theme;
    this.sky = D3.toon.skyDome(th.sky1, th.sky2, 340); this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogD * 0.5);
    this.renderer.setClearColor(th.sky2, 1); this.hemi.intensity = th.amb; this.sun.color.set(th.sun);
    this.sun.intensity = (th.sunI != null) ? th.sunI : 1.15;
    this.fill.intensity = (th.sunI != null) ? th.sunI * 0.6 : 0.35;
    this.renderer.toneMappingExposure = th.exposure || 1.02; this._spawnWeather(th);
    this.audio.startAmbient && this.audio.startAmbient(th.weather, 0.024);
  };

  Game3D.prototype._tdmLoadout = function (fi) {
    var pool = ['mce', 'aug', 'asval', 'vector', 'ak12', 'scar', 'mp5'];
    var primary = fi.isPlayer ? (fi._ownedWeapon || 'mce') : pool[(Math.random() * pool.length) | 0];
    return { primary: primary, vest: 'hmp', helmet: 'mhs' };
  };

  Game3D.prototype._startTdm = function () {
    this.tdmScore = { alpha: 0, bravo: 0, charlie: 0 };
    this.playerKills = 0; D3.HUD.setKills(0);
    if (this.player) this.player.vehicle = null;
    this._clearVehicles(); this._clearMonsters();
    for (var g = 0; g < this.grenades.length; g++) if (this.grenades[g].mesh) this.scene.remove(this.grenades[g].mesh);
    this.grenades.length = 0;
    for (var pi = 0; pi < this.pickups.length; pi++) this.scene.remove(this.pickups[pi].mesh);
    this.pickups.length = 0;
    this._genArena();
    var roster = this.teamRoster || ['alpha', 'bravo'];
    for (var t = 0; t < roster.length; t++) {
      var arr = this.map.spawns[roster[t]], idx = 0;
      for (var f = 0; f < this.fighters.length; f++) {
        var fi = this.fighters[f]; if (fi.team !== roster[t]) continue;
        var sp = arr[idx % arr.length]; idx++;
        fi._respawnTimer = null;
        fi.spawn(sp, this._tdmLoadout(fi));
        fi.yaw = Math.atan2(-sp.x, -sp.z);
      }
    }
    if (this.player) { this.player.yaw = this.playerFighter.yaw; this.player.pitch = -0.05; this.player.enabled = false; }
    this.spectate = false;
    this.phase = 'countdown'; this.phaseTimer = 3.2;
    D3.HUD.setLow(false);
    D3.HUD.showBanner('团队竞技', '战场：' + this.map.themeName + ' · 击杀达 ' + this.TDM_TARGET + ' 获胜', '#8fd0ff');
    if (this.audio.whistle) this.audio.whistle();
    this._updateTdmHUD();
  };

  Game3D.prototype._respawnTdm = function (fi) {
    // 从己方半场随机出生点重生（远离敌人）
    var arr = this.map.spawns[fi.team] || this.map.spawns.alpha, sp = arr[(Math.random() * arr.length) | 0];
    fi.spawn(sp, this._tdmLoadout(fi));
    fi.yaw = Math.atan2(-sp.x, -sp.z); fi._respawnTimer = null;
    if (fi.isPlayer) {
      this.spectate = false;
      if (this.player) { this.player.enabled = true; this.player.yaw = fi.yaw; this.player.pitch = -0.05; }
      D3.HUD.toast && D3.HUD.toast('重生！', '#7CFFB0');
    }
  };

  Game3D.prototype._updateTdmHUD = function () {
    if (D3.HUD.setTdmStatus) D3.HUD.setTdmStatus(this.tdmScore, this.TDM_TARGET);
  };

  Game3D.prototype._endTdm = function (winner) {
    this.phase = 'matchend';
    if (winner) {
      var nm = D3.Fighter.TEAM_NAMES[winner], isYou = winner === 'alpha';
      D3.HUD.showBanner((isYou ? '🎉 胜利 · ' : '') + nm + ' 达成击杀目标', '击杀达成 ' + this.TDM_TARGET + '　|　按 Enter 重开', '#' + D3.Fighter.TEAM_COLORS[winner].toString(16).padStart(6, '0'));
      if (isYou) this.audio.win(); else this.audio.lose();
    } else { D3.HUD.showBanner('平局', '按 Enter 重开', '#cfe0f5'); }
  };

  Game3D.prototype._updateTdm = function (dt) {
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      if (this.player) this.player._updateCamera(dt);
      D3.HUD.setCountdown(Math.max(1, Math.ceil(this.phaseTimer)));
      this._drawMinimap(); this._updateWeather(dt);
      if (this.phaseTimer <= 0) { this.phase = 'live'; D3.HUD.hideBanner(); D3.HUD.setCountdown(null); this.audio.whistle && this.audio.whistle(); if (this.player) this.player.enabled = true; }
      return;
    }
    if (this.phase === 'live') {
      for (var i = 0; i < this.fighters.length; i++) { var f = this.fighters[i]; if (f.ai && f.alive) D3.AI.think(f, this.world, dt); }
      if (this.player) this.player.update(dt, this.world);
      for (var j = 0; j < this.fighters.length; j++) this.fighters[j].update(dt, this.world);
      for (var g = this.grenades.length - 1; g >= 0; g--) { this.grenades[g].update(dt); if (this.grenades[g].dead) this.grenades.splice(g, 1); }
      this._updateSmokes(dt); this._updatePickups(dt); this._updateWeather(dt);
      this.effects.update(dt); this._applyShake(dt); this._drawMinimap(); this._updateCombatHUD(dt);

      // 持续重生
      for (var r = 0; r < this.fighters.length; r++) {
        var fi = this.fighters[r]; if (fi.alive) continue;
        if (fi._respawnTimer == null) fi._respawnTimer = this.TDM_RESPAWN;
        fi._respawnTimer -= dt;
        if (fi._respawnTimer <= 0) this._respawnTdm(fi);
      }

      this._updateTdmHUD();
      if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) D3.HUD.hideBanner(); }
      if (this.playerFighter.alive) {
        D3.HUD.setVitals(this.playerFighter.health, this.playerFighter.maxHealth, this.playerFighter.vestDur);
        D3.HUD.setWeapon(this.playerFighter.weapon.name, this.playerFighter.ammo, this.playerFighter.reserve, this.playerFighter.reloading);
      }
      if (this.spectate || !this.playerFighter.alive) this._spectateCam(dt);

      // 胜负：任一队击杀达标
      var win = null, roster = this.teamRoster || ['alpha', 'bravo'];
      for (var t = 0; t < roster.length; t++) if (this.tdmScore[roster[t]] >= this.TDM_TARGET) win = roster[t];
      if (win) { this._endTdm(win); return; }
      return;
    }
    if (this.phase === 'matchend') { this.effects.update(dt); this._spectateCam(dt); this._updateWeather(dt); }
  };

  // ——————————————— PvE 生存模式 ———————————————
  Game3D.prototype._genMap = function () {
    if (this.mapGroup) { this.scene.remove(this.mapGroup); this._disposeGroup(this.mapGroup); }
    if (this.sky) this.scene.remove(this.sky);
    this.map = D3.MapGen.generate();
    this.mapGroup = this.map.group; this.scene.add(this.mapGroup);
    this.world.colliders = this.map.colliders; this.world.solids = this.map.solids; this.world.radius = this.map.radius;
    this.world.platforms = this.map.platforms || [];
    var th = this.map.theme;
    this.sky = D3.toon.skyDome(th.sky1, th.sky2, 340); this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogD * 0.5);
    this.renderer.setClearColor(th.sky2, 1); this.hemi.intensity = th.amb; this.sun.color.set(th.sun);
    this.renderer.toneMappingExposure = th.exposure || 1.02; this._spawnWeather(th);
    this.audio.startAmbient && this.audio.startAmbient(th.weather, th.weather === 'rain' ? 0.05 : 0.026);
  };

  Game3D.prototype._spawnAlpha = function () {
    var arr = this.map.spawns.alpha, idx = 0;
    for (var f = 0; f < this.fighters.length; f++) {
      var fi = this.fighters[f]; var sp = arr[idx % arr.length]; idx++;
      fi.spawn(sp, this._pickLoadout(true)); fi.yaw = Math.atan2(-sp.x, -sp.z);
    }
    if (this.player) { this.player.yaw = this.playerFighter.yaw; this.player.pitch = -0.05; this.player.enabled = false; }
    this.spectate = false;
  };

  Game3D.prototype._clearMonsters = function () {
    for (var i = 0; i < this.monsters.length; i++) this.scene.remove(this.monsters[i].char.root);
    this.monsters.length = 0;
  };

  Game3D.prototype._startPve = function () {
    this.wave = 0; this.score = 0; this.playerKills = 0; D3.HUD.setKills(0);
    this._clearMonsters();
    for (var g = 0; g < this.grenades.length; g++) if (this.grenades[g].mesh) this.scene.remove(this.grenades[g].mesh);
    this.grenades.length = 0; this.smokes.length && this.smokes.forEach(function(s){});
    this._genMap();
    this._spawnAlpha();
    this.phase = 'countdown'; this.phaseTimer = 3.0;
    D3.HUD.setLow(false); D3.HUD.showBanner('怪物生存', '战场：' + this.map.themeName + ' · 准备迎战', '#8fd0ff');
    if (this.audio.whistle) this.audio.whistle();
  };

  Game3D.prototype._startWave = function () {
    this.wave++;
    // 每 3 波换新地图
    if (this.wave > 1 && (this.wave - 1) % 3 === 0) { this._genMap(); this._spawnAlpha(); }
    this._reviveAlpha();
    // 清掉上一波尸体
    for (var i = this.monsters.length - 1; i >= 0; i--) if (!this.monsters[i].alive) { this.scene.remove(this.monsters[i].char.root); this.monsters.splice(i, 1); }
    var count = Math.min(26, 4 + this.wave * 2);
    for (var k = 0; k < count; k++) this._spawnMonster();
    this.phase = 'live'; if (this.player) this.player.enabled = true;
    D3.HUD.hideBanner(); D3.HUD.setCountdown(null); D3.HUD.hideLoadout();
    D3.HUD.showBanner('第 ' + this.wave + ' 波', count + ' 只怪物来袭！', '#ff8a3d');
    var self = this; this._bannerT = 1.6;
  };

  Game3D.prototype._monsterTypeForWave = function () {
    var r = Math.random();
    if (this.wave >= 5 && r < 0.22) return 'creeper';
    if (this.wave >= 3 && r < 0.5) return 'slime';
    return 'zombie';
  };

  Game3D.prototype._spawnMonster = function () {
    var R = this.world.radius - 3, a = Math.random() * Math.PI * 2, d = R * (0.7 + Math.random() * 0.3);
    var pos = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
    var m = new D3.Monster(this._monsterTypeForWave());
    m.addToScene(this.scene); m.spawn(pos); this.monsters.push(m);
  };

  Game3D.prototype._reviveAlpha = function () {
    var arr = this.map.spawns.alpha, idx = 0;
    for (var f = 0; f < this.fighters.length; f++) {
      var fi = this.fighters[f];
      if (!fi.alive) { var sp = arr[idx % arr.length]; fi.spawn(sp, this._pickLoadout(true)); }
      else { fi.health = fi.maxHealth; fi.ammo = fi.weapon.mag; fi.reserve = fi.weapon.reserve; }
      idx++;
    }
    if (this.playerFighter.alive === false) {} // spawn 已置 alive
    this.spectate = !this.playerFighter.alive;
    if (this.player && this.playerFighter.alive) this.player.enabled = true;
  };

  Game3D.prototype._aliveAlpha = function () { var n = 0; for (var i = 0; i < this.fighters.length; i++) if (this.fighters[i].alive) n++; return n; };
  Game3D.prototype._aliveMonsters = function () { var n = 0; for (var i = 0; i < this.monsters.length; i++) if (this.monsters[i].alive) n++; return n; };

  Game3D.prototype._onMonsterKill = function (killer, victim) {
    this.score += victim.st ? victim.st.reward : 100;
    if (Math.random() < 0.25) this._spawnPickup(victim.pos, victim);
    if (killer && killer === this.playerFighter) { this.playerKills++; D3.HUD.setKills(this.playerKills); this.slowmoT = 0.1; if (this.player) this.player.fovKick = 5; }
    D3.HUD.setWaveInfo && D3.HUD.setWaveInfo(this.wave, this._aliveMonsters(), this.score);
  };

  Game3D.prototype._endPve = function () {
    this.phase = 'matchend';
    D3.HUD.showBanner('☠ 全员阵亡', '坚持到第 ' + this.wave + ' 波 · 得分 ' + this.score + '　|　按 Enter 重开', '#ff5a5a');
    this.audio.lose();
  };

  Game3D.prototype._updatePve = function (dt) {
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      if (this.player) this.player._updateCamera(dt);
      D3.HUD.setCountdown(Math.max(1, Math.ceil(this.phaseTimer)));
      this._drawMinimap(); this._updateWeather(dt);
      if (this.phaseTimer <= 0) this._startWave();
      return;
    }
    if (this.phase === 'live') {
      // 队友 AI + 玩家
      for (var i = 0; i < this.fighters.length; i++) { var f = this.fighters[i]; if (f.ai && f.alive) D3.AI.think(f, this.world, dt); }
      if (this.player) this.player.update(dt, this.world);
      for (var j = 0; j < this.fighters.length; j++) this.fighters[j].update(dt, this.world);
      for (var m = 0; m < this.monsters.length; m++) this.monsters[m].update(dt, this.world);
      for (var g = this.grenades.length - 1; g >= 0; g--) { this.grenades[g].update(dt); if (this.grenades[g].dead) this.grenades.splice(g, 1); }
      this._updateSmokes(dt); this._updatePickups(dt); this._updateWeather(dt);
      this.effects.update(dt); this._applyShake(dt); this._drawMinimap(); this._updateCombatHUD(dt);
      D3.HUD.setWaveInfo && D3.HUD.setWaveInfo(this.wave, this._aliveMonsters(), this.score);
      if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) D3.HUD.hideBanner(); }
      // 存活 HUD
      if (this.playerFighter.alive) { D3.HUD.setVitals(this.playerFighter.health, this.playerFighter.maxHealth, this.playerFighter.vestDur); D3.HUD.setWeapon(this.playerFighter.weapon.name, this.playerFighter.ammo, this.playerFighter.reserve, this.playerFighter.reloading); }
      if (this.spectate || !this.playerFighter.alive) this._spectateCam(dt);
      // 全员阵亡 → 失败
      if (this._aliveAlpha() === 0) { this._endPve(); return; }
      // 清剿完成 → 下一波
      if (this._aliveMonsters() === 0) { this.phase = 'waveclear'; this.phaseTimer = 3.2; D3.HUD.showBanner('第 ' + this.wave + ' 波 清剿完成', '得分 ' + this.score + ' · 稍作整备', '#7CFFB0'); this.audio.win(); }
      return;
    }
    if (this.phase === 'waveclear') {
      this.phaseTimer -= dt;
      for (var k = 0; k < this.fighters.length; k++) this.fighters[k].update(dt, this.world);
      this._updateWeather(dt); this.effects.update(dt); this._spectateCam(dt);
      if (this.phaseTimer <= 0) this._startWave();
      return;
    }
    if (this.phase === 'matchend') { this.effects.update(dt); this._spectateCam(dt); this._updateWeather(dt); }
  };

  Game3D.prototype.update = function (dt) {
    D3.HUD.update(dt);
    if (this.paused) return;
    // 命中慢镜（hit-stop）：击杀瞬间短暂减速
    if (this.slowmoT > 0) { this.slowmoT -= dt; dt *= 0.4; }
    // 湖面波光
    if (this.map && this.map.water && this.map.water.material.uniforms) this.map.water.material.uniforms.uTime.value += dt;
    this._updateMuzzleLight(dt);
    // PvE 生存模式走独立逻辑
    if (this.mode === 'pve') { this._updatePve(dt); return; }
    if (this.mode === 'bed') { this._updateBed(dt); return; }
    if (this.mode === 'rail') { this._updateRail(dt); return; }
    if (this.mode === 'tdm') { this._updateTdm(dt); return; }
    // 相位机（FFA）
    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      // 倒计时把镜头摆到玩家身后，AI 站桩，玩家不可动
      if (this.player) this.player._updateCamera(dt);
      D3.HUD.setTimer(this.roundTimer);
      D3.HUD.setCountdown(null); // 选枪表格已含倒计时，不再显示中央大数字
      D3.HUD.setLoadoutCountdown(Math.max(1, Math.ceil(this.phaseTimer)));
      this._drawMinimap(); this._updateWeather(dt);
      if (this.phaseTimer <= 0) { this.phase = 'live'; D3.HUD.hideBanner(); D3.HUD.setCountdown(null); D3.HUD.hideLoadout(); this.audio.whistle && this.audio.whistle(); if (this.player) { this.player.enabled = true; this.player.wantThrow = false; this.player.wantInteract = false; } }
    } else if (this.phase === 'live') {
      this.roundTimer -= dt;
      // 载具/轻轨（海岛）先更新以正确载人
      if (this.tram) this.tram.update(dt, this.world);
      for (var vv = 0; vv < this.vehicles.length; vv++) this.vehicles[vv].update(dt);
      // AI 思考
      for (var i = 0; i < this.fighters.length; i++) {
        var f = this.fighters[i];
        if (f.ai && f.alive) D3.AI.think(f, this.world, dt);
      }
      if (this.player) this.player.update(dt, this.world);
      // 单位更新
      for (var j = 0; j < this.fighters.length; j++) this.fighters[j].update(dt, this.world);
      // 手雷更新
      for (var g = this.grenades.length - 1; g >= 0; g--) { this.grenades[g].update(dt); if (this.grenades[g].dead) this.grenades.splice(g, 1); }
      this._updateSmokes(dt); this._updatePickups(dt); this._updateWeather(dt);
      this.effects.update(dt);
      this._applyShake(dt);
      this._drawMinimap();
      this._updateCombatHUD(dt);
      this._checkRoundEnd();
      if (this.phase === 'live' && this.roundTimer <= 0) {
        // 超时：存活最多的队获胜
        var alive = this._aliveByTeam();
        var best = null, bestN = -1, tie = false;
        for (var t = 0; t < TEAMS.length; t++) { var n = alive[TEAMS[t]]; if (n > bestN) { bestN = n; best = TEAMS[t]; tie = false; } else if (n === bestN) tie = true; }
        this._endRound(tie ? null : best);
      }
      // HUD 更新
      if (this.playerFighter && this.playerFighter.alive) {
        var pf = this.playerFighter;
        D3.HUD.setVitals(pf.health, pf.maxHealth, pf.vestDur);
        D3.HUD.setWeapon(pf.weapon.name, pf.ammo, pf.reserve, pf.reloading);
      }
      D3.HUD.setTimer(this.roundTimer);
      // 观战相机
      if (this.spectate) this._spectateCam(dt);
    } else if (this.phase === 'roundend') {
      this.phaseTimer -= dt;
      for (var k = 0; k < this.fighters.length; k++) this.fighters[k].update(dt, this.world);
      for (var gg = this.grenades.length - 1; gg >= 0; gg--) { this.grenades[gg].update(dt); if (this.grenades[gg].dead) this.grenades.splice(gg, 1); }
      this._updateSmokes(dt); this._updateWeather(dt);
      this.effects.update(dt);
      this._spectateCam(dt);
      if (this.phaseTimer <= 0) {
        if (this._champ) this._endMatch(this._champ);
        else this.newRound();
      }
    } else if (this.phase === 'matchend') {
      this.effects.update(dt);
      this._spectateCam(dt);
    }
  };

  // 观战/回合结束：环绕战场的电影机位
  Game3D.prototype._spectateCam = function (dt) {
    this._specAng += dt * 0.25;
    var R = 30, h = 20;
    // 若玩家还活着且只是回合结束，跟随玩家；否则环绕
    var target = new THREE.Vector3(0, 2, 0);
    var alive = this.fighters.filter(function (f){ return f.alive; });
    if (alive.length) { target.set(0,1.5,0); for (var i=0;i<alive.length;i++) target.add(alive[i].pos); target.divideScalar(alive.length+1); }
    var camP = new THREE.Vector3(Math.cos(this._specAng)*R, h, Math.sin(this._specAng)*R);
    this.camera.position.lerp(camP, 1 - Math.pow(0.02, dt));
    this.camera.lookAt(target);
  };

  Game3D.prototype._disposeGroup = function (g) {
    g.traverse(function (o) { if (o.geometry) o.geometry.dispose && o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(function(m){m.dispose&&m.dispose();}); else o.material.dispose && o.material.dispose(); } });
  };

  D3.Game3D = Game3D;
})(window.D3 = window.D3 || {});
