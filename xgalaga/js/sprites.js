/*
 * sprites.js - XPM parsing and sprite drawing for the browser port.
 *
 * The original game ships its artwork as XPM (X PixMap) C arrays.  We keep
 * that artwork verbatim in xpm-data.js and turn each image into a tiny
 * offscreen canvas at startup, so the browser version uses the exact same
 * pixels as the X11 game.
 */
(function () {
  'use strict';

  var colorCache = new Map();

  function channelToByte(value, digits) {
    var max = Math.pow(16, digits) - 1;
    return Math.max(0, Math.min(255, Math.round(value * 255 / max)));
  }

  // XPM colours are either "None" or #RGB, #RRGGBB, #RRRGGGBBB or
  // #RRRRGGGGBBBB (one to four hex digits per channel).
  function parseXpmColor(spec) {
    if (!spec || spec.toLowerCase() === 'none') return null;
    if (spec.charAt(0) === '#') {
      var hex = spec.slice(1);
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 3 !== 0) return null;
      var digits = hex.length / 3;
      if (digits < 1 || digits > 4) return null;
      var r = parseInt(hex.slice(0, digits), 16);
      var g = parseInt(hex.slice(digits, digits * 2), 16);
      var b = parseInt(hex.slice(digits * 2, digits * 3), 16);
      return [channelToByte(r, digits), channelToByte(g, digits), channelToByte(b, digits)];
    }
    // Named colours are not used by XGalaga++, but accept CSS colour names
    // anyway so edited sprite sheets remain usable.
    if (!colorCache.has(spec)) {
      var probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      var pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.fillStyle = '#000';
      pctx.fillStyle = spec;
      pctx.fillRect(0, 0, 1, 1);
      var px = pctx.getImageData(0, 0, 1, 1).data;
      colorCache.set(spec, [px[0], px[1], px[2]]);
    }
    return colorCache.get(spec);
  }

  function parseXpm(name, lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new Error('Sprite "' + name + '": missing XPM data');
    }
    var header = lines[0].trim().split(/\s+/).map(Number);
    var width = header[0], height = header[1], colorCount = header[2], charsPerPixel = header[3];
    if (!(width > 0 && height > 0 && colorCount > 0 && charsPerPixel > 0)) {
      throw new Error('Sprite "' + name + '": invalid XPM header "' + lines[0] + '"');
    }

    var palette = new Map();
    for (var i = 1; i <= colorCount; ++i) {
      var line = lines[i];
      if (typeof line !== 'string') throw new Error('Sprite "' + name + '": missing colour line');
      var key = line.substring(0, charsPerPixel);
      var rest = line.substring(charsPerPixel);
      var match = rest.match(/\s[cC]\s+(.+?)\s*$/);
      palette.set(key, match ? parseXpmColor(match[1].trim()) : null);
    }

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    var image = ctx.createImageData(width, height);
    var data = image.data;

    for (var y = 0; y < height; ++y) {
      var row = lines[1 + colorCount + y];
      if (typeof row !== 'string') row = '';
      for (var x = 0; x < width; ++x) {
        var colorKey = row.substring(x * charsPerPixel, (x + 1) * charsPerPixel);
        var color = palette.get(colorKey);
        if (!color) continue;
        var offset = (y * width + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  /**
   * A Pix is a sprite image.  Positions are centre points, matching the
   * original Sprite class (which draws at position minus half the size).
   */
  function Pix(name, lines) {
    this.name = name;
    this.width = lines ? Number(lines[0].trim().split(/\s+/)[0]) : 0;
    this.height = lines ? Number(lines[0].trim().split(/\s+/)[1]) : 0;
    this.canvas = parseXpm(name, lines);
  }

  Pix.prototype.draw = function (ctx, centerX, centerY) {
    var x = Math.round(centerX) - Math.floor(this.width / 2);
    var y = Math.round(centerY) - Math.floor(this.height / 2);
    ctx.drawImage(this.canvas, x, y);
    return this;
  };

  Pix.prototype.drawTopLeft = function (ctx, x, y) {
    ctx.drawImage(this.canvas, Math.round(x), Math.round(y));
  };

  var PixKeeper = {
    pixes: new Map(),
    get: function (name) {
      var pix = this.pixes.get(name);
      if (pix) return pix;
      var lines = window.XPM_DATA && window.XPM_DATA[name];
      if (!lines) throw new Error('Unknown sprite "' + name + '"');
      pix = new Pix(name, lines);
      this.pixes.set(name, pix);
      return pix;
    }
  };

  // Expose the small API used by the game.
  window.XGPix = {
    Pix: Pix,
    Keeper: PixKeeper,
    parseColor: parseXpmColor
  };
})();
