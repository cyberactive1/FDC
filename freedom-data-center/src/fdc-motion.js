// Scroll-driven motion layer: reveals, count-ups, parallax, scroll progress, ambient grid.
export function initMotion(root, opts) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m = (opts && opts.motion) || 8;
  const cleanups = [];
  if (!root) return () => {};

  // ---------- scroll progress rail ----------
  const rail = document.createElement('div');
  rail.setAttribute('data-fdc-progress', '');
  rail.style.cssText = 'position:fixed;left:0;top:0;height:2px;width:0%;z-index:99;pointer-events:none;background:linear-gradient(90deg,#5d5294,#b5abfc 60%,#f5f4ff);box-shadow:0 0 14px rgba(145,132,217,.7);transition:width .12s linear';
  root.appendChild(rail);

  const nav = root.querySelector('nav');
  const ticker = document.getElementById('fdc-ticker');
  const toTop = document.getElementById('fdc-totop');
  const toTopRing = document.getElementById('fdc-totop-ring');
  const RING = 131.9;                       // 2*pi*r for the r=21 progress ring
  const syncNav = () => {
    const de = document.documentElement;
    // real usable viewport height — svh can resolve to the wrong box inside frames
    de.style.setProperty('--fdc-vh', (window.innerHeight || de.clientHeight) + 'px');
    if (nav) de.style.setProperty('--fdc-nav', nav.offsetHeight + 'px');
    // the hero sizes itself as viewport minus nav minus this rail, so that the
    // three together occupy exactly one screen
    if (ticker) de.style.setProperty('--fdc-ticker', ticker.offsetHeight + 'px');
  };
  syncNav();
  if (window.ResizeObserver && (nav || ticker)) {
    const navRo = new ResizeObserver(syncNav);
    if (nav) navRo.observe(nav);
    if (ticker) navRo.observe(ticker);
    cleanups.push(() => navRo.disconnect());
  }
  window.addEventListener('resize', syncNav);
  // a host frame may only reach its final height after load, which changes
  // whether this document scrolls at all
  window.addEventListener('resize', () => onScroll && onScroll());
  cleanups.push(() => window.removeEventListener('resize', syncNav));
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const sc = window.scrollY || document.documentElement.scrollTop;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      const max = Math.max(1, document.documentElement.scrollHeight - vh);
      const pct = Math.min(1, sc / max);
      rail.style.width = (pct * 100) + '%';
      if (toTop) {
        // Fail visible. When this page is embedded in a frame that is sized to
        // its full content height, the parent scrolls and this document's own
        // scrollY never leaves 0 -- so a "show once scrolled" test would hide
        // the button forever. Only hide it when we can positively establish
        // that the reader is near the top of a document that really scrolls.
        const canScroll = (document.documentElement.scrollHeight - vh) > 200;
        const nearTop = canScroll && sc < vh * 0.35;
        if (nearTop) toTop.removeAttribute('data-visible');
        else toTop.setAttribute('data-visible', '');
        if (toTopRing) {
          // with no measurable scroll there is no progress to report, so the
          // ring is left empty rather than showing a misleading value
          toTopRing.setAttribute('stroke-dashoffset',
            canScroll ? (RING * (1 - pct)).toFixed(1) : RING.toFixed(1));
        }
      }
      if (nav) {
        const dense = sc > 80;
        nav.style.paddingTop = dense ? '9px' : '13px';
        nav.style.paddingBottom = dense ? '9px' : '13px';
        nav.style.background = dense ? 'rgba(18,19,32,.9)' : 'rgba(22,24,38,.74)';
        nav.style.borderBottomColor = dense ? 'rgba(145,132,217,.28)' : 'rgba(233,233,237,.09)';
      }
      // parallax on banded sections
      for (const el of parallax) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) continue;
        const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        el.style.backgroundPosition = '50% ' + (50 + p * 14).toFixed(2) + '%';
      }
      ticking = false;
    });
  };

  // banded sections get a drifting gradient
  const parallax = [];
  if (!reduce) {
    root.querySelectorAll('section').forEach(sec => {
      const bg = sec.style.background || '';
      if (sec.id === 'top') return;
      if (bg.includes('linear-gradient') || bg.includes('radial-gradient')) {
        sec.style.backgroundSize = '100% 130%';
        sec.style.backgroundRepeat = 'no-repeat';
        parallax.push(sec);
      }
    });
  }

  const onKey = ev => {
    if (ev.key !== 'Escape') return;
    const closer = document.querySelector('#fdc-modal button[aria-label="Close"]');
    if (closer) closer.click();
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));

  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));
  onScroll();

  if (reduce) return () => cleanups.forEach(f => f());

  // ---------- staggered reveals ----------
  const revealTargets = [];
  root.querySelectorAll('section').forEach((sec, si) => {
    if (sec.id === 'top') return;
    // direct content children reveal in sequence
    const kids = sec.querySelectorAll(':scope > div > [data-k], :scope > [data-k], :scope > h2, :scope > p, :scope > div > h2, :scope > div > p, :scope > div[data-r], :scope > div > div[data-r], :scope > div[style*="border"], :scope > div > div[style*="border"]');
    let i = 0;
    kids.forEach(el => {
      if (el.hasAttribute('data-revealed') || el.closest('[data-no-reveal]')) return;
      const d = i * 70;
      const ease = 'cubic-bezier(.16,.8,.3,1)';
      const tag = el.tagName;
      el.setAttribute('data-reveal', '');
      el.style.opacity = '0';
      if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
        // headings wipe in behind a moving edge rather than simply fading up
        el.style.transform = 'translateY(10px)';
        el.style.clipPath = 'inset(0 100% 0 0)';
        el.style.transition = 'opacity .5s ' + ease + ' ' + d + 'ms, transform .8s ' + ease + ' '
          + d + 'ms, clip-path .9s ' + ease + ' ' + d + 'ms';
      } else if (el.hasAttribute('data-k')) {
        // section kickers settle their tracking as they arrive
        el.style.transform = 'none';
        el.style.letterSpacing = '.42em';
        el.style.transition = 'opacity .6s ' + ease + ' ' + d + 'ms, letter-spacing .9s ' + ease + ' ' + d + 'ms';
      } else {
        el.style.transform = 'translateY(18px)';
        el.style.transition = 'opacity .7s ' + ease + ' ' + d + 'ms, transform .7s ' + ease + ' ' + d + 'ms';
      }
      revealTargets.push(el);
      i = Math.min(i + 1, 6);
    });
  });

  const revealObs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.opacity = '1';
      e.target.style.transform = 'none';
      if (e.target.style.clipPath) e.target.style.clipPath = 'inset(0 0 0 0)';
      if (e.target.hasAttribute('data-k')) e.target.style.letterSpacing = '';
      e.target.setAttribute('data-revealed', '');
      revealObs.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  revealTargets.forEach(el => revealObs.observe(el));
  cleanups.push(() => revealObs.disconnect());

  // ---------- console boot sequence ----------
  // The console shells carry data-no-reveal, so they used to simply appear.
  // Instead each marked grid brings its panels up in order, which reads like
  // instrumentation coming online rather than a block of markup arriving.
  const bootGroups = Array.from(root.querySelectorAll('[data-boot]'));
  bootGroups.forEach(group => {
    Array.from(group.children).forEach((panel, k) => {
      panel.style.opacity = '0';
      panel.style.transform = 'translateY(8px) scale(.988)';
      panel.style.transition = 'opacity .55s cubic-bezier(.16,.8,.3,1) ' + (k * 90)
        + 'ms, transform .7s cubic-bezier(.16,.8,.3,1) ' + (k * 90) + 'ms';
    });
  });
  if (bootGroups.length) {
    const bootObs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        Array.from(e.target.children).forEach(panel => {
          panel.style.opacity = '1';
          panel.style.transform = 'none';
        });
        bootObs.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    bootGroups.forEach(g => bootObs.observe(g));
    cleanups.push(() => bootObs.disconnect());
  }

  // ---------- count-up on numeric stats ----------
  const numRe = /^([^\d\-+]*)([\d,]+(?:\.\d+)?)(.*)$/;
  const countTargets = [];
  root.querySelectorAll('div,span').forEach(el => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (t.length > 12) return;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (fs < 20) return;
    const mm = t.match(numRe);
    if (!mm) return;
    const raw = mm[2].replace(/,/g, '');
    const val = parseFloat(raw);
    if (!isFinite(val) || val === 0) return;
    countTargets.push({ el, pre: mm[1], post: mm[3], val, grouped: mm[2].includes(','), dec: (raw.split('.')[1] || '').length });
  });

  const countObs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = countTargets.find(c => c.el === e.target);
      countObs.unobserve(e.target);
      if (!t) continue;
      const dur = 1100, t0 = performance.now();
      const fmt = v => {
        let sv = t.dec ? v.toFixed(t.dec) : String(Math.round(v));
        if (t.grouped) sv = Number(sv).toLocaleString();
        return t.pre + sv + t.post;
      };
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        t.el.textContent = fmt(t.val * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  countTargets.forEach(c => countObs.observe(c.el));
  cleanups.push(() => countObs.disconnect());

  // ---------- pointer-tracked glow on lift cards ----------
  const cards = Array.from(root.querySelectorAll('[data-hover-lift],[data-spot]'));
  const onMove = ev => {
    const el = ev.currentTarget, r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    el.style.setProperty('--my', ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  };
  cards.forEach(c => c.addEventListener('pointermove', onMove));
  cleanups.push(() => cards.forEach(c => c.removeEventListener('pointermove', onMove)));

  // ---------- nav scroll-spy: highlight the section you are actually in ----------
  const navLinks = Array.from(root.querySelectorAll('[data-scroll]'))
    .filter(a => a.closest('nav'));
  const spyPairs = navLinks
    .map(a => [a, document.getElementById(a.getAttribute('data-scroll'))])
    .filter(pair => pair[1]);
  if (spyPairs.length) {
    let activeEl = null;
    const spy = () => {
      const probe = (window.innerHeight || 800) * 0.32;
      let best = null, bestTop = -Infinity;
      for (const [a, sec] of spyPairs) {
        const top = sec.getBoundingClientRect().top;
        if (top <= probe && top > bestTop) { bestTop = top; best = a; }
      }
      if (best === activeEl) return;
      if (activeEl) { activeEl.style.color = ''; activeEl.removeAttribute('aria-current'); }
      activeEl = best;
      if (activeEl) { activeEl.style.color = '#f5f4ff'; activeEl.setAttribute('aria-current', 'true'); }
    };
    let spyTick = false;
    const onSpy = () => {
      if (spyTick) return;
      spyTick = true;
      requestAnimationFrame(() => { spy(); spyTick = false; });
    };
    spy();
    window.addEventListener('scroll', onSpy, { passive: true });
    window.addEventListener('resize', onSpy);
    cleanups.push(() => {
      window.removeEventListener('scroll', onSpy);
      window.removeEventListener('resize', onSpy);
      if (activeEl) { activeEl.style.color = ''; activeEl.removeAttribute('aria-current'); }
    });
  }

  // ---------- in-page navigation ----------
  // No link on this page carries an href. A fragment href resolves against the
  // document base URL, so inside a hosted preview frame "#era" becomes an
  // absolute cross-origin-looking URL that shows up in the status bar and
  // navigates the frame. Targets live in data-scroll instead and are resolved
  // here. That means the anchors are not natively activatable, so keyboard
  // handling is provided explicitly.
  const goTo = id => {
    const el = id && document.getElementById(id);
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    } catch (err) {
      el.scrollIntoView();          // older engines reject the options object
    }
    return true;
  };
  const targetOf = ev => {
    const t = ev.target;
    return t && t.closest ? t.closest('[data-scroll]') : null;
  };
  const onNavClick = ev => {
    if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = targetOf(ev);
    if (a && goTo(a.getAttribute('data-scroll'))) ev.preventDefault();
  };
  const onNavKey = ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    const a = targetOf(ev);
    if (!a || a.tagName === 'BUTTON') return;   // buttons fire their own click
    ev.preventDefault();            // stop Space from scrolling the page
    goTo(a.getAttribute('data-scroll'));
  };
  document.addEventListener('click', onNavClick);
  document.addEventListener('keydown', onNavKey);
  cleanups.push(() => {
    document.removeEventListener('click', onNavClick);
    document.removeEventListener('keydown', onNavKey);
  });

  return () => cleanups.forEach(f => f());
}
