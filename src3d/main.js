/* 3D 版引导 —— 等待点击开始，创建 Game3D 并运行 */
(function (D3) {
  'use strict';

  function boot() {
    var canvas = document.getElementById('game3d');
    var hudRoot = document.getElementById('hud3d');
    var overlay = document.getElementById('startOverlay');

    if (!window.THREE) { document.getElementById('bootErr').textContent = '未能加载 Three.js（src3d/vendor/three.min.js 缺失）'; return; }

    var game = new D3.Game3D(canvas, hudRoot);
    window.__game3d = game;

    function begin(mode) {
      if (overlay.dataset.started) return;
      overlay.dataset.started = '1';
      game.audio.resume();
      overlay.style.transition = 'opacity .4s'; overlay.style.opacity = '0';
      setTimeout(function () { overlay.style.display = 'none'; }, 420);
      game.start(mode || 'ffa');
    }
    var ffaBtn = document.getElementById('startFfa'), pveBtn = document.getElementById('startPve'), bedBtn = document.getElementById('startBed'), railBtn = document.getElementById('startRail'), islandBtn = document.getElementById('startIsland'), tdmBtn = document.getElementById('startTdm'), towerBtn = document.getElementById('startTower');
    if (ffaBtn) ffaBtn.addEventListener('click', function () { begin('ffa'); });
    if (pveBtn) pveBtn.addEventListener('click', function () { begin('pve'); });
    if (bedBtn) bedBtn.addEventListener('click', function () { begin('bed'); });
    if (railBtn) railBtn.addEventListener('click', function () { begin('rail'); });
    if (islandBtn) islandBtn.addEventListener('click', function () { begin('island'); });
    if (tdmBtn) tdmBtn.addEventListener('click', function () { begin('tdm'); });
    if (towerBtn) towerBtn.addEventListener('click', function () { begin('tower'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.D3 = window.D3 || {});
