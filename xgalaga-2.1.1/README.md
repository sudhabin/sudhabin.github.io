# XGalaga 2.1.1 — HTML5 port

A browser-playable port of [XGalaga 2.1.1](http://rumsey.org/xgal.html) by Joe Rumsey,
written in plain HTML, CSS and JavaScript. It uses the original XPM artwork,
`.xgl` level files and 8 kHz `.raw` sound samples from the 2.1.1 release.

The game runs directly from `index.html`; all art, levels and sounds are embedded
in `js/assets.js`, so no web server or build step is required.

## Play

Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari).

If your browser blocks local files for any reason, serve the folder instead:

```powershell
# from this directory
python -m http.server 8000
# then open http://localhost:8000/
```

### Controls

| Action | Keyboard | Mouse / touch | Gamepad |
| --- | --- | --- | --- |
| Move | Left/Right arrows or A/D | Move the pointer | Left stick |
| Fire | Space or J (hold for auto-fire) | Hold the pointer down | A / button 0 |
| Activate shield | X | — | B / button 1 |
| Pause | P or Esc | — | Start |
| Sound on/off | M | — | — |
| Fullscreen | F | — | — |
| Quit to title | Q | — | — |

On the title screen, press Space/Enter or click/tap to start. High-score initials
are entered with A–Z, Backspace deletes and Enter accepts.

## Features

- Original 468×596 playfield and 24-pixel HUD, rendered at 2× with pixel-perfect scaling.
- Fixed 30 Hz game logic, matching the original frame rate.
- All 15 original level layouts; levels repeat with faster aliens and tighter turns.
- Original alien entry paths, convoy movement, peeling attacks, escort behaviour and
  enemy fire.
- Single, double, triple, spread and machine-gun shots; speed-ups, shields, smart
  bombs, lemons and extra bullets.
- Flagship escort scoring, score bubbles, extra ships at 20,000 and every 50,000.
- Five-entry high-score table stored in `localStorage`.
- WebAudio playback of the original sound effects, with a mute toggle.
- Keyboard, mouse, touch and gamepad input, plus fullscreen support.

## Project layout

```
index.html              page shell and script order
css/style.css           responsive 468:620 layout, scanlines, fullscreen
js/assets.js            generated: base64/text art, levels and sounds
js/xpm.js               XPM parser and sprite cache
js/levels.js            .xgl level parser and attack-path tables
js/audio.js             WebAudio playback of the original samples
js/game.js              game logic, input state and canvas renderer
js/main.js              bootstrap, input wiring and fixed-step loop
build/build-assets.js   regenerates js/assets.js from the original source
COPYING                 GNU GPL v2
```

## Rebuilding the assets

`js/assets.js` is generated. To rebuild it you need the original XGalaga 2.1.1
source tree next to this project:

```
Opencode/
  xgalaga-2.1.1.0/      original C source, images, levels, sounds
  xgalaga-2.1.1-web/    this project
```

Then run:

```powershell
node build/build-assets.js
```

The script reads `../xgalaga-2.1.1.0/images/*.xpm`, `levels/*.xgl` and
`sounds/*.raw`, and writes `js/assets.js`.

Two prize sprites (`pr_spread` and `pr_machine`) are referenced by the 2.1.1
source but are not included in the release archive. The build script draws simple
stand-ins in the same 15×10 XPM style so those prizes still have artwork.

## Notes

- The game uses classic `<script>` tags (not ES modules) so `file://` loading works.
- High scores use the `xgalaga-web.highscores` local-storage key.
- Sound mute uses the `xgalaga.muted` local-storage key.
- The port focuses on the core arcade gameplay. Command-line options and the
  original demo/attract mode are not included.
- The game auto-pauses when the window loses focus or the tab is hidden.

## Credits

Original XGalaga by **Joe Rumsey**, with contributions from Bill Dyess,
Rob Forsman, Sujal Patel, Paul Kendall, Mike McGrath and others. See the
original `CREDITS` file in the 2.1.1 source for the full list.

This HTML5 port reuses the original artwork, level data and sound samples and is
distributed under the **GNU General Public License, version 2**. See `COPYING`.
