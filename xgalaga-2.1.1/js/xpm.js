/*
 * xpm.js - tiny XPM (X PixMap) reader + sprite sheet cache.
 *
 * The original XGalaga art is stored as XPM.  Every animated image is a
 * vertical strip of square frames (or an XPMEXT num_views extension).
 * Frames are rendered once into small offscreen canvases at PIXEL_SCALE,
 * then blitted by the game.
 */
(function () {
  'use strict';

  const PIXEL_SCALE = 2;

  function parseColor(value) {
    if (!value) return [0, 0, 0, 0];
    const v = value.trim();
    if (/^none$/i.test(v) || v === '') return [0, 0, 0, 0];

    if (v[0] === '#') {
      const hex = v.slice(1);
      let r, g, b;
      if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else if (/^[0-9a-fA-F]{9}$/.test(hex)) {
        r = parseInt(hex.slice(0, 3), 16) / 4095 * 255;
        g = parseInt(hex.slice(3, 6), 16) / 4095 * 255;
        b = parseInt(hex.slice(6, 9), 16) / 4095 * 255;
      } else if (/^[0-9a-fA-F]{12}$/.test(hex)) {
        r = parseInt(hex.slice(0, 4), 16) / 65535 * 255;
        g = parseInt(hex.slice(4, 8), 16) / 65535 * 255;
        b = parseInt(hex.slice(8, 12), 16) / 65535 * 255;
      } else {
        return [255, 0, 255, 255];
      }
      return [Math.round(r), Math.round(g), Math.round(b), 255];
    }

    // A few XPMs in the wild use colour names; XGalaga's use None.
    const named = {
      black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0],
      green: [0, 255, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
      cyan: [0, 255, 255], magenta: [255, 0, 255], gray: [128, 128, 128],
      grey: [128, 128, 128],
    };
    const c = named[v.toLowerCase()];
    return c ? [c[0], c[1], c[2], 255] : [255, 0, 255, 255];
  }

  function parseXpm(source) {
    const strings = [];
    const re = /"([^"]*)"/g;
    let m;
    while ((m = re.exec(source)) !== null) strings.push(m[1]);
    if (!strings.length) throw new Error('Empty XPM');

    const header = strings[0].trim().split(/\s+/);
    const width = parseInt(header[0], 10);
    const height = parseInt(header[1], 10);
    const ncolors = parseInt(header[2], 10);
    const cpp = parseInt(header[3], 10) || 1;

    const palette = new Map();
    for (let i = 1; i <= ncolors; i++) {
      const line = strings[i] || '';
      const key = line.slice(0, cpp);
      const rest = line.slice(cpp);
      const cm = rest.match(/\bc\s+(\S+)/);
      palette.set(key, parseColor(cm ? cm[1] : 'None'));
    }

    let frames = 0;
    for (let i = 1 + ncolors; i < strings.length; i++) {
      if (/^XPMEXT\s+(num_views|nviews)$/.test(strings[i].trim())) {
        frames = parseInt(strings[i + 1], 10) || 0;
        break;
      }
    }
    if (!frames) frames = width > 0 && height % width === 0 ? height / width : 1;
    const frameHeight = Math.floor(height / frames);

    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const row = strings[1 + ncolors + y] || '';
      for (let x = 0; x < width; x++) {
        const key = cpp === 1 ? row[x] : row.substr(x * cpp, cpp);
        const rgb = palette.get(key);
        const o = (y * width + x) * 4;
        if (rgb) {
          rgba[o] = rgb[0];
          rgba[o + 1] = rgb[1];
          rgba[o + 2] = rgb[2];
          rgba[o + 3] = rgb[3];
        }
      }
    }

    return { width, height, frames, frameHeight, rgba };
  }

  class Sprite {
    constructor(name, data) {
      this.name = name;
      this.width = data.width;
      this.height = data.frameHeight;
      this.frames = data.frames;
      this._canvases = null;
      this._rgba = data.rgba;
      this._fullHeight = data.height;
    }

    _build() {
      if (this._canvases) return;
      const list = [];
      const w = this.width;
      const h = this.height;
      for (let f = 0; f < this.frames; f++) {
        const canvas = document.createElement('canvas');
        canvas.width = w * PIXEL_SCALE;
        canvas.height = h * PIXEL_SCALE;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const img = ctx.createImageData(w, h);
        const srcY = f * h;
        const maxRows = Math.min(h, this._fullHeight - srcY);
        for (let y = 0; y < maxRows; y++) {
          const src = ((srcY + y) * w) * 4;
          const dst = (y * w) * 4;
          img.data.set(this._rgba.subarray(src, src + w * 4), dst);
        }
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        tmp.getContext('2d').putImageData(img, 0, 0);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, w * PIXEL_SCALE, h * PIXEL_SCALE);
        list.push(canvas);
      }
      this._canvases = list;
    }

    canvas(frame) {
      this._build();
      let f = frame | 0;
      f %= this.frames;
      if (f < 0) f += this.frames;
      return this._canvases[f];
    }

    draw(ctx, x, y, frame) {
      // x/y are the top-left corner in game (unscaled) units.
      const c = this.canvas(frame);
      ctx.drawImage(c, x, y, this.width, this.height);
    }

    drawCentered(ctx, cx, cy, frame) {
      this.draw(ctx, Math.round(cx - this.width / 2), Math.round(cy - this.height / 2), frame);
    }
  }

  const cache = new Map();

  function loadAll(images) {
    for (const name of Object.keys(images)) {
      try {
        cache.set(name, new Sprite(name, parseXpm(images[name])));
      } catch (err) {
        console.warn('Could not parse image ' + name, err);
      }
    }
  }

  function get(name) {
    return cache.get(name) || null;
  }

  window.XGAL = window.XGAL || {};
  window.XGAL.PIXEL_SCALE = PIXEL_SCALE;
  window.XGAL.parseXpm = parseXpm;
  window.XGAL.Sprite = Sprite;
  window.XGAL.loadImages = loadAll;
  window.XGAL.image = get;
})();
