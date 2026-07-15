/* 二维向量 / 几何工具（纯函数，可 node 单测） */
(function (DF) {
  'use strict';

  var V = {
    add:  function (a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
    sub:  function (a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
    scale:function (a, s) { return { x: a.x * s, y: a.y * s }; },
    len:  function (a) { return Math.hypot(a.x, a.y); },
    dist: function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
    dist2:function (a, b) { var dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; },
    norm: function (a) { var l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
    dot:  function (a, b) { return a.x * b.x + a.y * b.y; },
    fromAngle: function (r) { return { x: Math.cos(r), y: Math.sin(r) }; },
    angle: function (a) { return Math.atan2(a.y, a.x); },
    rotate: function (a, r) {
      var c = Math.cos(r), s = Math.sin(r);
      return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
    },
    // 角度归一化到 [-PI, PI]
    wrapAngle: function (r) {
      while (r >  Math.PI) r -= Math.PI * 2;
      while (r < -Math.PI) r += Math.PI * 2;
      return r;
    },
    lerpAngle: function (a, b, t) {
      var d = V.wrapAngle(b - a);
      return a + d * t;
    },
    clamp: function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  };

  // 线段 (p1->p2) 与轴对齐矩形 rect{x,y,w,h} 是否相交
  function segIntersectsRect(p1, p2, rect) {
    if (pointInRect(p1, rect) || pointInRect(p2, rect)) return true;
    var r = rect;
    return segSeg(p1, p2, {x:r.x,y:r.y},       {x:r.x+r.w,y:r.y}) ||
           segSeg(p1, p2, {x:r.x+r.w,y:r.y},   {x:r.x+r.w,y:r.y+r.h}) ||
           segSeg(p1, p2, {x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}) ||
           segSeg(p1, p2, {x:r.x,y:r.y+r.h},   {x:r.x,y:r.y});
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // 线段相交判定
  function segSeg(p1, p2, p3, p4) {
    var d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (d === 0) return false;
    var u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    var v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  // 圆 (c, radius) 与线段最近碰撞点，命中返回 {t, point}，否则 null
  function segCircle(p1, p2, c, radius) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var fx = p1.x - c.x, fy = p1.y - c.y;
    var a = dx*dx + dy*dy;
    var b = 2 * (fx*dx + fy*dy);
    var cc = fx*fx + fy*fy - radius*radius;
    var disc = b*b - 4*a*cc;
    if (disc < 0 || a === 0) return null;
    disc = Math.sqrt(disc);
    var t1 = (-b - disc) / (2*a);
    var t2 = (-b + disc) / (2*a);
    var t = (t1 >= 0 && t1 <= 1) ? t1 : ((t2 >= 0 && t2 <= 1) ? t2 : -1);
    if (t < 0) return null;
    return { t: t, point: { x: p1.x + dx*t, y: p1.y + dy*t } };
  }

  DF.V = V;
  DF.geom = {
    segIntersectsRect: segIntersectsRect,
    pointInRect: pointInRect,
    segSeg: segSeg,
    segCircle: segCircle
  };
})(typeof window !== 'undefined' ? (window.DF = window.DF || {}) : (module.exports = {}));
