/* 购买阶段界面（Canvas 绘制 + 鼠标点击）：15 套战备按价位分档展示 */
(function (DF) {
  'use strict';

  function BuyMenu() {
    this.isOpen = false;
    this.ready = false;
    this.cards = [];
    this.readyBtn = null;
  }

  BuyMenu.prototype.open = function () { this.isOpen = true; this.ready = false; };
  BuyMenu.prototype.close = function () { this.isOpen = false; };

  // 计算卡片布局（渲染与点击共用）
  BuyMenu.prototype._layout = function (game) {
    var W = game.map.width, H = game.map.height;
    var tiers = [200, 1000, 2500, 4000, 6000];
    var colW = 232, cardW = 216, cardH = 116, gapY = 12;
    var totalW = tiers.length * colW;
    var startX = (W - totalW) / 2 + (colW - cardW) / 2;
    var startY = 150;
    this.cards = [];
    for (var c = 0; c < tiers.length; c++) {
      var list = DF.LOADOUTS.filter(function (l) { return l.cost === tiers[c]; });
      for (var r = 0; r < list.length; r++) {
        this.cards.push({
          loadout: list[r],
          rect: { x: startX + c * colW, y: startY + r * (cardH + gapY), w: cardW, h: cardH }
        });
      }
    }
    this.readyBtn = { x: W / 2 - 110, y: H - 78, w: 220, h: 46 };
    this._tiersX = tiers.map(function (_, i) { return startX + i * colW + cardW / 2; });
    this._tiers = tiers;
    this._startY = startY;
  };

  BuyMenu.prototype.update = function (game) {
    if (!this.isOpen) return;
    this._layout(game);
    var m = game.input.mouse;
    if (game.input.justClicked()) {
      for (var i = 0; i < this.cards.length; i++) {
        if (hit(m, this.cards[i].rect)) { game.buyLoadout(this.cards[i].loadout); return; }
      }
      if (hit(m, this.readyBtn)) { this.ready = true; return; }
    }
    if (game.input.justPressed('enter') || game.input.justPressed(' ')) this.ready = true;
  };

  function hit(m, r) { return m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h; }

  BuyMenu.prototype.render = function (ctx, game) {
    if (!this.isOpen) return;
    // 自足：即便本帧 update() 尚未运行（如刚从菜单点击进入购买），也先算好布局，
    // 避免 render 依赖 update 先执行而读到未初始化的字段。
    this._layout(game);
    var W = game.map.width, H = game.map.height, m = game.input.mouse;
    ctx.fillStyle = 'rgba(8,11,16,0.86)'; ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffca28'; ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.fillText('战 备 购 买', W / 2, 60);
    ctx.fillStyle = '#66bb6a'; ctx.font = 'bold 20px Consolas, monospace';
    ctx.fillText('资金  $ ' + game.economy.money, W / 2, 92);
    ctx.fillStyle = '#90a4ae'; ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('点击卡片购买（可反复切换，自动退还） · 当前：' + (game.player.loadout ? game.player.loadout.name : '无'), W / 2, 116);

    // 价位表头
    ctx.font = 'bold 15px Consolas, monospace';
    for (var t = 0; t < this._tiers.length; t++) {
      ctx.fillStyle = '#546e7a';
      ctx.fillText('$' + this._tiers[t], this._tiersX[t], this._startY - 12);
    }

    // 卡片
    for (var i = 0; i < this.cards.length; i++) {
      this._card(ctx, game, this.cards[i], m);
    }

    // 出击按钮
    var rb = this.readyBtn, over = hit(m, rb);
    ctx.fillStyle = over ? '#43a047' : '#2e7d32';
    ctx.fillRect(rb.x, rb.y, rb.w, rb.h);
    ctx.strokeStyle = '#66bb6a'; ctx.lineWidth = 2; ctx.strokeRect(rb.x, rb.y, rb.w, rb.h);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillText('出 击  (' + Math.ceil(game.buyTimer) + 's)', W / 2, rb.y + 30);
    ctx.textAlign = 'left';
  };

  BuyMenu.prototype._card = function (ctx, game, card, m) {
    var l = card.loadout, r = card.rect;
    var afford = game.economy.money + game.spentThisRound >= l.cost;
    var selected = game.player.loadout && game.player.loadout.id === l.id;
    var over = hit(m, r);

    ctx.fillStyle = selected ? 'rgba(46,125,50,0.5)' : (over && afford ? 'rgba(55,71,79,0.95)' : 'rgba(30,40,48,0.92)');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = selected ? '#66bb6a' : (afford ? 'rgba(255,255,255,0.18)' : 'rgba(255,80,80,0.35)');
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

    ctx.textAlign = 'left';
    ctx.fillStyle = afford ? '#fff' : '#8d6e63';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(l.name, r.x + 12, r.y + 26);

    ctx.fillStyle = '#ffca28'; ctx.font = 'bold 13px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('$' + l.cost, r.x + r.w - 10, r.y + 24);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#90caf9'; ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText(l.tag, r.x + 12, r.y + 44);

    // 详情
    var prim = l.primary ? DF.getWeapon(l.primary).name : '无主武器';
    var sec = l.secondary ? DF.getWeapon(l.secondary).name : '—';
    ctx.fillStyle = '#cfd8dc'; ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.fillText('主：' + prim, r.x + 12, r.y + 64);
    ctx.fillText('副：' + sec, r.x + 12, r.y + 80);
    ctx.fillStyle = '#b0bec5';
    ctx.fillText('甲：' + DF.getVest(l.vest).name + ' · ' + DF.getHelmet(l.helmet).name, r.x + 12, r.y + 96);
    var items = (l.items || []).map(function (id) { return DF.getItem(id).name.replace(/（.*）/, ''); }).join('·');
    ctx.fillStyle = '#80cbc4';
    ctx.fillText(items.slice(0, 18), r.x + 12, r.y + 110);

    if (selected) {
      ctx.fillStyle = '#66bb6a'; ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('✓ 已选', r.x + r.w - 10, r.y + 44);
      ctx.textAlign = 'left';
    }
  };

  DF.BuyMenu = BuyMenu;
})(window.DF = window.DF || {});
