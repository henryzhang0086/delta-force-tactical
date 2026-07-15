/* 卡通渲染工具 —— 高清卡通(cel-shading)风格
 * - 分段渐变的 MeshToonMaterial（硬边光照，卡通质感）
 * - 反向外壳描边（inverted-hull outline）
 * - 天空渐变、雾、色调
 * 依赖全局 THREE（src3d/vendor/three.min.js）
 */
(function (D3) {
  'use strict';

  // 生成 N 段硬阶渐变贴图，供 MeshToonMaterial 的 gradientMap 使用
  var _gradCache = {};
  function gradientMap(steps) {
    steps = steps || 4;
    if (_gradCache[steps]) return _gradCache[steps];
    var data = new Uint8Array(steps);
    for (var i = 0; i < steps; i++) {
      // 非线性抬升暗部，让卡通阴影更通透
      var t = i / (steps - 1);
      data[i] = Math.round(Math.pow(t, 0.85) * 255);
    }
    var tex = new THREE.DataTexture(data, steps, 1, THREE.LuminanceFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    _gradCache[steps] = tex;
    return tex;
  }

  // 卡通材质
  function toon(color, opts) {
    opts = opts || {};
    var m = new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: gradientMap(opts.steps || 4)
    });
    // 像素材质（灰度相乘，出 Minecraft 方块质感）
    if (opts.tex && D3.tex) { var t = D3.tex.get(opts.tex); if (t) m.map = t; }
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity || 1; }
    if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity != null ? opts.opacity : 1; }
    return m;
  }

  // 亮色自发光材质（用于霓虹/枪口/UI 立体元素）
  function glow(color) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  }

  // 给一个 mesh 追加反向外壳描边，返回描边 mesh（需加到同一父级、同步变换）
  var _outlineMat = null;
  function outlineMaterial(colorHex, thickness) {
    // 用顶点沿法线外扩的方式生成描边（对任意几何都稳定）
    return new THREE.ShaderMaterial({
      uniforms: { uThickness: { value: thickness || 0.03 }, uColor: { value: new THREE.Color(colorHex != null ? colorHex : 0x11131f) } },
      vertexShader: [
        'uniform float uThickness;',
        'void main(){',
        '  vec3 p = position + normal * uThickness;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'void main(){ gl_FragColor = vec4(uColor,1.0); }'
      ].join('\n'),
      side: THREE.BackSide
    });
  }

  // 为 mesh 生成描边子对象（同几何、BackSide 外扩），并作为其子节点
  function addOutline(mesh, thickness, colorHex) {
    var o = new THREE.Mesh(mesh.geometry, outlineMaterial(colorHex, thickness));
    o.frustumCulled = false;
    o.userData.isOutline = true;
    mesh.add(o);
    return o;
  }

  // 便捷：创建带描边的实体 mesh
  function toonMesh(geometry, color, opts) {
    opts = opts || {};
    var mesh = new THREE.Mesh(geometry, toon(color, opts));
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    if (opts.outline !== false) addOutline(mesh, opts.outline || 0.03, opts.outlineColor);
    return mesh;
  }

  // 天空：竖直渐变穹顶
  function skyDome(topHex, botHex, radius) {
    var geo = new THREE.SphereGeometry(radius || 400, 24, 16);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color(topHex) }, bot: { value: new THREE.Color(botHex) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vP; uniform vec3 top; uniform vec3 bot;',
        'void main(){ float h = clamp((normalize(vP).y*0.5+0.5),0.0,1.0); vec3 c = mix(bot, top, pow(h,0.7)); gl_FragColor=vec4(c,1.0); }'
      ].join('\n')
    });
    var m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  D3.toon = { gradientMap: gradientMap, mat: toon, glow: glow, addOutline: addOutline, mesh: toonMesh, skyDome: skyDome, outlineMaterial: outlineMaterial };
})(window.D3 = window.D3 || {});
