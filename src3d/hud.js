/* 3D 战斗 HUD —— DOM 覆盖层（血量/护甲/弹药/三方计分/回合/准星/击杀信息/横幅）
 * 卡通高清风格，自带内联样式。init(container) 后调用各 set 方法。
 */
(function (D3) {
  'use strict';

  function el(tag, css, html) { var d = document.createElement(tag); if (css) d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }

  var TEAM_HEX = { alpha:'#39C0FF', bravo:'#FF5A5A', charlie:'#FFC83D' };
  var TEAM_NAME = { alpha:'ALPHA', bravo:'BRAVO', charlie:'CHARLIE' };

  function HUD() {}

  HUD.prototype.init = function (root) {
    this.root = root;
    var style = el('style'); style.textContent = [
      '.h3-font{font-family:"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
      '.h3-panel{background:linear-gradient(180deg,rgba(18,22,38,.82),rgba(12,15,28,.9));border:2px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)}',
      '@keyframes h3pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}',
      '@keyframes h3flyin{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}',
      '@keyframes h3hit{0%{transform:scale(1.6);opacity:1}100%{transform:scale(.7);opacity:0}}',
      '@keyframes h3dmg{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}20%{transform:translate(-50%,-90%) scale(1.15);opacity:1}100%{transform:translate(-50%,-190%) scale(1);opacity:0}}',
      '@keyframes h3lowpulse{0%,100%{opacity:.35}50%{opacity:.85}}'
    ].join('\n');
    root.appendChild(style);

    // 动态准星（4 线 + 中心点，随移动/开火扩散）
    this.cross = el('div','position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:5;width:0;height:0');
    function mkV(){ return el('div','position:absolute;width:2px;height:8px;left:-1px;background:#fff;box-shadow:0 0 2px rgba(0,0,0,.9);border-radius:2px'); }
    function mkH(){ return el('div','position:absolute;height:2px;width:8px;top:-1px;background:#fff;box-shadow:0 0 2px rgba(0,0,0,.9);border-radius:2px'); }
    this.chT = mkV(); this.chB = mkV(); this.chL = mkH(); this.chR = mkH();
    this.chDot = el('div','position:absolute;width:3px;height:3px;left:-1.5px;top:-1.5px;background:#fff;border-radius:50%;box-shadow:0 0 2px rgba(0,0,0,.9)');
    this.cross.appendChild(this.chT); this.cross.appendChild(this.chB); this.cross.appendChild(this.chL); this.cross.appendChild(this.chR); this.cross.appendChild(this.chDot);
    root.appendChild(this.cross);
    this.setSpread(4);

    // 瞄准镜(狙击/精确射手)：黑色镜筒 + 十字分划
    this.scope = el('div','position:absolute;inset:0;z-index:6;pointer-events:none;display:none');
    this.scope.innerHTML =
      '<div style="position:absolute;left:50%;top:50%;width:70vh;height:70vh;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 100vmax rgba(0,0,0,.93),inset 0 0 70px rgba(0,0,0,.95);border:3px solid #05070c"></div>'+
      '<div style="position:absolute;left:50%;top:15%;width:1.5px;height:70%;background:rgba(10,12,18,.85);transform:translateX(-50%)"></div>'+
      '<div style="position:absolute;top:50%;left:15%;height:1.5px;width:70%;background:rgba(10,12,18,.85);transform:translateY(-50%)"></div>'+
      '<div style="position:absolute;left:50%;top:50%;width:5px;height:5px;background:#e23b3b;border-radius:50%;transform:translate(-50%,-50%)"></div>';
    root.appendChild(this.scope);

    // 红点/全息镜（步枪/冲锋枪 ADS）
    this.reddot = el('div','position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;pointer-events:none;display:none');
    this.reddot.innerHTML =
      '<div style="width:150px;height:150px;border-radius:50%;border:2px solid rgba(255,255,255,.10);box-shadow:inset 0 0 40px rgba(0,0,0,.35);position:relative">'+
      '<div style="position:absolute;left:50%;top:8%;width:1px;height:84%;background:rgba(255,255,255,.12);transform:translateX(-50%)"></div>'+
      '<div style="position:absolute;top:50%;left:8%;height:1px;width:84%;background:rgba(255,255,255,.12);transform:translateY(-50%)"></div>'+
      '<div style="position:absolute;left:50%;top:50%;width:7px;height:7px;background:#ff3b3b;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px #ff3b3b,0 0 20px rgba(255,59,59,.6)"></div></div>';
    root.appendChild(this.reddot);

    // 命中标记
    this.hitmark = el('div','position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:6;opacity:0');
    this.hitmark.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><g stroke="#ff5a5a" stroke-width="3" stroke-linecap="round"><line x1="6" y1="6" x2="11" y2="11"/><line x1="24" y1="6" x2="19" y2="11"/><line x1="6" y1="24" x2="11" y2="19"/><line x1="24" y1="24" x2="19" y2="19"/></g></svg>';
    root.appendChild(this.hitmark);

    // 左下：血量/护甲/体力
    var bl = el('div','position:absolute;left:22px;bottom:22px;z-index:5;min-width:250px;padding:12px 14px','');
    bl.className = 'h3-panel h3-font';
    bl.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
      '<span style="font-size:22px;font-weight:800;color:#fff;text-shadow:0 2px 4px #000" id="h3-hp">100</span>'+
      '<span style="font-size:11px;color:#9fb0c8;letter-spacing:1px">HP</span>'+
      '<span style="flex:1"></span>'+
      '<span style="font-size:12px;color:#8fd0ff;font-weight:700" id="h3-armor">🛡 0</span></div>'+
      '<div style="height:12px;background:#0c1020;border-radius:7px;overflow:hidden;border:1px solid rgba(255,255,255,.12)"><div id="h3-hpbar" style="height:100%;width:100%;background:linear-gradient(90deg,#38e08a,#7CFFB0);transition:width .12s"></div></div>'+
      '<div style="height:6px;margin-top:4px;background:#0c1020;border-radius:4px;overflow:hidden"><div id="h3-armorbar" style="height:100%;width:0%;background:linear-gradient(90deg,#39C0FF,#8fd0ff);transition:width .12s"></div></div>';
    root.appendChild(bl);

    // 右下：武器/弹药
    var br = el('div','position:absolute;right:22px;bottom:22px;z-index:5;text-align:right;padding:12px 16px','');
    br.className = 'h3-panel h3-font';
    br.innerHTML =
      '<div id="h3-wname" style="font-size:13px;color:#cfe0f5;font-weight:700;letter-spacing:.5px">QBZ95-1</div>'+
      '<div style="display:flex;align-items:baseline;gap:6px;justify-content:flex-end">'+
      '<span id="h3-ammo" style="font-size:34px;font-weight:900;color:#fff;text-shadow:0 2px 6px #000">30</span>'+
      '<span style="font-size:16px;color:#7f8ba3">/ <span id="h3-reserve">90</span></span></div>'+
      '<div style="display:flex;align-items:center;justify-content:flex-end;gap:9px;font-size:12px;color:#cfe0f5;font-weight:700;margin-top:2px">'+
        '<span title="破片(G)">💣<span id="h3-nfrag">2</span><span style="color:#5f6b83;font-size:9px">G</span></span>'+
        '<span title="烟雾(C)">💨<span id="h3-nsmoke">1</span><span style="color:#5f6b83;font-size:9px">C</span></span>'+
        '<span title="闪光(F)">⚡<span id="h3-nflash">1</span><span style="color:#5f6b83;font-size:9px">F</span></span></div>'+
      '<div id="h3-reload" style="font-size:11px;color:#FFC83D;height:14px;font-weight:700"></div>';
    root.appendChild(br);

    // 顶部中央：三方计分 + 回合计时
    var top = el('div','position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:10px','');
    top.className = 'h3-font';
    this.teamBoxes = {};
    ['alpha','bravo','charlie'].forEach(function (tk) {
      var b = el('div','padding:7px 12px;min-width:74px;text-align:center;border-radius:12px;border:2px solid '+TEAM_HEX[tk]+';background:rgba(12,15,28,.78)','');
      b.innerHTML = '<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:'+TEAM_HEX[tk]+'">'+TEAM_NAME[tk]+'</div>'+
        '<div style="font-size:9px;color:#9fb0c8;margin-top:1px">存活 <b class="a" style="color:#fff">3</b> · 胜 <b class="w" style="color:'+TEAM_HEX[tk]+'">0</b></div>'+
        '<div class="dots" style="margin-top:3px;letter-spacing:2px;font-size:8px"></div>';
      top.appendChild(b);
      this.teamBoxes[tk] = b;
    }, this);
    // 计时器插到中间
    this.timer = el('div','padding:6px 14px;border-radius:12px;background:rgba(12,15,28,.85);border:2px solid rgba(255,255,255,.18);font-size:20px;font-weight:900;color:#fff;min-width:60px;text-align:center','1:15');
    top.insertBefore(this.timer, top.children[1]);
    root.appendChild(top);
    this.topBar = top;

    // PvE 波次面板
    this.pvePanel = el('div','position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;display:none;gap:10px;align-items:center','');
    this.pvePanel.className = 'h3-font';
    this.pvePanel.style.display = 'none';
    this.pvePanel.innerHTML =
      '<div class="h3-panel" style="display:flex;gap:16px;align-items:center;padding:8px 20px">'+
      '<div style="text-align:center"><div style="font-size:10px;color:#9fb0c8;letter-spacing:1px">波次</div><div style="font-size:22px;font-weight:900;color:#ff8a3d" id="h3-wave">1</div></div>'+
      '<div style="width:1px;height:28px;background:rgba(255,255,255,.15)"></div>'+
      '<div style="text-align:center"><div style="font-size:10px;color:#9fb0c8;letter-spacing:1px">剩余怪物</div><div style="font-size:22px;font-weight:900;color:#4FA63B" id="h3-mleft">0</div></div>'+
      '<div style="width:1px;height:28px;background:rgba(255,255,255,.15)"></div>'+
      '<div style="text-align:center"><div style="font-size:10px;color:#9fb0c8;letter-spacing:1px">得分</div><div style="font-size:22px;font-weight:900;color:#FFC83D" id="h3-score">0</div></div>'+
      '</div>';
    root.appendChild(this.pvePanel);

    // 击杀信息（右上）
    this.feed = el('div','position:absolute;right:20px;top:70px;z-index:5;width:280px;text-align:right','');
    this.feed.className = 'h3-font';
    root.appendChild(this.feed);

    // 中央大横幅
    this.banner = el('div','position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);z-index:8;text-align:center;pointer-events:none;display:none','');
    this.banner.className = 'h3-font';
    root.appendChild(this.banner);

    // 底部提示
    this.tip = el('div','position:absolute;left:50%;bottom:6px;transform:translateX(-50%);z-index:4;font-size:11px;color:#7f8ba3','WASD 移动 · 鼠标瞄准 · 左键开火 · 右键瞄准镜 · R 换弹 · Shift 冲刺');
    this.tip.className = 'h3-font';
    root.appendChild(this.tip);

    // 静态电影暗角（永久，增强氛围）
    this.cine = el('div','position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 75% 75% at center,transparent 55%,rgba(0,0,0,.42) 100%)');
    root.appendChild(this.cine);
    // 闪光致盲白屏
    this.flashVig = el('div','position:absolute;inset:0;z-index:9;pointer-events:none;opacity:0;background:#fff');
    root.appendChild(this.flashVig); this._flash = 0;
    // 受击红色血屏
    this.hurtVig = el('div','position:absolute;inset:0;z-index:3;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(200,20,20,.55) 100%)');
    root.appendChild(this.hurtVig); this._hurt = 0;
    // 残血脉冲血屏
    this.lowVig = el('div','position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(180,0,0,.5) 100%);transition:opacity .3s');
    root.appendChild(this.lowVig);
    // 来袭方向指示器（围绕准星旋转的红弧）
    this.dmgDir = el('div','position:absolute;left:50%;top:50%;width:180px;height:180px;transform:translate(-50%,-50%);z-index:6;pointer-events:none;opacity:0');
    this.dmgDir.innerHTML = '<svg width="180" height="180" viewBox="0 0 180 180"><path d="M 66 26 A 70 70 0 0 1 114 26" fill="none" stroke="#ff3b3b" stroke-width="7" stroke-linecap="round"/></svg>';
    root.appendChild(this.dmgDir); this._dir = 0;

    // 浮动伤害数字层
    this.dmgLayer = el('div','position:absolute;inset:0;z-index:7;pointer-events:none;overflow:hidden');
    root.appendChild(this.dmgLayer);

    // 开场大倒计时
    this.bigNum = el('div','position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);z-index:8;pointer-events:none;font-weight:900;font-size:120px;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.7);display:none');
    this.bigNum.className = 'h3-font';
    root.appendChild(this.bigNum);

    // 个人击杀计数（左上）
    this.killsBox = el('div','position:absolute;left:22px;top:14px;z-index:5;padding:8px 14px;display:flex;align-items:center;gap:8px','');
    this.killsBox.className = 'h3-panel h3-font';
    this.killsBox.innerHTML = '<span style="font-size:20px">🎯</span><span style="font-size:22px;font-weight:900;color:#fff" id="h3-kills">0</span><span style="font-size:11px;color:#9fb0c8;letter-spacing:1px">本局击杀</span>';
    root.appendChild(this.killsBox);

    // 小地图雷达（右上）
    this.mmWrap = el('div','position:absolute;right:20px;top:70px;z-index:5;width:150px;height:150px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.18);box-shadow:0 6px 20px rgba(0,0,0,.4)');
    this.mm = document.createElement('canvas'); this.mm.width = 150; this.mm.height = 150;
    this.mm.style.cssText = 'display:block;width:150px;height:150px;background:rgba(10,14,26,.72)';
    this.mmWrap.appendChild(this.mm);
    this.mmCtx = this.mm.getContext && this.mm.getContext('2d');
    root.appendChild(this.mmWrap);
    // 移动击杀信息层，避免与雷达重叠
    this.feed.style.top = '232px';

    // 计分板（Tab）
    this.sboard = el('div','position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;min-width:520px;padding:20px 24px;display:none');
    this.sboard.className = 'h3-panel h3-font';
    root.appendChild(this.sboard);

    // 暂停菜单（Esc）
    this.pause = el('div','position:absolute;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(6,9,18,.72)');
    this.pause.className = 'h3-font';
    this.pause.style.pointerEvents = 'auto';
    root.appendChild(this.pause);

    // 赛前武器选择条（倒计时期间）
    this.loadout = el('div','position:absolute;left:50%;bottom:120px;transform:translateX(-50%);z-index:9;display:none;text-align:center');
    this.loadout.className = 'h3-font';
    this.loadout.style.pointerEvents = 'auto';
    root.appendChild(this.loadout);

    this._q = function (id) { return document.getElementById(id); };
  };

  // 动态准星扩散
  HUD.prototype.setSpread = function (g) {
    g = Math.max(2, g);
    this.chT.style.top = -(g + 8) + 'px'; this.chB.style.top = g + 'px';
    this.chL.style.left = -(g + 8) + 'px'; this.chR.style.left = g + 'px';
  };

  // 瞄准镜：type = 'sniper' | 'marksman' | 'reddot' | null
  HUD.prototype.setScope = function (type) {
    if (this._scopeType === type) return; this._scopeType = type;
    var tube = (type === 'sniper' || type === 'marksman');
    this.scope.style.display = tube ? 'block' : 'none';
    this.reddot.style.display = (type === 'reddot') ? 'block' : 'none';
    this.cross.style.display = type ? 'none' : 'block';
  };

  HUD.prototype.setNades = function (n) {
    if (typeof n === 'object' && n) {
      var f = this._q('h3-nfrag'), s = this._q('h3-nsmoke'), l = this._q('h3-nflash');
      if (f) f.textContent = n.frag; if (s) s.textContent = n.smoke; if (l) l.textContent = n.flash;
    }
  };
  // 闪光致盲白屏
  HUD.prototype.flashBlind = function (inten) {
    this._flash = Math.max(this._flash || 0, Math.min(1, inten));
    if (this.flashVig) this.flashVig.style.opacity = this._flash;
  };
  // 拾取/提示气泡
  HUD.prototype.toast = function (msg, color) {
    var d = el('div', 'position:absolute;left:50%;top:70%;transform:translate(-50%,-50%);z-index:8;pointer-events:none;font-weight:800;font-size:18px;color:' + (color || '#fff') + ';text-shadow:0 2px 8px #000;animation:h3pop .4s ease', msg);
    d.className = 'h3-font';
    this.dmgLayer.appendChild(d);
    setTimeout(function () { d.style.transition = 'opacity .5s,transform .5s'; d.style.opacity = '0'; d.style.transform = 'translate(-50%,-120%)'; setTimeout(function () { d.remove(); }, 500); }, 600);
  };

  // 计分板：rows = [{team, name, kills, deaths, isPlayer, alive}]
  HUD.prototype.showScoreboard = function (teams) {
    var order = ['alpha','bravo','charlie'];
    var html = '<div style="font-size:15px;font-weight:800;color:#cfe0f5;margin-bottom:12px;text-align:center;letter-spacing:2px">战 况 计 分 板</div>';
    for (var t = 0; t < order.length; t++) {
      var tk = order[t], td = teams[tk];
      html += '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;border-bottom:2px solid '+TEAM_HEX[tk]+';padding-bottom:3px;margin-bottom:4px">'+
        '<span style="font-weight:800;color:'+TEAM_HEX[tk]+';letter-spacing:1px">'+TEAM_NAME[tk]+'</span>'+
        '<span style="font-size:11px;color:#9fb0c8">胜 '+td.wins+' · 存活 '+td.alive+'/'+td.members.length+'</span></div>';
      for (var m = 0; m < td.members.length; m++) {
        var p = td.members[m];
        html += '<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:2px 4px;'+(p.isPlayer?'background:rgba(255,255,255,.08);border-radius:5px;':'')+(p.alive?'':'opacity:.42;')+'">'+
          '<span style="color:'+(p.isPlayer?'#fff':'#cfe0f5')+'">'+(p.isPlayer?'▸ 你':'干员 '+(m+1))+(p.alive?'':' ☠')+'</span>'+
          '<span style="color:#9fb0c8">击杀 <b style="color:#fff">'+p.kills+'</b> · 阵亡 <b style="color:#fff">'+p.deaths+'</b></span></div>';
      }
      html += '</div>';
    }
    this.sboard.innerHTML = html; this.sboard.style.display = 'block';
  };
  HUD.prototype.hideScoreboard = function () { this.sboard.style.display = 'none'; };

  // 暂停菜单 + 设置
  HUD.prototype.showPause = function (opts) {
    var self = this;
    this.pause.innerHTML = '';
    var card = el('div','width:360px;padding:28px 30px;text-align:center');
    card.className = 'h3-panel';
    card.innerHTML = '<div style="font-size:30px;font-weight:900;color:#fff;margin-bottom:4px">已暂停</div>'+
      '<div style="font-size:12px;color:#9fb0c8;margin-bottom:20px">Esc 或点击继续返回战斗</div>';
    var sBox = el('div','text-align:left;margin-bottom:18px');
    sBox.innerHTML = '<div style="font-size:12px;color:#cfe0f5;margin-bottom:4px">鼠标灵敏度 <span id="h3-sensv" style="color:#8fd0ff;float:right"></span></div>';
    var sens = document.createElement('input'); sens.type='range'; sens.min='30'; sens.max='300'; sens.value=String(Math.round(opts.sens*10000)); sens.style.cssText='width:100%';
    sBox.appendChild(sens);
    var vBoxLabel = el('div','font-size:12px;color:#cfe0f5;margin:12px 0 4px'); vBoxLabel.innerHTML='音量 <span id="h3-volv" style="color:#8fd0ff;float:right"></span>'; sBox.appendChild(vBoxLabel);
    var vol = document.createElement('input'); vol.type='range'; vol.min='0'; vol.max='100'; vol.value=String(Math.round(opts.volume*100)); vol.style.cssText='width:100%';
    sBox.appendChild(vol);
    card.appendChild(sBox);
    function mkBtn(label, bg, cb){ var b=el('button', 'display:block;width:100%;margin-top:8px;padding:11px;font-size:15px;font-weight:800;border:none;border-radius:11px;cursor:pointer;'+bg, label); b.addEventListener('click', cb); return b; }
    card.appendChild(mkBtn('▶ 继续战斗','background:linear-gradient(90deg,#39C0FF,#7CFFB0);color:#04121f', function(){ opts.onResume && opts.onResume(); }));
    card.appendChild(mkBtn('↻ 重新开始比赛','background:rgba(255,255,255,.08);color:#cfe0f5', function(){ opts.onRestart && opts.onRestart(); }));
    card.appendChild(mkBtn('🏠 返回主菜单','background:rgba(255,255,255,.08);color:#cfe0f5', function(){ location.href='index.html'; }));
    this.pause.appendChild(card);
    var sv=this._q('h3-sensv'), vv=this._q('h3-volv');
    function upd(){ if(sv) sv.textContent=(sens.value/100).toFixed(2)+'x'; if(vv) vv.textContent=vol.value+'%'; }
    sens.addEventListener('input', function(){ opts.onSens && opts.onSens(sens.value/10000); upd(); });
    vol.addEventListener('input', function(){ opts.onVolume && opts.onVolume(vol.value/100); upd(); });
    upd();
    this.pause.style.display = 'flex';
  };
  HUD.prototype.hidePause = function () { this.pause.style.display = 'none'; };

  // 赛前武器选择：items=[{id,name,cat}], onPick(index)
  HUD.prototype.showLoadout = function (items, current, onPick) {
    var html = '<div style="font-size:12px;color:#9fb0c8;margin-bottom:8px;letter-spacing:1px">选择武器（数字键 1-'+items.length+' 或点击）</div><div style="display:flex;gap:8px;justify-content:center">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i], sel = i === current;
      html += '<div data-idx="'+i+'" class="h3-lo" style="cursor:pointer;padding:8px 12px;border-radius:10px;min-width:96px;'+
        'background:'+(sel?'linear-gradient(180deg,#1c4a6e,#123049)':'rgba(18,22,38,.85)')+';border:2px solid '+(sel?'#39C0FF':'rgba(255,255,255,.12)')+'">'+
        '<div style="font-size:9px;color:#7f8ba3">'+(i+1)+' · '+it.cat+'</div>'+
        '<div style="font-size:13px;font-weight:800;color:'+(sel?'#8fd0ff':'#cfe0f5')+';margin-top:2px">'+it.name+'</div></div>';
    }
    html += '</div>';
    this.loadout.innerHTML = html; this.loadout.style.display = 'block';
    var nodes = this.loadout.querySelectorAll ? this.loadout.querySelectorAll('.h3-lo') : [];
    for (var n = 0; n < nodes.length; n++) (function(node){ node.addEventListener('click', function(){ onPick(parseInt(node.getAttribute('data-idx'),10)); }); })(nodes[n]);
  };
  HUD.prototype.hideLoadout = function () { this.loadout.style.display = 'none'; };

  // 每帧维护血屏/方向指示衰减
  HUD.prototype.update = function (dt) {
    if (this._hurt > 0) { this._hurt = Math.max(0, this._hurt - dt * 1.6); this.hurtVig.style.opacity = this._hurt.toFixed(3); }
    if (this._dir > 0) { this._dir = Math.max(0, this._dir - dt * 1.2); this.dmgDir.style.opacity = this._dir.toFixed(3); }
    if (this._flash > 0) { this._flash = Math.max(0, this._flash - dt * 0.5); this.flashVig.style.opacity = this._flash.toFixed(3); }
  };

  // 玩家受击：红屏 + 来袭方向（angle: 目标相对玩家朝向的角度, 弧度; 0=正前）
  HUD.prototype.hurt = function (angleRad) {
    this._hurt = Math.min(0.9, this._hurt + 0.55);
    this.hurtVig.style.opacity = this._hurt.toFixed(3);
    if (angleRad != null) {
      this.dmgDir.style.transform = 'translate(-50%,-50%) rotate(' + (angleRad * 180 / Math.PI) + 'deg)';
      this._dir = 1; this.dmgDir.style.opacity = '1';
    }
  };

  // 残血脉冲
  HUD.prototype.setLow = function (isLow) {
    if (this._low === isLow) return; this._low = isLow;
    this.lowVig.style.opacity = isLow ? '0.85' : '0';
    this.lowVig.style.animation = isLow ? 'h3lowpulse 1s ease-in-out infinite' : 'none';
  };

  // 浮动伤害数字（屏幕坐标 x,y）
  HUD.prototype.dmgNumber = function (x, y, amount, crit) {
    var d = el('span', 'position:absolute;left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,-50%);font-weight:900;pointer-events:none;'
      + 'font-size:' + (crit ? 30 : 20) + 'px;color:' + (crit ? '#ffd23d' : '#ffffff') + ';text-shadow:0 2px 6px rgba(0,0,0,.9);animation:h3dmg .8s ease-out forwards');
    d.className = 'h3-font';
    d.textContent = (crit ? '' : '') + Math.round(amount) + (crit ? ' 爆头!' : '');
    this.dmgLayer.appendChild(d);
    setTimeout(function () { d.remove(); }, 850);
  };

  HUD.prototype.setKills = function (n) { var e = this._q('h3-kills'); if (e) e.textContent = n; };
  HUD.prototype.killPopup = function (victimName) {
    var d = el('div', 'position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);z-index:8;pointer-events:none;font-weight:900;font-size:26px;color:#ff5a3d;text-shadow:0 3px 10px #000;animation:h3pop .5s ease', '击败 ' + victimName + '!');
    d.className = 'h3-font';
    this.dmgLayer.appendChild(d);
    setTimeout(function () { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(function () { d.remove(); }, 400); }, 700);
  };

  HUD.prototype.setCountdown = function (n) {
    if (n == null) { this.bigNum.style.display = 'none'; return; }
    this.bigNum.style.display = 'block';
    if (this.bigNum.textContent !== String(n)) { this.bigNum.textContent = n; this.bigNum.style.animation = 'none'; void this.bigNum.offsetWidth; this.bigNum.style.animation = 'h3pop .4s ease'; }
  };

  // 绘制小地图雷达（以玩家为中心, 朝向朝上）
  HUD.prototype.drawMinimap = function (fighters, player, radius) {
    var ctx = this.mmCtx; if (!ctx) return;
    var S = 150, C = S / 2, scale = (C - 12) / radius;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,14,26,.72)'; ctx.fillRect(0, 0, S, S);
    // 网格圈
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(C, C, C - 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(C, C, (C - 12) / 2, 0, Math.PI * 2); ctx.stroke();
    var pa = player ? player.yaw : 0, cos = Math.cos(pa), sin = Math.sin(pa);
    var COL = { alpha: '#39C0FF', bravo: '#FF5A5A', charlie: '#FFC83D' };
    for (var i = 0; i < fighters.length; i++) {
      var f = fighters[i]; if (!f.alive) continue;
      var dx = f.pos.x - (player ? player.pos.x : 0), dz = f.pos.z - (player ? player.pos.z : 0);
      // 以玩家朝向为“上”旋转
      var rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      var px = C + rx * scale, py = C + rz * scale;
      var dd = Math.hypot(px - C, py - C); if (dd > C - 8) { px = C + (px - C) / dd * (C - 8); py = C + (py - C) / dd * (C - 8); }
      ctx.fillStyle = COL[f.team] || '#fff';
      ctx.beginPath(); ctx.arc(px, py, f === player ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
      if (f === player) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // 玩家朝向三角（正上方）
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(C, C - 9); ctx.lineTo(C - 4, C - 2); ctx.lineTo(C + 4, C - 2); ctx.closePath(); ctx.fill();
  };

  HUD.prototype.setVitals = function (hp, maxHp, armor) {
    this._q('h3-hp').textContent = Math.max(0, Math.ceil(hp));
    this._q('h3-hpbar').style.width = Math.max(0, hp/maxHp*100) + '%';
    var bar = this._q('h3-hpbar');
    bar.style.background = hp/maxHp > 0.5 ? 'linear-gradient(90deg,#38e08a,#7CFFB0)' : (hp/maxHp>0.25?'linear-gradient(90deg,#FFC83D,#ffe08a)':'linear-gradient(90deg,#e0392b,#ff6b5a)');
    this._q('h3-armor').textContent = '🛡 ' + Math.max(0, Math.ceil(armor));
    this._q('h3-armorbar').style.width = Math.min(100, armor/110*100) + '%';
    this.setLow(hp > 0 && hp/maxHp < 0.3);
  };

  HUD.prototype.setWeapon = function (name, ammo, reserve, reloading) {
    this._q('h3-wname').textContent = name;
    this._q('h3-ammo').textContent = ammo;
    this._q('h3-reserve').textContent = reserve;
    this._q('h3-ammo').style.color = ammo === 0 ? '#ff5a5a' : '#fff';
    this._q('h3-reload').textContent = reloading ? '换弹中…' : '';
  };

  // 隐藏/显示某队计分框（2 队模式隐藏 CHARLIE）
  HUD.prototype.setTeamActive = function (team, active) {
    var b = this.teamBoxes && this.teamBoxes[team]; if (b) b.style.display = active ? 'block' : 'none';
  };

  HUD.prototype.setTeams = function (alive, wins, roundsToWin) {
    var keys = ['alpha','bravo','charlie'];
    for (var i = 0; i < keys.length; i++) {
      var b = this.teamBoxes[keys[i]];
      b.querySelector('.a').textContent = alive[keys[i]];
      b.querySelector('.w').textContent = wins[keys[i]];
      b.style.opacity = alive[keys[i]] > 0 ? '1' : '0.4';
      var dots = ''; for (var d = 0; d < (roundsToWin||3); d++) dots += (d < wins[keys[i]] ? '●' : '○');
      b.querySelector('.dots').innerHTML = '<span style="color:'+TEAM_HEX[keys[i]]+'">'+dots+'</span>';
    }
  };

  // PvE：切换波次面板 / 更新数据
  HUD.prototype.setPve = function (on) {
    this.topBar.style.display = on ? 'none' : 'flex';
    this.pvePanel.style.display = on ? 'flex' : 'none';
    var kb = this.killsBox; if (kb) kb.querySelector('span:last-child').textContent = on ? '击杀数' : '本局击杀';
  };
  HUD.prototype.setWaveInfo = function (wave, left, score) {
    var w = this._q('h3-wave'), l = this._q('h3-mleft'), s = this._q('h3-score');
    if (w) w.textContent = wave; if (l) l.textContent = left; if (s) s.textContent = score;
  };

  HUD.prototype.setTimer = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec/60), s = sec%60;
    this.timer.textContent = m + ':' + (s<10?'0':'') + s;
    this.timer.style.color = sec <= 10 ? '#ff5a5a' : '#fff';
  };

  HUD.prototype.kill = function (killerTeam, killerName, victimTeam, victimName, headshot) {
    var row = el('div','margin-bottom:5px;padding:5px 10px;border-radius:8px;background:rgba(12,15,28,.8);display:inline-block;animation:h3flyin .25s ease','');
    row.innerHTML = '<b style="color:'+TEAM_HEX[killerTeam]+'">'+killerName+'</b>'+
      '<span style="color:#cfe0f5;margin:0 6px">'+(headshot?'💥':'⟶')+'</span>'+
      '<b style="color:'+TEAM_HEX[victimTeam]+'">'+victimName+'</b>';
    this.feed.appendChild(row);
    setTimeout(function(){ row.style.transition='opacity .4s'; row.style.opacity='0'; setTimeout(function(){ row.remove(); }, 400); }, 3800);
    while (this.feed.children.length > 5) this.feed.removeChild(this.feed.firstChild);
  };

  HUD.prototype.hitMarker = function (kill) {
    this.hitmark.style.animation = 'none'; void this.hitmark.offsetWidth;
    this.hitmark.querySelectorAll('line').forEach(function(l){ l.setAttribute('stroke', kill?'#ff3b3b':'#fff'); });
    this.hitmark.style.animation = 'h3hit .3s ease';
  };

  HUD.prototype.showBanner = function (title, sub, color) {
    this.banner.style.display = 'block';
    this.banner.innerHTML = '<div style="font-size:52px;font-weight:900;color:'+(color||'#fff')+';text-shadow:0 4px 18px rgba(0,0,0,.7);animation:h3pop .4s ease">'+title+'</div>'+
      (sub?'<div style="font-size:18px;color:#cfe0f5;margin-top:6px;text-shadow:0 2px 8px #000">'+sub+'</div>':'');
  };
  HUD.prototype.hideBanner = function () { this.banner.style.display = 'none'; };

  // ——————— 起床之战 HUD ———————
  HUD.prototype._ensureBedUI = function () {
    if (this.bedPanel) return;
    var root = this.root;
    // 顶部三方床铺状态
    var bp = el('div', 'position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;display:none;gap:10px;align-items:center');
    bp.className = 'h3-font';
    this.bedBoxes = {};
    ['alpha','bravo','charlie'].forEach(function (tk) {
      var b = el('div','padding:7px 12px;min-width:96px;text-align:center;border-radius:12px;border:2px solid '+TEAM_HEX[tk]+';background:rgba(12,15,28,.78)');
      b.innerHTML = '<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:'+TEAM_HEX[tk]+'">'+TEAM_NAME[tk]+'</div>'+
        '<div class="bed" style="font-size:15px;margin-top:1px">🛏</div>'+
        '<div style="font-size:9px;color:#9fb0c8;margin-top:1px">存活 <b class="a" style="color:#fff">3</b></div>';
      bp.appendChild(b); this.bedBoxes[tk] = b;
    }, this);
    root.appendChild(bp); this.bedPanel = bp;
    // 资源计数（击杀盒下方）
    var rb = el('div','position:absolute;left:22px;top:58px;z-index:5;padding:6px 14px;display:none;align-items:center;gap:8px');
    rb.className = 'h3-panel h3-font';
    rb.innerHTML = '<span style="font-size:18px">💎</span><span style="font-size:20px;font-weight:900;color:#7CFFB0" id="h3-res">0</span><span style="font-size:11px;color:#9fb0c8;letter-spacing:1px">资源 · B 商店</span>';
    root.appendChild(rb); this.resBox = rb;
  };
  HUD.prototype.setBedMode = function (on) {
    this._ensureBedUI();
    this.topBar.style.display = on ? 'none' : 'flex';
    this.pvePanel.style.display = 'none';
    this.bedPanel.style.display = on ? 'flex' : 'none';
    this.resBox.style.display = on ? 'flex' : 'none';
    if (on && this.killsBox) this.killsBox.querySelector('span:last-child').textContent = '本局击杀';
  };
  HUD.prototype.setResources = function (n) { var e = this._q('h3-res'); if (e) e.textContent = n; };
  // status: {alpha:{bedAlive, alive}, ...}
  HUD.prototype.setBedStatus = function (status) {
    if (!this.bedBoxes) return;
    var keys = ['alpha','bravo','charlie'];
    for (var i = 0; i < keys.length; i++) {
      var st = status[keys[i]], b = this.bedBoxes[keys[i]]; if (!st) continue;
      var out = !st.bedAlive && st.alive === 0;
      b.querySelector('.bed').innerHTML = st.bedAlive ? '🛏' : '<span style="color:#ff5a5a">✖ 床已毁</span>';
      b.querySelector('.a').textContent = st.alive;
      b.style.opacity = out ? '0.35' : '1';
    }
  };
  // 商店：items=[{id,name,cat,cost,owned}], onBuy(index)
  HUD.prototype.showShop = function (items, resources, onBuy) {
    var html = '<div style="font-size:12px;color:#9fb0c8;margin-bottom:8px;letter-spacing:1px">🛒 武器商店 · 资源 '+resources+'（数字键 1-'+items.length+' 购买 · B 关闭）</div><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;max-width:760px">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i], afford = it.owned || resources >= it.cost;
      html += '<div data-idx="'+i+'" class="h3-lo" style="cursor:'+(afford?'pointer':'not-allowed')+';padding:8px 12px;border-radius:10px;min-width:104px;'+
        'background:'+(it.owned?'linear-gradient(180deg,#1c4a6e,#123049)':'rgba(18,22,38,.9)')+';border:2px solid '+(it.owned?'#39C0FF':(afford?'rgba(124,255,176,.5)':'rgba(255,90,90,.35)'))+';'+(afford?'':'opacity:.5')+'">'+
        '<div style="font-size:9px;color:#7f8ba3">'+(i+1)+' · '+it.cat+'</div>'+
        '<div style="font-size:13px;font-weight:800;color:#cfe0f5;margin-top:2px">'+it.name+'</div>'+
        '<div style="font-size:11px;font-weight:800;margin-top:3px;color:'+(it.owned?'#8fd0ff':(afford?'#7CFFB0':'#ff8a8a'))+'">'+(it.owned?'已装备':'💎 '+it.cost)+'</div></div>';
    }
    html += '</div>';
    this.loadout.innerHTML = html; this.loadout.style.display = 'block';
    var nodes = this.loadout.querySelectorAll ? this.loadout.querySelectorAll('.h3-lo') : [];
    for (var n = 0; n < nodes.length; n++) (function(node){ node.addEventListener('click', function(){ onBuy(parseInt(node.getAttribute('data-idx'),10)); }); })(nodes[n]);
  };

  // ——————— 轻轨争夺战 HUD ———————
  HUD.prototype._ensureRailUI = function () {
    if (this.railPanel) return;
    var root = this.root;
    var rp = el('div', 'position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;display:none;flex-direction:column;align-items:center;gap:4px');
    rp.className = 'h3-font';
    var bars = el('div', 'display:flex;gap:10px;align-items:center');
    this.railBars = {};
    ['alpha','bravo','charlie'].forEach(function (tk) {
      var b = el('div','padding:6px 10px;min-width:110px;border-radius:11px;border:2px solid '+TEAM_HEX[tk]+';background:rgba(12,15,28,.8)');
      b.innerHTML = '<div style="font-size:10px;font-weight:800;letter-spacing:1px;color:'+TEAM_HEX[tk]+';display:flex;justify-content:space-between">'+TEAM_NAME[tk]+'<span class="sc" style="color:#fff">0</span></div>'+
        '<div style="height:7px;margin-top:3px;background:#0c1020;border-radius:4px;overflow:hidden"><div class="bar" style="height:100%;width:0%;background:'+TEAM_HEX[tk]+';transition:width .3s"></div></div>';
      bars.appendChild(b); this.railBars[tk] = b;
    }, this);
    rp.appendChild(bars);
    var ctl = el('div','font-size:12px;font-weight:800;color:#cfe0f5;text-shadow:0 2px 6px #000','🚊 轻轨：无人控制');
    rp.appendChild(ctl); this.railCtl = ctl;
    root.appendChild(rp); this.railPanel = rp;
  };
  HUD.prototype.setRailMode = function (on) {
    this._ensureRailUI();
    this.topBar.style.display = on ? 'none' : 'flex';
    this.pvePanel.style.display = 'none';
    if (this.bedPanel) this.bedPanel.style.display = 'none';
    this.railPanel.style.display = on ? 'flex' : 'none';
    if (on && this.killsBox) this.killsBox.querySelector('span:last-child').textContent = '本局击杀';
  };
  HUD.prototype.setRailStatus = function (scores, controller, target) {
    if (!this.railBars) return;
    var keys = ['alpha','bravo','charlie'];
    for (var i = 0; i < keys.length; i++) {
      var b = this.railBars[keys[i]], sc = scores[keys[i]] || 0;
      b.querySelector('.sc').textContent = sc;
      b.querySelector('.bar').style.width = Math.min(100, sc / (target || 100) * 100) + '%';
      b.style.opacity = (controller === keys[i]) ? '1' : '0.82';
      b.style.boxShadow = (controller === keys[i]) ? '0 0 14px ' + TEAM_HEX[keys[i]] : 'none';
    }
    if (this.railCtl) {
      this.railCtl.innerHTML = controller
        ? '🚊 轻轨控制：<b style="color:' + TEAM_HEX[controller] + '">' + TEAM_NAME[controller] + '</b>'
        : '🚊 轻轨：<span style="color:#ffb14a">争夺中 / 无人</span>';
    }
  };

  // ——————— 团队竞技 HUD（两队击杀进度）———————
  HUD.prototype._ensureTdmUI = function () {
    if (this.tdmPanel) return;
    var root = this.root;
    var tp = el('div', 'position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:5;display:none;flex-direction:column;align-items:center;gap:3px');
    tp.className = 'h3-font';
    var row = el('div', 'display:flex;gap:8px;align-items:center');
    this.tdmBars = {};
    var self = this;
    ['alpha', 'bravo'].forEach(function (tk, i) {
      if (i === 1) { var vs = el('div', 'font-size:15px;font-weight:900;color:#fff;text-shadow:0 2px 6px #000;padding:0 2px', 'VS'); row.appendChild(vs); }
      var b = el('div', 'padding:6px 12px;min-width:150px;border-radius:12px;border:2px solid ' + TEAM_HEX[tk] + ';background:rgba(12,15,28,.82)');
      b.innerHTML = '<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:' + TEAM_HEX[tk] + ';display:flex;justify-content:space-between;gap:14px">' + TEAM_NAME[tk] + '<span class="sc" style="color:#fff;font-size:15px">0</span></div>' +
        '<div style="height:7px;margin-top:3px;background:#0c1020;border-radius:4px;overflow:hidden"><div class="bar" style="height:100%;width:0%;background:' + TEAM_HEX[tk] + ';transition:width .3s"></div></div>';
      row.appendChild(b); self.tdmBars[tk] = b;
    });
    tp.appendChild(row);
    var tgt = el('div', 'font-size:11px;font-weight:800;color:#cfe0f5;text-shadow:0 2px 6px #000', '⚔️ 团队竞技 · 先达目标击杀获胜');
    tp.appendChild(tgt); this.tdmTgt = tgt;
    root.appendChild(tp); this.tdmPanel = tp;
  };
  HUD.prototype.setTdmMode = function (on) {
    this._ensureTdmUI();
    this.topBar.style.display = on ? 'none' : 'flex';
    if (this.pvePanel) this.pvePanel.style.display = 'none';
    if (this.bedPanel) this.bedPanel.style.display = 'none';
    if (this.railPanel) this.railPanel.style.display = 'none';
    this.tdmPanel.style.display = on ? 'flex' : 'none';
    if (on && this.killsBox) this.killsBox.querySelector('span:last-child').textContent = '本局击杀';
  };
  HUD.prototype.setTdmStatus = function (scores, target) {
    if (!this.tdmBars) return;
    var keys = ['alpha', 'bravo'], lead = scores.alpha === scores.bravo ? null : (scores.alpha > scores.bravo ? 'alpha' : 'bravo');
    for (var i = 0; i < keys.length; i++) {
      var b = this.tdmBars[keys[i]], sc = scores[keys[i]] || 0;
      b.querySelector('.sc').textContent = sc;
      b.querySelector('.bar').style.width = Math.min(100, sc / (target || 50) * 100) + '%';
      b.style.opacity = (lead === keys[i] || !lead) ? '1' : '0.82';
      b.style.boxShadow = (lead === keys[i]) ? '0 0 14px ' + TEAM_HEX[keys[i]] : 'none';
    }
    if (this.tdmTgt) this.tdmTgt.innerHTML = '⚔️ 目标击杀 <b style="color:#ffd27a">' + (target || 50) + '</b>';
  };

  D3.HUD = new HUD();
})(window.D3 = window.D3 || {});
