/* 校验单文件版：抽取内联脚本并跑完整 点击→购买→战斗 链路 */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var html = fs.readFileSync(path.join(__dirname, '..', '三角洲行动_单文件版.html'), 'utf8');

// 用开闭标签切分抽取内联脚本
var blocks = [];
var re = /<script>([\s\S]*?)<\/script>/g, m;
while ((m = re.exec(html)) !== null) {
  blocks.push(m[1].split('<\\/script>').join('</script>'));
}
console.log('提取内联脚本块:', blocks.length);

function makeCtx() { var n = function () {}; var c = {};
  ['save','restore','beginPath','closePath','moveTo','lineTo','arc','rect','fill','stroke','fillRect','strokeRect','clearRect','fillText','setLineDash','translate','rotate','scale'].forEach(function (k) { c[k] = n; });
  c.measureText = function (s) { return { width: (s ? s.length : 0) * 7 }; };
  ['fillStyle','strokeStyle','lineWidth','font','textAlign','textBaseline','globalAlpha'].forEach(function (p) { c[p] = ''; });
  return c;
}
var canvas = { width: 1280, height: 720, getContext: function () { return makeCtx(); }, addEventListener: function () {}, getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720 }; } };
var H = {}, raf = [], reported = [];
var doc = { getElementById: function (id) { return id === 'game' ? canvas : null; }, createElement: function () { return { style: {}, appendChild: function () {}, textContent: '' }; }, body: { appendChild: function () {} }, documentElement: { appendChild: function () {} } };
var win = { addEventListener: function (t, cb) { (H[t] = H[t] || []).push(cb); }, removeEventListener: function () {}, requestAnimationFrame: function (cb) { raf.push(cb); }, AudioContext: undefined, document: doc };
win.window = win; win.__report = function (mm) { reported.push(mm); };
var sb = { window: win, document: doc, requestAnimationFrame: win.requestAnimationFrame, console: console, Math: Math, JSON: JSON, Date: Date, Array: Array, Object: Object, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Number: Number, String: String };
vm.createContext(sb);

function drain(n) { var i = 0; while (raf.length && i < n) { raf.shift()((i + 2) * 16); i++; } return i; }

try {
  blocks.forEach(function (b, i) { vm.runInContext(b, sb, { filename: 'inline#' + i }); });
  console.log('✓ 全部内联脚本执行无异常');
  (H['load'] || []).forEach(function (cb) { cb(); });
  var g = win.DF.instance;
  drain(3);
  (H['mousedown'] || []).forEach(function (cb) { cb({ button: 0, clientX: 640, clientY: 360 }); });
  drain(3);
  if (g.state === 'buy') { g.economy.money = 9999; g.buyLoadout(win.DF.getLoadout('tuposhou')); g.buyMenu.ready = true; }
  drain(5); drain(120);
  console.log('状态推进:', g.state, '· 玩家存活', g.player.alive);
  if (reported.length) { console.log('❌ 崩溃:\n' + reported.join('\n')); process.exit(1); }
  if (g.state === 'menu') { console.log('❌ 点击后仍停留在菜单'); process.exit(1); }
  console.log('✅ 单文件版：点击→购买→战斗 全链路正常');
} catch (e) { console.log('❌ 执行异常:', e.stack || e); process.exit(1); }
