/*
 * engine.js - the XGalaga++ simulation, ported from the C++ sources.
 *
 * Everything in this file is a fairly literal translation of main.cc,
 * managers.cc, sprites.cc, explosion.cc and stars.cc:
 *   - convoy tables and relative arrival trajectories,
 *   - the alien creation / cruising / attack state machine,
 *   - bullets, bombs, bonuses, collisions and explosions,
 *   - the player ship and its power-ups.
 *
 * All positions are in screen pixels.  Trajectory data uses the original
 * 0..1024 relative coordinate system so the game behaves identically at
 * every window size, exactly like the resizable X11 version.
 */
(function () {
  'use strict';

  var XG = window.XG = window.XG || {};

  // The logical window.  game.js mutates this object when the player picks
  // one of the five original screen sizes.
  var Config = XG.Config = {
    width: 800,
    height: 600,
    details: 4,
    maxDetails: 4,
    sizeIndex: 1
  };

  var RC_MAX = 1024;
  var RC_END = { end: true };
  var ALIEN_HSPACING = 22;
  var ALIEN_VSPACING = 24;
  var ALIEN_WIDTH = 19;
  var ALIEN_HEIGHT = 20;

  function rc(x, y) { return { x: x, y: y }; }
  function randInt(n) { return Math.floor(Math.random() * n); }

  function shuffle(array) {
    for (var i = array.length - 1; i > 0; --i) {
      var j = randInt(i + 1);
      var tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function pix(name) { return window.XGPix.Keeper.get(name); }

  function toPixel(relative) {
    return {
      x: Math.trunc((relative.x * Config.width + RC_MAX / 2) / RC_MAX),
      y: Math.trunc((relative.y * Config.height + RC_MAX / 2) / RC_MAX)
    };
  }

  function toRCoord(pixel) {
    return {
      x: Math.trunc((pixel.x * RC_MAX + Math.floor(Config.width / 2)) / Config.width),
      y: Math.trunc((pixel.y * RC_MAX + Math.floor(Config.height / 2)) / Config.height)
    };
  }

  function mirror(relative) {
    return rc(RC_MAX - relative.x, relative.y);
  }

  /*
   * Arrival trajectories, copied from main.cc.  Coordinates are relative
   * to a 1024 x 1024 virtual screen; RC_END terminates each path.
   */
  var HANG = [
    rc(512, -20), rc(512, 612), rc(496, 662), rc(454, 704),
    rc(414, 716), rc(368, 704), rc(330, 662), rc(318, 612),
    rc(330, 556), rc(512, 260), RC_END
  ];
  var INFINITY = [
    rc(-20, 800),
    rc(760, 344), rc(812, 330), rc(860, 344), rc(892, 388),
    rc(898, 418), rc(892, 448), rc(860, 490), rc(812, 502),
    rc(212, 502), rc(162, 490), rc(130, 448), rc(122, 418),
    rc(128, 388), rc(160, 344),
    RC_END
  ];
  var V_PATH = [rc(-20, 312), rc(350, 550), rc(700, 550), rc(800, 500), RC_END];
  var U_PATH = [rc(256, -20), rc(256, 600), rc(768, 600), rc(768, 200), RC_END];
  var LOOP = [
    rc(-20, 430),
    rc(512, 430), rc(560, 444), rc(592, 488), rc(598, 518),
    rc(592, 548), rc(560, 590), rc(512, 602), rc(462, 590),
    rc(430, 548), rc(422, 518), rc(428, 488), rc(460, 444),
    rc(512, 430), rc(560, 444), rc(592, 488), rc(598, 518),
    rc(592, 548), rc(560, 590), rc(512, 602), rc(462, 590),
    rc(430, 548), rc(422, 518), rc(428, 488), rc(460, 444),
    RC_END
  ];
  var LEFT_PATH = [rc(-20, 512), rc(512, 512), RC_END];
  var SINE = [
    rc(-20, 586), rc(0, 566), rc(20, 540), rc(66, 524),
    rc(124, 548), rc(152, 588), rc(158, 634), rc(182, 676),
    rc(244, 700), rc(302, 676), rc(328, 634), rc(338, 588),
    rc(364, 548), rc(422, 524), rc(482, 548), rc(506, 588),
    RC_END
  ];
  var T_DIAG = [rc(-20, -20), rc(512, 700), RC_END];
  var B_DIAG = [rc(-20, 1024 + 20), rc(512, 316), RC_END];
  var B_ZZ = [
    rc(-20, 1000), rc(100, 1000), rc(0, 900), rc(100, 900),
    rc(0, 800), rc(100, 800), rc(0, 700), rc(100, 700),
    rc(0, 600), rc(100, 600), rc(0, 500), rc(100, 500),
    rc(0, 400), rc(100, 400),
    RC_END
  ];
  var T_ZZ = [
    rc(-20, 100), rc(100, 100), rc(0, 200), rc(100, 200),
    rc(0, 300), rc(100, 300), rc(0, 400), rc(100, 400),
    rc(0, 500), rc(100, 500), rc(0, 600), rc(100, 600),
    rc(0, 700), rc(100, 700),
    RC_END
  ];
  var T_CIRC = [
    rc(20, -20), rc(20, 194), rc(22, 240), rc(30, 280),
    rc(38, 320), rc(52, 360), rc(66, 402), rc(88, 446),
    rc(112, 490), rc(144, 532), rc(172, 566), rc(212, 604),
    rc(246, 630), rc(292, 660), rc(334, 680), rc(394, 700),
    rc(436, 710), rc(512, 716), rc(588, 710), rc(630, 700),
    rc(690, 680), rc(732, 660), rc(778, 630), rc(812, 604),
    rc(852, 566), rc(880, 532), rc(912, 490), rc(936, 446),
    rc(958, 402), rc(972, 360), rc(986, 320), rc(994, 280),
    rc(1002, 240), rc(1004, 194),
    RC_END
  ];
  // Boing: down the left side, round the bottom, back up the right side.
  var BOING = (function () {
    var table = [
      [24, 1044], [24, 796], [30, 716], [40, 644], [50, 608], [60, 576],
      [70, 538], [80, 516], [90, 496], [100, 476], [110, 464], [120, 446],
      [130, 426], [140, 420], [150, 406], [160, 390], [170, 386], [180, 376],
      [190, 366], [200, 362], [210, 356], [220, 350], [230, 346], [240, 344],
      [250, 340], [260, 339], [278, 338],
      [296, 339], [306, 340], [316, 344], [326, 346], [336, 350], [346, 356],
      [356, 362], [366, 366], [376, 376], [386, 386], [396, 390], [406, 406],
      [416, 420], [426, 426], [436, 446], [446, 464], [456, 476], [466, 496],
      [476, 516], [486, 538], [496, 576], [506, 608], [516, 644], [526, 716],
      [532, 796]
    ];
    var points = table.map(function (p) { return rc(p[0], p[1]); });
    points.push(RC_END);
    return points;
  })();

  var DROP128 = [rc(128, -20), rc(128, 700), RC_END];
  var DROP256 = [rc(256, -20), rc(256, 700), RC_END];
  var DROP384 = [rc(384, -20), rc(384, 700), RC_END];
  var DROP512 = [rc(512, -20), rc(512, 700), RC_END];
  var DROP640 = [rc(640, -20), rc(640, 700), RC_END];
  var DROP768 = [rc(768, -20), rc(768, 700), RC_END];
  var DROP896 = [rc(896, -20), rc(896, 700), RC_END];

  function convoy(wait, alien, percent, path, mirrorX, split) {
    return { wait: wait, alien: alien, percent: percent, path: path, mirror: mirrorX, split: split };
  }

  // Game levels, copied from cd1..cd13 in main.cc.
  var LEVELS = XG.LEVELS = [
    [
      convoy(0, 'alien1', 50, HANG, false, true),
      convoy(100, 'alien1', 50, HANG, false, true),
      convoy(100, 'alien1', 50, HANG, false, true),
      convoy(100, 'alien1', 50, HANG, false, true),
      convoy(100, 'alien1', 30, HANG, false, true),
      convoy(10, 'alien13', 15, HANG, false, true)
    ],
    [
      convoy(200, 'alien2', 50, V_PATH, false, false),
      convoy(150, 'alien2', 50, V_PATH, true, false),
      convoy(150, 'alien2', 50, V_PATH, false, false),
      convoy(100, 'alien2', 50, V_PATH, true, false),
      convoy(100, 'alien2', 30, HANG, false, true),
      convoy(10, 'alien13', 15, HANG, false, true)
    ],
    [
      convoy(200, 'alien3', 50, T_DIAG, false, false),
      convoy(200, 'alien3', 50, T_DIAG, true, false),
      convoy(200, 'alien3', 50, T_DIAG, false, true),
      convoy(10, 'alien3', 50, T_DIAG, true, true)
    ],
    [
      convoy(200, 'alien4', 50, U_PATH, false, true),
      convoy(170, 'alien4', 50, U_PATH, false, true),
      convoy(170, 'alien4', 50, U_PATH, false, true),
      convoy(170, 'alien4', 50, U_PATH, false, true),
      convoy(150, 'alien4', 30, V_PATH, false, false),
      convoy(10, 'alien13', 15, V_PATH, false, false)
    ],
    [
      convoy(200, 'alien5', 50, LOOP, false, false),
      convoy(25, 'alien5', 50, LOOP, true, false),
      convoy(150, 'alien5', 50, B_DIAG, false, false),
      convoy(150, 'alien5', 50, B_DIAG, true, false),
      convoy(150, 'alien5', 50, LOOP, false, false)
    ],
    [
      convoy(200, 'alien6', 50, HANG, false, true),
      convoy(150, 'alien6', 50, INFINITY, false, true),
      convoy(150, 'alien6', 50, INFINITY, true, false),
      convoy(100, 'alien6', 30, INFINITY, false, false),
      convoy(100, 'alien6', 50, INFINITY, true, false),
      convoy(150, 'alien13', 15, B_DIAG, true, false)
    ],
    [
      convoy(200, 'alien7', 50, B_ZZ, false, true),
      convoy(150, 'alien7', 50, T_ZZ, false, true),
      convoy(100, 'alien7', 50, B_ZZ, false, true),
      convoy(50, 'alien7', 50, T_ZZ, false, true),
      convoy(10, 'alien7', 50, T_ZZ, false, true)
    ],
    [
      convoy(200, 'alien8', 50, SINE, false, false),
      convoy(0, 'alien8', 50, SINE, true, true),
      convoy(50, 'alien8', 25, DROP128, false, true),
      convoy(5, 'alien8', 25, DROP256, false, true),
      convoy(5, 'alien8', 25, DROP384, false, true),
      convoy(5, 'alien8', 25, DROP512, false, true),
      convoy(5, 'alien8', 25, DROP640, false, true),
      convoy(5, 'alien8', 25, DROP768, false, true)
    ],
    [
      convoy(200, 'alien9', 10, T_CIRC, false, false),
      convoy(50, 'alien9', 20, T_CIRC, true, false),
      convoy(50, 'alien9', 30, T_CIRC, false, false),
      convoy(50, 'alien9', 40, T_CIRC, true, false),
      convoy(50, 'alien9', 50, T_CIRC, false, true),
      convoy(50, 'alien9', 50, T_CIRC, true, true),
      convoy(50, 'alien9', 40, T_CIRC, false, false),
      convoy(50, 'alien9', 30, T_CIRC, true, false),
      convoy(50, 'alien9', 20, T_CIRC, false, false),
      convoy(50, 'alien9', 10, T_CIRC, true, false)
    ],
    [
      convoy(200, 'alien10', 50, BOING, false, false),
      convoy(50, 'alien10', 50, BOING, true, false),
      convoy(10, 'alien10', 50, BOING, false, true),
      convoy(10, 'alien10', 50, BOING, false, true),
      convoy(10, 'alien10', 50, BOING, false, true),
      convoy(10, 'alien10', 50, BOING, false, true),
      convoy(10, 'alien10', 50, BOING, false, true),
      convoy(10, 'alien10', 50, BOING, false, true)
    ],
    [
      convoy(200, 'alien11', 50, SINE, false, true),
      convoy(25, 'alien11', 50, SINE, false, true),
      convoy(25, 'alien11', 50, SINE, false, true),
      convoy(25, 'alien11', 50, SINE, false, true)
    ],
    [
      convoy(200, 'alien12', 13, DROP128, false, false),
      convoy(0, 'alien12', 13, DROP896, false, false),
      convoy(0, 'alien12', 13, DROP256, false, false),
      convoy(0, 'alien12', 13, DROP768, false, false),
      convoy(0, 'alien12', 13, DROP384, false, false),
      convoy(0, 'alien12', 13, DROP640, false, false),
      convoy(0, 'alien13', 25, DROP512, false, false)
    ],
    [
      convoy(100, 'alien14', 50, V_PATH, false, true),
      convoy(0, 'alien1', 50, V_PATH, false, true),
      convoy(0, 'alien2', 50, V_PATH, false, true),
      convoy(0, 'alien3', 50, V_PATH, false, true),
      convoy(0, 'alien4', 50, V_PATH, false, true),
      convoy(0, 'alien5', 50, V_PATH, false, true),
      convoy(0, 'alien6', 50, V_PATH, false, true),
      convoy(0, 'alien7', 50, V_PATH, false, true),
      convoy(0, 'alien8', 50, V_PATH, false, true),
      convoy(0, 'alien9', 50, V_PATH, false, true)
    ]
  ];

  var ALIEN_EXPLOSION_COLOR = { r: 65535, g: 65535, b: 54 * 1024 };
  var PLAYER_EXPLOSION_COLOR = { r: 54 * 1024, g: 54 * 1024, b: 65535 };

  var BONUS = XG.BONUS = {
    NONE: 0,
    SPEED: 1,
    FIRE: 2,
    SHIELD: 3,
    MULTI: 4
  };
  var BONUS_PIX = [null, 'bonus_speed', 'bonus_fire', 'bonus_shield', 'bonus_multi'];

  // statics in the C++ AliensManager: shared by all levels and games
  var bonusState = XG.bonusState = {
    wait: 0,
    created: 0,
    table: [1, 1, 1, 1, 2, 2, 2, 2, 2, 4, 4, 3, 3]
  };

  /*
   * Sprite / projectiles
   */
  class Sprite {
    constructor(image, x, y) {
      this.pix = image;
      this.x = x;
      this.y = y;
    }
    get width() { return this.pix.width; }
    get height() { return this.pix.height; }
    collide(other) {
      return Math.abs(this.x - other.x) * 2 < this.width + other.width &&
             Math.abs(this.y - other.y) * 2 < this.height + other.height;
    }
    draw(ctx) { this.pix.draw(ctx, this.x, this.y); }
  }

  class Projectile extends Sprite {
    constructor(image, x, y, speedX, speedY) {
      super(image, x, y);
      this.speedX = speedX;
      this.speedY = speedY;
    }
    move() { this.x += this.speedX; this.y += this.speedY; }
    out() {
      return this.y - this.height / 2 + this.height < 0 ||
             this.y - this.height / 2 >= Config.height;
    }
  }

  class Bonus extends Projectile {
    constructor(x, y, type) {
      super(pix(BONUS_PIX[type]), x, y, 0, 1);
      this.type = type;
    }
  }

  /*
   * Trajectory - arrival path, joining, cruising formation, random attack.
   */
  class Trajectory {
    constructor(arrival, mirrored, baseCruise, deltaCruise) {
      if (!arrival || arrival[0] === RC_END) throw new Error('Empty arrival trajectory');
      this.stage = 'arriving';
      this.arrival = arrival;
      this.index = 0;
      this.mirrored = mirrored;
      this.baseCruise = baseCruise;
      this.deltaCruise = deltaCruise;
      this.attack = [];
      this.attackIndex = 0;
    }

    initPosition() {
      var point = this.mirrored ? mirror(this.arrival[0]) : this.arrival[0];
      return toPixel(point);
    }

    nextPosition(from, velocity) {
      if (!velocity) return from;
      var dx, dy, length, scale, goal, cruise;

      switch (this.stage) {
      case 'arriving':
        goal = toPixel(this.mirrored ? mirror(this.arrival[this.index]) : this.arrival[this.index]);
        dx = goal.x - from.x;
        dy = goal.y - from.y;
        length = Math.sqrt(dx * dx + dy * dy);
        scale = length / velocity;
        if (scale < 1.0) {
          ++this.index;
          if (!this.arrival[this.index] || this.arrival[this.index] === RC_END) {
            this.stage = 'joining';
          }
          return this.nextPosition(from, velocity);
        }
        return { x: from.x + dx / scale, y: from.y + dy / scale };

      case 'joining':
        cruise = {
          x: this.baseCruise.x + this.deltaCruise.x,
          y: this.baseCruise.y + this.deltaCruise.y
        };
        dx = cruise.x - from.x;
        dy = cruise.y - from.y;
        length = Math.sqrt(dx * dx + dy * dy);
        scale = length / velocity;
        if (scale <= 1.0) {
          this.stage = 'cruising';
          return cruise;
        }
        return { x: from.x + dx / scale, y: from.y + dy / scale };

      case 'cruising':
        return {
          x: this.baseCruise.x + this.deltaCruise.x,
          y: this.baseCruise.y + this.deltaCruise.y
        };

      case 'attacking':
      default:
        goal = toPixel(this.attack[this.attackIndex]);
        dx = goal.x - from.x;
        dy = goal.y - from.y;
        length = Math.sqrt(dx * dx + dy * dy);
        scale = length / Math.max(1, velocity - 1);
        if (scale < 1.0) {
          ++this.attackIndex;
          if (this.attackIndex >= this.attack.length) {
            this.attack = [];
            this.stage = 'joining';
            return { x: from.x, y: -ALIEN_HEIGHT };
          }
          return this.nextPosition(from, velocity);
        }
        return { x: from.x + dx / scale, y: from.y + dy / scale };
      }
    }

    buildAttack(from) {
      var minDeltaY = RC_MAX / 64;
      var next = toRCoord(from);
      this.attack = [];
      do {
        next = {
          x: next.x + randInt(Math.trunc(RC_MAX / 3)) - Math.trunc(Math.trunc(RC_MAX / 3) / 2),
          y: next.y + randInt(Math.trunc(RC_MAX / 4)) + minDeltaY
        };
        this.attack.push({ x: next.x, y: next.y });
      } while (!(next.y < 0 || next.y >= RC_MAX));
      this.attackIndex = 0;
      this.stage = 'attacking';
    }
  }

  class Alien extends Sprite {
    constructor(image, trajectory, speed) {
      var start = trajectory.initPosition();
      super(image, start.x, start.y);
      this.trajectory = trajectory;
      this.speed = speed;
    }
    move() {
      var next = this.trajectory.nextPosition({ x: this.x, y: this.y }, this.speed);
      this.x = next.x;
      this.y = next.y;
    }
    get stage() { return this.trajectory.stage; }
    buildAttack() { this.trajectory.buildAttack({ x: this.x, y: this.y }); }
    cannonPosition() {
      return {
        x: this.x,
        y: this.y + this.height - Math.floor(this.height / 2)
      };
    }
  }

  /*
   * Managers
   */
  class BulletsManager {
    constructor() { this.list = []; }
    get length() { return this.list.length; }
    add(imageName, x, y, speedX, speedY) {
      this.list.push(new Projectile(pix(imageName), x, y, speedX, speedY));
    }
    move() {
      for (var i = 0; i < this.list.length;) {
        var bullet = this.list[i];
        bullet.move();
        if (bullet.out()) this.list.splice(i, 1);
        else ++i;
      }
    }
    doCollisions(other, max) {
      var hits = 0;
      for (var i = 0; i < this.list.length && hits < max;) {
        if (this.list[i].collide(other)) {
          ++hits;
          this.list.splice(i, 1);
        } else {
          ++i;
        }
      }
      return hits;
    }
    draw(ctx) {
      for (var i = 0; i < this.list.length; ++i) this.list[i].draw(ctx);
    }
  }

  class BonusManager {
    constructor() { this.list = []; }
    add(x, y, type) { this.list.push(new Bonus(x, y, type)); }
    move() {
      for (var i = 0; i < this.list.length;) {
        var bonus = this.list[i];
        bonus.move();
        if (bonus.out()) this.list.splice(i, 1);
        else ++i;
      }
    }
    getBonusCollision(other) {
      for (var i = 0; i < this.list.length;) {
        var bonus = this.list[i];
        if (bonus.collide(other)) {
          var type = bonus.type;
          this.list.splice(i, 1);
          return type;
        }
        ++i;
      }
      return BONUS.NONE;
    }
    draw(ctx) {
      for (var i = 0; i < this.list.length; ++i) this.list[i].draw(ctx);
    }
  }

  class Explosion {
    constructor(x, y, speedX, speedY, color, duration) {
      this.color = { r: color.r, g: color.g, b: color.b };
      this.moves = 0;
      this.duration = duration == null ? 24 : duration;
      this.dots = [];
      this.speeds = [];

      var count = Math.trunc(16 * this.duration * Config.details / Config.maxDetails);
      for (var i = 0; i < count; ++i) {
        var px = randInt(16) + randInt(16) - 16;
        var py = randInt(16) + randInt(16) - 16;
        this.dots.push({ x: px + x, y: py + y });
        this.speeds.push({
          x: Math.trunc(px / 4) + speedX + randInt(5) - 2,
          y: Math.trunc(py / 4) + speedY + randInt(5) - 2
        });
      }
    }
    move() {
      if (this.moves < this.duration) {
        ++this.moves;
        if (this.moves < this.duration) {
          for (var i = 0; i < this.dots.length; ++i) {
            this.dots[i].x += this.speeds[i].x;
            this.dots[i].y += this.speeds[i].y;
          }
          this.color.r = Math.trunc(this.color.r * 98 / 100);
          this.color.g = Math.trunc(this.color.g * 96 / 100);
          this.color.b = Math.trunc(this.color.b * 96 / 100);
          if (this.color.r < 48 * 1024 && this.color.r > 36 * 1024) {
            this.color.r = Math.trunc(this.color.r * 96 / 100);
            this.color.g = Math.trunc(this.color.g * 92 / 100);
            this.color.b = Math.trunc(this.color.b * 92 / 100);
          }
        }
      }
    }
    get finished() { return this.moves >= this.duration; }
    draw(ctx) {
      if (!this.dots.length) return;
      var r = Math.round(this.color.r / 257);
      var g = Math.round(this.color.g / 257);
      var b = Math.round(this.color.b / 257);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      for (var i = 0; i < this.dots.length; ++i) {
        ctx.fillRect(Math.round(this.dots[i].x), Math.round(this.dots[i].y), 1, 1);
      }
    }
  }

  class ExplosionsManager {
    constructor() { this.list = []; }
    add(x, y, speedX, speedY, color, duration) {
      this.list.push(new Explosion(x, y, speedX, speedY, color, duration));
    }
    move() {
      for (var i = 0; i < this.list.length;) {
        var explosion = this.list[i];
        explosion.move();
        if (explosion.finished) this.list.splice(i, 1);
        else ++i;
      }
    }
    draw(ctx) {
      for (var i = 0; i < this.list.length; ++i) this.list[i].draw(ctx);
    }
  }

  class AliensManager {
    constructor(level, bullets, bombs, bonuses, explosions) {
      this.level = level;
      this.bullets = bullets;
      this.bombs = bombs;
      this.bonuses = bonuses;
      this.explosions = explosions;
      this.convoys = LEVELS[(level - 1) % LEVELS.length];
      this.maxConvoySize = this.getMaxConvoySize();
      this.convoyIndex = 0;
      this.convoyAlienIndex = 0;
      this.speed = Math.trunc(level / (LEVELS.length + 1)) + 3;
      this.baseCruise = { x: 0, y: ALIEN_HEIGHT };
      this.baseSpeed = 1;
      this.nextCreation = 'new_convoy';
      this.nextWait = this.convoys[0].wait;
      this.aliens = [];
      if (level === 1) bonusState.wait = 20;
    }

    convoySize(c) {
      return Math.trunc(Math.trunc(Config.width * c.percent / ALIEN_HSPACING) / 100);
    }

    getMaxConvoySize() {
      var maximum = 0;
      for (var i = 0; i < this.convoys.length; ++i) {
        maximum = Math.max(maximum, this.convoySize(this.convoys[i]));
      }
      return maximum;
    }

    move() {
      this.baseCruise.x += this.baseSpeed;
      if ((this.baseSpeed < 0 && this.baseCruise.x <= ALIEN_WIDTH / 2) ||
          (this.baseSpeed > 0 &&
           this.baseCruise.x >= Config.width - ALIEN_WIDTH / 2 -
                             (this.maxConvoySize - 1) * ALIEN_HSPACING)) {
        this.baseSpeed *= -1;
      }
      for (var i = 0; i < this.aliens.length; ++i) this.aliens[i].move();
      if (this.nextWait === 0) this.creation();
      else --this.nextWait;
    }

    creation() {
      var c, size, delta, mirrored, alien;

      switch (this.nextCreation) {
      case 'new_convoy':
        this.convoyAlienIndex = 0;
        this.nextCreation = 'new_alien';
        /* falls through */
      case 'new_alien':
        c = this.convoys[this.convoyIndex];
        size = this.convoySize(c);
        delta = {
          x: (this.convoyAlienIndex + Math.trunc((this.maxConvoySize - size) / 2)) * ALIEN_HSPACING,
          y: (this.convoys.length - this.convoyIndex - 1) * ALIEN_VSPACING
        };
        mirrored = c.mirror !== (c.split && this.convoyAlienIndex % 2 === 0);
        alien = new Alien(pix(c.alien),
                          new Trajectory(c.path, mirrored, this.baseCruise, delta),
                          this.speed);
        this.aliens.push(alien);

        if (++this.convoyAlienIndex < size) {
          this.nextWait = Math.trunc(30 / this.speed);
        } else {
          ++this.convoyIndex;
          if (this.convoyIndex < this.convoys.length) {
            this.nextCreation = 'new_convoy';
            this.nextWait = this.convoys[this.convoyIndex].wait;
          } else {
            this.nextCreation = 'new_attack';
            this.nextWait = Math.max(50, 750 - this.level * 33);
          }
        }
        break;

      case 'new_attack':
        var attacking = 0;
        for (var i = 0; i < this.aliens.length; ++i) {
          if (this.aliens[i].stage === 'attacking') ++attacking;
        }
        for (var j = 0; j < this.aliens.length && attacking < this.level * 3; ++j) {
          if (this.aliens[j].stage === 'cruising') {
            this.aliens[j].buildAttack();
            ++attacking;
          }
        }
        this.nextWait = 5;
        break;
      }
    }

    fire() {
      var limit = Math.trunc(3 * this.level * this.maxConvoySize / 12);
      for (var i = 0; i < this.aliens.length && this.bombs.length < limit; ++i) {
        var alien = this.aliens[i];
        if (alien.stage !== 'cruising' && alien.stage !== 'joining' &&
            randInt(50) < this.speed) {
          var bx = randInt(3) + randInt(3) - 2;
          var by = Math.trunc(this.speed * 3 / 2) - Math.abs(bx);
          var cannon = alien.cannonPosition();
          this.bombs.add('bomb', cannon.x, cannon.y, bx, by);
        }
      }
    }

    doBulletsCollisions() {
      var killed = 0;
      for (var i = 0; i < this.aliens.length;) {
        var alien = this.aliens[i];
        if (this.bullets.doCollisions(alien, 1)) {
          this.explosions.add(alien.x, alien.y, 0, -4, ALIEN_EXPLOSION_COLOR);
          this.createBonusMaybe(alien.x, alien.y);
          this.aliens.splice(i, 1);
          ++killed;
          if (window.Sfx) window.Sfx.alienExplode();
        } else {
          ++i;
        }
      }
      return killed;
    }

    createBonusMaybe(x, y) {
      if (--bonusState.wait > 0) return;
      if (bonusState.created % bonusState.table.length === 0) {
        bonusState.created = 0;
        shuffle(bonusState.table);
      }
      bonusState.wait = this.maxConvoySize * 5;
      this.bonuses.add(x, y, bonusState.table[bonusState.created++]);
    }

    finished() {
      return this.nextCreation === 'new_attack' && this.aliens.length === 0;
    }
  }

  class Player extends Sprite {
    constructor(bullets, bombs, bonuses, explosions, belowY) {
      super(pix('player'), Config.width / 2, -50);
      this.bullets = bullets;
      this.bombs = bombs;
      this.bonuses = bonuses;
      this.explosions = explosions;
      this.belowY = belowY;
      this.shield = 3;
      this.speed = 2;
      this.fireWait = 0;
      this.fireInterval = 24;
      this.multi = 1;
      this.dead = false;
      this.y = this.posY();
    }

    posY() {
      return Config.height - this.belowY - this.height / 2;
    }

    tick() {
      if (this.fireWait > 0) --this.fireWait;
      this.y = this.posY();
    }

    move(direction) {
      this.tick();
      this.x += direction * this.speed;
      var half = this.width / 2;
      if (this.x < half) this.x = half;
      else {
        var maxRight = Config.width - half - 1;
        if (this.x > maxRight) this.x = maxRight;
      }
    }

    follow(pointerX) {
      this.tick();
      var half = this.width / 2;
      this.x = Math.max(half, Math.min(Config.width - half - 1, pointerX));
    }

    fire() {
      if (this.fireWait > 0) return;
      this.fireWait = this.fireInterval;
      var halfMulti = Math.floor(this.multi / 2);
      for (var i = 0; i < this.multi; ++i) {
        var speedX = i - halfMulti;
        if (this.multi % 2 === 0 && i >= halfMulti) ++speedX;
        this.bullets.add('bullet', this.x, this.y - this.height / 2, speedX, -10);
      }
      if (window.Sfx) window.Sfx.shoot();
    }

    doBombsCollisions() {
      var hits = this.bombs.doCollisions(this, this.shield + 1);
      while (hits > 0) {
        --this.shield;
        this.explosions.add(this.x, this.y, 0, 0, PLAYER_EXPLOSION_COLOR, 50);
        --hits;
      }
    }

    doBonusCollisions() {
      var type;
      while ((type = this.bonuses.getBonusCollision(this)) !== BONUS.NONE) {
        switch (type) {
        case BONUS.SPEED: this.extraSpeed(); break;
        case BONUS.FIRE: this.extraFire(); break;
        case BONUS.MULTI: this.extraMulti(); break;
        case BONUS.SHIELD: this.extraShield(); break;
        }
        if (window.Sfx) window.Sfx.bonus();
      }
    }

    extraFire() {
      if (this.fireInterval > 5) {
        this.fireInterval = Math.trunc(this.fireInterval * 3 / 4);
        this.fireWait = Math.trunc(this.fireWait * 3 / 4);
      }
    }

    extraMulti() {
      if (this.multi < 9) {
        this.fireInterval = Math.trunc(this.fireInterval * (this.multi + 1) / this.multi);
        this.fireWait = Math.trunc(this.fireWait * (this.multi + 1) / this.multi);
        ++this.multi;
      }
    }

    extraShield() { ++this.shield; }
    extraSpeed() { ++this.speed; }
  }

  XG.createGame = function () {
    var bullets = new BulletsManager();
    var bombs = new BulletsManager();
    var bonuses = new BonusManager();
    var explosions = new ExplosionsManager();
    bonusState.created = 0;
    bonusState.wait = 0;

    var aliens = new AliensManager(1, bullets, bombs, bonuses, explosions);
    var player = new Player(bullets, bombs, bonuses, explosions, 20);

    return {
      bullets: bullets,
      bombs: bombs,
      bonuses: bonuses,
      explosions: explosions,
      aliens: aliens,
      player: player,
      score: 0,
      level: 1,
      shield: player.shield,
      levelFlash: 0,
      cheatRequested: false,
      cheated: false,
      overTicks: 0,
      overQualifies: false,
      resize: function () {
        this.player.y = this.player.posY();
        this.player.x = Math.max(this.player.width / 2,
          Math.min(Config.width - this.player.width / 2 - 1, this.player.x));
      },
      update: function () {
        var oldScore = this.score;
        var oldThousands = Math.floor(oldScore / 1000);
        this.score += this.aliens.doBulletsCollisions();
        var newThousands = Math.floor(this.score / 1000);
        while (newThousands > oldThousands) {
          this.player.extraShield();
          --newThousands;
        }

        this.player.doBombsCollisions();
        this.player.doBonusCollisions();

        if (this.cheatRequested) {
          this.cheated = true;
          this.player.extraFire();
          this.player.extraShield();
          this.cheatRequested = false;
        }

        this.shield = this.player.shield;
        if (this.shield < 0) {
          this.player.dead = true;
          this.player.y = -100;
          this.explosions.add(this.player.x, this.player.posY(), 0, 0,
                              PLAYER_EXPLOSION_COLOR, 50);
          return false; // player died
        }

        if (this.aliens.finished()) {
          ++this.level;
          this.aliens = new AliensManager(this.level, this.bullets, this.bombs,
                                          this.bonuses, this.explosions);
          this.levelFlash = 100;
          if (window.Sfx) window.Sfx.levelUp();
        }
        return true;
      }
    };
  };

  XG.toPixel = toPixel;
  XG.toRCoord = toRCoord;
  XG.RC_END = RC_END;
  XG.ALIEN_EXPLOSION_COLOR = ALIEN_EXPLOSION_COLOR;
  XG.PLAYER_EXPLOSION_COLOR = PLAYER_EXPLOSION_COLOR;
})();
