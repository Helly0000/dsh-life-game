# dsh-life-game

Conway's Game of Life for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) — a sidebar panel row and a full centre-column board.

[中文说明](README.zh.md)

## What it adds

| Seat | What you get |
| --- | --- |
| `sidebar.panellist` / `life-game` | A sidebar row (glider glyph; the sidebar owns the button and its label) |
| `main` / `life-game` | The board fills the centre column, auto-fitted to it |
| `shell.overlay` / `life-game-float` | An optional floating window, for watching while you chat |

## Features

- **Four rules**: B3/S23 (Life), B36/S23 (HighLife), B3678/S34678 (Day & Night), B2/S (Seeds).
- **Draw on the board**: drag to paint, right-click to erase, alt-drag to erase.
- **Pattern library**: glider, LWSS, Gosper glider gun, R-pentomino, acorn, pulsar, diehard — pick one and click to place it, with a translucent preview under the cursor.
- **Two independent knobs**: the *board* (Fit / 40×24 / 64×38 / 98×58 / 140×84) and the *cell* size in px. With a preset board the zoom only scales the view; while fitted it also changes how many cells fit.
- **Live readouts**: generation, population, peak, density, board size, and a population sparkline. Newborn cells flash.
- **Torus or dead edge**, 1–120 generations per second, single-step, random soup, clear, and reset-to-seed.
- **Bilingual** (zh/en) through the host locale service, following the active language live.
- **Preferences persist** (board, zoom, speed, rule, edge, float position and running state).

## Install

```bash
dsh plugin --profile web add /absolute/path/to/life-plugin
```

Then restart `dsh` once so the profile recomposes its bundle list.

## Development

```bash
node build.mjs            # src/ -> lib/
node test/life.spec.mjs   # the simulation, the seats, preferences, i18n
node test/bundle.spec.mjs # the built bundle, mounted in a fake page
```

`src/game.js` is one plain-JavaScript body shared by two hosts: the dynamic Cordis
runner (`new Function(...)`, `React` as a closure symbol, nothing durable) and this
package's browser bundle (`window.__ModuleLoader__.load`, `require("react")`,
`LIFE_DURABLE` on). `build.mjs` is the only difference between them.

## Notes

- The board runs on the client's Cordis `timer` service and paints with canvas 2D.
- Preferences live in the browser's `localStorage` (key `dsh-life-game:prefs`) —
  they are view state, not plugin configuration. The dynamic package writes none.
- No network, no host service, no filesystem access.

MIT licensed.
