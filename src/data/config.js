/* 全局平衡性配置 —— 所有可调数值集中于此 */
(function (DF) {
  'use strict';

  DF.CONFIG = {
    version: '1.0.0',

    // 画布 / 世界（单屏，不滚动）
    world: { width: 1280, height: 720 },

    // 赛制（源自设计文档：7 局合制，先赢 3 局夺冠）
    match: {
      roundsToWin: 3,
      maxRounds: 7,
      buyTime: 12,       // 购买阶段秒数
      roundTime: 75,     // 单局时限（秒）；超时未破译判防守方胜
      roundEndDelay: 3.5 // 小局结束展示秒数
    },

    // 干员基础属性
    agent: {
      maxHealth: 100,
      maxStamina: 100,
      radius: 13,
      walkSpeed: 145,     // px/s
      sprintSpeed: 245,   // px/s
      staminaDrain: 28,   // 冲刺每秒消耗
      staminaRegen: 14,   // 静止/行走每秒回复
      bleedDps: 3.5,      // 流血每秒掉血
      bleedChance: 0.35   // 受躯干伤害触发流血概率
    },

    // 伤害结算
    combat: {
      headMultiplier: 4.0,   // 爆头倍率
      armorAbsorb: 0.5,      // 有甲时躯干伤害被护甲吸收的比例
      helmetAbsorb: 0.6,     // 有盔时爆头额外伤害被头盔吸收的比例
      meleeBackstab: 999,    // 背刺直接致死
      meleeFront: 55
    },

    // 经济
    economy: {
      startMoney: 800,
      maxMoney: 12000,
      winReward: 3000,
      lossBase: 1500,
      lossStep: 350,        // 每连败递增
      lossMax: 2900,
      killReward: 150,
      sniperKillReward: 100,
      meleeKillReward: 250,
      decryptReward: 300
    },

    // 目标：密钥破译
    objective: {
      decryptTime: 6.0,     // 持续破译所需秒数
      radius: 46            // 破译交互半径
    },

    // AI
    ai: {
      viewDistance: 620,
      fovDeg: 200,          // 视野角（度）
      aimError: 0.11,       // 基础瞄准误差（弧度）
      reactionTime: 0.22,   // 发现目标到开火的延迟
      repositionCooldown: 2.5
    }
  };
})(window.DF = window.DF || {});
