/* 伤害结算 —— 纯函数，护甲 / 爆头 / 距离衰减，可 node 单测
 *
 * resolveDamage(params) => result
 *   params: {
 *     baseDamage, headshot(bool), distance, range,
 *     health, vestDur, helmetDur,
 *     cfg (DF.CONFIG.combat), category
 *   }
 *   result: { health, vestDur, helmetDur, dealt, headshot, killed, bledTrigger }
 */
(function (DF) {
  'use strict';

  function resolveDamage(p) {
    var cfg = p.cfg;
    var dmg = p.baseDamage;

    // 距离衰减：超出有效射程后线性衰减，最低 40%
    if (p.distance > p.range) {
      var over = (p.distance - p.range) / p.range;
      dmg *= Math.max(0.4, 1 - over * 0.6);
    }

    var health = p.health;
    var vestDur = p.vestDur;
    var helmetDur = p.helmetDur;
    var headshot = !!p.headshot;

    if (headshot) {
      dmg *= cfg.headMultiplier;
      // 头盔吸收部分爆头溢出伤害
      if (helmetDur > 0) {
        var absorbedH = dmg * cfg.helmetAbsorb;
        var takenH = Math.min(helmetDur, absorbedH);
        helmetDur -= takenH;
        dmg -= takenH;
      }
    } else {
      // 护甲吸收躯干伤害
      if (vestDur > 0) {
        var absorbedB = dmg * cfg.armorAbsorb;
        var takenB = Math.min(vestDur, absorbedB);
        vestDur -= takenB;
        dmg -= takenB;
      }
    }

    dmg = Math.max(0, dmg);
    health -= dmg;

    var killed = health <= 0;
    // 躯干中弹且未致死可能触发流血
    var bledTrigger = !headshot && !killed && dmg > 0;

    return {
      health: Math.max(0, health),
      vestDur: Math.max(0, vestDur),
      helmetDur: Math.max(0, helmetDur),
      dealt: Math.round(dmg * 10) / 10,
      headshot: headshot,
      killed: killed,
      bledTrigger: bledTrigger
    };
  }

  // 命中部位判定：距瞄准点越近越可能爆头；近距离爆头率更高
  function rollHeadshot(rng, aimQuality, distance) {
    // aimQuality: 0~1，越高越精准
    var base = 0.10 + aimQuality * 0.18;
    if (distance < 160) base += 0.08;
    return rng.next() < base;
  }

  DF.combat = { resolveDamage: resolveDamage, rollHeadshot: rollHeadshot };
})(typeof window !== 'undefined' ? (window.DF = window.DF || {}) : (module.exports = {}));
