/* 打包成单文件 HTML（所有 CSS/JS 内联）——双击即玩，无需服务器、免缓存困扰。
 * 运行：node build_standalone.js  →  生成 三角洲行动_单文件版.html
 */
'use strict';
var fs = require('fs'), path = require('path');
var root = __dirname;

// 与 index.html 完全一致的脚本加载顺序
var scripts = [
  'src/engine/vec2.js', 'src/engine/rng.js', 'src/engine/input.js', 'src/engine/audio.js', 'src/engine/particles.js',
  'src/data/config.js', 'src/data/weapons.js', 'src/data/armor.js', 'src/data/items.js', 'src/data/loadouts.js',
  'src/game/map.js', 'src/game/combat.js', 'src/game/objective.js', 'src/game/economy.js', 'src/game/bullet.js',
  'src/game/agent.js', 'src/game/ai.js', 'src/ui/hud.js', 'src/ui/buymenu.js', 'src/game/game.js', 'src/main.js'
];

var css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

var errOverlay =
'    (function () {\n' +
'      function box(){var d=document.getElementById("__err");if(!d){d=document.createElement("div");d.id="__err";d.style.cssText="position:fixed;left:0;top:0;right:0;max-height:45%;overflow:auto;background:rgba(176,0,32,.95);color:#fff;font:12px/1.5 Consolas,monospace;padding:10px 14px;white-space:pre-wrap;z-index:99999;border-bottom:2px solid #fff";(document.body||document.documentElement).appendChild(d);}return d;}\n' +
'      window.__report=function(m){box().textContent+=m+"\\n";};\n' +
'      window.addEventListener("error",function(e){window.__report("JS 错误: "+e.message+"  ("+String(e.filename||"").split("/").pop()+":"+e.lineno+")");});\n' +
'      window.addEventListener("unhandledrejection",function(e){window.__report("Promise 错误: "+((e.reason&&e.reason.message)||e.reason));});\n' +
'    })();\n';

var parts = [];
parts.push('<!DOCTYPE html>');
parts.push('<html lang="zh-CN">');
parts.push('<head>');
parts.push('  <meta charset="UTF-8">');
parts.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
parts.push('  <title>三角洲行动 · Delta Force Tactical（单文件版）</title>');
parts.push('  <style>\n' + css + '\n  </style>');
parts.push('</head>');
parts.push('<body>');
parts.push('  <div id="wrap"><canvas id="game" width="1280" height="720"></canvas></div>');
parts.push('  <div id="hint">三角洲行动 · WASD 移动 · 鼠标射击 · R 换弹 · F 破译 · 1-5 道具 · V 近战 · Shift 冲刺 · Tab 计分板</div>');
parts.push('  <script>\n' + errOverlay + '  </' + 'script>');

scripts.forEach(function (s) {
  var code = fs.readFileSync(path.join(root, s), 'utf8');
  parts.push('  <!-- ' + s + ' -->');
  // 用 </script> 拆分保护，避免代码里出现该串（本项目没有，稳妥起见处理）
  code = code.replace(/<\/script>/g, '<\\/script>');
  parts.push('  <script>\n' + code + '\n  </' + 'script>');
});

parts.push('</body>');
parts.push('</html>');

var out = path.join(root, '三角洲行动_单文件版.html');
fs.writeFileSync(out, parts.join('\n'), 'utf8');
console.log('已生成: ' + out);
console.log('内联脚本 ' + scripts.length + ' 个，文件大小 ' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
