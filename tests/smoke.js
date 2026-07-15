/* 无头冒烟测试 —— 运行：node tests/smoke.js
 * 用桩替换 DOM/Canvas/RAF，实际驱动整套游戏循环跑完一整场比赛，
 * 覆盖：AI、弹道、伤害、破译、经济、购买、小局/整场状态机、渲染代码路径。 */
'use strict';

// ——— DOM / Canvas / 计时 桩 ———
function makeCtx() {
  var noop = function () {};
  var ctx = {
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, rect: noop,
    fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, setLineDash: noop, translate: noop, rotate: noop, scale: noop,
    measureText: function (s) { return { width: (s ? s.length : 0) * 7 }; }
  };
  ['fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline','globalAlpha'].forEach(function (p) { ctx[p] = ''; });
  return ctx;
}

var listeners = {};
global.window = {
  addEventListener: function (t, cb) { (listeners[t] = listeners[t] || []).push(cb); },
  removeEventListener: function () {},
  AudioContext: undefined  // 触发音频 enabled=false
};
global.requestAnimationFrame = function () { return 0; }; // 手动步进，不自动循环

var fakeCanvas = {
  width: 1280, height: 720,
  getContext: function () { return makeCtx(); },
  addEventListener: function (t, cb) { (listeners[t] = listeners[t] || []).push(cb); },
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720 }; }
};

var path = require('path');
function load(rel) { require(path.join(__dirname, '..', rel)); }
[
  'src/engine/vec2.js','src/engine/rng.js','src/engine/input.js','src/engine/audio.js','src/engine/particles.js',
  'src/data/config.js','src/data/weapons.js','src/data/armor.js','src/data/items.js','src/data/loadouts.js',
  'src/game/map.js','src/game/combat.js','src/game/objective.js','src/game/economy.js','src/game/bullet.js',
  'src/game/agent.js','src/game/ai.js','src/ui/hud.js','src/ui/buymenu.js','src/game/game.js'
].forEach(load);

var DF = global.window.DF;

// 加速对局，缩短冒烟耗时
DF.CONFIG.match.buyTime = 1;
DF.CONFIG.match.roundTime = 25;
DF.CONFIG.match.roundEndDelay = 0.2;

var pass = 0, fail = 0;
function ok(c, m) { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); }

console.log('▶ 无头整场对局模拟');

var game = new DF.Game(fakeCanvas);
ok(!!game && game.agents.length === 6, '游戏实例化：6 名干员');

game.startMatch();
ok(game.state === 'buy' && game.round === 1, '开局进入购买阶段（第 1 局）');

// 模拟玩家购买一套 2500 战备
var kit = DF.getLoadout('tuposhou');
game.economy.money = 9999;
game.buyLoadout(kit);
ok(game.player.loadout.id === 'tuposhou' && game.player.currentWeapon().def.id === 'mk4', '玩家购买战备生效');

// ——— 主循环手动步进 ———
var dt = 1 / 60;
var maxFrames = 60 * 240; // 上限 4 分钟游戏时间
var frames = 0, err = null, sawLive = false, sawRoundEnd = false, roundsSeen = {}, everShot = false, everDecrypt = false;

var inp = game.input;
function drivebot() {
  // 让玩家参与战斗：瞄准最近敌人、开火、靠近站点、按住 F 破译
  var p = game.player;
  if (!p.alive) { inp.mouseDown = false; return; }
  var nearest = null, nd = 1e9;
  for (var i = 0; i < game.enemies.length; i++) {
    var e = game.enemies[i];
    if (!e.alive) continue;
    var d = DF.V.dist(p, e);
    if (d < nd) { nd = d; nearest = e; }
  }
  if (nearest) { inp.mouse.x = nearest.x; inp.mouse.y = nearest.y; inp.mouseDown = true; }
  else { inp.mouse.x = game.map.site.x; inp.mouse.y = game.map.site.y; inp.mouseDown = false; }
  // 朝站点移动
  inp.keys['w'] = p.y > game.map.site.y + 30;
  inp.keys['a'] = p.x > game.map.site.x + 30;
  inp.keys['d'] = p.x < game.map.site.x - 30;
  inp.keys['f'] = game.objective.inRange(p);
  if (frames % 300 === 0) inp.pressed['1'] = true; // 偶尔用道具
}

try {
  while (frames < maxFrames && game.state !== 'matchend') {
    drivebot();
    game.update(dt);
    game.render();               // 跑渲染代码路径（stub ctx）
    inp.endFrame();
    if (game.state === 'live') sawLive = true;
    if (game.state === 'roundend') sawRoundEnd = true;
    if (game.objective.progress > 0) everDecrypt = true;
    if (game.bullets.length > 0) everShot = true;
    roundsSeen[game.round] = true;
    // 完整性检查：数值不应为 NaN
    if (Number.isNaN(game.player.health) || Number.isNaN(game.economy.money)) { err = new Error('检测到 NaN'); break; }
    frames++;
  }
} catch (e) { err = e; }

ok(!err, '整场模拟无运行时异常' + (err ? '：' + err.message + '\n' + err.stack : ''));
ok(sawLive, '进入过战斗阶段');
ok(everShot, '曾产生弹道（射击生效）');
ok(sawRoundEnd, '触发过小局结算');
ok(game.state === 'matchend', '在帧上限内打完整场（分出胜负）');
ok(game.attackerWins >= 3 || game.defenderWins >= 3, '有一方先胜 3 局：' + game.attackerWins + ' : ' + game.defenderWins);
ok(Object.keys(roundsSeen).length >= 3, '至少进行了 3 个小局');
console.log('  · 模拟帧数 ' + frames + ' · 最终比分 灵萧队 ' + game.attackerWins + ' : ' + game.defenderWins + ' 敌方 · 玩家击杀 ' + game.player.kills);

// ——— 隔离验证：破译取胜路径 ———
console.log('\n▶ 破译取胜路径（隔离防守方）');
(function () {
  var g2 = new DF.Game(fakeCanvas);
  g2.startMatch(); g2.beginLive();
  g2.enemies.forEach(function (e) { e.ai = null; e.x = -999; e.y = -999; }); // 中和防守方
  var p = g2.player, dt2 = 1 / 60, f2 = 0;
  while (f2 < 60 * 10 && g2.state === 'live') {
    p.x = g2.map.site.x; p.y = g2.map.site.y; g2.input.keys['f'] = true;
    g2.update(dt2); g2.input.endFrame(); f2++;
  }
  ok(g2.objective.done, '持续破译达成 100%');
  ok(g2.roundResult && g2.roundResult.reason === '密钥破译成功' && g2.roundResult.winner === 'attacker', '破译完成即判进攻方取胜');
  ok(g2.attackerWins === 1, '破译取胜计入比分');
})();

// ——— 隔离验证：全歼取胜路径 ———
console.log('\n▶ 全歼取胜路径');
(function () {
  var g3 = new DF.Game(fakeCanvas);
  g3.startMatch(); g3.beginLive();
  g3.enemies.forEach(function (e) { e.die(g3.player); }); // 直接击杀全部防守方
  g3.update(1 / 60);
  ok(g3.roundResult && g3.roundResult.reason === '全歼防守方', '防守方团灭即判进攻方取胜');
})();

// ——— 回归：购买菜单首帧渲染（修复“点击开始后主循环崩溃、菜单卡死”）———
console.log('\n▶ 回归：购买菜单可在 update 之前直接渲染');
(function () {
  var g4 = new DF.Game(fakeCanvas);
  g4.startMatch();                 // state=buy，buyMenu.open()，但尚未跑过 update()/_layout()
  var threw = false, msg = '';
  try { g4.render(); } catch (e) { threw = true; msg = e.message; }
  ok(!threw, '购买菜单不依赖 _layout 先行即可渲染' + (threw ? '（仍崩溃：' + msg + '）' : ''));
})();

// ——— 回归：完整走一遍 frame() 主循环（含 render），而非仅 update() ———
console.log('\n▶ 回归：通过 frame() 主循环驱动（覆盖 render 路径）');
(function () {
  var g5 = new DF.Game(fakeCanvas);
  var crashed = null;
  var origReport = global.window.__report;
  global.window.__report = function (m) { crashed = m; };
  g5.startMatch();
  g5._lastT = 0;
  var t = 16, safe = 0;
  // 手动步进 frame（frame 内部会 requestAnimationFrame，但我们的桩不自动回调）
  for (var i = 0; i < 200 && safe < 200; i++) {
    // 首帧后购买并出击，推进到战斗
    if (g5.state === 'buy') { g5.economy.money = 9999; g5.buyLoadout(DF.getLoadout('junheng')); g5.buyMenu.ready = true; }
    g5.frame(t); t += 16; safe++;
    if (crashed) break;
  }
  global.window.__report = origReport;
  ok(!crashed, 'frame() 主循环全程无崩溃' + (crashed ? '：' + crashed : ''));
  ok(g5.state === 'live' || g5.state === 'roundend' || g5.state === 'matchend', 'frame 循环推进到了战斗/结算态：' + g5.state);
})();

console.log('\n' + '─'.repeat(40));
console.log('通过 ' + pass + ' · 失败 ' + fail);
process.exit(fail > 0 ? 1 : 0);
