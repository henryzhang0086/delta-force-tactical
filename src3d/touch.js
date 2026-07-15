/* 手游触屏操控层 —— 为 3D 版提供虚拟摇杆 / 拖动瞄准 / 开火射击按钮
 * 仅在触屏设备（或 ?touch=1）启用，桌面端完全不受影响。
 * 设计：核心手感（移动/瞄准/开火/瞄准镜）直接驱动 D3.Player 状态；
 *       离散动作（换弹/手雷/跳跃/切视角等）复用键盘事件，最小侵入。
 */
(function (D3) {
  'use strict';

  var forced = /[?&]touch=1/.test(location.search);
  var isTouch = forced || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  D3.isTouch = isTouch && !/[?&]touch=0/.test(location.search);
  if (!D3.isTouch) return;

  var LOOK_MULT = 2.4;   // 触屏拖动相对鼠标灵敏度的放大系数
  var JOY_R = 62;        // 摇杆半径(px)

  function el(tag, css, html) { var d = document.createElement(tag); if (css) d.style.cssText = css; if (html != null) d.innerHTML = html; return d; }
  function fireKey(type, code) { try { document.dispatchEvent(new KeyboardEvent(type, { code: code, bubbles: true })); } catch (e) {} }
  function capture(elm, id) { try { elm.setPointerCapture(id); } catch (e) {} }
  function tapKey(code) { fireKey('keydown', code); setTimeout(function () { fireKey('keyup', code); }, 60); }

  var state = { move: { moveActive: false, moveX: 0, moveY: 0 }, fire: false, ads: false, sprint: false, prone: false };

  // 开始界面加一行手游提示
  function injectHint() {
    var keys = document.querySelector('#startOverlay .keys');
    if (keys && !keys.dataset.touchHint) {
      keys.dataset.touchHint = '1';
      var h = el('div', 'margin-top:10px;color:#7CFFB0;font-weight:700', '📱 手游模式：左侧摇杆移动 · 右侧拖动瞄准 · 🔫 开火 · 🎯 瞄准 · 🔄 换弹 · ⤴ 跳 · ⚡ 冲刺 · 💣 手雷 · 👁 视角');
      keys.appendChild(h);
    }
  }

  function boot() {
    injectHint();
    var game = window.__game3d;
    if (!game) { requestAnimationFrame(boot); return; }
    build(game);
  }

  function build(game) {
    function P() { return game.player; }

    // 根容器（穿透点击，仅控件本身接收触摸）
    var root = el('div', 'position:fixed;inset:0;z-index:15;pointer-events:none;touch-action:none;-webkit-user-select:none;user-select:none;font-family:"Segoe UI",system-ui,sans-serif');
    document.body.appendChild(root);

    // —— 左侧：移动摇杆（动态定位）——
    var moveZone = el('div', 'position:absolute;left:0;bottom:0;width:46%;height:66%;pointer-events:auto;touch-action:none');
    root.appendChild(moveZone);
    var joyBase = el('div', 'position:absolute;width:' + (JOY_R * 2) + 'px;height:' + (JOY_R * 2) + 'px;border-radius:50%;border:2px solid rgba(255,255,255,.28);background:radial-gradient(circle,rgba(255,255,255,.06),rgba(10,15,28,.28));display:none;pointer-events:none');
    var joyKnob = el('div', 'position:absolute;width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(120,200,255,.9),rgba(40,110,190,.8));border:2px solid rgba(255,255,255,.5);box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none');
    joyBase.appendChild(joyKnob);
    root.appendChild(joyBase);
    var moveId = null, baseX = 0, baseY = 0;
    moveZone.addEventListener('pointerdown', function (e) {
      e.preventDefault(); if (moveId !== null) return;
      moveId = e.pointerId; capture(moveZone, e.pointerId);
      baseX = e.clientX; baseY = e.clientY;
      joyBase.style.left = (baseX - JOY_R) + 'px'; joyBase.style.top = (baseY - JOY_R) + 'px'; joyBase.style.display = 'block';
      joyKnob.style.left = (JOY_R - 28) + 'px'; joyKnob.style.top = (JOY_R - 28) + 'px';
      state.move.moveActive = true; state.move.moveX = 0; state.move.moveY = 0;
    });
    moveZone.addEventListener('pointermove', function (e) {
      if (e.pointerId !== moveId) return; e.preventDefault();
      var dx = e.clientX - baseX, dy = e.clientY - baseY;
      var d = Math.hypot(dx, dy); if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      joyKnob.style.left = (JOY_R - 28 + dx) + 'px'; joyKnob.style.top = (JOY_R - 28 + dy) + 'px';
      state.move.moveX = dx / JOY_R; state.move.moveY = -dy / JOY_R; // 上=前
    });
    function endMove(e) {
      if (e.pointerId !== moveId) return; moveId = null;
      state.move.moveActive = false; state.move.moveX = 0; state.move.moveY = 0;
      joyBase.style.display = 'none';
    }
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);

    // —— 右侧：拖动瞄准区（位于按钮之下，按钮优先接收触摸）——
    var lookZone = el('div', 'position:absolute;right:0;top:0;width:54%;height:100%;pointer-events:auto;touch-action:none');
    root.appendChild(lookZone);
    var lookId = null, lastX = 0, lastY = 0;
    lookZone.addEventListener('pointerdown', function (e) {
      e.preventDefault(); if (lookId !== null) return;
      lookId = e.pointerId; capture(lookZone, e.pointerId); lastX = e.clientX; lastY = e.clientY;
    });
    lookZone.addEventListener('pointermove', function (e) {
      if (e.pointerId !== lookId) return; e.preventDefault();
      var p = P(); if (!p) { lastX = e.clientX; lastY = e.clientY; return; }
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      var s = p.sens * LOOK_MULT * (p.ads ? 0.5 : 1);
      p.yaw -= dx * s;
      p.pitch -= dy * s;
      p.pitch = Math.max(-0.9, Math.min(0.55, p.pitch));
    });
    function endLook(e) { if (e.pointerId === lookId) lookId = null; }
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);

    // —— 按钮工厂 ——
    function btn(css, label, sub) {
      var b = el('div', 'position:absolute;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'border-radius:50%;border:2px solid rgba(255,255,255,.28);background:rgba(14,20,36,.5);color:#eaf2ff;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.35);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);' + css,
        '<div style="font-size:22px;line-height:1;pointer-events:none">' + label + '</div>' + (sub ? '<div style="font-size:9px;letter-spacing:.5px;color:#9fb0c8;margin-top:2px;pointer-events:none">' + sub + '</div>' : ''));
      root.appendChild(b);
      return b;
    }
    function press(b, active) { b.style.background = active ? 'rgba(57,192,255,.55)' : 'rgba(14,20,36,.5)'; b.style.borderColor = active ? '#7CFFB0' : 'rgba(255,255,255,.28)'; }

    // 右拇指主战斗区（整体避开右侧雷达/弹药 HUD 列，right≥180）
    // 开火（大按钮，按住连发）
    var fireBtn = btn('right:186px;bottom:104px;width:96px;height:96px;', '🔫', '开火');
    fireBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); state.fire = true; if (P()) P().firing = true; press(fireBtn, true); });
    function fireUp(e) { e.preventDefault(); state.fire = false; if (P()) P().firing = false; press(fireBtn, false); }
    fireBtn.addEventListener('pointerup', fireUp); fireBtn.addEventListener('pointercancel', fireUp); fireBtn.addEventListener('pointerleave', fireUp);

    // 瞄准镜（切换）
    var adsBtn = btn('right:296px;bottom:166px;width:68px;height:68px;', '🎯', '瞄准');
    adsBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); state.ads = !state.ads; if (P()) P().ads = state.ads; press(adsBtn, state.ads); });

    // 换弹
    var reloadBtn = btn('right:300px;bottom:88px;width:62px;height:62px;', '🔄', '换弹');
    reloadBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tapKey('KeyR'); });

    // 手雷（破片）
    var nadeBtn = btn('right:200px;bottom:222px;width:56px;height:56px;', '💣', '手雷');
    nadeBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tapKey('KeyG'); });

    // 跳跃
    var jumpBtn = btn('right:410px;bottom:150px;width:60px;height:60px;', '⤴', '跳');
    jumpBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); if (P()) P().keys['Space'] = true; press(jumpBtn, true); });
    function jumpUp(e) { if (P()) P().keys['Space'] = false; press(jumpBtn, false); }
    jumpBtn.addEventListener('pointerup', jumpUp); jumpBtn.addEventListener('pointercancel', jumpUp);

    // 切视角（第一/第三人称）
    var viewBtn = btn('right:300px;bottom:248px;width:52px;height:52px;', '👁', '视角');
    viewBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tapKey('KeyV'); });

    // —— 左拇指辅助键：冲刺 / 卧倒 / 载具（血条面板上方，移动摇杆区域内）——
    // 冲刺（切换）
    var sprintBtn = btn('left:22px;bottom:158px;width:58px;height:58px;', '⚡', '冲刺');
    sprintBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); state.sprint = !state.sprint; if (P()) P().keys['ShiftLeft'] = state.sprint; press(sprintBtn, state.sprint); });

    // 蹲/卧倒（切换）
    var proneBtn = btn('left:90px;bottom:158px;width:56px;height:56px;', '🧎', '卧倒');
    proneBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); state.prone = !state.prone; if (P()) P().keys['ControlLeft'] = state.prone; press(proneBtn, state.prone); });

    // 交互 / 上下载具
    var interactBtn = btn('left:156px;bottom:158px;width:52px;height:52px;', '🚗', '载具');
    interactBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tapKey('KeyT'); });

    // —— 菜单小按钮：暂停 / 计分板 / 音乐 / 商店（左边缘竖排，避开顶部计分与右侧雷达）——
    function topBtn(top, label) {
      var b = el('div', 'position:absolute;top:' + top + 'px;left:16px;width:42px;height:42px;pointer-events:auto;touch-action:none;' +
        'display:flex;align-items:center;justify-content:center;font-size:18px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(12,15,28,.6);color:#eaf2ff', label);
      root.appendChild(b); return b;
    }
    var pauseBtn = topBtn(72, '⏸');
    pauseBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); if (game.paused) game._resume(); else game._pause(); });
    var boardBtn = topBtn(122, '📊');
    boardBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); fireKey('keydown', 'Tab'); });
    boardBtn.addEventListener('pointerup', function (e) { e.preventDefault(); fireKey('keyup', 'Tab'); });
    boardBtn.addEventListener('pointercancel', function () { fireKey('keyup', 'Tab'); });
    var musicBtn = topBtn(172, '🎵');
    musicBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tapKey('KeyM'); });
    var shopBtn = topBtn(222, '🛒'); shopBtn.style.display = 'none';
    shopBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tapKey('KeyB'); });

    // —— 每帧：把持续状态同步到（可能重建的）player，并按局面显隐控件 ——
    (function loop() {
      var p = P();
      if (p) {
        p.touch = state.move;
        if (!state.fire) p.firing = false;         // 松开必停火
        p.ads = state.ads;
        p.keys['ShiftLeft'] = state.sprint;
        p.keys['ControlLeft'] = state.prone;
      }
      // 开始遮罩 / 暂停 / 选枪商店面板出现时，整体隐藏触屏层，让下方面板（选枪表格/商店）可点可滚动
      var overlay = document.getElementById('startOverlay');
      var overlayUp = overlay && overlay.style.display !== 'none' && !overlay.dataset.started;
      var pausedUp = game.paused || (D3.HUD.pause && D3.HUD.pause.style.display !== 'none');
      var panelUp = (D3.HUD.loadout && D3.HUD.loadout.style.display === 'block');
      root.style.display = (overlayUp || pausedUp || panelUp) ? 'none' : 'block';
      shopBtn.style.display = (game.mode === 'bed') ? 'flex' : 'none';
      requestAnimationFrame(loop);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.D3 = window.D3 || {});
