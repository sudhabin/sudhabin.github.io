/*
 * main.js - bootstraps the game, input handling and the 30 Hz game loop.
 */
(function () {
  'use strict';

  const STEP = 1000 / 30;

  function boot() {
    const assets = window.XGALAGA_ASSETS;
    const canvas = document.getElementById('game');
    const stage = document.getElementById('stage');

    if (!assets) {
      document.body.innerHTML =
        '<p style="color:#f66;font:14px monospace;padding:24px">' +
        'Could not load js/assets.js. Run "node build/build-assets.js" first.' +
        '</p>';
      return;
    }

    try {
      XGAL.loadImages(assets.images);
    } catch (err) {
      console.error(err);
      document.body.innerHTML =
        '<p style="color:#f66;font:14px monospace;padding:24px">Failed to decode game art: ' +
        err.message + '</p>';
      return;
    }

    const sound = new XGAL.Sound(assets.sounds);
    const game = new XGAL.Game(canvas, assets, sound);
    window.xgalaga = game;

    game.render();

    /* ------------------------------------------------------------ */
    /* Fullscreen                                                   */
    /* ------------------------------------------------------------ */

    function toggleFullscreen() {
      try {
        if (!document.fullscreenElement) {
          if (stage.requestFullscreen) stage.requestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      } catch (err) { /* ignore */ }
    }

    /* ------------------------------------------------------------ */
    /* Keyboard                                                     */
    /* ------------------------------------------------------------ */

    const PREVENT = new Set([
      'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab',
    ]);

    document.addEventListener('keydown', (e) => {
      sound.unlock();

      if (game.state !== 'nameentry') {
        if (e.code === 'KeyM') {
          const muted = sound.toggleMute();
          game.titleMessage = muted ? 'SOUND OFF' : 'SOUND ON';
          game.titleMessageTimer = 150;
          e.preventDefault();
          return;
        }
        if (e.code === 'KeyF') {
          toggleFullscreen();
          e.preventDefault();
          return;
        }
      }

      if (game.keyDown(e.code, e.key)) {
        e.preventDefault();
      } else if (PREVENT.has(e.code)) {
        e.preventDefault();
      }
    });

    document.addEventListener('keyup', (e) => {
      if (game.keyUp(e.code)) e.preventDefault();
      else if (PREVENT.has(e.code)) e.preventDefault();
    });

    /* ------------------------------------------------------------ */
    /* Pointer / touch                                              */
    /* ------------------------------------------------------------ */

    function canvasX(event) {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * XGAL.W;
      return Math.max(0, Math.min(XGAL.W, x));
    }

    canvas.addEventListener('pointermove', (e) => {
      game.pointerMove(canvasX(e));
    });

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sound.unlock();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      game.pointerDown(canvasX(e));
    });

    function release(e) {
      if (e && e.preventDefault) e.preventDefault();
      game.pointerUp();
    }

    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    window.addEventListener('pointerup', release);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    /* ------------------------------------------------------------ */
    /* Pause when hidden / unfocused                                */
    /* ------------------------------------------------------------ */

    window.addEventListener('blur', () => game.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) game.autoPause();
    });

    /* ------------------------------------------------------------ */
    /* Main loop (fixed 30 Hz logic)                                */
    /* ------------------------------------------------------------ */

    let last = performance.now();
    let accumulator = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);

      let delta = now - last;
      last = now;
      if (delta > 200) delta = 200;
      accumulator += delta;

      let steps = 0;
      while (accumulator >= STEP && steps < 3) {
        game.updatePad();
        game.update();
        accumulator -= STEP;
        steps++;
      }
      if (accumulator > STEP * 2) accumulator = 0;

      game.render();
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
