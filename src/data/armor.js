/* 全护甲数据 —— 对应设计文档「头盔防具 / 护甲防具」
 * durability : 耐久值（吸收伤害后递减，归零失效）
 * weight     : 机动惩罚（0~1，越大移动越慢）
 */
(function (DF) {
  'use strict';

  DF.HELMETS = {
    none: { id:'none', name:'无头盔', durability:0,  weight:0,    desc:'无头部防护' },
    mc:   { id:'mc',   name:'MC 防弹头盔',  durability:20, weight:0.02, desc:'轻量化基础头部防护，不影响机动性' },
    mhs:  { id:'mhs',  name:'MHS 战术头盔', durability:30, weight:0.05, desc:'均衡防护，兼顾机动性与防护性' },
    dich: { id:'dich', name:'DICH 训练头盔',durability:35, weight:0.04, desc:'狙击专用轻量化头盔' },
    gt1:  { id:'gt1',  name:'GT1 战术头盔', durability:48, weight:0.09, desc:'头部核心防护，降低爆头伤害' }
  };

  DF.VESTS = {
    none: { id:'none', name:'无护甲', durability:0,   weight:0,    desc:'无躯干防护' },
    tg:   { id:'tg',   name:'TG 战术防弹衣', durability:40,  weight:0.04, desc:'轻量化护甲，高机动性，适合近距离突进' },
    hmp:  { id:'hmp',  name:'HMP 特勤防弹衣',durability:80,  weight:0.10, desc:'中距离均衡防护，突击步枪专用' },
    wushi:{ id:'wushi',name:'武士精锐背心', durability:80,  weight:0.08, desc:'狙击专用护甲，轻量化高防护' },
    mk2:  { id:'mk2',  name:'MK-2 战术背心', durability:110, weight:0.15, desc:'胸部高耐久防护，正面抗伤能力强' }
  };

  DF.getHelmet = function (id) { return DF.HELMETS[id] || DF.HELMETS.none; };
  DF.getVest   = function (id) { return DF.VESTS[id]   || DF.VESTS.none; };
})(window.DF = window.DF || {});
