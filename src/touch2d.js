/* 手游触屏操控层（2D 经典版）—— 双摇杆：左移动 / 右瞄准开火 + 动作按钮
 * 仅触屏设备启用；非战斗阶段放行原生点击（开始/购买菜单靠点击操作）。
 */
(function (DF) {
  'use strict';

  var forced = /[?&]touch=1/.test(location.search);
  var isTouch = forced || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  if (!isTouch || /[?&]touch=0/.test(location.search)) return;

  var JOY_R = 60;
  function el(tag, css, html) { var d = document.createElement(tag); if (css) d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }
  function capture(elm, id) { try { elm.setPointerCapture(id); } catch (e) {} }

  function boot() {
    var game = DF.instance;
    if (!game || !game.player) { requestAnimationFrame(boot); return; }
    build(game);
  }

  function build(game) {
    var inp = game.input;
    var root = el('div', 'position:fixed;inset:0;z-index:20;pointer-events:none;touch-action:none;-webkit-user-select:none;user-select:none;font-family:"Segoe UI",system-ui,sans-serif');
    document.body.appendChild(root);

    // 左：移动摇杆（动态）
    var moveZone = el('div', 'position:absolute;left:0;bottom:0;width:42%;height:60%;pointer-events:auto;touch-action:none');
    root.appendChild(moveZone);
    var base = el('div', 'position:absolute;width:' + (JOY_R * 2) + 'px;height:' + (JOY_R * 2) + 'px;border-radius:50%;border:2px solid rgba(255,255,255,.28);background:rgba(10,15,28,.28);display:none');
    var knob = el('div', 'position:absolute;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(120,200,255,.9),rgba(40,110,190,.8));border:2px solid rgba(255,255,255,.5)');
    base.appendChild(knob); root.appendChild(base);
    var mId = null, mbx = 0, mby = 0;
    function setKeys(dx, dy) {
      var k = inp.keys, dead = 0.28;
      k['w'] = dy < -dead; k['s'] = dy > dead; k['a'] = dx < -dead; k['d'] = dx > dead;
    }
    moveZone.addEventListener('pointerdown', function (e) {
      if (mId !== null) return; e.preventDefault(); mId = e.pointerId; capture(moveZone, e.pointerId);
      mbx = e.clientX; mby = e.clientY; base.style.left = (mbx - JOY_R) + 'px'; base.style.top = (mby - JOY_R) + 'px'; base.style.display = 'block';
      knob.style.left = (JOY_R - 27) + 'px'; knob.style.top = (JOY_R - 27) + 'px';
    });
    moveZone.addEventListener('pointermove', function (e) {
      if (e.pointerId !== mId) return; e.preventDefault();
      var dx = e.clientX - mbx, dy = e.clientY - mby, d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      knob.style.left = (JOY_R - 27 + dx) + 'px'; knob.style.top = (JOY_R - 27 + dy) + 'px';
      setKeys(dx / JOY_R, dy / JOY_R);
    });
    function mEnd(e) { if (e.pointerId !== mId) return; mId = null; base.style.display = 'none'; setKeys(0, 0); }
    moveZone.addEventListener('pointerup', mEnd); moveZone.addEventListener('pointercancel', mEnd);

    // 右：瞄准 + 开火摇杆（动态）
    var aimZone = el('div', 'position:absolute;right:0;bottom:0;width:42%;height:60%;pointer-events:auto;touch-action:none');
    root.appendChild(aimZone);
    var abase = el('div', 'position:absolute;width:' + (JOY_R * 2) + 'px;height:' + (JOY_R * 2) + 'px;border-radius:50%;border:2px solid rgba(255,120,120,.4);background:rgba(28,12,12,.28);display:none');
    var aknob = el('div', 'position:absolute;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,150,120,.92),rgba(200,60,50,.85));border:2px solid rgba(255,255,255,.5)');
    abase.appendChild(aknob); root.appendChild(abase);
    var aId = null, abx = 0, aby = 0, aimDir = null;
    aimZone.addEventListener('pointerdown', function (e) {
      if (aId !== null) return; e.preventDefault(); aId = e.pointerId; capture(aimZone, e.pointerId);
      abx = e.clientX; aby = e.clientY; abase.style.left = (abx - JOY_R) + 'px'; abase.style.top = (aby - JOY_R) + 'px'; abase.style.display = 'block';
      aknob.style.left = (JOY_R - 27) + 'px'; aknob.style.top = (JOY_R - 27) + 'px';
      inp.mouseClicked = true; inp.mouseDown = true; // 半自动首发 + 自动持续
      if (game.audio) game.audio.resume();
    });
    aimZone.addEventListener('pointermove', function (e) {
      if (e.pointerId !== aId) return; e.preventDefault();
      var dx = e.clientX - abx, dy = e.clientY - aby, d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      aknob.style.left = (JOY_R - 27 + dx) + 'px'; aknob.style.top = (JOY_R - 27 + dy) + 'px';
      if (d > 8) aimDir = Math.atan2(dy, dx);
    });
    function aEnd(e) { if (e.pointerId !== aId) return; aId = null; abase.style.display = 'none'; inp.mouseDown = false; aimDir = null; }
    aimZone.addEventListener('pointerup', aEnd); aimZone.addEventListener('pointercancel', aEnd);

    // 动作按钮
    function abtn(css, label, sub, cb, hold) {
      var b = el('div', 'position:absolute;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'border-radius:50%;border:2px solid rgba(255,255,255,.26);background:rgba(14,20,36,.55);color:#eaf2ff;box-shadow:0 3px 12px rgba(0,0,0,.35);' + css,
        '<div style="font-size:20px;line-height:1;pointer-events:none">' + label + '</div>' + (sub ? '<div style="font-size:9px;color:#9fb0c8;margin-top:1px;pointer-events:none">' + sub + '</div>' : ''));
      root.appendChild(b);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); b.style.background = 'rgba(57,192,255,.5)'; cb(true); });
      function up() { b.style.background = 'rgba(14,20,36,.55)'; if (hold) cb(false); }
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      return b;
    }
    var reloadBtn = abtn('right:20px;bottom:230px;width:58px;height:58px;', '🔄', '换弹', function () { if (game.player.reload) game.player.reload(); });
    var meleeBtn = abtn('right:88px;bottom:250px;width:52px;height:52px;', '🔪', '近战', function () { if (game.player.meleeAttack) game.player.meleeAttack(game.player.angle); });
    var healBtn = abtn('right:148px;bottom:220px;width:52px;height:52px;', '➕', '医疗', function () { if (game.player.useItem) game.player.useItem('1'); });
    var swapBtn = abtn('right:96px;bottom:186px;width:48px;height:48px;', '🔁', '换枪', function () { if (game.player.switchSlot) game.player.switchSlot(game.player.slot === 'primary' ? 'secondary' : 'primary'); });
    var sprintOn = false;
    var sprintBtn = abtn('left:20px;bottom:230px;width:56px;height:56px;', '⚡', '冲刺', function () { sprintOn = !sprintOn; inp.keys['shift'] = sprintOn; sprintBtn.style.background = sprintOn ? 'rgba(124,255,176,.5)' : 'rgba(14,20,36,.55)'; });
    var decryptHold = false;
    var decryptBtn = abtn('left:92px;bottom:250px;width:56px;height:56px;', '🔓', '破译', function (down) { decryptHold = down; inp.keys['f'] = down; }, true);

    // 每帧：非战斗阶段放行原生点击；战斗阶段驱动瞄准
    (function loop() {
      var live = game.state === 'live';
      moveZone.style.display = live ? 'block' : 'none';
      aimZone.style.display = live ? 'block' : 'none';
      [reloadBtn, meleeBtn, healBtn, swapBtn, sprintBtn, decryptBtn].forEach(function (n) { n.style.display = live ? 'flex' : 'none'; });
      if (live && aimDir != null && game.player && game.player.alive) {
        var p = game.player;
        inp.mouse.x = p.x + Math.cos(aimDir) * 300;
        inp.mouse.y = p.y + Math.sin(aimDir) * 300;
      }
      requestAnimationFrame(loop);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.DF = window.DF || {});
