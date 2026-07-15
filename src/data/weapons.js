/* 全武器数据 —— 对应设计文档「全道具功能与用途汇总表」及「战备配置表」
 * damage    : 单发躯干基础伤害
 * mag       : 弹匣容量        reserve: 备弹
 * rpm       : 射速（发/分）    auto: 是否全自动
 * reload    : 换弹秒数         spread: 基础散布（弧度）
 * range     : 有效射程（px，超出后伤害衰减）
 * velocity  : 弹速（px/s）
 * category  : smg|ar|sniper|lmg|pistol|shotgun|marksman|melee
 * pellets   : 霰弹每次发射弹丸数
 */
(function (DF) {
  'use strict';

  DF.WEAPONS = {
    // —— 主武器：冲锋枪 ——
    mk4:    { id:'mk4',    name:'MK4 冲锋枪',  category:'smg',    damage:24, mag:48, reserve:144, rpm:1000, auto:true,  reload:2.1, spread:0.055, range:420, velocity:1150, desc:'全自动高射速，近距离主力输出，冲点突破专用' },
    uzi:    { id:'uzi',    name:'UZI 冲锋枪',  category:'smg',    damage:23, mag:45, reserve:135, rpm:1050, auto:true,  reload:2.0, spread:0.062, range:380, velocity:1120, desc:'贴脸爆发，近距离压制对手' },
    vector: { id:'vector', name:'Vector 冲锋枪',category:'smg',   damage:22, mag:33, reserve:132, rpm:1150, auto:true,  reload:1.9, spread:0.045, range:400, velocity:1180, desc:'超高射速低后坐，稳定倾泻' },

    // —— 主武器：突击步枪 ——
    qbz95:  { id:'qbz95',  name:'QBZ95-1 突击步枪',category:'ar', damage:29, mag:45, reserve:180, rpm:650,  auto:true,  reload:2.3, spread:0.030, range:640, velocity:1500, desc:'均衡属性，中距离全场适配，新手友好' },
    tenglong:{id:'tenglong',name:'腾龙 突击步枪',category:'ar',   damage:31, mag:35, reserve:175, rpm:620,  auto:true,  reload:2.4, spread:0.026, range:700, velocity:1550, desc:'优势距离压制，远中距离精准' },

    // —— 主武器：轻机枪 ——
    qjb201: { id:'qjb201', name:'QJB201 轻机枪',category:'lmg',   damage:28, mag:75, reserve:225, rpm:700,  auto:true,  reload:4.2, spread:0.048, range:600, velocity:1450, desc:'大弹匣持续火力压制' },
    pkm:    { id:'pkm',    name:'PKM 轻机枪',  category:'lmg',    damage:33, mag:100,reserve:200, rpm:650,  auto:true,  reload:5.0, spread:0.052, range:650, velocity:1480, desc:'换弹慢但火力凶猛，阵地压制' },
    m250:   { id:'m250',   name:'M250 轻机枪', category:'lmg',    damage:35, mag:80, reserve:240, rpm:600,  auto:true,  reload:4.6, spread:0.044, range:680, velocity:1500, desc:'6.8 口径大伤害持续输出' },

    // —— 主武器：狙击枪 ——
    sv98:   { id:'sv98',   name:'SV-98 狙击步枪',category:'sniper',damage:115,mag:7,  reserve:35,  rpm:45,   auto:false, reload:3.2, spread:0.004, range:1400,velocity:2600, desc:'远距离一击必杀，精准打击目标' },
    m700:   { id:'m700',   name:'M700 狙击步枪',category:'sniper', damage:120,mag:5,  reserve:30,  rpm:40,   auto:false, reload:3.4, spread:0.003, range:1500,velocity:2700, desc:'高伤害栓动狙，一枪定乾坤' },

    // —— 主武器：精确射手步枪 ——
    m14:    { id:'m14',    name:'M14 射手步枪',    category:'marksman',damage:52,mag:50,reserve:150,rpm:880,auto:true,  reload:2.8, spread:0.013, range:900, velocity:1900, scope:'reddot', ads:46, desc:'50 发大容量全自动射手步枪，红点速瞄，超高射速火力压制' },
    sr25:   { id:'sr25',   name:'SR-25 精确射手步枪',category:'marksman',damage:62,mag:20,reserve:100,rpm:260,auto:false,reload:2.7, spread:0.010, range:1000,velocity:2000, desc:'大狙在里面但你得找，中远距离点射' },

    // —— 主武器：霰弹枪 ——
    m870:   { id:'m870',   name:'M870 霰弹枪', category:'shotgun', damage:14, mag:6,  reserve:24,  rpm:70,   auto:false, reload:0.55,spread:0.14,  range:230, velocity:1000, pellets:8, reloadPerShell:true, desc:'贴脸巷战，近距离一波带走' },

    // 勇士 9×19mm 机械（PCC/卡宾）
    yongshi:{ id:'yongshi',name:'勇士 9×19 机械', category:'smg', damage:26, mag:30, reserve:120, rpm:600,  auto:true,  reload:1.8, spread:0.050, range:360, velocity:1100, desc:'近身肉搏，9×19 通用弹卡宾' },

    // —— 副武器：手枪 ——
    g18:    { id:'g18',    name:'G18 手枪',    category:'pistol',  damage:22, mag:33, reserve:99,  rpm:900,  auto:true,  reload:1.6, spread:0.070, range:300, velocity:1000, slot:'secondary', desc:'应急补枪，全自动近距离副武器' },
    deagle: { id:'deagle', name:'沙漠之鹰 手枪',category:'pistol', damage:55, mag:13, reserve:65,  rpm:230,  auto:false, reload:1.9, spread:0.030, range:420, velocity:1200, slot:'secondary', desc:'近距离一枪破甲，秒杀满血敌人' },

    // —— 近战 ——
    knife:  { id:'knife',  name:'黑寡匕首',    category:'melee',   damage:55, mag:0,  reserve:0,   rpm:120,  auto:false, reload:0,   spread:0,     range:34,  velocity:0, slot:'melee', desc:'近战无声击杀，背刺秒杀不暴露位置' }
  };

  // 类别 → 单发音高（音效用）
  DF.WEAPON_TONE = {
    smg:260, ar:200, sniper:120, lmg:180, pistol:300, shotgun:90, marksman:150, melee:0
  };

  DF.getWeapon = function (id) { return DF.WEAPONS[id] || null; };
})(window.DF = window.DF || {});
