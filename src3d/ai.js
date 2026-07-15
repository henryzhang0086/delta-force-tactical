/* 三方乱斗 AI —— 主动进攻型
 * 核心原则：永远在推进/索敌，不站桩。有目标就压上去打，没目标就主动去猎杀。
 * 具备：视线(含烟雾)遮挡、防卡死绕行、残血短撤、闪光致盲、丢雷。
 */
(function (D3) {
  'use strict';

  var EYE = new THREE.Vector3(0, 1.5, 0);
  var ZERO = new THREE.Vector3(0, 0, 0);
  var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();

  function initAI(f, diff) {
    f.ai = {
      target: null, lastSeen: null, reactTimer: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeTimer: 0,
      skill: diff || 0.5, wanderAng: Math.random() * Math.PI * 2,
      stuckT: 0, lastX: 0, lastZ: 0, detourT: 0, detourDir: 1,
      flashedT: 0, roamTarget: null, aggression: 0.7 + Math.random() * 0.5
    };
  }

  function eyePos(f, out) { out.copy(f.pos).add(EYE); return out; }

  // 视线：被掩体或烟雾遮挡则不可见
  function hasLOS(from, to, world) {
    _dir.subVectors(to, from);
    var dist = _dir.length(); _dir.normalize();
    world.raycaster.set(from, _dir);
    world.raycaster.far = dist - 0.4;
    if (world.raycaster.intersectObjects(world.solids, false).length) return false;
    // 烟雾遮挡（线段到烟雾中心的水平最近距离）
    var smokes = world.smokes;
    if (smokes && smokes.length) {
      for (var i = 0; i < smokes.length; i++) {
        var s = smokes[i]; if (s.radius < 1) continue;
        if (_segDistXZ(from, to, s.pos) < s.radius) return false;
      }
    }
    return true;
  }

  function _segDistXZ(a, b, p) {
    var ax = a.x, az = a.z, bx = b.x, bz = b.z, px = p.x, pz = p.z;
    var dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    var t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + dx * t, cz = az + dz * t;
    return Math.hypot(px - cx, pz - cz);
  }

  function _consider(f, o, world, view, ref) {
    if (!o.alive || o.team === f.team || o.inVehicle) return;
    var d = f.pos.distanceTo(o.pos);
    if (d > view) return;
    _b.copy(o.pos); _b.y = f.pos.y + 1.0;
    if (!hasLOS(_a, _b, world)) return;
    if (d < ref.bestD) { ref.bestD = d; ref.best = o; }
  }

  function acquire(f, world) {
    var ref = { best: null, bestD: Infinity };
    eyePos(f, _a);
    var view = DF.CONFIG.ai.viewDistance / 12; // 换算到 3D 单位（约 52）
    for (var i = 0; i < world.fighters.length; i++) _consider(f, world.fighters[i], world, view, ref);
    if (world.monsters) for (var m = 0; m < world.monsters.length; m++) _consider(f, world.monsters[m], world, view, ref);
    // 起床之战：敌方床铺也是攻击目标（活人优先，故仅在无活人目标时索敌床铺）
    if (world.beds && !ref.best) for (var bd = 0; bd < world.beds.length; bd++) _consider(f, world.beds[bd], world, view, ref);
    // 敌方乘员的坦克也是攻击目标
    if (world.vehicles) for (var vv = 0; vv < world.vehicles.length; vv++) {
      var vh = world.vehicles[vv];
      if (!vh.alive || !vh.occupant || vh.occupant.team === f.team) continue;
      var vd = f.pos.distanceTo(vh.pos); if (vd > view) continue;
      _b.copy(vh.pos); _b.y = f.pos.y + 1.2;
      if (hasLOS(_a, _b, world) && vd < ref.bestD) { ref.bestD = vd; ref.best = vh; }
    }
    return ref.best;
  }

  // 最近的敌人（无视线也算，用于主动猎杀方向）
  function nearestEnemy(f, world) {
    var near = null, nd = Infinity, o, d, i;
    for (i = 0; i < world.fighters.length; i++) { o = world.fighters[i]; if (!o.alive || o.team === f.team) continue; d = f.pos.distanceTo(o.pos); if (d < nd) { nd = d; near = o; } }
    if (world.monsters) for (i = 0; i < world.monsters.length; i++) { o = world.monsters[i]; if (!o.alive) continue; d = f.pos.distanceTo(o.pos); if (d < nd) { nd = d; near = o; } }
    if (world.beds) for (i = 0; i < world.beds.length; i++) { o = world.beds[i]; if (!o.alive || o.team === f.team) continue; d = f.pos.distanceTo(o.pos); if (d < nd) { nd = d; near = o; } }
    if (world.vehicles) for (i = 0; i < world.vehicles.length; i++) { o = world.vehicles[i]; if (!o.alive || !o.occupant || o.occupant.team === f.team) continue; d = f.pos.distanceTo(o.pos); if (d < nd) { nd = d; near = o; } }
    return near;
  }

  function think(f, world, dt) {
    if (!f.alive) return;
    var ai = f.ai;
    ai.reactTimer -= dt; ai.strafeTimer -= dt; if (ai.detourT > 0) ai.detourT -= dt;
    var walk = DF.CONFIG.agent.walkSpeed / 24; // 约 6 单位/s

    // 闪光致盲：踉跄乱走、不开火
    if (ai.flashedT > 0) {
      ai.flashedT -= dt;
      ai.wanderAng += (Math.random() * 2 - 1) * dt * 4;
      var mv = f.moveBy(Math.sin(ai.wanderAng) * walk * 0.4 * dt, Math.cos(ai.wanderAng) * walk * 0.4 * dt, world, dt);
      f._moveSpeed = mv / dt;
      return;
    }

    if (f.ammo <= 0 && f.reserve > 0) f.startReload();

    // 索敌（限频）
    if (ai.reactTimer <= 0) {
      var t = acquire(f, world);
      if (t) { ai.target = t; ai.lastSeen = t.pos.clone(); }
      else if (ai.target) { eyePos(f, _a); _b.copy(ai.target.pos); _b.y = f.pos.y + 1; if (!hasLOS(_a, _b, world)) ai.target = null; }
      ai.reactTimer = 0.14 + Math.random() * 0.14;
    }
    var tgt = ai.target;
    if (tgt && !tgt.alive) { ai.target = null; tgt = null; }

    var moveX = 0, moveZ = 0, wantMove = true;

    if (tgt) {
      // —— 交火：压上去打 ——
      var tx = tgt.pos.x - f.pos.x, tz = tgt.pos.z - f.pos.z, dist = Math.hypot(tx, tz);
      f.yaw = Math.atan2(tx, tz);
      // 开火
      eyePos(f, _a);
      _b.copy(tgt.pos); _b.y = f.pos.y + 1.0 + (Math.random() < 0.22 ? 0.7 : 0);
      _dir.subVectors(_b, _a).normalize();
      var err = DF.CONFIG.ai.aimError * (1.2 - ai.skill) * (0.5 + dist / 45);
      _dir.x += (Math.random() * 2 - 1) * err; _dir.y += (Math.random() * 2 - 1) * err * 0.5; _dir.z += (Math.random() * 2 - 1) * err; _dir.normalize();
      if (f.canFire() && hasLOS(_a, _b, world)) f.fire(_a, _dir, world);
      // 丢雷
      if (f.nades.frag > 0 && f.nadeCooldown <= 0 && dist > 8 && dist < 26 && Math.random() < dt * 0.2) f.throwGrenade(world, null, 'frag');
      if (f.ammo <= f.weapon.mag * 0.2 && !f.reloading) f.startReload();

      // 交战距离：明显更近、更激进
      var ideal = f.weapon.category === 'sniper' ? 16 : (f.weapon.category === 'shotgun' ? 4 : 9);
      var lowHp = f.health < 24;
      var toward = lowHp ? -1 : (dist > ideal ? 1 : (dist < ideal - 3 ? -0.6 : 0.3)); // 永远略微贴近
      moveX += (tx / (dist || 1)) * toward * ai.aggression;
      moveZ += (tz / (dist || 1)) * toward * ai.aggression;
      // 侧向走位
      if (ai.strafeTimer <= 0) { ai.strafe *= -1; ai.strafeTimer = 0.6 + Math.random() * 1.0; }
      moveX += (-tz / (dist || 1)) * ai.strafe * 0.6;
      moveZ += (tx / (dist || 1)) * ai.strafe * 0.6;
    } else {
      // —— 无目标：主动猎杀，绝不站桩 ——
      var goal = ai.lastSeen;
      if (!goal || (ai.lastSeen && f.pos.distanceTo(ai.lastSeen) < 3)) {
        var near = nearestEnemy(f, world);
        goal = near ? near.pos : ZERO;
        ai.lastSeen = null;
      }
      if (goal) {
        var gx = goal.x - f.pos.x, gz = goal.z - f.pos.z, gl = Math.hypot(gx, gz) || 1;
        moveX = gx / gl; moveZ = gz / gl; f.yaw = Math.atan2(gx, gz);
      } else {
        ai.wanderAng += (Math.random() * 2 - 1) * dt; moveX = Math.sin(ai.wanderAng); moveZ = Math.cos(ai.wanderAng); f.yaw = Math.atan2(moveX, moveZ);
      }
    }

    // 防卡死：一段时间几乎没位移 → 侧向绕行
    ai.stuckT += dt;
    if (ai.stuckT > 0.4) {
      var movedRecent = Math.hypot(f.pos.x - ai.lastX, f.pos.z - ai.lastZ);
      if (wantMove && movedRecent < 0.12) { ai.detourT = 0.7; ai.detourDir = Math.random() < 0.5 ? 1 : -1; }
      ai.lastX = f.pos.x; ai.lastZ = f.pos.z; ai.stuckT = 0;
    }
    if (ai.detourT > 0) { // 沿当前朝向的垂直方向绕
      var pxn = Math.cos(f.yaw) * ai.detourDir, pzn = -Math.sin(f.yaw) * ai.detourDir;
      moveX += pxn * 1.4; moveZ += pzn * 1.4;
    }

    var len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      moveX /= len; moveZ /= len;
      var moved = f.moveBy(moveX * walk * dt, moveZ * walk * dt, world, dt);
      f._moveSpeed = moved / dt;
    }
  }

  D3.AI = { init: initAI, think: think };
})(window.D3 = window.D3 || {});
