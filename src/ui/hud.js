/* 战斗 HUD：血量 / 护甲 / 体力 / 弹药 / 道具 / 比分 / 计时 / 击杀信息 / 目标提示 / 计分板 */
(function (DF) {
  'use strict';

  function HUD() {}

  function bar(ctx, x, y, w, h, pct, color, bg) {
    ctx.fillStyle = bg || 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  HUD.prototype.render = function (ctx, game) {
    var p = game.player, W = game.map.width, H = game.map.height;
    ctx.textAlign = 'left';

    // ——— 顶部比分 / 计时 ———
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.fillRect(W / 2 - 150, 8, 300, 46);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 26px Consolas, monospace';
    ctx.fillText(String(game.attackerWins), W / 2 - 70, 40);
    ctx.fillStyle = '#ff7043';
    ctx.fillText(String(game.defenderWins), W / 2 + 70, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Consolas, monospace';
    var clock = game.state === 'buy' ? game.buyTimer : game.roundClock;
    ctx.fillText(Math.max(0, Math.ceil(clock)) + 's', W / 2, 36);
    ctx.fillStyle = '#888'; ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText('第 ' + game.round + ' 局 · 先胜 ' + DF.CONFIG.match.roundsToWin + ' 局', W / 2, 51);
    ctx.textAlign = 'left';

    // 状态提示
    if (game.state === 'buy') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffca28'; ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
      ctx.fillText('购买阶段 · 选择战备后按「出击」或等待倒计时', W / 2, 74);
      ctx.textAlign = 'left';
    }

    // ——— 左下 玩家状态 ———
    var bx = 20, by = H - 96;
    if (p.alive) {
      // 血量
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      ctx.fillText('生命 ' + Math.ceil(p.health), bx, by - 4);
      bar(ctx, bx, by, 180, 12, p.health / p.maxHealth, p.bleeding > 0 ? '#e53935' : '#43a047');
      // 护甲
      ctx.fillStyle = '#bbdefb'; ctx.fillText('护甲 ' + Math.ceil(p.vestDur) + '/' + p.vestMax, bx, by + 30);
      bar(ctx, bx, by + 34, 180, 9, p.vestMax ? p.vestDur / p.vestMax : 0, '#42a5f5');
      // 头盔
      ctx.fillStyle = '#c5cae9'; ctx.fillText('头盔 ' + Math.ceil(p.helmetDur), bx + 190, by + 30);
      bar(ctx, bx + 190, by + 34, 90, 9, p.helmetMax ? p.helmetDur / p.helmetMax : 0, '#7e57c2');
      // 体力
      bar(ctx, bx, by + 50, 180, 6, p.stamina / p.maxStamina, '#ffb300');

      // 状态标签
      var tags = [];
      if (p.bleeding > 0) tags.push('流血');
      if (game.time < p.painkillerUntil) tags.push('止疼');
      if (game.time < p.adrenalineUntil) tags.push('兴奋');
      if (tags.length) { ctx.fillStyle = '#ff8a65'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(tags.join(' · '), bx, by + 70); }
    } else {
      ctx.fillStyle = '#ef5350'; ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText('已阵亡 · 观战队友', bx, by + 20);
    }

    // ——— 右下 武器 / 弹药 ———
    var w = p.currentWeapon();
    if (w) {
      var rx = W - 20, ry = H - 30;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
      ctx.fillText(w.def.name, rx, ry - 28);
      if (w.def.category === 'melee') {
        ctx.fillStyle = '#b0bec5'; ctx.font = 'bold 30px Consolas, monospace';
        ctx.fillText('近战', rx, ry);
      } else {
        ctx.fillStyle = p.reloading ? '#ffca28' : '#fff';
        ctx.font = 'bold 34px Consolas, monospace';
        ctx.fillText(w.ammo + ' / ' + w.reserve, rx, ry);
        if (p.reloading) { ctx.fillStyle = '#ffca28'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText('换弹中…', rx, ry - 44); }
      }
      // 武器槽提示
      ctx.fillStyle = '#78909c'; ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText('[Q] 切枪 · [R] 换弹 · [V] 近战', rx, ry + 16);
      ctx.textAlign = 'left';
    }

    // ——— 道具栏 ———
    var ix = 320, iy = H - 42;
    for (var i = 0; i < p.items.length; i++) {
      var it = p.items[i];
      ctx.fillStyle = it.charges > 0 ? 'rgba(38,50,56,0.9)' : 'rgba(38,50,56,0.35)';
      ctx.fillRect(ix, iy, 118, 30);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(ix + 0.5, iy + 0.5, 118, 30);
      ctx.fillStyle = '#ffca28'; ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillText('[' + it.def.key + ']', ix + 6, iy + 20);
      ctx.fillStyle = it.charges > 0 ? '#fff' : '#777'; ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(it.def.name.slice(0, 7), ix + 30, iy + 13);
      ctx.fillStyle = '#90a4ae';
      ctx.fillText('×' + it.charges, ix + 30, iy + 26);
      ix += 124;
    }

    // ——— 资金 ———
    ctx.fillStyle = '#66bb6a'; ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText('$ ' + game.economy.money, 20, 30);

    // ——— 目标提示 ———
    if (game.state === 'live') {
      ctx.textAlign = 'center';
      if (game.objective.done) {
        ctx.fillStyle = '#66bb6a'; ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
        ctx.fillText('密钥破译完成！', W / 2, 100);
      } else if (game.objective.inRange(p) && p.alive) {
        ctx.fillStyle = '#ffee58'; ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
        ctx.fillText('按住 [F] 破译密钥  ' + Math.floor(game.objective.progress * 100) + '%', W / 2, 100);
      } else if (game.objective.progress > 0) {
        ctx.fillStyle = '#ffca28'; ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillText('密钥破译进度 ' + Math.floor(game.objective.progress * 100) + '%', W / 2, 100);
      }
      ctx.textAlign = 'left';
    }

    // ——— 击杀信息（右上）———
    var ky = 70;
    ctx.textAlign = 'right';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    for (var k = 0; k < game.killfeed.length; k++) {
      var e = game.killfeed[k];
      ctx.globalAlpha = Math.min(1, e.life);
      ctx.fillStyle = e.killerTeam === 'attacker' ? '#4fc3f7' : '#ff7043';
      var txt = e.killer + '  ▸ [' + e.weapon + '] ▸  ';
      ctx.fillText(e.killer + '  『' + e.weapon + '』 ', W - 20 - measure(ctx, e.victim), ky);
      ctx.fillStyle = '#ef9a9a';
      ctx.fillText(e.victim, W - 20, ky);
      ky += 20;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // 存活人数
    ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillText('进攻存活 ' + count(game, 'attacker'), 20, 50);
    ctx.fillStyle = '#ff7043';
    ctx.fillText('防守存活 ' + count(game, 'defender'), 20, 68);
  };

  function measure(ctx, s) { return ctx.measureText(s).width; }
  function count(game, team) {
    var n = 0; for (var i = 0; i < game.agents.length; i++) if (game.agents[i].team === team && game.agents[i].alive) n++; return n;
  }

  // 计分板（按住 Tab）
  HUD.prototype.renderScoreboard = function (ctx, game) {
    var W = game.map.width, H = game.map.height;
    ctx.fillStyle = 'rgba(8,10,14,0.9)';
    ctx.fillRect(W / 2 - 280, 120, 560, 380);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.strokeRect(W / 2 - 280, 120, 560, 380);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffca28'; ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillText('计分板  ' + game.attackerWins + ' : ' + game.defenderWins, W / 2, 156);

    var y = 200;
    drawTeam(ctx, game, 'attacker', '进攻方 · 灵萧队', '#4fc3f7', W / 2 - 260, y);
    drawTeam(ctx, game, 'defender', '防守方 · 敌方小队', '#ff7043', W / 2 - 260, y + 160);
    ctx.textAlign = 'left';
  };

  function drawTeam(ctx, game, team, title, color, x, y) {
    ctx.textAlign = 'left';
    ctx.fillStyle = color; ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(title, x, y);
    ctx.fillStyle = '#78909c'; ctx.font = '12px Consolas, monospace';
    ctx.fillText('干员', x + 10, y + 24);
    ctx.fillText('击杀', x + 300, y + 24);
    ctx.fillText('阵亡', x + 380, y + 24);
    ctx.fillText('状态', x + 450, y + 24);
    var row = y + 46;
    for (var i = 0; i < game.agents.length; i++) {
      var a = game.agents[i];
      if (a.team !== team) continue;
      ctx.fillStyle = a === game.player ? '#fff' : '#cfd8dc';
      ctx.font = (a === game.player ? 'bold ' : '') + '14px "Microsoft YaHei", sans-serif';
      ctx.fillText((a === game.player ? '★ ' : '  ') + a.name, x + 10, row);
      ctx.fillStyle = '#eee'; ctx.font = '14px Consolas, monospace';
      ctx.fillText(String(a.kills), x + 306, row);
      ctx.fillText(String(a.deaths), x + 386, row);
      ctx.fillStyle = a.alive ? '#66bb6a' : '#ef5350';
      ctx.fillText(a.alive ? '存活' : '阵亡', x + 450, row);
      row += 28;
    }
  }

  DF.HUD = HUD;
})(window.DF = window.DF || {});
