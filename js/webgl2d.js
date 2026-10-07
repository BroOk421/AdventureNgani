"use strict";

/* =================================================================
   WEBGL RENDERER FOR THE MAIN CANVAS (phones)

   Per request ("WebGL na"): the game keeps drawing exactly as before —
   every file still calls ctx.drawImage(), ctx.fillRect(), ctx.save() ...
   — but on a phone the main canvas (#view) answers getContext("2d") with
   a WebGL2 context that behaves like a 2D one (GL2DContext, below).

   Why it's faster: a 2D canvas sends every single drawImage to the GPU on
   its own (300-400 a frame in town). Here they are collected into one
   vertex buffer and sent as a few big draws — up to 16 different pictures
   in one draw (one texture unit each). Each picture is uploaded to the
   GPU once and kept there.

   What it does:
   - drawImage (images and canvases), fillRect / strokeRect / clearRect,
     save / restore, every transform, globalAlpha, imageSmoothingEnabled;
   - globalCompositeOperation: source-over, lighter, screen, multiply,
     darken, lighten, destination-out / -in, source-atop, destination-over,
     copy (as blend modes);
   - paths: moveTo, lineTo, rect, arc, ellipse, arcTo, quadratic / bezier
     curves, roundRect -> fill (any shape, nonzero, via the stencil
     buffer; convex shapes go straight into the batch) and stroke;
   - clip() (stencil), gradients (linear / radial, in a shader), patterns
     (repeat, with setTransform), fillText / strokeText (each text drawn
     once into a little canvas and kept), measureText, setLineDash (lines
     drawn solid).
   - Other canvases (light buffers, caches, sprite frames) stay ordinary
     2D canvases; whenever one changes (any drawing call on it bumps its
     __glv), it is re-uploaded the next time it's drawn here.

   On the desktop, with ?gl=0, with Settings > Renderer: Canvas, or if the
   phone has no WebGL2, nothing here runs and the normal 2D canvas is used.
   If the GPU drops the context (app sent to the background), it is
   rebuilt when the context comes back.
================================================================= */

const GL2D = (() => {
  const stats = { draws: 0, uploads: 0, flushes: 0, frameDraws: 0, frameUploads: 0 };
  function wanted() {
    try {
      if (/[?&]gl=0\b/.test(location.search)) return false;
      if (/[?&]gl=1\b/.test(location.search)) return true;
      if (localStorage.getItem("agn-renderer") === "canvas") return false;
      if (/[?&]mobile=0\b/.test(location.search)) return false;
      if (/[?&]mobile=1\b/.test(location.search)) return true;
      return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window || navigator.maxTouchPoints > 0;
    } catch (e) { return false; }
  }

  /* ---------------- colours ---------------- */
  const colorCache = new Map();
  let colorProbe = null;
  function parseColor(s) {
    if (typeof s !== "string") return [0, 0, 0, 1];
    let c = colorCache.get(s);
    if (c) return c;
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
      const n = parseInt(h, 16);
      c = h.length === 8 ? [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, (n & 255) / 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    } else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s))) {
      let a = m[4] === undefined ? 1 : (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      c = [+m[1], +m[2], +m[3], a];
    } else {
      // anything else (names, hsl()): let a real 2D canvas normalise it
      if (!colorProbe) colorProbe = document.createElement("canvas").getContext("2d");
      colorProbe.fillStyle = "#000"; colorProbe.fillStyle = s;
      const n = colorProbe.fillStyle;
      c = n === s ? [0, 0, 0, 1] : parseColor(n);
    }
    if (colorCache.size > 2000) colorCache.clear();
    colorCache.set(s, c);
    return c;
  }

  /* ---------------- gradients / patterns (our own objects) ---------------- */
  class GLGradient {
    constructor(type, a) { this.type = type; this.a = a; this.stops = []; this._sig = null; }
    addColorStop(o, c) { this.stops.push([+o, String(c)]); this._sig = null; }
    sig() {
      if (!this._sig) this._sig = this.stops.map((s) => s[0] + ":" + s[1]).join("|");
      return this._sig;
    }
  }
  class GLPattern {
    constructor(src, rep) { this.src = src; this.rep = rep; this.m = [1, 0, 0, 1, 0, 0]; }
    setTransform(m) { this.m = m ? [m.a, m.b, m.c, m.d, m.e, m.f] : [1, 0, 0, 1, 0, 0]; }
  }

  /* ---------------- the context ---------------- */
  const MAX_VERTS = 32000, FLOATS = 6; // x y u v color(packed) tex
  const VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aCol; in float aTex;
uniform vec2 uRes;
out vec2 vUV; out vec4 vCol; flat out int vTex;
void main() {
  vUV = aUV; vCol = aCol; vTex = int(aTex + 0.5) - 1;
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
}`;
  function fragSource(units) {
    let pick = "";
    for (let i = 0; i < units; i++) pick += `${i ? "else " : ""}if (vTex == ${i}) c = texture(uT[${i}], vUV);\n`;
    return `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vCol; flat in int vTex;
uniform sampler2D uT[${units}];
out vec4 o;
void main() {
  vec4 c = vec4(1.0);
  ${pick}
  o = c * vCol;
}`;
  }
  // gradients and patterns: one fill at a time, positions come from gl_FragCoord
  const PAINT_FS = `#version 300 es
precision highp float;
uniform int uMode;          // 1 linear, 2 radial, 3 pattern
uniform mat3 uInv;          // device px -> gradient / pattern space
uniform float uH;           // canvas height (gl_FragCoord is bottom-up)
uniform vec4 uA;            // linear: x0 y0 x1 y1 | radial: x0 y0 r0 -
uniform vec4 uB;            // radial: x1 y1 r1 -
uniform vec2 uPatSize;
uniform float uAlpha;
uniform sampler2D uRamp;
out vec4 o;
void main() {
  vec2 dev = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 p = (uInv * vec3(dev, 1.0)).xy;
  if (uMode == 3) { o = texture(uRamp, p / uPatSize) * uAlpha; return; }
  float t;
  if (uMode == 1) {
    vec2 d = uA.zw - uA.xy; float dd = dot(d, d);
    t = dd > 0.0 ? dot(p - uA.xy, d) / dd : 0.0;
  } else {
    vec2 cd = uB.xy - uA.xy; float dr = uB.z - uA.z;
    vec2 pd = p - uA.xy;
    float a = dot(cd, cd) - dr * dr;
    float b = dot(pd, cd) + uA.z * dr;
    float c = dot(pd, pd) - uA.z * uA.z;
    if (abs(a) < 1e-6) {
      if (abs(b) < 1e-6) discard;
      t = c / (2.0 * b);
      if (uA.z + t * dr < 0.0) discard;
    } else {
      float disc = b * b - a * c;
      if (disc < 0.0) discard;
      float s = sqrt(disc);
      t = (b + s) / a;
      if (uA.z + t * dr < 0.0) { t = (b - s) / a; if (uA.z + t * dr < 0.0) discard; }
    }
  }
  o = texture(uRamp, vec2(clamp(t, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5)) * uAlpha;
}`;
  const PAINT_VS = `#version 300 es
in vec2 aPos; uniform vec2 uRes;
void main() { gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0); }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
  }

  function newState() {
    return { m: [1, 0, 0, 1, 0, 0], alpha: 1, comp: "source-over", smooth: true,
      fill: "#000000", stroke: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter", miterLimit: 10,
      font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", direction: "inherit",
      filter: "none", shadowBlur: 0, shadowColor: "rgba(0,0,0,0)", shadowOffsetX: 0, shadowOffsetY: 0,
      dash: [], dashOffset: 0, smoothQ: "low", clips: EMPTY };
  }
  const EMPTY = Object.freeze([]);

  class GL2DContext {
    constructor(canvas, gl) {
      this.canvas = canvas;
      this.gl = gl;
      this.st = newState();
      this.stack = [];
      this.path = [];
      this.cur = null;
      this.init();
      canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; }, false);
      canvas.addEventListener("webglcontextrestored", () => { this.lost = false; this.init(); }, false);
    }
    init() {
      const gl = this.gl;
      this.units = Math.max(1, Math.min(16, gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)));
      this.prog = program(gl, VS, fragSource(this.units));
      this.loc = { pos: gl.getAttribLocation(this.prog, "aPos"), uv: gl.getAttribLocation(this.prog, "aUV"),
        col: gl.getAttribLocation(this.prog, "aCol"), tex: gl.getAttribLocation(this.prog, "aTex"),
        res: gl.getUniformLocation(this.prog, "uRes") };
      gl.useProgram(this.prog);
      gl.uniform1iv(gl.getUniformLocation(this.prog, "uT"), Array.from({ length: this.units }, (_, i) => i));
      this.paint = program(gl, PAINT_VS, PAINT_FS);
      this.ploc = {};
      for (const n of ["uRes", "uMode", "uInv", "uH", "uA", "uB", "uPatSize", "uAlpha", "uRamp"]) this.ploc[n] = gl.getUniformLocation(this.paint, n);
      this.ploc.pos = gl.getAttribLocation(this.paint, "aPos");
      this.buf = new ArrayBuffer(MAX_VERTS * FLOATS * 4);
      this.f32 = new Float32Array(this.buf);
      this.u32 = new Uint32Array(this.buf);
      this.idx = new Uint16Array(MAX_VERTS * 3);
      this.nv = 0; this.ni = 0;
      this.vbo = gl.createBuffer(); this.ibo = gl.createBuffer();
      this.pvbo = gl.createBuffer();
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.loc.pos); gl.vertexAttribPointer(this.loc.pos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(this.loc.uv); gl.vertexAttribPointer(this.loc.uv, 2, gl.FLOAT, false, 24, 8);
      gl.enableVertexAttribArray(this.loc.col); gl.vertexAttribPointer(this.loc.col, 4, gl.UNSIGNED_BYTE, true, 24, 16);
      gl.enableVertexAttribArray(this.loc.tex); gl.vertexAttribPointer(this.loc.tex, 1, gl.FLOAT, false, 24, 20);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      this.pvao = gl.createVertexArray();
      gl.bindVertexArray(this.pvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pvbo);
      gl.enableVertexAttribArray(this.ploc.pos); gl.vertexAttribPointer(this.ploc.pos, 2, gl.FLOAT, false, 8, 0);
      gl.bindVertexArray(null);
      const sampler = (filter, wrap) => {
        const s = gl.createSampler();
        gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, filter); gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, filter);
        gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, wrap); gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, wrap);
        return s;
      };
      this.samp = [sampler(gl.NEAREST, gl.CLAMP_TO_EDGE), sampler(gl.LINEAR, gl.CLAMP_TO_EDGE),
        sampler(gl.NEAREST, gl.REPEAT), sampler(gl.LINEAR, gl.REPEAT)];
      this.tex = new Map();            // source -> { tex, ver, w, h, used, stamp, unit[2] }
      this.ramps = new Map();          // gradient stops -> texture
      this.batchUnits = [];            // [entry, smooth]
      this.batchId = 1;
      this.blend = null;               // blend key of the open batch
      this.appliedClips = EMPTY;
      this.flushQueued = false;
      this.lastEvict = 0;
      this.vw = 0; this.vh = 0;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
    }

    /* ----- state ----- */
    save() { const s = this.st; this.stack.push(Object.assign({}, s, { m: s.m.slice() })); }
    restore() { if (this.stack.length) this.st = this.stack.pop(); }
    reset() { this.flush(); this.st = newState(); this.stack = []; this.path = []; this.cur = null; this.syncClip(); }
    get globalAlpha() { return this.st.alpha; }
    set globalAlpha(v) { v = +v; if (v >= 0 && v <= 1) this.st.alpha = v; }
    get globalCompositeOperation() { return this.st.comp; }
    set globalCompositeOperation(v) { if (BLENDS[v]) this.st.comp = v; }
    get imageSmoothingEnabled() { return this.st.smooth; }
    set imageSmoothingEnabled(v) { this.st.smooth = !!v; }
    get imageSmoothingQuality() { return this.st.smoothQ; }
    set imageSmoothingQuality(v) { this.st.smoothQ = v; }
    get fillStyle() { return this.st.fill; }
    set fillStyle(v) { this.st.fill = v; }
    get strokeStyle() { return this.st.stroke; }
    set strokeStyle(v) { this.st.stroke = v; }
    get lineWidth() { return this.st.lineWidth; }
    set lineWidth(v) { v = +v; if (v > 0 && isFinite(v)) this.st.lineWidth = v; }
    get lineCap() { return this.st.lineCap; } set lineCap(v) { this.st.lineCap = v; }
    get lineJoin() { return this.st.lineJoin; } set lineJoin(v) { this.st.lineJoin = v; }
    get miterLimit() { return this.st.miterLimit; } set miterLimit(v) { this.st.miterLimit = v; }
    get font() { return this.st.font; } set font(v) { this.st.font = v; }
    get textAlign() { return this.st.textAlign; } set textAlign(v) { this.st.textAlign = v; }
    get textBaseline() { return this.st.textBaseline; } set textBaseline(v) { this.st.textBaseline = v; }
    get direction() { return this.st.direction; } set direction(v) { this.st.direction = v; }
    get filter() { return this.st.filter; } set filter(v) { this.st.filter = v; }
    get shadowBlur() { return this.st.shadowBlur; } set shadowBlur(v) { this.st.shadowBlur = v; }
    get shadowColor() { return this.st.shadowColor; } set shadowColor(v) { this.st.shadowColor = v; }
    get shadowOffsetX() { return this.st.shadowOffsetX; } set shadowOffsetX(v) { this.st.shadowOffsetX = v; }
    get shadowOffsetY() { return this.st.shadowOffsetY; } set shadowOffsetY(v) { this.st.shadowOffsetY = v; }
    get lineDashOffset() { return this.st.dashOffset; } set lineDashOffset(v) { this.st.dashOffset = v; }
    setLineDash(a) { this.st.dash = Array.isArray(a) ? a.slice() : []; }
    getLineDash() { return this.st.dash.slice(); }
    getContextAttributes() { return { alpha: true, desynchronized: false, colorSpace: "srgb", willReadFrequently: false }; }
    isContextLost() { return !!this.lost; }

    /* ----- transforms ----- */
    setTransform(a, b, c, d, e, f) {
      const m = this.st.m;
      if (a === undefined) { m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0; return; }
      if (typeof a === "object") { m[0] = a.a; m[1] = a.b; m[2] = a.c; m[3] = a.d; m[4] = a.e; m[5] = a.f; return; }
      m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f;
    }
    resetTransform() { this.setTransform(); }
    getTransform() { const m = this.st.m; return new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]); }
    transform(A, B, C, D, E, F) {
      const m = this.st.m, a = m[0], b = m[1], c = m[2], d = m[3];
      m[0] = a * A + c * B; m[1] = b * A + d * B;
      m[2] = a * C + c * D; m[3] = b * C + d * D;
      m[4] += a * E + c * F; m[5] += b * E + d * F;
    }
    translate(x, y) { const m = this.st.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
    scale(x, y) { const m = this.st.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
    rotate(t) {
      const m = this.st.m, cs = Math.cos(t), sn = Math.sin(t), a = m[0], b = m[1], c = m[2], d = m[3];
      m[0] = a * cs + c * sn; m[1] = b * cs + d * sn; m[2] = c * cs - a * sn; m[3] = d * cs - b * sn;
    }

    /* ----- GPU plumbing ----- */
    viewportSync() {
      const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
      if (w !== this.vw || h !== this.vh) {
        this.vw = w; this.vh = h;
        gl.viewport(0, 0, w, h);
        this.appliedClips = EMPTY; // the buffer (and its stencil) was reset
        gl.disable(gl.STENCIL_TEST);
      }
    }
    queueFlush() {
      if (this.flushQueued) return;
      this.flushQueued = true;
      queueMicrotask(() => { this.flushQueued = false; this.flush(); this.endFrame(); });
    }
    endFrame() {
      stats.frameDraws = stats.draws; stats.frameUploads = stats.uploads;
      stats.draws = 0; stats.uploads = 0;
      const now = performance.now();
      if (now - this.lastEvict > 3000) this.evict(now);
    }
    evict(now) {
      this.lastEvict = now;
      const gl = this.gl;
      for (const [src, e] of this.tex) {
        const idle = now - e.used;
        if (idle > (src instanceof HTMLImageElement ? 60000 : 8000)) { gl.deleteTexture(e.tex); this.tex.delete(src); }
      }
      if (this.ramps.size > 96) { for (const t of this.ramps.values()) gl.deleteTexture(t); this.ramps.clear(); }
    }
    // the GPU copy of a picture (uploaded on first use, and again whenever a canvas changed)
    texFor(src) {
      let e = this.tex.get(src);
      const isImg = src instanceof HTMLImageElement;
      const w = isImg ? src.naturalWidth : src.width, h = isImg ? src.naturalHeight : src.height;
      if (!w || !h || (isImg && !src.complete)) return null;
      const ver = isImg ? src.src : (src.__glv | 0);
      if (e && e.ver === ver && e.w === w && e.h === h) { e.used = performance.now(); return e; }
      if (e && e.stamp === this.batchId) this.flush(); // still waiting to be drawn with its old pixels
      const gl = this.gl;
      if (!e) { e = { tex: gl.createTexture(), ver: null, w: 0, h: 0, used: 0, stamp: 0, u0: -1, u1: -1 }; this.tex.set(src, e); }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      } catch (err) { return null; }
      stats.uploads++;
      e.ver = ver; e.w = w; e.h = h; e.used = performance.now();
      return e;
    }
    // which texture unit a picture uses in the open batch (-1: batch full)
    unitFor(e, smooth) {
      const k = smooth ? 1 : 0;
      if (e.stamp === this.batchId) { const u = k ? e.u1 : e.u0; if (u >= 0) return u; }
      else { e.stamp = this.batchId; e.u0 = -1; e.u1 = -1; }
      if (this.batchUnits.length >= this.units) return -1;
      const u = this.batchUnits.length;
      this.batchUnits.push([e, smooth]);
      if (k) e.u1 = u; else e.u0 = u;
      return u;
    }
    // start drawing with the current composite / clip; flush if they differ from the open batch
    prep(extraVerts) {
      if (this.lost) return false;
      this.viewportSync();
      if (this.st.clips !== this.appliedClips) { this.flush(); this.syncClip(); }
      const key = this.st.comp;
      if (this.blend !== key) { this.flush(); this.blend = key; }
      if (this.nv + extraVerts > MAX_VERTS) this.flush();
      this.queueFlush();
      return true;
    }
    applyBlend(key) {
      const gl = this.gl, b = BLENDS[key] || BLENDS["source-over"];
      gl.blendEquation(b[0] === "min" ? gl.MIN : b[0] === "max" ? gl.MAX : gl.FUNC_ADD);
      gl.blendFunc(gl[b[1]], gl[b[2]]);
    }
    stencilForCover() {
      const gl = this.gl;
      if (this.appliedClips.length) { gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0x80, 0x80); gl.stencilMask(0); }
      else gl.disable(gl.STENCIL_TEST);
    }
    flush() {
      if (!this.nv || this.lost) { this.nv = 0; this.ni = 0; return; }
      const gl = this.gl;
      gl.useProgram(this.prog);
      gl.uniform2f(this.loc.res, this.vw, this.vh);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.f32.subarray(0, this.nv * FLOATS), gl.STREAM_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idx.subarray(0, this.ni), gl.STREAM_DRAW);
      for (let i = 0; i < this.batchUnits.length; i++) {
        const [e, smooth] = this.batchUnits[i];
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.bindSampler(i, this.samp[smooth ? 1 : 0]);
      }
      this.applyBlend(this.blend);
      this.stencilForCover();
      gl.drawElements(gl.TRIANGLES, this.ni, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      for (let i = 0; i < this.batchUnits.length; i++) gl.bindSampler(i, null);
      stats.draws++; stats.flushes++;
      this.nv = 0; this.ni = 0;
      this.batchUnits.length = 0;
      this.batchId++;
    }
    // one corner of a quad / triangle into the batch
    vert(x, y, u, v, col, unit) {
      const o = this.nv * FLOATS, f = this.f32;
      f[o] = x; f[o + 1] = y; f[o + 2] = u; f[o + 3] = v; this.u32[o + 4] = col; f[o + 5] = unit + 1;
      return this.nv++;
    }
    quad(x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1, v1, col, unit) {
      const i = this.vert(x0, y0, u0, v0, col, unit);
      this.vert(x1, y1, u1, v0, col, unit);
      this.vert(x2, y2, u1, v1, col, unit);
      this.vert(x3, y3, u0, v1, col, unit);
      const ix = this.idx, n = this.ni;
      ix[n] = i; ix[n + 1] = i + 1; ix[n + 2] = i + 2; ix[n + 3] = i; ix[n + 4] = i + 2; ix[n + 5] = i + 3;
      this.ni += 6;
    }

    /* ----- pictures ----- */
    drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
      if (!img) return;
      const isImg = img instanceof HTMLImageElement;
      const iw = isImg ? img.naturalWidth : img.width, ih = isImg ? img.naturalHeight : img.height;
      if (!iw || !ih) return;
      let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
      const n = arguments.length;
      if (n >= 9) { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
      else if (n >= 5) { dx = a1; dy = a2; dw = a3; dh = a4; }
      else { dx = a1; dy = a2; dw = iw; dh = ih; }
      if (sw < 0) { sx += sw; sw = -sw; } if (sh < 0) { sy += sh; sh = -sh; }
      if (dw < 0) { dx += dw; dw = -dw; } if (dh < 0) { dy += dh; dh = -dh; }
      if (!sw || !sh || !dw || !dh) return;
      // the part of the source rect that's on the picture (dest shrinks to match)
      if (sx < 0) { const k = -sx / sw; dx += dw * k; dw -= dw * k; sw += sx; sx = 0; }
      if (sy < 0) { const k = -sy / sh; dy += dh * k; dh -= dh * k; sh += sy; sy = 0; }
      if (sx + sw > iw) { const k = (sx + sw - iw) / sw; dw -= dw * k; sw = iw - sx; }
      if (sy + sh > ih) { const k = (sy + sh - ih) / sh; dh -= dh * k; sh = ih - sy; }
      if (sw <= 0 || sh <= 0) return;
      const st = this.st, al = st.alpha;
      if (al <= 0) return;
      if (!this.prep(4)) return;
      const e = this.texFor(img);
      if (!e) return;
      let unit = this.unitFor(e, st.smooth);
      if (unit < 0) { this.flush(); unit = this.unitFor(e, st.smooth); }
      const m = st.m, a = m[0], b = m[1], c = m[2], d = m[3], tx = m[4], ty = m[5];
      const x1 = dx + dw, y1 = dy + dh;
      const A = Math.round(al * 255);
      const col = (A | (A << 8) | (A << 16) | (A << 24)) >>> 0;
      this.quad(a * dx + c * dy + tx, b * dx + d * dy + ty,
        a * x1 + c * dy + tx, b * x1 + d * dy + ty,
        a * x1 + c * y1 + tx, b * x1 + d * y1 + ty,
        a * dx + c * y1 + tx, b * dx + d * y1 + ty,
        sx / iw, sy / ih, (sx + sw) / iw, (sy + sh) / ih, col, unit);
    }

    /* ----- rectangles ----- */
    colorOf(style) {
      const c = parseColor(style), a = c[3] * this.st.alpha;
      const r = Math.round(c[0] * a), g = Math.round(c[1] * a), b = Math.round(c[2] * a), A = Math.round(a * 255);
      return { packed: (r | (g << 8) | (b << 16) | (A << 24)) >>> 0, a };
    }
    rectPts(x, y, w, h) {
      const m = this.st.m, a = m[0], b = m[1], c = m[2], d = m[3], tx = m[4], ty = m[5], x1 = x + w, y1 = y + h;
      return [a * x + c * y + tx, b * x + d * y + ty, a * x1 + c * y + tx, b * x1 + d * y + ty,
        a * x1 + c * y1 + tx, b * x1 + d * y1 + ty, a * x + c * y1 + tx, b * x + d * y1 + ty];
    }
    fillRect(x, y, w, h) {
      if (!w || !h) return;
      const p = this.rectPts(x, y, w, h);
      this.fillPolys([p], true, this.st.fill);
    }
    strokeRect(x, y, w, h) {
      const saved = this.path; this.path = [];
      this.rect(x, y, w, h); this.stroke();
      this.path = saved;
    }
    clearRect(x, y, w, h) {
      if (this.lost) return;
      this.viewportSync();
      const m = this.st.m, gl = this.gl;
      const full = !this.st.clips.length && m[1] === 0 && m[2] === 0 && m[0] > 0 && m[3] > 0 &&
        m[0] * x + m[4] <= 0 && m[3] * y + m[5] <= 0 && m[0] * (x + w) + m[4] >= this.vw && m[3] * (y + h) + m[5] >= this.vh;
      if (full) {
        this.flush();
        gl.disable(gl.STENCIL_TEST);
        gl.clearColor(0, 0, 0, 0); gl.colorMask(true, true, true, true);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }
      const comp = this.st.comp; this.st.comp = "__clear";
      this.fillPolys([this.rectPts(x, y, w, h)], true, "#000");
      this.st.comp = comp;
    }

    /* ----- paths ----- */
    beginPath() { this.path = []; this.cur = null; }
    pt(x, y) { const m = this.st.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
    moveTo(x, y) { const p = this.pt(x, y); this.cur = { pts: [p[0], p[1]], closed: false, ux: x, uy: y }; this.path.push(this.cur); this.sx = x; this.sy = y; }
    lineTo(x, y) {
      if (!this.cur || this.cur.closed) { this.moveTo(this.cur ? this.sx : x, this.cur ? this.sy : y); if (this.cur.pts.length === 2 && this.cur.ux === x && this.cur.uy === y) return; }
      const p = this.pt(x, y); this.cur.pts.push(p[0], p[1]); this.cur.ux = x; this.cur.uy = y;
    }
    closePath() { if (this.cur) { this.cur.closed = true; this.cur.ux = this.sx; this.cur.uy = this.sy; } }
    rect(x, y, w, h) {
      this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath();
      this.moveTo(x, y);
    }
    roundRect(x, y, w, h, r) {
      let rr = Array.isArray(r) ? (r[0] || 0) : (+r || 0);
      if (typeof rr === "object") rr = rr.x || 0;
      rr = Math.max(0, Math.min(rr, Math.abs(w) / 2, Math.abs(h) / 2));
      if (!rr) { this.rect(x, y, w, h); return; }
      this.moveTo(x + rr, y);
      this.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
      this.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
      this.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
      this.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
      this.closePath();
    }
    segs(r, sweep) {
      const m = this.st.m, s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const rd = Math.max(0.5, r * s);
      const step = 2 * Math.acos(Math.max(-1, 1 - 0.3 / rd)) || 0.5;
      return Math.max(2, Math.min(256, Math.ceil(Math.abs(sweep) / step)));
    }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
      if (rx < 0 || ry < 0) return;
      let sweep = a1 - a0;
      const TAU = Math.PI * 2;
      if (!ccw) { if (sweep >= TAU) sweep = TAU; else { sweep %= TAU; if (sweep < 0) sweep += TAU; } }
      else { if (-sweep >= TAU) sweep = -TAU; else { sweep %= TAU; if (sweep > 0) sweep -= TAU; } }
      if (a1 - a0 !== 0 && sweep === 0 && Math.abs(a1 - a0) >= TAU) sweep = ccw ? -TAU : TAU;
      const n = this.segs(Math.max(rx, ry), sweep);
      const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
      for (let i = 0; i <= n; i++) {
        const t = a0 + sweep * i / n, ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
        const px = x + ex * cr - ey * sr, py = y + ex * sr + ey * cr;
        if (i === 0 && (!this.cur || this.cur.closed)) this.moveTo(px, py); else this.lineTo(px, py);
      }
    }
    arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
    arcTo(x1, y1, x2, y2, r) {
      if (!this.cur) { this.moveTo(x1, y1); return; }
      const x0 = this.cur.ux, y0 = this.cur.uy;
      const v1x = x0 - x1, v1y = y0 - y1, v2x = x2 - x1, v2y = y2 - y1;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (!r || !l1 || !l2) { this.lineTo(x1, y1); return; }
      const cos = (v1x * v2x + v1y * v2y) / (l1 * l2), ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (ang < 1e-4 || Math.abs(ang - Math.PI) < 1e-4) { this.lineTo(x1, y1); return; }
      const dist = r / Math.tan(ang / 2);
      const t1x = x1 + v1x / l1 * dist, t1y = y1 + v1y / l1 * dist, t2x = x1 + v2x / l2 * dist, t2y = y1 + v2y / l2 * dist;
      const bx = v1x / l1 + v2x / l2, by = v1y / l1 + v2y / l2, bl = Math.hypot(bx, by);
      const cd = r / Math.sin(ang / 2), cx = x1 + bx / bl * cd, cy = y1 + by / bl * cd;
      const s0 = Math.atan2(t1y - cy, t1x - cx), s1 = Math.atan2(t2y - cy, t2x - cx);
      const cross = v1x * v2y - v1y * v2x;
      this.lineTo(t1x, t1y);
      this.arc(cx, cy, r, s0, s1, cross > 0);
    }
    quadraticCurveTo(cx, cy, x, y) {
      if (!this.cur) this.moveTo(cx, cy);
      const x0 = this.cur.ux, y0 = this.cur.uy, n = 12;
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y); }
    }
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      if (!this.cur) this.moveTo(c1x, c1y);
      const x0 = this.cur.ux, y0 = this.cur.uy, n = 16;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.lineTo(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
      }
    }
    polysOfPath() { const out = []; for (const sp of this.path) if (sp.pts.length >= 6) out.push(sp.pts); return out; }
    fill(a, b) {
      let path = this.path;
      if (a && typeof a === "object" && a.__glPath) path = a.__glPath;
      const polys = []; for (const sp of path) if (sp.pts.length >= 6) polys.push(sp.pts);
      if (!polys.length) return;
      this.fillPolys(polys, polys.length === 1 && convex(polys[0]), this.st.fill, (typeof a === "string" ? a : b) === "evenodd");
    }
    stroke() {
      const st = this.st, m = st.m;
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const hw = Math.max(0.5, st.lineWidth * scale / 2);
      const tris = [];
      for (const sp of this.path) {
        const p = sp.pts.slice();
        if (sp.closed && p.length >= 4) p.push(p[0], p[1]);
        for (let i = 0; i + 3 < p.length; i += 2) {
          const x0 = p[i], y0 = p[i + 1], x1 = p[i + 2], y1 = p[i + 3];
          const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
          if (!l) continue;
          const ux = dx / l, uy = dy / l, nx = -uy * hw, ny = ux * hw;
          const ex = st.lineCap === "butt" && !(sp.closed || (i > 0)) ? 0 : ux * hw * (st.lineJoin === "round" || st.lineCap !== "butt" || i > 0 ? 1 : 0);
          const ey = st.lineCap === "butt" && !(sp.closed || (i > 0)) ? 0 : uy * hw * (st.lineJoin === "round" || st.lineCap !== "butt" || i > 0 ? 1 : 0);
          const fx = i + 4 < p.length || sp.closed || st.lineCap !== "butt" ? ux * hw : 0, fy = i + 4 < p.length || sp.closed || st.lineCap !== "butt" ? uy * hw : 0;
          tris.push([x0 - ex + nx, y0 - ey + ny, x1 + fx + nx, y1 + fy + ny, x1 + fx - nx, y1 + fy - ny, x0 - ex - nx, y0 - ey - ny]);
        }
      }
      if (!tris.length) return;
      this.fillPolys(tris, tris.length === 1, st.stroke, false, true);
    }
    // fill polygons (device px) with a colour / gradient / pattern. Convex: straight into the batch.
    fillPolys(polys, isConvex, style, evenOdd, union) {
      const st = this.st;
      if (st.alpha <= 0) return;
      const paint = style instanceof GLGradient || style instanceof GLPattern ? style : null;
      if (!paint && isConvex) {
        let nv = 0; for (const p of polys) nv += p.length / 2;
        if (!this.prep(nv)) return;
        const { packed, a } = this.colorOf(style);
        if (a <= 0 && st.comp !== "__clear" && st.comp !== "copy") return;
        for (const p of polys) {
          const base = this.nv, k = p.length / 2;
          for (let i = 0; i < k; i++) this.vert(p[i * 2], p[i * 2 + 1], 0, 0, packed, -1);
          for (let i = 1; i + 1 < k; i++) { this.idx[this.ni++] = base; this.idx[this.ni++] = base + i; this.idx[this.ni++] = base + i + 1; }
        }
        return;
      }
      if (!this.prep(0)) return;
      this.flush();
      const gl = this.gl;
      // bounding box of everything (the cover quad)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of polys) for (let i = 0; i < p.length; i += 2) {
        const x = p[i], y = p[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(this.vw, Math.ceil(x1)); y1 = Math.min(this.vh, Math.ceil(y1));
      if (x1 <= x0 || y1 <= y0) return;
      const coverPts = [x0, y0, x1, y0, x1, y1, x0, y1];
      const clipped = this.appliedClips.length > 0;
      if (!isConvex) {
        // 1) the shape's winding into the stencil's low 7 bits
        this.stencilPolys(polys, evenOdd ? "evenodd" : union ? "union" : "nonzero");
        gl.enable(gl.STENCIL_TEST);
        if (clipped) gl.stencilFunc(gl.LESS, 0x80, 0xff); // bit 7 (the clip) set and some winding
        else gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f);
        gl.stencilMask(0x7f);
        gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO); // and clear the winding again as we cover
      } else {
        this.stencilForCover();
      }
      // 2) cover
      this.applyBlend(st.comp);
      if (paint) this.drawPaint(paint, isConvex ? polys : [coverPts]);
      else {
        const { packed } = this.colorOf(style);
        const p = coverPts;
        this.quad(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], 0, 0, 0, 0, packed, -1);
        this.blend = st.comp;
        const save = this.appliedClips; // flush() would reset the stencil state for a plain batch; draw by hand
        this.drawBatchRaw();
        this.appliedClips = save;
      }
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilMask(0xff);
      this.stencilForCover();
    }
    // draw what's in the batch with the stencil state already set
    drawBatchRaw() {
      const gl = this.gl;
      gl.useProgram(this.prog);
      gl.uniform2f(this.loc.res, this.vw, this.vh);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.f32.subarray(0, this.nv * FLOATS), gl.STREAM_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idx.subarray(0, this.ni), gl.STREAM_DRAW);
      gl.drawElements(gl.TRIANGLES, this.ni, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
      stats.draws++;
      this.nv = 0; this.ni = 0; this.batchUnits.length = 0; this.batchId++;
    }
    // triangle fans of the polygons into the stencil (no colour)
    stencilPolys(polys, rule) {
      const gl = this.gl;
      const verts = [];
      for (const p of polys) {
        const k = p.length / 2;
        for (let i = 1; i + 1 < k; i++) verts.push(p[0], p[1], p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      }
      if (!verts.length) return;
      gl.useProgram(this.paint);
      gl.uniform2f(this.ploc.uRes, this.vw, this.vh);
      gl.bindVertexArray(this.pvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pvbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilMask(0x7f);
      if (rule === "evenodd") gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      else if (rule === "union") gl.stencilOpSeparate(gl.FRONT_AND_BACK, gl.KEEP, gl.KEEP, gl.INCR);
      else { gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP); }
      if (rule === "evenodd") gl.stencilMask(0x01);
      gl.uniform1i(this.ploc.uMode, 0);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
      gl.colorMask(true, true, true, true);
      gl.bindVertexArray(null);
      stats.draws++;
    }
    // a gradient / pattern over the given polygons (stencil already set up)
    drawPaint(paint, polys) {
      const gl = this.gl, st = this.st, m = st.m;
      let tex, mode, sampler = null, pw = 1, ph = 1, mat = m;
      if (paint instanceof GLGradient) {
        tex = this.rampFor(paint);
        mode = paint.type === "linear" ? 1 : 2;
      } else {
        const e = this.texFor(paint.src);
        if (!e) return;
        tex = e.tex; mode = 3; pw = e.w; ph = e.h;
        sampler = this.samp[st.smooth ? 3 : 2];
        const p = paint.m; // pattern space -> user space -> device
        mat = [m[0] * p[0] + m[2] * p[1], m[1] * p[0] + m[3] * p[1], m[0] * p[2] + m[2] * p[3], m[1] * p[2] + m[3] * p[3],
          m[0] * p[4] + m[2] * p[5] + m[4], m[1] * p[4] + m[3] * p[5] + m[5]];
      }
      const det = mat[0] * mat[3] - mat[1] * mat[2];
      if (!det) return;
      const ia = mat[3] / det, ib = -mat[1] / det, ic = -mat[2] / det, id = mat[0] / det;
      const ie = -(ia * mat[4] + ic * mat[5]), iff = -(ib * mat[4] + id * mat[5]);
      gl.useProgram(this.paint);
      gl.uniform2f(this.ploc.uRes, this.vw, this.vh);
      gl.uniform1i(this.ploc.uMode, mode);
      gl.uniformMatrix3fv(this.ploc.uInv, false, [ia, ib, 0, ic, id, 0, ie, iff, 1]);
      gl.uniform1f(this.ploc.uH, this.vh);
      gl.uniform1f(this.ploc.uAlpha, st.alpha);
      gl.uniform2f(this.ploc.uPatSize, pw, ph);
      if (mode !== 3) {
        const a = paint.a;
        if (mode === 1) gl.uniform4f(this.ploc.uA, a[0], a[1], a[2], a[3]);
        else { gl.uniform4f(this.ploc.uA, a[0], a[1], a[2], 0); gl.uniform4f(this.ploc.uB, a[3], a[4], a[5], 0); }
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.bindSampler(0, sampler);
      gl.uniform1i(this.ploc.uRamp, 0);
      const verts = [];
      for (const p of polys) {
        const k = p.length / 2;
        for (let i = 1; i + 1 < k; i++) verts.push(p[0], p[1], p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
      }
      gl.bindVertexArray(this.pvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pvbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
      gl.bindVertexArray(null);
      gl.bindSampler(0, null);
      stats.draws++;
    }
    rampFor(g) {
      const sig = g.sig();
      let t = this.ramps.get(sig);
      if (t) return t;
      const c = document.createElement("canvas");
      c.width = 256; c.height = 1;
      const x = c.getContext("2d");
      const lg = x.createLinearGradient(0, 0, 256, 0);
      for (const [o, col] of g.stops) { try { lg.addColorStop(Math.max(0, Math.min(1, o)), col); } catch (e) { /* bad colour */ } }
      if (g.stops.length) { x.fillStyle = lg; x.fillRect(0, 0, 256, 1); }
      const gl = this.gl;
      t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      stats.uploads++;
      this.ramps.set(sig, t);
      return t;
    }
    createLinearGradient(x0, y0, x1, y1) { return new GLGradient("linear", [x0, y0, x1, y1]); }
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return new GLGradient("radial", [x0, y0, r0, x1, y1, r1]); }
    createConicGradient(a, x, y) { return new GLGradient("linear", [x, y, x + 1, y]); }
    createPattern(src, rep) { return src ? new GLPattern(src, rep) : null; }

    /* ----- clipping (stencil bit 7) ----- */
    clip(a, b) {
      const polys = this.polysOfPath();
      const evenOdd = (typeof a === "string" ? a : b) === "evenodd";
      this.st.clips = this.st.clips.concat([{ polys, evenOdd }]);
    }
    syncClip() {
      const gl = this.gl, clips = this.st.clips;
      this.viewportSync();
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0xff);
      gl.clearStencil(clips.length ? 0x80 : 0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.clearStencil(0);
      for (const c of clips) {
        if (!c.polys.length) { // empty clip: nothing passes
          gl.stencilMask(0x80); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); gl.stencilMask(0xff);
          continue;
        }
        this.stencilPolys(c.polys, c.evenOdd ? "evenodd" : "nonzero");
        // clear bit 7 wherever the winding is zero, then clear the winding
        gl.colorMask(false, false, false, false);
        gl.stencilFunc(gl.EQUAL, 0, 0x7f);
        gl.stencilMask(0x80);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
        this.fullScreenStencilQuad();
        gl.stencilMask(0x7f);
        gl.clear(gl.STENCIL_BUFFER_BIT); // clearStencil is 0: the low bits go back to 0
        gl.colorMask(true, true, true, true);
      }
      gl.stencilMask(0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      this.appliedClips = clips;
      this.stencilForCover();
    }
    fullScreenStencilQuad() {
      const gl = this.gl, w = this.vw, h = this.vh;
      gl.useProgram(this.paint);
      gl.uniform2f(this.ploc.uRes, w, h);
      gl.uniform1i(this.ploc.uMode, 0);
      gl.bindVertexArray(this.pvao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pvbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, w, 0, w, h, 0, 0, w, h, 0, h]), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    /* ----- text: each string drawn once into a little canvas, then a picture ----- */
    textCanvas(text, mode) {
      const st = this.st, m = st.m;
      const sc = Math.max(0.5, Math.round(Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) * 4) / 4);
      const style = mode === "f" ? st.fill : st.stroke;
      const styleKey = typeof style === "string" ? style : "#fff";
      const key = mode + "|" + st.font + "|" + styleKey + "|" + (mode === "s" ? st.lineWidth + st.lineJoin : "") + "|" + st.textAlign + "|" + st.textBaseline + "|" + sc + "|" + text;
      let e = textCache.get(key);
      if (e) { textCache.delete(key); textCache.set(key, e); return e; }
      const g = measureCtx();
      g.font = st.font; g.textAlign = st.textAlign; g.textBaseline = st.textBaseline;
      const mt = g.measureText(text);
      const pad = (mode === "s" ? st.lineWidth : 0) + 2;
      const left = Math.ceil(mt.actualBoundingBoxLeft || 0) + pad, right = Math.ceil(mt.actualBoundingBoxRight || mt.width) + pad;
      const asc = Math.ceil(mt.actualBoundingBoxAscent || 10) + pad, desc = Math.ceil(mt.actualBoundingBoxDescent || 3) + pad;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil((left + right) * sc)); c.height = Math.max(1, Math.ceil((asc + desc) * sc));
      const x = c.getContext("2d");
      x.scale(sc, sc);
      x.font = st.font; x.textAlign = st.textAlign; x.textBaseline = st.textBaseline;
      if (mode === "f") { x.fillStyle = styleKey; x.fillText(text, left, asc); }
      else { x.strokeStyle = styleKey; x.lineWidth = st.lineWidth; x.lineJoin = st.lineJoin; x.strokeText(text, left, asc); }
      e = { c, left, asc, w: c.width / sc, h: c.height / sc };
      textCache.set(key, e);
      if (textCache.size > 400) textCache.delete(textCache.keys().next().value);
      return e;
    }
    fillText(text, x, y) { this.drawText(String(text), x, y, "f"); }
    strokeText(text, x, y) { this.drawText(String(text), x, y, "s"); }
    drawText(text, x, y, mode) {
      if (!text) return;
      const e = this.textCanvas(text, mode);
      const smooth = this.st.smooth; this.st.smooth = true;
      this.drawImage(e.c, x - e.left, y - e.asc, e.w, e.h);
      this.st.smooth = smooth;
    }
    measureText(text) { const g = measureCtx(); g.font = this.st.font; g.textAlign = this.st.textAlign; g.textBaseline = this.st.textBaseline; return g.measureText(text); }

    /* ----- rarely used ----- */
    isPointInPath() { return false; }
    isPointInStroke() { return false; }
    drawFocusIfNeeded() {}
    getImageData(x, y, w, h) {
      this.flush();
      const gl = this.gl, px = new Uint8Array(w * h * 4);
      gl.readPixels(x, this.vh - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const out = new ImageData(w, h);
      for (let r = 0; r < h; r++) out.data.set(px.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4); // flip rows
      return out;
    }
    putImageData(d, x, y) {
      const c = document.createElement("canvas"); c.width = d.width; c.height = d.height;
      c.getContext("2d").putImageData(d, 0, 0);
      this.save(); this.setTransform(); this.globalCompositeOperation = "copy"; this.globalAlpha = 1;
      this.drawImage(c, x, y); this.restore();
    }
    createImageData(w, h) { return typeof w === "object" ? new ImageData(w.width, w.height) : new ImageData(w, h); }
  }

  // [equation, src factor, dst factor] on premultiplied colour
  const BLENDS = {
    "source-over": ["add", "ONE", "ONE_MINUS_SRC_ALPHA"],
    "lighter": ["add", "ONE", "ONE"],
    "screen": ["add", "ONE", "ONE_MINUS_SRC_COLOR"],
    "multiply": ["add", "DST_COLOR", "ONE_MINUS_SRC_ALPHA"],
    "darken": ["min", "ONE", "ONE"],
    "lighten": ["max", "ONE", "ONE"],
    "destination-out": ["add", "ZERO", "ONE_MINUS_SRC_ALPHA"],
    "destination-in": ["add", "ZERO", "SRC_ALPHA"],
    "destination-over": ["add", "ONE_MINUS_DST_ALPHA", "ONE"],
    "source-atop": ["add", "DST_ALPHA", "ONE_MINUS_SRC_ALPHA"],
    "source-in": ["add", "DST_ALPHA", "ZERO"],
    "destination-atop": ["add", "ONE_MINUS_DST_ALPHA", "SRC_ALPHA"],
    "xor": ["add", "ONE_MINUS_DST_ALPHA", "ONE_MINUS_SRC_ALPHA"],
    "copy": ["add", "ONE", "ZERO"],
    "__clear": ["add", "ZERO", "ZERO"],
  };
  for (const k of ["overlay", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]) BLENDS[k] = BLENDS["source-over"];

  function convex(p) {
    const n = p.length / 2;
    if (n < 3) return false;
    let sign = 0;
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], by = p[((i + 1) % n) * 2 + 1], cx = p[((i + 2) % n) * 2], cy = p[((i + 2) % n) * 2 + 1];
      const cr = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
      if (Math.abs(cr) < 1e-9) continue;
      const s = cr > 0 ? 1 : -1;
      if (!sign) sign = s; else if (s !== sign) return false;
    }
    return true;
  }
  const textCache = new Map();
  let mctx = null;
  function measureCtx() { if (!mctx) mctx = document.createElement("canvas").getContext("2d"); return mctx; }

  // every other (2D) canvas: count its changes so its GPU copy is refreshed when needed
  function trackCanvasChanges() {
    const P = CanvasRenderingContext2D.prototype;
    for (const name of ["clearRect", "fillRect", "strokeRect", "fill", "stroke", "drawImage", "putImageData", "fillText", "strokeText", "reset"]) {
      const f = P[name];
      if (typeof f !== "function") continue;
      P[name] = function () { const c = this.canvas; if (c) c.__glv = (c.__glv | 0) + 1; return f.apply(this, arguments); };
    }
    for (const prop of ["width", "height"]) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { get: d.get, set(v) { this.__glv = (this.__glv | 0) + 1; d.set.call(this, v); }, configurable: true, enumerable: d.enumerable });
    }
  }

  let shim = null, failed = false;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  if (wanted()) {
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      if (this.id === "view" && type === "2d" && !failed) {
        if (shim && shim.canvas === this) return shim;
        try {
          const gl = realGetContext.call(this, "webgl2", { alpha: true, premultipliedAlpha: true, antialias: !/[?&]glaa=0\b/.test(location.search), stencil: true, depth: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
          if (!gl) throw new Error("no webgl2");
          shim = new GL2DContext(this, gl);
          trackCanvasChanges();
          api.active = true;
          return shim;
        } catch (err) {
          failed = true;
          console.warn("WebGL renderer unavailable, using the 2D canvas:", err && err.message);
        }
      }
      return realGetContext.call(this, type, opts);
    };
  }
  const api = { active: false, stats, get ctx() { return shim; },
    // tests: a second WebGL 2D context on any canvas (tools/ check scripts)
    create(canvas, opts) {
      const gl = realGetContext.call(canvas, "webgl2", Object.assign({ alpha: true, premultipliedAlpha: true, antialias: true, stencil: true, depth: false, preserveDrawingBuffer: true }, opts || {}));
      return gl ? new GL2DContext(canvas, gl) : null;
    },
    GLGradient: null, GLPattern: null };
  api.GLGradient = GLGradient; api.GLPattern = GLPattern;
  return api;
})();
