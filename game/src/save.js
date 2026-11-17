// save.js — localStorage save/load: cash, story progress, health, position, ammo.
(function (global) {
  'use strict';
  var SB = global.SB;
  var KEY = 'solara-bay-save-v1';

  function saveGame() {
    try {
      var p = SB.player.state;
      var m = SB.missions.state;
      var data = {
        cash: p.cash, health: p.health, armor: p.armor,
        ammo: p.ammo, reserveAmmo: p.reserveAmmo,
        missionIndex: m.index, x: p.x, z: p.z,
        savedAt: Date.now()
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  function loadGame() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function applySave(data) {
    if (!data) return false;
    var p = SB.player.state;
    p.cash = data.cash || 0;
    p.health = data.health || 100;
    p.armor = data.armor || 0;
    p.ammo = data.ammo !== undefined ? data.ammo : 12;
    p.reserveAmmo = data.reserveAmmo !== undefined ? data.reserveAmmo : 48;
    p.x = data.x !== undefined ? data.x : -140;
    p.z = data.z !== undefined ? data.z : 120;
    SB.missions.state.index = data.missionIndex || 0;
    return true;
  }

  function hasSave() { return !!loadGame(); }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) {} }

  SB.save = { saveGame: saveGame, loadGame: loadGame, applySave: applySave,
    hasSave: hasSave, clearSave: clearSave, KEY: KEY };
})(window);
