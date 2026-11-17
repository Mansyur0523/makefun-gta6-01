// pedestrians.js — sidewalk walkers who stroll, chat, flee gunfire and react to cars.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var peds = [];
  var SHIRTS = [0xff8a5c, 0x5c8aff, 0x7dff9a, 0xffd23d, 0xc97dff, 0xffffff, 0x3dd8c9, 0xff5a7a];
  var SKINS = [0xf2c89b, 0xc98d5a, 0x8a5a34, 0xf7d7b0, 0xa06a42];

  function buildPedMesh(rng) {
    var g = new THREE.Group();
    var skin = U.pick(rng, SKINS), shirt = U.pick(rng, SHIRTS);
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.3),
      new THREE.MeshLambertMaterial({ color: rng() < 0.5 ? 0x2a3a5a : 0x4a3a2a }));
    legs.position.y = 0.4; g.add(legs);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32),
      new THREE.MeshLambertMaterial({ color: shirt }));
    torso.position.y = 1.15; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38),
      new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.7; g.add(head);
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4),
      new THREE.MeshLambertMaterial({ color: rng() < 0.5 ? 0x1a1a1a : 0x6a4a2a }));
    hair.position.y = 1.92; g.add(hair);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14),
      new THREE.MeshLambertMaterial({ color: shirt }));
    armL.position.set(-0.36, 1.15, 0); g.add(armL);
    var armR = armL.clone(); armR.position.x = 0.36; g.add(armR);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.userData.armL = armL; g.userData.armR = armR;
    return g;
  }

  function spawnPeds(scene, count, seed) {
    var rng = U.makeRng(seed || 99);
    var coords = [];
    for (var p = -300; p <= 300; p += 62) coords.push(p);
    for (var i = 0; i < count; i++) {
      var c = coords[Math.floor(rng() * coords.length)];
      var along = U.range(rng, -290, 290);
      var horiz = rng() < 0.5;
      var x = horiz ? along : c + (rng() < 0.5 ? 11 : -11);
      var z = horiz ? c + (rng() < 0.5 ? 11 : -11) : along;
      var mesh = buildPedMesh(rng);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      peds.push({
        mesh: mesh, x: x, z: z, heading: rng() * Math.PI * 2,
        speed: U.range(rng, 1.2, 2.2), state: 'walk', // walk | flee | down
        target: null, panic: 0, downT: 0, walkT: U.range(rng, 2, 8), phase: rng() * 6
      });
    }
  }

  function nearestSidewalkPoint(x, z) {
    // snap to the nearest sidewalk line (road coord +/- 11)
    var best = { x: x, z: z }, bd = 1e9;
    for (var p = -300; p <= 300; p += 62) {
      [[p + 11, z], [p - 11, z], [x, p + 11], [x, p - 11]].forEach(function (c) {
        var d = U.dist2(x, z, c[0], c[1]);
        if (d < bd) { bd = d; best = { x: c[0], z: c[1] }; }
      });
    }
    return best;
  }

  function updatePeds(dt, danger) {
    // danger: {x, z, radius} gunshot / crash epicentre that makes peds flee
    peds.forEach(function (p) {
      if (p.state === 'down') {
        p.downT -= dt;
        if (p.downT <= 0) { p.state = 'walk'; p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
        return;
      }
      if (danger && U.dist2(p.x, p.z, danger.x, danger.z) < danger.radius * danger.radius) {
        p.state = 'flee'; p.panic = 3;
      }
      if (p.state === 'flee') {
        p.panic -= dt;
        var away = Math.atan2(p.x - (danger ? danger.x : 0), p.z - (danger ? danger.z : 0));
        p.heading = U.angleLerp(p.heading, away, U.clamp(dt * 4, 0, 1));
        p.speed = 5.5;
        if (p.panic <= 0) { p.state = 'walk'; p.speed = 1.6; }
      } else {
        p.walkT -= dt;
        if (p.walkT <= 0) {
          p.walkT = U.range(Math.random, 3, 9);
          var t = nearestSidewalkPoint(p.x + U.range(Math.random, -60, 60), p.z + U.range(Math.random, -60, 60));
          p.target = t;
        }
        if (p.target) {
          var dx = p.target.x - p.x, dz = p.target.z - p.z;
          var d = Math.sqrt(dx * dx + dz * dz);
          if (d < 1.5) { p.target = null; }
          else p.heading = U.angleLerp(p.heading, Math.atan2(dx, dz), U.clamp(dt * 3, 0, 1));
        }
      }
      var nx = p.x + Math.sin(p.heading) * p.speed * dt;
      var nz = p.z + Math.cos(p.heading) * p.speed * dt;
      var pos = { x: nx }, posz = { z: nz };
      SB.city.collideCircle(nx, nz, 0.5, pos, posz);
      p.x = pos.x; p.z = posz.z;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      // walk bob + arm swing
      p.phase += dt * p.speed * 3.2;
      var sw = Math.sin(p.phase) * 0.5;
      p.mesh.userData.armL.rotation.x = sw;
      p.mesh.userData.armR.rotation.x = -sw;
      p.mesh.position.y = Math.abs(Math.sin(p.phase)) * 0.06;
    });
  }

  function knockDown(ped) {
    ped.state = 'down'; ped.downT = 6;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.4;
  }

  function nearestPed(x, z, maxD) {
    var best = null, bd = maxD * maxD;
    peds.forEach(function (p) {
      if (p.state === 'down') return;
      var d2 = U.dist2(x, z, p.x, p.z);
      if (d2 < bd) { bd = d2; best = p; }
    });
    return best;
  }

  SB.peds = { spawnPeds: spawnPeds, updatePeds: updatePeds, knockDown: knockDown,
    nearestPed: nearestPed, list: peds };
})(window);
