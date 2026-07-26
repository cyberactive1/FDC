// Canvas visuals for the Freedom Data Center page.
// startHero  — an autonomous-AI decision mesh: a rotating neural lattice whose
//              signals converge on a core that fires containment pulses back out.
// startGlobe — the live threat globe.

const CITIES = [
  ['Moscow, RU', 55.75, 37.6], ['Shenzhen, CN', 22.5, 114.1], ['Tehran, IR', 35.7, 51.4],
  ['Pyongyang, KP', 39, 125.8], ['Lagos, NG', 6.5, 3.4], ['São Paulo, BR', -23.5, -46.6],
  ['Kyiv, UA', 50.4, 30.5], ['Mumbai, IN', 19.1, 72.9], ['Amsterdam, NL', 52.4, 4.9],
  ['Hong Kong, HK', 22.3, 114.2], ['Istanbul, TR', 41, 29], ['Bogotá, CO', 4.7, -74.1],
  ['Singapore, SG', 1.35, 103.8], ['Seoul, KR', 37.6, 127], ['Bucharest, RO', 44.4, 26.1]
];

function fit(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
const v3 = (lat, lon) => {
  const f = lat * Math.PI / 180, l = lon * Math.PI / 180;
  return [Math.cos(f) * Math.sin(l), Math.sin(f), Math.cos(f) * Math.cos(l)];
};

// Semantic state palette — cool blurple base, warm hues reserved for danger states only.
const C = {
  base:    '145,132,217',
  node:    '181,171,252',
  tele:    '150,196,240',   // telemetry — cool blue
  deter:   '126,214,233',   // perimeter deterrence — cyan
  threat:  '240,132,160',   // active compromise — rose
  risk:    '236,178,120',   // predicted blast radius — amber
  contain: '150,206,236',   // severed / isolated — ice
  heal:    '134,222,190',   // rehydrating — mint
  action:  '245,244,255',   // autonomous action — white
  dim:     '121,108,191'
};

export function startHero(cv, m, onPhase) {
  if (!cv || m <= 0) return () => {};
  let g = fit(cv), raf = 0;
  const speed = (m / 8) || 0.4;

  let seed = 20260725;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const TYPES = {
    identity: { label: 'IDENTITY', glyph: 'ring',    tone: '213,206,253' },
    fabric:   { label: 'FABRIC',   glyph: 'ring',    tone: '181,171,252' },
    storage:  { label: 'STORAGE',  glyph: 'ring',    tone: '150,196,240' },
    firewall: { label: 'FIREWALL', glyph: 'shield',  tone: '126,214,233' },
    switch:   { label: 'SWITCH',   glyph: 'diamond', tone: '181,171,252' },
    array:    { label: 'STORAGE',  glyph: 'stack',   tone: '150,196,240' },
    directory:{ label: 'DIRECTORY',glyph: 'diamond', tone: '213,206,253' },
    server:   { label: 'SERVER',   glyph: 'square',  tone: '145,132,217' },
    gpu:      { label: 'GPU',      glyph: 'square',  tone: '181,171,252' }
  };

  const nodes = [];
  const push = (tier, type, r, a) => {
    nodes.push({ tier, type, r, a, wob: rnd() * 6.283,
                 risk: 0, hot: 0, cut: 0, restored: 0, shield: 0, seenAt: -1, block: 0 });
    return nodes.length - 1;
  };
  const core = ['identity', 'fabric', 'storage'].map((t, i) => push('core', t, 0.13 + rnd() * 0.04, (i / 3) * 6.283 + 0.4));
  const midTypes = ['firewall','switch','array','directory','firewall','switch','array','firewall'];
  const mid = midTypes.map((t, i) => push('mid', t, 0.43 + rnd() * 0.13, (i / midTypes.length) * 6.283 + rnd() * 0.18));
  const leaf = [];
  for (let i = 0; i < 20; i++) leaf.push(push('leaf', rnd() > 0.45 ? 'gpu' : 'server', 0.80 + rnd() * 0.20, (i / 20) * 6.283 + rnd() * 0.12));
  const firewalls = mid.filter(i => nodes[i].type === 'firewall');

  const edges = [];
  const link = (a, b, kind) => edges.push({ a, b, kind: kind || 'dep', lit: 0, cut: 0 });
  const nearest = (from, pool, skip) => {
    let best = pool[0], bd = 1e9;
    for (const j of pool) { if (j === skip) continue;
      let d = Math.abs(nodes[from].a - nodes[j].a); d = Math.min(d, 6.283 - d);
      if (d < bd) { bd = d; best = j; } }
    return best;
  };
  for (const l of leaf) { const p = nearest(l, mid); link(l, p); if (rnd() > 0.82) link(l, nearest(l, mid, p)); }
  for (const mi of mid) { link(mi, nearest(mi, core)); }
  for (let i = 0; i < 3; i++) link(core[i], core[(i + 1) % 3], 'core');
  for (let i = 0; i < 3; i++) { const a = leaf[Math.floor(rnd() * leaf.length)], b = leaf[Math.floor(rnd() * leaf.length)]; if (a !== b) link(a, b, 'peer'); }

  const adj = nodes.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push([e.b, i]); adj[e.b].push([e.a, i]); });

  const patientZero = leaf[6];
  const bfs = [];
  {
    const seen = new Set([patientZero]);
    let frontier = [patientZero];
    for (let d = 1; d <= 2; d++) {
      const next = [];
      for (const n of frontier) for (const [nb, ei] of adj[n]) {
        if (seen.has(nb)) continue;
        seen.add(nb); next.push(nb); bfs.push([nb, ei, d]);
      }
      frontier = next;
    }
  }
  const inBlast = new Set(bfs.map(b => b[0]));
  const cutEdges = new Set();
  for (const [, ei] of bfs) cutEdges.add(ei);
  for (const [, ei] of adj[patientZero]) cutEdges.add(ei);
  const spares = leaf.filter(l => l !== patientZero && !inBlast.has(l)).slice(0, 6);

  const PHASES = [
    { key: 'baseline',  ms: 3400, label: 'Continuous telemetry · servers, storage, identity, fabric' },
    { key: 'probe',     ms: 2100, label: 'Inbound probes · perimeter traffic under continuous watch' },
    { key: 'intrusion', ms: 1700, label: 'Behavioral anomaly · GPU node · no known signature' },
    { key: 'traverse',  ms: 3000, label: 'Graph traversal · predicting blast radius across the estate' },
    { key: 'contain',   ms: 2300, label: 'Autonomous containment · identity revoked, paths severed' },
    { key: 'respond',   ms: 2300, label: 'Autonomous response · 38 actions executed, 0 escalations' },
    { key: 'heal',      ms: 2800, label: 'Self-healing · workloads rehydrating on clean capacity' },
    { key: 'clear',     ms: 2000, label: 'Cleared · 0 s customer downtime' },
    { key: 'learn',     ms: 2200, label: 'Learning · the pattern is now caught earlier next time' },
    { key: 'optimize',  ms: 2400, label: 'Optimizing · power, cooling and capacity rebalanced' }
  ];
  let phase = 0, phaseT = 0;
  if (onPhase) onPhase(PHASES[0].label, 0);

  const pulses = [], actions = [], migrations = [], intruders = [], waves = [];
  const spawnPulse = () => {
    const ei = Math.floor(rnd() * edges.length);
    if (edges[ei].cut > 0.4) return;
    pulses.push({ e: ei, t: 0, sp: 0.006 + rnd() * 0.01, dir: rnd() > 0.5 ? 1 : -1 });
  };
  const spawnIntruder = () => {
    const fw = firewalls[Math.floor(rnd() * firewalls.length)];
    intruders.push({ to: fw, a: rnd() * 6.283, t: 0, sp: 0.012 + rnd() * 0.012 });
  };

  let t0 = performance.now(), spin = 0;

  const draw = () => {
    const now = performance.now();
    const dt = Math.min(64, now - t0); t0 = now;
    const { ctx, w, h } = g;
    const cx = w * 0.68, cy = h * 0.5;
    const R = Math.min(w * 0.36, h * 0.52);
    ctx.clearRect(0, 0, w, h);

    phaseT += dt * speed;
    if (phaseT > PHASES[phase].ms) {
      phaseT = 0;
      phase = (phase + 1) % PHASES.length;
      if (onPhase) onPhase(PHASES[phase].label, phase);
      const nk = PHASES[phase].key;
      if (nk === 'baseline') {
        for (const n of nodes) { n.risk = 0; n.hot = 0; n.cut = 0; n.restored = 0; n.shield = 0; n.seenAt = -1; n.block = 0; }
        for (const e of edges) { e.lit = 0; e.cut = 0; }
        migrations.length = 0; actions.length = 0; intruders.length = 0; waves.length = 0;
      }
      if (nk === 'probe') for (let i = 0; i < 4; i++) spawnIntruder();
      if (nk === 'traverse') waves.push({ t: 0 });
      if (nk === 'contain') waves.push({ t: 0, ring: true });
      if (nk === 'respond') {
        for (let i = 0; i < 14; i++) actions.push({ from: core[Math.floor(rnd() * 3)], to: Math.floor(rnd() * nodes.length), t: 0, sp: 0.016 + rnd() * 0.014 });
        for (const f of firewalls) nodes[f].shield = 1;
      }
      if (nk === 'heal') for (const sp of spares.slice(0, 3)) migrations.push({ from: patientZero, to: sp, t: 0, sp: 0.008 + rnd() * 0.006 });
      // learning: telemetry floods back across a healthy estate
      if (nk === 'learn') for (let i = 0; i < 14; i++) spawnPulse();
      // optimizing: capacity rebalances onto the remaining spare nodes
      if (nk === 'optimize') for (const sp of spares.slice(3, 6)) {
        migrations.push({ from: mid[Math.floor(rnd() * mid.length)], to: sp, t: 0, sp: 0.007 + rnd() * 0.005 });
      }
    }
    const k = PHASES[phase].key;
    const pt = phaseT / PHASES[phase].ms;
    spin += 0.000045 * dt * speed;

    const pos = nodes.map(n => {
      const a = n.a + spin * (n.tier === 'core' ? 0.4 : n.tier === 'mid' ? 0.8 : 1) + Math.sin(now / 2600 + n.wob) * 0.012;
      const rr = n.r * (1 + Math.sin(now / 3100 + n.wob) * 0.018);
      return [cx + Math.cos(a) * rr * R, cy + Math.sin(a) * rr * R * 0.82];
    });

    if (k === 'probe') {
      if (rnd() > 0.93 && intruders.length < 6) spawnIntruder();
      for (const f of firewalls) nodes[f].shield = Math.min(1, nodes[f].shield + dt / 900);
    } else if (k === 'intrusion') {
      nodes[patientZero].hot = Math.min(1, nodes[patientZero].hot + dt / 500);
    } else if (k === 'traverse') {
      nodes[patientZero].hot = 1;
      const reveal = Math.floor(pt * bfs.length * 1.15);
      for (let i = 0; i < Math.min(reveal, bfs.length); i++) {
        const [n, ei, d] = bfs[i];
        if (nodes[n].seenAt < 0) nodes[n].seenAt = now;
        nodes[n].risk = Math.min(1, nodes[n].risk + dt / 420) * (d === 1 ? 1 : 0.72);
        edges[ei].lit = Math.min(1, edges[ei].lit + dt / 380);
      }
    } else if (k === 'contain') {
      nodes[patientZero].hot = Math.max(0.35, nodes[patientZero].hot - dt / 3000);
      for (const ei of cutEdges) edges[ei].cut = Math.min(1, edges[ei].cut + dt / 700);
      for (const n of inBlast) nodes[n].cut = Math.min(1, nodes[n].cut + dt / 800);
      nodes[core[0]].shield = Math.min(1, nodes[core[0]].shield + dt / 700);
    } else if (k === 'respond') {
      nodes[patientZero].hot = Math.max(0.25, nodes[patientZero].hot - dt / 4000);
      for (const ac of actions) {
        ac.t = Math.min(1, ac.t + ac.sp * speed * (dt / 16));
        if (ac.t > 0.98) nodes[ac.to].restored = Math.min(0.7, nodes[ac.to].restored + dt / 1400);
      }
    } else if (k === 'heal') {
      for (const mg of migrations) mg.t = Math.min(1, mg.t + mg.sp * speed * (dt / 16));
      for (const n of inBlast) nodes[n].restored = Math.min(1, nodes[n].restored + dt / 1600);
      nodes[patientZero].restored = Math.min(1, nodes[patientZero].restored + dt / 2200);
    } else if (k === 'clear') {
      for (const n of nodes) { n.hot *= 0.985; n.risk *= 0.985; n.cut *= 0.985; n.shield *= 0.97; }
      for (const e of edges) { e.cut *= 0.97; e.lit *= 0.98; }
    }
    if (rnd() > (k === 'baseline' ? 0.62 : 0.84) && pulses.length < 30) spawnPulse();

    // ---- propagation / containment waves from patient zero ----
    for (let i = waves.length - 1; i >= 0; i--) {
      const wv = waves[i];
      wv.t += dt / (wv.ring ? 1400 : 2000);
      if (wv.t >= 1) { waves.splice(i, 1); continue; }
      const p = pos[patientZero];
      const rad = wv.t * R * (wv.ring ? 1.05 : 1.35);
      ctx.strokeStyle = 'rgba(' + (wv.ring ? C.contain : C.risk) + ',' + ((1 - wv.t) * 0.4).toFixed(3) + ')';
      ctx.lineWidth = wv.ring ? 1.6 : 1.1;
      if (wv.ring) ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.ellipse(p[0], p[1], rad, rad * 0.82, 0, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- edges ----
    for (const e of edges) {
      const a = pos[e.a], b = pos[e.b];
      const base = e.kind === 'core' ? 0.32 : e.kind === 'peer' ? 0.08 : 0.14;
      if (e.cut > 0.35) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const gap = 0.18 + e.cut * 0.16;
        const lp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const a2 = lp(a, b, 0.5 - gap), b2 = lp(a, b, 0.5 + gap);
        ctx.strokeStyle = 'rgba(' + C.dim + ',' + (0.3 * (1 - e.cut * 0.4)).toFixed(3) + ')';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a2[0], a2[1]); ctx.moveTo(b2[0], b2[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        ctx.strokeStyle = 'rgba(' + C.contain + ',' + (e.cut * 0.85).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(ang + 1.2) * 4.5, my + Math.sin(ang + 1.2) * 4.5);
        ctx.lineTo(mx - Math.cos(ang + 1.2) * 4.5, my - Math.sin(ang + 1.2) * 4.5);
        ctx.moveTo(mx + Math.cos(ang - 1.2) * 4.5, my + Math.sin(ang - 1.2) * 4.5);
        ctx.lineTo(mx - Math.cos(ang - 1.2) * 4.5, my - Math.sin(ang - 1.2) * 4.5);
        ctx.stroke();
      } else if (e.lit > 0.02) {
        // risk-propagation path: amber gradient toward the at-risk end
        const grd = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        grd.addColorStop(0, 'rgba(' + C.risk + ',' + (0.2 + e.lit * 0.5).toFixed(3) + ')');
        grd.addColorStop(1, 'rgba(' + C.threat + ',' + (0.2 + e.lit * 0.7).toFixed(3) + ')');
        ctx.strokeStyle = grd; ctx.lineWidth = 0.9 + e.lit * 1.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(' + C.base + ',' + base.toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }

    // ---- telemetry ----
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += p.sp * speed * (dt / 16);
      const e = edges[p.e];
      if (p.t >= 1 || e.cut > 0.35) { pulses.splice(i, 1); continue; }
      const a = pos[p.dir === 1 ? e.a : e.b], b = pos[p.dir === 1 ? e.b : e.a];
      const fade = Math.sin(Math.PI * p.t);
      ctx.fillStyle = 'rgba(' + C.tele + ',' + (0.22 + fade * 0.6).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * p.t, a[1] + (b[1] - a[1]) * p.t, 1.4, 0, 7); ctx.fill();
    }

    // ---- hostile probes deterred ----
    for (let i = intruders.length - 1; i >= 0; i--) {
      const it = intruders[i];
      it.t += it.sp * speed * (dt / 16);
      const tp = pos[it.to];
      const startR = R * 1.5;
      const sx = tp[0] + Math.cos(it.a) * startR, sy = tp[1] + Math.sin(it.a) * startR * 0.82;
      if (it.t >= 1) { nodes[it.to].block = 1; intruders.splice(i, 1); continue; }
      const x = sx + (tp[0] - sx) * it.t, y = sy + (tp[1] - sy) * it.t;
      const tx = sx + (tp[0] - sx) * Math.max(0, it.t - 0.14), ty = sy + (tp[1] - sy) * Math.max(0, it.t - 0.14);
      ctx.strokeStyle = 'rgba(' + C.threat + ',' + (0.2 + it.t * 0.6).toFixed(3) + ')';
      ctx.lineWidth = 1.3; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(' + C.threat + ',.95)';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
    }

    // ---- autonomous response ----
    for (const ac of actions) {
      if (ac.t <= 0 || ac.t >= 1) continue;
      const a = pos[ac.from], b = pos[ac.to];
      const x = a[0] + (b[0] - a[0]) * ac.t, y = a[1] + (b[1] - a[1]) * ac.t;
      const fade = Math.sin(Math.PI * ac.t);
      const tx = a[0] + (b[0] - a[0]) * Math.max(0, ac.t - 0.13), ty = a[1] + (b[1] - a[1]) * Math.max(0, ac.t - 0.13);
      const grd = ctx.createLinearGradient(tx, ty, x, y);
      grd.addColorStop(0, 'rgba(' + C.deter + ',0)');
      grd.addColorStop(1, 'rgba(' + C.action + ',' + (fade * 0.75).toFixed(3) + ')');
      ctx.strokeStyle = grd; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = 'rgba(' + C.action + ',' + (0.4 + fade * 0.6).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
    }

    // ---- migrations ----
    for (const mg of migrations) {
      if (mg.t <= 0 || mg.t >= 1) continue;
      const a = pos[mg.from], b = pos[mg.to];
      const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.18, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.18;
      const t = mg.t, itv = 1 - t;
      const x = itv * itv * a[0] + 2 * itv * t * mx + t * t * b[0];
      const y = itv * itv * a[1] + 2 * itv * t * my + t * t * b[1];
      ctx.strokeStyle = 'rgba(' + C.heal + ',.26)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke();
      ctx.fillStyle = 'rgba(' + C.heal + ',1)'; ctx.beginPath(); ctx.arc(x, y, 2.7, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(' + C.heal + ',.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.stroke();
    }

    // ---- nodes ----
    const glyph = (shape, x, y, s) => {
      ctx.beginPath();
      if (shape === 'square') ctx.rect(x - s, y - s, s * 2, s * 2);
      else if (shape === 'diamond') { ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x + s * 1.3, y); ctx.lineTo(x, y + s * 1.3); ctx.lineTo(x - s * 1.3, y); ctx.closePath(); }
      else if (shape === 'shield') { ctx.moveTo(x, y - s * 1.4); ctx.lineTo(x + s * 1.15, y - s * 0.6); ctx.lineTo(x + s * 0.85, y + s * 1.15); ctx.lineTo(x, y + s * 1.5); ctx.lineTo(x - s * 0.85, y + s * 1.15); ctx.lineTo(x - s * 1.15, y - s * 0.6); ctx.closePath(); }
      else if (shape === 'stack') { ctx.rect(x - s * 1.25, y - s * 1.1, s * 2.5, s * 0.7); ctx.rect(x - s * 1.25, y - s * 0.15, s * 2.5, s * 0.7); ctx.rect(x - s * 1.25, y + s * 0.8, s * 2.5, s * 0.7); }
      else ctx.arc(x, y, s, 0, 7);
      ctx.fill();
    };

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], p = pos[i], T = TYPES[n.type];
      const isCore = n.tier === 'core', isMid = n.tier === 'mid';
      const breathe = 0.72 + 0.28 * Math.sin(now / 900 + n.wob);
      let s = isCore ? 5.2 : isMid ? 3.4 : 2.1;
      let tone = T.tone, alpha = isCore ? 0.95 : isMid ? 0.7 : 0.38 + breathe * 0.2;

      if (n.risk > 0.02) { tone = C.risk; alpha = 0.55 + n.risk * 0.45; s += n.risk * 1.6; }
      if (n.cut > 0.3) { tone = C.contain; alpha = 0.4 + (1 - n.cut) * 0.25; }
      if (n.restored > 0.05) { tone = C.heal; alpha = 0.5 + n.restored * 0.5; }
      if (i === patientZero && n.hot > 0.02) { tone = C.threat; alpha = 0.6 + n.hot * 0.4; s += n.hot * 2.4; }

      if (isCore) {
        const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 36);
        gl.addColorStop(0, 'rgba(' + T.tone + ',0.26)'); gl.addColorStop(1, 'rgba(' + T.tone + ',0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p[0], p[1], 36, 0, 7); ctx.fill();
      }
      if (n.type === 'firewall' && n.shield > 0.02) {
        ctx.strokeStyle = 'rgba(' + C.deter + ',' + (n.shield * 0.6).toFixed(3) + ')';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(p[0], p[1], s + 7, -1.9, 1.9); ctx.stroke();
        ctx.strokeStyle = 'rgba(' + C.deter + ',' + (n.shield * 0.22).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], s + 11, -1.7, 1.7); ctx.stroke();
      }
      if (n.block > 0.02) {
        n.block *= 0.93;
        ctx.strokeStyle = 'rgba(' + C.deter + ',' + (n.block * 0.9).toFixed(3) + ')'; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.arc(p[0], p[1], s + 3 + (1 - n.block) * 17, 0, 7); ctx.stroke();
      }
      // glow behind hot / healing states
      if (n.hot > 0.2 || n.restored > 0.3 || n.risk > 0.4) {
        const hue = i === patientZero && n.hot > 0.2 ? C.threat : n.restored > 0.3 ? C.heal : C.risk;
        const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 20);
        gl.addColorStop(0, 'rgba(' + hue + ',0.3)'); gl.addColorStop(1, 'rgba(' + hue + ',0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p[0], p[1], 20, 0, 7); ctx.fill();
      }

      ctx.fillStyle = 'rgba(' + tone + ',' + Math.min(1, alpha).toFixed(3) + ')';
      glyph(T.glyph, p[0], p[1], s);

      if (n.seenAt > 0 && now - n.seenAt < 900) {
        const rp = (now - n.seenAt) / 900;
        ctx.strokeStyle = 'rgba(' + C.risk + ',' + ((1 - rp) * 0.8).toFixed(3) + ')'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p[0], p[1], s + rp * 21, 0, 7); ctx.stroke();
      }
      if (i === patientZero && n.hot > 0.15) {
        const rp = (now % 1200) / 1200;
        ctx.strokeStyle = 'rgba(' + C.threat + ',' + ((1 - rp) * 0.8 * n.hot).toFixed(3) + ')'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], s + 3 + rp * 32, 0, 7); ctx.stroke();
        if (n.cut > 0.4) {
          ctx.strokeStyle = 'rgba(' + C.contain + ',' + (n.cut * 0.7).toFixed(3) + ')';
          ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p[0], p[1], 22, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      if (isCore || (isMid && n.type === 'firewall')) {
        ctx.font = '500 8.5px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(' + (isCore ? T.tone : C.deter) + ',' + (isCore ? 0.6 : 0.4) + ')';
        ctx.fillText(T.label, p[0] + s + 6, p[1] + 3);
      }
    }

    raf = requestAnimationFrame(draw);
  };

  const ro = new ResizeObserver(() => { g = fit(cv); });
  ro.observe(cv);
  draw();
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

export function startGlobe(cv, m) {
  if (!cv) return () => {};
  let g = fit(cv), raf = 0;
  const ro = new ResizeObserver(() => { g = fit(cv); }); ro.observe(cv);
  const speed = (m / 8) || 0.3;
  const target = v3(26.13, -80.24);

  // Hostile source clusters — severity drives bloom size and color.
  const SOURCES = [
    { name: 'Eastern Europe · ASN 208091', lat: 52.0, lon: 30.5, sev: 1.0, kind: 'attack' },
    { name: 'West Africa · phishing infra', lat: 7.0, lon: 3.5, sev: 0.44, kind: 'low' },
    { name: 'Middle East · credential mills', lat: 33.0, lon: 45.0, sev: 0.52, kind: 'scan' },
    { name: 'Western Europe · proxy relays', lat: 50.5, lon: 4.4, sev: 0.62, kind: 'scan' },
    { name: 'South America · bulletproof', lat: -21.0, lon: -47.0, sev: 0.58, kind: 'scan' },
    { name: 'Caribbean · burst infra', lat: 18.4, lon: -66.1, sev: 0.4, kind: 'low' },
    { name: 'US West · compromised cloud', lat: 37.4, lon: -122.1, sev: 0.72, kind: 'attack' },
    { name: 'US Northeast · residential bots', lat: 40.7, lon: -74.0, sev: 0.66, kind: 'attack' },
    { name: 'Canada · hosting abuse', lat: 45.5, lon: -73.6, sev: 0.36, kind: 'low' },
    { name: 'Mexico · scanning cluster', lat: 19.4, lon: -99.1, sev: 0.48, kind: 'scan' }
  ];
  const TONE = {
    attack: { line: '245,244,255', bloom: '181,171,252' },
    scan:   { line: '181,171,252', bloom: '145,132,217' },
    low:    { line: '121,108,191', bloom: '93,82,148' }
  };

  const arcs = [];
  const spawn = () => {
    const src = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    arcs.push({ a: v3(src.lat + (Math.random() - .5) * 9, src.lon + (Math.random() - .5) * 14), t: 0, sp: 0.0055 + Math.random() * 0.009, kind: src.kind });
    if (arcs.length > 20) arcs.shift();
  };
  for (let i = 0; i < 11; i++) spawn();
  const timer = setInterval(spawn, 520);

  // face the Atlantic: midpoint between the American and European source masses
  const CENTER_ROT = 1.25;
  let rot = CENTER_ROT;
  const slerp = (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; d = Math.max(-1, Math.min(1, d));
    const o = Math.acos(d), so = Math.sin(o) || 1e-6;
    const s1 = Math.sin((1 - t) * o) / so, s2 = Math.sin(t * o) / so, alt = 1 + 0.34 * Math.sin(Math.PI * t);
    return [(a[0] * s1 + b[0] * s2) * alt, (a[1] * s1 + b[1] * s2) * alt, (a[2] * s1 + b[2] * s2) * alt];
  };

  const draw = () => {
    const { ctx, w, h } = g, cx = w / 2, cy = h / 2, R = Math.min(w * 0.43, h * 0.44);
    const now = performance.now() / 1000;
    ctx.clearRect(0, 0, w, h);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const proj = v => { const x = v[0] * cr + v[2] * sr, z = -v[0] * sr + v[2] * cr; return [cx + R * x, cy - R * v[1], z]; };

    // Atmosphere
    const halo = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.55);
    halo.addColorStop(0, 'rgba(145,132,217,0.22)');
    halo.addColorStop(0.45, 'rgba(145,132,217,0.07)');
    halo.addColorStop(1, 'rgba(145,132,217,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.55, 0, 7); ctx.fill();

    // Sphere body — lit from upper-left
    const body = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
    body.addColorStop(0, 'rgba(43,39,65,0.95)');
    body.addColorStop(0.6, 'rgba(28,30,46,0.92)');
    body.addColorStop(1, 'rgba(20,21,34,0.96)');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

    // Graticule
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    ctx.strokeStyle = 'rgba(147,151,171,0.13)'; ctx.lineWidth = 0.8;
    const line = pts => {
      ctx.beginPath(); let on = false;
      for (const v of pts) { const p = proj(v); if (p[2] > 0) { if (on) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); on = true; } } else on = false; }
      ctx.stroke();
    };
    for (let lat = -60; lat <= 60; lat += 20) { const pts = []; for (let lon = -180; lon <= 180; lon += 4) pts.push(v3(lat, lon)); line(pts); }
    for (let lon = 0; lon < 360; lon += 20) { const pts = []; for (let lat = -90; lat <= 90; lat += 4) pts.push(v3(lat, lon)); line(pts); }

    // Heat blooms
    ctx.globalCompositeOperation = 'lighter';
    for (const s of SOURCES) {
      const p = proj(v3(s.lat, s.lon));
      if (p[2] <= 0.02) continue;
      const tone = TONE[s.kind];
      const breathe = 0.78 + 0.22 * Math.sin(now * (0.7 + s.sev) + s.lat);
      const rad = R * (0.16 + s.sev * 0.3) * p[2] * breathe;
      const bl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
      bl.addColorStop(0, 'rgba(' + tone.bloom + ',' + (0.42 * s.sev * p[2]).toFixed(3) + ')');
      bl.addColorStop(0.45, 'rgba(' + tone.bloom + ',' + (0.14 * s.sev * p[2]).toFixed(3) + ')');
      bl.addColorStop(1, 'rgba(' + tone.bloom + ',0)');
      ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Source cores + expanding rings
    for (const s of SOURCES) {
      const p = proj(v3(s.lat, s.lon));
      if (p[2] <= 0.02) continue;
      const tone = TONE[s.kind];
      ctx.fillStyle = 'rgba(' + tone.line + ',' + (0.5 + s.sev * 0.45).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 + s.sev * 1.4, 0, 7); ctx.fill();
      const ring = ((now * (0.35 + s.sev * 0.3)) % 1);
      ctx.strokeStyle = 'rgba(' + tone.line + ',' + ((1 - ring) * 0.3 * s.sev * p[2]).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 3 + ring * R * 0.16, 0, 7); ctx.stroke();
    }
    ctx.restore();

    // Attack arcs
    for (const arc of arcs) {
      arc.t = Math.min(1, arc.t + arc.sp * speed);
      const tone = TONE[arc.kind];
      const done = arc.t >= 1;
      ctx.setLineDash(arc.kind === 'attack' ? [] : [3, 4]);
      ctx.beginPath(); let on = false;
      for (let i = 0; i <= 64; i++) {
        const p = proj(slerp(arc.a, target, (i / 64) * arc.t));
        if (p[2] > -0.28) { if (on) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); on = true; } } else on = false;
      }
      ctx.strokeStyle = 'rgba(' + tone.line + ',' + (done ? 0.16 : (arc.kind === 'attack' ? 0.8 : 0.5)) + ')';
      ctx.lineWidth = arc.kind === 'attack' ? 1.5 : 1;
      ctx.stroke();
      ctx.setLineDash([]);
      if (!done) {
        const p = proj(slerp(arc.a, target, arc.t));
        if (p[2] > -0.28) {
          ctx.fillStyle = 'rgba(' + tone.line + ',0.95)';
          ctx.beginPath(); ctx.arc(p[0], p[1], arc.kind === 'attack' ? 2.6 : 1.9, 0, 7); ctx.fill();
        }
      }
    }

    // Sunrise facility marker
    const tp = proj(target);
    if (tp[2] > -0.05) {
      const pulse = (now % 1.8) / 1.8;
      ctx.strokeStyle = 'rgba(213,206,253,' + ((1 - pulse) * 0.6).toFixed(3) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(tp[0], tp[1], 5 + pulse * 26, 0, 7); ctx.stroke();
      ctx.save();
      ctx.translate(tp[0], tp[1]); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f5f4ff'; ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
      ctx.strokeStyle = 'rgba(213,206,253,.9)'; ctx.lineWidth = 1.4; ctx.strokeRect(-6.4, -6.4, 12.8, 12.8);
      ctx.restore();
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#f5f4ff'; ctx.fillText('SUNRISE, FL', tp[0] + 14, tp[1] - 3);
      ctx.font = '500 9px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(213,206,253,' + (0.55 + 0.45 * Math.sin(now * 3)).toFixed(2) + ')';
      ctx.fillText('UNDER ATTACK · CONTAINING', tp[0] + 14, tp[1] + 9);
    }

    // Limb highlight
    ctx.strokeStyle = 'rgba(181,171,252,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

    // oscillate around an Atlantic-facing pose: Sunrise stays visible the whole loop
    rot = CENTER_ROT + Math.sin(now * 0.055 * speed) * 0.5;
    raf = requestAnimationFrame(draw);
  };
  draw();
  return () => { cancelAnimationFrame(raf); clearInterval(timer); ro.disconnect(); };
}

export { CITIES };

// ---------------- LIVE ADCR CONSOLE ----------------
// Two canvases (world heat map + dependency graph). Everything else is DOM.
export function startConsole(els, m) {
  const speed = (m / 8) || 0.5;
  const stops = [];

  // ---- 1. world heat map with live attack arcs ----
  if (els.map) {
    const cv = els.map;
    let g = fit(cv), raf = 0;
    const ro = new ResizeObserver(() => { g = fit(cv); }); ro.observe(cv);

    // coarse equirectangular landmass blocks — enough to read as a world map
    const LAND = [
      [4,16,13,10],[10,26,7,7],[15,20,6,5],[20,14,10,7],[22,21,7,12],[26,33,6,10],
      [44,14,10,8],[46,22,10,12],[50,34,7,9],[54,16,12,8],[57,24,8,8],
      [62,14,16,10],[66,24,10,8],[74,26,6,6],[78,30,5,5],[80,36,7,7],[84,40,4,4],
      [30,45,6,6],[33,52,7,12],[36,64,4,6]
    ];
    const SRC = [
      { x: 21, y: 20, sev: 1.0, kind: 'attack' },   // N America
      { x: 48, y: 20, sev: 0.9, kind: 'attack' },   // E Europe
      { x: 68, y: 24, sev: 0.8, kind: 'attack' },   // E Asia
      { x: 46, y: 34, sev: 0.5, kind: 'scan'   },   // Africa
      { x: 34, y: 55, sev: 0.55, kind: 'scan'  },   // S America
      { x: 56, y: 26, sev: 0.6, kind: 'scan'   },   // Mid East
      { x: 78, y: 32, sev: 0.4, kind: 'low'    }    // SE Asia
    ];
    const TGT = { x: 24.5, y: 26 };                 // Sunrise, FL
    const TONE = { attack: '240,132,160', scan: '181,171,252', low: '121,108,191' };

    const arcs = [];
    const spawn = () => {
      const s = SRC[Math.floor(Math.random() * SRC.length)];
      arcs.push({ s, t: 0, sp: 0.008 + Math.random() * 0.010 });
      if (arcs.length > 18) arcs.shift();
    };
    for (let i = 0; i < 9; i++) spawn();
    const timer = setInterval(spawn, 620); stops.push(() => clearInterval(timer));

    const draw = () => {
      // a canvas measured mid-layout reports 0x0; refit until it has a box so the
      // globe cannot end up drawn into a zero-size backing store
      if (!g.w || !g.h) g = fit(cv);
// a canvas measured mid-layout reports 0x0; re-fit until it has a box,
      // otherwise the backing store stays 0 and the panel renders blank forever
      if (!g.w || !g.h) g = fit(cv);
      const { ctx, w, h } = g, now = performance.now() / 1000;
      const X = p => p / 100 * w, Y = p => p / 100 * h;
      ctx.clearRect(0, 0, w, h);

      // graticule
      ctx.strokeStyle = 'rgba(147,151,171,.07)'; ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 8); ctx.lineTo(w, h * i / 8); ctx.stroke(); }
      for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(w * i / 12, 0); ctx.lineTo(w * i / 12, h); ctx.stroke(); }

      // landmasses
      ctx.fillStyle = 'rgba(145,132,217,.16)';
      for (const [x, y, bw, bh] of LAND) ctx.fillRect(X(x), Y(y), X(bw), Y(bh));

      // heat blooms
      ctx.globalCompositeOperation = 'lighter';
      for (const s of SRC) {
        const br = 0.75 + 0.25 * Math.sin(now * (0.7 + s.sev) + s.x);
        const rad = Math.min(w, h) * (0.1 + s.sev * 0.16) * br;
        const gr = ctx.createRadialGradient(X(s.x), Y(s.y), 0, X(s.x), Y(s.y), rad);
        gr.addColorStop(0, 'rgba(' + TONE[s.kind] + ',' + (0.34 * s.sev).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(' + TONE[s.kind] + ',0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), rad, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // source cores + expanding rings
      for (const s of SRC) {
        ctx.fillStyle = 'rgba(' + TONE[s.kind] + ',.9)';
        ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), 1.6 + s.sev * 1.3, 0, 7); ctx.fill();
        const rp = (now * (0.32 + s.sev * 0.28)) % 1;
        ctx.strokeStyle = 'rgba(' + TONE[s.kind] + ',' + ((1 - rp) * 0.34 * s.sev).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), 3 + rp * Math.min(w, h) * 0.1, 0, 7); ctx.stroke();
      }

      // attack arcs converging on Sunrise
      for (const a of arcs) {
        a.t = Math.min(1, a.t + a.sp * speed);
        const x1 = X(a.s.x), y1 = Y(a.s.y), x2 = X(TGT.x), y2 = Y(TGT.y);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.32 - 8;
        const done = a.t >= 1, tone = TONE[a.s.kind];
        ctx.setLineDash(a.s.kind === 'attack' ? [] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(x1, y1);
        // partial quadratic via sampling
        const N = 40, lim = Math.max(1, Math.floor(N * a.t));
        for (let i = 1; i <= lim; i++) {
          const t = i / N, it = 1 - t;
          ctx.lineTo(it * it * x1 + 2 * it * t * mx + t * t * x2, it * it * y1 + 2 * it * t * my + t * t * y2);
        }
        ctx.strokeStyle = 'rgba(' + tone + ',' + (done ? 0.14 : (a.s.kind === 'attack' ? 0.8 : 0.45)) + ')';
        ctx.lineWidth = a.s.kind === 'attack' ? 1.5 : 1;
        ctx.stroke(); ctx.setLineDash([]);
        if (!done) {
          const t = a.t, it = 1 - t;
          const hx = it * it * x1 + 2 * it * t * mx + t * t * x2, hy = it * it * y1 + 2 * it * t * my + t * t * y2;
          ctx.fillStyle = 'rgba(' + tone + ',.95)';
          ctx.beginPath(); ctx.arc(hx, hy, a.s.kind === 'attack' ? 2.5 : 1.8, 0, 7); ctx.fill();
        }
      }

      // facility marker
      const pl = (now % 1.8) / 1.8;
      ctx.strokeStyle = 'rgba(213,206,253,' + ((1 - pl) * 0.65).toFixed(3) + ')'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(X(TGT.x), Y(TGT.y), 4 + pl * 24, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(X(TGT.x), Y(TGT.y)); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f5f4ff'; ctx.fillRect(-3.2, -3.2, 6.4, 6.4); ctx.restore();
      ctx.font = '600 9px Inter, system-ui, sans-serif'; ctx.fillStyle = '#cfd3e5';
      ctx.fillText('SUNRISE, FL', X(TGT.x) + 10, Y(TGT.y) - 5);

      raf = requestAnimationFrame(draw);
    };
    draw();
    stops.push(() => { cancelAnimationFrame(raf); ro.disconnect(); });
  }

  // ---- 2. dependency graph strip ----
  if (els.graph) {
    const cv = els.graph;
    let g = fit(cv), raf = 0;
    const ro = new ResizeObserver(() => { g = fit(cv); }); ro.observe(cv); 
    let sd = 7717;
    const rnd = () => (sd = (sd * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const N = 46;
    const nodes = Array.from({ length: N }, () => ({
      x: rnd(), y: rnd(), vx: (rnd() - .5) * 0.00022, vy: (rnd() - .5) * 0.00022,
      r: rnd() > 0.86 ? 3.2 : 1.7, hot: 0, ph: rnd() * 6.283
    }));
    const links = [];
    for (let i = 0; i < N; i++) {
      let best = -1, bd = 9;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const d = (nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) links.push([i, best]);
      if (rnd() > 0.7) links.push([i, Math.floor(rnd() * N)]);
    }
    let last = performance.now();
    const draw = () => {
      // a canvas measured mid-layout reports 0x0; re-fit until it has a box,
      // otherwise the backing store stays 0 and the panel renders blank forever
      if (!g.w || !g.h) g = fit(cv);
      const now = performance.now(), dt = Math.min(50, now - last); last = now;
      const { ctx, w, h } = g;
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        n.x += n.vx * dt * speed; n.y += n.vy * dt * speed;
        if (n.x < .02 || n.x > .98) n.vx *= -1;
        if (n.y < .06 || n.y > .94) n.vy *= -1;
        n.hot *= 0.972;
      }
      if (Math.random() > 0.94) nodes[Math.floor(Math.random() * N)].hot = 1;
      for (const [i, j] of links) {
        const a = nodes[i], b = nodes[j];
        const lit = Math.max(a.hot, b.hot);
        ctx.strokeStyle = lit > 0.05 ? 'rgba(213,206,253,' + (0.12 + lit * 0.5).toFixed(3) + ')' : 'rgba(145,132,217,.14)';
        ctx.lineWidth = lit > 0.05 ? 1.1 : 0.6;
        ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
      }
      for (const n of nodes) {
        const br = 0.6 + 0.4 * Math.sin(now / 900 + n.ph);
        const col = n.hot > 0.1 ? '245,244,255' : '181,171,252';
        ctx.fillStyle = 'rgba(' + col + ',' + (0.3 + br * 0.3 + n.hot * 0.5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(n.x * w, n.y * h, n.r + n.hot * 2, 0, 7); ctx.fill();
        if (n.hot > 0.3) {
          ctx.strokeStyle = 'rgba(213,206,253,' + (n.hot * 0.55).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(n.x * w, n.y * h, n.r + (1 - n.hot) * 15, 0, 7); ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    stops.push(() => { cancelAnimationFrame(raf); ro.disconnect(); });
  }

  return () => stops.forEach(f => f());
}
