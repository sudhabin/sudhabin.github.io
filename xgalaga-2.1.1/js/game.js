/*
 * game.js - the XGalaga web port.
 *
 * Gameplay is a close port of main.c / prize.c / explosions.c from
 * XGalaga 2.1.1, running on a fixed 30 Hz logic step.  The playfield is
 * the original 468x596 coordinate space; the canvas is drawn at 2x.
 */
(function () {
  'use strict';

  const W = 468;
  const H = 596;
  const HUD_H = 24;

  const MAXALIENS = 60;
  const MAXTORPS = 10;
  const MINTORPS = 3;
  const TORPSPEED = 12;
  const ETORPSPEED = 8;
  const MINSPEED = 3;
  const MAXSPEED = 8;
  const TORPDELAY = 5;
  const TURNSPEED = 10;

  const SHIELDTIME = 200;
  const MAXSHIELDS = 800;
  const BONUSSHIPSCORE = 50000;
  const PRIZECHANCE = 25;
  const TORPCHANCE = 60;

  const SINGLESHOT = 0;
  const DOUBLESHOT = 1;
  const TRIPLESHOT = 2;
  const SPREADSHOT = 3;
  const MACHINEGUN = 4;

  const WEAPON_NAMES = ['SINGLE', 'DOUBLE', 'TRIPLE', 'SPREAD', 'MACHINE'];

  const PRIZE_SING = 0;
  const PRIZE_DOUB = 1;
  const PRIZE_TRIP = 2;
  const PRIZE_SPEED = 3;
  const PRIZE_SHIELD = 4;
  const PRIZE_SMART = 5;
  const PRIZE_LEMON = 6;
  const PRIZE_EXTRABULLET = 7;
  const PRIZE_SPREAD = 8;
  const PRIZE_MACHINE = 9;
  const NUMPRIZES = 10;

  const STAR_COLORS = ['#ffffff', '#55ff55', '#55ffff', '#ff5555', '#ffff55'];

  const STORAGE_KEY = 'xgalaga-web.highscores';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function pad(num, len) {
    let s = String(Math.max(0, Math.floor(num)));
    while (s.length < len) s = '0' + s;
    return s;
  }

  function rnd(n) {
    return Math.floor(Math.random() * n);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class Game {
    constructor(canvas, assets, sound) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.assets = assets;
      this.sound = sound;

      this.counter = 0;
      this.tick = 0;
      this.state = 'title';
      this.paused = false;

      this.input = {
        left: false,
        right: false,
        fire: false,
        pointerDown: false,
        pointerX: null,
        mode: 'keys',
        padShield: false,
      };

      this.playerShip = XGAL.image('player1');
      this.playerTorp = XGAL.image('mtorp');
      this.enemyTorp = XGAL.image('etorp');
      this.shieldImage = XGAL.image('shield');
      this.explosionImage = XGAL.image('explosion');
      this.titleImage = XGAL.image('title');
      this.pauseImage = XGAL.image('pause');
      this.extraImage = XGAL.image('extra');
      this.miniship = XGAL.image('miniship');

      this.alienSprites = [];
      for (let i = 0; i < 17; i++) this.alienSprites.push(XGAL.image('alien' + (i + 1)));

      this.bubbleImages = [
        XGAL.image('s500'),
        XGAL.image('s1000'),
        XGAL.image('s2000'),
        XGAL.image('s4000'),
      ];

      this.prizeImages = [
        XGAL.image('pr_sing'),
        XGAL.image('pr_doub'),
        XGAL.image('pr_trip'),
        XGAL.image('pr_speed'),
        XGAL.image('pr_shield'),
        XGAL.image('pr_brain'),
        XGAL.image('pr_lemon'),
        XGAL.image('pr_extrabullet'),
        XGAL.image('pr_spread') || XGAL.image('pr_trip'),
        XGAL.image('pr_machine') || XGAL.image('pr_sing'),
      ];

      this.stars = this.makeStars();
      this.starspeed = 1;
      this.titleBlink = 0;
      this.titleMessage = '';
      this.titleMessageTimer = 0;
      this.autoPauseEnabled = true;

      this.highScores = this.loadHighScores();

      this.score = 0;
      this.levelNumber = 1;
      this.meta = 1;
      this.aliens = [];
      this.torps = [];
      this.etorps = [];
      this.prizes = [];
      this.explosions = [];
      this.bubbles = [];
      this.levelData = null;
      this.extraShip = null;
      this.numtorps = 0;
      this.ships = 2;
      this.weapon = SINGLESHOT;
      this.movespeed = MINSPEED;
      this.maxtorps = MINTORPS;
      this.plx = W / 2;
      this.plDead = 0;
      this.plFlash = 0;
      this.plshield = 0;
      this.shieldsleft = 0;
      this.gotlemon = false;
      this.nextBonus = 20000;
      this.convoyx = 0;
      this.convoymove = 1;
      this.livecount = 60;
      this.attacking = 0;
      this.entering = 0;
      this.maxattacking = 3;
      this.maxetorps = 15;
      this.torpok = 0;
      this.shotSide = -15;
      this.gameOverTimer = 0;
      this.nameBuffer = '';
    }

    /* ---------------------------------------------------------------- */
    /* High scores                                                      */
    /* ---------------------------------------------------------------- */

    loadHighScores() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            return list
              .filter((e) => e && typeof e.score === 'number')
              .sort((a, b) => b.score - a.score)
              .slice(0, 5);
          }
        }
      } catch (err) { /* file:// storage may be unavailable */ }
      return [
        { name: 'XGL', score: 10000 },
        { name: 'JOE', score: 7500 },
        { name: 'ACE', score: 5000 },
        { name: 'NEO', score: 2500 },
        { name: 'CPU', score: 1000 },
      ];
    }

    saveHighScores() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.highScores));
      } catch (err) { /* ignore */ }
    }

    get highScore() {
      return this.highScores.length ? this.highScores[0].score : 0;
    }

    qualifies(score) {
      if (score <= 0) return false;
      return this.highScores.length < 5 || score > this.highScores[this.highScores.length - 1].score;
    }

    addHighScore(name, score) {
      this.highScores.push({ name: (name || 'AAA').toUpperCase().slice(0, 3), score });
      this.highScores.sort((a, b) => b.score - a.score);
      this.highScores = this.highScores.slice(0, 5);
      this.saveHighScores();
    }

    /* ---------------------------------------------------------------- */
    /* Lifecycle                                                        */
    /* ---------------------------------------------------------------- */

    makeStars() {
      const stars = [];
      for (let i = 0; i < 30; i++) {
        stars.push({
          x: rnd(W),
          y: rnd(H),
          speed: rnd(3) + 1,
          color: STAR_COLORS[rnd(STAR_COLORS.length)],
        });
      }
      return stars;
    }

    startGame() {
      this.score = 0;
      this.ships = 2;
      this.weapon = SINGLESHOT;
      this.movespeed = MINSPEED;
      this.maxtorps = MINTORPS;
      this.shieldsleft = 0;
      this.plshield = 0;
      this.gotlemon = false;
      this.plx = W / 2;
      this.plDead = 0;
      this.plFlash = 0;
      this.nextBonus = 20000;
      this.starspeed = 1;
      this.counter = 0;
      this.shotSide = -15;
      this.torpok = 0;
      this.paused = false;
      this.gameOverTimer = 0;
      this.nameBuffer = '';
      this.extraShip = null;
      this.torps = [];
      for (let i = 0; i < MAXTORPS; i++) this.torps.push({ alive: false, x: 0, y: 0, xs: 0, ys: 0, frame: 0 });
      this.etorps = [];
      this.prizes = [];
      this.explosions = [];
      this.bubbles = [];
      this.numtorps = 0;
      this.stars = this.makeStars();
      this.initAliens(1);
      this.state = 'playing';
    }

    initAliens(number) {
      this.levelNumber = number;
      this.levelData = XGAL.getLevel(number, this.assets.levels, W, H);
      this.meta = this.levelData.meta;

      this.convoyx = 0;
      this.convoymove = 1;
      this.maxattacking = Math.min(30, 1 + number * 2);
      this.maxetorps = 10 + number * 5;

      this.etorps = [];
      this.bubbles = [];
      this.aliens = [];

      for (let i = 0; i < MAXALIENS; i++) this.aliens.push(this.makeAlien(i));

      for (const t of this.torps) t.alive = false;
      this.numtorps = 0;

      this.livecount = 0;
      for (const a of this.aliens) if (a.alive) this.livecount++;
      this.attacking = 0;
      this.entering = this.livecount;
    }

    makeAlien(i) {
      const ld = this.levelData;
      const shape = ld.shape[i];
      if (shape < 0) {
        return { index: i, alive: false, dying: false, x: 0, y: 0 };
      }
      const pathId = ld.path[i];
      const p = ld.paths[pathId];
      const entries = p ? p.entries : [];
      const first = entries.length ? entries[0] : [8, 30];
      const metaScale = 1 + (this.meta - 1) * 0.5;
      const delay = Math.trunc(ld.delay[i] / metaScale);
      let steer = Math.trunc(first[1] / metaScale);
      return {
        index: i,
        alive: true,
        dying: false,
        entering: true,
        x: p ? p.x : ld.paths[0] ? ld.paths[0].x : W / 2,
        y: p ? p.y : -30,
        enterdelay: delay,
        path: p ? pathId : -1,
        pathPos: 0,
        dir: p ? first[0] : 8,
        steer: steer > 0 ? steer : 2,
        escorting: -1,
        shape,
        sprite: this.alienSprites[shape] || this.alienSprites[0],
      };
    }

    toTitle() {
      this.state = 'title';
      this.paused = false;
      this.starspeed = 1;
      this.titleMessageTimer = 0;
    }

    autoPause() {
      if (this.state === 'playing' && !this.plDead && !this.paused) {
        this.paused = true;
      }
    }

    togglePause() {
      if (this.state !== 'playing') return;
      this.paused = !this.paused;
    }

    endGame() {
      this.paused = false;
      if (this.qualifies(this.score)) {
        this.state = 'nameentry';
        this.nameBuffer = '';
      } else {
        this.state = 'gameover';
        this.gameOverTimer = 0;
      }
    }

    submitName() {
      const name = (this.nameBuffer + 'AAA').slice(0, 3);
      this.addHighScore(name, this.score);
      this.state = 'gameover';
      this.gameOverTimer = 0;
      this.titleMessage = 'SCORE SAVED';
      this.titleMessageTimer = 240;
    }

    /* ---------------------------------------------------------------- */
    /* Helpers                                                          */
    /* ---------------------------------------------------------------- */

    convoyX(i) {
      return this.convoyx + 20 * (i % 10);
    }

    convoyY(i) {
      return 20 + 20 * Math.floor(i / 10);
    }

    metaMoves(dir) {
      const m = XGAL.MOVES[dir];
      return [m[0] + Math.trunc(this.meta * m[0] / 2), m[1] + Math.trunc(this.meta * m[1] / 2)];
    }

    weaponMinTorps() {
      switch (this.weapon) {
        case SINGLESHOT: return 3;
        case DOUBLESHOT: return 4;
        case TRIPLESHOT: return 6;
        case SPREADSHOT: return 5;
        case MACHINEGUN: return 3;
        default: return 3;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Player                                                           */
    /* ---------------------------------------------------------------- */

    activateShield() {
      if (this.state !== 'playing' || this.plDead || this.paused) return;
      if (this.shieldsleft > 0) {
        this.plshield += this.shieldsleft;
        this.shieldsleft = 0;
        if (this.plshield > MAXSHIELDS) this.plshield = MAXSHIELDS;
        this.sound.play('shield');
      }
    }

    newTorp(x, y, xs, ys) {
      if (this.numtorps >= MAXTORPS) return false;
      const t = this.torps.find((item) => !item.alive);
      if (!t) return false;
      t.alive = true;
      t.x = x;
      t.y = y;
      t.xs = xs;
      t.ys = ys;
      t.frame = 0;
      this.numtorps++;
      this.sound.play('firetorp');
      return true;
    }

    shoot() {
      const y = H - this.playerShip.height;
      switch (this.weapon) {
        case SINGLESHOT:
          if (this.numtorps < this.maxtorps && this.newTorp(this.plx, y, 0, -TORPSPEED)) {
            this.torpok = TORPDELAY;
          }
          break;
        case DOUBLESHOT:
          if (this.numtorps < this.maxtorps - 1) {
            this.newTorp(this.plx - 5, y, 0, -TORPSPEED);
            this.newTorp(this.plx + 5, y, 0, -TORPSPEED);
            this.torpok = TORPDELAY;
          }
          break;
        case TRIPLESHOT:
          if (this.numtorps < this.maxtorps - 2) {
            this.newTorp(this.plx - 5, y, -2, 1 - TORPSPEED);
            this.newTorp(this.plx, y, 0, -TORPSPEED);
            this.newTorp(this.plx + 5, y, 2, 1 - TORPSPEED);
            this.torpok = TORPDELAY;
          }
          break;
        case SPREADSHOT:
          if (this.numtorps === 0) {
            const speed = -TORPSPEED * 1.15;
            if (this.maxtorps % 2 === 1) this.newTorp(this.plx, y, 0, speed);
            else {
              this.newTorp(this.plx - 5, y, 0, speed);
              this.newTorp(this.plx + 5, y, 0, speed);
            }
            if (this.maxtorps > 2) {
              this.newTorp(this.plx, y - 15, -2, speed);
              this.newTorp(this.plx, y - 15, 2, speed);
            }
            if (this.maxtorps > 4) {
              this.newTorp(this.plx, y - 25, -4, speed);
              this.newTorp(this.plx, y - 25, 4, speed);
            }
            if (this.maxtorps > 6) {
              this.newTorp(this.plx, y - 35, -6, speed);
              this.newTorp(this.plx, y - 35, 6, speed);
            }
            if (this.maxtorps > 8) {
              this.newTorp(this.plx, y - 50, -8, speed);
              this.newTorp(this.plx, y - 50, 8, speed);
            }
            if (this.maxtorps > 10) {
              this.newTorp(this.plx, y - 60, -10, speed);
              this.newTorp(this.plx, y - 60, 10, speed);
            }
            this.torpok = TORPDELAY;
          }
          break;
        case MACHINEGUN:
          if (this.numtorps < this.maxtorps) {
            this.shotSide = this.shotSide === -15 ? 15 : -15;
            this.newTorp(this.plx + this.shotSide, y, 0, -TORPSPEED * 1.3);
            this.torpok = TORPDELAY - 2;
          }
          break;
      }
    }

    updatePlayer() {
      if (this.plDead) {
        this.plDead++;
        if (this.plDead >= 100) {
          if (this.ships <= 0) {
            this.endGame();
          } else {
            this.ships--;
            this.maxtorps--;
            if (this.maxtorps < this.weaponMinTorps()) this.maxtorps = this.weaponMinTorps();
            if (this.maxtorps < MINTORPS) this.maxtorps = MINTORPS;
            this.plDead = 0;
            this.plFlash = 50;
            this.plx = W / 2;
          }
        }
        return;
      }

      this.torpok--;

      let fire = false;
      let target = this.plx;

      if (this.input.mode === 'pointer' && this.input.pointerX !== null) {
        target = this.input.pointerX;
        fire = this.input.pointerDown || this.input.fire;
      } else if (this.input.mode === 'pad') {
        target = this.input.pointerX !== null ? this.input.pointerX : this.plx;
        fire = this.input.fire;
      } else {
        if (this.input.left) target = 0;
        else if (this.input.right) target = W;
        fire = this.input.fire;
      }

      if (fire && this.torpok <= 0 && this.starspeed === 1) this.shoot();
      if (!fire) this.torpok = 0;

      if (Math.floor(target / this.movespeed) > Math.floor(this.plx / this.movespeed)) {
        this.plx += this.movespeed;
      } else if (Math.floor(target / this.movespeed) < Math.floor(this.plx / this.movespeed)) {
        this.plx -= this.movespeed;
      }

      if (this.plx < 10) this.plx = W - 10;
      if (this.plx > W - 10) this.plx = 10;

      if (this.plFlash > 0) this.plFlash--;
      if (this.plshield > 0) this.plshield--;
    }

    /* ---------------------------------------------------------------- */
    /* Aliens                                                           */
    /* ---------------------------------------------------------------- */

    maybeEnemyShot(a) {
      if (this.etorps.length >= this.maxetorps) return;
      let tc = TORPCHANCE - Math.floor(this.levelNumber / 2) - this.weapon * 5;
      if (tc < 35) tc = 35;
      if (rnd(tc) !== 0) return;

      let xs = 0;
      const dx = a.x - this.plx;
      if (dx > 200) xs = -3;
      else if (dx > 100) xs = -2;
      else if (dx < -200) xs = 3;
      else if (dx < -100) xs = 2;
      const ys = (ETORPSPEED + Math.floor(this.levelNumber / 5)) - Math.abs(xs);
      this.etorps.push({ x: a.x, y: a.y, xs, ys, frame: 0 });
    }

    doEscort(a, i) {
      const lead = this.aliens[a.escorting];
      if (!lead || !lead.alive) {
        a.escorting = -1;
      } else if (lead.dir >= 0) {
        a.dir = lead.dir;
      } else {
        a.x = this.convoyX(i) + this.convoymove;
        a.y = -10;
        a.dir = -2;
        a.path = -1;
        a.steer = 2;
        a.escorting = -1;
      }
    }

    doConvoy(a, i) {
      a.x += this.convoymove;
      if (this.entering === 0 && this.attacking < this.maxattacking &&
          (this.livecount < this.maxattacking ||
           rnd(10000) < this.levelNumber + 2 * (48 - this.livecount))) {
        const path = Math.random() < 0.5 ? XGAL.P_PEELLEFT : XGAL.P_PEELRIGHT;
        const first = XGAL.ATTACK_PATHS[path][0];
        a.dir = first[0];
        a.steer = first[1];
        a.path = path;
        a.pathPos = 0;
        this.attacking++;
        if (i < 10) {
          for (let e = i + 9; e < i + 12; e++) {
            const esc = this.aliens[e];
            if (esc && esc.alive && esc.dir === -1) esc.escorting = i;
          }
        }
      }
    }

    doEnter(a, i) {
      if (a.enterdelay > 0) {
        a.enterdelay--;
        return;
      }

      if (a.path >= 0 && this.levelData.paths[a.path]) {
        const step = this.metaMoves(a.dir);
        a.x += step[0];
        a.y += step[1];
        a.steer--;
        if (a.steer <= 0) {
          a.pathPos++;
          const entries = this.levelData.paths[a.path].entries;
          const next = entries[a.pathPos];
          if (next) {
            a.dir = next[0];
            const scale = 1 + (this.meta - 1) * 0.5;
            a.steer = Math.trunc(next[1] / scale);
            if (a.steer < 1) a.steer = 1;
          } else {
            a.dir = -1;
          }
          if (a.dir < 0) a.path = -1;
        }
        this.maybeEnemyShot(a);
      } else {
        const tx = this.convoyX(i);
        const ty = this.convoyY(i);
        const diffx = Math.abs(tx - a.x);
        const diffy = Math.abs(ty - a.y);
        const close = 4 + this.meta * 2;

        if (diffy < close) {
          a.y = ty;
          if (diffx < close) {
            a.x = tx;
            a.dir = -1;
            a.entering = false;
            return;
          }
          a.dir = tx > a.x ? 4 : 12;
        } else if (ty < a.y) {
          if (diffx < close) {
            a.x = tx;
            a.dir = 0;
          } else {
            a.dir = tx > a.x ? 2 : 14;
          }
        } else {
          if (diffx < close) {
            a.x = tx;
            a.dir = 8;
          } else {
            a.dir = tx > a.x ? 6 : 10;
          }
        }
        const step = this.metaMoves(a.dir);
        a.x += step[0];
        a.y += step[1];
      }
    }

    startNewAttackPath(a) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const path = XGAL.ATTACK_CHOICES[rnd(XGAL.ATTACK_CHOICES.length)];
        const entries = XGAL.ATTACK_PATHS[path];
        let idx = -1;
        for (let k = 0; k < entries.length; k++) {
          if (entries[k][0] === a.dir) { idx = k; break; }
        }
        if (idx >= 0) {
          a.path = path;
          a.pathPos = idx;
          a.steer = entries[idx][1];
          return;
        }
      }
      a.path = -1;
      a.steer = TURNSPEED;
    }

    updateAttack(a, i) {
      const mv = XGAL.MOVES[a.dir];
      a.x += mv[0];
      a.y += mv[1];

      if (a.x > W + 20) a.x = -20;
      else if (a.x < -20) a.x = W + 20;

      if (a.y > H) {
        a.x = this.convoyX(i) + this.convoymove;
        a.y = -30;
        a.dir = -2;
        a.path = -1;
        a.steer = 2;
        a.escorting = -1;
        if (i < 10) {
          for (let j = i + 9; j < i + 12; j++) {
            if (this.aliens[j]) this.aliens[j].escorting = -1;
          }
        }
      } else if (a.y < 0) {
        a.dir = 8;
      }

      if (a.escorting < 0) {
        a.steer--;
        if (a.steer <= 0) {
          if (a.path >= 0) {
            const lastDir = a.dir;
            a.pathPos++;
            const e = XGAL.pathDir(a.path, a.pathPos);
            a.dir = e[0];
            a.steer = e[1];
            if (a.dir < 0) {
              a.dir = lastDir;
              this.startNewAttackPath(a);
            }
          } else {
            a.dir = (a.dir + (Math.random() < 0.5 ? -1 : 1) + 16) % 16;
            a.steer = TURNSPEED;
          }
        }
      }

      this.maybeEnemyShot(a);
    }

    updateAliens() {
      if (!this.paused) {
        this.convoyx += this.convoymove;
        if (this.convoyx <= 0) {
          this.convoyx = 0;
          this.convoymove = -this.convoymove;
        } else if (this.convoyx >= W - 180) {
          this.convoyx = W - 180;
          this.convoymove = -this.convoymove;
        }
      }

      let live = 0;
      let attacking = 0;
      let entering = 0;
      for (const a of this.aliens) {
        if (!a.alive) continue;
        live++;
        if (a.dir >= 0 && a.escorting < 0 && !a.entering) attacking++;
        if (a.entering) entering++;
      }
      this.livecount = live;
      this.attacking = attacking;
      this.entering = entering;

      for (let i = 0; i < this.aliens.length; i++) {
        const a = this.aliens[i];
        if (!a.alive) continue;

        if (a.escorting >= 0) this.doEscort(a, i);

        if (a.entering) {
          this.doEnter(a, i);
        } else if (a.dir === -1) {
          this.doConvoy(a, i);
        } else if (a.dir === -2) {
          a.x += this.convoymove;
          a.y += 2;
          if (a.y >= 20 + 20 * Math.floor(i / 10)) {
            a.y = 20 + 20 * Math.floor(i / 10);
            a.dir = -1;
          }
        } else {
          this.updateAttack(a, i);
        }
      }

      if (this.livecount === 0) {
        this.starspeed++;
        if (this.starspeed === 2) this.sound.play('warp');
        if (this.starspeed >= 120) {
          this.starspeed = -20;
        } else if (this.starspeed === 1) {
          this.initAliens(++this.levelNumber);
          this.gotlemon = false;
          this.starspeed = 1;
          this.numtorps = 0;
        }
      }
    }

    /* ---------------------------------------------------------------- */
    /* Shots, explosions, prizes                                        */
    /* ---------------------------------------------------------------- */

    killAlien(j) {
      const a = this.aliens[j];
      a.alive = false;

      if (j >= 10) {
        if (a.dir < 0) {
          this.score += 50;
        } else {
          this.score += (6 - Math.floor(j / 10)) * 100;
          const chance = this.gotlemon ? 3 : PRIZECHANCE;
          if (rnd(chance) === 0) this.newPrize(a.x, a.y);
        }
        this.newExplosion(a.x, a.y, 0);
      } else {
        if (a.dir < 0) {
          this.score += 200;
        } else {
          let ne = 0;
          for (let k = j + 9; k < j + 12; k++) {
            if (this.aliens[k] && this.aliens[k].escorting === j) ne++;
          }
          this.scoreFlagship(a.x, a.y, ne);
        }
        this.newExplosion(a.x, a.y, 1);
      }
      this.checkBonusShip();
    }

    updateTorps() {
      for (const t of this.torps) {
        if (!t.alive) continue;
        t.y += t.ys;
        t.x += t.xs;
        t.frame++;

        let hit = false;
        for (let j = 0; j < this.aliens.length; j++) {
          const a = this.aliens[j];
          if (!a.alive || a.dying) continue;
          if (Math.abs(t.x - a.x) < 8 &&
              (Math.abs(t.y - a.y) < 8 || Math.abs(t.y + t.ys / 2 - a.y) < 8)) {
            t.alive = false;
            this.numtorps--;
            this.killAlien(j);
            hit = true;
            break;
          }
        }
        if (hit) continue;

        if (t.y < -t.ys || t.x < Math.abs(t.xs) || t.x > W - Math.abs(t.xs)) {
          t.alive = false;
          this.numtorps--;
        }
      }
    }

    updateETorps() {
      const playerY = H - this.playerShip.height / 2;
      for (let i = this.etorps.length - 1; i >= 0; i--) {
        const t = this.etorps[i];
        t.y += t.ys;
        t.x += t.xs;
        t.frame++;

        if (t.y > H || t.x < 0 || t.x > W) {
          this.etorps.splice(i, 1);
        } else if (!this.plDead && !this.plFlash && !this.plshield &&
                   Math.abs(t.x - this.plx) < 8 && Math.abs(t.y - playerY) < 8) {
          this.plDead = 1;
          this.etorps.splice(i, 1);
          this.newExplosion(this.plx, playerY, 2);
        }
      }
    }

    newExplosion(x, y, type) {
      this.explosions.push({ x, y, frame: 0, born: this.tick });
      this.sound.play(type === 1 ? 'explode_big' : type === 2 ? 'explode' : 'torphit');
    }

    updateExplosions() {
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const e = this.explosions[i];
        if (e.born === this.tick) continue;
        e.frame++;
        if (e.frame >= this.explosionImage.frames) this.explosions.splice(i, 1);
      }
    }

    scoreFlagship(x, y, ne) {
      const scores = [500, 1000, 2000, 4000];
      this.score += scores[clamp(ne, 0, 3)];
      this.bubbles.push({ x, y, count: 25, image: this.bubbleImages[clamp(ne, 0, 3)] });
    }

    updateBubbles() {
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.count--;
        b.y--;
        if (b.count <= 0) this.bubbles.splice(i, 1);
      }
    }

    newPrize(x, y) {
      this.prizes.push({ x, y, type: rnd(NUMPRIZES), dying: false });
    }

    applyPrize(type) {
      switch (type) {
        case PRIZE_SING:
          if (this.weapon === SINGLESHOT) this.maxtorps++;
          else this.weapon = SINGLESHOT;
          break;
        case PRIZE_DOUB:
          if (this.weapon === DOUBLESHOT) this.maxtorps++;
          else {
            this.weapon = DOUBLESHOT;
            if (this.maxtorps < 4) this.maxtorps = 4;
          }
          break;
        case PRIZE_TRIP:
          if (this.weapon === TRIPLESHOT) this.maxtorps++;
          else {
            this.weapon = TRIPLESHOT;
            if (this.maxtorps < 6) this.maxtorps = 6;
          }
          break;
        case PRIZE_SPEED:
          if (this.movespeed < MAXSPEED) this.movespeed++;
          break;
        case PRIZE_SPREAD:
          if (this.weapon === SPREADSHOT) this.maxtorps++;
          else {
            this.weapon = SPREADSHOT;
            if (this.maxtorps < 5) this.maxtorps = 5;
          }
          break;
        case PRIZE_MACHINE:
          if (this.weapon === MACHINEGUN) this.maxtorps++;
          else {
            this.weapon = MACHINEGUN;
            if (this.maxtorps < 3) this.maxtorps = 3;
          }
          break;
        case PRIZE_SHIELD:
          if (this.plshield > 0) this.plshield += SHIELDTIME;
          else this.shieldsleft += SHIELDTIME;
          if (this.shieldsleft + this.plshield > MAXSHIELDS) {
            if (this.plshield > 0) {
              this.shieldsleft = 0;
              this.plshield = MAXSHIELDS;
            } else {
              this.shieldsleft = MAXSHIELDS;
              this.plshield = 0;
            }
          }
          this.sound.play('shield');
          break;
        case PRIZE_SMART:
          this.smartBomb();
          break;
        case PRIZE_LEMON:
          this.gotlemon = true;
          this.maxtorps = MINTORPS;
          this.weapon = SINGLESHOT;
          this.movespeed = MINSPEED;
          break;
        case PRIZE_EXTRABULLET:
          if (this.maxtorps < MAXTORPS) this.maxtorps++;
          break;
      }
      if (this.maxtorps > MAXTORPS) this.maxtorps = MAXTORPS;
    }

    smartBomb() {
      this.sound.play('smart');
      for (let i = 0; i < this.aliens.length; i++) {
        const a = this.aliens[i];
        if (!a.alive || a.dying) continue;
        a.alive = false;
        if (i >= 10) {
          if (a.dir < 0) this.score += 50;
          else {
            this.score += (6 - Math.floor(i / 10)) * 100;
            const chance = this.gotlemon ? 3 : PRIZECHANCE;
            if (rnd(chance) === 0) this.newPrize(a.x, a.y);
          }
          this.newExplosion(a.x, a.y, 0);
        } else {
          if (a.dir < 0) this.score += 200;
          else {
            let ne = 0;
            for (let k = i + 9; k < i + 12; k++) {
              if (this.aliens[k] && this.aliens[k].escorting === i) ne++;
            }
            this.scoreFlagship(a.x, a.y, ne);
          }
          this.newExplosion(a.x, a.y, 1);
        }
      }
      this.checkBonusShip();
    }

    updatePrizes() {
      for (let i = this.prizes.length - 1; i >= 0; i--) {
        const p = this.prizes[i];
        p.y += 3;
        if (p.y > H - 20 && Math.abs(p.x - this.plx) < 15 && !this.plDead) {
          this.applyPrize(p.type);
          this.sound.play('ddloo');
          this.prizes.splice(i, 1);
        } else if (p.y > H + 20) {
          this.prizes.splice(i, 1);
        }
      }
    }

    checkBonusShip() {
      while (this.score >= this.nextBonus) {
        this.ships++;
        this.extraShip = { x: -60, y: H / 2 };
        if (this.nextBonus < BONUSSHIPSCORE) this.nextBonus = BONUSSHIPSCORE;
        else this.nextBonus += BONUSSHIPSCORE;
      }
    }

    updateStars() {
      const speed = Math.min(20, Math.abs(this.starspeed));
      for (const s of this.stars) {
        s.y += s.speed * speed;
        if (s.y >= H) {
          s.y -= H + this.starspeed;
          s.x = rnd(W);
          s.color = STAR_COLORS[rnd(STAR_COLORS.length)];
        }
      }
    }

    /* ---------------------------------------------------------------- */
    /* Update entry point                                               */
    /* ---------------------------------------------------------------- */

    update() {
      this.tick++;
      this.titleBlink++;
      if (this.titleMessageTimer > 0) this.titleMessageTimer--;

      if (this.state === 'title') {
        this.starspeed = 1;
        this.updateStars();
        return;
      }

      if (this.state === 'playing') {
        if (this.paused) return;
        this.counter++;

        this.updateETorps();
        this.updatePlayer();
        if (this.state !== 'playing') return;
        this.updateAliens();
        this.updateTorps();
        this.updatePrizes();
        this.updateExplosions();
        this.updateBubbles();
        this.updateStars();

        if (this.extraShip) {
          this.extraShip.x += 10;
          if (this.extraShip.x - this.extraImage.width / 2 > W) this.extraShip = null;
        }
        return;
      }

      if (this.state === 'nameentry') {
        this.updateStars();
        return;
      }

      if (this.state === 'gameover') {
        this.updateStars();
        this.gameOverTimer++;
        return;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Input                                                            */
    /* ---------------------------------------------------------------- */

    keyDown(code, key) {
      if (this.state === 'title') {
        if (code === 'Enter' || code === 'Space') {
          this.startGame();
          return true;
        }
        return false;
      }

      if (this.state === 'nameentry') {
        if (code === 'Enter') {
          this.submitName();
          return true;
        }
        if (code === 'Backspace') {
          this.nameBuffer = this.nameBuffer.slice(0, -1);
          return true;
        }
        if (code === 'Escape') {
          this.state = 'gameover';
          this.gameOverTimer = 0;
          return true;
        }
        if (/^Key[A-Z]$/.test(code) && this.nameBuffer.length < 3) {
          this.nameBuffer += key.toUpperCase();
          return true;
        }
        return false;
      }

      if (this.state === 'gameover') {
        if ((code === 'Space' || code === 'Enter') && this.gameOverTimer > 20) {
          this.toTitle();
          return true;
        }
        return false;
      }

      // playing / paused
      switch (code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.input.left = true;
          this.input.mode = 'keys';
          return true;
        case 'ArrowRight':
        case 'KeyD':
          this.input.right = true;
          this.input.mode = 'keys';
          return true;
        case 'Space':
        case 'KeyJ':
          this.input.fire = true;
          if (this.paused) this.paused = false;
          return true;
        case 'KeyX':
          this.activateShield();
          return true;
        case 'KeyP':
        case 'Escape':
          this.togglePause();
          return true;
        case 'KeyQ':
          this.toTitle();
          return true;
        default:
          return false;
      }
    }

    keyUp(code) {
      switch (code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.input.left = false;
          return true;
        case 'ArrowRight':
        case 'KeyD':
          this.input.right = false;
          return true;
        case 'Space':
        case 'KeyJ':
          this.input.fire = false;
          return true;
        default:
          return false;
      }
    }

    pointerMove(x) {
      this.input.pointerX = clamp(x, 0, W);
      this.input.mode = 'pointer';
    }

    pointerDown(x) {
      this.input.pointerX = clamp(x, 0, W);
      this.input.pointerDown = true;
      this.input.mode = 'pointer';
      if (this.state === 'title') this.startGame();
      else if (this.state === 'gameover' && this.gameOverTimer > 20) this.toTitle();
      else if (this.state === 'nameentry') { /* type with keyboard */ }
      else if (this.paused) this.paused = false;
    }

    pointerUp() {
      this.input.pointerDown = false;
    }

    updatePad() {
      if (!navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      let pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; break; }
      if (!pad) return;

      const axis = pad.axes[0] || 0;
      const fire = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const shield = !!(pad.buttons[1] && pad.buttons[1].pressed);
      const start = !!(pad.buttons[9] && pad.buttons[9].pressed);

      if (this.input.mode === 'pad') this.input.fire = fire;
      if (Math.abs(axis) > 0.25 || fire) {
        this.input.mode = 'pad';
        this.input.fire = fire;
        if (Math.abs(axis) > 0.25) {
          this.input.pointerX = clamp(W / 2 + axis * W / 2, 0, W);
        }
      }
      if (shield && !this.input.padShield) this.activateShield();
      this.input.padShield = shield;
      if (start && !this.input.padStart && this.state === 'playing') this.togglePause();
      this.input.padStart = start;
    }

    /* ---------------------------------------------------------------- */
    /* Rendering                                                        */
    /* ---------------------------------------------------------------- */

    render() {
      const ctx = this.ctx;
      ctx.setTransform(XGAL.PIXEL_SCALE, 0, 0, XGAL.PIXEL_SCALE, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H + HUD_H);

      if (this.state === 'title') {
        this.renderStars(ctx);
        this.renderTitle(ctx);
        return;
      }

      this.renderWorld(ctx);
      this.renderHUD(ctx);

      if (this.state === 'playing' && this.paused) this.renderPause(ctx);
      if (this.state === 'nameentry') this.renderNameEntry(ctx);
      if (this.state === 'gameover') this.renderGameOver(ctx);
    }

    renderStars(ctx) {
      for (const s of this.stars) {
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
    }

    renderWorld(ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, HUD_H, W, H);
      ctx.clip();
      ctx.translate(0, HUD_H);

      // Stars ------------------------------------------------------
      for (const s of this.stars) {
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }

      // Explosions ------------------------------------------------
      for (const e of this.explosions) {
        const f = Math.min(e.frame, this.explosionImage.frames - 1);
        this.explosionImage.drawCentered(ctx, e.x, e.y, f);
      }

      // Score bubbles ---------------------------------------------
      for (const b of this.bubbles) {
        b.image.drawCentered(ctx, b.x, b.y, 0);
      }

      // Prizes ----------------------------------------------------
      for (const p of this.prizes) {
        const img = this.prizeImages[p.type];
        if (img) img.drawCentered(ctx, p.x, p.y, 0);
      }

      // Player bullets --------------------------------------------
      for (const t of this.torps) {
        if (t.alive) this.playerTorp.drawCentered(ctx, t.x, t.y, t.frame);
      }

      // Enemy bullets ---------------------------------------------
      for (const t of this.etorps) {
        this.enemyTorp.drawCentered(ctx, t.x, t.y, t.frame);
      }

      // Aliens -----------------------------------------------------
      for (const a of this.aliens) {
        if (!a.alive) continue;
        const frame = a.dir < 0 ? 0 : a.dir;
        a.sprite.drawCentered(ctx, a.x, a.y, frame);
      }

      // Player -----------------------------------------------------
      if (!this.plDead && this.playerShip) {
        if (this.plFlash <= 0 || this.plFlash % 2 === 0) {
          this.playerShip.draw(ctx, Math.round(this.plx - this.playerShip.width / 2),
                               H - this.playerShip.height, this.counter);
        }
        if (this.plshield > 0) {
          this.shieldImage.drawCentered(ctx, this.plx, H - this.shieldImage.height / 2 - 1, 0);
        }
      }

      // Extra ship animation --------------------------------------
      if (this.extraShip) {
        this.extraImage.draw(ctx, this.extraShip.x - this.extraImage.width / 2,
                             this.extraShip.y - this.extraImage.height / 2, 0);
      }

      // Shield inventory (top right, like the original) -----------
      const chargeCount = Math.min(8, Math.ceil((this.plshield + this.shieldsleft) / SHIELDTIME));
      for (let i = 0; i < chargeCount; i++) {
        const x = W - 20 * (i + 1);
        this.shieldImage.draw(ctx, x, 0, 0);
      }

      // Active shield bar ----------------------------------------
      if (this.plshield > 0) {
        const w = Math.max(1, Math.round((W - 8) * this.plshield / MAXSHIELDS));
        ctx.fillStyle = '#00a0ff';
        ctx.fillRect(4, 22, w, 2);
      }

      // Weapon indicator -----------------------------------------
      ctx.font = '9px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#5c8a5c';
      ctx.fillText('SHOT ' + WEAPON_NAMES[this.weapon] + (this.maxtorps > 3 ? ' x' + this.maxtorps : ''), 4, H - 4);

      // Level warp text ------------------------------------------
      if (this.starspeed !== 1) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 22px "Courier New", monospace';
        const msg = 'LEVEL ' + (this.levelNumber + 1);
        ctx.fillStyle = '#600000';
        ctx.fillText(msg, W / 2 + 2, H / 2 + 2);
        ctx.fillStyle = '#ff4040';
        ctx.fillText(msg, W / 2, H / 2);
      }

      ctx.restore();
    }

    renderHUD(ctx) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, HUD_H);
      ctx.strokeStyle = '#333333';
      ctx.beginPath();
      ctx.moveTo(0, HUD_H - 0.5);
      ctx.lineTo(W, HUD_H - 0.5);
      ctx.stroke();

      ctx.textBaseline = 'middle';
      ctx.font = 'bold 10px "Courier New", monospace';

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('SCORE ' + pad(this.score, 7), 6, HUD_H / 2);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#a0a0a0';
      const maxIcons = 6;
      const iconCount = Math.min(this.ships, maxIcons);
      const totalW = iconCount * (this.miniship.width + 2);
      let x = W / 2 - totalW / 2;
      for (let i = 0; i < iconCount; i++) {
        this.miniship.draw(ctx, x, HUD_H / 2 - this.miniship.height / 2, 0);
        x += this.miniship.width + 2;
      }
      if (this.ships > maxIcons) {
        ctx.fillStyle = '#a0a0a0';
        ctx.fillText('+' + (this.ships - maxIcons), W / 2 + totalW / 2 + 12, HUD_H / 2);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fe870';
      ctx.fillText('LEVEL ' + pad(this.levelNumber, 2), W - 6, HUD_H / 2);
      ctx.restore();
    }

    renderPause(ctx) {
      ctx.save();
      ctx.translate(0, HUD_H);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, W, H);
      if (this.pauseImage) {
        ctx.drawImage(this.pauseImage.canvas(0), Math.round((W - this.pauseImage.width) / 2),
                      Math.round(H / 2 - this.pauseImage.height / 2 - 30),
                      this.pauseImage.width, this.pauseImage.height);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('PAUSED', W / 2, H / 2 + 40);
      ctx.font = '10px "Courier New", monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText('P / ESC  RESUME     Q  QUIT     M  ' + (this.sound.muted ? 'SOUND OFF' : 'SOUND ON'),
                   W / 2, H / 2 + 62);
      ctx.restore();
    }

    renderTitle(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.titleImage) {
        const scale = 3;
        const tw = this.titleImage.width * scale;
        const th = this.titleImage.height * scale;
        ctx.drawImage(this.titleImage.canvas(0), Math.round((W - tw) / 2), 92, tw, th);
      }

      // Translucent panels keep the text readable over the star field.
      const panels = [
        { x: 84, y: 214, w: 300, h: 146 },
        { x: 96, y: 382, w: 276, h: 62 },
        { x: 62, y: 474, w: 344, h: 104 },
      ];
      for (const p of panels) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        roundedRect(ctx, p.x, p.y, p.w, p.h, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90, 150, 210, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.font = '9px "Courier New", monospace';
      ctx.fillStyle = '#55ffff';
      ctx.fillText('HTML5 / JAVASCRIPT EDITION', W / 2, 228);

      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('HIGH SCORES', W / 2, 262);

      ctx.font = '11px "Courier New", monospace';
      for (let i = 0; i < 5; i++) {
        const entry = this.highScores[i];
        const name = entry ? entry.name || '---' : '---';
        const score = entry ? pad(entry.score, 7) : '0000000';
        const y = 282 + i * 15;
        ctx.fillStyle = i === 0 ? '#ffd24a' : '#b0b0b0';
        ctx.textAlign = 'left';
        ctx.fillText(String(i + 1) + '.  ' + name, 128, y);
        ctx.textAlign = 'right';
        ctx.fillText(score, 340, y);
      }

      ctx.textAlign = 'center';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillStyle = '#9a9a9a';
      const lines = [
        'ARROWS / A-D   MOVE',
        'SPACE   FIRE        X   SHIELD',
        'P   PAUSE           M   SOUND',
      ];
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], W / 2, 396 + i * 16);
      }

      if (Math.floor(this.titleBlink / 20) % 2 === 0) {
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PRESS SPACE OR CLICK TO START', W / 2, 490);
      }

      ctx.font = '9px "Courier New", monospace';
      ctx.fillStyle = '#666666';
      ctx.fillText('MOUSE / TOUCH: MOVE TO STEER, HOLD TO FIRE', W / 2, 524);
      ctx.fillStyle = '#555555';
      ctx.fillText('PORT OF XGALAGA 2.1.1 BY JOE RUMSEY  (GPL V2)', W / 2, 564);

      ctx.textAlign = 'right';
      ctx.fillStyle = this.sound.muted ? '#804040' : '#4a804a';
      ctx.fillText('SOUND ' + (this.sound.muted ? 'OFF' : 'ON'), W - 8, 16);

      if (this.titleMessageTimer > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#55ff55';
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.fillText(this.titleMessage, W / 2, 540);
      }

      ctx.restore();
    }

    renderNameEntry(ctx) {
      ctx.save();
      this.dim(ctx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 20px "Courier New", monospace';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('NEW HIGH SCORE', W / 2, 240);
      ctx.font = '11px "Courier New", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SCORE ' + pad(this.score, 7), W / 2, 272);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillText('ENTER YOUR INITIALS', W / 2, 306);

      ctx.font = 'bold 22px "Courier New", monospace';
      for (let i = 0; i < 3; i++) {
        const ch = this.nameBuffer[i] || '_';
        ctx.fillStyle = this.nameBuffer[i] ? '#55ff55' : '#666666';
        ctx.fillText(ch, W / 2 - 28 + i * 28, 344);
      }

      ctx.font = '9px "Courier New", monospace';
      ctx.fillStyle = '#888888';
      ctx.fillText('A-Z TYPES   BACKSPACE DELETES   ENTER ACCEPTS', W / 2, 388);
      ctx.restore();
    }

    renderGameOver(ctx) {
      ctx.save();
      this.dim(ctx);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillStyle = '#ff4040';
      ctx.fillText('GAME OVER', W / 2, 250);
      ctx.font = '12px "Courier New", monospace';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('SCORE ' + pad(this.score, 7), W / 2, 292);
      ctx.fillStyle = '#b0b0b0';
      ctx.fillText('HIGH SCORE ' + pad(this.highScore, 7), W / 2, 314);
      if (this.gameOverTimer > 20 && Math.floor(this.gameOverTimer / 20) % 2 === 0) {
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PRESS SPACE OR CLICK', W / 2, 380);
      }
      ctx.restore();
    }

    dim(ctx) {
      ctx.save();
      ctx.translate(0, HUD_H);
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  window.XGAL = window.XGAL || {};
  window.XGAL.W = W;
  window.XGAL.H = H;
  window.XGAL.HUD_H = HUD_H;
  window.XGAL.Game = Game;
})();
