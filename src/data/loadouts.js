/* 15 套战备预设 —— 对应设计文档「全档位战备套装完整配置表」
 * cost      : 价格档
 * primary   : 主武器 id（null = 无主武器）
 * secondary : 副武器 id
 * helmet/vest : 护甲 id
 * items     : 附带道具 id 列表（初始携带）
 * tag       : 定位标签
 */
(function (DF) {
  'use strict';

  DF.LOADOUTS = [
    // —— 200 档 ——
    { id:'quanzidong', cost:200, name:'全自动之力', primary:null, secondary:'g18',    helmet:'mc',  vest:'tg', items:['cat'],        tag:'手枪压制' },
    { id:'miaosha',    cost:200, name:'秒杀',       primary:null, secondary:'deagle', helmet:'mc',  vest:'tg', items:['cat'],        tag:'手枪爆发' },
    { id:'sandanfengbao',cost:200,name:'霰弹风暴',  primary:'m870',secondary:null,    helmet:'mc',  vest:'tg', items:['cat'],        tag:'贴脸巷战' },

    // —— 1000 档 ——
    { id:'jinshenroubo',cost:1000,name:'近身肉搏',  primary:'yongshi',secondary:null, helmet:'gt1', vest:'mk2',items:['cat','oe2'],  tag:'近距突进' },
    { id:'junheng',    cost:1000,name:'均衡之选',   primary:'qbz95',secondary:null,   helmet:'mhs', vest:'hmp',items:['cat','dve'],  tag:'中距输出' },
    { id:'yuandaji',   cost:1000,name:'远距离打击', primary:'sv98', secondary:'g18',  helmet:'dich',vest:'wushi',items:['cat'],      tag:'远程狙击' },

    // —— 2500 档 ——
    { id:'tuposhou',   cost:2500,name:'突破手',     primary:'mk4',  secondary:null,   helmet:'gt1', vest:'mk2',items:['cat','dek','oe2'], tag:'近距突破' },
    { id:'buqiangshou',cost:2500,name:'步枪手',     primary:'qjb201',secondary:null,  helmet:'mhs', vest:'hmp',items:['cat','dek'],  tag:'中距压制' },
    { id:'jujishou',   cost:2500,name:'狙击手',     primary:'m700', secondary:'g18',  helmet:'dich',vest:'wushi',items:['cat','dve'],tag:'远程点杀' },

    // —— 4000 档 ——
    { id:'zhunxingjing',cost:4000,name:'什么是瞄准镜',primary:'vector',secondary:'deagle',helmet:'gt1',vest:'mk2',items:['cat','dek','armorkit'],tag:'高机动定点' },
    { id:'youshijuli', cost:4000,name:'什么是优势距离',primary:'tenglong',secondary:'g18',helmet:'mhs',vest:'hmp',items:['cat','dek','armorkit'],tag:'中距突击' },
    { id:'huanzidan',  cost:4000,name:'什么是换子弹', primary:'pkm', secondary:'g18',  helmet:'dich',vest:'wushi',items:['cat','armorkit'],tag:'超强火力压制' },

    // —— 6000 档 ——
    { id:'ronghuadiren',cost:6000,name:'贴身融化敌人',primary:'m14', secondary:'deagle',helmet:'gt1',vest:'mk2',items:['cat','dek','medbox','armorkit'],tag:'中距化伤' },
    { id:'koujingshiyong',cost:6000,name:'6.8 口径使用者',primary:'m250',secondary:'g18',helmet:'mhs',vest:'hmp',items:['cat','dek','medbox','armorkit'],tag:'持续压制' },
    { id:'dajuzaili',  cost:6000,name:'大狙在里面但你得找',primary:'sr25',secondary:'g18',helmet:'dich',vest:'wushi',items:['cat','dek','medbox','armorkit'],tag:'中远精确' }
  ];

  DF.getLoadout = function (id) { return DF.LOADOUTS.find(function (l) { return l.id === id; }) || null; };
})(window.DF = window.DF || {});
