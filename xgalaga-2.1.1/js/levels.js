/*
 * levels.js - reads XGalaga .xgl level files.
 *
 * The format (see pathfile.c in the original source):
 *   path.<id>: <sx>,<sy>: <dir><duration> <dir><duration> ...
 *   shapes:\  six rows of ten cells
 *   paths:\   six rows of ten cells (path id per alien)
 *   delays:\  six rows of ten numbers
 *
 * Cells are 60 aliens: row 0 (indices 0-9) is the flagship row.
 */
(function () {
  'use strict';

  const DIRS = {
    n: 0, nne: 1, ne: 2, ene: 3, e: 4, ese: 5, se: 6, sse: 7,
    s: 8, ssw: 9, sw: 10, wsw: 11, w: 12, wnw: 13, nw: 14, nnw: 15,
  };

  // 16 compass directions, 4 units per step (main.c moves[16][2]).
  const MOVES = [
    [0, -4], [1, -4], [3, -3], [4, -1],
    [4, 0], [4, 1], [3, 3], [1, 4],
    [0, 4], [-1, 4], [-3, 3], [-4, 1],
    [-4, 0], [-4, -1], [-3, -3], [-1, -4],
  ];

  // Attack paths from paths.c.  Each entry is [direction, frames].
  const ATTACK_PATHS = [
    /* 0  PEELLEFT   */ [[0, 3], [15, 3], [14, 3], [13, 3], [12, 3], [11, 3], [10, 3], [9, 3], [8, 3]],
    /* 1  PEELRIGHT  */ [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3]],
    /* 2  LOOP       */ [[8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2]],
    /* 3  SWOOP1     */ [[8, 20], [9, 3], [10, 3], [11, 3], [12, 3]],
    /* 4  SWOOP2     */ [[8, 20], [7, 3], [6, 3], [5, 3], [4, 3]],
    /* 5  ZIGZAG     */ [[7, 15], [8, 2], [9, 15], [8, 2], [7, 15], [8, 2], [9, 15], [8, 2]],
    /* 6  LOOP2      */ [[8, 2], [7, 2], [6, 2], [5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2], [15, 2], [14, 2], [13, 2], [12, 2], [11, 2], [10, 2], [9, 2], [8, 2]],
    /* 7  SPIN       */ [[8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [15, 1], [14, 1], [13, 1], [12, 1], [11, 1], [10, 1], [9, 1], [8, 1]],
    /* 8  LEFTDIAG   */ [[8, 2], [9, 2], [10, 30], [9, 2], [8, 1]],
    /* 9  RIGHTDIAG  */ [[8, 2], [7, 2], [6, 30], [7, 2], [8, 1]],
    /* 10 ENTER1     */ [[8, 65], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 20]],
    /* 11 ENTER2     */ [[8, 65], [7, 5], [6, 5], [5, 5], [4, 5], [3, 5], [2, 20]],
    /* 12 ENTER3     */ [],
    /* 13 ENTER4     */ [[10, 45], [11, 5], [12, 20], [13, 5], [14, 10]],
    /* 14 ENTER5     */ [[6, 45], [5, 5], [4, 20], [3, 5], [2, 10]],
    /* 15 ENTER6     */ [[8, 80], [6, 10], [4, 40], [0, 20], [14, 30]],
    /* 16 ENTER7     */ [[8, 80], [10, 10], [12, 40], [0, 20], [2, 30]],
    /* 17 ENTER8     */ [[0, 50], [2, 50], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 30], [13, 5], [14, 5], [15, 5], [0, 5]],
    /* 18 ENTER9     */ [[0, 50], [14, 50], [13, 5], [12, 5], [11, 5], [10, 5], [9, 5], [8, 5], [7, 5], [6, 5], [5, 5], [4, 30], [3, 5], [2, 5], [1, 5], [0, 5]],
    /* 19 ENTER10    */ [[4, 80], [10, 30], [0, 70]],
    /* 20 ENTER11    */ [[12, 80], [6, 30], [0, 70]],
    /* 21 ENTER12    */ [[14, 80]],
    /* 22 ENTER13    */ [[2, 80]],
    /* 23 ENTER14    */ [[4, 8], [3, 6], [2, 8], [1, 10], [2, 8], [3, 6], [4, 4], [5, 6], [6, 8], [7, 10], [6, 8], [5, 6], [4, 4], [3, 6], [2, 8], [1, 10], [0, 20]],
    /* 24 ENTER15    */ [[12, 60], [11, 3], [10, 3], [9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3], [15, 3], [14, 3], [13, 3], [12, 3], [11, 3], [10, 3], [9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3], [15, 3], [14, 3], [13, 3], [12, 3], [11, 3], [10, 3], [9, 3], [8, 3], [7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [0, 20]],
    /* 25 ENTER16    */ [[4, 60], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [0, 20]],
    /* 26 ZIGZAG2    */ [[7, 15], [8, 3], [9, 15], [8, 3], [7, 15], [8, 3], [9, 15], [8, 3], [7, 15], [8, 3], [9, 15], [8, 3]],
    /* 27 WEAVE      */ [[12, 60], [4, 30], [12, 30], [4, 30], [12, 30], [8, 20]],
    /* 28 ENTER19    */ [[10, 80]],
    /* 29 ENTER20    */ [[6, 80]],
  ];

  const P_PEELLEFT = 0;
  const P_PEELRIGHT = 1;
  const ATTACK_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9];

  function mergeLines(text) {
    const out = [];
    let pending = null;
    for (const raw of text.split(/\r?\n/)) {
      if (pending === null) pending = raw;
      else pending += raw;
      if (pending.endsWith('\\')) {
        pending = pending.slice(0, -1) + ' ';
      } else {
        out.push(pending);
        pending = null;
      }
    }
    if (pending !== null) out.push(pending);
    return out;
  }

  function charToIndex(ch) {
    if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
    if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 97 + 10;
    if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 65 + 36;
    return -1;
  }

  function parseGrid(data, mapper) {
    const out = new Array(60).fill(-1);
    let i = 0;
    for (const ch of data) {
      if (/\s/.test(ch)) continue;
      if (i >= 60) break;
      out[i++] = mapper(ch);
    }
    return out;
  }

  function parseDelays(data) {
    const out = new Array(60).fill(0);
    const tokens = data.trim().split(/\s+/);
    for (let i = 0; i < 60 && i < tokens.length; i++) {
      const m = tokens[i].match(/^[+-]?\d+/);
      out[i] = m ? parseInt(m[0], 10) : 0;
    }
    return out;
  }

  function parseLevel(text, W, H) {
    const level = {
      paths: {},
      shape: new Array(60).fill(-1),
      path: new Array(60).fill(-1),
      delay: new Array(60).fill(0),
    };

    for (const line of mergeLines(text)) {
      if (line.startsWith('path.')) {
        const idChar = line[5];
        const id = charToIndex(idChar);
        if (id < 0) continue;
        const body = line.slice(line.indexOf(':') + 1).trim();
        const halves = body.split(':');
        const start = halves[0].split(',');
        const sx = parseInt(start[0], 10) || 0;
        const sy = parseInt(start[1], 10) || 0;
        const entries = [];
        const re = /([nsew]{1,3})\s*(\d+)/g;
        let m;
        while ((m = re.exec(halves[1] || '')) !== null) {
          const dir = DIRS[m[1]];
          if (dir === undefined) continue;
          entries.push([dir, parseInt(m[2], 10)]);
        }
        level.paths[id] = {
          x: Math.trunc((W * sx) / 400),
          y: Math.trunc((H * sy) / 500),
          entries,
        };
      } else if (line.startsWith('shapes:')) {
        level.shape = parseGrid(line.slice(7), charToIndex);
      } else if (line.startsWith('paths:')) {
        level.path = parseGrid(line.slice(6), charToIndex);
      } else if (line.startsWith('delays:')) {
        level.delay = parseDelays(line.slice(7));
      }
    }

    return level;
  }

  /**
   * Levels above 15 wrap around, like the original (metaLevel increases and
   * aliens enter/steer faster).
   */
  function getLevel(number, assetsLevels, W, H) {
    const base = ((number - 1) % 15) + 1;
    const meta = Math.floor((number - 1) / 15) + 1;
    const text = assetsLevels['level' + base];
    if (!text) throw new Error('Missing level ' + base);
    const data = parseLevel(text, W, H);
    data.number = number;
    data.base = base;
    data.meta = meta;
    return data;
  }

  function pathDir(path, pos) {
    const p = ATTACK_PATHS[path];
    if (!p || pos < 0 || pos >= p.length) return [-1, -1];
    return p[pos];
  }

  window.XGAL = window.XGAL || {};
  window.XGAL.DIRS = DIRS;
  window.XGAL.MOVES = MOVES;
  window.XGAL.ATTACK_PATHS = ATTACK_PATHS;
  window.XGAL.ATTACK_CHOICES = ATTACK_CHOICES;
  window.XGAL.P_PEELLEFT = P_PEELLEFT;
  window.XGAL.P_PEELRIGHT = P_PEELRIGHT;
  window.XGAL.parseLevel = parseLevel;
  window.XGAL.getLevel = getLevel;
  window.XGAL.pathDir = pathDir;
})();
