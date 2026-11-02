# Minesweeper — Windows 2000 edition (web)

A dependency-free recreation of the classic Minesweeper game, wrapped in a
Windows 2000 style desktop with a taskbar, Start menu and draggable windows.

Inspired by [AlexAegis/minesweeper](https://github.com/AlexAegis/minesweeper).
This version is plain HTML, CSS and JavaScript: no frameworks, no packages,
no build step.

## Play

Just open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8000
# then visit http://localhost:8000
```

On screens 1000px and wider the desktop defaults to a 150% scale, matching a
comfortable 150% browser zoom. Use your browser's own zoom if you want it
larger or smaller; phones and small windows keep the fitted layout.

## Deploy to GitHub Pages

1. Create a repository (or use an existing one).
2. Upload `index.html`, `style.css`, `app.js`, `README.md` and `.nojekyll`
   to the repository root.
3. In the repository, go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**,
   select the `main` branch and the `/ (root)` folder, then save.
5. GitHub will publish the site at `https://<your-user>.github.io/<repo>/`.

There is no build step and all asset URLs are relative, so the game also works
from a project subpath.

## Features

- Classic Beginner (9×9, 10 mines), Intermediate (16×16, 40 mines) and
  Expert (30×16, 99 mines) presets, plus custom fields up to 50×50.
- Safe first click, flood reveal, flags, question marks, chording and a
  working timer.
- Best times for each preset, saved in `localStorage`.
- Windows 2000 desktop: draggable/minimizable windows, taskbar, Start menu,
  desktop icons and a live clock.
- Responsive board sizing for small screens, with touch controls
  (tap to reveal, long-press to flag).
- Keyboard shortcuts: `F2` new game, `F1` help, `Esc` close menus/dialogs.

## Controls

| Action | Control |
| --- | --- |
| Reveal a square | Left click / tap |
| Flag a square | Right click / long-press |
| Question mark | Right click a flagged square |
| Chord (open neighbours) | Double-click a number, both mouse buttons, or middle-click |
| New game | Smiley face, `F2`, or **Game → New** |

## Files

- `index.html` — desktop, windows, dialogs and SVG icons.
- `style.css` — Windows 2000 chrome, game board and responsive layout.
- `app.js` — game logic, window manager, menus, high scores and input handling.

## Credits

- Inspired by Alex Aegis's
  [Minesweeper](https://github.com/AlexAegis/minesweeper) (MIT), which recreates
  the Windows 98/2000 classic with Svelte and RxJS.
- Minesweeper itself is a classic Microsoft game. This project is an
  independent, non-commercial tribute.
