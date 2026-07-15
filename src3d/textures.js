/* 程序化像素材质 —— 生成 Minecraft 风格 16×16 方块贴图(灰度调制，配合材质颜色相乘)
 * 无素材文件；NearestFilter 保持像素硬边。桩环境下安全降级为 null。
 */
(function (D3) {
  'use strict';

  var cache = {};

  function makeCanvas(size) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;
    return { cv: cv, ctx: ctx };
  }

  function toTex(cv) {
    if (typeof THREE.CanvasTexture !== 'function') return null;
    var t = new THREE.CanvasTexture(cv);
    if (THREE.NearestFilter !== undefined) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
    if (THREE.RepeatWrapping !== undefined) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    t.generateMipmaps = false;
    return t;
  }

  // 灰度噪点填充：val 在 [lo,hi]
  function speckle(ctx, size, lo, hi, px) {
    px = px || 1;
    for (var y = 0; y < size; y += px) for (var x = 0; x < size; x += px) {
      var v = Math.floor((lo + Math.random() * (hi - lo)) * 255);
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      ctx.fillRect(x, y, px, px);
    }
  }

  var BUILDERS = {
    // 通用石/土：中等噪点
    stone: function (ctx, s) { speckle(ctx, s, 0.72, 1.0, 1); },
    // 草：细腻 + 顶部略亮
    grass: function (ctx, s) { speckle(ctx, s, 0.78, 1.0, 1); for (var i = 0; i < 26; i++) { var x = (Math.random()*s)|0, y = (Math.random()*s)|0; ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(x, y, 1, 1); } },
    // 沙：明亮细噪
    sand: function (ctx, s) { speckle(ctx, s, 0.86, 1.0, 1); },
    // 雪：极亮微噪
    snow: function (ctx, s) { speckle(ctx, s, 0.9, 1.0, 1); },
    // 木纹：竖向纹理 + 结节
    wood: function (ctx, s) {
      for (var x = 0; x < s; x++) { var base = 0.72 + Math.random() * 0.12 + (x % 3 === 0 ? -0.08 : 0); base = Math.max(0.5, Math.min(1, base)); var v = (base * 255) | 0; ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; ctx.fillRect(x, 0, 1, s); }
      for (var k = 0; k < 3; k++) { var kx = (Math.random()*s)|0, ky = (Math.random()*s)|0; ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(kx, ky, 2, 2); }
    },
    // 树叶：斑驳 + 暗洞
    leaves: function (ctx, s) {
      speckle(ctx, s, 0.7, 1.0, 1);
      for (var i = 0; i < 22; i++) { var x = (Math.random()*s)|0, y = (Math.random()*s)|0; ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + Math.random()*0.3) + ')'; ctx.fillRect(x, y, 1, 1); }
    },
    // 圆石：块状明暗
    cobble: function (ctx, s) {
      speckle(ctx, s, 0.6, 0.95, 2);
      for (var i = 0; i < 10; i++) { var x = (Math.random()*s)|0, y = (Math.random()*s)|0; ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y, 2, 2); }
    }
  };

  function get(type) {
    if (cache[type] !== undefined) return cache[type];
    var mk = makeCanvas(16);
    if (!mk) { cache[type] = null; return null; }
    (BUILDERS[type] || BUILDERS.stone)(mk.ctx, 16);
    var t = toTex(mk.cv);
    cache[type] = t;
    return t;
  }

  // 平铺版（地面用，repeat n×n）
  function getTiled(type, n) {
    var key = type + '@' + n;
    if (cache[key] !== undefined) return cache[key];
    var base = get(type);
    if (!base) { cache[key] = null; return null; }
    var mk = makeCanvas(16);
    (BUILDERS[type] || BUILDERS.stone)(mk.ctx, 16);
    var t = toTex(mk.cv);
    if (t && t.repeat && t.repeat.set) t.repeat.set(n, n);
    cache[key] = t;
    return t;
  }

  D3.tex = { get: get, getTiled: getTiled };
})(window.D3 = window.D3 || {});
