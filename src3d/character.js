/* Minecraft 风格方块小人 —— Steve 式体素角色
 * 立方头(带脸) + 方块躯干/四肢 + 队伍色衬衫，走路摆臂摆腿，右手持方块枪。
 * 保持 api：root, update, headHitbox, bodyHitbox, getMuzzle, flashMuzzle, startDeath, setDead, setColor
 */
(function (D3) {
  'use strict';

  function part(geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }

  function build(teamColor, opts) {
    opts = opts || {};
    var T = D3.toon;
    var skin = 0xC98E5A, hair = 0x2A1B0E, pants = 0x39406B, shoe = 0x2b2b33;
    var accent = teamColor;

    var root = new THREE.Group();
    var body = new THREE.Group(); root.add(body);

    var matSkin = T.mat(skin, { steps: 4 });
    var matShirt = T.mat(accent, { steps: 4 });   // 队伍色衬衫
    var matPants = T.mat(pants, { steps: 4 });
    var matHair = T.mat(hair, { steps: 3 });
    var matShoe = T.mat(shoe, { steps: 3 });
    var matDark = T.mat(0x24242c, { steps: 3 });
    var glowMat = T.glow(accent);
    var OL = 0.012;

    // 尺寸（Minecraft 比例，1.85 高）
    // 腿 0-0.7 | 躯干 0.7-1.4 | 头 1.4-1.86
    // —— 腿（可摆动）——
    var legL = part(new THREE.BoxGeometry(0.23, 0.7, 0.23), matPants, -0.115, 0.35, 0);
    var legR = part(new THREE.BoxGeometry(0.23, 0.7, 0.23), matPants, 0.115, 0.35, 0);
    T.addOutline(legL, OL); T.addOutline(legR, OL);
    // 鞋
    legL.add(part(new THREE.BoxGeometry(0.25, 0.14, 0.27), matShoe, 0, -0.35, 0.02));
    legR.add(part(new THREE.BoxGeometry(0.25, 0.14, 0.27), matShoe, 0, -0.35, 0.02));
    body.add(legL); body.add(legR);

    // —— 躯干（队伍色衬衫）——
    var torso = part(new THREE.BoxGeometry(0.46, 0.7, 0.24), matShirt, 0, 1.05, 0);
    T.addOutline(torso, OL); body.add(torso);
    // 腰带 + 胸口徽记
    body.add(part(new THREE.BoxGeometry(0.48, 0.1, 0.26), matDark, 0, 0.74, 0));
    var emblem = part(new THREE.BoxGeometry(0.14, 0.16, 0.02), glowMat, 0, 1.12, 0.13); body.add(emblem);

    // —— 头（立方 + 脸）——
    var head = part(new THREE.BoxGeometry(0.46, 0.46, 0.46), matSkin, 0, 1.63, 0);
    T.addOutline(head, OL); body.add(head);
    // 头发（顶 + 后 + 侧）
    body.add(part(new THREE.BoxGeometry(0.48, 0.12, 0.48), matHair, 0, 1.83, 0));
    body.add(part(new THREE.BoxGeometry(0.48, 0.28, 0.1), matHair, 0, 1.7, -0.2));
    // 眼睛（白底 + 蓝瞳，Minecraft 脸）
    var eyeWhiteL = part(new THREE.BoxGeometry(0.09, 0.09, 0.02), T.mat(0xffffff,{steps:2,cast:false,outline:false}), -0.11, 1.65, 0.235);
    var eyeWhiteR = part(new THREE.BoxGeometry(0.09, 0.09, 0.02), T.mat(0xffffff,{steps:2,cast:false,outline:false}), 0.03, 1.65, 0.235);
    var pupilL = part(new THREE.BoxGeometry(0.045, 0.09, 0.02), T.mat(0x5a3fb0,{steps:2,cast:false,outline:false}), -0.075, 1.65, 0.245);
    var pupilR = part(new THREE.BoxGeometry(0.045, 0.09, 0.02), T.mat(0x5a3fb0,{steps:2,cast:false,outline:false}), 0.065, 1.65, 0.245);
    body.add(eyeWhiteL); body.add(eyeWhiteR); body.add(pupilL); body.add(pupilR);
    // 鼻/嘴暗块
    body.add(part(new THREE.BoxGeometry(0.16, 0.03, 0.02), T.mat(0x8a5a38,{steps:2,cast:false,outline:false}), -0.02, 1.55, 0.235));

    // —— 手臂 ——（左臂摆动，右臂持枪前伸）
    var armL = part(new THREE.BoxGeometry(0.19, 0.66, 0.2), matShirt, -0.33, 1.05, 0);
    T.addOutline(armL, OL);
    armL.add(part(new THREE.BoxGeometry(0.2, 0.16, 0.21), matSkin, 0, -0.36, 0)); // 手
    body.add(armL);
    var armR = new THREE.Group(); armR.position.set(0.33, 1.28, 0.05);
    var armRmesh = part(new THREE.BoxGeometry(0.19, 0.62, 0.2), matShirt, 0, -0.22, 0.12);
    armRmesh.rotation.x = -1.15; T.addOutline(armRmesh, OL);
    armRmesh.add(part(new THREE.BoxGeometry(0.2, 0.16, 0.21), matSkin, 0, -0.34, 0));
    armR.add(armRmesh); body.add(armR);

    // —— 方块枪 ——
    var gun = new THREE.Group();
    gun.add(part(new THREE.BoxGeometry(0.13, 0.15, 0.66), matDark, 0, 0, 0.16));
    gun.add(part(new THREE.BoxGeometry(0.08, 0.08, 0.34), T.mat(0x555,{steps:3,cast:false,outline:false}), 0, 0.015, 0.5)); // 枪管
    gun.add(part(new THREE.BoxGeometry(0.09, 0.24, 0.11), matDark, 0, -0.16, 0.16)); // 弹匣
    gun.add(part(new THREE.BoxGeometry(0.05, 0.07, 0.1), glowMat, 0, 0.11, 0.05));   // 瞄具(队伍色)
    gun.position.set(0, -0.46, 0.14); armR.add(gun);
    var muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, 0.72); gun.add(muzzle);
    var flash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), T.glow(0xFFEE99)); flash.position.copy(muzzle.position); flash.visible = false; gun.add(flash);
    var flashLight = new THREE.PointLight(0xffdd88, 0, 6); flashLight.position.copy(muzzle.position); gun.add(flashLight);

    // —— 隐形碰撞体 ——
    var headHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial()); headHitbox.position.set(0, 1.63, 0); headHitbox.visible = false; root.add(headHitbox);
    var bodyHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.45, 0.4), new THREE.MeshBasicMaterial()); bodyHitbox.position.set(0, 0.9, 0); bodyHitbox.visible = false; root.add(bodyHitbox);

    var walkPhase = 0, flashT = 0, dying = false, deathT = 0, fallDir = 1;
    var api = {
      root: root, body: body, headHitbox: headHitbox, bodyHitbox: bodyHitbox, _muzzle: muzzle, _armR: armR,
      setColor: function (c) { matShirt.color.set(c); glowMat.color.set(c); },
      getMuzzle: function (out) { muzzle.getWorldPosition(out); return out; },
      flashMuzzle: function () { flash.visible = true; flashLight.intensity = 2.5; flashT = 0.05; },
      startDeath: function () { dying = true; deathT = 0; fallDir = Math.random() < 0.5 ? 1 : -1; },
      setDead: function (dead) { body.visible = !dead; if (!dead) { dying = false; deathT = 0; body.rotation.set(0, 0, 0); body.position.y = 0; } },
      update: function (dt, speed, aiming) {
        if (dying) {
          deathT += dt; var t = Math.min(1, deathT / 0.6), ease = t * t * (3 - 2 * t);
          body.rotation.z = fallDir * ease * (Math.PI / 2); body.position.y = -ease * 0.1;
          if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }
          return;
        }
        var sp = Math.min(1, speed / 6);
        walkPhase += dt * (7 + sp * 8);
        var swing = Math.sin(walkPhase) * sp * 0.7;   // Minecraft 直腿摆动
        legL.rotation.x = swing; legR.rotation.x = -swing;
        armL.rotation.x = -swing;                      // 手臂与腿反向
        var bob = Math.abs(Math.sin(walkPhase)) * sp * 0.03;
        body.position.y = bob;
        armR.rotation.x = aiming ? -0.02 : 0.02 + swing * 0.15;
        if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; flashLight.intensity = Math.max(0, flashLight.intensity - dt * 40); }
        else if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 40);
      }
    };
    return api;
  }

  D3.buildCharacter = build;
})(window.D3 = window.D3 || {});
