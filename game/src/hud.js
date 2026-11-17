// hud.js — HUD text, wanted stars, minimap radar, dialogue box, toasts, damage vignette.
(function (global) {
  'use strict';
  var SB = global.SB, U = SB.utils;

  var el = {};
  var toastTimer = null, dialogTimer = null;
  var clockMin = 8 * 60; // game clock starts 08:00

  function $(id) { return document.getElementById(id); }

  function init() {
    ['hud', 'cashBox', 'healthFill', 'armorFill', 'stars', 'wantedLbl', 'clock', 'objName', 'objText',
     'objDist', 'toast', 'hint', 'speedNum', 'speedo', 'carName', 'minimap', 'crosshair',
     'vignette', 'dialog', 'dlgWho', 'dlgLine'].forEach(function (id) { el[id] = $(id); });
  }

  function show(on) { el.hud.classList.toggle('on', !!on); }

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.style.opacity = 1;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.style.opacity = 0; }, ms || 3200);
  }

  function dialog(who, line, ms) {
    el.dlgWho.textContent = who;
    el.dlgLine.textContent = line;
    el.dialog.style.display = 'block';
    if (dialogTimer) clearTimeout(dialogTimer);
    dialogTimer = setTimeout(function () { el.dialog.style.display = 'none'; }, ms || 5000);
  }
  function hideDialog() { el.dialog.style.display = 'none'; }

  function setObjective(name, text, waypoint, distM) {
    el.objName.textContent = name;
    el.objText.textContent = text;
    el.objDist.textContent = (waypoint && distM !== undefined) ? '◈ ' + U.fmtDist(distM) + ' to marker' : '';
  }

  var WANTED_LABELS = ['', 'HEAT: COPS ON FOOT', 'HEAT: PATROLS DISPATCHED', 'HEAT: ROADBLOCKS ACTIVE', 'HEAT: HELICOPTER ALERT', 'HEAT: FULL CITY LOCKDOWN'];
  function update(dt) {
    var p = SB.player.state;
    el.cashBox.firstChild.textContent = U.fmtMoney(p.cash);
    el.healthFill.style.width = U.clamp(p.health, 0, 100) + '%';
    el.armorFill.style.width = U.clamp(p.armor, 0, 100) + '%';
    var w = SB.police.getWanted();
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < w ? '★' : '<span class="dim">★</span>';
    el.stars.innerHTML = stars;
    el.wantedLbl.textContent = WANTED_LABELS[w] || '';
    // clock advances 1 game-hour per 3 real minutes
    clockMin += dt / 3;
    var hh = Math.floor(clockMin / 60) % 24, mm = Math.floor(clockMin % 60);
    el.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ' • SUNNY';
    // speedometer
    var kmh = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 3.6) : 0;
    el.speedNum.textContent = kmh;
    el.carName.textContent = p.inCar ? p.inCar.model.name + (p.inCar.health < 50 ? ' — SMOKING' : '') : '';
    el.speedo.style.display = p.inCar ? 'block' : 'none';
    el.crosshair.style.display = (!p.inCar && p.weapon === 'pistol') ? 'block' : 'none';
    // damage vignette
    el.vignette.style.opacity = p.health < 35 ? String((35 - p.health) / 35 * 0.9) : '0';
    drawMinimap(dt);
  }

  // --- minimap: top-down radar of roads, buildings, player, police, waypoint ---
  var mm = null;
  function drawMinimap(dt) {
    var c = el.minimap;
    if (!mm) mm = c.getContext('2d');
    var W = c.width, H = c.height, cx = W / 2, cy = H / 2;
    var p = SB.player.state;
    var px = p.inCar ? p.inCar.mesh.position.x : p.x;
    var pz = p.inCar ? p.inCar.mesh.position.z : p.z;
    var range = 130; // world units shown across the disc
    function toMap(x, z) {
      return { x: cx + (x - px) / range * (W / 2), y: cy + (z - pz) / range * (H / 2) };
    }
    mm.clearRect(0, 0, W, H);
    // clip to circle
    mm.save();
    mm.beginPath(); mm.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); mm.clip();
    mm.fillStyle = '#0a2436'; mm.fillRect(0, 0, W, H);
    // ocean band at the bottom (south)
    var oc = toMap(0, 330);
    mm.fillStyle = '#1e7fa8';
    mm.fillRect(0, oc.y, W, H - oc.y);
    // roads
    mm.strokeStyle = '#5a6a7a'; mm.lineWidth = 5;
    for (var r = -300; r <= 300; r += 62) {
      var a = toMap(r, -330), b = toMap(r, 330);
      mm.beginPath(); mm.moveTo(a.x, a.y); mm.lineTo(b.x, b.y); mm.stroke();
      var c2 = toMap(-330, r), d2 = toMap(330, r);
      mm.beginPath(); mm.moveTo(c2.x, c2.y); mm.lineTo(d2.x, d2.y); mm.stroke();
    }
    // buildings
    mm.fillStyle = '#8fa8bf';
    SB.city.getBuildings().forEach(function (bd) {
      var m = toMap(bd.x, bd.z);
      var s = Math.max(2, bd.w / range * (W / 2));
      mm.fillRect(m.x - s / 2, m.y - s / 2, s, s);
    });
    // waypoint marker (pulsing yellow)
    var wp = SB.missions.state.waypoint;
    if (wp) {
      var w = toMap(wp.x, wp.z);
      var pulse = 6 + Math.sin(performance.now() / 250) * 2;
      mm.fillStyle = '#ffd23d';
      mm.beginPath(); mm.arc(w.x, w.y, pulse, 0, Math.PI * 2); mm.fill();
      mm.strokeStyle = '#fff'; mm.lineWidth = 1.5;
      mm.beginPath(); mm.arc(w.x, w.y, pulse + 3, 0, Math.PI * 2); mm.stroke();
    }
    // traffic (white dots) and police (red dots)
    mm.fillStyle = '#ffffff';
    SB.vehicles.trafficCars.forEach(function (car) {
      var m = toMap(car.mesh.position.x, car.mesh.position.z);
      mm.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    });
    mm.fillStyle = '#ff4040';
    SB.police.getPoliceCars().forEach(function (car) {
      var m = toMap(car.mesh.position.x, car.mesh.position.z);
      mm.beginPath(); mm.arc(m.x, m.y, 3.5, 0, Math.PI * 2); mm.fill();
    });
    SB.police.getFootCops().forEach(function (cop) {
      var m = toMap(cop.x, cop.z);
      mm.fillRect(m.x - 2, m.y - 2, 4, 4);
    });
    // enemies (red diamonds)
    SB.combat.getEnemies().forEach(function (e) {
      if (!e.alive) return;
      var m = toMap(e.x, e.z);
      mm.fillStyle = '#ff2020';
      mm.beginPath(); mm.moveTo(m.x, m.y - 4); mm.lineTo(m.x + 4, m.y); mm.lineTo(m.x, m.y + 4); mm.lineTo(m.x - 4, m.y); mm.fill();
    });
    // player arrow (centre)
    var heading = p.inCar ? p.inCar.heading : p.heading;
    mm.save();
    mm.translate(cx, cy);
    mm.rotate(-heading + Math.PI);
    mm.fillStyle = '#7dff9a';
    mm.beginPath(); mm.moveTo(0, -9); mm.lineTo(6, 7); mm.lineTo(0, 3); mm.lineTo(-6, 7); mm.closePath(); mm.fill();
    mm.restore();
    mm.restore();
    // north tick
    mm.fillStyle = '#fff'; mm.font = 'bold 11px Arial'; mm.textAlign = 'center';
    mm.fillText('N', cx, 12);
  }

  SB.hud = { init: init, show: show, toast: toast, dialog: dialog, hideDialog: hideDialog,
    setObjective: setObjective, update: update };
})(window);
