/* 对局主控：状态机（购买/战斗/小局结算/整场结算）+ 主循环 + 玩家操控 + 渲染 */
(function (DF) {
  'use strict';

  var V = DF.V;
  var C = DF.CONFIG;

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = new DF.GameMap(C);
    canvas.width = this.map.width;
    canvas.height = this.map.height;

    this.rng = new DF.RNG(20260701);
    this.input = new DF.Input(canvas);
    this.audio = new DF.Audio();
    this.particles = new DF.Particles();
    this.economy = new DF.Economy(C.economy);
    this.objective = new DF.Objective(C.objective, this.map.site);
    this.hud = new DF.HUD();
    this.buyMenu = new DF.BuyMenu();

    this.time = 0;
    this.state = 'menu';        // menu|buy|live|roundend|matchend
    this.agents = [];
    this.bullets = [];
    this.killfeed = [];
    this.attackerWins = 0;
    this.defenderWins = 0;
    this.round = 0;
    this.roundClock = 0;
    this.buyTimer = 0;
    this.roundEndTimer = 0;
    this.roundResult = null;
    this.spentThisRound = 0;
    this.banner = null;

    this._createAgents();
    this._lastT = 0;
  }

  // ————— 初始化干员 —————
  Game.prototype._createAgents = function () {
    var self = this;
    this.player = new DF.Agent(this, { team: 'attacker', isPlayer: true, name: '灵萧·蝶', color: '#4fc3f7' });

    this.teammates = [
      new DF.Agent(this, { team: 'attacker', name: '破晓', color: '#4dd0e1' }),
      new DF.Agent(this, { team: 'attacker', name: '爱缠龙', color: '#81d4fa' })
    ];
    this.enemies = [
      new DF.Agent(this, { team: 'defender', name: '超级凯666', color: '#ff7043' }),
      new DF.Agent(this, { team: 'defender', name: '夜枭', color: '#ff8a65' }),
      new DF.Agent(this, { team: 'defender', name: '磐石', color: '#ffab91' })
    ];
    this.teammates.concat(this.enemies).forEach(function (a) { a.ai = new DF.AI(a, self); });
    this.agents = [this.player].concat(this.teammates, this.enemies);
  };

  // ————— 开始整场 —————
  Game.prototype.startMatch = function () {
    this.attackerWins = 0;
    this.defenderWins = 0;
    this.round = 0;
    this.economy.money = C.economy.startMoney;
    this.economy.lossStreak = 0;
    this.startRound();
  };

  // ————— 开始小局（购买阶段）—————
  Game.prototype.startRound = function () {
    this.round++;
    this.objective.reset();
    this.bullets = [];
    this.spentThisRound = 0;

    // 出生 + 重置
    var self = this;
    function place(a, spawn) {
      a.x = spawn.x; a.y = spawn.y;
      a.angle = a.team === 'attacker' ? -Math.PI / 2 : Math.PI / 2;
      a.resetState();
      if (a.ai) { a.ai.target = null; a.ai.goal = null; a.ai.lastKnown = null; }
    }
    place(this.player, this.map.attackerSpawns[1]);
    place(this.teammates[0], this.map.attackerSpawns[0]);
    place(this.teammates[1], this.map.attackerSpawns[2]);
    for (var i = 0; i < this.enemies.length; i++) place(this.enemies[i], this.map.defenderSpawns[i]);

    // 玩家默认免费战备（可在购买阶段替换）
    this.player.equipLoadout(DF.getLoadout('quanzidong'));

    // AI 自动战备（随回合升级）
    var budget = Math.min(6000, 800 + this.round * 1100);
    this.teammates.concat(this.enemies).forEach(function (a) {
      a.equipLoadout(self._pickAILoadout(budget));
    });

    this.state = 'buy';
    this.buyTimer = C.match.buyTime;
    this.buyMenu.open();
    this.banner = null;
  };

  Game.prototype._pickAILoadout = function (budget) {
    var affordable = DF.LOADOUTS.filter(function (l) { return l.cost <= budget && l.primary; });
    if (!affordable.length) affordable = DF.LOADOUTS.filter(function (l) { return l.cost <= budget; });
    // 偏好较高价位
    affordable.sort(function (a, b) { return b.cost - a.cost; });
    var top = affordable.slice(0, Math.max(1, Math.ceil(affordable.length / 2)));
    return this.rng.pick(top);
  };

  // 玩家购买（购买阶段可自由切换，自动退还上次花费）
  Game.prototype.buyLoadout = function (l) {
    if (this.state !== 'buy') return false;
    this.economy.money += this.spentThisRound; // 退还
    if (this.economy.money >= l.cost) {
      this.economy.money -= l.cost;
      this.spentThisRound = l.cost;
      this.player.equipLoadout(l);
      if (this.audio) this.audio.buy();
      return true;
    } else {
      this.economy.money -= this.spentThisRound; // 撤销退还
      if (this.audio) this.audio.click();
      return false;
    }
  };

  Game.prototype.beginLive = function () {
    this.state = 'live';
    this.roundClock = C.match.roundTime;
    this.buyMenu.close();
  };

  // ————— 主循环 —————
  Game.prototype.frame = function (t) {
    var dt = Math.min(0.05, (t - this._lastT) / 1000 || 0);
    this._lastT = t;
    try {
      this.update(dt);
      this.render();
      this.input.endFrame();
    } catch (err) {
      // 任何运行时错误都可见化，而非静默停摆
      if (typeof window !== 'undefined' && window.__report) {
        window.__report('主循环崩溃（state=' + this.state + '）：\n' + (err && err.stack || err));
      }
      console.error(err);
      return; // 停止循环，避免刷屏
    }
    var self = this;
    requestAnimationFrame(function (tt) { self.frame(tt); });
  };

  Game.prototype.update = function (dt) {
    this.time += dt; // 模拟时钟由更新步进拥有（保证逻辑自洽、可无头测试）
    if (this.state === 'menu') { this._menuInput(); return; }
    if (this.state === 'matchend') { this._endInput(); this.particles.update(dt); return; }

    if (this.state === 'buy') {
      this.buyTimer -= dt;
      this.buyMenu.update(this);
      if (this.buyTimer <= 0 || this.buyMenu.ready) this.beginLive();
      // 购买阶段允许原地转向观察
      this._aimPlayer();
      this.particles.update(dt);
      return;
    }

    if (this.state === 'roundend') {
      this.roundEndTimer -= dt;
      this._updateEntities(dt, true); // 结算展示仍渲染但冻结逻辑
      if (this.roundEndTimer <= 0) this._nextRound();
      return;
    }

    // live
    this.roundClock -= dt;
    this._controlPlayer(dt);
    this._updateEntities(dt, false);
    this.objective.endFrame();
    this._checkWin();
  };

  Game.prototype._updateEntities = function (dt, frozen) {
    var i;
    if (!frozen) {
      for (i = 0; i < this.teammates.length; i++) if (this.teammates[i].ai) this.teammates[i].ai.update(dt);
      for (i = 0; i < this.enemies.length; i++) if (this.enemies[i].ai) this.enemies[i].ai.update(dt);
      for (i = 0; i < this.agents.length; i++) this.agents[i].update(dt);
      for (i = 0; i < this.bullets.length; i++) this.bullets[i].update(dt, this);
      this.bullets = this.bullets.filter(function (b) { return !b.dead; });
    }
    this.particles.update(dt);
    // 淡出击杀信息
    this.killfeed = this.killfeed.filter(function (k) { k.life -= dt; return k.life > 0; });
  };

  // ————— 玩家操控 —————
  Game.prototype._aimPlayer = function () {
    var p = this.player;
    if (!p.alive) return;
    p.angle = Math.atan2(this.input.mouse.y - p.y, this.input.mouse.x - p.x);
  };

  Game.prototype._controlPlayer = function (dt) {
    var p = this.player, inp = this.input;
    if (!p.alive) return;
    this._aimPlayer();

    // 移动
    var dx = 0, dy = 0;
    if (inp.down('w')) dy -= 1;
    if (inp.down('s')) dy += 1;
    if (inp.down('a')) dx -= 1;
    if (inp.down('d')) dx += 1;
    var sprint = inp.down('shift') && (dx || dy);
    if (!p.using) {
      var didSprint = p.tryMove(dx, dy, dt, sprint);
      p._sprintingThisFrame = didSprint;
      if (didSprint) p.stamina = Math.max(0, p.stamina - p.cfg.staminaDrain * dt);
    } else { p.moving = false; }

    // 武器切换
    if (inp.justPressed('q')) p.switchSlot(p.slot === 'primary' ? 'secondary' : 'primary');

    // 近战快攻（V）
    if (inp.justPressed('v')) p.meleeAttack(p.angle);

    // 换弹
    if (inp.justPressed('r')) p.reload();

    // 道具
    ['1', '2', '3', '4', '5'].forEach(function (k) {
      if (inp.justPressed(k)) p.useItem(k);
    });

    // 破译（按住 F 且在站点范围）
    if (inp.down('f') && this.objective.inRange(p) && !p.using) {
      this.objective.tick(dt, p, this);
    }

    // 射击
    var w = p.currentWeapon();
    if (w && w.def.category !== 'melee') {
      if (w.def.auto ? inp.mouseDown : inp.justClicked()) {
        if (this.audio) this.audio.resume();
        p.tryShoot(p.angle);
      }
    }
  };

  // ————— 战斗回调 —————
  Game.prototype.spawnBullet = function (opts) { this.bullets.push(new DF.Bullet(opts)); };

  Game.prototype.onBulletHitAgent = function (bullet, victim, hx, hy) {
    var dist = V.dist({ x: bullet.owner.x, y: bullet.owner.y }, { x: hx, y: hy });
    var headshot = DF.combat.rollHeadshot(this.rng, bullet.aimQuality, dist);
    var res = DF.combat.resolveDamage({
      baseDamage: bullet.weapon.damage,
      headshot: headshot,
      distance: dist,
      range: bullet.weapon.range,
      health: victim.health,
      vestDur: victim.vestDur,
      helmetDur: victim.helmetDur,
      cfg: C.combat,
      category: bullet.weapon.category
    });
    this.particles.blood(hx, hy, bullet.dir ? Math.atan2(bullet.dir.y, bullet.dir.x) : 0);
    this.particles.floater(hx, hy - 8, (res.headshot ? '爆头 ' : '') + Math.round(res.dealt), res.headshot ? '#ff5252' : '#ffd54f');
    if (this.audio && bullet.owner.isPlayer) { res.headshot ? this.audio.headshot() : this.audio.hit(); }
    victim.applyDamageResult(res, bullet.owner);
  };

  Game.prototype.applyMelee = function (attacker, victim, dmg, backstab) {
    var res;
    if (backstab || dmg >= 999) {
      res = { health: 0, vestDur: victim.vestDur, helmetDur: victim.helmetDur, dealt: victim.health, headshot: false, killed: true, bledTrigger: false };
    } else {
      var h = Math.max(0, victim.health - dmg);
      res = { health: h, vestDur: victim.vestDur, helmetDur: victim.helmetDur, dealt: dmg, headshot: false, killed: h <= 0, bledTrigger: false };
    }
    this.particles.floater(victim.x, victim.y - 8, (backstab ? '背刺 ' : '') + Math.round(res.dealt), '#ff8a80');
    victim.applyDamageResult(res, attacker);
  };

  Game.prototype.onAgentDeath = function (victim, attacker) {
    var wname = attacker ? (attacker.currentWeapon() ? attacker.currentWeapon().def.name : '') : '流血';
    var cat = attacker && attacker.currentWeapon() ? attacker.currentWeapon().def.category : '';
    this.killfeed.unshift({
      killer: attacker ? attacker.name : '——',
      victim: victim.name,
      weapon: wname,
      headshot: false,
      killerTeam: attacker ? attacker.team : 'none',
      life: 5
    });
    if (this.killfeed.length > 5) this.killfeed.pop();

    if (attacker) {
      attacker.kills++;
      // 玩家击杀奖励
      if (attacker.isPlayer) this.economy.awardKill(cat === 'melee' ? 'melee' : cat === 'sniper' ? 'sniper' : 'gun');
    }
  };

  // ————— 胜负判定 —————
  Game.prototype._aliveCount = function (team) {
    var n = 0;
    for (var i = 0; i < this.agents.length; i++) if (this.agents[i].team === team && this.agents[i].alive) n++;
    return n;
  };

  Game.prototype._checkWin = function () {
    if (this.state !== 'live') return;
    var atk = this._aliveCount('attacker');
    var def = this._aliveCount('defender');

    if (this.objective.done) { this._endRound('attacker', '密钥破译成功'); return; }
    if (def === 0) { this._endRound('attacker', '全歼防守方'); return; }
    if (atk === 0) { this._endRound('defender', '进攻方被团灭'); return; }
    if (this.roundClock <= 0) { this._endRound('defender', '防守方成功拖延时间'); return; }
  };

  Game.prototype._endRound = function (winner, reason) {
    this.state = 'roundend';
    this.roundEndTimer = C.match.roundEndDelay;
    this.roundResult = { winner: winner, reason: reason };

    var playerWon = winner === 'attacker';
    // 经济结算
    if (playerWon && this.objective.done) this.economy.awardDecrypt();
    this.economy.awardRoundEnd(playerWon);

    if (winner === 'attacker') this.attackerWins++;
    else this.defenderWins++;

    if (this.audio) { playerWon ? this.audio.win() : this.audio.lose(); }

    // 是否整场结束
    if (this.attackerWins >= C.match.roundsToWin || this.defenderWins >= C.match.roundsToWin) {
      this._matchWinner = this.attackerWins >= C.match.roundsToWin ? 'attacker' : 'defender';
    } else {
      this._matchWinner = null;
    }
  };

  Game.prototype._nextRound = function () {
    if (this._matchWinner) { this.state = 'matchend'; return; }
    this.startRound();
  };

  // ————— 菜单 / 结束输入 —————
  Game.prototype._menuInput = function () {
    if (this.input.justClicked() || this.input.justPressed('enter') || this.input.justPressed(' ')) {
      if (this.audio) this.audio.resume();
      this.startMatch();
    }
  };
  Game.prototype._endInput = function () {
    if (this.input.justPressed('enter') || this.input.justClicked()) this.startMatch();
  };

  // ————— 渲染 —————
  Game.prototype.render = function () {
    var ctx = this.ctx;
    this._drawBackground(ctx);
    this._drawMap(ctx);
    this._drawSite(ctx);

    // 尸体先画
    var i;
    for (i = 0; i < this.agents.length; i++) if (!this.agents[i].alive) this.agents[i].render(ctx, false);
    for (i = 0; i < this.bullets.length; i++) this.bullets[i].render(ctx);
    for (i = 0; i < this.agents.length; i++) if (this.agents[i].alive) this.agents[i].render(ctx, this.agents[i] === this.player);
    this.particles.render(ctx);

    if (this.state === 'menu') { this._drawMenu(ctx); return; }

    this.hud.render(ctx, this);

    if (this.state === 'buy') this.buyMenu.render(ctx, this);
    if (this.state === 'roundend') this._drawRoundEnd(ctx);
    if (this.state === 'matchend') this._drawMatchEnd(ctx);

    // 计分板
    if (this.input.down('tab')) this.hud.renderScoreboard(ctx, this);
  };

  Game.prototype._drawBackground = function (ctx) {
    ctx.fillStyle = '#1a1f26';
    ctx.fillRect(0, 0, this.map.width, this.map.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (var x = 0; x < this.map.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.map.height); ctx.stroke(); }
    for (var y = 0; y < this.map.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.map.width, y); ctx.stroke(); }
  };

  Game.prototype._drawMap = function (ctx) {
    var i, b;
    // 掩体墙
    for (i = 0; i < this.map.walls.length; i++) {
      b = this.map.walls[i];
      ctx.fillStyle = '#3a4250';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#4b5566'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }
    // 箱子
    for (i = 0; i < this.map.crates.length; i++) {
      b = this.map.crates[i];
      ctx.fillStyle = '#6d5637';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#8a6d44'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
  };

  Game.prototype._drawSite = function (ctx) {
    var s = this.map.site, o = this.objective;
    // 站点范围
    ctx.save();
    ctx.globalAlpha = 0.18 + (o.decrypting ? 0.12 * (0.5 + 0.5 * Math.sin(this.time * 10)) : 0);
    ctx.fillStyle = o.done ? '#4caf50' : '#ffb300';
    ctx.beginPath(); ctx.arc(s.x, s.y, C.objective.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = o.done ? '#66bb6a' : '#ffca28';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(s.x, s.y, C.objective.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // 图标
    ctx.fillStyle = o.done ? '#66bb6a' : '#ffca28';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('密钥', s.x, s.y + 4);
    ctx.textAlign = 'left';

    // 破译进度环
    if (o.progress > 0 && !o.done) {
      ctx.strokeStyle = '#ffee58';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, C.objective.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * o.progress);
      ctx.stroke();
    }
  };

  Game.prototype._drawMenu = function (ctx) {
    var w = this.map.width, h = this.map.height;
    ctx.fillStyle = 'rgba(10,12,16,0.82)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffca28'; ctx.font = 'bold 64px "Microsoft YaHei", sans-serif';
    ctx.fillText('三角洲行动', w / 2, h / 2 - 90);
    ctx.fillStyle = '#e0e0e0'; ctx.font = '22px "Microsoft YaHei", sans-serif';
    ctx.fillText('DELTA FORCE · 攻防爆破赛 · 7 局 3 胜制', w / 2, h / 2 - 40);
    ctx.fillStyle = '#90caf9'; ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText('WASD 移动   鼠标瞄准/左键射击   R 换弹   F 破译   1-5 道具   V 近战   Shift 冲刺', w / 2, h / 2 + 20);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    if (this.time % 1.2 < 0.75) ctx.fillText('▶ 点击 / 回车 开始对战', w / 2, h / 2 + 80);
    ctx.textAlign = 'left';
  };

  Game.prototype._drawRoundEnd = function (ctx) {
    var w = this.map.width;
    var r = this.roundResult;
    var win = r.winner === 'attacker';
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 250, w, 180);
    ctx.textAlign = 'center';
    ctx.fillStyle = win ? '#66bb6a' : '#ef5350';
    ctx.font = 'bold 46px "Microsoft YaHei", sans-serif';
    ctx.fillText(win ? '本局获胜' : '本局失败', w / 2, 320);
    ctx.fillStyle = '#eee'; ctx.font = '22px "Microsoft YaHei", sans-serif';
    ctx.fillText(r.reason, w / 2, 362);
    ctx.fillStyle = '#ffca28'; ctx.font = 'bold 26px Consolas, monospace';
    ctx.fillText('灵萧队 ' + this.attackerWins + ' : ' + this.defenderWins + ' 敌方', w / 2, 402);
    ctx.textAlign = 'left';
  };

  Game.prototype._drawMatchEnd = function (ctx) {
    var w = this.map.width, h = this.map.height;
    var win = this._matchWinner === 'attacker';
    ctx.fillStyle = 'rgba(8,10,14,0.86)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = win ? '#ffca28' : '#ef5350';
    ctx.font = 'bold 72px "Microsoft YaHei", sans-serif';
    ctx.fillText(win ? '夺冠 · VICTORY' : '战败 · DEFEAT', w / 2, h / 2 - 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 34px Consolas, monospace';
    ctx.fillText('灵萧队 ' + this.attackerWins + ' : ' + this.defenderWins + ' 敌方', w / 2, h / 2 + 20);
    ctx.fillStyle = '#90caf9'; ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('本场击杀 ' + this.player.kills + ' · 阵亡 ' + this.player.deaths, w / 2, h / 2 + 60);
    ctx.fillStyle = '#fff'; ctx.font = '22px "Microsoft YaHei", sans-serif';
    ctx.fillText(this.time % 1.2 < 0.7 ? '▶ 点击 / 回车 再来一场' : ' ', w / 2, h / 2 + 110);
    ctx.textAlign = 'left';
  };

  DF.Game = Game;
})(window.DF = window.DF || {});
