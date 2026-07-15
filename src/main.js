/* 引导启动 */
(function (DF) {
  'use strict';

  window.addEventListener('load', function () {
    var canvas = document.getElementById('game');
    var game = new DF.Game(canvas);
    DF.instance = game;

    // 首次交互解锁音频（浏览器策略）
    window.addEventListener('mousedown', function once() {
      game.audio.resume();
      window.removeEventListener('mousedown', once);
    });

    requestAnimationFrame(function (t) { game._lastT = t; game.frame(t); });
  });
})(window.DF = window.DF || {});
