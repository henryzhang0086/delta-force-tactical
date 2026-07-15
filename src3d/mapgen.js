/* 程序化 3D 地图生成 —— 每局地图都不同
 * 5 种主题(沙漠/都市/雪原/丛林/夜港)，随机掩体布局与三方对称出生点。
 * generate() 返回：
 *   { group, solids[], colliders[], spawns{alpha,bravo,charlie}, center, radius, theme }
 *   - group     : 场景根节点（加到 scene）
 *   - solids[]  : 参与子弹射线检测的实体网格（墙/掩体/建筑）
 *   - colliders[]: 移动碰撞用 AABB {minX,maxX,minZ,maxZ,h}
 *   - spawns    : 三支队伍的出生点数组（世界坐标 THREE.Vector3）
 */
(function (D3) {
  'use strict';
  var T = null; // toon 工具，延迟取

  // Minecraft 生物群系配色
  var THEMES = {
    urban:  { name:'平原',   ground:0x6AA84F, ground2:0x5C9B43, sky1:0x79C0FF, sky2:0xCDEBFF, fog:0xBFE3F2, fogD:0.007, cover:0x8C8C8C, wood:0x9A7A4B, leaf:0x4E9E3A, dirt:0x8A5A2B, amb:0.88, sun:0xFFFBEA, accent:0xF2C14E, decor:'oak',    weather:'none',  groundTex:'grass', exposure:1.02 },
    desert: { name:'沙漠',   ground:0xD9C68C, ground2:0xC9B478, sky1:0x8FC7E8, sky2:0xEADFBC, fog:0xD8C79A, fogD:0.006, cover:0xCBB783, wood:0xB29051, leaf:0x6AA84F, dirt:0xC3AE72, amb:0.70, sun:0xF6E9C4, accent:0xD94F3D, decor:'cactus', weather:'dust',  groundTex:'sand',  exposure:0.80 },
    snow:   { name:'雪原',   ground:0xDDE6EE, ground2:0xCAD6E2, sky1:0xAFD1EA, sky2:0xDCE8F2, fog:0xD4E0EC, fogD:0.010, cover:0xA2B4C6, wood:0x5A4630, leaf:0x3E6E4A, dirt:0x8A5A2B, amb:0.72, sun:0xE6EEF6, accent:0x3D8BD9, decor:'spruce', weather:'snow',  groundTex:'snow',  exposure:0.80 },
    jungle: { name:'丛林',   ground:0x4E8232, ground2:0x3E6A26, sky1:0x86C58E, sky2:0xE7F4D6, fog:0x9CC080, fogD:0.011, cover:0x8A8A8A, wood:0x5A4326, leaf:0x357D28, dirt:0x6b4a2a, amb:0.84, sun:0xFFF6D6, accent:0xE85D2A, decor:'jungle', weather:'none',  groundTex:'grass', exposure:1.0  },
    night:  { name:'夜晚',   ground:0x2E4A34, ground2:0x24402A, sky1:0x0E1630, sky2:0x2A3A66, fog:0x162038, fogD:0.014, cover:0x5a5a62, wood:0x4a3826, leaf:0x2E5E28, dirt:0x3a2a1a, amb:0.5,  sun:0x9FB4FF, accent:0x39E0C8, decor:'oak',    weather:'rain',  groundTex:'grass', exposure:1.1  }
  };
  var THEME_KEYS = Object.keys(THEMES);

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // 在 group 中加一个立方掩体，并登记碰撞/射线体
  function addBox(ctx, x, z, w, h, d, color, opts) {
    opts = opts || {};
    var mesh = T.mesh(new THREE.BoxGeometry(w, h, d), color, { outline: opts.outline || 0.035, outlineColor: opts.outlineColor, tex: opts.tex || 'stone' });
    mesh.position.set(x, h / 2, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.userData.solid = true;
    ctx.group.add(mesh);
    ctx.solids.push(mesh);
    // 旋转的盒子用外接 AABB 近似碰撞
    var hw = w / 2, hd = d / 2;
    if (opts.ry) { var c = Math.abs(Math.cos(opts.ry)), s = Math.abs(Math.sin(opts.ry)); var ew = hw*c+hd*s, ed = hw*s+hd*c; hw = ew; hd = ed; }
    ctx.colliders.push({ minX:x-hw, maxX:x+hw, minZ:z-hd, maxZ:z+hd, h:h });
    return mesh;
  }

  function addCylinder(ctx, x, z, r, h, color, solid) {
    var mesh = T.mesh(new THREE.CylinderGeometry(r, r, h, 12), color, { outline: 0.03 });
    mesh.position.set(x, h / 2, z);
    ctx.group.add(mesh);
    if (solid) {
      mesh.userData.solid = true; ctx.solids.push(mesh);
      ctx.colliders.push({ minX:x-r, maxX:x+r, minZ:z-r, maxZ:z+r, h:h });
    }
    return mesh;
  }

  // 非碰撞装饰方块（树叶/草）
  function leafBox(ctx, x, y, z, w, h, d, color) {
    var m = T.mesh(new THREE.BoxGeometry(w, h, d), color, { outline: 0.02, cast: true, receive: false, tex: 'leaves' });
    m.position.set(x, y, z); ctx.group.add(m); return m;
  }
  // 树干（碰撞）
  function trunk(ctx, x, z, h, color) {
    var m = T.mesh(new THREE.BoxGeometry(0.5, h, 0.5), color, { outline: 0.02, tex: 'wood' });
    m.position.set(x, h / 2, z); m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
    ctx.colliders.push({ minX:x-0.3, maxX:x+0.3, minZ:z-0.3, maxZ:z+0.3, h:h });
    return m;
  }

  // Minecraft 各类树 / 仙人掌 / 巨石
  function addTree(ctx, x, z, th) {
    var kind = th.decor;
    if (kind === 'cactus') {
      var ch = rand(1.6, 2.8);
      var c = T.mesh(new THREE.BoxGeometry(0.5, ch, 0.5), 0x4E8B3A, { outline: 0.02 });
      c.position.set(x, ch/2, z); c.userData.solid = true; ctx.group.add(c); ctx.solids.push(c);
      ctx.colliders.push({minX:x-0.3,maxX:x+0.3,minZ:z-0.3,maxZ:z+0.3,h:ch});
      if (Math.random() < 0.6) { var arm = T.mesh(new THREE.BoxGeometry(0.42,0.42,0.42),0x4E8B3A,{outline:0.02}); arm.position.set(x+0.45, ch*0.6, z); ctx.group.add(arm); }
      return;
    }
    if (kind === 'spruce') {
      var h = rand(2.6, 3.6); trunk(ctx, x, z, h, th.wood);
      for (var s = 0; s < 3; s++) { var w = 2.4 - s * 0.7; leafBox(ctx, x, h - 0.2 + s * 0.9, z, w, 0.8, w, th.leaf); }
      leafBox(ctx, x, h + 2.1, z, 0.9, 0.7, 0.9, th.leaf);
      leafBox(ctx, x, h + 2.5, z, 0.5, 0.4, 0.5, 0xffffff); // 雪帽
      return;
    }
    if (kind === 'jungle') {
      var jh = rand(3.6, 5.0); trunk(ctx, x, z, jh, th.wood);
      leafBox(ctx, x, jh + 0.3, z, 3.2, 1.4, 3.2, th.leaf);
      leafBox(ctx, x, jh + 1.3, z, 2.0, 0.9, 2.0, th.leaf);
      return;
    }
    // oak（橡树）
    var oh = rand(2.4, 3.4); trunk(ctx, x, z, oh, th.wood);
    leafBox(ctx, x, oh + 0.4, z, 2.4, 1.3, 2.4, th.leaf);
    leafBox(ctx, x, oh + 1.4, z, 1.5, 0.8, 1.5, th.leaf);
  }

  function addBoulder(ctx, x, z) {
    var n = 1 + (Math.random()*2|0);
    for (var i=0;i<n;i++){
      var s = rand(0.7,1.1), bx = x+rand(-0.4,0.4), bz = z+rand(-0.4,0.4);
      var m = T.mesh(new THREE.BoxGeometry(s,s,s), pick([0x8A8A8A,0x7a7a7a,0x949494]), {outline:0.02});
      m.position.set(bx, s/2 + (i>0?s*0.7:0), bz); m.rotation.y = rand(0,0.5);
      m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
      ctx.colliders.push({minX:bx-s/2,maxX:bx+s/2,minZ:bz-s/2,maxZ:bz+s/2,h:s*1.4});
    }
  }

  // 主题装饰
  function decorate(ctx, th) {
    var R = ctx.radius;
    for (var i = 0; i < 44; i++) {
      var ang = rand(0, Math.PI * 2), dist = rand(6, R - 4);
      var x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (Math.hypot(x, z) < 5) continue;
      var r = Math.random();
      if (r < 0.68) addTree(ctx, x, z, th);
      else if (r < 0.85) addBoulder(ctx, x, z);
      else { // 草丛/花（非碰撞矮方块）
        var gm = leafBox(ctx, x, 0.2, z, 0.36, 0.4, 0.36, pick([th.leaf, 0x7ab648, th.accent]));
      }
    }
    // 夜晚：荧石灯柱
    if (th === THEMES.night) {
      for (var k = 0; k < 8; k++) {
        var a = rand(0,Math.PI*2), d = rand(8, R-3), px = Math.cos(a)*d, pz = Math.sin(a)*d;
        addBox(ctx, px, pz, 0.4, 3.6, 0.4, 0x3a2a1a, {outline:0.02});
        var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,0.6), T.glow(0xFFE08A));
        lamp.position.set(px, 3.8, pz); ctx.group.add(lamp);
        var pl = new THREE.PointLight(0xFFD98A, 0.9, 18); pl.position.set(px,3.6,pz); ctx.group.add(pl);
      }
    }
  }

  // 建筑：方块小屋（网格对齐，Minecraft 风）
  function addBuilding(ctx, cx, cz, th) {
    var w = rand(6,10), d = rand(5,8), h = rand(3.0,4.6);
    addBox(ctx, cx, cz, w, h, d, th.cover, { ry: 0, outline:0.04 });
    // 屋顶（木/深色）
    var roof = T.mesh(new THREE.BoxGeometry(w+0.4, 0.5, d+0.4), th.wood, { outline:0.04, cast:false });
    roof.position.set(cx, h+0.25, cz); ctx.group.add(roof);
    addBox(ctx, cx + w/2 + 1.4, cz, 1.6, 1.3, 1.6, th.cover, { ry:0 });
  }

  // 方块堆（下大上小，真正叠起来）
  function addStack(ctx, cx, cz, th) {
    var cols = [th.cover, th.wood, 0x8a8a8a, th.accent];
    addBox(ctx, cx, cz, 2.2, 2.2, 2.2, pick(cols), { ry: 0, outline:0.04 }); // 底(碰撞 h=2.2)
    var top = T.mesh(new THREE.BoxGeometry(1.7, 1.6, 1.7), pick(cols), { outline: 0.03 });
    top.position.set(cx, 2.2 + 0.8, cz); ctx.group.add(top);           // 顶(视觉，落在底上)
  }

  // 哨塔：四柱 + 顶部平台（高结构，丰富视野层次）
  function addWatchtower(ctx, cx, cz, th) {
    var s = 2.2, h = rand(4.5,6.0);
    var legs = [[-s,-s],[s,-s],[-s,s],[s,s]];
    for (var i=0;i<4;i++){ addBox(ctx, cx+legs[i][0], cz+legs[i][1], 0.4, h, 0.4, 0x4a4038, {outline:0.03}); }
    // 底部核心遮挡
    addBox(ctx, cx, cz, 1.4, 1.6, 1.4, th.cover, {});
    // 顶部平台（视觉，非碰撞）
    var plat = T.mesh(new THREE.BoxGeometry(s*2+1, 0.35, s*2+1), th.cover, { outline:0.04 });
    plat.position.set(cx, h, cz); ctx.group.add(plat);
    var roof = T.mesh(new THREE.ConeGeometry(s*1.7, 1.4, 4), th.accent, { outline:0.04 });
    roof.position.set(cx, h+0.9, cz); roof.rotation.y = Math.PI/4; ctx.group.add(roof);
  }

  // 沙袋环（矮掩体围一圈）
  function addSandbagRing(ctx, cx, cz, r, th) {
    var n = 10;
    for (var i=0;i<n;i++){
      var a = i/n*Math.PI*2, x = cx+Math.cos(a)*r, z = cz+Math.sin(a)*r;
      if (i%3===0) continue; // 留缺口便于进出
      addBox(ctx, x, z, 1.3, 0.85, 0.9, 0x8a7a52, { ry: a+Math.PI/2, outline:0.03 });
    }
  }

  // 室内房间：四面墙(留门洞) + 平顶 + 室内掩体，形成 CQB 空间
  function addRoom(ctx, cx, cz, w, d, th, doorSide) {
    var h = 3.0, t = 0.3, gap = 2.2;
    var hw = w/2, hd = d/2;
    // 上下墙（沿 X）
    for (var s=0;s<2;s++){
      var zz = cz + (s===0?-hd:hd);
      if ((s===0 && doorSide===0) || (s===1 && doorSide===1)) {
        var seg = (w-gap)/2;
        addBox(ctx, cx-(gap/2+seg/2), zz, seg, h, t, th.cover, {outline:0.04});
        addBox(ctx, cx+(gap/2+seg/2), zz, seg, h, t, th.cover, {outline:0.04});
      } else addBox(ctx, cx, zz, w, h, t, th.cover, {outline:0.04});
    }
    // 左右墙（沿 Z）
    for (var s2=0;s2<2;s2++){
      var xx = cx + (s2===0?-hw:hw);
      if ((s2===0 && doorSide===2) || (s2===1 && doorSide===3)) {
        var seg2 = (d-gap)/2;
        addBox(ctx, xx, cz-(gap/2+seg2/2), t, h, seg2, th.cover, {outline:0.04});
        addBox(ctx, xx, cz+(gap/2+seg2/2), t, h, seg2, th.cover, {outline:0.04});
      } else addBox(ctx, xx, cz, t, h, d, th.cover, {outline:0.04});
    }
    // 平顶（视觉，微透以免室内太暗；不作碰撞）
    var roof = T.mesh(new THREE.BoxGeometry(w+0.3, 0.2, d+0.3), th.cover, { outline:0.04, cast:false });
    roof.position.set(cx, h, cz); ctx.group.add(roof);
    // 室内掩体
    addBox(ctx, cx+rand(-hw*0.4,hw*0.4), cz+rand(-hd*0.4,hd*0.4), rand(0.8,1.3), rand(0.9,1.4), rand(0.8,1.3), pick([th.cover,0x8a6d4a]), {ry:rand(0,Math.PI)});
  }

  // 建筑群：2 个相邻房间，门洞朝向不同，形成室内穿插
  function addCompound(ctx, cx, cz, th) {
    var w = rand(7,9), d = rand(6,8);
    addRoom(ctx, cx, cz, w, d, th, (Math.random()*4)|0);
    if (Math.random() < 0.7) {
      var ang = rand(0,Math.PI*2), off = w*0.55 + rand(1,2);
      addRoom(ctx, cx+Math.cos(ang)*off, cz+Math.sin(ang)*off, rand(5,7), rand(5,7), th, (Math.random()*4)|0);
    }
  }

  // 外围阶梯方块丘陵（Minecraft 山，纯背景不碰撞）
  function addHills(ctx, th) {
    var R = ctx.radius + 10, n = 14;
    for (var i=0;i<n;i++){
      var a = i/n*Math.PI*2 + rand(-0.12,0.12), dd = R + rand(0,16);
      var cx = Math.cos(a)*dd, cz = Math.sin(a)*dd;
      var layers = 3 + (Math.random()*3|0), base = rand(9, 16), step = rand(2.2, 3.4);
      for (var L=0; L<layers; L++){
        var w = base - L*(base/layers)*0.7, y = L*step + step/2;
        var col = L === layers-1 ? th.ground : (L===0 ? th.dirt : th.ground2);
        var block = T.mesh(new THREE.BoxGeometry(w, step, w), col, { outline:0.05, cast:false, receive:false });
        block.position.set(cx + rand(-1,1), y - step*0.4, cz + rand(-1,1));
        ctx.group.add(block);
      }
    }
  }

  // 水面材质（波光粼粼）
  function waterMat(baseHex) {
    return new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide,
      uniforms: { uTime:{value:0}, uColor:{value:new THREE.Color(baseHex)}, uColor2:{value:new THREE.Color(0xffffff)} },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform vec3 uColor2;',
        'void main(){',
        '  float w = sin((vUv.x*22.0)+uTime*1.6)*0.5+0.5;',
        '  float w2 = sin((vUv.y*18.0)-uTime*1.2)*0.5+0.5;',
        '  float shine = pow(w*w2, 3.0);',
        '  vec3 c = mix(uColor, uColor2, shine*0.6);',
        '  gl_FragColor = vec4(c, 0.82);',
        '}'
      ].join('\n')
    });
  }

  // 湖泊（方形水塘 Minecraft 风）：水面 + 环湖岩石(碰撞)
  function addLake(ctx, cx, cz, r, th) {
    var water = new THREE.Mesh(new THREE.PlaneGeometry(r*2, r*2), waterMat(th === THEMES.night ? 0x1c3a5a : 0x3d78b0));
    water.rotation.x = -Math.PI/2; water.position.set(cx, 0.08, cz);
    ctx.group.add(water); ctx.water = water;
    // 沙/泥岸
    var bank = T.mesh(new THREE.PlaneGeometry(r*2+2.4, r*2+2.4), th.dirt || 0x8a5a2b, { outline:false, cast:false });
    bank.rotation.x = -Math.PI/2; bank.position.set(cx, 0.05, cz); ctx.group.add(bank);
    // 环湖岩石（阻挡，绕行）
    var n = 14;
    for (var i=0;i<n;i++){
      var a = i/n*Math.PI*2, x = cx+Math.cos(a)*(r+0.5), z = cz+Math.sin(a)*(r+0.5), rr = rand(0.7,1.2);
      var rock = T.mesh(new THREE.DodecahedronGeometry(rr,0), 0x7a6a52, { outline:0.03 });
      rock.position.set(x, rr*0.5, z); rock.rotation.set(rand(0,3),rand(0,3),rand(0,3));
      rock.userData.solid = true; ctx.group.add(rock); ctx.solids.push(rock);
      ctx.colliders.push({minX:x-rr,maxX:x+rr,minZ:z-rr,maxZ:z+rr,h:rr*1.2});
    }
    // 湖心本身作为障碍（防止走到水面）
    ctx.colliders.push({minX:cx-r*0.7,maxX:cx+r*0.7,minZ:cz-r*0.7,maxZ:cz+r*0.7,h:0.6});
  }

  // 城市高楼（多层 + 发光窗带），车体全高碰撞作掩体
  function addTower(ctx, cx, cz, w, d, floors, th) {
    var fh = 3.0, h = floors * fh;
    var body = pick([0x8a8f98, 0x9aa0a8, 0x7a818c, 0xa8a290, 0x6e7681]);
    addBox(ctx, cx, cz, w, h, d, body, { outline: 0.05 });
    var winOpts = { emissive: 0xffe9a8, emissiveIntensity: 0.5, transparent: true, opacity: 0.92, outline: false, steps: 3, cast: false };
    for (var fl = 0; fl < floors; fl++) {
      var y = fl * fh + fh * 0.58;
      var a = T.mesh(new THREE.BoxGeometry(w * 0.86, 1.1, 0.1), 0x2a3345, winOpts); a.position.set(cx, y, cz + d / 2 + 0.03); ctx.group.add(a);
      var b = T.mesh(new THREE.BoxGeometry(w * 0.86, 1.1, 0.1), 0x2a3345, winOpts); b.position.set(cx, y, cz - d / 2 - 0.03); ctx.group.add(b);
      var c2 = T.mesh(new THREE.BoxGeometry(0.1, 1.1, d * 0.86), 0x2a3345, winOpts); c2.position.set(cx + w / 2 + 0.03, y, cz); ctx.group.add(c2);
      var e = T.mesh(new THREE.BoxGeometry(0.1, 1.1, d * 0.86), 0x2a3345, winOpts); e.position.set(cx - w / 2 - 0.03, y, cz); ctx.group.add(e);
    }
    var roof = T.mesh(new THREE.BoxGeometry(w * 0.45, 0.9, d * 0.45), 0x555b63, { outline: 0.03, cast: false }); roof.position.set(cx, h + 0.45, cz); ctx.group.add(roof);
    if (Math.random() < 0.5) { var ac = T.mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0), 0x3a4048, { outline: 0.02, cast: false }); ac.position.set(cx + rand(-w * 0.2, w * 0.2), h + 0.9, cz + rand(-d * 0.2, d * 0.2)); ctx.group.add(ac); }
  }

  // 平铺路面（非碰撞装饰）
  function addRoad(ctx, x1, z1, x2, z2, wdt) {
    var dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
    var r = T.mesh(new THREE.BoxGeometry(wdt, 0.06, len), 0x3a3d44, { outline: false, cast: false }); r.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2); r.rotation.y = ang; ctx.group.add(r);
    var mid = T.mesh(new THREE.BoxGeometry(0.25, 0.07, len * 0.9), 0xd9c86a, { outline: false, cast: false }); mid.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2); mid.rotation.y = ang; ctx.group.add(mid);
  }

  // 带底高的实体盒（分层墙/围栏/室内掩体）：底面在 yBase，垂直分层碰撞
  function addBoxY(ctx, x, z, w, h, d, color, yBase, opts) {
    opts = opts || {};
    var mesh = T.mesh(new THREE.BoxGeometry(w, h, d), color, { outline: opts.outline || 0.03, outlineColor: opts.outlineColor, tex: opts.tex });
    mesh.position.set(x, (yBase || 0) + h / 2, z);
    mesh.userData.solid = true; ctx.group.add(mesh); ctx.solids.push(mesh);
    ctx.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: h, yBase: yBase || 0 });
    return mesh;
  }
  // 楼板：可站立平台 + 挡子弹实体（不作水平碰撞）
  function addSlab(ctx, minX, maxX, minZ, maxZ, topY, color) {
    var w = maxX - minX, d = maxZ - minZ, thk = 0.24;
    var mesh = T.mesh(new THREE.BoxGeometry(w, thk, d), color, { outline: 0.02, cast: false });
    mesh.position.set((minX + maxX) / 2, topY - thk / 2, (minZ + maxZ) / 2);
    mesh.userData.solid = true; ctx.group.add(mesh); ctx.solids.push(mesh);
    ctx.platforms.push({ minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, y: topY });
    return mesh;
  }
  // 楼梯斜坡：可行走斜面 + 倾斜视觉（axis:'z' 沿 z 上行）
  function addRamp(ctx, minX, maxX, minZ, maxZ, y0, y1, axis, dir, color) {
    ctx.platforms.push({ minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, ramp: true, y0: y0, y1: y1, axis: axis, dir: dir || 1 });
    var w = maxX - minX, d = maxZ - minZ, len = (axis === 'z' ? d : w), rise = y1 - y0;
    var geoLen = Math.hypot(len, rise);
    var mesh = T.mesh(new THREE.BoxGeometry(axis === 'z' ? w : geoLen, 0.2, axis === 'z' ? geoLen : d), color, { outline: 0.02, cast: false });
    var ang = Math.atan2(rise, len);
    if (axis === 'z') mesh.rotation.x = -ang * (dir === -1 ? -1 : 1); else mesh.rotation.z = ang * (dir === -1 ? -1 : 1);
    mesh.position.set((minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2);
    ctx.group.add(mesh);
    return mesh;
  }
  // 可进入两层建筑：一层带门室内 + 楼梯 + 二层楼板 + 带窗围栏(可跳下) + 封顶
  function addBuilding2F(ctx, cx, cz, th) {
    // 楼层要够高，室内才能站直/瞄准/跳跃作战（每层净高 ~4.6）
    var w = rand(11.5, 14.5), d = rand(11.5, 14.5), fh = 4.6, t = 0.3, gap = 3.0;
    var hw = w / 2, hd = d / 2, seg = (w - gap) / 2, segd = (d - gap) / 2;
    var bodyCol = pick([0x9aa0a8, 0xb0a58c, 0x8a8f98, 0xa39a86]);
    // 地面层四墙（前墙 -z 开门）
    addBoxY(ctx, cx - (gap / 2 + seg / 2), cz - hd, seg, fh, t, bodyCol, 0, { outline: 0.04 });
    addBoxY(ctx, cx + (gap / 2 + seg / 2), cz - hd, seg, fh, t, bodyCol, 0, { outline: 0.04 });
    addBoxY(ctx, cx, cz + hd, w, fh, t, bodyCol, 0, { outline: 0.04 });
    addBoxY(ctx, cx - hw, cz, t, fh, d, bodyCol, 0, { outline: 0.04 });
    addBoxY(ctx, cx + hw, cz, t, fh, d, bodyCol, 0, { outline: 0.04 });
    // 一层室内掩体
    addBoxY(ctx, cx + rand(-hw * 0.3, hw * 0.3), cz + rand(-hd * 0.2, hd * 0.3), 1.2, 1.0, 1.2, th.cover, 0, {});
    // 楼梯（沿 -x 墙向 +z 上行；楼层变高后加长踏面，坡度更缓便于跑动作战）
    var rX1 = cx - hw + 3.0, rZ0 = cz - hd + 0.6, rZ1 = cz - hd + 8.4;
    addRamp(ctx, cx - hw + 0.5, rX1, rZ0, rZ1, 0, fh, 'z', 1, 0x8a8f98);
    // 二层楼板（除楼梯井外全覆盖）
    addSlab(ctx, rX1, cx + hw, cz - hd, cz + hd, fh, bodyCol);
    addSlab(ctx, cx - hw, rX1, rZ1, cz + hd, fh, bodyCol);
    // 二层围栏（四面各留窗口，可跳下）
    var rh = 1.0, ac = th.accent;
    addBoxY(ctx, cx - (gap / 2 + seg / 2), cz - hd, seg, rh, t, ac, fh, { outline: 0.03 });
    addBoxY(ctx, cx + (gap / 2 + seg / 2), cz - hd, seg, rh, t, ac, fh, { outline: 0.03 });
    addBoxY(ctx, cx - (gap / 2 + seg / 2), cz + hd, seg, rh, t, ac, fh, { outline: 0.03 });
    addBoxY(ctx, cx + (gap / 2 + seg / 2), cz + hd, seg, rh, t, ac, fh, { outline: 0.03 });
    addBoxY(ctx, cx + hw, cz - (gap / 2 + segd / 2), t, rh, segd, ac, fh, { outline: 0.03 });
    addBoxY(ctx, cx + hw, cz + (gap / 2 + segd / 2), t, rh, segd, ac, fh, { outline: 0.03 });
    // 二层室内掩体
    addBoxY(ctx, cx + rand(hw * 0.1, hw * 0.4), cz + rand(-hd * 0.2, hd * 0.3), 1.0, 0.9, 1.0, th.cover, fh, {});
    // 封顶（挡子弹/成室内）
    addSlab(ctx, cx - hw, cx + hw, cz - hd, cz + hd, fh * 2, th.wood);
    // 门楣招牌（自发光）
    var sign = T.mesh(new THREE.BoxGeometry(gap, 0.5, 0.12), th.accent, { outline: false, emissive: th.accent, emissiveIntensity: 0.35, cast: false });
    sign.position.set(cx, fh - 0.3, cz - hd - 0.08); ctx.group.add(sign);
  }

  // ————————— 团队竞技场道具（集装箱 / 油桶 / 木箱 / 沙袋墙 / 卡车）—————————
  // 集装箱：顶面可站立(可攀顶伏击)，可堆叠；orient 0=长边沿X, 1=长边沿Z
  function addContainer(ctx, x, z, orient, col, stacked) {
    var L = 6.0, H = 2.55, W = 2.5;
    var sx = orient ? W : L, sz = orient ? L : W;
    function tier(yBase) {
      var m = T.mesh(new THREE.BoxGeometry(sx, H, sz), col, { outline: 0.05, tex: 'stone' });
      m.position.set(x, yBase + H / 2, z); m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
      ctx.colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, h: H, yBase: yBase });
      // 波纹脊（数条竖向凸条，增强质感）
      var ribs = orient ? 5 : 11, span = orient ? sz : sx;
      for (var r = 0; r < ribs; r++) {
        var t = (r / (ribs - 1) - 0.5) * span * 0.92;
        var rib = T.mesh(new THREE.BoxGeometry(orient ? sx + 0.06 : 0.12, H * 0.82, orient ? 0.12 : sz + 0.06), col, { outline: false, cast: false });
        rib.position.set(orient ? x : x + t, yBase + H / 2, orient ? z + t : z); ctx.group.add(rib);
      }
      // 端门（暗色面板 + 两根锁杆）
      var doorZ = orient ? z - sz / 2 - 0.04 : z, doorX = orient ? x : x + sx / 2 + 0.04;
      var door = T.mesh(new THREE.BoxGeometry(orient ? sx * 0.9 : 0.06, H * 0.82, orient ? 0.06 : sz * 0.9), 0x2b2f33, { outline: false, cast: false });
      door.position.set(doorX, yBase + H / 2, doorZ); ctx.group.add(door);
      return m;
    }
    tier(0);
    var top = H;
    if (stacked) { tier(H); top = H * 2; }
    ctx.platforms.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, y: top });
    return top;
  }

  // 单个木箱（可堆叠底高 yBase）
  function crate(ctx, x, z, yBase, s, th) {
    var m = T.mesh(new THREE.BoxGeometry(s, s, s), th.wood, { outline: 0.03, tex: 'wood' });
    m.position.set(x, yBase + s / 2, z); m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
    ctx.colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2, h: s, yBase: yBase });
  }
  // 木箱堆（2x2 底 + 顶一只）
  function addCrateStack(ctx, x, z, th) {
    var s = 1.1, o = s / 2;
    crate(ctx, x - o, z - o, 0, s, th); crate(ctx, x + o, z - o, 0, s, th);
    crate(ctx, x - o, z + o, 0, s, th); crate(ctx, x + o, z + o, 0, s, th);
    if (Math.random() < 0.75) crate(ctx, x + rand(-0.3, 0.3), z + rand(-0.3, 0.3), s, s, th);
    ctx.platforms.push({ minX: x - s, maxX: x + s, minZ: z - s, maxZ: z + s, y: s });
  }

  // 油桶群（红/蓝/黄，圆柱掩体）
  function addBarrels(ctx, x, z, n) {
    n = n || 3;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2, rr = n > 1 ? 0.72 : 0;
      var bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr, col = pick([0xC24A32, 0x3E6FB0, 0xD9A93B, 0x4E8B3A]);
      var m = T.mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 12), col, { outline: 0.03 });
      m.position.set(bx, 0.65, bz); m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
      ctx.colliders.push({ minX: bx - 0.5, maxX: bx + 0.5, minZ: bz - 0.5, maxZ: bz + 0.5, h: 1.3 });
      var rim = T.mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.14, 12), 0x24262a, { outline: false, cast: false }); rim.position.set(bx, 1.28, bz); ctx.group.add(rim);
      var band = T.mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 12), 0xf0f0f0, { outline: false, cast: false }); band.position.set(bx, 0.75, bz); ctx.group.add(band);
    }
  }

  // 沙袋矮墙（horiz=true 沿 X）
  function addSandbagWall(ctx, x, z, len, horiz) {
    var w = horiz ? len : 1.0, d = horiz ? 1.0 : len;
    var m = T.mesh(new THREE.BoxGeometry(w, 0.9, d), 0x9c8a5a, { outline: 0.035, tex: 'sand' });
    m.position.set(x, 0.45, z); m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
    ctx.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: 0.9 });
  }

  // 停放卡车（车厢顶可站立），alongZ=true 车头沿 Z
  function addTruck(ctx, x, z, alongZ, col) {
    var L = 5.4, H = 2.0, W = 2.4;
    var bw = alongZ ? W : L, bd = alongZ ? L : W;
    addBox(ctx, x, z, bw, H, bd, col || 0x4a5540, { outline: 0.05 });
    var cx = x + (alongZ ? 0 : -L * 0.5 - 0.4), cz = z + (alongZ ? -L * 0.5 - 0.4 : 0);
    addBox(ctx, cx, cz, alongZ ? W : 1.9, 1.7, alongZ ? 1.9 : W, 0x3a4433, { outline: 0.04 });
    // 车轮（装饰）
    var wp = [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [-bw / 2, bd / 2], [bw / 2, bd / 2]];
    for (var i = 0; i < 4; i++) { var wh = T.mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), 0x1c1e22, { outline: 0.02, cast: false }); wh.rotation.z = Math.PI / 2; wh.position.set(x + wp[i][0] * 0.86, 0.55, z + wp[i][1] * 0.86); ctx.group.add(wh); }
    ctx.platforms.push({ minX: x - bw / 2, maxX: x + bw / 2, minZ: z - bd / 2, maxZ: z + bd / 2, y: H });
  }

  // ————————— 团队竞技模式：紧凑对称竞技场（军事基地/集装箱堆场）—————————
  function generateArena() {
    T = D3.toon;
    var th = { name: '军事基地', ground: 0x8f948c, ground2: 0x7e837b, sky1: 0x8FB8DA, sky2: 0xCFE0EE, fog: 0xC6D4DE, fogD: 0.005, cover: 0x8C8C8C, wood: 0x9A7A4B, leaf: 0x4E9E3A, dirt: 0x8A5A2B, amb: 0.92, sun: 0xFFF7E4, accent: 0xF2A93B, decor: 'oak', weather: 'none', groundTex: 'concrete', exposure: 1.04 };
    var group = new THREE.Group();
    var HX = 22, HZ = 30, radius = 38;
    var ctx = { group: group, solids: [], colliders: [], platforms: [], radius: radius, theme: th, water: null };

    // 混凝土地面 + 标线
    var floor = T.mesh(new THREE.BoxGeometry(HX * 2 + 6, 0.2, HZ * 2 + 6), th.ground, { outline: false, cast: false });
    floor.position.y = -0.1; group.add(floor);
    addRoad(ctx, -HX, 0, HX, 0, 3.4);
    // 中央标记环（用两只圆盘叠出圆环，避免依赖 RingGeometry）
    var cOut = T.mesh(new THREE.CircleGeometry(5.1, 44), 0xd9c86a, { outline: false, cast: false }); cOut.rotation.x = -Math.PI / 2; cOut.position.y = 0.04; group.add(cOut);
    var cIn = T.mesh(new THREE.CircleGeometry(4.4, 44), th.ground, { outline: false, cast: false }); cIn.rotation.x = -Math.PI / 2; cIn.position.y = 0.05; group.add(cIn);

    // 外围封闭墙（分层实体，高 4）
    var wc = 0x707680, wt = 0.6, WX = HX + 1, WZ = HZ + 1;
    addBoxY(ctx, 0, -WZ, WX * 2, 4, wt, wc, 0, { outline: 0.04 });
    addBoxY(ctx, 0, WZ, WX * 2, 4, wt, wc, 0, { outline: 0.04 });
    addBoxY(ctx, -WX, 0, wt, 4, WZ * 2, wc, 0, { outline: 0.04 });
    addBoxY(ctx, WX, 0, wt, 4, WZ * 2, wc, 0, { outline: 0.04 });

    // 对称放置：s=+1 为 bravo 半场, s=-1 为 alpha 半场
    function mir(fn) { fn(1); fn(-1); }

    // 四角哨塔
    mir(function (s) { addWatchtower(ctx, -(HX - 3), s * (HZ - 4), th); addWatchtower(ctx, HX - 3, s * (HZ - 4), th); });

    // 中央争夺核心：可进入两层建筑
    addBuilding2F(ctx, 0, 0, th);
    // 中央侧翼：堆叠集装箱（狙击/架点位）
    addContainer(ctx, -14, 0, 1, 0xC24A32, true);
    addContainer(ctx, 14, 0, 1, 0x2f6ea0, true);
    addBarrels(ctx, -5.5, 2, 3); addBarrels(ctx, 5.5, -2, 3);

    // 半场特征（镜像对称，保证公平）
    mir(function (s) {
      // 可攀顶集装箱 + 上坡
      addContainer(ctx, -11, s * 10, 0, 0x3E7A46, false);
      var edge = s * 10 - s * 1.25, gnd = edge - s * 3.2;
      addRamp(ctx, -13.2, -8.8, Math.min(edge, gnd), Math.max(edge, gnd), 0, 2.55, 'z', s, 0x8a8f98);
      addContainer(ctx, 12, s * 9, 1, 0xB08A3A, false);
      // 木箱堆 / 油桶 / 沙袋 / 卡车
      addCrateStack(ctx, -6.5, s * 15, th);
      addCrateStack(ctx, 17.5, s * 6, th);
      addBarrels(ctx, -16, s * 20, 4);
      addBarrels(ctx, 8, s * 20, 3);
      addSandbagWall(ctx, -3, s * 20, 7, true);
      addSandbagWall(ctx, 3, s * 12, 5, false);
      addTruck(ctx, 15, s * 15, true, s > 0 ? 0x3a5a44 : 0x4a4a58);
      // 出生区掩体（基地沙袋环 + 侧翼集装箱）
      addSandbagRing(ctx, 0, s * (HZ - 4), 4.6, th);
      addContainer(ctx, -9, s * (HZ - 5), 0, 0x7a828c, false);
      addContainer(ctx, 9, s * (HZ - 5), 0, 0x7a828c, false);
    });

    // 探照灯（自发光地标 + 点光，夜港氛围）
    var beaconL = new THREE.PointLight(0xfff2c0, 0.7, 40); beaconL.position.set(0, 12, 0); group.add(beaconL);

    // 两队出生点（南北对置，各 6 点）
    var spawns = { alpha: [], bravo: [], charlie: [] };
    for (var p = 0; p < 6; p++) {
      var sx = -12 + (p % 3) * 12 + rand(-1.5, 1.5), rowZ = HZ - 3 - ((p / 3) | 0) * 2.2;
      spawns.alpha.push(new THREE.Vector3(sx, 0, -rowZ));
      spawns.bravo.push(new THREE.Vector3(sx, 0, rowZ));
      spawns.charlie.push(new THREE.Vector3(sx, 0, -rowZ)); // 占位(团队竞技仅两队)
    }
    return { group: group, solids: ctx.solids, colliders: ctx.colliders, platforms: ctx.platforms, spawns: spawns, center: new THREE.Vector3(0, 0, 0), radius: radius, theme: th, themeName: '军事基地·团队竞技', water: null };
  }

  // 海岛作战地图（和平精英风）：环海 + 沙滩 + 城市区 + 郊野/村庄 + 丘陵/湖泊 + 中心地标
  function generateIsland() {
    T = D3.toon;
    var th = THEMES.urban;
    var group = new THREE.Group();
    var radius = 82;
    var ctx = { group: group, solids: [], colliders: [], platforms: [], radius: radius, theme: th, water: null };

    // 海洋
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(radius * 4, radius * 4), waterMat(0x2f6ea0));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.25; sea.frustumCulled = false; group.add(sea); ctx.water = sea;
    // 沙滩 + 草地圆盘
    var beach = T.mesh(new THREE.CircleGeometry(radius + 8, 56), 0xE8D9A0, { outline: false, cast: false });
    beach.rotation.x = -Math.PI / 2; beach.position.y = -0.03; group.add(beach);
    var land = T.mesh(new THREE.CircleGeometry(radius, 56), th.ground, { outline: false, cast: false });
    land.rotation.x = -Math.PI / 2; land.position.y = 0; group.add(land);
    if (D3.tex) { var gt = D3.tex.getTiled(th.groundTex || 'grass', Math.floor(radius)); if (gt && land.material) land.material.map = gt; }

    // —— 城市区（西南角 3x3 街区）——
    var cityX = -36, cityZ = -36, cell = 18;
    for (var gx = -1; gx <= 1; gx++) for (var gz = -1; gz <= 1; gz++) {
      var bx = cityX + gx * cell, bz = cityZ + gz * cell;
      if (gx === 0 && gz === 0) { addSandbagRing(ctx, bx, bz, 5, th); continue; } // 中央广场
      var roll = Math.random();
      if (roll < 0.5) addBuilding2F(ctx, bx, bz, th);                             // 可进入两层楼(室内战斗)
      else if (roll < 0.65) addCompound(ctx, bx, bz, th);                         // 可进入建筑群
      else addTower(ctx, bx, bz, rand(7, 10), rand(7, 10), 3 + (Math.random() * 5 | 0), th); // 高楼掩体
    }
    for (var sroad = -1; sroad <= 1; sroad++) {
      addRoad(ctx, cityX + sroad * cell, cityZ - 1.7 * cell, cityX + sroad * cell, cityZ + 1.7 * cell, 6);
      addRoad(ctx, cityX - 1.7 * cell, cityZ + sroad * cell, cityX + 1.7 * cell, cityZ + sroad * cell, 6);
    }

    // —— 郊野村庄（散落小屋）——
    for (var v = 0; v < 5; v++) {
      var va = rand(0, Math.PI * 2), vd = rand(30, radius - 14), vx = Math.cos(va) * vd, vz = Math.sin(va) * vd;
      if (vx < -16 && vz < -16) continue; // 避开城市
      addBuilding(ctx, vx, vz, th);
    }
    // 树林 / 巨石（避开城市）
    for (var i = 0; i < 64; i++) {
      var a = rand(0, Math.PI * 2), dd = rand(10, radius - 5), x = Math.cos(a) * dd, z = Math.sin(a) * dd;
      if (x < -16 && z < -16) continue; if (Math.hypot(x, z) < 7) continue;
      if (Math.random() < 0.7) addTree(ctx, x, z, th); else addBoulder(ctx, x, z);
    }
    // 哨塔 + 丘陵背景
    for (var tw = 0; tw < 3; tw++) { var ta = rand(0, Math.PI * 2), td = rand(26, radius - 12); addWatchtower(ctx, Math.cos(ta) * td, Math.sin(ta) * td, th); }
    addHills(ctx, th);
    // 湖泊（东北）
    addLake(ctx, rand(14, 30), rand(14, 30), rand(8, 11), th);
    // 中心地标：灯塔
    addBox(ctx, 0, 0, 3, 15, 3, 0xbfc6cd, { outline: 0.05 });
    var beacon = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), T.glow(0xff5a5a)); beacon.position.set(0, 16, 0); group.add(beacon);
    var pl = new THREE.PointLight(0xff8a6a, 1.0, 45); pl.position.set(0, 16, 0); group.add(pl);

    // 三方海岸出生点（120° 分布）
    var spawns = { alpha: [], bravo: [], charlie: [] }, teams = ['alpha', 'bravo', 'charlie'], sr = radius - 9;
    for (var ti = 0; ti < 3; ti++) {
      var baseAng = -Math.PI / 2 + ti * (Math.PI * 2 / 3);
      for (var p = 0; p < 3; p++) { var ja = baseAng + rand(-0.14, 0.14), jr = sr - p * 1.8; spawns[teams[ti]].push(new THREE.Vector3(Math.cos(ja) * jr, 0, Math.sin(ja) * jr)); }
    }
    return { group: group, solids: ctx.solids, colliders: ctx.colliders, platforms: ctx.platforms, spawns: spawns, center: new THREE.Vector3(0, 0, 0), radius: radius, theme: th, themeName: '海岛', water: ctx.water };
  }

  // 带门洞的隔断墙（orient 'x'=沿X走 z=fixed；'z'=沿Z走 x=fixed），在 gapC 处留宽 gapW 的门
  function wallGap(ctx, orient, fixed, from, to, gapC, gapW, yBase, h, col) {
    var g0 = gapC - gapW / 2, g1 = gapC + gapW / 2, t = 0.4;
    if (g0 > from + 0.15) { var c1 = (from + g0) / 2, L1 = g0 - from; if (orient === 'x') addBoxY(ctx, c1, fixed, L1, h, t, col, yBase, { outline: 0.03 }); else addBoxY(ctx, fixed, c1, t, h, L1, col, yBase, { outline: 0.03 }); }
    if (g1 < to - 0.15) { var c2 = (g1 + to) / 2, L2 = to - g1; if (orient === 'x') addBoxY(ctx, c2, fixed, L2, h, t, col, yBase, { outline: 0.03 }); else addBoxY(ctx, fixed, c2, t, h, L2, col, yBase, { outline: 0.03 }); }
  }
  // 吊顶灯（暗色灯罩 + 柔和点光；避免自发光过曝触发泛光）
  function ceilingLamp(ctx, x, y, z) {
    var lamp = T.mesh(new THREE.BoxGeometry(1.4, 0.18, 1.4), 0x2a2e36, { outline: false, cast: false, emissive: 0xFFE6A8, emissiveIntensity: 0.35 });
    lamp.position.set(x, y, z); ctx.group.add(lamp);
    var pl = new THREE.PointLight(0xFFE6A8, 0.7, 22); pl.position.set(x, y - 0.4, z); ctx.group.add(pl);
  }
  // 立柱（圆柱结构柱，带底高碰撞；兼作掩体与建筑感）
  function pillar(ctx, x, z, yBase, h, r, col) {
    var m = T.mesh(new THREE.CylinderGeometry(r, r, h, 14), col, { outline: 0.03 });
    m.position.set(x, (yBase || 0) + h / 2, z); m.userData.solid = true; ctx.group.add(m); ctx.solids.push(m);
    ctx.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: h, yBase: yBase || 0 });
    return m;
  }
  // 墙面发光灯带（装饰，非碰撞）；axis 'x' 沿 X, 'z' 沿 Z
  function lightBand(ctx, x, y, z, len, axis, col) {
    var m = T.mesh(new THREE.BoxGeometry(axis === 'x' ? len : 0.12, 0.22, axis === 'x' ? 0.12 : len), 0x11151c, { outline: false, cast: false, emissive: col, emissiveIntensity: 0.6 });
    m.position.set(x, y, z); ctx.group.add(m); return m;
  }

  // 纯室内三层塔楼：封闭无户外，房间 + 夹层 + 楼梯；两队各据一端独立房间(开局互不可见)，需穿越楼层索敌 CQB
  function generateTower() {
    T = D3.toon;
    var th = { name: '室内塔楼', ground: 0x3f434b, ground2: 0x363a42, sky1: 0x0e1420, sky2: 0x1a2130, fog: 0x121722, fogD: 0.012, cover: 0x6b7079, wood: 0x7a6242, leaf: 0x4E9E3A, dirt: 0x2a2018, amb: 0.5, sun: 0xaeb8c6, sunI: 0.26, accent: 0xF2A93B, decor: 'oak', weather: 'none', groundTex: 'concrete', exposure: 0.72 };
    var group = new THREE.Group();
    var HX = 26, HZ = 26, fh = 5.8, wt = 0.5, radius = 40, top = fh * 3; // 层高提升到 5.8，更宽敞不压抑
    var ctx = { group: group, solids: [], colliders: [], platforms: [], radius: radius, theme: th, water: null };
    var body = 0x545a63, floorCol = 0x4a4e56, wallCol = 0x646a73, accent = th.accent, sx0 = -21;

    // 地面地板 + 封顶天花（封闭，无户外）
    var floor = T.mesh(new THREE.BoxGeometry(HX * 2, 0.2, HZ * 2), floorCol, { outline: false, cast: false });
    floor.position.y = -0.1; group.add(floor);
    if (D3.tex) { var gt = D3.tex.getTiled('concrete', 26); if (gt && floor.material) floor.material.map = gt; }
    // 中央地面标记环（美化 + 中场地标）
    var ring1 = T.mesh(new THREE.CircleGeometry(6.2, 40), accent, { outline: false, cast: false }); ring1.rotation.x = -Math.PI / 2; ring1.position.y = 0.03; group.add(ring1);
    var ring2 = T.mesh(new THREE.CircleGeometry(5.4, 40), floorCol, { outline: false, cast: false }); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.05; group.add(ring2);
    addSlab(ctx, -HX, HX, -HZ, HZ, top, 0x2f343c); // 屋顶封顶

    // 外墙（全高封闭四面）+ 逐层墙面发光灯带（美化 + 补光氛围）
    addBoxY(ctx, 0, -HZ, HX * 2, top, wt, body, 0, { outline: 0.05 });
    addBoxY(ctx, 0, HZ, HX * 2, top, wt, body, 0, { outline: 0.05 });
    addBoxY(ctx, -HX, 0, wt, top, HZ * 2, body, 0, { outline: 0.05 });
    addBoxY(ctx, HX, 0, wt, top, HZ * 2, body, 0, { outline: 0.05 });
    for (var bf = 0; bf < 3; bf++) {
      var by = bf * fh + fh * 0.68, bandCol = bf === 1 ? 0x39C0FF : accent;
      lightBand(ctx, 0, by, -HZ + 0.35, HX * 2 - 4, 'x', bandCol);
      lightBand(ctx, 0, by, HZ - 0.35, HX * 2 - 4, 'x', bandCol);
      lightBand(ctx, -HX + 0.35, by, 0, HZ * 2 - 4, 'z', bandCol);
      lightBand(ctx, HX + -0.35, by, 0, HZ * 2 - 4, 'z', bandCol);
    }

    // —— 楼梯（贴左墙，两跑直上，坡度随层高加长踏面，好跑动）——
    addRamp(ctx, -25, sx0, -14, -2, 0, fh, 'z', 1, 0x8a8f98);        // 一层 → 二层
    addRamp(ctx, -25, sx0, 0, 12, fh, fh * 2, 'z', 1, 0x8a8f98);     // 二层 → 三层
    // 二层楼板（留楼梯井 x[-26,sx0] z[-26,-2]）
    addSlab(ctx, sx0, HX, -HZ, HZ, fh, floorCol);
    addSlab(ctx, -HX, sx0, -2, HZ, fh, floorCol);
    // 三层楼板（留楼梯井 x[-26,sx0] z[0,12]）
    addSlab(ctx, sx0, HX, -HZ, HZ, fh * 2, floorCol);
    addSlab(ctx, -HX, sx0, 12, HZ, fh * 2, floorCol);
    addSlab(ctx, -HX, sx0, -HZ, 0, fh * 2, floorCol);
    // 楼梯井护栏（美化 + 防跌落提示）
    addBoxY(ctx, sx0, 0, 0.3, 1.0, HZ * 2, accent, fh, { outline: 0.03 });
    addBoxY(ctx, sx0, 6, 0.3, 1.0, HZ * 2 - 12, accent, fh * 2, { outline: 0.03 });

    // —— 夹层（俯瞰中庭的半层 loft：短坡上去 + 护栏；层高提升后净空充足）——
    var mezY = 2.9;
    addRamp(ctx, 15, 18, -15, -8, 0, mezY, 'z', 1, 0x8a8f98);        // 地面 → 夹层
    addSlab(ctx, 13, 25, -16, -4, mezY, 0x6f5f48);                   // 夹层楼板(俯瞰中庭)
    addBoxY(ctx, 13, -10, 0.35, 1.0, 12, accent, mezY, { outline: 0.03 });         // 内侧护栏
    addBoxY(ctx, 19, -4, 12, 1.0, 0.35, accent, mezY, { outline: 0.03 });          // 前侧护栏

    // —— 三层统一结构：两端独立出生房(错位开口) + 中央枢纽结构 + 立柱 + 丰富掩体 + 角落房间 ——
    for (var fl = 0; fl < 3; fl++) {
      var yb = fl * fh, ly = yb + fh - 0.5;
      // 出生房前墙：Alpha 开口偏左 x[-15,-5]，Bravo 开口偏右 x[5,15]（错位 → 开局不直视）
      addBoxY(ctx, -20.5, -16, 11, fh, wt, wallCol, yb, { outline: 0.04 }); // x[-26,-15]
      addBoxY(ctx, 10.5, -16, 31, fh, wt, wallCol, yb, { outline: 0.04 });  // x[-5,26]
      addBoxY(ctx, -10.5, 16, 31, fh, wt, wallCol, yb, { outline: 0.04 });  // x[-26,5]
      addBoxY(ctx, 20.5, 16, 11, fh, wt, wallCol, yb, { outline: 0.04 });   // x[15,26]

      // 中央枢纽：4 立柱撑起中庭 + 中央矮台(可站的微高地) + 台上发光核心 + 台周低掩体
      pillar(ctx, -6, -5, yb, fh, 0.7, 0x808690); pillar(ctx, 6, -5, yb, fh, 0.7, 0x808690);
      pillar(ctx, -6, 5, yb, fh, 0.7, 0x808690); pillar(ctx, 6, 5, yb, fh, 0.7, 0x808690);
      var daisBody = T.mesh(new THREE.BoxGeometry(7.6, 0.6, 5.6), 0x3a4048, { outline: 0.03, cast: false }); daisBody.position.set(0, yb + 0.3, 0); group.add(daisBody);
      addSlab(ctx, -3.8, 3.8, -2.8, 2.8, yb + 0.6, 0x424852);            // 中央矮台(可站上)
      var coreGlow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), T.glow(fl === 1 ? 0x39C0FF : (fl === 2 ? 0x7CFFB0 : accent))); coreGlow.position.set(0, yb + 1.5, 0); group.add(coreGlow);
      var corePL = new THREE.PointLight(fl === 1 ? 0x39C0FF : accent, 0.7, 18); corePL.position.set(0, yb + 1.6, 0); group.add(corePL);
      addBoxY(ctx, -2.6, -3.6, 1.2, 1.0, 0.7, wallCol, yb, {}); addBoxY(ctx, 2.6, 3.6, 1.2, 1.0, 0.7, wallCol, yb, {}); // 台前后矮掩体

      // 丰富中庭掩体（不同尺寸/材质：木箱堆 / 混凝土矮墙 / 油桶 / 矮台）
      addBoxY(ctx, -12, -8, 2.0, 1.5, 2.0, th.wood, yb, { tex: 'wood' });
      addBoxY(ctx, 12, 8, 2.0, 1.5, 2.0, th.wood, yb, { tex: 'wood' });
      addBoxY(ctx, 12, -9, 1.4, 1.2, 4.0, wallCol, yb, {});   // 横矮墙
      addBoxY(ctx, -12, 9, 1.4, 1.2, 4.0, wallCol, yb, {});
      pillar(ctx, -13, 0, yb, 1.3, 0.5, 0xC24A32); pillar(ctx, -12, 1, yb, 1.3, 0.5, 0x3E6FB0); // 油桶
      pillar(ctx, 13, 0, yb, 1.3, 0.5, 0xD9A93B); pillar(ctx, 12, -1, yb, 1.3, 0.5, 0x4E8B3A);
      addBoxY(ctx, -18, -6, 1.3, 1.1, 2.6, th.cover, yb, {}); addBoxY(ctx, 18, 6, 1.3, 1.1, 2.6, th.cover, yb, {});

      // 角落小房间（丰富室内空间：贴外墙 3 面墙 + 朝中庭门；不阻断南北主轴，供搜索/侧翼/伏击）
      // 东北角房(x 正, z 负)：门朝 -x
      addBoxY(ctx, 20.5, -8.5, 11, fh, wt, wallCol, yb, { outline: 0.03 });   // 北墙 z=-8.5
      addBoxY(ctx, 15, -4.5, wt, fh, 8.5, wallCol, yb, { outline: 0.03 });    // 西墙(带门口在南段) x=15 z[-8.5,-0.25]
      addBoxY(ctx, 12, -3, 2.0, 1.3, 2.0, th.wood, yb, { tex: 'wood' });      // 房内掩体
      // 西南角房(x 负, z 正)：门朝 +x
      addBoxY(ctx, -20.5, 8.5, 11, fh, wt, wallCol, yb, { outline: 0.03 });
      addBoxY(ctx, -15, 4.5, wt, fh, 8.5, wallCol, yb, { outline: 0.03 });
      addBoxY(ctx, -12, 3, 2.0, 1.3, 2.0, th.wood, yb, { tex: 'wood' });

      // 吊灯（每层 4 盏）
      ceilingLamp(ctx, -13, ly, -13); ceilingLamp(ctx, 13, ly, 13); ceilingLamp(ctx, -13, ly, 13); ceilingLamp(ctx, 13, ly, -13);
    }

    // —— 出生点：分布三层，各层据一端房间(靠各自开口)，开局不直视，出房穿越中庭索敌；玩家在一层 ——
    var spawns = { alpha: [], bravo: [], charlie: [] }, perFloor = [4, 3, 3];
    for (var flr = 0; flr < 3; flr++) {
      var fy = flr * fh, nn = perFloor[flr];
      for (var q = 0; q < nn; q++) {
        var qz = (q % 2) * 2.6;
        spawns.alpha.push(new THREE.Vector3(-14 + q * 3, fy, -23 + qz)); // 靠左开口
        spawns.bravo.push(new THREE.Vector3(14 - q * 3, fy, 23 - qz));   // 靠右开口
      }
    }
    return { group: group, solids: ctx.solids, colliders: ctx.colliders, platforms: ctx.platforms, spawns: spawns, center: new THREE.Vector3(0, 0, 0), radius: radius, theme: th, themeName: '室内三层塔楼', water: null };
  }

  function generate(forceTheme) {
    T = D3.toon;
    var th = THEMES[forceTheme] || THEMES[pick(THEME_KEYS)];
    var group = new THREE.Group();
    var radius = 52;
    var ctx = { group: group, solids: [], colliders: [], platforms: [], radius: radius, theme: th, water: null };

    // 地面（棋盘双色，卡通）
    var groundGeo = new THREE.PlaneGeometry(radius*2+8, radius*2+8, 1, 1);
    var groundMat = T.mat(th.ground, { steps: 3, cast:false });
    groundMat.side = THREE.DoubleSide;
    if (D3.tex) { var gt = D3.tex.getTiled(th.groundTex || 'grass', Math.floor(radius)); if (gt) groundMat.map = gt; }
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; ground.castShadow = false;
    group.add(ground);
    // 地面网格纹理（第二色细分块）
    var tiles = 12, ts = (radius*2)/tiles;
    var tileMat = T.mat(th.ground2,{steps:3,cast:false});
    if (D3.tex) { var t2 = D3.tex.getTiled(th.groundTex || 'grass', 4); if (t2) tileMat.map = t2; }
    for (var ix=0; ix<tiles; ix++) for (var iz=0; iz<tiles; iz++) {
      if ((ix+iz)%2) continue;
      var tm = new THREE.Mesh(new THREE.PlaneGeometry(ts*0.98, ts*0.98), tileMat);
      tm.rotation.x = -Math.PI/2; tm.position.set(-radius+ts/2+ix*ts, 0.01, -radius+ts/2+iz*ts); tm.receiveShadow=true;
      group.add(tm);
    }

    // 外围墙
    var wallH = 3.2, R = radius+3;
    var sides = [[0,-R, R*2,wallH,1.2],[0,R, R*2,wallH,1.2],[-R,0, 1.2,wallH,R*2],[R,0, 1.2,wallH,R*2]];
    for (var s=0;s<sides.length;s++){ var w=sides[s]; addBox(ctx, w[0],w[1], w[2],w[3],w[4], th.cover, {outline:0.05}); }

    // 中心争夺点（方块信标台）
    var core = T.mesh(new THREE.BoxGeometry(5,0.5,5), th.accent, {outline:0.04, emissive: th.accent, emissiveIntensity:0.15});
    core.position.set(0,0.25,0); group.add(core);
    addBox(ctx, 0,0, 1.4,2.4,1.4, th.cover, {outline:0.04});

    // 随机建筑 + 掩体（数量随机，保证每局不同；地图更大所以更多）
    var nBuild = 5 + (Math.random()*4|0);
    for (var b=0;b<nBuild;b++){ var ba=rand(0,Math.PI*2), bd=rand(12,radius-12); addBuilding(ctx, Math.cos(ba)*bd, Math.sin(ba)*bd, th); }
    // 一栋可进入两层楼（室内战斗）
    var b2a = rand(0,Math.PI*2), b2d = rand(14, radius-16); addBuilding2F(ctx, Math.cos(b2a)*b2d, Math.sin(b2a)*b2d, th);
    var nCover = 22 + (Math.random()*14|0);
    for (var c=0;c<nCover;c++){
      var a=rand(0,Math.PI*2), d=rand(6,radius-6), x=Math.cos(a)*d, z=Math.sin(a)*d;
      if (Math.hypot(x,z)<5) continue;
      var t = Math.random();
      if (t<0.35) addBox(ctx, x,z, rand(1.4,3.2), rand(0.9,1.5), rand(0.9,1.6), pick([th.cover, th.wood]), {ry:0,outline:0.03}); // 矮墙/圆石
      else if (t<0.62) addBox(ctx, x,z, rand(1.2,2.2), rand(1.2,2.2), rand(1.2,2.2), pick([th.wood,0x8a8a8a,th.cover]), {ry:0}); // 木箱/石块
      else if (t<0.82) addBox(ctx, x,z, 1.0, rand(1.0,2.0), 1.0, pick([th.wood, 0x8a8a8a]), {ry:0, outline:0.03}); // 方柱
      else addStack(ctx, x, z, th); // 方块堆
    }
    // 哨塔（高结构，制造远近视野层次）
    var nTower = 2 + (Math.random()*2|0);
    for (var tw=0; tw<nTower; tw++){ var ta=rand(0,Math.PI*2), tdd=rand(16,radius-10); addWatchtower(ctx, Math.cos(ta)*tdd, Math.sin(ta)*tdd, th); }
    // 中心沙袋环
    addSandbagRing(ctx, 0, 0, 5.5, th);

    // 室内建筑群（1-2 处 CQB 空间）
    var nComp = 1 + (Math.random()*2|0);
    for (var cp=0; cp<nComp; cp++){ var ca=rand(0,Math.PI*2), cd=rand(14,radius-14); addCompound(ctx, Math.cos(ca)*cd, Math.sin(ca)*cd, th); }

    // 湖泊（丛林/都市/夜港有水）
    if (th === THEMES.jungle || th === THEMES.urban || th === THEMES.night) {
      var la = rand(0,Math.PI*2), ld = rand(radius*0.4, radius*0.62);
      addLake(ctx, Math.cos(la)*ld, Math.sin(la)*ld, rand(6,9), th);
    }

    // 外围丘陵背景
    addHills(ctx, th);

    decorate(ctx, th);

    // 三方出生点：等边三角形三个角，各给一小簇
    var spawns = { alpha:[], bravo:[], charlie:[] };
    var teams = ['alpha','bravo','charlie'];
    var sr = radius - 4;
    for (var ti=0; ti<3; ti++){
      var baseAng = -Math.PI/2 + ti*(Math.PI*2/3);
      for (var p=0;p<3;p++){
        var jitterA = baseAng + rand(-0.18,0.18);
        var jitterR = sr - p*1.6;
        spawns[teams[ti]].push(new THREE.Vector3(Math.cos(jitterA)*jitterR, 0, Math.sin(jitterA)*jitterR));
      }
    }

    return { group: group, solids: ctx.solids, colliders: ctx.colliders, platforms: ctx.platforms, spawns: spawns, center: new THREE.Vector3(0,0,0), radius: radius, theme: th, themeName: th.name, water: ctx.water };
  }

  D3.MapGen = { generate: generate, generateIsland: generateIsland, generateArena: generateArena, generateTower: generateTower, THEMES: THEMES };
})(window.D3 = window.D3 || {});
