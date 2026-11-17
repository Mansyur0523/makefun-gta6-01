// vehicles.js — car models, arcade driving physics, traffic AI and car stealing.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var CAR_MODELS = [
    { name: 'Coral Cruiser', color: 0xff7a5c, top: 34, accel: 22, grip: 2.6 },
    { name: 'Sunset Sedan', color: 0x4e8bff, top: 30, accel: 20, grip: 2.4 },
    { name: 'Palm GT', color: 0xffd23d, top: 40, accel: 26, grip: 3.0 },
    { name: 'Bay Runner', color: 0x7dff9a, top: 32, accel: 21, grip: 2.5 },
    { name: 'Neon Coupe', color: 0xc97dff, top: 38, accel: 25, grip: 2.9 },
    { name: 'Harbor Taxi', color: 0xffe14d, top: 28, accel: 18, grip: 2.2 },
    { name: 'Dune Buggy', color: 0xff9a3d, top: 30, accel: 23, grip: 2.7 },
    { name: 'Vice Van', color: 0x9aa0a3, top: 26, accel: 16, grip: 2.0 }
  ];
  var POLICE_MODEL = { name: 'SBPD Interceptor', color: 0x1a2a4a, top: 38, accel: 27, grip: 3.1 };

  function buildCarMesh(model, isPolice) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: model.color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), bodyMat);
    body.position.y = 0.55; body.castShadow = true; g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
    cabin.position.set(0, 1.15, -0.2); cabin.castShadow = true; g.add(cabin);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.38, p[1]); g.add(w); wheels.push(w);
    });
    // headlights + taillights
    var hl = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
    [-0.6, 0.6].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), hl);
      h.position.set(x, 0.6, 2.22); g.add(h);
    });
    var tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    [-0.6, 0.6].forEach(function (x) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), tl);
      t.position.set(x, 0.6, -2.22); g.add(t);
    });
    if (isPolice) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.4),
        new THREE.MeshLambertMaterial({ color: 0xffffff }));
      bar.position.set(0, 1.55, -0.2); g.add(bar);
      var r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      r.position.set(-0.3, 1.58, -0.2); g.add(r);
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.42),
        new THREE.MeshBasicMaterial({ color: 0x2040ff }));
      b.position.set(0.3, 1.58, -0.2); g.add(b);
      g.userData.lightR = r; g.userData.lightB = b;
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
        new THREE.MeshLambertMaterial({ color: 0xffffff }));
      stripe.position.y = 0.72; g.add(stripe);
    }
    g.userData.wheels = wheels;
    return g;
  }

  // --- one car instance ---
  function Car(scene, model, x, z, heading, isPolice) {
    this.model = model;
    this.mesh = buildCarMesh(model, isPolice);
    this.mesh.position.set(x, 0, z);
    this.heading = heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.isPolice = !!isPolice;
    this.health = 100;
    this.stolen = false;
    this.driver = null;      // 'player' | 'traffic' | 'police' | null (parked)
    this.route = null;       // traffic: next road node
    this.wait = 0;
    this.spin = 0;           // wheel spin visual
    scene.add(this.mesh);
  }
  Car.prototype.setPos = function (x, z, heading) {
    this.mesh.position.x = x; this.mesh.position.z = z;
    if (heading !== undefined) this.heading = heading;
    this.mesh.rotation.y = this.heading;
  };
  Car.prototype.forward = function () {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  };
  // Arcade drive step. input: {throttle:-1..1, steer:-1..1, brake:bool}
  Car.prototype.drive = function (dt, input) {
    var f = this.forward();
    var top = this.model.top;
    if (input.brake) { this.speed *= Math.pow(0.02, dt); }
    else {
      this.speed += input.throttle * this.model.accel * dt;
      this.speed -= this.speed * 0.35 * dt; // drag
      if (input.throttle === 0) this.speed -= this.speed * 0.8 * dt;
    }
    this.speed = U.clamp(this.speed, -top * 0.45, top);
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    var steerAmt = input.steer * this.model.grip * U.clamp(Math.abs(this.speed) / 12, 0, 1);
    this.heading += steerAmt * dt * (this.speed >= 0 ? 1 : -1) * 0.55;
    var nx = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    var nz = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    // collide with buildings
    var pos = { x: nx }, posz = { z: nz };
    var hit = SB.city.collideCircle(nx, nz, 1.6, pos, posz);
    if (hit) {
      if (Math.abs(this.speed) > 8) SB.audio.crash();
      this.speed *= -0.25;
      nx = pos.x; nz = posz.z;
    }
    // keep inside the world
    nx = U.clamp(nx, -330, 330); nz = U.clamp(nz, -330, 430);
    this.mesh.position.x = nx; this.mesh.position.z = nz;
    this.mesh.rotation.y = this.heading;
    // body roll + wheel spin
    this.mesh.rotation.z = -input.steer * 0.03 * U.clamp(Math.abs(this.speed) / 20, 0, 1);
    this.spin += this.speed * dt * 2;
    var wheels = this.mesh.userData.wheels;
    for (var i = 0; i < wheels.length; i++) wheels[i].rotation.x = this.spin;
    if (wheels.length) { wheels[0].rotation.y = input.steer * 0.3; wheels[1].rotation.y = input.steer * 0.3; }
    return hit;
  };

  // --- traffic manager ---
  var trafficCars = [];
  var parkedCars = [];

  function spawnTraffic(scene, count, seed) {
    var rng = U.makeRng(seed || 777);
    var nodes = SB.city.getRoadNodes();
    for (var i = 0; i < count; i++) {
      var model = U.pick(rng, CAR_MODELS);
      var n = nodes[Math.floor(rng() * nodes.length)];
      var car = new Car(scene, model, n.x, n.z, rng() * Math.PI * 2, false);
      car.driver = 'traffic';
      car.speed = U.range(rng, 8, 14);
      car.route = pickNextNode(rng, n);
      trafficCars.push(car);
    }
  }
  function pickNextNode(rng, from) {
    var nodes = SB.city.getRoadNodes();
    var cands = nodes.filter(function (n) {
      return (n.x === from.x && Math.abs(n.z - from.z) === 62) ||
             (n.z === from.z && Math.abs(n.x - from.x) === 62);
    });
    if (!cands.length) return nodes[Math.floor(rng() * nodes.length)];
    return cands[Math.floor(rng() * cands.length)];
  }
  function updateTraffic(dt, playerPos) {
    var rng = Math.random;
    trafficCars.forEach(function (car) {
      if (car.driver !== 'traffic') return;
      var t = car.route;
      if (!t) return;
      var dx = t.x - car.mesh.position.x, dz = t.z - car.mesh.position.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 3) { car.route = pickNextNode(rng, t); return; }
      var want = Math.atan2(dx, dz);
      car.heading = U.angleLerp(car.heading, want, U.clamp(dt * 3, 0, 1));
      // slow down for a car ahead
      var slow = false;
      trafficCars.forEach(function (o) {
        if (o === car || o.driver !== 'traffic') return;
        var odx = o.mesh.position.x - car.mesh.position.x;
        var odz = o.mesh.position.z - car.mesh.position.z;
        var od = Math.sqrt(odx * odx + odz * odz);
        if (od < 9 && odx * Math.sin(car.heading) + odz * Math.cos(car.heading) > 0) slow = true;
      });
      var target = slow ? 0 : 11;
      car.speed = U.lerp(car.speed, target, U.clamp(dt * 1.5, 0, 1));
      // move along heading with building collision (traffic keeps its own speed)
      var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
      var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
      var pos = { x: nx }, posz = { z: nz };
      if (SB.city.collideCircle(nx, nz, 1.6, pos, posz)) { car.speed = 0; nx = pos.x; nz = posz.z; }
      car.mesh.position.x = nx; car.mesh.position.z = nz;
      car.mesh.rotation.y = car.heading;
      car.spin += car.speed * dt * 2;
      var wheels = car.mesh.userData.wheels;
      for (var i = 0; i < wheels.length; i++) wheels[i].rotation.x = car.spin;
    });
  }

  function spawnParked(scene, count, seed) {
    var rng = U.makeRng(seed || 4242);
    var spots = [];
    var coords = [];
    for (var p = -300; p <= 300; p += 62) coords.push(p);
    for (var i = 0; i < count; i++) {
      var c = coords[Math.floor(rng() * coords.length)];
      var along = U.range(rng, -280, 280);
      var horiz = rng() < 0.5;
      var x = horiz ? along : c + (rng() < 0.5 ? 9.5 : -9.5);
      var z = horiz ? c + (rng() < 0.5 ? 9.5 : -9.5) : along;
      // park parallel to the road: along x beside a horizontal road, along z beside a vertical one
      var heading = horiz ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
      var model = U.pick(rng, CAR_MODELS);
      var car = new Car(scene, model, x, z, heading, false);
      car.driver = null;
      parkedCars.push(car);
      spots.push({ x: x, z: z });
    }
    return spots;
  }

  function nearestCar(x, z, maxD, includeTraffic) {
    var best = null, bd = maxD * maxD;
    var all = parkedCars.concat(trafficCars);
    all.forEach(function (car) {
      if (car.driver === 'player' || car.driver === 'police') return;
      if (car.driver === 'traffic' && !includeTraffic) return;
      var d2 = U.dist2(x, z, car.mesh.position.x, car.mesh.position.z);
      if (d2 < bd) { bd = d2; best = car; }
    });
    return best;
  }

  SB.vehicles = {
    CAR_MODELS: CAR_MODELS, POLICE_MODEL: POLICE_MODEL,
    Car: Car, buildCarMesh: buildCarMesh,
    spawnTraffic: spawnTraffic, updateTraffic: updateTraffic,
    spawnParked: spawnParked, nearestCar: nearestCar,
    trafficCars: trafficCars, parkedCars: parkedCars
  };
})(window);
