// missions.js — the story of Rico Vale: 5 missions with waypoints, dialogue and payouts,
// plus free-roam side jobs (taxi fares and package runs) for progression.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var MISSIONS = [
    {
      id: 'm1', name: 'FIRST WHEELS', reward: 400,
      intro: ['MARA VOSS', 'Rico. You want work, you need wheels. There is a Coral Cruiser parked on Coral Row — take it. Bring it to my garage. No cops, no dents.'],
      steps: [
        { text: 'Steal any car on the street (walk up and press E)', check: 'inCar' },
        { text: 'Drive the car to Mara\'s Garage on Coral Row', check: 'reach', x: -155, z: 70, radius: 12 }
      ]
    },
    {
      id: 'm2', name: 'THE PICKUP', reward: 600,
      intro: ['MARA VOSS', 'A crate came in at Pier 9. Walk to the end of the pier and grab it. The harbour boys are friendly. Mostly.'],
      steps: [
        { text: 'Go to the end of Pier 9 (south beach)', check: 'reach', x: 180, z: 400, radius: 14 },
        { text: 'Pick up the crate (walk into the glowing box)', check: 'pickup' },
        { text: 'Bring the crate back to Mara\'s Garage', check: 'reach', x: -155, z: 70, radius: 12 }
      ]
    },
    {
      id: 'm3', name: 'HEAT RUN', reward: 900,
      intro: ['MARA VOSS', 'The crate is hot — SBPD got a tip. Drive it to the hideout on the north edge. They will come for you. Lose them or outrun them.'],
      steps: [
        { text: 'Get in a car — the cops are coming', check: 'wanted3' },
        { text: 'Drive to the North Hideout (follow the yellow marker)', check: 'reach', x: 248, z: -248, radius: 14 },
        { text: 'Lose the cops (wanted level must drop to 0)', check: 'clear' }
      ]
    },
    {
      id: 'm4', name: 'PAYBACK AT THE DOCKS', reward: 1200,
      intro: ['MARA VOSS', 'The Crimson crew torched my cousin\'s shop. They are drinking at the south docks. Go settle it. Bring a gun.'],
      steps: [
        { text: 'Go to the south docks and deal with the Crimson crew (4 gangsters)', check: 'kill', count: 4, x: 180, z: 330, radius: 40 },
        { text: 'Return to Mara\'s Garage', check: 'reach', x: -155, z: 70, radius: 12 }
      ]
    },
    {
      id: 'm5', name: 'KING OF THE BAY', reward: 2000,
      intro: ['MARA VOSS', 'One last job, Rico. The Bay Bank truck parks at the plaza every morning. Take the money, lose the heat, and this city is ours.'],
      steps: [
        { text: 'Reach the bank truck at Central Plaza', check: 'reach', x: 0, z: 0, radius: 16 },
        { text: 'Grab the cash (walk into the glowing case)', check: 'pickup' },
        { text: 'Escape to the North Hideout with 3 stars or less', check: 'reach', x: 248, z: -248, radius: 14 },
        { text: 'Lose the cops completely', check: 'clear' }
      ]
    }
  ];

  var state = {
    index: 0,           // mission index, 0..4; 5 = story complete
    step: 0,
    active: false,
    carrying: null,     // 'crate' | 'cash'
    kills: 0,
    waypoint: null,     // {x,z}
    beacon: null,       // 3D marker mesh
    sideJob: null       // {kind, x, z, reward, stage}
  };
  var sceneRef = null;

  function buildBeacon(scene) {
    var g = new THREE.Group();
    var cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    cyl.position.y = 15; g.add(cyl);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    arrow.position.y = 4.5; arrow.rotation.y = Math.PI / 4; g.add(arrow);
    g.userData.arrow = arrow; g.userData.ring = ring;
    scene.add(g);
    return g;
  }

  function setBeacon(x, z) {
    if (!state.beacon) state.beacon = buildBeacon(sceneRef);
    state.beacon.visible = true;
    state.beacon.position.set(x, 0, z);
    state.waypoint = { x: x, z: z };
  }
  function hideBeacon() {
    if (state.beacon) state.beacon.visible = false;
    state.waypoint = null;
  }

  function say(who, line, ms) {
    SB.hud.dialog(who, line, ms || 6000);
  }

  function currentMission() { return MISSIONS[state.index] || null; }
  function currentStep() {
    var m = currentMission();
    return m ? m.steps[state.step] : null;
  }

  function startMission(i) {
    state.index = i; state.step = 0; state.active = true; state.kills = 0; state.carrying = null;
    var m = MISSIONS[i];
    SB.hud.toast('MISSION: ' + m.name);
    say(m.intro[0], m.intro[1], 8000);
    SB.audio.missionDone();
    setupStep();
    SB.save.saveGame();
  }

  function setupStep() {
    var step = currentStep();
    if (!step) { completeMission(); return; }
    if (step.check === 'reach' || step.check === 'kill') setBeacon(step.x, step.z);
    else if (step.check === 'inCar') hideBeacon();
    else if (step.check === 'pickup') {
      // spawn the glowing mission pickup at the previous reach point
      var prev = currentMission().steps[state.step - 1];
      var kind = state.index === 4 ? 'case' : 'crate';
      SB.combat.spawnPickup(kind, prev.x, prev.z);
      setBeacon(prev.x, prev.z);
    }
    else if (step.check === 'wanted3') {
      hideBeacon();
      SB.police.addHeat(55, 'the tip got out');
      SB.hud.toast('SBPD IS ON YOU — RUN!');
    }
    else if (step.check === 'clear') hideBeacon();
    SB.hud.setObjective(currentMission().name, step.text, state.waypoint);
  }

  function advanceStep() {
    state.step++;
    SB.audio.pickup();
    setupStep();
  }

  function completeMission() {
    var m = MISSIONS[state.index];
    state.active = false; hideBeacon();
    SB.player.state.cash += m.reward;
    SB.audio.missionDone();
    SB.hud.toast('MISSION COMPLETE: ' + m.name + '  +$' + m.reward);
    say('MARA VOSS', state.index === 4
      ? 'That is the whole bay, Rico. You are not fresh off the ferry anymore. You are Solara Bay.'
      : 'Good work, Rico. Come see me when you are ready for the next one.', 7000);
    SB.police.clearWanted();
    state.index++;
    state.carrying = null;
    SB.save.saveGame();
    if (state.index >= MISSIONS.length) {
      SB.hud.setObjective('KING OF SOLARA BAY', 'Story complete — free roam, side jobs and chaos await', null);
      SB.hud.toast('STORY COMPLETE — YOU OWN SOLARA BAY');
    }
  }

  function onEnemyDown(e) {
    if (!state.active) return;
    var step = currentStep();
    if (step && step.check === 'kill') {
      state.kills++;
      if (state.kills >= step.count) advanceStep();
      else SB.hud.setObjective(currentMission().name, step.text + '  (' + state.kills + '/' + step.count + ')', state.waypoint);
    }
  }

  function onPickup(kind) {
    if (!state.active) return;
    var step = currentStep();
    if (step && step.check === 'pickup') {
      state.carrying = kind === 'cash' ? 'cash' : 'crate';
      advanceStep();
    }
  }

  function update(dt) {
    var p = SB.player.state;
    var px = p.inCar ? p.inCar.mesh.position.x : p.x;
    var pz = p.inCar ? p.inCar.mesh.position.z : p.z;
    if (state.beacon && state.beacon.visible) {
      state.beacon.userData.arrow.rotation.y += dt * 2;
      state.beacon.userData.arrow.position.y = 4.5 + Math.sin(performance.now() / 300) * 0.5;
      state.beacon.userData.ring.scale.setScalar(1 + Math.sin(performance.now() / 400) * 0.12);
    }
    if (!state.active) {
      updateSideJob(dt, px, pz);
      return;
    }
    var step = currentStep();
    if (!step) return;
    if (step.check === 'inCar' && p.inCar) advanceStep();
    else if (step.check === 'reach' && U.dist(px, pz, step.x, step.z) < step.radius) advanceStep();
    else if (step.check === 'wanted3' && SB.police.getWanted() >= 3) advanceStep();
    else if (step.check === 'clear' && SB.police.getWanted() === 0) advanceStep();
    else if (step.check === 'pickup') {
      // pickup handled by combat pickups via onPickup hook in main loop
    }
    // live distance readout
    if (state.waypoint) {
      SB.hud.setObjective(currentMission().name, step.text,
        state.waypoint, U.dist(px, pz, state.waypoint.x, state.waypoint.z));
    }
  }

  // --- side jobs: taxi fares and package runs in free roam ---
  var sideTimer = 20;
  function updateSideJob(dt, px, pz) {
    if (state.sideJob) {
      var j = state.sideJob;
      if (j.stage === 'pickup' && U.dist(px, pz, j.x, j.z) < 10) {
        j.stage = 'drop';
        j.x = j.dx; j.z = j.dz;
        setBeacon(j.x, j.z);
        SB.hud.setObjective('SIDE JOB — ' + j.label, j.dropText, state.waypoint);
        SB.audio.pickup();
      } else if (j.stage === 'drop' && U.dist(px, pz, j.x, j.z) < 10) {
        SB.player.state.cash += j.reward;
        SB.audio.cash();
        SB.hud.toast('SIDE JOB DONE  +$' + j.reward);
        state.sideJob = null; hideBeacon();
        SB.hud.setObjective('FREE ROAM', 'Explore Solara Bay — missions at Mara\'s Garage', null);
        sideTimer = 25;
      }
      if (state.waypoint) SB.hud.setObjective(j.stage === 'pickup' ? 'SIDE JOB — ' + j.label : 'SIDE JOB — ' + j.label,
        j.stage === 'pickup' ? j.pickText : j.dropText, state.waypoint, U.dist(px, pz, j.x, j.z));
      return;
    }
    sideTimer -= dt;
    if (sideTimer <= 0) {
      sideTimer = 30;
      offerSideJob();
    }
  }
  function offerSideJob() {
    var rng = Math.random;
    var coords = [];
    for (var p = -300; p <= 300; p += 62) coords.push(p);
    function roadPoint() {
      var c = coords[Math.floor(rng() * coords.length)];
      var along = U.range(rng, -280, 280);
      return rng() < 0.5 ? { x: along, z: c } : { x: c, z: along };
    }
    var a = roadPoint(), b = roadPoint();
    if (U.dist(a.x, a.z, b.x, b.z) < 120) return;
    var taxi = rng() < 0.5;
    state.sideJob = {
      kind: taxi ? 'taxi' : 'package',
      label: taxi ? 'TAXI FARE' : 'PACKAGE RUN',
      x: a.x, z: a.z, dx: b.x, dz: b.z,
      reward: taxi ? 150 : 220, stage: 'pickup',
      pickText: taxi ? 'Pick up the fare (drive to the marker)' : 'Pick up the package (drive to the marker)',
      dropText: taxi ? 'Drop the fare at the destination' : 'Deliver the package to the destination'
    };
    setBeacon(a.x, a.z);
    SB.hud.setObjective('SIDE JOB — ' + state.sideJob.label, state.sideJob.pickText, state.waypoint);
    SB.hud.toast('SIDE JOB AVAILABLE: ' + state.sideJob.label + ' — $' + state.sideJob.reward);
    SB.audio.pickup();
  }

  function init(scene) { sceneRef = scene; }

  function interactAtGarage() {
    // called when the player presses E near Mara's Garage with no car nearby
    var p = SB.player.state;
    if (U.dist(p.x, p.z, -155, 70) < 16 && !state.active && state.index < MISSIONS.length) {
      startMission(state.index);
      return true;
    }
    return false;
  }

  SB.missions = {
    init: init, MISSIONS: MISSIONS, state: state,
    startMission: startMission, update: update, onEnemyDown: onEnemyDown, onPickup: onPickup,
    currentMission: currentMission, currentStep: currentStep,
    interactAtGarage: interactAtGarage, completeMission: completeMission,
    setBeacon: setBeacon, hideBeacon: hideBeacon
  };
})(window);
