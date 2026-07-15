/* 全医疗 / 道具数据 —— 对应设计文档「医疗急救道具 / 护甲维修 / 其他道具」
 * useTime : 使用耗时（秒，期间不可移动射击）
 * key     : 绑定按键
 * apply(agent) : 施加效果（在 agent 上实现）
 */
(function (DF) {
  'use strict';

  DF.ITEMS = {
    cat: {
      id:'cat', name:'CAT 止血带', key:'1', useTime:1.4, charges:2,
      desc:'治疗独立伤口，快速止血，防止持续掉血',
      apply: function (a) { a.bleeding = 0; a.heal(15); }
    },
    dek: {
      id:'dek', name:'DEK 野战手术包', key:'2', useTime:3.0, charges:1,
      desc:'一次性修复部位所有损伤（大量回血 + 止血）',
      apply: function (a) { a.bleeding = 0; a.heal(60); }
    },
    medbox: {
      id:'medbox', name:'战地医疗箱', key:'3', useTime:4.0, charges:1,
      desc:'大量回复全生命值，残血拉满',
      apply: function (a) { a.bleeding = 0; a.heal(a.maxHealth); }
    },
    dve: {
      id:'dve', name:'DVE 止疼片', key:'4', useTime:1.0, charges:2,
      desc:'消除受伤屏幕抖动，大幅提升开镜稳定性',
      apply: function (a) { a.painkillerUntil = a.game.time + 12; }
    },
    oe2: {
      id:'oe2', name:'OE2 战斗兴奋剂', key:'4', useTime:1.2, charges:2,
      desc:'快速回复体力，跑图拉枪补充机动性',
      apply: function (a) { a.stamina = a.maxStamina; a.adrenalineUntil = a.game.time + 6; }
    },
    armorkit: {
      id:'armorkit', name:'高级护甲维修组合', key:'5', useTime:2.6, charges:1,
      desc:'大幅回复防护衣耐久，避免被一枪穿',
      apply: function (a) { a.vestDur = a.vestMax; a.helmetDur = a.helmetMax; }
    }
  };

  DF.getItem = function (id) { return DF.ITEMS[id] || null; };
})(window.DF = window.DF || {});
