# Solara Bay — Open World Crime

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Mansyur0523/makefun-gta6-01/rank.svg)](https://make.fun/c/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Mansyur0523/makefun-gta6-01/reward.svg)](https://make.fun/c/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/c/gta6-01). No Rockstar names, art,
music or map — everything (city, characters, story, vehicles, sounds) is
original and made for this game.

## The game

You are **Rico Vale**, fresh off the ferry in **Solara Bay**, a sun-soaked
coastal city. Mara Voss runs the town from her garage on Coral Row, and she
has work for you.

- **Open world on foot and by car** — a 600×600 m city grid with downtown
  towers, shops with neon signs, palms, a beach and a pier.
- **Traffic and pedestrians** — 16 AI traffic cars follow the road grid,
  26 pedestrians stroll the sidewalks and flee gunfire.
- **Steal and drive** — walk up to any parked or traffic car, press E, and
  drive it. 8 original car models with arcade handling.
- **Wanted level and police** — crimes raise 1–5 stars; SBPD interceptors
  chase and ram you, foot cops try to bust you. Lose them to cool off.
- **Missions and a story** — 5 story missions (steal a car, a pier pickup,
  a heat run, a gang payback, a bank-truck heist) with dialogue, waypoints
  and payouts, plus taxi-fare and package-run side jobs.
- **Combat** — pistol with raycast shooting, tracers and muzzle flash,
  melee punches, gangsters who shoot back, health/armor/cash pickups.
- **HUD and minimap** — cash, health, armor, wanted stars, game clock,
  mission objective with live distance, and a circular radar minimap with
  roads, buildings, police, enemies and the mission marker.
- **Start screen, pause menu and save** — progress (cash, missions, health,
  position) saves to localStorage, automatically after each mission.
- **Sound** — every sound is synthesized live with WebAudio: engine hum,
  two-tone sirens, gunshots, a synth loop. No audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Run / handbrake |
| Mouse drag / wheel | Look around / zoom camera |
| E | Enter or steal a car (or start a mission at the garage) |
| Click | Shoot pistol |
| F | Punch |
| R | Reload |
| 1 / 2 | Pistol / fists |
| C | Camera mode |
| M | Mute |
| Esc | Pause menu and save |

## Play it

Serve `game/` with any static server and open `game/index.html` in desktop
Chrome — no network request, no build step:

```sh
node serve.ts
# open http://localhost:8080
```

Screenshot staging modes (deterministic, used for the entry's screenshots):

- `?shot=chase` — police chase, wanted 3, mission objective live
- `?shot=street` — on foot downtown, traffic and pedestrians
- `?shot=drive` — cruising the boulevard
- `?shot=menu` — start screen over the city

## Tech

- three.js r128, vendored as `game/vendor/three.min.js`
- Plain static files: `game/index.html` + one module per system under
  `game/src/` (`city`, `vehicles`, `pedestrians`, `player`, `police`,
  `combat`, `missions`, `hud`, `audio`, `save`, `utils`, `main`)
- All textures are drawn on canvas at runtime; all sounds are synthesized

## License

MIT — see [LICENSE](LICENSE).
