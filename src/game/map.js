/* 地图：边界、掩体、进攻/防守出生点、密钥站点、视线遮挡 */
(function (DF) {
  'use strict';

  function GameMap(cfg) {
    var W = cfg.world.width, H = cfg.world.height;
    this.width = W;
    this.height = H;
    var T = 24; // 边界厚度

    // 掩体墙（阻挡移动 + 遮挡视线/子弹）
    // 设计原则：开阔可交火的中央竞技场 + 对称掩体 + 侧翼通路，避免死锁式对峙。
    this.walls = [
      // 外边界
      { x: 0, y: 0, w: W, h: T },
      { x: 0, y: H - T, w: W, h: T },
      { x: 0, y: 0, w: T, h: H },
      { x: W - T, y: 0, w: T, h: H },

      // 四角掩体柱（提供架枪点，不封锁视线）
      { x: 235, y: 235, w: 60, h: 60 },
      { x: 985, y: 235, w: 60, h: 60 },
      { x: 235, y: 425, w: 60, h: 60 },
      { x: 985, y: 425, w: 60, h: 60 },

      // 中央上下短墙（围绕站点形成可争夺据点，两侧留出通路）
      { x: 560, y: 250, w: 160, h: 26 },   // 站点上方掩体
      { x: 560, y: 444, w: 160, h: 26 },   // 站点下方掩体

      // 左右竖向隔断（制造进攻左右分推的节奏，中段留缺口）
      { x: 430, y: 120, w: 26, h: 130 },
      { x: 430, y: 470, w: 26, h: 130 },
      { x: 824, y: 120, w: 26, h: 130 },
      { x: 824, y: 470, w: 26, h: 130 }
    ];

    // 低矮掩体（阻挡子弹与视线）
    this.crates = [
      { x: 610, y: 150, w: 44, h: 44 },   // 站点正上/下的近身掩体
      { x: 626, y: 526, w: 44, h: 44 },
      { x: 360, y: 340, w: 44, h: 44 },   // 站点左右近身掩体
      { x: 916, y: 340, w: 44, h: 44 }
    ];

    // 站点（密钥破译点）—— 正中央，多方向可争夺
    this.site = { x: W / 2, y: H / 2 };

    // 出生点：进攻方（下方），防守方（上方）
    this.attackerSpawns = [
      { x: 360, y: 660 }, { x: 640, y: 685 }, { x: 920, y: 660 }
    ];
    this.defenderSpawns = [
      { x: 360, y: 90 }, { x: 920, y: 90 }, { x: 640, y: 95 }
    ];

    // 所有阻挡体（墙 + 箱）
    this.blockers = this.walls.concat(this.crates);
  }

  // 点是否可通行（考虑半径）
  GameMap.prototype.circleBlocked = function (x, y, r) {
    for (var i = 0; i < this.blockers.length; i++) {
      var b = this.blockers[i];
      var nx = Math.max(b.x, Math.min(x, b.x + b.w));
      var ny = Math.max(b.y, Math.min(y, b.y + b.h));
      var dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < r * r) return b;
    }
    return null;
  };

  // 视线是否被阻挡（p1->p2 与任意阻挡体相交）
  GameMap.prototype.lineBlocked = function (p1, p2) {
    for (var i = 0; i < this.blockers.length; i++) {
      if (DF.geom.segIntersectsRect(p1, p2, this.blockers[i])) return true;
    }
    return false;
  };

  // 子弹与墙的最近命中点（返回 t，无命中返回 1）
  GameMap.prototype.raycastWalls = function (p1, p2) {
    var best = 1;
    for (var i = 0; i < this.blockers.length; i++) {
      var b = this.blockers[i];
      var t = rayRectT(p1, p2, b);
      if (t != null && t < best) best = t;
    }
    return best;
  };

  function rayRectT(p1, p2, r) {
    // 线段与矩形四边相交的最小 t
    var edges = [
      [{x:r.x,y:r.y},        {x:r.x+r.w,y:r.y}],
      [{x:r.x+r.w,y:r.y},    {x:r.x+r.w,y:r.y+r.h}],
      [{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}],
      [{x:r.x,y:r.y+r.h},    {x:r.x,y:r.y}]
    ];
    var best = null;
    for (var i = 0; i < 4; i++) {
      var t = segT(p1, p2, edges[i][0], edges[i][1]);
      if (t != null && (best == null || t < best)) best = t;
    }
    return best;
  }

  function segT(p1, p2, p3, p4) {
    var d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (d === 0) return null;
    var u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    var v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return u;
    return null;
  }

  DF.GameMap = GameMap;
})(window.DF = window.DF || {});
