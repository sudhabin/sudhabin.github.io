/*
 * game.js - browser shell for the XGalaga++ engine.
 *
 * Fixed 50 Hz simulation (the original's default), canvas rendering,
 * start menu, high scores, keyboard and touch controls.
 */
(function () {
  'use strict';

  var XG = window.XG;
  var Config = XG.Config;
  var Sfx = window.Sfx;
  var PixKeeper = window.XGPix.Keeper;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var modalEl = document.getElementById('score-modal');
  var scoreForm = document.getElementById('score-form');
  var finalScoreEl = document.getElementById('final-score');
  var pilotInput = document.getElementById('pilot-name');
  var scoreSkip = document.getElementById('score-skip');
  var pauseButton = document.querySelector('[data-action="pause"]');
  var muteButton = document.querySelector('[data-action="mute"]');

  var SIZES = [
    [640, 480],
    [800, 600],
    [1024, 768],
    [1280, 1024],
    [1600, 1200]
  ];
  var TICK_HZ = 50;                // original's default refresh/logic rate
  var STEP = 1000 / TICK_HZ;       // fixed logic step, in milliseconds
  var STORAGE = {
    scores: 'xgalaga.scores.v1',
    pilot: 'xgalaga.pilot.v1',
    size: 'xgalaga.size.v1',
    crt: 'xgalaga.crt.v1'
  };

  var state = 'menu';
  var menuPage = 'help';
  var game = null;
  var stars = null;
  var scores = [];
  var pilot = 'PLAYER';
  var notice = null;
  var modalOpen = false;
  var pendingScore = 0;
  var crt = false;

  var held = new Set();
  var lastHorizontal = -1;
  var pointer = { active: false, id: null, x: 0 };

  var lastFrame = 0;
  var accumulator = 0;
  var clock = 0;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  function storageGet(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function pad(value, length) {
    return String(value).padStart(length, '0');
  }

  function formatDate(timestamp) {
    var date = new Date(timestamp);
    if (isNaN(date.getTime())) return '----------';
    return date.getFullYear() + '-' +
           pad(date.getMonth() + 1, 2) + '-' +
           pad(date.getDate(), 2);
  }

  function notify(message) {
    notice = { text: message, ttl: 70 };
  }

  /* ------------------------------------------------------------------ */
  /* Setting the logical screen size                                    */
  /* ------------------------------------------------------------------ */

  function applySize(index, silent) {
    index = clamp(index, 0, SIZES.length - 1);
    Config.sizeIndex = index;
    Config.width = SIZES[index][0];
    Config.height = SIZES[index][1];
    canvas.width = Config.width;
    canvas.height = Config.height;
    ctx.imageSmoothingEnabled = false;
    if (game) game.resize();
    storageSet(STORAGE.size, String(index));
    if (!silent) notify('screen ' + Config.width + ' x ' + Config.height + '  [1-5]');
  }

  function adjustDetails(delta) {
    var next = clamp(Config.details + delta, 0, Config.maxDetails);
    if (next === Config.details) return;
    Config.details = next;
    notify('details ' + Config.details + ' / ' + Config.maxDetails + '  [+/-]');
  }

  /* ------------------------------------------------------------------ */
  /* High scores                                                        */
  /* ------------------------------------------------------------------ */

  function loadScores() {
    scores = [];
    try {
      var parsed = JSON.parse(storageGet(STORAGE.scores, '[]'));
      if (!Array.isArray(parsed)) return;
      scores = parsed.filter(function (entry) {
        return entry && typeof entry.score === 'number' && isFinite(entry.score) &&
               entry.score >= 0;
      }).map(function (entry) {
        return {
          score: Math.floor(entry.score),
          name: String(entry.name || 'PLAYER').slice(0, 12),
          date: Number(entry.date) || 0,
          size: String(entry.size || '')
        };
      }).sort(function (a, b) { return b.score - a.score; }).slice(0, 10);
    } catch (e) {
      scores = [];
    }
  }

  function saveScores() {
    storageSet(STORAGE.scores, JSON.stringify(scores));
  }

  function qualifies(score) {
    if (score <= 0) return false;
    if (scores.length < 10) return true;
    return score >= scores[scores.length - 1].score;
  }

  function addScore(score, name) {
    scores.push({
      score: score,
      name: name || 'PLAYER',
      date: Date.now(),
      size: Config.width + 'x' + Config.height
    });
    scores.sort(function (a, b) { return b.score - a.score; });
    scores = scores.slice(0, 10);
    saveScores();
  }

  function setPilot(name) {
    pilot = (String(name || '').trim().toUpperCase().slice(0, 12)) || 'PLAYER';
    storageSet(STORAGE.pilot, pilot);
  }

  function bestScore() {
    return scores.length ? scores[0].score : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Star fields (port of stars.cc)                                     */
  /* ------------------------------------------------------------------ */

  function StarField(speed) {
    this.speed = speed;
    this.stars = [];
    var value = Math.min(65535, 20000 + speed * speed * 5000);
    var gray = Math.round(value / 257);
    this.color = 'rgb(' + gray + ',' + gray + ',' + gray + ')';
  }

  StarField.prototype.scroll = function (shared) {
    var i;
    for (i = 0; i < this.stars.length; ++i) this.stars[i].y += this.speed;
    while (this.stars.length && this.stars[0].y >= Config.height) this.stars.shift();
    if (shared.count++ & 1) {
      this.stars.push({ x: Math.floor(Math.random() * Config.width),
                        y: Math.floor(Math.random() * this.speed) });
    }
  };

  StarField.prototype.draw = function () {
    ctx.fillStyle = this.color;
    for (var i = 0; i < this.stars.length; ++i) {
      ctx.fillRect(Math.round(this.stars[i].x), Math.round(this.stars[i].y), 1, 1);
    }
  };

  function StarFieldSet() {
    this.fields = [new StarField(1), new StarField(2), new StarField(3)];
    this.count = 0;
  }

  StarFieldSet.prototype.scroll = function () {
    var number = Math.trunc(3 * Config.details / Config.maxDetails);
    for (var i = 0; i < number; ++i) this.fields[i].scroll(this);
  };

  StarFieldSet.prototype.draw = function () {
    for (var i = 0; i < this.fields.length; ++i) this.fields[i].draw();
  };

  /* ------------------------------------------------------------------ */
  /* Canvas text helpers                                                */
  /* ------------------------------------------------------------------ */

  function setFont(size, weight) {
    ctx.font = (weight || '') + ' ' + Math.max(6, Math.round(size)) +
               'px "Courier New", "Lucida Console", Consolas, monospace';
  }

  function textLine(value, x, y, color, size, weight, align, baseline) {
    ctx.fillStyle = color;
    setFont(size, weight);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(value, x, y);
  }

  function glowText(value, x, y, size, color, blur) {
    ctx.save();
    setFont(size, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function cycleColor(now) {
    var green = Math.round(80 + (Math.sin(now * 2.6) + 1) * 87);
    return 'rgb(200,' + green + ',255)';
  }

  function drawRule(y, u) {
    var gradient = ctx.createLinearGradient(Config.width / 2 - 260 * u, 0,
                                            Config.width / 2 + 260 * u, 0);
    gradient.addColorStop(0, 'rgba(140,150,255,0)');
    gradient.addColorStop(0.5, 'rgba(140,150,255,0.34)');
    gradient.addColorStop(1, 'rgba(140,150,255,0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Config.width / 2 - 260 * u, y);
    ctx.lineTo(Config.width / 2 + 260 * u, y);
    ctx.stroke();
  }

  function drawPrompt(now, y, u) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now * 3.1));
    textLine('PRESS ENTER, S OR TAP TO START', Config.width / 2, y,
             '#f1f1ff', 14 * u, 'bold', 'center');
    ctx.restore();
  }

  function drawCredit(u) {
    textLine('XGalaga++ v0.9 by Marc Mongenet  \u00b7  GPL  \u00b7  art from XGalaga 2.0.34',
             Config.width / 2, 570 * u, '#5d6192', 9.5 * u, 'normal', 'center');
  }

  function drawTitle(now) {
    var u = Config.height / 600;
    var cx = Config.width / 2;
    var size = 44 * u;
    ctx.save();
    setFont(size, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var width = ctx.measureText('XGALAGA++').width;
    var gradient = ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
    gradient.addColorStop(0, '#6ff7ff');
    gradient.addColorStop(0.48, '#b18cff');
    gradient.addColorStop(1, '#ff6ad5');
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(140,120,255,0.9)';
    ctx.shadowBlur = size * 0.42;
    ctx.fillText('XGALAGA++', cx, 68 * u);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Menu screens                                                       */
  /* ------------------------------------------------------------------ */

  function drawHelp(now) {
    var u = Config.height / 600;
    var cx = Config.width / 2;
    var body = cycleColor(now);

    drawTitle(now);
    textLine('W E B   E D I T I O N', cx, 100 * u, '#78f4ff', 11 * u, 'bold', 'center');
    textLine('a faithful browser port of the X11 arcade classic', cx, 121 * u,
             '#7d82bb', 10.5 * u, 'normal', 'center');
    drawRule(140 * u, u);

    textLine('welcome, pilot ' + pilot + '        best ' + pad(bestScore(), 5),
             cx, 161 * u, body, 12.5 * u, 'bold', 'center');

    var x1 = cx - 255 * u;
    var x2 = cx - 105 * u;
    textLine('CONTROLS', x1, 191 * u, '#aeb2ff', 10.5 * u, 'bold');

    var rows = [
      ['MOVE', 'A / D   or   LEFT / RIGHT'],
      ['FIRE', 'SPACE / Z   (hold)'],
      ['PAUSE', 'P   or   ESC'],
      ['SCORES', 'H   (menu)'],
      ['TOUCH', 'DRAG TO MOVE  \u00b7  AUTO-FIRE'],
      ['VIEW', '1-5 SIZE    +/- DETAILS    V SCANLINES'],
      ['SYSTEM', 'M MUTE    F FULLSCREEN']
    ];
    var y = 216 * u;
    for (var i = 0; i < rows.length; ++i) {
      textLine(rows[i][0], x1, y, '#ececff', 11.5 * u, 'bold');
      textLine(rows[i][1], x2, y, body, 12.5 * u, 'normal');
      y += 21 * u;
    }

    textLine('BONUS', x1, 373 * u, '#aeb2ff', 10.5 * u, 'bold');
    var bonusRows = [
      [['bonus_speed', 'extra speed'], ['bonus_fire', 'extra fire']],
      [['bonus_shield', 'extra shield'], ['bonus_multi', 'multi fire']]
    ];
    var iconLeft = cx - 238 * u;
    var iconRight = cx + 16 * u;
    var rowY = 399 * u;
    for (var r = 0; r < bonusRows.length; ++r) {
      PixKeeper.get(bonusRows[r][0][0]).draw(ctx, iconLeft, rowY);
      textLine(bonusRows[r][0][1], iconLeft + 14 * u, rowY, body, 12 * u);
      PixKeeper.get(bonusRows[r][1][0]).draw(ctx, iconRight, rowY);
      textLine(bonusRows[r][1][1], iconRight + 14 * u, rowY, body, 12 * u);
      rowY += 24 * u;
    }

    drawPrompt(now, 470 * u, u);
    drawCredit(u);
  }

  function drawScores(now) {
    var u = Config.height / 600;
    var cx = Config.width / 2;
    var body = cycleColor(now);

    textLine('XGALAGA++', cx, 25 * u, '#6f74a8', 10.5 * u, 'bold', 'center');
    glowText('HIGH SCORES', cx, 62 * u, 32 * u, '#d9d9ff', 14 * u);
    textLine('top 10 runs  \u00b7  saved on this device', cx, 92 * u,
             '#7d82bb', 10.5 * u, 'normal', 'center');
    drawRule(112 * u, u);

    var left = cx - 280 * u;
    var scoreRight = cx - 130 * u;
    var dateX = cx - 105 * u;
    var nameX = cx + 18 * u;

    textLine('RK', left, 140 * u, '#858ac4', 10 * u, 'bold');
    textLine('SCORE', scoreRight, 140 * u, '#858ac4', 10 * u, 'bold', 'right');
    textLine('DATE', dateX, 140 * u, '#858ac4', 10 * u, 'bold');
    textLine('PILOT', nameX, 140 * u, '#858ac4', 10 * u, 'bold');

    if (!scores.length) {
      textLine('no scores yet - be the first!', cx, 260 * u,
               body, 14 * u, 'bold', 'center');
    } else {
      var rankColors = ['#ffe28a', '#dcdeff', '#e6aa7e'];
      for (var i = 0; i < scores.length; ++i) {
        var rowY = 172 * u + i * 23 * u;
        var color = i < rankColors.length ? rankColors[i] : body;
        textLine(String(i + 1).padStart(2, ' '), left, rowY, color, 13 * u, 'bold');
        textLine(pad(scores[i].score, 6), scoreRight, rowY, color, 13 * u, 'bold', 'right');
        textLine(formatDate(scores[i].date), dateX, rowY, '#858ac4', 11 * u, 'normal');
        textLine(scores[i].name, nameX, rowY, color, 13 * u, 'bold');
      }
    }

    textLine('H  or  SCORES button  -  back to help', cx, 432 * u,
             '#7d82bb', 10.5 * u, 'normal', 'center');
    drawPrompt(now, 482 * u, u);
    drawCredit(u);
  }

  /* ------------------------------------------------------------------ */
  /* In-game rendering                                                  */
  /* ------------------------------------------------------------------ */

  function drawHud() {
    if (!game) return;
    var u = Config.height / 600;
    /* The original HUD used repeated 0xBB (Latin-1 chevrons) for shields;
       modern fonts draw these as crisp marks instead of blurry hearts. */
    var shields = '\u00bb'.repeat(Math.min(24, Math.max(0, game.shield)));
    var label = 'level: ' + String(game.level).padStart(2, ' ') +
                '  score: ' + String(game.score).padStart(4, '0') +
                '   shield: ' + shields;
    textLine(label, 6 * u, Config.height - 11 * u,
             'rgb(198,198,255)', 13 * u, 'bold');
  }

  function drawLevelFlash() {
    var u = Config.height / 600;
    glowText('LEVEL ' + game.level, Config.width / 2, Config.height / 2,
             22 * u, 'rgba(201,201,255,0.95)', 14 * u);
  }

  function drawGame() {
    if (!game) return;
    var i;
    for (i = 0; i < game.aliens.aliens.length; ++i) game.aliens.aliens[i].draw(ctx);
    game.bonuses.draw(ctx);
    if (!game.player.dead) game.player.draw(ctx);
    game.bullets.draw(ctx);
    game.bombs.draw(ctx);
    game.explosions.draw(ctx);
    drawHud();
    if (game.levelFlash > 0) drawLevelFlash();
  }

  function drawPauseOverlay() {
    var u = Config.height / 600;
    ctx.fillStyle = 'rgba(0,0,0,0.56)';
    ctx.fillRect(0, 0, Config.width, Config.height);
    glowText('PAUSED', Config.width / 2, Config.height * 0.42,
             36 * u, '#dcdcff', 18 * u);
    textLine('P / ESC / tap to resume', Config.width / 2, Config.height * 0.53,
             '#9a9fd4', 12.5 * u, 'bold', 'center');
  }

  function drawGameOverOverlay() {
    var u = Config.height / 600;
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, Config.width, Config.height);
    glowText('GAME OVER', Config.width / 2, Config.height * 0.36,
             38 * u, '#ff7bd5', 20 * u);
    textLine('SCORE ' + pad(game.score, 5), Config.width / 2, Config.height * 0.47,
             '#ffe28a', 20 * u, 'bold', 'center');
    if (game.overQualifies) {
      textLine('NEW HIGH SCORE', Config.width / 2, Config.height * 0.56,
               '#8ff8ff', 13 * u, 'bold', 'center');
    } else {
      textLine('returning to the menu...', Config.width / 2, Config.height * 0.56,
               '#8f95c9', 12 * u, 'normal', 'center');
    }
  }

  function drawNotice() {
    if (!notice || notice.ttl <= 0) return;
    var u = Config.height / 600;
    ctx.save();
    ctx.globalAlpha = Math.min(1, notice.ttl / 22);
    textLine(notice.text, Config.width / 2, 18 * u,
             '#ffe28a', 10.5 * u, 'bold', 'center');
    ctx.restore();
  }

  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, Config.width, Config.height);
    stars.draw();

    if (state === 'menu') {
      if (menuPage === 'scores') drawScores(clock);
      else drawHelp(clock);
    } else {
      drawGame();
      if (state === 'paused') drawPauseOverlay();
      if (state === 'gameover') drawGameOverOverlay();
    }
    drawNotice();
  }

  /* ------------------------------------------------------------------ */
  /* Simulation update                                                  */
  /* ------------------------------------------------------------------ */

  function updatePlaying() {
    if (!game) return;
    var alive = game.update();
    if (!alive) {
      endGame();
      return;
    }

    stars.scroll();
    if (game.levelFlash > 0) {
      --game.levelFlash;
      stars.scroll();
      stars.scroll();
    }

    game.aliens.move();
    game.bonuses.move();
    if (pointer.active) game.player.follow(pointer.x);
    else game.player.move(direction());
    game.bullets.move();
    game.bombs.move();
    game.aliens.fire();
    if (firing()) game.player.fire();
    game.explosions.move();
  }

  function updateGameOver() {
    if (!game || modalOpen) return;
    ++game.overTicks;
    if (game.overQualifies) {
      if (game.overTicks >= 70) openScoreModal();
    } else if (game.overTicks >= 150) {
      goMenu('scores');
    }
  }

  function update() {
    if (notice && notice.ttl > 0) --notice.ttl;
    if (modalOpen) return;
    if (state === 'menu') {
      stars.scroll();
    } else if (state === 'playing') {
      updatePlaying();
    } else if (state === 'gameover') {
      stars.scroll();
      updateGameOver();
    }
  }

  function loop(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    var delta = timestamp - lastFrame;
    lastFrame = timestamp;
    if (delta > 250) delta = 250;
    clock = timestamp / 1000;
    accumulator += delta;

    var steps = 0;
    while (accumulator >= STEP && steps < 5) {
      update();
      accumulator -= STEP;
      ++steps;
    }
    if (steps === 5) accumulator = 0;

    render();
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                              */
  /* ------------------------------------------------------------------ */

  function direction() {
    var left = held.has('ArrowLeft') || held.has('KeyA');
    var right = held.has('ArrowRight') || held.has('KeyD');
    if (left && !right) return -1;
    if (right && !left) return 1;
    if (left && right) return lastHorizontal;
    return 0;
  }

  function firing() {
    return pointer.active || held.has('Space') || held.has('KeyZ') || held.has('KeyK');
  }

  function togglePause() {
    if (state === 'playing') {
      setState('paused');
      held.clear();
      pointer.active = false;
      if (Sfx) Sfx.pause();
    } else if (state === 'paused') {
      setState('playing');
      accumulator = 0;
      lastFrame = performance.now();
      if (Sfx) Sfx.pause();
    }
  }

  function startGame() {
    if (Sfx) { Sfx.unlock(); Sfx.start(); }
    held.clear();
    pointer.active = false;
    game = XG.createGame();
    menuPage = 'help';
    notice = null;
    accumulator = 0;
    lastFrame = performance.now();
    setState('playing');
  }

  function endGame() {
    if (!game) return;
    pointer.active = false;
    game.overTicks = 0;
    game.overQualifies = !game.cheated && qualifies(game.score);
    setState('gameover');
    if (Sfx) Sfx.gameOver();
  }

  function goMenu(page) {
    setState('menu');
    menuPage = page || 'help';
    game = null;
    pointer.active = false;
    held.clear();
    notice = null;
    accumulator = 0;
  }

  function openScoreModal() {
    if (modalOpen || !game) return;
    pendingScore = game.score;
    finalScoreEl.textContent = String(pendingScore);
    pilotInput.value = pilot;
    modalEl.hidden = false;
    modalOpen = true;
    setTimeout(function () {
      pilotInput.focus();
      pilotInput.select();
    }, 30);
  }

  function closeScoreModal() {
    modalEl.hidden = true;
    modalOpen = false;
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function saveModalScore(event) {
    if (event) event.preventDefault();
    setPilot(pilotInput.value);
    addScore(pendingScore, pilot);
    pendingScore = 0;
    closeScoreModal();
    if (Sfx) Sfx.bonus();
    goMenu('scores');
  }

  function skipModalScore() {
    pendingScore = 0;
    closeScoreModal();
    goMenu('scores');
  }

  function setState(next) {
    state = next;
    document.body.classList.remove('state-menu', 'state-playing',
                                   'state-paused', 'state-gameover');
    document.body.classList.add('state-' + next);
    document.body.classList.toggle('playing', next === 'playing');
    pauseButton.textContent = next === 'paused' ? 'RESUME' : 'PAUSE';
  }

  function toggleMute() {
    if (!Sfx) return;
    var muted = Sfx.toggle();
    muteButton.textContent = muted ? 'MUTED' : 'SOUND';
    notify(muted ? 'sound muted  [M]' : 'sound on  [M]');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {
        notify('fullscreen is not available');
      });
    }
  }

  function toggleCrt() {
    crt = !crt;
    document.body.classList.toggle('crt', crt);
    storageSet(STORAGE.crt, crt ? '1' : '0');
    notify('scanlines ' + (crt ? 'on' : 'off') + '  [V]');
  }

  function toggleScores() {
    if (state === 'menu') {
      menuPage = menuPage === 'scores' ? 'help' : 'scores';
      if (Sfx) Sfx.click();
    } else if (state === 'gameover' && !modalOpen) {
      goMenu('scores');
    } else {
      notify('high scores are shown in the menu');
    }
  }

  window.addEventListener('keydown', function (event) {
    if (Sfx) Sfx.unlock();
    if (modalOpen) return;

    var code = event.code;
    if (code === 'ArrowLeft' || code === 'ArrowRight' ||
        code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown') {
      event.preventDefault();
    }

    if (code === 'ArrowLeft' || code === 'KeyA') {
      held.add(code);
      lastHorizontal = -1;
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      held.add(code);
      lastHorizontal = 1;
    } else if (code === 'Space' || code === 'KeyZ' || code === 'KeyK') {
      held.add(code);
    }

    if (event.repeat) return;

    var key = event.key;

    if (state === 'menu') {
      if (key === 'Enter' || key === 's' || key === 'S' || code === 'Space') {
        event.preventDefault();
        startGame();
        return;
      }
      if (key === 'h' || key === 'H') { toggleScores(); return; }
    }

    if (state === 'gameover' && !modalOpen) {
      if (key === 'Enter' || key === 's' || key === 'S' || key === 'h' || key === 'H') {
        event.preventDefault();
        goMenu('scores');
        return;
      }
      if (code === 'Space') return; // handled by the next tap/key
    }

    if (key === 'p' || key === 'P' || key === 'Escape') {
      if (state === 'playing' || state === 'paused') togglePause();
      else if (state === 'gameover' && !modalOpen && key !== 'Escape') goMenu('scores');
      return;
    }

    if (key === 'h' || key === 'H') { toggleScores(); return; }
    if (key === 'm' || key === 'M') { toggleMute(); return; }
    if (key === 'f' || key === 'F') { toggleFullscreen(); return; }
    if (key === 'v' || key === 'V') { toggleCrt(); return; }

    if (key >= '1' && key <= '5') {
      applySize(Number(key) - 1, false);
      return;
    }
    if (key === '+' || key === '=') { adjustDetails(1); return; }
    if (key === '-' || key === '_') { adjustDetails(-1); return; }

    if ((key === 'c' || key === 'C') && state === 'playing' && game) {
      game.cheatRequested = true;
      if (Sfx) Sfx.extra();
    }
  });

  window.addEventListener('keyup', function (event) {
    held.delete(event.code);
  });

  window.addEventListener('blur', function () {
    held.clear();
    pointer.active = false;
    if (state === 'playing') togglePause();
  });

  function eventX(event) {
    var rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * Config.width;
  }

  canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });

  canvas.addEventListener('pointerdown', function (event) {
    if (Sfx) Sfx.unlock();
    if (modalOpen) return;
    event.preventDefault();

    if (state === 'menu') {
      startGame();
      pointer.active = true;
      pointer.id = event.pointerId;
      pointer.x = eventX(event);
      try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      return;
    }
    if (state === 'paused') {
      togglePause();
      return;
    }
    if (state === 'gameover') {
      if (game && game.overQualifies) openScoreModal();
      else goMenu('scores');
      return;
    }
    if (state === 'playing') {
      pointer.active = true;
      pointer.id = event.pointerId;
      pointer.x = eventX(event);
      try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
    }
  });

  window.addEventListener('pointermove', function (event) {
    if (pointer.active && event.pointerId === pointer.id) {
      pointer.x = eventX(event);
    }
  });

  function releasePointer(event) {
    if (event.pointerId === pointer.id) {
      pointer.active = false;
      pointer.id = null;
    }
  }

  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);

  /* ------------------------------------------------------------------ */
  /* Toolbar and modal                                                  */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll('#toolbar [data-action]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (Sfx) Sfx.unlock();
      var action = button.getAttribute('data-action');
      if (action === 'scores') toggleScores();
      else if (action === 'pause') {
        if (state === 'playing' || state === 'paused') togglePause();
        else notify('pause is available while playing');
      } else if (action === 'mute') toggleMute();
      else if (action === 'fullscreen') toggleFullscreen();
      button.blur();
    });
  });

  scoreForm.addEventListener('submit', saveModalScore);
  scoreSkip.addEventListener('click', skipModalScore);
  modalEl.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      skipModalScore();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  function loadSettings() {
    pilot = (storageGet(STORAGE.pilot, 'PLAYER') || 'PLAYER').slice(0, 12);
    crt = storageGet(STORAGE.crt, '0') === '1';
    document.body.classList.toggle('crt', crt);
    if (muteButton && Sfx) {
      muteButton.textContent = Sfx.isMuted() ? 'MUTED' : 'SOUND';
    }
    var storedSize = Number(storageGet(STORAGE.size, '1'));
    if (!(storedSize >= 0 && storedSize < SIZES.length)) storedSize = 1;
    applySize(storedSize, true);
  }

  function boot() {
    loadScores();
    loadSettings();
    stars = new StarFieldSet();
    setState('menu');
    requestAnimationFrame(loop);

    // A tiny read-only hook, handy for debugging from the console.
    window.XGALAGA = {
      state: function () { return state; },
      game: function () { return game; },
      scores: function () { return scores.slice(); },
      start: startGame
    };
  }

  boot();
})();
