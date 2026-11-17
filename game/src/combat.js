// combat.js — pistol shooting with raycast hits, melee punches, enemy gangsters,
// muzzle flash, tracers, hit sparks and health packs.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var sceneRef = null, cameraRef = null;
  var enemies = [];      // gangsters spawned by missions
  var tracers = [];      // {mesh, life}
  var sparks = [];       // {mesh, life}
  var pickups = [];      // {mesh, kind, x, z, taken}
  var fireCooldown = 0;
  var dangerPulse = null; // {x,z,radius,life} — peds flee from this

  function init(scene, camera) { sceneRef = scene; cameraRef = camera; }

  function makeTracer(from, to) {
    var dir = new THREE.Vector3().subVectors(to, from);
    var len = dir.length();
    var geo = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.lookAt(to); m.rotateX(Math.PI / 2);
    sceneRef.add(m);
    tracers.push({ mesh: m, life: 0.08 });
  }
  function makeSpark(pos) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    m.position.copy(pos);
    sceneRef.add(m);
    sparks.push({ mesh: m, life: 0.18 });
  }
  function makeMuzzle(pos, dir) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb03d }));
    m.position.copy(pos).addScaledVector(dir, 0.5);
    m.lookAt(new THREE.Vector3().copy(pos).add(dir));
    m.rotateX(Math.PI / 2);
    sceneRef.add(m);
    sparks.push({ mesh: m, life: 0.06 });
  }

  function raycastShoot(origin, dir, maxDist) {
    // returns {point, target} where target is {kind:'ped'|'cop'|'enemy'|'car', ref}
    var ray = new THREE.Raycaster(origin, dir, 0.1, maxDist);
    var hits = [];
    // test enemy meshes, cop meshes, ped meshes, car meshes
    var meshes = [];
    enemies.forEach(function (e) { if (e.alive) meshes.push({ m: e.mesh, ref: { kind: 'enemy', ref: e } }); });
    SB.police.getFootCops().forEach(function (c) { meshes.push({ m: c.mesh, ref: { kind: 'cop', ref: c } }); });
    SB.peds.list.forEach(function (p) { if (p.state !== 'down') meshes.push({ m: p.mesh, ref: { kind: 'ped', ref: p } }); });
    SB.vehicles.trafficCars.concat(SB.vehicles.parkedCars).forEach(function (car) {
      meshes.push({ m: car.mesh, ref: { kind: 'car', ref: car } });
    });
    SB.police.getPoliceCars().forEach(function (car) { meshes.push({ m: car.mesh, ref: { kind: 'car', ref: car } }); });
    meshes.forEach(function (entry) {
      var h = ray.intersectObject(entry.m, true);
      if (h.length) hits.push({ dist: h[0].distance, point: h[0].point, target: entry.ref });
    });
    hits.sort(function (a, b) { return a.dist - b.dist; });
    return hits.length ? hits[0] : { point: new THREE.Vector3().copy(origin).addScaledVector(dir, maxDist), target: null };
  }

  function playerShoot() {
    var p = SB.player.state;
    if (p.weapon !== 'pistol' || fireCooldown > 0 || p.inCar) return;
    if (p.ammo <= 0) { SB.audio.click(); SB.hud.toast('OUT OF AMMO — press R to reload'); return; }
    fireCooldown = 0.28;
    p.ammo--;
    SB.audio.shot();
    var origin = new THREE.Vector3(p.x, 1.6, p.z);
    var dir = new THREE.Vector3(Math.sin(p.camYaw), -0.02, Math.cos(p.camYaw)).normalize();
    // aim slightly toward camera pitch
    dir.y = -Math.sin(p.camPitch) * 0.35;
    dir.normalize();
    var hit = raycastShoot(origin, dir, 90);
    makeTracer(new THREE.Vector3(p.x + Math.sin(p.heading) * 0.5, 1.5, p.z + Math.cos(p.heading) * 0.5), hit.point);
    makeMuzzle(origin, dir);
    makeSpark(hit.point);
    dangerPulse = { x: p.x, z: p.z, radius: 40, life: 0.5 };
    if (hit.target) {
      var t = hit.target;
      if (t.kind === 'enemy') damageEnemy(t.ref, 34, p);
      else if (t.kind === 'cop') { damageCop(t.ref, 34); SB.police.addHeat(14, 'shot a cop'); }
      else if (t.kind === 'ped') { SB.peds.knockDown(t.ref); SB.police.addHeat(12, 'shot a civilian'); }
      else if (t.kind === 'car') { t.ref.health -= 12; if (t.ref.health <= 0) SB.main.explodeCar(t.ref); }
    } else {
      SB.police.addHeat(2, 'fired a gun in public');
    }
  }

  function playerPunch() {
    var p = SB.player.state;
    if (p.punching > 0 || p.inCar) return;
    p.punching = 0.35;
    SB.audio.punch();
    var fx = p.x + Math.sin(p.heading) * 1.6, fz = p.z + Math.cos(p.heading) * 1.6;
    var ped = SB.peds.nearestPed(fx, fz, 1.6);
    if (ped) { SB.peds.knockDown(ped); SB.police.addHeat(10, 'assaulted a civilian'); return; }
    var cop = null, bd = 1.6 * 1.6;
    SB.police.getFootCops().forEach(function (c) {
      var d2 = U.dist2(fx, fz, c.x, c.z);
      if (d2 < bd) { bd = d2; cop = c; }
    });
    if (cop) { damageCop(cop, 20); SB.police.addHeat(12, 'punched a cop'); return; }
    var en = null; bd = 1.6 * 1.6;
    enemies.forEach(function (e) {
      if (!e.alive) return;
      var d2 = U.dist2(fx, fz, e.x, e.z);
      if (d2 < bd) { bd = d2; en = e; }
    });
    if (en) damageEnemy(en, 25, p);
  }

  function damageCop(cop, dmg) {
    cop.hp = (cop.hp || 60) - dmg;
    if (cop.hp <= 0) {
      sceneRef.remove(cop.mesh);
      var arr = SB.police.getFootCops();
      var i = arr.indexOf(cop);
      if (i >= 0) arr.splice(i, 1);
      SB.player.state.cash += 50;
      SB.hud.toast('+$50 — cop down');
    }
  }

  function spawnEnemy(x, z, name) {
    var rng = Math.random;
    var g = new THREE.Group();
    var gang = new THREE.MeshLambertMaterial({ color: 0x8a2a2a }); // crimson gang jackets
    var skin = new THREE.MeshLambertMaterial({ color: 0xf2c89b });
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    legs.position.y = 0.42; g.add(legs);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), gang);
    torso.position.y = 1.22; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 1.82; g.add(head);
    var band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    band.position.y = 1.95; g.add(band);
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    gun.position.set(0.39, 1.0, 0.25); g.add(gun);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, 0, z);
    sceneRef.add(g);
    var e = { mesh: g, x: x, z: z, heading: 0, hp: 70, alive: true, name: name || 'Gangster',
      shootT: U.range(Math.random, 1, 3), phase: Math.random() * 6 };
    enemies.push(e);
    return e;
  }

  function damageEnemy(e, dmg, p) {
    if (!e.alive) return;
    e.hp -= dmg;
    makeSpark(new THREE.Vector3(e.x, 1.4, e.z));
    if (e.hp <= 0) {
      e.alive = false;
      e.mesh.rotation.x = -Math.PI / 2;
      e.mesh.position.y = 0.4;
      SB.player.state.cash += 120;
      SB.audio.cash();
      SB.hud.toast('+$120 — ' + e.name + ' down');
      SB.missions.onEnemyDown(e);
    }
  }

  function updateEnemies(dt) {
    var p = SB.player.state;
    var px = p.inCar ? p.inCar.mesh.position.x : p.x;
    var pz = p.inCar ? p.inCar.mesh.position.z : p.z;
    enemies.forEach(function (e) {
      if (!e.alive) return;
      var dx = px - e.x, dz = pz - e.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      e.heading = U.angleLerp(e.heading, Math.atan2(dx, dz), U.clamp(dt * 4, 0, 1));
      e.mesh.rotation.y = e.heading;
      if (d > 26) { /* hold ground */ }
      else if (d > 8) {
        e.x += Math.sin(e.heading) * 4.5 * dt;
        e.z += Math.cos(e.heading) * 4.5 * dt;
        e.mesh.position.set(e.x, Math.abs(Math.sin(e.phase += dt * 9)) * 0.05, e.z);
      } else {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = U.range(Math.random, 1.2, 2.4);
          enemyShoot(e, px, pz);
        }
      }
    });
  }

  function enemyShoot(e, px, pz) {
    var from = new THREE.Vector3(e.x, 1.5, e.z);
    var to = new THREE.Vector3(px + U.range(Math.random, -3, 3), 1.2, pz + U.range(Math.random, -3, 3));
    makeTracer(from, to);
    SB.audio.shot();
    // hit chance grows when close
    var d = U.dist(e.x, e.z, px, pz);
    if (Math.random() < U.clamp(0.55 - d * 0.015, 0.08, 0.5)) {
      SB.main.damagePlayer(9, 'gangster');
    }
  }

  function spawnPickup(kind, x, z) {
    var color = kind === 'health' ? 0x7dff9a : kind === 'armor' ? 0x4e8bff : 0xffd23d;
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color: color, emissive: color, emissiveIntensity: 0.4 }));
    mesh.position.set(x, 0.7, z);
    sceneRef.add(mesh);
    pickups.push({ mesh: mesh, kind: kind, x: x, z: z, taken: false, spin: Math.random() * 6 });
  }

  function updatePickups(dt) {
    var p = SB.player.state;
    var px = p.inCar ? p.inCar.mesh.position.x : p.x;
    var pz = p.inCar ? p.inCar.mesh.position.z : p.z;
    pickups.forEach(function (pk) {
      if (pk.taken) return;
      pk.spin += dt * 2;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.position.y = 0.7 + Math.sin(pk.spin * 1.5) * 0.15;
      if (U.dist2(px, pz, pk.x, pk.z) < 2.4 * 2.4) {
        pk.taken = true;
        sceneRef.remove(pk.mesh);
        if (pk.kind === 'health') { p.health = Math.min(100, p.health + 50); SB.hud.toast('HEALTH +50'); }
        else if (pk.kind === 'armor') { p.armor = Math.min(100, p.armor + 50); SB.hud.toast('ARMOR +50'); }
        else if (pk.kind === 'crate' || pk.kind === 'case') {
          SB.hud.toast(pk.kind === 'case' ? 'CASH CASE SECURED' : 'CRATE SECURED');
          SB.missions.onPickup(pk.kind);
        }
        else { p.cash += 200; SB.hud.toast('+$200 CASH'); }
        SB.audio.pickup();
      }
    });
  }

  function updateFx(dt) {
    fireCooldown = Math.max(0, fireCooldown - dt);
    if (dangerPulse) { dangerPulse.life -= dt; if (dangerPulse.life <= 0) dangerPulse = null; }
    tracers = tracers.filter(function (t) {
      t.life -= dt;
      if (t.life <= 0) { sceneRef.remove(t.mesh); return false; }
      return true;
    });
    sparks = sparks.filter(function (s) {
      s.life -= dt;
      if (s.life <= 0) { sceneRef.remove(s.mesh); return false; }
      return true;
    });
  }

  function clearEnemies() {
    enemies.forEach(function (e) { sceneRef.remove(e.mesh); });
    enemies = [];
  }

  SB.combat = {
    init: init, playerShoot: playerShoot, playerPunch: playerPunch,
    updateEnemies: updateEnemies, updatePickups: updatePickups, updateFx: updateFx,
    spawnEnemy: spawnEnemy, spawnPickup: spawnPickup, clearEnemies: clearEnemies,
    damageEnemy: damageEnemy,
    getEnemies: function () { return enemies; },
    getDanger: function () { return dangerPulse; },
    clearDanger: function () { dangerPulse = null; }
  };
})(window);
