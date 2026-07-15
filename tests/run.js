/* 纯逻辑单元测试 —— 运行：node tests/run.js
 * 通过设置 global.window 复用浏览器同款脚本（挂载到 window.DF）。 */
'use strict';

global.window = {}; // 让 window.DF 模式在 node 下工作

var path = require('path');
function load(rel) { require(path.join(__dirname, '..', rel)); }

// 依赖顺序加载（仅纯逻辑与数据，无需 DOM）
load('src/engine/vec2.js');
load('src/engine/rng.js');
load('src/data/config.js');
load('src/data/weapons.js');
load('src/data/armor.js');
load('src/data/items.js');
load('src/data/loadouts.js');
load('src/game/combat.js');
load('src/game/economy.js');

var DF = global.window.DF;

// ——— 迷你测试框架 ———
var passed = 0, failed = 0, groups = [];
function group(name, fn) { groups.push(name); console.log('\n▶ ' + name); fn(); }
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.log('  ✗ ' + msg); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// ——— 1. 向量 / 几何 ———
group('向量与几何', function () {
  var V = DF.V;
  ok(approx(V.dist({x:0,y:0},{x:3,y:4}), 5), 'dist(0,0→3,4)=5');
  ok(approx(V.wrapAngle(Math.PI * 3), Math.PI) || approx(V.wrapAngle(Math.PI*3), -Math.PI), 'wrapAngle 归一化');
  ok(approx(V.len(V.norm({x:10,y:0})), 1), 'norm 单位化');
  var hit = DF.geom.segCircle({x:0,y:0},{x:10,y:0},{x:5,y:0},2);
  ok(hit && hit.t > 0 && hit.t < 1, 'segCircle 命中圆');
  ok(DF.geom.segCircle({x:0,y:0},{x:10,y:0},{x:5,y:50},2) === null, 'segCircle 未命中返回 null');
  ok(DF.geom.segIntersectsRect({x:0,y:5},{x:20,y:5},{x:8,y:0,w:4,h:20}) === true, '线段穿过矩形');
  ok(DF.geom.segIntersectsRect({x:0,y:50},{x:20,y:50},{x:8,y:0,w:4,h:20}) === false, '线段未过矩形');
});

// ——— 2. 随机数 ———
group('可复现随机数', function () {
  var a = new DF.RNG(123), b = new DF.RNG(123);
  var seqA = [a.next(), a.next(), a.next()];
  var seqB = [b.next(), b.next(), b.next()];
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), '同种子序列一致');
  var r = new DF.RNG(7), inRange = true;
  for (var i = 0; i < 1000; i++) { var v = r.range(5, 9); if (v < 5 || v > 9) inRange = false; }
  ok(inRange, 'range 落在 [lo,hi]');
});

// ——— 3. 伤害结算 ———
group('伤害结算（护甲/爆头/衰减）', function () {
  var cfg = DF.CONFIG.combat;
  // 无甲躯干
  var r1 = DF.combat.resolveDamage({ baseDamage:30, headshot:false, distance:100, range:400, health:100, vestDur:0, helmetDur:0, cfg:cfg });
  ok(approx(r1.dealt, 30) && approx(r1.health, 70), '无甲：满额扣血');
  // 有甲躯干吸收
  var r2 = DF.combat.resolveDamage({ baseDamage:30, headshot:false, distance:100, range:400, health:100, vestDur:100, helmetDur:0, cfg:cfg });
  ok(r2.vestDur < 100 && r2.dealt < 30, '有甲：护甲吸收部分伤害且耐久下降');
  // 爆头无盔
  var r3 = DF.combat.resolveDamage({ baseDamage:30, headshot:true, distance:100, range:400, health:100, vestDur:0, helmetDur:0, cfg:cfg });
  ok(r3.dealt > 100 && r3.killed, '爆头无盔：致死');
  // 爆头有盔削减
  var r4 = DF.combat.resolveDamage({ baseDamage:30, headshot:true, distance:100, range:400, health:100, vestDur:0, helmetDur:48, cfg:cfg });
  ok(r4.dealt < r3.dealt && r4.helmetDur < 48, '爆头有盔：伤害被削减、头盔耐久下降');
  // 距离衰减
  var near = DF.combat.resolveDamage({ baseDamage:30, headshot:false, distance:100, range:400, health:100, vestDur:0, helmetDur:0, cfg:cfg });
  var far  = DF.combat.resolveDamage({ baseDamage:30, headshot:false, distance:1200,range:400, health:100, vestDur:0, helmetDur:0, cfg:cfg });
  ok(far.dealt < near.dealt, '超射程：伤害衰减');
  ok(far.dealt >= 30 * 0.4 - 0.01, '衰减不低于地板 40%');
  // 狙击平衡：无甲躯干一枪致死；轻甲吸收后不致死（护甲被击穿、剩余残血）；爆头必死
  var svNoArmor = DF.combat.resolveDamage({ baseDamage:115, headshot:false, distance:600, range:1400, health:100, vestDur:0,  helmetDur:0, cfg:cfg });
  ok(svNoArmor.killed, '狙击对无甲躯干一枪致死');
  var svArmor = DF.combat.resolveDamage({ baseDamage:115, headshot:false, distance:600, range:1400, health:100, vestDur:40, helmetDur:0, cfg:cfg });
  ok(!svArmor.killed && svArmor.vestDur === 0 && svArmor.health < 40, '狙击对轻甲：击穿护甲、打成残血但未致死');
  var svHead = DF.combat.resolveDamage({ baseDamage:115, headshot:true, distance:600, range:1400, health:100, vestDur:40, helmetDur:20, cfg:cfg });
  ok(svHead.killed, '狙击爆头：即便有盔仍致死');
});

// ——— 4. 经济系统 ———
group('经济系统', function () {
  var eco = new DF.Economy(DF.CONFIG.economy);
  ok(eco.money === DF.CONFIG.economy.startMoney, '初始资金正确');
  ok(eco.spend(500) && eco.money === DF.CONFIG.economy.startMoney - 500, 'spend 扣款');
  ok(!eco.spend(999999), '余额不足拒绝');
  // 连败递增
  var e2 = new DF.Economy(DF.CONFIG.economy);
  e2.money = 0; e2.awardRoundEnd(false); var l1 = e2.money;
  e2.money = 0; e2.awardRoundEnd(false); var l2 = e2.money;
  ok(l2 >= l1, '连败奖励递增（不减）');
  // 胜利重置连败
  var e3 = new DF.Economy(DF.CONFIG.economy);
  e3.awardRoundEnd(false); ok(e3.lossStreak === 1, '失败后连败+1');
  e3.awardRoundEnd(true); ok(e3.lossStreak === 0, '胜利重置连败');
  // 击杀奖励
  var e4 = new DF.Economy(DF.CONFIG.economy); var before = e4.money;
  e4.awardKill('melee');
  ok(e4.money - before === DF.CONFIG.economy.meleeKillReward, '近战击杀奖励');
  // 封顶
  var e5 = new DF.Economy(DF.CONFIG.economy); e5.money = DF.CONFIG.economy.maxMoney - 100; e5.add(9999);
  ok(e5.money === DF.CONFIG.economy.maxMoney, '资金封顶');
});

// ——— 5. 数据完整性 ———
group('数据完整性（战备引用校验）', function () {
  ok(DF.LOADOUTS.length === 15, '共 15 套战备');
  var allOk = true, detail = '';
  DF.LOADOUTS.forEach(function (l) {
    if (l.primary && !DF.getWeapon(l.primary)) { allOk = false; detail = l.id + ' 主武器无效'; }
    if (l.secondary && !DF.getWeapon(l.secondary)) { allOk = false; detail = l.id + ' 副武器无效'; }
    if (!DF.HELMETS[l.helmet]) { allOk = false; detail = l.id + ' 头盔无效'; }
    if (!DF.VESTS[l.vest]) { allOk = false; detail = l.id + ' 护甲无效'; }
    (l.items || []).forEach(function (it) { if (!DF.getItem(it)) { allOk = false; detail = l.id + ' 道具 ' + it + ' 无效'; } });
  });
  ok(allOk, '所有战备引用的武器/护甲/道具均存在' + (allOk ? '' : ' — ' + detail));

  // 每种武器数据合法
  var wOk = true;
  Object.keys(DF.WEAPONS).forEach(function (k) {
    var w = DF.WEAPONS[k];
    if (typeof w.damage !== 'number' || w.rpm <= 0 && w.category !== 'melee') wOk = false;
  });
  ok(wOk, '武器数值字段合法');

  // 五个价位各有套装
  var tiers = {};
  DF.LOADOUTS.forEach(function (l) { tiers[l.cost] = (tiers[l.cost] || 0) + 1; });
  ok(tiers[200] === 3 && tiers[1000] === 3 && tiers[2500] === 3 && tiers[4000] === 3 && tiers[6000] === 3, '每档 3 套，共 5 档');
});

// ——— 汇总 ———
console.log('\n' + '─'.repeat(40));
console.log('通过 ' + passed + ' · 失败 ' + failed);
if (failed > 0) { console.log('❌ 测试未全部通过'); process.exit(1); }
else { console.log('✅ 全部通过'); }
