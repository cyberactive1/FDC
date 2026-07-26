// Native ADCR console visuals — replaces the four static console screenshots
// (adcr-incident / heatmap / command / impact) with live canvas renderers.
//
//   01 subgraph — infrastructure threat graph: compromise spreads along real
//                 dependencies, blast radius is predicted, then severed, then healed.
//   02 origins  — attack-origin flow: ranked hostile ASNs streaming at the facility.
//   03 radar    — autonomous threat radar; radius is proximity to critical assets.
//   04 impact   — business impact: contained exposure vs. the unmitigated curve.
//
// startAdcr() owns all four loops and only runs the visible one, so switching
// views costs nothing and an off-screen console costs nothing at all.

const C = {
  base: '145,132,217', node: '181,171,252', tele: '150,196,240', deter: '126,214,233',
  threat: '240,132,160', risk: '236,178,120', contain: '150,206,236',
  heal: '134,222,190', action: '245,244,255', dim: '121,108,191', mute: '147,151,171'
};

const rgba = (c, a) => 'rgba(' + c + ',' + a + ')';
const reduced = () => window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fit(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr);
  cv.height = Math.max(1, r.height * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width || 1, h: r.height || 1 };
}

// deterministic PRNG so every reload frames the same composition
function prng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// One rAF loop that can be parked. Nothing draws unless it is both the active
// view and on screen, which is what keeps four live panes cheap on mobile.
function makeLoop(cv, build) {
  let g = null, raf = 0, running = false, scene = null, ro = null;
  const resize = () => { g = fit(cv); if (scene && scene.resize) scene.resize(g); };
  const frame = (t) => {
    if (!running) return;
    // a zero-size measurement during layout would leave the backing store at 0
    // and the pane permanently blank, so keep re-fitting until it has a box
    if (!g || !g.w || !g.h) resize();
    scene.draw(g, t / 1000);
    raf = requestAnimationFrame(frame);
  };
  // Draw one frame right now, without starting the loop. Used so a pane that has
  // never been shown still has pixels in it -- an unpainted canvas is a black box.
  const paintOnce = () => {
    if (!cv) return;
    if (!scene) scene = build();
    resize();
    if (!g || !g.w || !g.h) return;
    scene.draw(g, (window.performance ? performance.now() : Date.now()) / 1000);
  };

  return {
    prime() { try { paintOnce(); } catch (err) { console.error('[fdc] pane prime failed:', err); } },
    resume() {
      if (running || !cv) return;
      running = true;
      if (!scene) scene = build();
      if (!ro && window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(cv); }
      resize();
      // paint synchronously so the pane is never empty while waiting for a frame
      paintOnce();
      if (reduced()) { running = false; return; }   // static frame is enough
      raf = requestAnimationFrame(frame);
    },
    pause() { running = false; cancelAnimationFrame(raf); },
    stop() { this.pause(); if (ro) ro.disconnect(); ro = null;
             if (scene && scene.stop) scene.stop(); scene = null; }
  };
}

/* ------------------------------------------------------------------ 02 */
// Attack-origin flow. Ranked hostile origins on the left stream particles into
// the facility node on the right; band thickness tracks campaign volume.
function buildOrigins(speed) {
  const ORIGINS = [
    ['RU · ASN 208091', 0.95, C.threat], ['CN · ASN 4134', 0.78, C.threat],
    ['IR · ASN 44244', 0.61, C.risk], ['KP · ASN 131279', 0.44, C.risk],
    ['BR · ASN 28573', 0.33, C.base], ['NG · ASN 37282', 0.24, C.base],
    ['Unattributed', 0.18, C.dim]
  ];
  const rnd = prng(4242);
  const parts = [];
  let acc = 0;
  return {
    draw({ ctx, w, h }, now) {
      ctx.clearRect(0, 0, w, h);
      const padT = 26, padB = 22;
      const rowH = (h - padT - padB) / ORIGINS.length;
      const tx = w * 0.80, ty = h * 0.5;

      // grid wash
      ctx.strokeStyle = rgba(C.mute, 0.05);
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(w * i / 6, 0); ctx.lineTo(w * i / 6, h); ctx.stroke();
      }

      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ORIGINS.forEach((o, i) => {
        const y = padT + rowH * (i + 0.5);
        const sev = o[1];
        // label + volume bar
        ctx.fillStyle = rgba(C.mute, 0.8);
        ctx.fillText(o[0], 12, y - 5);
        const bw = (w * 0.34) * sev;
        ctx.fillStyle = rgba(o[2], 0.16);
        ctx.fillRect(12, y + 2, w * 0.34, 3);
        ctx.fillStyle = rgba(o[2], 0.85);
        ctx.fillRect(12, y + 2, bw, 3);

        // flow band toward the facility
        ctx.strokeStyle = rgba(o[2], 0.1 + sev * 0.12);
        ctx.lineWidth = 0.8 + sev * 2.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.36, y + 3);
        ctx.bezierCurveTo(w * 0.55, y + 3, w * 0.62, ty, tx, ty);
        ctx.stroke();
      });

      // spawn particles proportional to severity
      acc += 0.06 * speed;
      while (acc > 0.06) {
        acc -= 0.06;
        const i = Math.floor(rnd() * ORIGINS.length);
        if (rnd() < ORIGINS[i][1]) parts.push({ i, t: 0, sp: 0.006 + rnd() * 0.009 });
      }
      if (parts.length > 200) parts.splice(0, parts.length - 200);

      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.t += p.sp * speed * 1.6;
        if (p.t >= 1) { parts.splice(k, 1); continue; }
        const o = ORIGINS[p.i];
        const y0 = padT + rowH * (p.i + 0.5) + 3;
        const u = p.t, iu = 1 - u;
        // cubic bezier along the same path as the band
        const x = iu ** 3 * (w * 0.36) + 3 * iu * iu * u * (w * 0.55) + 3 * iu * u * u * (w * 0.62) + u ** 3 * tx;
        const y = iu ** 3 * y0 + 3 * iu * iu * u * y0 + 3 * iu * u * u * ty + u ** 3 * ty;
        ctx.fillStyle = rgba(o[2], 0.35 + 0.5 * Math.sin(u * Math.PI));
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, 7);
        ctx.fill();
      }

      // facility node + deterrence rings
      for (let r = 0; r < 3; r++) {
        const p = ((now * 0.5 * speed) + r / 3) % 1;
        ctx.strokeStyle = rgba(C.deter, (1 - p) * 0.35);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(tx, ty, 9 + p * 34, 0, 7);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgb(' + C.action + ')';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.font = '600 9.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(C.node, 0.9);
      ctx.fillText('SUNRISE, FL', tx - 26, ty + 26);
      ctx.fillStyle = rgba(C.mute, 0.65);
      ctx.fillText('12,480 hostile sources · 4 campaigns', 12, h - 8);
    }
  };
}

/* ------------------------------------------------------------------ 04 */
// Business impact. Two curves: unmitigated loss climbing away, and the
// contained curve flattening the moment autonomous response fires.
function buildImpact(speed) {
  const n = 72;
  let t0 = 0;
  return {
    draw({ ctx, w, h }, now) {
      const cycle = 9 / speed;
      // start part-way through the cycle: at prog 0 the plot is bare, and the
      // first thing a viewer sees on this tab should already be a populated chart
      if (!t0) t0 = now - cycle * 0.42;
      const prog = Math.min(1, ((now - t0) % cycle) / (cycle * 0.82));
      ctx.clearRect(0, 0, w, h);
      const padL = 40, padR = 14, padT = 22, padB = 26;
      const gw = w - padL - padR, gh = h - padT - padB;
      const X = i => padL + gw * (i / (n - 1));
      const Y = v => padT + gh * (1 - v);

      // axes
      ctx.strokeStyle = rgba(C.mute, 0.1);
      ctx.lineWidth = 1;
      ctx.font = '500 9px Inter, system-ui, sans-serif';
      for (let i = 0; i <= 4; i++) {
        const y = padT + gh * i / 4;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.fillStyle = rgba(C.mute, 0.5);
        ctx.fillText(['$4M', '$3M', '$2M', '$1M', '$0'][i], 8, y + 3);
      }

      const brk = 0.34;                       // autonomous response fires here
      const unmit = i => Math.min(1, (i / (n - 1)) ** 1.35 * 1.12);
      const cont = i => {
        const u = i / (n - 1);
        return u <= brk ? unmit(i) : unmit(brk * (n - 1)) + (u - brk) * 0.10;
      };
      const upto = Math.max(1, Math.floor(prog * (n - 1)));

      // unmitigated area
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      for (let i = 0; i <= upto; i++) ctx.lineTo(X(i), Y(unmit(i)));
      ctx.lineTo(X(upto), Y(0));
      ctx.closePath();
      const g1 = ctx.createLinearGradient(0, padT, 0, padT + gh);
      g1.addColorStop(0, rgba(C.threat, 0.26));
      g1.addColorStop(1, rgba(C.threat, 0.02));
      ctx.fillStyle = g1;
      ctx.fill();
      ctx.strokeStyle = rgba(C.threat, 0.75);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) i ? ctx.lineTo(X(i), Y(unmit(i))) : ctx.moveTo(X(i), Y(unmit(i)));
      ctx.stroke();
      ctx.setLineDash([]);

      // contained curve
      ctx.strokeStyle = rgba(C.heal, 0.95);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) i ? ctx.lineTo(X(i), Y(cont(i))) : ctx.moveTo(X(i), Y(cont(i)));
      ctx.stroke();

      // response marker
      if (prog > brk) {
        const bx = X(brk * (n - 1));
        ctx.strokeStyle = rgba(C.contain, 0.55);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(bx, padT); ctx.lineTo(bx, padT + gh); ctx.stroke();
        ctx.setLineDash([]);
        const pl = (now * 1.2 * speed) % 1;
        ctx.strokeStyle = rgba(C.contain, (1 - pl) * 0.7);
        ctx.beginPath(); ctx.arc(bx, Y(cont(brk * (n - 1))), 3 + pl * 13, 0, 7); ctx.stroke();
        ctx.fillStyle = rgba(C.contain, 0.9);
        ctx.font = '600 8.5px Inter, system-ui, sans-serif';
        ctx.fillText('AUTONOMOUS RESPONSE', bx + 6, padT + 11);
      }

      // live head + delta
      const hv = cont(upto), hu = unmit(upto);
      ctx.fillStyle = rgba(C.action, 0.95);
      ctx.beginPath(); ctx.arc(X(upto), Y(hv), 2.8, 0, 7); ctx.fill();
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(C.heal, 0.95);
      ctx.fillText('$' + (hv * 4).toFixed(2) + 'M contained', padL + 4, padT + gh - 6);
      ctx.fillStyle = rgba(C.threat, 0.8);
      ctx.fillText('$' + (hu * 4).toFixed(2) + 'M unmitigated', padL + 4, padT + 12);
      ctx.fillStyle = rgba(C.mute, 0.6);
      ctx.font = '500 9px Inter, system-ui, sans-serif';
      ctx.fillText('loss avoided · $' + ((hu - hv) * 4).toFixed(2) + 'M', w - padR - 108, padT + gh + 16);
    }
  };
}


/* ------------------------------------------------- 05 unified world map */
// Coarse equirectangular coastlines in [lon, lat] so the projection stays
// readable at any panel size. Detail is deliberately low: this reads as a
// world map at a glance and costs one path per landmass per frame.
const LAND = [
  // North America
  [[-168,65],[-160,71],[-140,70],[-124,70],[-110,69],[-95,70],[-85,73],[-75,72],[-68,63],
   [-58,52],[-66,45],[-70,42],[-74,36],[-79,32],[-81,25],[-84,29],[-88,30],[-94,29],
   [-97,26],[-101,22],[-105,21],[-110,24],[-114,29],[-117,33],[-122,37],[-124,44],
   [-124,48],[-131,54],[-140,59],[-150,59],[-158,56],[-165,60],[-168,65]],
  // Central America
  [[-92,16],[-88,16],[-83,10],[-78,9],[-77,8],[-83,8],[-87,13],[-92,16]],
  // Greenland
  [[-45,60],[-32,63],[-24,68],[-20,73],[-24,78],[-32,82],[-45,83],[-56,82],[-62,77],
   [-58,70],[-52,64],[-45,60]],
  // South America
  [[-77,8],[-72,11],[-64,10],[-60,6],[-51,4],[-50,0],[-44,-2],[-38,-5],[-35,-8],[-38,-13],
   [-39,-18],[-45,-23],[-48,-25],[-53,-33],[-58,-35],[-62,-39],[-65,-45],[-68,-52],
   [-70,-55],[-74,-52],[-73,-45],[-73,-37],[-71,-30],[-70,-23],[-70,-18],[-76,-14],
   [-79,-8],[-81,-5],[-80,0],[-77,4],[-77,8]],
  // Eurasia
  [[-9,43],[-2,43],[1,50],[5,52],[8,54],[10,57],[6,58],[8,63],[12,65],[16,69],[21,70],
   [26,71],[31,70],[38,68],[45,66],[52,69],[60,70],[70,73],[80,73],[90,76],[100,77],
   [110,75],[120,73],[130,71],[140,72],[150,70],[160,69],[170,66],[178,65],[170,60],
   [160,57],[150,50],[142,45],[136,35],[130,34],[126,35],[122,31],[121,25],[112,21],
   [108,15],[106,9],[103,4],[100,7],[98,13],[95,17],[92,21],[88,21],[84,19],[80,16],
   [77,8],[73,15],[70,21],[66,24],[62,25],[58,24],[52,29],[48,30],[45,38],[41,42],
   [36,36],[32,31],[28,37],[25,40],[21,39],[16,41],[13,45],[9,44],[4,43],[0,40],
   [-6,36],[-9,38],[-9,43]],
  // Africa
  [[-17,15],[-16,21],[-10,28],[0,32],[10,34],[20,32],[28,31],[33,31],[35,24],[39,16],
   [43,12],[48,12],[51,11],[45,3],[41,-2],[40,-9],[39,-16],[35,-24],[32,-29],[26,-34],
   [20,-35],[16,-29],[13,-23],[12,-16],[9,-1],[5,5],[-3,5],[-8,7],[-13,9],[-17,15]],
  // Arabia
  [[35,30],[43,30],[48,29],[57,25],[59,22],[52,16],[45,13],[39,16],[35,23],[35,30]],
  // India
  [[68,23],[72,20],[73,15],[77,8],[80,13],[81,18],[85,20],[88,22],[80,22],[73,23],[68,23]],
  // Australia
  [[114,-22],[122,-18],[130,-12],[137,-12],[143,-13],[146,-19],[151,-24],[153,-28],
   [150,-37],[143,-39],[135,-35],[129,-32],[120,-34],[115,-30],[114,-22]],
  // islands and archipelagos — small, but they are what the eye recognises
  [[-6,50],[-3,51],[1,52],[-1,55],[-3,58],[-5,58],[-6,55],[-6,50]],
  [[-10,52],[-6,52],[-6,55],[-10,55],[-10,52]],
  [[-24,64],[-14,65],[-14,66],[-22,66],[-24,64]],
  [[130,31],[135,34],[138,37],[141,40],[142,44],[145,44],[141,38],[138,35],[135,33],[130,31]],
  [[95,5],[104,-2],[107,-6],[114,-8],[118,-9],[110,-7],[102,-5],[97,2],[95,5]],
  [[109,2],[117,4],[119,-1],[116,-4],[110,-3],[109,2]],
  [[131,-2],[141,-3],[150,-9],[141,-9],[134,-8],[131,-2]],
  [[120,6],[126,8],[126,14],[122,18],[120,14],[120,6]],
  [[43,-12],[50,-15],[50,-25],[45,-25],[43,-18],[43,-12]],
  [[80,6],[82,7],[82,9],[80,9],[80,6]],
  [[173,-35],[178,-38],[174,-41],[172,-44],[167,-46],[170,-43],[172,-39],[173,-35]]
];
// Freedom DC edge sites, and the hostile origins that lean on them.
const SITES = [
  ['DFW-02', -97.0, 32.8], ['ASH-01', -77.5, 39.0],
  ['FRA-05', 8.7, 50.1],   ['SIN-03', 103.8, 1.35]
];
const SOURCES = [
  [37.6, 55.8, 1.00, 'threat'], [114.1, 22.5, 0.86, 'threat'],
  [51.4, 35.7, 0.62, 'risk'],   [125.8, 39.0, 0.50, 'risk'],
  [-46.6, -23.5, 0.40, 'base'], [3.4, 6.5, 0.30, 'base'],
  [29.0, 41.0, 0.55, 'risk']
];

function buildWorldMap(speed, opts) {
  const rnd = prng(2024);
  // callers can override the marker set: the Command Center panel converges on
  // Sunrise alone, the unified console fans across the edge sites.
  const sites = (opts && opts.sites) || SITES;
  const single = sites.length === 1;
  const arcs = [];
  let acc = 0, target = 0, tSwap = 0;

  return {
    draw({ ctx, w, h }, now) {
      // letterbox the 2:1 projection inside whatever box we are given
      const mw = Math.min(w, h * 2), mh = mw / 2;
      const ox = (w - mw) / 2, oy = (h - mh) / 2;
      const X = lon => ox + (lon + 180) / 360 * mw;
      const Y = lat => oy + (90 - lat) / 180 * mh;
      ctx.clearRect(0, 0, w, h);

      // frame + graticule. The reference reads as one clear equator over a very
      // faint grid, rather than an even lattice.
      ctx.strokeStyle = rgba(C.base, 0.16);
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, mw - 1, mh - 1);
      ctx.strokeStyle = rgba(C.mute, 0.035);
      for (let lat = -60; lat <= 60; lat += 30) {
        if (!lat) continue;
        ctx.beginPath(); ctx.moveTo(ox, Y(lat)); ctx.lineTo(ox + mw, Y(lat)); ctx.stroke();
      }
      for (let lon = -120; lon <= 120; lon += 60) {
        ctx.beginPath(); ctx.moveTo(X(lon), oy); ctx.lineTo(X(lon), oy + mh); ctx.stroke();
      }
      ctx.strokeStyle = rgba(C.mute, 0.13);
      ctx.beginPath(); ctx.moveTo(ox, Y(0)); ctx.lineTo(ox + mw, Y(0)); ctx.stroke();

      // landmasses
      for (const poly of LAND) {
        ctx.beginPath();
        poly.forEach((pt, i) => i ? ctx.lineTo(X(pt[0]), Y(pt[1])) : ctx.moveTo(X(pt[0]), Y(pt[1])));
        ctx.closePath();
        ctx.fillStyle = rgba(C.base, 0.19);
        ctx.fill();
        ctx.strokeStyle = rgba(C.node, 0.16);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // origin heat blooms
      ctx.globalCompositeOperation = 'lighter';
      for (const s of SOURCES) {
        const tone = s[3] === 'threat' ? C.threat : s[3] === 'risk' ? C.risk : C.dim;
        const br = 0.7 + 0.3 * Math.sin(now * (0.6 + s[2]) + s[0]);
        const rad = mh * (0.10 + s[2] * 0.20) * br;
        const g = ctx.createRadialGradient(X(s[0]), Y(s[1]), 0, X(s[0]), Y(s[1]), rad);
        g.addColorStop(0, rgba(tone, 0.34 * s[2]));
        g.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(X(s[0]), Y(s[1]), rad, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // origin cores, so each bloom reads as a located source
      for (const s2 of SOURCES) {
        const tone = s2[3] === 'threat' ? C.threat : s2[3] === 'risk' ? C.risk : C.dim;
        ctx.fillStyle = rgba(tone, 0.85);
        ctx.beginPath(); ctx.arc(X(s2[0]), Y(s2[1]), 1.5 + s2[2] * 1.6, 0, 7); ctx.fill();
      }

      // which site is currently taking fire
      if (!single && now - tSwap > 5.5 / speed) { tSwap = now; target = (target + 1) % sites.length; }

      // spawn attack runs
      acc += 0.05 * speed;
      while (acc > 0.05) {
        acc -= 0.05;
        const s = SOURCES[Math.floor(rnd() * SOURCES.length)];
        if (rnd() < s[2]) {
          const dst = single ? 0 : (rnd() < 0.55 ? target : Math.floor(rnd() * sites.length));
          arcs.push({ s, d: dst, t: 0, sp: 0.004 + rnd() * 0.006 });
        }
      }
      if (arcs.length > 90) arcs.splice(0, arcs.length - 90);

      // arcs: dashed great-circle-ish beziers bowing toward the pole
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.t += a.sp * speed;
        if (a.t >= 1) { arcs.splice(i, 1); continue; }
        const st = sites[a.d];
        const x0 = X(a.s[0]), y0 = Y(a.s[1]), x1 = X(st[1]), y1 = Y(st[2]);
        const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.34 - 12;
        const tone = a.s[3] === 'threat' ? C.threat : a.s[3] === 'risk' ? C.risk : C.dim;
        ctx.strokeStyle = rgba(tone, 0.42);
        ctx.lineWidth = 1.1;
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -now * 22 * speed;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        // travelling head
        const u = a.t, iu = 1 - u;
        const hx = iu * iu * x0 + 2 * iu * u * cx + u * u * x1;
        const hy = iu * iu * y0 + 2 * iu * u * cy + u * u * y1;
        ctx.fillStyle = rgba(tone, 0.55 + 0.45 * Math.sin(u * Math.PI));
        ctx.beginPath(); ctx.arc(hx, hy, 1.7, 0, 7); ctx.fill();
      }

      // facility markers
      ctx.font = '600 9.5px Inter, system-ui, sans-serif';
      sites.forEach((st, i) => {
        const x = X(st[1]), y = Y(st[2]), hot = single || i === target;
        const pl = (now * (hot ? 1.1 : 0.5) * speed) % 1;
        ctx.strokeStyle = rgba(hot ? C.threat : C.deter, (1 - pl) * 0.6);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 5 + pl * 22, 0, 7); ctx.stroke();
        ctx.save();
        ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = rgba(C.deter, 0.35); ctx.lineWidth = 4;
        ctx.strokeRect(-5.6, -5.6, 11.2, 11.2);          // soft outer glow
        ctx.strokeStyle = rgba(C.deter, 1); ctx.lineWidth = 1.5;
        ctx.strokeRect(-5.6, -5.6, 11.2, 11.2);
        ctx.fillStyle = rgba(hot ? C.threat : C.action, 0.95);
        ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
        ctx.restore();
        ctx.fillStyle = rgba(C.node, 0.9);
        ctx.fillText(st[0], x - ctx.measureText(st[0]).width / 2, y + 23);
        if (hot) {
          ctx.fillStyle = rgba(C.threat, 0.85 + 0.15 * Math.sin(now * 6));
          ctx.font = '700 9px Inter, system-ui, sans-serif';
          ctx.fillText('UNDER ATTACK', x - 62, y - 10);
          ctx.font = '600 9.5px Inter, system-ui, sans-serif';
        }
      });
    }
  };
}


/* --------------------------------------------------- 06 risk correlation */
// A layered dependency graph carrying real detail: every entity has a type and a
// name, every relationship has a kind, and live detections sit on the nodes that
// raised them. Edges only cross from one tier to the next so risk has a readable
// direction, and one compromise path is traced through the layers with the
// uncorrelated remainder dimmed hard.
//
// entity: [name, type]   type drives the glyph
const TIERS = [
  ['Edge', [['vpn-edge-04','net'],['bgp-peer-2','net'],['waf-01','net'],['api-gw-03','svc'],
            ['dns-01','net'],['smtp-relay','svc'],['cdn-pop-7','net'],['iot-gw-2','net']]],
  ['Service', [['identity','idp'],['k8s-api','svc'],['storage-svc','disk'],
               ['backup-svc','disk'],['secrets','idp'],['queue-01','svc']]],
  ['Platform', [['orchestrator','svc'],['fabric-ctl','net'],['hypervisor','host'],
                ['image-registry','disk']]],
  ['Core', [['tenant-sierra','tenant'],['tenant-delta','tenant'],['control-plane','host']]]
];
// relationship kinds: label, dash pattern
const RELS = [['depends on', []], ['authenticates to', [1, 3]], ['replicates to', [5, 4]]];
// the detection library the graph draws from
const FINDINGS = [
  ['credential replay', 0.97], ['anomalous token mint', 0.93], ['lateral SMB sweep', 0.88],
  ['firmware drift', 0.79], ['unsigned image pull', 0.91], ['egress to new ASN', 0.84]
];

function buildRiskGraph(speed, opts) {
  // seed changes the topology, so the detection pane and the command-centre
  // panel are not the same picture twice; nDet controls how many findings land
  const nDet = (opts && opts.detections) || 3;
  const focus = (opts && opts.focus) || 'propagation';
  const rnd = prng((opts && opts.seed) || 5150);
  const nodes = [];
  TIERS.forEach((tier, ti) => {
    tier[1].forEach((ent, ni) => {
      nodes.push({
        name: ent[0], type: ent[1], tier: ti,
        fx: 0.11 + ti * 0.263,
        fy: (ni + 0.5) / tier[1].length,
        jit: (rnd() - 0.5) * 0.045,
        ph: rnd() * 6.283,
        r: ti === 3 ? 5 : ti === 2 ? 4 : 3
      });
    });
  });
  const byTier = ti => nodes.map((n, i) => [n, i]).filter(pr => pr[0].tier === ti);

  const edges = [];
  for (let ti = 0; ti < TIERS.length - 1; ti++) {
    const from = byTier(ti), to = byTier(ti + 1);
    from.forEach(([, fi]) => {
      const n = 2 + (rnd() > 0.45 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const [, tIdx] = to[Math.floor(rnd() * to.length)];
        if (!edges.some(e => e.a === fi && e.b === tIdx)) {
          edges.push({ a: fi, b: tIdx, rel: rnd() > 0.72 ? (rnd() > 0.5 ? 1 : 2) : 0 });
        }
      }
    });
  }
  const out = nodes.map(() => []);
  edges.forEach((e, k) => out[e.a].push([e.b, k]));

  const PHASES = [
    ['Correlating telemetry', C.tele],
    ['Compromise path identified', C.threat],
    ['Predicting blast radius', C.risk],
    ['Severing dependencies', C.contain],
    ['Rehydrating services', C.heal]
  ];
  let phase = 0, t0 = 0, path = [], pathEdges = [], blast = [], dets = [];

  const trace = () => {
    path = []; pathEdges = []; blast = []; dets = [];
    let cur = byTier(0)[Math.floor(rnd() * byTier(0).length)][1];
    path.push(cur);
    while (out[cur].length) {
      const [nx, ek] = out[cur][Math.floor(rnd() * out[cur].length)];
      pathEdges.push(ek); path.push(nx); cur = nx;
    }
    // transitively downstream of the origin = predicted blast radius
    const seen = {};
    let frontier = [path[0]];
    while (frontier.length) {
      const next = [];
      frontier.forEach(i => out[i].forEach(([j]) => {
        if (seen[j]) return;
        seen[j] = 1; next.push(j);
        if (path.indexOf(j) < 0) blast.push(j);
      }));
      frontier = next;
    }
    // detections land on the nodes that actually raised them; sample without
    // replacement so three findings never come back as the same finding twice
    const pool = FINDINGS.slice();
    path.slice(0, nDet).forEach(ni => {
      if (!pool.length) return;
      const f = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      dets.push({ node: ni, what: f[0], conf: f[1] });
    });
  };

  // small type glyphs, drawn centred on the node
  const glyph = (ctx, t, x, y, r, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.1;
    if (t === 'disk') {
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, 7); ctx.stroke();
    } else if (t === 'net') {
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r);
      ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.closePath(); ctx.stroke();
    } else if (t === 'idp') {
      ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    } else if (t === 'tenant') {
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeRect(x - r * 0.45, y - r * 0.45, r * 0.9, r * 0.9);
    } else if (t === 'host') {
      ctx.strokeRect(x - r, y - r * 0.7, r * 2, r * 1.4);
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r); ctx.lineTo(x + r * 0.5, y + r); ctx.stroke();
    } else {
      ctx.strokeRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    }
  };

  return {
    draw({ ctx, w, h }, now) {
      if (!t0) { t0 = now; trace(); if (focus === 'detection') phase = 1; }
      if (now - t0 > 3.6 / speed) {
        t0 = now;
        phase = (phase + 1) % PHASES.length;
        if (phase === 0) trace();
      }
      const padT = 30, padB = 34;
      const X = n => 26 + n.fx * (w - 52);
      const Y = n => padT + (n.fy + n.jit) * (h - padT - padB);
      ctx.clearRect(0, 0, w, h);

      const onPath = i => path.indexOf(i) >= 0;
      const inBlast = i => blast.indexOf(i) >= 0;
      const showBlast = phase >= 2, cut = phase >= 3, healed = phase >= 4;
      const detOf = i => { for (const d of dets) if (d.node === i) return d; return null; };

      // tier columns
      ctx.font = '600 8.5px Inter, system-ui, sans-serif';
      TIERS.forEach((t, ti) => {
        const x = 26 + (0.11 + ti * 0.263) * (w - 52);
        ctx.strokeStyle = rgba(C.base, 0.055);
        ctx.beginPath(); ctx.moveTo(x, padT - 12); ctx.lineTo(x, h - padB + 12); ctx.stroke();
        ctx.fillStyle = rgba(C.mute, 0.42);
        ctx.fillText(t[0].toUpperCase(), x - ctx.measureText(t[0]).width / 2 - 2, h - 12);
      });

      // background relationships, dash pattern carries the kind
      for (let k = 0; k < edges.length; k++) {
        if (pathEdges.indexOf(k) >= 0) continue;
        const e = edges[k], a = nodes[e.a], b = nodes[e.b];
        const hot = showBlast && (onPath(e.a) || inBlast(e.b));
        ctx.strokeStyle = hot ? rgba(C.risk, 0.34) : rgba(C.tele, 0.20);
        ctx.lineWidth = hot ? 1.1 : 0.8;
        ctx.setLineDash(RELS[e.rel][1]);
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.bezierCurveTo((X(a) + X(b)) / 2, Y(a), (X(a) + X(b)) / 2, Y(b), X(b), Y(b));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // the correlated chain, with its relationship kinds labelled
      const tone = healed ? C.heal : cut ? C.contain : C.threat;
      pathEdges.forEach((k, si) => {
        const e = edges[k], a = nodes[e.a], b = nodes[e.b];
        const x0 = X(a), y0 = Y(a), x1 = X(b), y1 = Y(b), cxm = (x0 + x1) / 2;
        ctx.strokeStyle = rgba(tone, 0.92);
        ctx.lineWidth = 2.1;
        ctx.setLineDash(cut ? [3, 4] : RELS[e.rel][1]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(cxm, y0, cxm, y1, x1, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        // relationship label at the midpoint
        ctx.font = '500 7.5px Inter, system-ui, sans-serif';
        const lbl = RELS[e.rel][0];
        const lw = ctx.measureText(lbl).width;
        const my = (y0 + y1) / 2;
        ctx.fillStyle = rgba('14,15,24', 0.85);
        ctx.fillRect(cxm - lw / 2 - 3, my - 9, lw + 6, 11);
        ctx.fillStyle = rgba(C.mute, 0.85);
        ctx.fillText(lbl, cxm - lw / 2, my - 1);
        if (!cut) {
          for (let d = 0; d < 2; d++) {
            const u = ((now * 0.5 * speed) + si * 0.33 + d * 0.5) % 1, iu = 1 - u;
            const px = iu*iu*iu*x0 + 3*iu*iu*u*cxm + 3*iu*u*u*cxm + u*u*u*x1;
            const py = iu*iu*iu*y0 + 3*iu*iu*u*y0 + 3*iu*u*u*y1 + u*u*u*y1;
            ctx.fillStyle = rgba(C.action, 0.85 * Math.sin(u * Math.PI));
            ctx.beginPath(); ctx.arc(px, py, 2, 0, 7); ctx.fill();
          }
        }
      });

      // Entities. The reference console badges significant infrastructure in a
      // ring with its type glyph and the name underneath, leaving the long tail
      // as plain dots -- that is what keeps a 21-node graph legible.
      const major = i => onPath(i) || (showBlast && inBlast(i)) || nodes[i].tier >= 2;
      nodes.forEach((n, i) => {
        if (major(i)) return;
        const x = X(n), y = Y(n);
        ctx.fillStyle = rgba(C.node, 0.3 + 0.12 * Math.sin(now * 1.2 + n.ph));
        ctx.beginPath(); ctx.arc(x, y, 2.1, 0, 7); ctx.fill();
      });
      nodes.forEach((n, i) => {
        if (!major(i)) return;
        const x = X(n), y = Y(n);
        const p = onPath(i), b = showBlast && inBlast(i);
        let col = C.tele, al = 0.62;
        if (b) { col = C.risk; al = 0.9; }
        if (p) { col = tone; al = 1; }
        const R = p ? 12 : b ? 10.5 : 9.5;
        ctx.fillStyle = 'rgba(16,17,32,.94)';          // disc, so edges do not cross the glyph
        ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
        ctx.strokeStyle = rgba(col, al);
        ctx.lineWidth = p ? 1.7 : 1.2;
        ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
        glyph(ctx, n.type, x, y, R * 0.42, rgba(col, Math.min(1, al + 0.1)));
        if (p) {
          const pr = (now * 0.9 * speed + i * 0.2) % 1;
          ctx.strokeStyle = rgba(col, (1 - pr) * 0.45);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, R + 2 + pr * 16, 0, 7); ctx.stroke();
        }
        ctx.font = (p ? '600 8.5px' : '500 8px') + ' Inter, system-ui, sans-serif';
        const tw = ctx.measureText(n.name).width;
        ctx.fillStyle = rgba(p ? C.action : b ? C.risk : C.mute, p ? 0.95 : 0.72);
        ctx.fillText(n.name, x - tw / 2, y + R + 11);
      });

      // detections, badged on the entity that raised them
      ctx.font = '600 8px Inter, system-ui, sans-serif';
      dets.forEach(d => {
        const n = nodes[d.node], x = X(n), y = Y(n);
        const txt = d.what + '  ' + d.conf.toFixed(2);
        const tw = ctx.measureText(txt).width;
        const bx = x - tw / 2 - 7, by = y - 15 - 20;
        ctx.fillStyle = rgba('14,15,24', 0.92);
        ctx.fillRect(bx, by, tw + 14, 13);
        ctx.strokeStyle = rgba(C.threat, 0.6); ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, tw + 14, 13);
        ctx.fillStyle = rgba(C.threat, 0.95);
        ctx.beginPath(); ctx.arc(bx + 5, by + 6.5, 2, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(C.action, 0.92);
        ctx.fillText(txt, bx + 10, by + 9.5);
      });

      // header: phase left, inventory right
      ctx.font = '600 9.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(PHASES[phase][1], 0.92);
      ctx.fillText(PHASES[phase][0].toUpperCase(), 26, 16);
      ctx.font = '500 9px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(C.mute, 0.62);
      const inv = nodes.length + ' entities · ' + edges.length + ' relationships · '
                + dets.length + ' detections · ' + blast.length + ' at risk';
      ctx.fillText(inv, w - 26 - ctx.measureText(inv).width, 16);
    }
  };
}


/* ------------------------------------------------ 07 telemetry radar */
// The Autonomous Telemetry Radar. Six operational domains ring an AI core;
// every domain streams telemetry inward, escalates through anomaly confidence
// states, and when a fault cascades the correlation between domains is drawn
// rather than left implied. Deliberately not a spider chart: nothing here plots
// a static value, it shows flow, confidence and propagation.
const TD = [
  ['Facilities',   'power · cooling · BMS',            2140],
  ['Compute',      'servers · GPU · virtualization',   6820],
  ['Network',      'routers · firewalls · SD-WAN',     3410],
  ['Applications', 'APIs · databases · workloads',     4180],
  ['Security',     'EDR · SIEM · identity',            1290],
  ['Cloud',        'AWS · Azure · GCP · SaaS',          572]
];
// the cascade the platform is built to predict: cooling -> GPU -> latency ->
// traffic shift -> auth anomaly -> workload migration
const CASCADE = [0, 1, 3, 2, 4, 5];
const CONF = [
  ['nominal',  '150,196,240'],   // blue
  ['watch',    '232,208,122'],   // yellow
  ['high',     '236,178,120'],   // orange
  ['critical', '240,132,160']    // red
];

function buildTelemetryRadar(speed, opts) {
  const compact = !!(opts && opts.compact);
  const getSel = (opts && opts.getDomain) || (() => -1);
  const rnd = prng(7311);
  const N = TD.length;
  const SEG = (Math.PI * 2) / N;

  const dom = TD.map((d, i) => ({
    name: d[0], sub: d[1], assets: d[2],
    a0: -Math.PI / 2 + i * SEG - SEG / 2,
    conf: 0, target: 0, vol: 0.5 + rnd() * 0.3, volPh: rnd() * 6.283,
    parts: []
  }));

  // click-to-select, mapped from the angle under the pointer
  let detach = null;
  if (opts && opts.cv && opts.onSelect) {
    const cv = opts.cv;
    const onClick = ev => {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left - r.width / 2;
      const y = ev.clientY - r.top - r.height / 2;
      if (Math.hypot(x, y) < Math.min(r.width, r.height) * 0.14) return;   // the core
      let a = Math.atan2(y, x) + Math.PI / 2 + SEG / 2;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      opts.onSelect(Math.floor(a / SEG) % N);
    };
    cv.addEventListener('click', onClick);
    cv.style.cursor = 'pointer';
    detach = () => cv.removeEventListener('click', onClick);
  }

  // cascade state machine: quiet -> escalate along CASCADE -> resolve
  let step = -1, tStep = 0, chain = [];
  const advance = now => {
    tStep = now;
    step += 1;
    if (step === 0) { chain = []; dom.forEach(d => { d.target = 0; }); }
    else if (step <= N) {
      const i = CASCADE[step - 1];
      chain.push(i);
      dom[i].target = step === 1 ? 3 : step <= 3 ? 2 : 1;
    } else if (step === N + 1) {
      dom.forEach(d => { d.target = 0; });            // autonomous response lands
    } else { step = -1; chain = []; }
  };

  return {
    draw({ ctx, w, h }, now) {
      if (step === -1) { step = 0; tStep = now; chain = []; }
      if (now - tStep > (step === 0 ? 3.2 : 1.9) / speed) advance(now);

      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * (compact ? 0.42 : 0.40);
      const rCore = R * 0.30;
      const sel = getSel();
      ctx.clearRect(0, 0, w, h);

      // ease confidence toward target so transitions read as analysis, not switching
      dom.forEach(d => { d.conf += (d.target - d.conf) * 0.045; });

      // ---- domain sectors -------------------------------------------------
      dom.forEach((d, i) => {
        const lvl = Math.max(0, Math.min(3, d.conf));
        const lo = CONF[Math.floor(lvl)][1], hi = CONF[Math.min(3, Math.ceil(lvl))][1];
        const tone = lvl % 1 < 0.5 ? lo : hi;
        const breathe = 0.86 + 0.14 * Math.sin(now * 0.7 * speed + d.volPh);
        const r1 = rCore + (R - rCore) * (0.62 + d.vol * 0.34) * breathe;
        const isSel = i === sel;
        const a0 = d.a0, a1 = d.a0 + SEG * 0.94;

        // body
        const g = ctx.createRadialGradient(cx, cy, rCore, cx, cy, r1);
        g.addColorStop(0, rgba(tone, 0.05 + lvl * 0.05));
        g.addColorStop(0.7, rgba(tone, 0.13 + lvl * 0.07));
        g.addColorStop(1, rgba(tone, 0));
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.arc(cx, cy, rCore, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();

        // rim
        ctx.strokeStyle = rgba(tone, isSel ? 0.95 : 0.4 + lvl * 0.15);
        ctx.lineWidth = isSel ? 2.2 : 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.stroke();

        // separators
        ctx.strokeStyle = rgba(C.base, 0.14);
        ctx.lineWidth = 1;
        [a0, a1].forEach(a => {
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * rCore, cy + Math.sin(a) * rCore);
          ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          ctx.stroke();
        });

        // ---- telemetry flowing inward ------------------------------------
        const rate = compact ? 0.10 : 0.16;
        if (rnd() < rate + lvl * 0.06) {
          d.parts.push({ a: a0 + SEG * (0.08 + rnd() * 0.78), t: 0, sp: 0.006 + rnd() * 0.008 });
        }
        if (d.parts.length > 40) d.parts.splice(0, d.parts.length - 40);
        for (let k = d.parts.length - 1; k >= 0; k--) {
          const pt = d.parts[k];
          pt.t += pt.sp * speed * 1.6;
          if (pt.t >= 1) {
            d.parts.splice(k, 1);
            continue;
          }
          const rr = r1 - (r1 - rCore) * pt.t;
          ctx.fillStyle = rgba(tone, 0.35 + 0.55 * Math.sin(pt.t * Math.PI));
          ctx.beginPath();
          ctx.arc(cx + Math.cos(pt.a) * rr, cy + Math.sin(pt.a) * rr, 1.4, 0, 7);
          ctx.fill();
        }

        // ---- label ---------------------------------------------------------
        const am = a0 + SEG * 0.47;
        const lx = cx + Math.cos(am) * (r1 + (compact ? 12 : 20));
        const ly = cy + Math.sin(am) * (r1 + (compact ? 12 : 20));
        ctx.font = (isSel ? '600 ' : '500 ') + (compact ? '8px' : '9.5px') + ' Inter, system-ui, sans-serif';
        const tw = ctx.measureText(d.name).width;
        const tx = lx - (Math.cos(am) < -0.3 ? tw : Math.cos(am) > 0.3 ? 0 : tw / 2);
        ctx.fillStyle = rgba(isSel ? C.action : tone, isSel ? 0.98 : 0.8);
        ctx.fillText(d.name, tx, ly + 3);
        if (!compact) {
          ctx.font = '500 8px Inter, system-ui, sans-serif';
          const hv = (99.9 - lvl * 1.7).toFixed(1) + '%';
          ctx.fillStyle = rgba(C.mute, 0.6);
          ctx.fillText(hv, tx, ly + 14);
        }
      });

      // ---- AI correlation between affected domains ------------------------
      if (chain.length > 1) {
        for (let k = 1; k < chain.length; k++) {
          const a = dom[chain[k - 1]], b = dom[chain[k]];
          const ra = rCore + (R - rCore) * 0.5, rb = ra;
          const aa = a.a0 + SEG * 0.47, ab = b.a0 + SEG * 0.47;
          const x0 = cx + Math.cos(aa) * ra, y0 = cy + Math.sin(aa) * ra;
          const x1 = cx + Math.cos(ab) * rb, y1 = cy + Math.sin(ab) * rb;
          ctx.strokeStyle = rgba(C.action, 0.5);
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 5]);
          ctx.lineDashOffset = -now * 26 * speed;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(cx, cy, x1, y1);      // correlation runs through the core
          ctx.stroke();
          ctx.setLineDash([]);
          const u = (now * 0.6 * speed + k * 0.2) % 1, iu = 1 - u;
          const px = iu * iu * x0 + 2 * iu * u * cx + u * u * x1;
          const py = iu * iu * y0 + 2 * iu * u * cy + u * u * y1;
          ctx.fillStyle = rgba(C.action, 0.9);
          ctx.beginPath(); ctx.arc(px, py, 2.1, 0, 7); ctx.fill();
        }
      }

      // ---- AI core ---------------------------------------------------------
      for (let k = 0; k < 3; k++) {
        const pr = ((now * 0.42 * speed) + k / 3) % 1;
        ctx.strokeStyle = rgba(C.deter, (1 - pr) * 0.3);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, rCore * (0.8 + pr * 0.9), 0, 7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(14,15,26,.92)';
      ctx.beginPath(); ctx.arc(cx, cy, rCore * 0.82, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(C.deter, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, rCore * 0.82, 0, 7); ctx.stroke();
      // an orbiting mote: the engine is still adapting
      const oa = now * 0.9 * speed;
      ctx.fillStyle = rgba(C.action, 0.9);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(oa) * rCore * 0.82, cy + Math.sin(oa) * rCore * 0.82, 2, 0, 7);
      ctx.fill();

      ctx.textAlign = 'center';
      if (compact) {
        ctx.font = '700 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = rgba(C.action, 0.95);
        ctx.fillText('ADCR', cx, cy + 3);
      } else {
        ctx.font = '700 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = rgba(C.action, 0.96);
        ctx.fillText('ADCR', cx, cy - 2);
        ctx.font = '600 7.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = rgba(C.deter, 0.85);
        ctx.fillText('AI CORE', cx, cy + 9);
      }
      ctx.textAlign = 'left';

      // ---- state caption ----------------------------------------------------
      if (!compact) {
        const worst = dom.reduce((a, d) => Math.max(a, d.conf), 0);
        // step wraps through -1, and one affected domain is not "1 DOMAINS"
        const phase = step <= 0 ? 'ALL DOMAINS NOMINAL'
          : step > N ? 'AUTONOMOUS RESPONSE · RESOLVING'
          : 'CORRELATING ACROSS ' + chain.length + (chain.length === 1 ? ' DOMAIN' : ' DOMAINS');
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = rgba(CONF[Math.min(3, Math.round(worst))][1], 0.92);
        ctx.fillText(phase, 16, 15);
        ctx.font = '500 8.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = rgba(C.mute, 0.6);
        const rate = (1.38 + (Math.sin(now * 0.5) + 1) * 0.03).toFixed(2) + 'M signals/sec';
        ctx.fillText(rate, w - 16 - ctx.measureText(rate).width, 15);
      }
    },
    stop() { if (detach) detach(); }
  };
}

/* ---------------------------------------------------------------- driver */
export function startAdcr(els, opts) {
  const m = (opts && opts.motion) || 8;
  const speed = Math.max(0.25, m / 8);
  const order = ['subgraph', 'origins', 'radar', 'impact'];
  // pane 01 is Threat Detection, so it gets the named-entity correlation graph
  // with detection emphasis rather than the old anonymous node mesh
  const builders = {
    subgraph: sp => buildRiskGraph(sp, { seed: 8817, detections: 4, focus: 'detection' }),
    origins: buildOrigins,
    radar: buildTelemetryRadar,
    impact: buildImpact
  };

  const loops = {};
  order.forEach(k => {
    if (els && els[k]) loops[k] = makeLoop(els[k], () => builders[k](speed,
      Object.assign({ cv: els[k] }, (opts && opts.panelOpts && opts.panelOpts[k]) || {})));
  });

  let view = 0, visible = true, stopped = false;
  const sync = () => {
    if (stopped) return;
    order.forEach((k, i) => {
      const l = loops[k];
      if (!l) return;
      if (i === view && visible) l.resume(); else l.pause();
    });
  };

  // an off-screen console should cost nothing
  let io = null;
  if (els && els.root && window.IntersectionObserver) {
    io = new IntersectionObserver(e => {
      visible = e.some(x => x.isIntersecting);
      sync();
    }, { rootMargin: '120px' });
    io.observe(els.root);
  }
  // every pane gets one frame up front, so switching tabs never reveals a blank box
  order.forEach(k => { if (loops[k]) loops[k].prime(); });
  sync();

  return {
    setView(i) { view = Math.max(0, Math.min(order.length - 1, i | 0)); sync(); },
    stop() {
      stopped = true;
      if (io) io.disconnect();
      Object.keys(loops).forEach(k => loops[k].stop());
    }
  };
}

// Several always-on panels in one shell (the unified console). Same loop and
// visibility gating as startAdcr, minus the view switching.
export function startPanels(specs, opts) {
  const m = (opts && opts.motion) || 8;
  const speed = Math.max(0.25, m / 8);
  const builders = { origins: buildOrigins, radar: buildTelemetryRadar, impact: buildImpact,
                     worldmap: buildWorldMap, riskgraph: buildRiskGraph,
                     telemetry: buildTelemetryRadar };
  const loops = [];
  (specs && specs.panels || []).forEach(sp => {
    if (!sp || !sp.cv || !builders[sp.build]) return;
    loops.push(makeLoop(sp.cv, () => builders[sp.build](speed,
      Object.assign({ cv: sp.cv }, sp.opts || {}))));
  });

  let visible = true, stopped = false;
  const sync = () => { if (!stopped) loops.forEach(l => visible ? l.resume() : l.pause()); };

  let io = null;
  if (specs && specs.root && window.IntersectionObserver) {
    io = new IntersectionObserver(e => { visible = e.some(x => x.isIntersecting); sync(); },
                                  { rootMargin: '140px' });
    io.observe(specs.root);
  }
  loops.forEach(l => l.prime());
  sync();

  return { stop() { stopped = true; if (io) io.disconnect(); loops.forEach(l => l.stop()); } };
}
