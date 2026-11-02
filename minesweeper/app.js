/* ============================================================
   Minesweeper — game + Windows 2000 desktop shell
   Plain JavaScript, no frameworks, no build step.
   ============================================================ */

(() => {
  'use strict';

  /* ----------------------------- helpers ----------------------------- */

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const icon = (name, cls = 'cell-icon') =>
    `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

  const desktopEl = $('#desktop');
  const boardEl = $('#board');
  const mineCounterEl = $('#mine-counter');
  const timerEl = $('#timer');
  const smileyBtn = $('#smiley');
  const taskListEl = $('#task-list');
  const startBtn = $('#start-btn');
  const startMenuEl = $('#start-menu');
  const clockEl = $('#clock');
  const trayEl = $('.tray');

  /* --------------------------- seven segment LED --------------------------- */

  const SEGMENT_MAP = {
    '0': 'abcdef',
    '1': 'bc',
    '2': 'abged',
    '3': 'abgcd',
    '4': 'fgbc',
    '5': 'afgcd',
    '6': 'afgedc',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
    '-': 'g'
  };

  const SEGMENT_RECTS = {
    a: [2, 0, 8, 2],
    b: [10, 1, 2, 8],
    c: [10, 11, 2, 8],
    d: [2, 18, 8, 2],
    e: [0, 11, 2, 8],
    f: [0, 1, 2, 8],
    g: [2, 9, 8, 2]
  };

  function ledDigit(character) {
    const lit = new Set((SEGMENT_MAP[character] || '').split(''));
    let rects = '';
    for (const key of 'abcdefg') {
      const [x, y, width, height] = SEGMENT_RECTS[key];
      rects += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${lit.has(key) ? '#ff2b22' : '#3a0505'}"/>`;
    }
    return `<svg class="led-digit" viewBox="0 0 12 20" aria-hidden="true">${rects}</svg>`;
  }

  function setLed(el, value) {
    let text;
    if (value < 0) {
      text = '-' + String(Math.min(99, Math.abs(value))).padStart(2, '0');
    } else {
      text = String(Math.min(999, value)).padStart(3, '0');
    }
    el.innerHTML = Array.from(text, ledDigit).join('');
    el.setAttribute('aria-label', String(value));
  }

  /* ------------------------------- faces ------------------------------- */

  const FACES = {
    smile: `<svg viewBox="0 0 17 17" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="7.6" fill="#ffff00" stroke="#000" stroke-width="1"/>
      <circle cx="5.7" cy="6.3" r="1.1" fill="#000"/>
      <circle cx="11.3" cy="6.3" r="1.1" fill="#000"/>
      <path d="M4.9 10.2c1.2 2.3 6 2.3 7.2 0" fill="none" stroke="#000" stroke-width="1.15" stroke-linecap="round"/>
    </svg>`,
    oh: `<svg viewBox="0 0 17 17" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="7.6" fill="#ffff00" stroke="#000" stroke-width="1"/>
      <circle cx="5.7" cy="5.6" r="1.1" fill="#000"/>
      <circle cx="11.3" cy="5.6" r="1.1" fill="#000"/>
      <ellipse cx="8.5" cy="11.2" rx="1.6" ry="1.9" fill="#000"/>
    </svg>`,
    dead: `<svg viewBox="0 0 17 17" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="7.6" fill="#ffff00" stroke="#000" stroke-width="1"/>
      <path d="M4.3 4.9l2.6 2.6M6.9 4.9L4.3 7.5M10.1 4.9l2.6 2.6M12.7 4.9l-2.6 2.6" stroke="#000" stroke-width="1.15" stroke-linecap="round"/>
      <path d="M5 12.4c1.2-2.1 5.8-2.1 7 0" fill="none" stroke="#000" stroke-width="1.15" stroke-linecap="round"/>
    </svg>`,
    cool: `<svg viewBox="0 0 17 17" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="7.6" fill="#ffff00" stroke="#000" stroke-width="1"/>
      <path d="M3.4 6.1h4.4v1.5a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" fill="#000"/>
      <path d="M9.2 6.1h4.4v1.5a1.4 1.4 0 0 1-1.4 1.4h-1.6a1.4 1.4 0 0 1-1.4-1.4z" fill="#000"/>
      <path d="M7.8 6.4h1.4" stroke="#000" stroke-width="1.1"/>
      <path d="M5.1 10.9c1 1.7 5.8 1.7 6.8 0" fill="none" stroke="#000" stroke-width="1.15" stroke-linecap="round"/>
    </svg>`
  };

  function setFace(face) {
    smileyBtn.innerHTML = FACES[face] || FACES.smile;
    smileyBtn.dataset.face = face;
  }

  /* ---------------------------- persistence ---------------------------- */

  const SETTINGS_KEY = 'minesweeper.settings.v1';
  const BEST_KEY = 'minesweeper.best.v1';
  const NAME_KEY = 'minesweeper.name.v1';

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* storage can be unavailable — the game still works */
    }
  }

  let settings = loadJson(SETTINGS_KEY, { marks: true, color: true });
  if (!settings || typeof settings !== 'object') settings = { marks: true, color: true };
  settings.marks = settings.marks !== false;
  settings.color = settings.color !== false;

  let bestTimes = loadJson(BEST_KEY, {});
  if (!bestTimes || typeof bestTimes !== 'object') bestTimes = {};
  for (const key of ['beginner', 'intermediate', 'expert']) {
    const entry = bestTimes[key];
    if (!entry || typeof entry !== 'object' || !Number.isFinite(Number(entry.time))) {
      delete bestTimes[key];
      continue;
    }
    entry.time = Math.max(1, Math.floor(Number(entry.time)));
    entry.name = String(entry.name || 'Anonymous').slice(0, 16);
  }

  /* --------------------------- window manager --------------------------- */

  const WINDOW_META = {
    minesweeper: { title: 'Minesweeper', icon: 'mine' },
    best: { title: 'Fastest Mine Sweepers', icon: 'trophy' },
    help: { title: 'Minesweeper Help', icon: 'help' },
    about: { title: 'About Minesweeper', icon: 'info' }
  };

  const windows = {};
  let activeWindow = null;
  let zTop = 10;

  function initWindows() {
    $$('.window[data-win]').forEach((el) => {
      const key = el.dataset.win;
      const meta = WINDOW_META[key];
      const open = !el.classList.contains('is-hidden');
      const record = {
        key,
        el,
        meta,
        open,
        minimized: false,
        placed: false,
        taskBtn: null
      };

      const taskBtn = document.createElement('button');
      taskBtn.type = 'button';
      taskBtn.className = 'task-btn';
      taskBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><use href="#i-${meta.icon}"></use></svg><span>${meta.title}</span>`;
      taskBtn.title = meta.title;
      taskBtn.addEventListener('click', () => taskButtonClick(record));
      taskBtn.hidden = !open;
      taskListEl.appendChild(taskBtn);
      record.taskBtn = taskBtn;

      el.classList.toggle('active', open);
      el.addEventListener('animationend', () => el.classList.remove('window-in'));
      windows[key] = record;
    });
  }

  function centerWindow(record, offset = 0) {
    const dw = desktopEl.clientWidth;
    const dh = desktopEl.clientHeight;
    const width = record.el.offsetWidth;
    const height = record.el.offsetHeight;
    const left = Math.max(6, Math.round((dw - width) / 2) + offset);
    const top = Math.max(6, Math.round((dh - height) / 2) + Math.round(offset * 0.6));
    record.el.style.left = Math.min(left, Math.max(6, dw - width - 6)) + 'px';
    record.el.style.top = Math.min(top, Math.max(6, dh - height - 6)) + 'px';
  }

  function openWindow(key, offset = 0) {
    const record = windows[key];
    if (!record) return;

    record.open = true;
    record.minimized = false;
    record.el.classList.remove('is-hidden');
    record.taskBtn.hidden = false;

    if (!record.placed) {
      record.placed = true;
      centerWindow(record, offset);
    }

    record.el.classList.remove('window-in');
    void record.el.offsetWidth;
    record.el.classList.add('window-in');

    focusWindow(key);
    if (key === 'best') renderBestTimes();
  }

  function closeWindow(key) {
    const record = windows[key];
    if (!record) return;
    record.open = false;
    record.minimized = false;
    record.el.classList.add('is-hidden');
    record.el.classList.remove('active');
    record.taskBtn.hidden = true;
    record.taskBtn.classList.remove('active');

    if (activeWindow === key) {
      activeWindow = null;
      closeMenus();
      focusTopWindow();
    }
  }

  function minimizeWindow(record) {
    if (!record.open) return;
    record.minimized = true;
    record.el.classList.add('is-hidden');
    record.el.classList.remove('active');
    record.taskBtn.classList.remove('active');
    if (activeWindow === record.key) activeWindow = null;
    focusTopWindow();
  }

  function focusWindow(key) {
    const record = windows[key];
    if (!record || !record.open || record.minimized) return;
    zTop += 1;
    activeWindow = key;
    record.el.style.zIndex = String(zTop);
    for (const [otherKey, other] of Object.entries(windows)) {
      const isActive = otherKey === key;
      other.el.classList.toggle('active', isActive);
      other.taskBtn.classList.toggle('active', isActive && other.open && !other.minimized);
    }
  }

  function focusTopWindow() {
    let top = null;
    let topZ = -Infinity;
    for (const record of Object.values(windows)) {
      if (!record.open || record.minimized) continue;
      const z = parseInt(record.el.style.zIndex, 10) || 0;
      if (z > topZ) {
        topZ = z;
        top = record;
      }
    }
    if (top) {
      focusWindow(top.key);
    } else {
      activeWindow = null;
      for (const record of Object.values(windows)) {
        record.el.classList.remove('active');
        record.taskBtn.classList.remove('active');
      }
    }
  }

  function taskButtonClick(record) {
    if (!record.open || record.minimized) {
      openWindow(record.key);
      return;
    }
    if (activeWindow === record.key) {
      minimizeWindow(record);
    } else {
      focusWindow(record.key);
    }
  }

  /* ------------------------------ dragging ------------------------------ */

  let dragState = null;

  function uiScale() {
    const value = parseFloat(getComputedStyle(document.documentElement).zoom);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const handle = event.target.closest('[data-drag]');
    if (!handle || event.target.closest('.tb-btn')) return;
    const winEl = handle.closest('.window[data-win]');
    if (!winEl) return;
    const record = windows[winEl.dataset.win];
    if (!record || !record.open || record.minimized) return;

    dragState = {
      record,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: winEl.offsetLeft,
      top: winEl.offsetTop,
      scale: uiScale()
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (error) { /* ignore */ }
    document.body.classList.add('dragging');
    event.preventDefault();
  });

  document.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const el = dragState.record.el;
    const dw = desktopEl.clientWidth;
    const dh = desktopEl.clientHeight;
    const width = el.offsetWidth;
    const keepVisible = Math.min(70, width);

    let left = dragState.left + (event.clientX - dragState.startX) / dragState.scale;
    let top = dragState.top + (event.clientY - dragState.startY) / dragState.scale;
    left = clamp(left, keepVisible - width, dw - keepVisible);
    top = clamp(top, 0, dh - 24);

    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  });

  function endDrag(event) {
    if (!dragState) return;
    if (event && event.pointerId !== dragState.pointerId) return;
    dragState = null;
    document.body.classList.remove('dragging');
  }

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', () => endDrag());

  /* ------------------------------- game ------------------------------- */

  const PRESETS = {
    beginner: { cols: 9, rows: 9, mines: 10, label: 'Beginner' },
    intermediate: { cols: 16, rows: 16, mines: 40, label: 'Intermediate' },
    expert: { cols: 30, rows: 16, mines: 99, label: 'Expert' }
  };

  let game = null;
  let cellSize = 16;
  let pressState = null;
  let suppressReveal = false;
  let scoreContext = null;

  function defaultFace() {
    if (!game) return 'smile';
    if (game.over) return game.won ? 'cool' : 'dead';
    return 'smile';
  }

  function updateStatus() {
    if (!game) return;
    setLed(mineCounterEl, game.mines - game.flags);
    setLed(timerEl, game.time);
  }

  function computeCellSize() {
    if (!game) return;
    const dw = desktopEl.clientWidth;
    const dh = desktopEl.clientHeight;
    const byWidth = Math.floor((dw - 36) / game.cols);
    const byHeight = Math.floor((dh - 114) / game.rows);
    cellSize = clamp(Math.min(16, byWidth, byHeight), 8, 16);
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    boardEl.style.setProperty('--cols', String(game.cols));
    boardEl.classList.toggle('mono', !settings.color);
    boardEl.setAttribute('aria-rowcount', String(game.rows));
    boardEl.setAttribute('aria-colcount', String(game.cols));

    const fragment = document.createDocumentFragment();
    const total = game.cols * game.rows;
    for (let index = 0; index < total; index++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = String(index);
      el.setAttribute('role', 'gridcell');
      const row = Math.floor(index / game.cols) + 1;
      const col = (index % game.cols) + 1;
      el.setAttribute('aria-label', `hidden, row ${row}, column ${col}`);
      const cell = {
        mine: false,
        count: 0,
        revealed: false,
        flag: false,
        question: false,
        wrong: false,
        exploded: false,
        el
      };
      game.cells.push(cell);
      fragment.appendChild(el);
    }
    boardEl.appendChild(fragment);
  }

  function fitWindowToBoard() {
    const record = windows.minesweeper;
    if (!record || !game) return;
    const winEl = record.el;
    const boardWidth = game.cols * cellSize;
    winEl.style.setProperty('--cell', cellSize + 'px');
    winEl.style.width = Math.max(168, boardWidth + 24) + 'px';

    const dw = desktopEl.clientWidth;
    const dh = desktopEl.clientHeight;
    const width = winEl.offsetWidth;
    const height = winEl.offsetHeight;
    let left = winEl.offsetLeft;
    let top = winEl.offsetTop;
    if (left > dw - 60) left = Math.max(4, dw - width - 6);
    if (left + width > dw - 4) left = Math.max(4, dw - width - 6);
    if (top + height > dh - 4) top = Math.max(4, dh - height - 6);
    winEl.style.left = left + 'px';
    winEl.style.top = top + 'px';
  }

  function newGame(cols, rows, mines, mode) {
    stopTimer();
    game = {
      cols,
      rows,
      mines,
      mode,
      cells: [],
      started: false,
      over: false,
      won: false,
      flags: 0,
      revealed: 0,
      time: 0,
      timerId: null,
      scorePrompted: false
    };

    computeCellSize();
    buildBoard();
    setFace('smile');
    updateStatus();
    updateChecks();
    fitWindowToBoard();
    closeMenus();
    hideModal('score-overlay');
  }

  function startTimer() {
    if (!game) return;
    game.time = 0;
    setLed(timerEl, 0);
    stopTimer();
    game.timerId = window.setInterval(() => {
      if (!game || game.over) return;
      if (game.time < 999) {
        game.time += 1;
        setLed(timerEl, game.time);
      }
    }, 1000);
  }

  function stopTimer() {
    if (game && game.timerId) {
      window.clearInterval(game.timerId);
      game.timerId = null;
    }
  }

  function neighborIndices(index) {
    const result = [];
    const row = Math.floor(index / game.cols);
    const col = index % game.cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) {
          result.push(nr * game.cols + nc);
        }
      }
    }
    return result;
  }

  function placeMines(safeIndex) {
    const total = game.cols * game.rows;
    const forbidden = new Set([safeIndex, ...neighborIndices(safeIndex)]);
    let pool = [];
    for (let index = 0; index < total; index++) {
      if (!forbidden.has(index)) pool.push(index);
    }
    /* Extremely dense custom fields may not leave a full 3x3 safe area. */
    if (pool.length < game.mines) {
      pool = [];
      for (let index = 0; index < total; index++) {
        if (index !== safeIndex) pool.push(index);
      }
    }

    for (let i = 0; i < game.mines; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      game.cells[pool[i]].mine = true;
    }

    for (let index = 0; index < total; index++) {
      const cell = game.cells[index];
      if (cell.mine) continue;
      cell.count = neighborIndices(index).reduce(
        (count, neighbor) => count + (game.cells[neighbor].mine ? 1 : 0),
        0
      );
    }
  }

  function renderCell(index) {
    const cell = game.cells[index];
    const el = cell.el;
    let classes = 'cell';
    let html = '';
    let label = 'hidden';

    if (cell.revealed) {
      classes += ' revealed';
      if (cell.mine) {
        classes += ' mine';
        if (cell.exploded) classes += ' exploded';
        html = icon('mine');
        label = 'mine';
      } else if (cell.count > 0) {
        classes += ' n' + cell.count;
        html = String(cell.count);
        label = String(cell.count) + ' adjacent mine' + (cell.count === 1 ? '' : 's');
      } else {
        label = 'empty';
      }
    } else if (cell.wrong) {
      classes += ' flagged wrong';
      html = icon('mine') + '<span class="wrong-x" aria-hidden="true">\u2715</span>';
      label = 'incorrect flag';
    } else if (cell.flag) {
      classes += ' flagged';
      html = icon('flag');
      label = 'flagged';
    } else if (cell.question) {
      classes += ' question';
      html = '?';
      label = 'question mark';
    }

    el.className = classes;
    el.innerHTML = html;

    const row = Math.floor(index / game.cols) + 1;
    const col = (index % game.cols) + 1;
    el.setAttribute('aria-label', `${label}, row ${row}, column ${col}`);
  }

  function revealCell(index) {
    if (!game || game.over) return;
    const cell = game.cells[index];
    if (!cell || cell.revealed || cell.flag) return;

    if (!game.started) {
      placeMines(index);
      game.started = true;
      startTimer();
    }

    if (cell.mine) {
      loseGame(index);
      return;
    }

    floodReveal(index);
    checkWin();
  }

  function floodReveal(start) {
    const stack = [start];
    while (stack.length > 0) {
      const index = stack.pop();
      const cell = game.cells[index];
      if (!cell || cell.revealed || cell.flag) continue;
      cell.revealed = true;
      cell.question = false;
      game.revealed += 1;
      renderCell(index);

      if (cell.count === 0) {
        for (const neighbor of neighborIndices(index)) {
          const neighborCell = game.cells[neighbor];
          if (!neighborCell.revealed && !neighborCell.flag) stack.push(neighbor);
        }
      }
    }
  }

  function toggleFlag(index) {
    if (!game || game.over) return;
    const cell = game.cells[index];
    if (!cell || cell.revealed) return;

    if (cell.flag) {
      cell.flag = false;
      game.flags -= 1;
      if (settings.marks) cell.question = true;
    } else if (cell.question) {
      cell.question = false;
    } else {
      cell.flag = true;
      cell.question = false;
      game.flags += 1;
    }

    renderCell(index);
    setLed(mineCounterEl, game.mines - game.flags);
  }

  function chord(index) {
    if (!game || game.over) return;
    const cell = game.cells[index];
    if (!cell || !cell.revealed || cell.count === 0) return;

    const neighbors = neighborIndices(index);
    const flags = neighbors.reduce(
      (count, neighbor) => count + (game.cells[neighbor].flag ? 1 : 0),
      0
    );
    if (flags !== cell.count) return;

    for (const neighbor of neighbors) {
      if (game.over) break;
      const neighborCell = game.cells[neighbor];
      if (!neighborCell.revealed && !neighborCell.flag) revealCell(neighbor);
    }
  }

  function checkWin() {
    if (!game || game.over) return;
    if (game.revealed === game.cols * game.rows - game.mines) winGame();
  }

  function winGame() {
    game.over = true;
    game.won = true;
    game.flags = game.mines;
    stopTimer();

    for (let index = 0; index < game.cells.length; index++) {
      const cell = game.cells[index];
      if (cell.mine) cell.flag = true;
      renderCell(index);
    }
    setLed(mineCounterEl, 0);
    setFace('cool');

    if (game.mode !== 'custom' && !game.scorePrompted) {
      game.scorePrompted = true;
      const finishedGame = game;
      window.setTimeout(() => {
        if (game !== finishedGame) return;
        const previous = bestTimes[finishedGame.mode];
        const time = Math.max(1, finishedGame.time);
        if (!previous || time < previous.time) {
          openScoreDialog(finishedGame.mode, time);
        }
      }, 450);
    }
  }

  function loseGame(explodedIndex) {
    game.over = true;
    game.won = false;
    stopTimer();

    const exploded = game.cells[explodedIndex];
    exploded.exploded = true;
    exploded.revealed = true;
    exploded.question = false;

    for (let index = 0; index < game.cells.length; index++) {
      const cell = game.cells[index];
      if (cell.mine && !cell.flag) cell.revealed = true;
      if (cell.flag && !cell.mine) cell.wrong = true;
      renderCell(index);
    }

    setFace('dead');
    updateStatus();
  }

  /* ---------------------------- board input ---------------------------- */

  boardEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  boardEl.addEventListener('pointerdown', (event) => {
    if (!game || game.over) return;
    const cellEl = event.target.closest('.cell');
    if (!cellEl) return;
    const index = Number(cellEl.dataset.i);

    if (event.pointerType === 'mouse') {
      if (event.buttons === 3) {
        /* Additional mouse buttons do not always send pointerdown; the
           mousedown listener below performs the actual chord. */
        event.preventDefault();
        suppressReveal = true;
        return;
      }
      if (event.button === 2) {
        event.preventDefault();
        suppressReveal = true;
        toggleFlag(index);
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
        suppressReveal = true;
        chord(index);
        return;
      }
      if (event.button === 0) {
        if (!game.cells[index].revealed) setFace('oh');
        cellEl.classList.add('pressing');
        pressState = { index, el: cellEl, touch: false, long: false, moved: false, timer: 0 };
      }
      return;
    }

    pressState = {
      index,
      el: cellEl,
      touch: true,
      startX: event.clientX,
      startY: event.clientY,
      long: false,
      moved: false,
      timer: 0
    };
    cellEl.classList.add('pressing');
    pressState.timer = window.setTimeout(() => {
      if (!pressState || pressState.index !== index) return;
      pressState.long = true;
      if (pressState.el) pressState.el.classList.remove('pressing');
      toggleFlag(index);
      if (navigator.vibrate) {
        try { navigator.vibrate(12); } catch (error) { /* ignore */ }
      }
    }, 420);
  });

  /* Both mouse buttons held down: chord. Some browsers only emit a
     pointerdown for the first button, so listen for mousedown as well. */
  boardEl.addEventListener('mousedown', (event) => {
    if (event.buttons !== 3) return;
    const cellEl = event.target.closest('.cell');
    if (!cellEl || !game || game.over) return;
    event.preventDefault();
    suppressReveal = true;
    chord(Number(cellEl.dataset.i));
  });

  boardEl.addEventListener('pointermove', (event) => {
    if (!pressState || !pressState.touch) return;
    if (Math.hypot(event.clientX - pressState.startX, event.clientY - pressState.startY) > 10) {
      pressState.moved = true;
      window.clearTimeout(pressState.timer);
      if (pressState.el) pressState.el.classList.remove('pressing');
    }
  });

  boardEl.addEventListener('pointerup', (event) => {
    if (!pressState) return;
    const press = pressState;
    pressState = null;
    window.clearTimeout(press.timer);
    if (press.el) press.el.classList.remove('pressing');

    const cellEl = event.target.closest('.cell');
    const releasedIndex = cellEl ? Number(cellEl.dataset.i) : -1;

    if (press.touch) {
      if (!press.long && !press.moved && releasedIndex === press.index) {
        revealCell(press.index);
      }
    } else if (event.button === 0) {
      if (!suppressReveal && releasedIndex === press.index) {
        revealCell(press.index);
      }
    }
    setFace(defaultFace());
  });

  boardEl.addEventListener('pointercancel', () => {
    if (!pressState) return;
    window.clearTimeout(pressState.timer);
    if (pressState.el) pressState.el.classList.remove('pressing');
    pressState = null;
    setFace(defaultFace());
  });

  boardEl.addEventListener('dblclick', (event) => {
    const cellEl = event.target.closest('.cell');
    if (!cellEl || !game) return;
    const index = Number(cellEl.dataset.i);
    if (game.cells[index].revealed) chord(index);
  });

  document.addEventListener('pointerup', (event) => {
    if (pressState) {
      window.clearTimeout(pressState.timer);
      if (pressState.el) pressState.el.classList.remove('pressing');
      pressState = null;
      setFace(defaultFace());
    }
    if (event.buttons === 0) suppressReveal = false;
  });

  window.addEventListener('resize', () => {
    if (!game) return;
    const previous = cellSize;
    computeCellSize();
    if (cellSize !== previous) fitWindowToBoard();
    else fitWindowToBoard();
  });

  smileyBtn.addEventListener('click', () => {
    if (!game) return;
    newGame(game.cols, game.rows, game.mines, game.mode);
  });

  /* ------------------------------- menus ------------------------------- */

  function closeMenus() {
    for (const menu of $$('.menu.open')) menu.classList.remove('open');
  }

  function updateChecks() {
    if (!game) return;
    for (const item of $$('.menu-item[data-cmd]')) {
      const cmd = item.dataset.cmd;
      if (cmd === 'beginner' || cmd === 'intermediate' || cmd === 'expert' || cmd === 'custom') {
        item.classList.toggle('checked', cmd === game.mode);
      } else if (cmd === 'marks') {
        item.classList.toggle('checked', settings.marks);
      } else if (cmd === 'color') {
        item.classList.toggle('checked', settings.color);
      }
    }
  }

  function runCommand(cmd) {
    if (!game && cmd !== 'help' && cmd !== 'about' && cmd !== 'best') return;

    switch (cmd) {
      case 'new': {
        newGame(game.cols, game.rows, game.mines, game.mode);
        openWindow('minesweeper');
        break;
      }
      case 'beginner':
      case 'intermediate':
      case 'expert': {
        const preset = PRESETS[cmd];
        newGame(preset.cols, preset.rows, preset.mines, cmd);
        openWindow('minesweeper');
        break;
      }
      case 'custom':
        openCustomDialog();
        break;
      case 'marks':
        settings.marks = !settings.marks;
        saveJson(SETTINGS_KEY, settings);
        updateChecks();
        break;
      case 'color':
        settings.color = !settings.color;
        saveJson(SETTINGS_KEY, settings);
        boardEl.classList.toggle('mono', !settings.color);
        updateChecks();
        break;
      case 'best':
        renderBestTimes();
        openWindow('best', 18);
        break;
      case 'reset-scores':
        bestTimes = {};
        saveJson(BEST_KEY, bestTimes);
        renderBestTimes();
        break;
      case 'help':
        openWindow('help', 30);
        break;
      case 'about':
        openWindow('about', 42);
        break;
      case 'exit':
        closeWindow('minesweeper');
        break;
      default:
        break;
    }
  }

  $('#menubar').addEventListener('click', (event) => {
    const label = event.target.closest('.menu-label');
    if (label) {
      const menu = label.parentElement;
      const wasOpen = menu.classList.contains('open');
      closeMenus();
      if (!wasOpen) menu.classList.add('open');
      return;
    }
    const item = event.target.closest('.menu-item');
    if (item) {
      closeMenus();
      runCommand(item.dataset.cmd);
    }
  });

  for (const menu of $$('.menu')) {
    menu.addEventListener('mouseenter', () => {
      if ($('.menu.open')) {
        closeMenus();
        menu.classList.add('open');
      }
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.menubar')) closeMenus();
    if (!event.target.closest('#start-menu') && !event.target.closest('#start-btn')) {
      closeStartMenu();
    }
  }, true);

  /* --------------------------- best times UI --------------------------- */

  function renderBestTimes() {
    for (const key of ['beginner', 'intermediate', 'expert']) {
      const entry = bestTimes[key];
      const timeEl = $(`[data-best-time="${key}"]`);
      const nameEl = $(`[data-best-name="${key}"]`);
      if (!timeEl || !nameEl) continue;
      if (entry) {
        timeEl.textContent = `${entry.time} seconds`;
        nameEl.textContent = entry.name;
      } else {
        timeEl.textContent = '---';
        nameEl.textContent = '';
      }
    }
  }

  function openScoreDialog(mode, time) {
    scoreContext = { mode, time };
    const preset = PRESETS[mode];
    const label = preset ? preset.label : mode;
    $('#score-text').innerHTML =
      `You have the fastest time for <b>${label}'s</b> level.<br>` +
      `Your time: <b>${time} second${time === 1 ? '' : 's'}</b>.<br>` +
      'Please enter your name:';
    const nameInput = $('#score-name');
    const storedName = loadJson(NAME_KEY, '');
    nameInput.value = typeof storedName === 'string' && storedName ? storedName : 'Anonymous';
    showModal('score-overlay');
    window.setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 40);
  }

  function saveScore() {
    if (!scoreContext) {
      hideModal('score-overlay');
      return;
    }
    const nameInput = $('#score-name');
    const name = (nameInput.value.trim() || 'Anonymous').slice(0, 16);
    bestTimes[scoreContext.mode] = { time: scoreContext.time, name };
    saveJson(BEST_KEY, bestTimes);
    saveJson(NAME_KEY, name);
    scoreContext = null;
    hideModal('score-overlay');
    renderBestTimes();
    openWindow('best', 18);
  }

  $('#score-ok').addEventListener('click', saveScore);
  $('#score-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveScore();
    }
  });

  $('[data-cmd="reset-scores"]').addEventListener('click', () => runCommand('reset-scores'));

  /* --------------------------- custom field UI --------------------------- */

  function openCustomDialog() {
    if (!game) return;
    $('#custom-height').value = String(game.rows);
    $('#custom-width').value = String(game.cols);
    $('#custom-mines').value = String(game.mines);
    $('#custom-error').textContent = '';
    showModal('custom-overlay');
    window.setTimeout(() => {
      const heightInput = $('#custom-height');
      heightInput.focus();
      heightInput.select();
    }, 40);
  }

  function submitCustom() {
    const rows = Math.floor(Number($('#custom-height').value));
    const cols = Math.floor(Number($('#custom-width').value));
    const mines = Math.floor(Number($('#custom-mines').value));
    const errorEl = $('#custom-error');

    if (!Number.isFinite(rows) || !Number.isFinite(cols) || !Number.isFinite(mines)) {
      errorEl.textContent = 'Please enter a number for height, width and mines.';
      return;
    }
    if (rows < 9 || rows > 50 || cols < 9 || cols > 50) {
      errorEl.textContent = 'Height and width must be between 9 and 50.';
      return;
    }
    const maxMines = cols * rows - 9;
    if (mines < 10) {
      errorEl.textContent = 'There must be at least 10 mines.';
      return;
    }
    if (mines > maxMines) {
      errorEl.textContent = `There are too many mines. The maximum is ${maxMines}.`;
      return;
    }

    hideModal('custom-overlay');
    newGame(cols, rows, mines, 'custom');
    openWindow('minesweeper');
  }

  $('#custom-ok').addEventListener('click', submitCustom);
  for (const id of ['custom-height', 'custom-width', 'custom-mines']) {
    $('#' + id).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitCustom();
      }
    });
  }

  /* ------------------------------ modals ------------------------------ */

  function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
    if (id === 'score-overlay') scoreContext = null;
  }

  for (const btn of $$('[data-close-modal]')) {
    btn.addEventListener('click', () => hideModal(btn.dataset.closeModal));
  }

  /* ------------------------------ taskbar ------------------------------ */

  function openStartMenu() {
    startMenuEl.hidden = false;
    startBtn.classList.add('open');
    startBtn.setAttribute('aria-expanded', 'true');
  }

  function closeStartMenu() {
    startMenuEl.hidden = true;
    startBtn.classList.remove('open');
    startBtn.setAttribute('aria-expanded', 'false');
    for (const wrap of $$('.start-item-wrap.open')) wrap.classList.remove('open');
  }

  startBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (startMenuEl.hidden) openStartMenu();
    else closeStartMenu();
  });

  for (const wrap of $$('.start-item-wrap')) {
    const trigger = wrap.querySelector('[data-submenu]');
    if (!trigger) continue;
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      wrap.classList.toggle('open');
    });
  }

  function updateClock() {
    const now = new Date();
    let hours = now.getHours() % 12;
    if (hours === 0) hours = 12;
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const suffix = now.getHours() < 12 ? 'AM' : 'PM';
    clockEl.textContent = `${hours}:${minutes} ${suffix}`;
    if (trayEl) {
      trayEl.title = now.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  window.setInterval(updateClock, 10000);

  /* ---------------------------- desktop icons ---------------------------- */

  function clearIconSelection() {
    for (const selected of $$('.desk-icon.selected')) selected.classList.remove('selected');
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open]');
    if (!opener) return;

    if (opener.closest('.desktop-icons')) {
      clearIconSelection();
      opener.classList.add('selected');
      if (isCoarsePointer) openWindow(opener.dataset.open);
      return;
    }

    openWindow(opener.dataset.open);
    if (opener.closest('.start-menu')) closeStartMenu();
  });

  document.addEventListener('dblclick', (event) => {
    const opener = event.target.closest('.desktop-icons [data-open]');
    if (opener) openWindow(opener.dataset.open);
  });

  desktopEl.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.window') && !event.target.closest('.desk-icon')) {
      clearIconSelection();
    }
  });

  /* --------------------------- window controls --------------------------- */

  document.addEventListener('pointerdown', (event) => {
    const winEl = event.target.closest('.window[data-win]');
    if (!winEl) return;
    const record = windows[winEl.dataset.win];
    if (record && record.open && !record.minimized) focusWindow(record.key);
  }, true);

  document.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-win-action]');
    if (!actionBtn) return;
    const winEl = actionBtn.closest('.window[data-win]');
    if (!winEl) return;
    const key = winEl.dataset.win;
    const record = windows[key];
    if (!record) return;

    switch (actionBtn.dataset.winAction) {
      case 'minimize':
        minimizeWindow(record);
        break;
      case 'close':
        closeWindow(key);
        break;
      case 'help':
        openWindow('help', 30);
        break;
      default:
        break;
    }
  });

  /* ------------------------------ keyboard ------------------------------ */

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

    if (event.key === 'Escape') {
      closeMenus();
      closeStartMenu();
      hideModal('custom-overlay');
      hideModal('score-overlay');
      return;
    }

    if (typing) return;

    if (event.key === 'F2') {
      event.preventDefault();
      if (game) {
        newGame(game.cols, game.rows, game.mines, game.mode);
        openWindow('minesweeper');
      }
    } else if (event.key === 'F1') {
      event.preventDefault();
      openWindow('help', 30);
    }
  });

  /* ------------------------------- startup ------------------------------- */

  function init() {
    initWindows();
    const preset = PRESETS.beginner;
    newGame(preset.cols, preset.rows, preset.mines, 'beginner');
    openWindow('minesweeper');
    renderBestTimes();
    updateClock();
  }

  init();
})();
