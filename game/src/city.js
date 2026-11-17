// city.js — builds Solara Bay: road grid, towers, shops, palms, beach and ocean.
// All textures are drawn on canvas at runtime; no image files, no network.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var CITY = { half: 300, roadEvery: 62, roadWidth: 14, block: 48 };
  var colliders = [];   // {x,z,hx,hz} axis-aligned boxes the player and cars collide with
  var buildings = [];   // {x,z,w,d,h} footprints for the minimap
  var roadNodes = [];   // intersection coordinates for traffic routing
  var ocean = null;

  function windowTexture(rng, base, litRatio) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (var y = 10; y < 246; y += 22) {
      for (var x = 10; x < 118; x += 18) {
        var lit = rng() < litRatio;
        g.fillStyle = lit ? '#ffe9a0' : (rng() < 0.5 ? '#1d2f45' : '#27405c');
        g.fillRect(x, y, 12, 14);
      }
    }
    var tex = new THREE.CanvasTexture(c);
    return tex;
  }

  function neonSignTexture(text, color) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#101018'; g.fillRect(0, 0, 256, 64);
    g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color;
    g.fillText(text, 128, 34);
    return new THREE.CanvasTexture(c);
  }

  function buildCity(scene, seed) {
    var rng = U.makeRng(seed || 20261117);
    var H = CITY.half;

    // --- sky, sun, fog ---
    scene.background = new THREE.Color(0x87c5e8);
    scene.fog = new THREE.Fog(0x9fd0e8, 260, 900);
    var hemi = new THREE.HemisphereLight(0xbfdfff, 0x8a7a5a, 0.95);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff2cf, 1.25);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -340; sun.shadow.camera.right = 340;
    sun.shadow.camera.top = 340; sun.shadow.camera.bottom = -340;
    sun.shadow.camera.far = 800;
    scene.add(sun);
    // visible sun disc
    var sunBall = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6c9, fog: false }));
    sunBall.position.set(420, 300, -500);
    scene.add(sunBall);

    // --- ground: grass/concrete base ---
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 260, H * 2 + 260),
      new THREE.MeshLambertMaterial({ color: 0x7fae62 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 40);
    ground.receiveShadow = true;
    scene.add(ground);

    // --- beach + ocean on the south edge (z > half) ---
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 260, 70),
      new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, H + 35);
    sand.receiveShadow = true;
    scene.add(sand);
    ocean = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 260, 260),
      new THREE.MeshLambertMaterial({ color: 0x1e7fa8 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.0, H + 200);
    scene.add(ocean);

    // --- roads: dark strips along the grid + sidewalks ---
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    var walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
    var lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
    var coords = [];
    for (var p = -H; p <= H; p += CITY.roadEvery) coords.push(p);
    coords.forEach(function (c) {
      var r1 = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, CITY.roadWidth), roadMat);
      r1.rotation.x = -Math.PI / 2; r1.position.set(0, 0.05, c); r1.receiveShadow = true; scene.add(r1);
      var r2 = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, H * 2), roadMat);
      r2.rotation.x = -Math.PI / 2; r2.position.set(c, 0.05, 0); r2.receiveShadow = true; scene.add(r2);
      var s1 = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, CITY.roadWidth + 6), walkMat);
      s1.rotation.x = -Math.PI / 2; s1.position.set(0, 0.03, c); scene.add(s1);
      var s2 = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth + 6, H * 2), walkMat);
      s2.rotation.x = -Math.PI / 2; s2.position.set(c, 0.03, 0); scene.add(s2);
      // dashed centre lines
      for (var d = -H; d < H; d += 12) {
        var dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), lineMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.08, c); scene.add(dash);
        var dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 5), lineMat);
        dash2.rotation.x = -Math.PI / 2; dash2.position.set(c, 0.08, d); scene.add(dash2);
      }
    });
    coords.forEach(function (a) { coords.forEach(function (b) { roadNodes.push({ x: a, z: b }); }); });

    // --- buildings: one per block cell, heights vary by district ---
    var palette = ['#c96f4a', '#d8a05a', '#7fa8c9', '#b8b0a0', '#e0cfa8', '#8fae8f', '#c98a8a', '#6f8fb0'];
    var texA = windowTexture(rng, '#5a6a7a', 0.25);
    var texB = windowTexture(rng, '#7a5a4a', 0.3);
    var texC = windowTexture(rng, '#4a5a6a', 0.2);
    var texD = windowTexture(rng, '#8a7a5a', 0.35);
    var texs = [texA, texB, texC, texD];
    var signs = [
      { t: 'MARAS GARAGE', c: '#ff5a7a' }, { t: 'CORAL HOTEL', c: '#7fd4ff' },
      { t: 'PIER 9', c: '#ffd23d' }, { t: 'TACO SOL', c: '#7dff9a' },
      { t: 'SOLARA BANK', c: '#ffffff' }, { t: 'NEON MOTEL', c: '#ff9ad5' }
    ];
    var signIdx = 0;
    for (var ix = 0; ix < coords.length - 1; ix++) {
      for (var iz = 0; iz < coords.length - 1; iz++) {
        var cx = (coords[ix] + coords[ix + 1]) / 2;
        var cz = (coords[iz] + coords[iz + 1]) / 2;
        if (rng() < 0.08) continue; // empty lot / plaza
        var downtown = Math.abs(cx) < 130 && Math.abs(cz) < 130;
        var h = downtown ? U.range(rng, 30, 95) : U.range(rng, 10, 34);
        var w = U.range(rng, 24, 40), d = U.range(rng, 24, 40);
        var tex = U.pick(rng, texs);
        var mat = new THREE.MeshLambertMaterial({ map: tex, color: U.pick(rng, palette) });
        var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx, h / 2, cz);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        // flat roof cap
        var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1),
          new THREE.MeshLambertMaterial({ color: 0x3a3f45 }));
        roof.position.set(cx, h + 0.6, cz); scene.add(roof);
        // rooftop AC box on tall towers
        if (h > 45) {
          var ac = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6),
            new THREE.MeshLambertMaterial({ color: 0x8a9095 }));
          ac.position.set(cx + w / 5, h + 2.5, cz); scene.add(ac);
        }
        colliders.push({ x: cx, z: cz, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
        buildings.push({ x: cx, z: cz, w: w, d: d, h: h });
        // neon shop signs on some low buildings
        if (h < 36 && rng() < 0.22 && signIdx < signs.length * 3) {
          var s = signs[signIdx % signs.length]; signIdx++;
          var sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4),
            new THREE.MeshBasicMaterial({ map: neonSignTexture(s.t, s.c) }));
          sign.position.set(cx, Math.min(h - 2, 9), cz + d / 2 + 0.15);
          scene.add(sign);
        }
      }
    }

    // --- landmark: Mara's Garage (mission hub) at Coral Row ---
    var garage = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 22),
      new THREE.MeshLambertMaterial({ color: 0xd94f6a }));
    garage.position.set(-155, 6, 93); garage.castShadow = true; scene.add(garage);
    var gSign = new THREE.Mesh(new THREE.PlaneGeometry(24, 5),
      new THREE.MeshBasicMaterial({ map: neonSignTexture("MARA'S GARAGE", '#ff5a7a') }));
    gSign.position.set(-155, 10.5, 93 + 11.2); scene.add(gSign);
    colliders.push({ x: -155, z: 93, hx: 17.4, hz: 11.4 });
    buildings.push({ x: -155, z: 93, w: 34, d: 22, h: 12 });

    // --- landmark: pier jutting into the ocean ---
    var pier = new THREE.Mesh(new THREE.BoxGeometry(16, 1.5, 90),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    pier.position.set(180, 1, H + 75); pier.castShadow = true; scene.add(pier);
    colliders.push({ x: 180, z: H + 75, hx: 8.4, hz: 45.4 });
    var pierEnd = new THREE.Mesh(new THREE.BoxGeometry(30, 1.5, 16),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    pierEnd.position.set(180, 1, H + 118); scene.add(pierEnd);

    // --- palms along roads and beach ---
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
    for (var i = 0; i < 90; i++) {
      var px = U.range(rng, -H, H), pz = U.range(rng, -H, H + 30);
      // keep palms off roads and out of building footprints
      if (Math.abs(((px % CITY.roadEvery) + CITY.roadEvery) % CITY.roadEvery) < 10) continue;
      var onRoadZ = Math.abs(((pz % CITY.roadEvery) + CITY.roadEvery) % CITY.roadEvery) < 10;
      if (onRoadZ) continue;
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
      trunk.position.set(px, 3.5, pz); trunk.castShadow = true; scene.add(trunk);
      for (var f = 0; f < 5; f++) {
        var leaf = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.25, 1.4), leafMat);
        var a = (f / 5) * Math.PI * 2;
        leaf.position.set(px + Math.cos(a) * 2.2, 7.2, pz + Math.sin(a) * 2.2);
        leaf.rotation.y = -a; leaf.rotation.z = 0.35;
        scene.add(leaf);
      }
      colliders.push({ x: px, z: pz, hx: 0.7, hz: 0.7 });
    }

    // --- street lamps ---
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    coords.forEach(function (c) {
      for (var d = -H + 20; d < H; d += 62) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8, 6), poleMat);
        pole.position.set(c + 8.5, 4, d); scene.add(pole);
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), lampMat);
        lamp.position.set(c + 8.5, 8.2, d); scene.add(lamp);
        var pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8, 6), poleMat);
        pole2.position.set(d, 4, c + 8.5); scene.add(pole2);
        var lamp2 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), lampMat);
        lamp2.position.set(d, 8.2, c + 8.5); scene.add(lamp2);
      }
    });

    // --- distant skyline silhouette for depth ---
    var silMat = new THREE.MeshBasicMaterial({ color: 0x6f9ec9, fog: true });
    for (var k = 0; k < 26; k++) {
      var sw = U.range(rng, 30, 70), sh = U.range(rng, 60, 160);
      var ang = (k / 26) * Math.PI * 2;
      var sx = Math.cos(ang) * 640, sz = Math.sin(ang) * 640 + 40;
      var sil = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sw), silMat);
      sil.position.set(sx, sh / 2 - 2, sz);
      scene.add(sil);
    }

    return { colliders: colliders, buildings: buildings, roadNodes: roadNodes };
  }

  // Push a circle (player / car) out of building colliders. Returns true if it hit.
  function collideCircle(x, z, r, vx, vz) {
    var hit = false;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      var dx = x - c.x, dz = z - c.z;
      var ox = c.hx + r - Math.abs(dx), oz = c.hz + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        hit = true;
        if (ox < oz) { vx.x = c.x + (dx > 0 ? c.hx + r : -c.hx - r); }
        else { vz.z = c.z + (dz > 0 ? c.hz + r : -c.hz - r); }
      }
    }
    return hit;
  }

  function animateOcean(t) {
    if (ocean) ocean.position.y = Math.sin(t * 0.8) * 0.15;
  }

  SB.city = { CITY: CITY, buildCity: buildCity, collideCircle: collideCircle, animateOcean: animateOcean,
    getColliders: function () { return colliders; }, getBuildings: function () { return buildings; },
    getRoadNodes: function () { return roadNodes; } };
})(window);
