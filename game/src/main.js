// main.js — Solara Bay bootstrap, game loop, state machine, car theft, damage and
// the deterministic ?shot= modes used for screenshots.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var canvas = document.getElementById('game');
  var renderer, scene, camera;
  var clock = { last: 0 };
  var mode = 'menu'; // menu | playing | paused | busted
  var smoke = [];    // {mesh, life}
  var params = new URLSearchParams(location.search);
  var seed = parseInt(params.get('seed') || '20261117', 10) || 20261117;
  var shot = params.get('shot') || '';
  var shotTimer = 0;
  var ePressed = false, fPressed = false;
  var frameCount = 0;

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(-140, 12, 100);

    SB.city.buildCity(scene, seed);
    SB.vehicles.spawnTraffic(scene, 16, seed + 1);
    SB.vehicles.spawnParked(scene, 12, seed + 2);
    SB.peds.spawnPeds(scene, 26, seed + 3);
    SB.player.buildPlayerMesh(scene);
    SB.player.bindInput(canvas);
    SB.police.init(scene);
    SB.combat.init(scene, camera);
    SB.missions.init(scene);
    SB.hud.init();

    // scattered pickups across the city
    var rng = U.makeRng(seed + 9);
    for (var i = 0; i < 6; i++) {
      var kind = i % 3 === 0 ? 'health' : (i % 3 === 1 ? 'armor' : 'cash');
      SB.combat.spawnPickup(kind, U.range(rng, -280, 280), U.range(rng, -280, 280));
    }

    // menu buttons
    document.getElementById('btnPlay').addEventListener('click', function () { startGame(false); });
    document.getElementById('btnContinue').addEventListener('click', function () { startGame(true); });
    document.getElementById('btnResume').addEventListener('click', resumeGame);
    document.getElementById('btnSave').addEventListener('click', function () {
      SB.save.saveGame(); SB.hud.toast('GAME SAVED');
    });
    document.getElementById('btnRestart').addEventListener('click', function () {
      SB.save.clearSave(); location.reload();
    });
    document.getElementById('btnBusted').addEventListener('click', respawnAfterBusted);

    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyE') ePressed = true;
      if (e.code === 'KeyF') fPressed = true;
      if (e.code === 'Escape' && mode === 'playing') pauseGame();
      else if (e.code === 'Escape' && mode === 'paused') resumeGame();
    });
    canvas.addEventListener('mousedown', function (e) {
      if (mode === 'playing' && e.button === 0) SB.combat.playerShoot();
    });
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // save / continue affordance on the start screen
    var sv = SB.save.loadGame();
    if (sv) {
      document.getElementById('btnContinue').style.display = 'inline-block';
      var d = new Date(sv.savedAt);
      document.getElementById('saveNote').textContent =
        'Saved game found — cash ' + U.fmtMoney(sv.cash) + ', mission ' + (sv.missionIndex + 1) +
        ' of 5, saved ' + d.toLocaleString() + '.';
    }

    if (shot) setupShotMode();
    if (params.get('demo')) runDemo(params.get('demo'));
    requestAnimationFrame(loop);
    window.__SB_READY__ = true;
  }

  // --- ?demo=steal|mission|shoot: hands-free smoke test of the interaction paths ---
  // Teleports the player into place, then fires the same real key/mouse events a player
  // would, so the enter-car, mission-start and shooting code runs end to end.
  function runDemo(kind) {
    document.getElementById('startScreen').classList.add('hidden');
    SB.hud.show(true);
    mode = 'playing';
    var p = SB.player.state;
    if (kind === 'steal') {
      var car = SB.vehicles.parkedCars[0];
      p.x = car.mesh.position.x + 3; p.z = car.mesh.position.z + 3;
      p.heading = 0; p.camYaw = 0;
      setTimeout(function () { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); }, 1500);
      setTimeout(function () { SB.player.keys.KeyW = true; }, 2200);
    } else if (kind === 'mission') {
      p.x = -155; p.z = 70; p.heading = Math.PI; p.camYaw = Math.PI;
      setTimeout(function () { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); }, 1500);
    } else if (kind === 'shoot') {
      p.x = 21; p.z = 21; p.camYaw = Math.PI * 0.75;
      setTimeout(function () { canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); }, 1500);
    }
    window.__SB_SHOT_READY__ = false;
  }

  function startGame(continueSave) {
    SB.audio.ensure();
    if (continueSave) SB.save.applySave(SB.save.loadGame());
    document.getElementById('startScreen').classList.add('hidden');
    SB.hud.show(true);
    mode = 'playing';
    if (SB.missions.state.index === 0 && !SB.missions.state.active) {
      SB.hud.setObjective('WELCOME TO SOLARA BAY', 'Go to Mara\'s Garage on Coral Row (yellow marker) — press E there', null);
      SB.missions.setBeacon(-155, 70);
      SB.hud.dialog('MARA VOSS', 'Rico! You made it. Get over to my garage on Coral Row — I have your first job waiting.', 8000);
    } else if (!SB.missions.state.active) {
      SB.hud.setObjective('FREE ROAM', 'Go to Mara\'s Garage to start mission ' + (SB.missions.state.index + 1), null);
      SB.missions.setBeacon(-155, 70);
    }
  }

  function pauseGame() {
    mode = 'paused';
    var p = SB.player.state;
    document.getElementById('pauseStats').textContent =
      'Cash ' + U.fmtMoney(p.cash) + '  •  Health ' + Math.round(p.health) + '%  •  Mission ' +
      Math.min(SB.missions.state.index + 1, 5) + ' of 5  •  Wanted ' + SB.police.getWanted() + '★';
    document.getElementById('pauseMenu').classList.remove('hidden');
    SB.save.saveGame();
  }
  function resumeGame() {
    document.getElementById('pauseMenu').classList.add('hidden');
    mode = 'playing';
  }

  function busted(reason) {
    if (mode !== 'playing') return;
    mode = 'busted';
    var p = SB.player.state;
    var fine = Math.min(p.cash, Math.max(200, Math.floor(p.cash * 0.15)));
    p.cash -= fine;
    document.getElementById('bustedText').textContent =
      (reason || 'The SBPD caught you.') + ' Bail and fines cost you ' + U.fmtMoney(fine) + '.';
    document.getElementById('bustedScreen').classList.remove('hidden');
    SB.audio.fail();
    SB.audio.siren(false);
    SB.police.clearWanted();
    if (p.inCar) { p.inCar.driver = null; p.inCar = null; SB.player.showMesh(); }
  }

  function respawnAfterBusted() {
    var p = SB.player.state;
    document.getElementById('bustedScreen').classList.add('hidden');
    p.health = 100; p.armor = 50; p.ammo = 12; p.reserveAmmo = 48;
    p.x = -140; p.z = 120; p.heading = 0;
    SB.player.showMesh();
    SB.save.saveGame();
    mode = 'playing';
  }

  function bustCar() {
    var p = SB.player.state;
    if (!p.inCar) return;
    explodeCar(p.inCar);
    busted('Your car was wrecked in the chase and the SBPD pulled you from the smoke.');
  }

  function explodeCar(car) {
    var pos = car.mesh.position.clone();
    for (var i = 0; i < 10; i++) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random(), 6, 6),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7a2a : 0x555555 }));
      m.position.set(pos.x + U.range(Math.random, -2, 2), 1 + Math.random() * 2, pos.z + U.range(Math.random, -2, 2));
      scene.add(m);
      smoke.push({ mesh: m, life: 1.2, vy: 2 });
    }
    SB.audio.crash();
    var p = SB.player.state;
    if (p.inCar === car) { p.inCar = null; SB.player.showMesh(); damagePlayer(30, 'explosion'); }
    car.driver = null;
    car.health = 0;
    car.mesh.visible = false;
    scene.remove(car.mesh);
  }

  function damagePlayer(amount, source) {
    var p = SB.player.state;
    var absorbed = Math.min(p.armor, amount);
    p.armor -= absorbed;
    p.health -= (amount - absorbed);
    SB.audio.punch();
    if (p.health <= 0) {
      p.health = 0;
      busted('You were taken down' + (source ? ' by a ' + source : '') + '.');
    }
  }

  // --- entering / stealing cars ---
  function tryEnterCar() {
    var p = SB.player.state;
    if (p.inCar) {
      // exit the car
      var car = p.inCar;
      car.driver = null;
      car.speed = 0;
      p.inCar = null;
      p.x = car.mesh.position.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
      p.z = car.mesh.position.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
      SB.player.showMesh();
      SB.audio.click();
      return;
    }
    var car2 = SB.vehicles.nearestCar(p.x, p.z, 4.5, true);
    if (car2) {
      var wasTraffic = car2.driver === 'traffic';
      var wasParked = car2.driver === null;
      car2.driver = 'player';
      car2.stolen = true;
      p.inCar = car2;
      SB.player.hideMesh();
      SB.audio.horn();
      if (wasTraffic || wasParked) {
        SB.police.addHeat(14, 'stole a ' + car2.model.name);
        SB.hud.toast('STOLE A ' + car2.model.name.toUpperCase() + ' — THE OWNER CALLED IT IN!');
      } else {
        SB.hud.toast('Got in the ' + car2.model.name);
      }
      return;
    }
    // no car nearby: maybe start a mission at the garage
    SB.missions.interactAtGarage();
  }

  function updateDriving(dt) {
    var p = SB.player.state;
    var car = p.inCar;
    if (!car) return;
    var k = SB.player.keys;
    var throttle = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    var steer = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    // steering: positive steer should turn right (heading decreases in our convention)
    var brake = !!(k.ShiftLeft || k.ShiftRight || k.Space);
    car.drive(dt, { throttle: throttle, steer: -steer, brake: brake });
    // camera follows behind the car: camYaw matches the car's heading
    p.camYaw = U.angleLerp(p.camYaw, car.heading, U.clamp(dt * 2.2, 0, 1));
    SB.audio.engine(Math.abs(car.speed) / car.model.top, true);
    // hit pedestrians with the car
    SB.peds.list.forEach(function (ped) {
      if (ped.state === 'down') return;
      if (U.dist2(car.mesh.position.x, car.mesh.position.z, ped.x, ped.z) < 2.6 * 2.6) {
        SB.peds.knockDown(ped);
        SB.police.addHeat(10, 'ran over a pedestrian');
        car.speed *= 0.85;
      }
    });
    // bump traffic cars
    SB.vehicles.trafficCars.forEach(function (o) {
      if (o.driver !== 'traffic') return;
      var d2 = U.dist2(car.mesh.position.x, car.mesh.position.z, o.mesh.position.x, o.mesh.position.z);
      if (d2 < 3.4 * 3.4) {
        car.speed *= 0.7; o.speed = Math.max(o.speed, 4);
        SB.audio.crash();
      }
    });
    // car smoke when wrecked
    if (car.health < 50 && Math.random() < dt * 8) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.7 }));
      m.position.set(car.mesh.position.x, 1.5, car.mesh.position.z);
      scene.add(m);
      smoke.push({ mesh: m, life: 0.9, vy: 2.5 });
    }
  }

  function updateSmoke(dt) {
    smoke = smoke.filter(function (s) {
      s.life -= dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.scale.multiplyScalar(1 + dt * 1.5);
      if (s.life <= 0) { scene.remove(s.mesh); return false; }
      return true;
    });
  }

  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min((t - (clock.last || t)) / 1000, 0.05);
    clock.last = t;
    frameCount++;
    if (mode !== 'playing') {
      // menu orbit: slow cinematic pan over the city
      if (mode === 'menu' && !shot) {
        var a = t / 1000 * 0.05;
        camera.position.set(Math.cos(a) * 220, 90, Math.sin(a) * 220 + 20);
        camera.lookAt(0, 10, 0);
      }
      renderer.render(scene, camera);
      return;
    }
    var p = SB.player.state;
    if (ePressed) { ePressed = false; tryEnterCar(); }
    if (fPressed) { fPressed = false; SB.combat.playerPunch(); }

    if (p.inCar) updateDriving(dt);
    else SB.player.updateOnFoot(dt);

    // camera focus
    var focus = p.inCar
      ? { x: p.inCar.mesh.position.x, z: p.inCar.mesh.position.z }
      : { x: p.x, z: p.z };
    if (!p.inCar) SB.audio.engine(0, false);
    SB.player.updateCamera(dt, camera, focus);

    SB.vehicles.updateTraffic(dt, focus);
    SB.peds.updatePeds(dt, SB.combat.getDanger());
    SB.police.update(dt);
    SB.combat.updateEnemies(dt);
    SB.combat.updatePickups(dt);
    SB.combat.updateFx(dt);
    SB.missions.update(dt);
    SB.city.animateOcean(t / 1000);
    updateSmoke(dt);
    SB.hud.update(dt);

    // mission 4: spawn the Crimson crew when the player arrives at the docks
    if (SB.missions.state.active && SB.missions.currentMission() && SB.missions.currentMission().id === 'm4') {
      var step = SB.missions.currentStep();
      if (step && step.check === 'kill' && SB.combat.getEnemies().filter(function (e) { return e.alive; }).length === 0 && SB.missions.state.kills === 0) {
        for (var i = 0; i < 4; i++) {
          SB.combat.spawnEnemy(180 + U.range(Math.random, -14, 14), 330 + U.range(Math.random, -14, 14), 'Crimson Crew');
        }
        SB.hud.toast('THE CRIMSON CREW IS HERE — 4 GANGSTERS');
      }
    }

    if (shot) {
      shotTimer += dt;
      if (shotTimer > 6) { shotTimer = -9999; window.__SB_SHOT_READY__ = true; }
    }
    renderer.render(scene, camera);
  }

  // --- deterministic screenshot setups (?shot=chase|street|drive|menu) ---
  function setupShotMode() {
    document.getElementById('startScreen').classList.add('hidden');
    SB.hud.show(true);
    mode = 'playing';
    var p = SB.player.state;
    if (shot === 'chase') {
      // cover: player fleeing in a Palm GT, wanted 3, police on the tail, mission 3 live
      var car = SB.vehicles.parkedCars[0];
      car.driver = 'player'; car.stolen = true;
      p.inCar = car; SB.player.hideMesh();
      car.setPos(10, 120, Math.PI); // on the x=10 road, heading south (-z)
      car.speed = 24;
      p.camYaw = Math.PI;
      SB.player.keys.KeyW = true; // hold the throttle so the chase stays moving
      p.cash = 2450;
      SB.missions.state.index = 2; SB.missions.state.active = true; SB.missions.state.step = 1;
      SB.missions.setBeacon(248, -248);
      SB.hud.setObjective('HEAT RUN', 'Drive to the North Hideout (follow the yellow marker)', SB.missions.state.waypoint, 380);
      SB.police.addHeat(60, 'the tip got out');
      SB.police.spawnPoliceCar(); SB.police.spawnPoliceCar();
      SB.police.getPoliceCars().forEach(function (pc, i) {
        if (i === 0) { pc.setPos(10, 150, Math.PI); pc.speed = 22; } // on the tail
        else { pc.setPos(10, 60, Math.PI); pc.speed = 14; } // slower, ahead — the player catches it
      });
      // traffic ahead on the same road for depth
      SB.vehicles.trafficCars.slice(0, 2).forEach(function (tc, i) {
        tc.setPos(10, 20 - i * 40, Math.PI); tc.speed = 11;
        tc.route = { x: 10, z: -300 };
      });
      SB.audio.siren(true);
    } else if (shot === 'street') {
      // on foot in downtown with traffic, peds and a mission marker
      p.x = 21; p.z = 21; p.heading = Math.PI * 0.75; p.camYaw = Math.PI * 0.75;
      p.cash = 1250;
      SB.missions.state.index = 0; SB.missions.state.active = true; SB.missions.state.step = 0;
      SB.hud.setObjective('FIRST WHEELS', 'Steal any car on the street (walk up and press E)', null);
      SB.missions.setBeacon(-155, 70);
      var pc = SB.vehicles.parkedCars[1];
      pc.setPos(40, 19.5, 0); // parked along the z=10 road
      SB.vehicles.trafficCars.slice(0, 4).forEach(function (tc, i) {
        tc.setPos(10, 31 + (i - 1) * 18, 0); tc.speed = 10;
        tc.route = { x: 10, z: 300 };
      });
    } else if (shot === 'drive') {
      // cruising the east-west boulevard (z=258) with traffic
      var car2 = SB.vehicles.parkedCars[2];
      car2.driver = 'player'; car2.stolen = true;
      p.inCar = car2; SB.player.hideMesh();
      car2.setPos(-120, 258, Math.PI / 2);
      car2.speed = 26;
      p.camYaw = Math.PI / 2;
      SB.player.keys.KeyW = true;
      p.cash = 3200;
      SB.hud.setObjective('FREE ROAM', 'Explore Solara Bay — missions at Mara\'s Garage', null);
      SB.vehicles.trafficCars.slice(0, 5).forEach(function (tc, i) {
        tc.setPos(-120 + (i - 2) * 22, 258, Math.PI / 2); tc.speed = 12;
        tc.route = { x: 300, z: 258 };
      });
    } else if (shot === 'menu') {
      mode = 'menu';
      document.getElementById('startScreen').classList.remove('hidden');
      SB.hud.show(false);
    }
    window.__SB_SHOT_READY__ = false;
  }

  SB.main = {
    init: init, busted: busted, bustCar: bustCar, explodeCar: explodeCar,
    damagePlayer: damagePlayer, startGame: startGame
  };

  // Boot once the DOM is ready (scripts load in order at end of body).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
