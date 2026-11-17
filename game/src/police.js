// police.js — wanted stars, SBPD patrol cars that chase and ram, foot cops, busted.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var wanted = 0;           // 0..5 stars
  var heat = 0;             // 0..100 heat points; stars derive from it
  var decayT = 0;
  var policeCars = [];
  var footCops = [];
  var bustedT = 0;
  var sirenOn = false;
  var sceneRef = null;

  function starsFor(heatV) {
    if (heatV < 12) return 0;
    if (heatV < 30) return 1;
    if (heatV < 48) return 2;
    if (heatV < 66) return 3;
    if (heatV < 84) return 4;
    return 5;
  }
  function addHeat(n, reason) {
    heat = U.clamp(heat + n, 0, 100);
    var s = starsFor(heat);
    if (s > wanted) {
      wanted = s;
      SB.hud.toast('WANTED LEVEL ' + wanted + ' — ' + reason);
      SB.audio.siren(true); sirenOn = true;
    } else wanted = s;
    decayT = 0;
  }
  function clearWanted() { heat = 0; wanted = 0; SB.audio.siren(false); sirenOn = false; despawnAll(); }

  function spawnPoliceCar() {
    var p = SB.player.state;
    var px = p.inCar ? p.inCar.mesh.position.x : p.x;
    var pz = p.inCar ? p.inCar.mesh.position.z : p.z;
    // spawn on a road node close to the player so the chase starts at once
    var near = SB.city.getRoadNodes().filter(function (n) {
      var d = U.dist2(px, pz, n.x, n.z);
      return d > 30 * 30 && d < 100 * 100;
    });
    var spot = near.length ? near[Math.floor(Math.random() * near.length)] : { x: px + 50, z: pz };
    var car = new SB.vehicles.Car(sceneRef, SB.vehicles.POLICE_MODEL, spot.x, spot.z, 0, true);
    car.driver = 'police';
    car.avoidT = 0; car.avoidDir = 1;
    policeCars.push(car);
    return car;
  }

  function buildCopMesh() {
    var g = new THREE.Group();
    var navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98d5a });
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.32), navy);
    legs.position.y = 0.42; g.add(legs);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), navy);
    torso.position.y = 1.22; g.add(torso);
    var badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    badge.position.set(-0.16, 1.35, 0.19); g.add(badge);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 1.82; g.add(head);
    var hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), navy);
    hat.position.y = 2.06; g.add(hat);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function spawnFootCop(x, z) {
    var mesh = buildCopMesh();
    mesh.position.set(x, 0, z);
    sceneRef.add(mesh);
    footCops.push({ mesh: mesh, x: x, z: z, heading: 0, phase: 0, grabT: 0 });
  }

  function despawnAll() {
    policeCars.forEach(function (c) { sceneRef.remove(c.mesh); });
    footCops.forEach(function (c) { sceneRef.remove(c.mesh); });
    policeCars = []; footCops = [];
  }

  function init(scene) { sceneRef = scene; }

  function update(dt) {
    var p = SB.player.state;
    var px = p.inCar ? p.inCar.mesh.position.x : p.x;
    var pz = p.inCar ? p.inCar.mesh.position.z : p.z;
    var pSpeed = p.inCar ? Math.abs(p.inCar.speed) : p.speed;

    // wanted decay when no police can see the player
    if (wanted > 0) {
      decayT += dt;
      var nearest = 1e9;
      policeCars.forEach(function (c) { nearest = Math.min(nearest, U.dist2(px, pz, c.mesh.position.x, c.mesh.position.z)); });
      footCops.forEach(function (c) { nearest = Math.min(nearest, U.dist2(px, pz, c.x, c.z)); });
      if (nearest > 90 * 90 && decayT > 10) {
        heat = Math.max(0, heat - dt * 2.5);
        var s = starsFor(heat);
        if (s < wanted) { wanted = s; if (wanted === 0) { SB.audio.siren(false); sirenOn = false; SB.hud.toast('You lost the cops.'); despawnAll(); } }
      } else decayT = 0;
    }

    // keep the right number of police cars on the street
    var wantCars = wanted === 0 ? 0 : Math.min(wanted, 4);
    if (policeCars.length < wantCars && Math.random() < dt * 2.0) spawnPoliceCar();
    if (policeCars.length > wantCars) {
      var extra = policeCars.pop();
      sceneRef.remove(extra.mesh);
    }
    // foot cops at higher wanted levels when the player is on foot
    var wantCops = (wanted >= 2 && !p.inCar) ? Math.min(wanted - 1, 3) : 0;
    if (footCops.length < wantCops && Math.random() < dt * 1.2) {
      var a = Math.random() * Math.PI * 2;
      spawnFootCop(px + Math.cos(a) * 40, pz + Math.sin(a) * 40);
    }
    if (footCops.length > wantCops) {
      var c0 = footCops.pop(); sceneRef.remove(c0.mesh);
    }

    // police car pursuit: steer toward the player, ram to slow them
    policeCars.forEach(function (car) {
      var dx = px - car.mesh.position.x, dz = pz - car.mesh.position.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var want = Math.atan2(dx, dz);
      var steer = U.clamp((function () {
        var diff = want - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return diff;
      })(), -1, 1);
      var top = SB.vehicles.POLICE_MODEL.top;
      var throttle = d > 6 ? 1 : 0.4;
      // if blocked by a building, swerve around it for a moment
      if (car.avoidT > 0) {
        car.avoidT -= dt;
        steer = car.avoidDir;
        throttle = 0.6;
      }
      var hit = car.drive(dt, { throttle: throttle, steer: steer * 1.4, brake: false });
      if (hit && car.avoidT <= 0) {
        car.avoidT = 0.9;
        car.avoidDir = Math.random() < 0.5 ? 1 : -1;
      }
      car.speed = U.clamp(car.speed, -8, top);
      // flashing light bar
      var t = performance.now() / 1000;
      var on = Math.sin(t * 10) > 0;
      if (car.mesh.userData.lightR) car.mesh.userData.lightR.visible = on;
      if (car.mesh.userData.lightB) car.mesh.userData.lightB.visible = !on;
      // ram the player's car
      if (p.inCar && d < 4.2) {
        p.inCar.speed *= 0.82;
        p.inCar.health -= dt * 6;
        if (Math.abs(p.inCar.speed) > 10) SB.audio.crash();
        if (p.inCar.health <= 0) SB.main.bustCar();
      }
    });

    // foot cops run at the player; touching for 2s = busted
    var touching = false;
    footCops.forEach(function (cop) {
      var dx = px - cop.x, dz = pz - cop.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      cop.heading = U.angleLerp(cop.heading, Math.atan2(dx, dz), U.clamp(dt * 5, 0, 1));
      var spd = d > 3 ? 7.2 : 0;
      cop.x += Math.sin(cop.heading) * spd * dt;
      cop.z += Math.cos(cop.heading) * spd * dt;
      cop.phase += dt * 9;
      cop.mesh.position.set(cop.x, Math.abs(Math.sin(cop.phase)) * 0.06, cop.z);
      cop.mesh.rotation.y = cop.heading;
      if (d < 2.2 && !p.inCar) touching = true;
    });
    if (touching) {
      bustedT += dt;
      if (bustedT > 2) { bustedT = 0; SB.main.busted('The SBPD dragged you out and cuffed you on the sidewalk.'); }
    } else bustedT = Math.max(0, bustedT - dt);

    // car damage smoke is handled by main via car.health
    return { wanted: wanted, policeCars: policeCars, footCops: footCops };
  }

  SB.police = {
    init: init, update: update, addHeat: addHeat, clearWanted: clearWanted,
    despawnAll: despawnAll, spawnPoliceCar: spawnPoliceCar,
    getWanted: function () { return wanted; },
    getPoliceCars: function () { return policeCars; },
    getFootCops: function () { return footCops; }
  };
})(window);
