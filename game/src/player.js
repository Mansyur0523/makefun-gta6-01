// player.js — Rico Vale on foot: third-person movement, camera, entering cars.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var player = {
    x: -140, z: 120, heading: 0, speed: 0,
    health: 100, armor: 0, cash: 250,
    inCar: null, weapon: 'pistol', ammo: 12, reserveAmmo: 48,
    camYaw: 0, camPitch: 0.32, camDist: 9, camMode: 0,
    moveX: 0, moveZ: 0, running: false, punching: 0
  };

  var mesh = null, armR = null, gunMesh = null;
  var keys = {};

  function buildPlayerMesh(scene) {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98d5a });
    var jacket = new THREE.MeshLambertMaterial({ color: 0xd94f2a }); // orange jacket
    var pants = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.32), pants);
    legs.position.y = 0.42; g.add(legs);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), jacket);
    torso.position.y = 1.22; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 1.82; g.add(head);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44),
      new THREE.MeshLambertMaterial({ color: 0xffd23d }));
    cap.position.y = 2.05; g.add(cap);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.65, 0.15), jacket);
    armL.position.set(-0.39, 1.22, 0); g.add(armL);
    armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.65, 0.15), jacket);
    armR.position.set(0.39, 1.22, 0); g.add(armR);
    gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    gunMesh.position.set(0.39, 1.0, 0.25); gunMesh.visible = true; g.add(gunMesh);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.userData.armL = armL; g.userData.armR = armR;
    scene.add(g);
    mesh = g;
    return g;
  }

  function bindInput(canvas) {
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown'].indexOf(e.code) >= 0) e.preventDefault();
      if (e.code === 'KeyM') SB.audio.toggleMute();
      if (e.code === 'KeyC') player.camMode = (player.camMode + 1) % 3;
      if (e.code === 'Digit1') setWeapon('pistol');
      if (e.code === 'Digit2') setWeapon('fists');
      if (e.code === 'KeyR') reload();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    var dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', function () { dragging = false; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      player.camYaw -= (e.clientX - lx) * 0.005;
      player.camPitch = U.clamp(player.camPitch + (e.clientY - ly) * 0.004, 0.05, 1.1);
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', function (e) {
      player.camDist = U.clamp(player.camDist + e.deltaY * 0.01, 5, 16);
    }, { passive: true });
  }

  function setWeapon(w) {
    player.weapon = w;
    if (gunMesh) gunMesh.visible = (w === 'pistol');
    SB.audio.click();
  }
  function reload() {
    if (player.weapon !== 'pistol' || player.ammo >= 12 || player.reserveAmmo <= 0) return;
    var need = 12 - player.ammo;
    var take = Math.min(need, player.reserveAmmo);
    player.ammo += take; player.reserveAmmo -= take;
    SB.audio.reload();
  }

  function isDown(code) { return !!keys[code]; }

  // On-foot movement. Returns nothing; writes player.x/z/heading.
  function updateOnFoot(dt) {
    var fwd = (isDown('KeyW') || isDown('ArrowUp') ? 1 : 0) - (isDown('KeyS') || isDown('ArrowDown') ? 1 : 0);
    var strafe = (isDown('KeyD') || isDown('ArrowRight') ? 1 : 0) - (isDown('KeyA') || isDown('ArrowLeft') ? 1 : 0);
    player.running = isDown('ShiftLeft') || isDown('ShiftRight');
    var spd = player.running ? 9 : 5;
    var mx = 0, mz = 0;
    if (fwd || strafe) {
      var yaw = player.camYaw;
      var fx = Math.sin(yaw), fz = Math.cos(yaw);
      var rx = Math.cos(yaw), rz = -Math.sin(yaw);
      mx = fx * fwd + rx * strafe; mz = fz * fwd + rz * strafe;
      var len = Math.sqrt(mx * mx + mz * mz);
      mx /= len; mz /= len;
      player.heading = U.angleLerp(player.heading, Math.atan2(mx, mz), U.clamp(dt * 10, 0, 1));
    }
    var nx = player.x + mx * spd * dt;
    var nz = player.z + mz * spd * dt;
    var pos = { x: nx }, posz = { z: nz };
    if (SB.city.collideCircle(nx, nz, 0.5, pos, posz)) {
      // slide along the wall: try each axis alone
      var px2 = { x: nx }, pz2 = { z: player.z };
      if (!SB.city.collideCircle(nx, player.z, 0.5, px2, pz2)) { player.x = px2.x; }
      var px3 = { x: player.x }, pz3 = { z: nz };
      if (!SB.city.collideCircle(player.x, nz, 0.5, px3, pz3)) { player.z = pz3.z; }
    } else { player.x = pos.x; player.z = posz.z; }
    player.x = U.clamp(player.x, -330, 330);
    player.z = U.clamp(player.z, -330, 430);
    player.moveX = mx; player.moveZ = mz;
    player.speed = (fwd || strafe) ? spd : 0;
    if (player.punching > 0) player.punching -= dt;
    if (mesh) {
      mesh.position.set(player.x, 0, player.z);
      mesh.rotation.y = player.heading;
      mesh.visible = true;
      // walk cycle
      var ph = (performance.now() / 1000) * (player.running ? 11 : 7) * (player.speed > 0 ? 1 : 0);
      mesh.userData.armL.rotation.x = Math.sin(ph) * 0.6 * (player.speed > 0 ? 1 : 0);
      mesh.userData.armR.rotation.x = -Math.sin(ph) * 0.6 * (player.speed > 0 ? 1 : 0);
      if (player.punching > 0) mesh.userData.armR.rotation.x = -1.6;
      mesh.position.y = player.speed > 0 ? Math.abs(Math.sin(ph)) * 0.07 : 0;
    }
  }

  // Third-person camera follow. target: {x,z} + eye height.
  function updateCamera(dt, camera, focus) {
    var fx = focus.x, fz = focus.z;
    var dist = player.camDist + (player.camMode === 1 ? 4 : 0);
    var pitch = player.camPitch;
    var cx = fx - Math.sin(player.camYaw) * Math.cos(pitch) * dist;
    var cz = fz - Math.cos(player.camYaw) * Math.cos(pitch) * dist;
    var cy = 2.2 + Math.sin(pitch) * dist;
    if (player.camMode === 2) { // top-down tactical
      cx = fx; cz = fz - 0.01; cy = 42;
      camera.position.set(cx, cy, cz);
      camera.lookAt(fx, 0, fz + 2);
      return;
    }
    camera.position.x = U.lerp(camera.position.x, cx, U.clamp(dt * 8, 0, 1));
    camera.position.y = U.lerp(camera.position.y, cy, U.clamp(dt * 8, 0, 1));
    camera.position.z = U.lerp(camera.position.z, cz, U.clamp(dt * 8, 0, 1));
    camera.lookAt(fx, 2.0, fz);
  }

  function hideMesh() { if (mesh) mesh.visible = false; }
  function showMesh() { if (mesh) mesh.visible = true; }

  SB.player = {
    state: player, buildPlayerMesh: buildPlayerMesh, bindInput: bindInput,
    updateOnFoot: updateOnFoot, updateCamera: updateCamera,
    setWeapon: setWeapon, reload: reload, hideMesh: hideMesh, showMesh: showMesh,
    keys: keys, isDown: isDown
  };
})(window);
