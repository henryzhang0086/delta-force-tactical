/* 3D 版扩展武器 —— 运行期并入 DF.WEAPONS(不改动原版 src/data 文件)
 * 每把枪带 scope 字段：sniper(全镜) / marksman(中镜) / reddot(红点/全息)
 * ads 字段：开镜 FOV(越小倍率越高)
 */
(function (DF, D3) {
  'use strict';
  if (!DF.WEAPONS) return;

  var EXTRA = {
    mce:   { id:'mce',   name:'MCE 突击步枪',  category:'ar',      damage:31, mag:30, reserve:150, rpm:720, auto:true,  reload:2.2, spread:0.028, range:680, velocity:1540, desc:'模块化突击步枪，全距离均衡，后坐可控' },
    asval: { id:'asval', name:'AS Val 突击步枪',category:'ar',      damage:27, mag:20, reserve:120, rpm:900, auto:true,  reload:2.0, spread:0.030, range:520, velocity:1400, desc:'消音高射速，近中距离贴脸压制' },
    awm:   { id:'awm',   name:'AWM 狙击步枪',  category:'sniper',  damage:140,mag:5,  reserve:25,  rpm:36,  auto:false, reload:3.6, spread:0.0016,range:1700,velocity:2900, desc:'顶级栓狙，超远一枪毙命' },
    aug:   { id:'aug',   name:'AUG 突击步枪',  category:'ar',      damage:30, mag:30, reserve:150, rpm:680, auto:true,  reload:2.3, spread:0.026, range:700, velocity:1560, desc:'犊牛式步枪，中远距离精准' },
    mp5:   { id:'mp5',   name:'MP5 冲锋枪',    category:'smg',     damage:24, mag:30, reserve:150, rpm:800, auto:true,  reload:1.9, spread:0.048, range:400, velocity:1150, desc:'经典冲锋枪，稳定好控' },
    ak12:  { id:'ak12',  name:'AK-12 突击步枪',category:'ar',      damage:34, mag:30, reserve:150, rpm:600, auto:true,  reload:2.3, spread:0.030, range:650, velocity:1500, desc:'新一代 AK，威力足、后坐略强' },
    scar:  { id:'scar',  name:'SCAR-H 战斗步枪',category:'ar',     damage:40, mag:20, reserve:120, rpm:550, auto:true,  reload:2.4, spread:0.028, range:760, velocity:1600, desc:'7.62 重弹，单发伤害高' },
    famas: { id:'famas', name:'FAMAS 突击步枪',category:'ar',      damage:26, mag:25, reserve:150, rpm:1000,auto:true,  reload:2.2, spread:0.032, range:560, velocity:1450, desc:'犊牛式高射速，近距泼弹' },
    p90:   { id:'p90',   name:'P90 冲锋枪',    category:'smg',     damage:21, mag:50, reserve:200, rpm:900, auto:true,  reload:2.0, spread:0.050, range:380, velocity:1050, desc:'50 发大弹匣，持续压制' },
    ump45: { id:'ump45', name:'UMP45 冲锋枪',  category:'smg',     damage:28, mag:25, reserve:150, rpm:600, auto:true,  reload:2.1, spread:0.045, range:430, velocity:1100, desc:'.45 大口径，中近距离硬' },
    mg36:  { id:'mg36',  name:'MG36 轻机枪',   category:'lmg',     damage:30, mag:100,reserve:200, rpm:750, auto:true,  reload:4.5, spread:0.040, range:680, velocity:1500, desc:'百发弹鼓，火力覆盖' },
    m24:   { id:'m24',   name:'M24 狙击步枪',  category:'sniper',  damage:125,mag:5,  reserve:25,  rpm:40,  auto:false, reload:3.4, spread:0.0018,range:1600,velocity:2700, desc:'制式栓狙，稳定精准' },
    qbu:   { id:'qbu',   name:'QBU 精确射手步枪',category:'marksman',damage:58,mag:10, reserve:60,  rpm:300, auto:false, reload:2.6, spread:0.006, range:900, velocity:2000, desc:'半自动射手枪，中远收割' },
    spas:  { id:'spas',  name:'SPAS-12 霰弹枪',category:'shotgun', damage:16, mag:8,  reserve:40,  rpm:85,  auto:false, reload:3.0, spread:0.090, range:170, velocity:900,  pellets:9, desc:'战斗霰弹枪，贴脸致命' }
  };

  for (var k in EXTRA) if (EXTRA.hasOwnProperty(k)) DF.WEAPONS[k] = EXTRA[k];

  // 逐武器/类别的瞄准镜与开镜倍率
  var SCOPE_BY_CAT = { sniper:'sniper', marksman:'marksman', lmg:'reddot', ar:'reddot', smg:'reddot', pistol:'reddot', shotgun:'reddot', melee:null };
  var ADSFOV_BY_CAT = { sniper:20, marksman:34, lmg:48, ar:46, smg:50, pistol:52, shotgun:54, melee:62 };

  DF.weaponScope = function (w) { if (!w) return null; if (w.scope) return w.scope; return SCOPE_BY_CAT[w.category] || 'reddot'; };
  DF.weaponAdsFov = function (w) { if (!w) return 46; if (w.ads) return w.ads; return ADSFOV_BY_CAT[w.category] || 46; };

  // AWM 更高倍率
  DF.WEAPONS.awm.ads = 16;
})(window.DF = window.DF || {}, window.D3 = window.D3 || {});
