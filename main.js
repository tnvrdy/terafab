// ── Splash text: fade in on scroll ────────────
new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('is-visible');
  });
}, { threshold: 0.15 }).observe(document.querySelector('.splash-text'));

// ── Timing: slot counts derived from actual text ─
// Second text last char: slot 123 ("...stars.")
// Aspire last char:      slot 46  ("...civilization.")
const CHAR_MS        = 22;
const TRANS_MS       = 350;
const REVEAL_DONE_MS = 123 * CHAR_MS + TRANS_MS; // ~3056 ms
const ASPIRE_DONE_MS =  46 * CHAR_MS + TRANS_MS; // ~1362 ms

// ── Shared state ──────────────────────────────
let bgFade            = 0;
let revealTriggeredAt = null;
let aspireFired       = false;
let kardashevFired    = false;

// ── Element refs ──────────────────────────────
const revealSection   = document.querySelector('.section-reveal');
const revealContainer = document.querySelector('[data-reveal]');
const aspireContainer = document.querySelector('[data-reveal-aspire]');
const kardSection     = document.querySelector('[data-kardashev]');

// ── Build char spans with staggered delays ────
function buildChars(container) {
  const LINE_GAP = 8;
  let slot = 0;
  container.querySelectorAll('.reveal-line').forEach((line, i) => {
    if (i > 0) slot += LINE_GAP;
    const text = line.textContent;
    line.textContent = '';
    for (const ch of text) {
      if (ch === ' ') {
        line.appendChild(document.createTextNode(' '));
        slot++;
      } else {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch;
        span.style.transitionDelay = (slot * CHAR_MS) + 'ms';
        line.appendChild(span);
        slot++;
      }
    }
  });
}

function showChars(container) {
  container.querySelectorAll('.char').forEach(c => c.classList.add('is-visible'));
}

// Build both texts' chars on load (delays assigned, not shown yet)
if (revealContainer) buildChars(revealContainer);
if (aspireContainer) buildChars(aspireContainer);

// ── Second text: fire on scroll-in ───────────
if (revealContainer) {
  new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !revealTriggeredAt) {
        revealTriggeredAt = Date.now();
        showChars(revealContainer);
        setTimeout(tryTriggerAspire, REVEAL_DONE_MS);
      }
    });
  }, { threshold: 0.2 }).observe(revealContainer);
}

// ── Aspire trigger: all three gates must be true ─
function tryTriggerAspire() {
  if (aspireFired || !revealTriggeredAt || !aspireContainer) return;
  if (Date.now() < revealTriggeredAt + REVEAL_DONE_MS) return;

  const revealRect = revealSection.getBoundingClientRect();
  const inTopHalf  = (revealRect.top + revealRect.height / 2) < window.innerHeight / 2;
  if (!inTopHalf) return;

  const aspireRect   = aspireContainer.getBoundingClientRect();
  const aspireInView = aspireRect.top < window.innerHeight;
  if (!aspireInView) return;

  aspireFired = true;
  showChars(aspireContainer);
  setTimeout(triggerKardashev, ASPIRE_DONE_MS);
}

// ── Kardashev: bam-bam-bam word pop-in + timeline ─
function triggerKardashev() {
  if (kardashevFired || !kardSection) return;
  kardashevFired = true;
  kardSection.querySelectorAll('.kard-word').forEach((word, i) => {
    setTimeout(() => word.classList.add('is-visible'), i * 260);
  });
  // Timeline appears right after SCALE (2×260ms delay + 180ms transition + buffer)
  const timeline = document.getElementById('kard-timeline');
  if (timeline) setTimeout(() => {
    timeline.classList.add('is-visible');
    if (window._kardInit) window._kardInit();
  }, 740);
}

// ── Kardashev video state machine (single stitched video, seek-based) ──
(function () {
  const video = document.getElementById('kard-bg-video');
  const tiers = document.querySelectorAll('.timeline-tier');
  if (!video || !tiers.length) return;

  // Segment boundaries within kardashev-all.mp4
  // Order: t1-t2, t2-t3, t3-t2, t2-t1, t1-t3, t3-t1
  const SEGS = {
    '1-2': { start:  0.000, end:  6.269 },
    '2-3': { start:  6.269, end: 12.469 },
    '3-2': { start: 12.469, end: 18.831 },
    '2-1': { start: 18.831, end: 25.681 },
    '1-3': { start: 25.681, end: 31.977 },
    '3-1': { start: 31.977, end: 39.733 },
  };
  const SKIP = 0.5;

  let completedTier = 1;
  let transitToTier = null;
  let queuedTier    = null;
  let isPlaying     = false;
  let seekId        = 0;

  function setActive(n) {
    tiers.forEach(t => t.classList.remove('is-active'));
    const el = document.querySelector(`.timeline-tier[data-tier="${n}"]`);
    if (el) el.classList.add('is-active');
  }

  let rafId = null;
  function clearEndWatcher() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function onSegmentEnd() {
    clearEndWatcher();
    video.pause();
    completedTier = transitToTier;
    transitToTier = null;
    isPlaying = false;
    if (queuedTier !== null && queuedTier !== completedTier) {
      const next = queuedTier; queuedTier = null;
      transitToTier = next;
      playTransition(completedTier, next);
    } else {
      queuedTier = null;
    }
  }

  function playTransition(from, to) {
    isPlaying = true;
    clearEndWatcher();
    const seg  = SEGS[`${from}-${to}`];
    const myId = ++seekId;
    video.currentTime = seg.start + SKIP;
    video.style.opacity = '1';
    video.addEventListener('seeked', function onSeeked() {
      if (seekId !== myId) return;
      video.play().catch(() => {});
      const segEnd = seg.end - 0.05;
      function checkEnd() {
        if (!isPlaying) return;
        if (video.currentTime >= segEnd) { onSegmentEnd(); return; }
        rafId = requestAnimationFrame(checkEnd);
      }
      rafId = requestAnimationFrame(checkEnd);
    }, { once: true });
  }

  tiers.forEach(tier => {
    tier.addEventListener('click', () => {
      const clicked     = parseInt(tier.dataset.tier);
      const destination = isPlaying ? (queuedTier ?? transitToTier) : completedTier;
      if (clicked === destination) return;
      setActive(clicked);
      if (!isPlaying) {
        transitToTier = clicked;
        playTransition(completedTier, clicked);
      } else {
        queuedTier = clicked;
      }
    });
  });

  window._kardInit = function () {
    completedTier = 1;
    setActive(1);
    video.style.opacity = '0';
    video.currentTime = SEGS['1-2'].start + SKIP;
    video.addEventListener('seeked', function () {
      video.style.opacity = '1';
    }, { once: true });
  };
})();

// ── WTIT → Harnessing → Bullets chained reveal ─
(function () {
  const wtit    = document.querySelector('[data-reveal-wtit]');
  const harn    = document.querySelector('[data-reveal-harnessing]');
  const bullets = document.querySelectorAll('.bullet-item');
  const WTIT_DONE_MS = 17 * CHAR_MS + TRANS_MS;
  const HARN_DONE_MS = 38 * CHAR_MS + TRANS_MS;

  if (wtit) buildChars(wtit);
  if (harn) buildChars(harn);

  let wtitFired = false;
  if (wtit) {
    new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !wtitFired) {
          wtitFired = true;
          showChars(wtit);
          setTimeout(() => {
            if (harn) showChars(harn);
            setTimeout(() => {
              bullets.forEach((b, i) => {
                setTimeout(() => b.classList.add('is-visible'), i * 300);
              });
            }, HARN_DONE_MS);
          }, WTIT_DONE_MS);
        }
      });
    }, { threshold: 0.5 }).observe(wtit);
  }
})();

// ── Harnessing sun scroll parallax ──
(function () {
  const track = document.querySelector('.harn-scroll-track');
  const img   = document.querySelector('.harn-sun-img');
  if (!track || !img) return;

  let rafPending = false;
  function update() {
    const rect        = track.getBoundingClientRect();
    const scrollRange = track.offsetHeight - window.innerHeight;
    if (scrollRange <= 0) return;
    const progress  = Math.max(0, Math.min(1, -rect.top / scrollRange));
    const travel    = Math.max(0, img.offsetHeight - window.innerHeight);
    const imgOffset = -progress * travel;
    img.style.transform = `translateY(${imgOffset}px)`;
  }
  function scheduleUpdate() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; update(); });
    }
  }
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  if (img.readyState >= 1) { update(); } else { img.addEventListener('loadedmetadata', update); }
})();

// ── Shared number animation ───────────────────
function animateNumber(el, finalText) {
  const DURATION = 950;
  const start    = performance.now();
  el.textContent = finalText;
  function tick(now) {
    const t = Math.min((now - start) / DURATION, 1);
    if (t >= 1) { el.style.filter = ''; return; }
    const b = 5 * (1 - t);
    el.style.filter = b > 0.1 ? `blur(${b.toFixed(1)}px)` : '';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── Scaling section ───────────────────────────
(function () {
  const scalingHeader = document.querySelector('[data-reveal-scaling]');
  const scalingStats  = document.getElementById('scaling-stats');
  const scaleImgs     = document.querySelectorAll('.scale-bar-img');
  const scaleClips    = document.querySelectorAll('.scale-bar-clip');
  const scaleLabels   = document.querySelectorAll('.scale-bar-label');
  const SCALING_DONE_MS = 27 * CHAR_MS + TRANS_MS;
  const ANIM_DURATION   = 950;
  const DISPLAY_H       = 380;

  if (scalingHeader) buildChars(scalingHeader);

  const imgLoaded = Array.from(scaleImgs).map(img =>
    img.complete && img.naturalHeight
      ? Promise.resolve()
      : new Promise(res => { img.onload = res; img.onerror = res; })
  );
  Promise.all(imgLoaded).then(() => {
    const heights = Array.from(scaleImgs).map(img => img.naturalHeight || 1);
    const maxH    = Math.max(...heights);
    const sf      = DISPLAY_H / maxH;
    scaleImgs.forEach((img, i) => {
      const h = Math.round(heights[i] * sf);
      img.style.height = h + 'px';
      if (scaleClips[i]) scaleClips[i].style.height = h + 'px';
      if (scaleLabels[i]) scaleLabels[i].style.transform = `translateY(${h}px)`;
    });
  });

  const LABEL_PCTS = [1.0, 0.50, 0.535];

  function triggerScaleBars() {
    Promise.all(imgLoaded).then(() => {
      const heights = Array.from(scaleImgs).map(img => parseFloat(img.style.height) || 1);
      const maxH    = Math.max(...heights);
      scaleImgs.forEach((img, i) => {
        img.style.transitionDuration = '0ms';
        if (scaleLabels[i]) {
          scaleLabels[i].style.transitionDuration = '0ms';
          scaleLabels[i].style.opacity = '0';
          scaleLabels[i].style.transform = `translateY(${heights[i] || 1}px)`;
        }
      });
      void scaleImgs[0]?.offsetHeight;
      scaleImgs.forEach((img, i) => {
        const h        = heights[i] || 1;
        const duration = Math.round((h / maxH) * ANIM_DURATION) + 'ms';
        img.style.transitionDuration = duration;
        img.style.transform = 'translateY(0)';
        if (scaleLabels[i]) {
          const pct    = LABEL_PCTS[i] ?? 1.0;
          const finalY = -(1 - pct) * h;
          scaleLabels[i].style.transitionDuration = duration;
          scaleLabels[i].style.opacity = '1';
          scaleLabels[i].style.transform = `translateY(${finalY}px)`;
        }
      });
    });
  }

  let scalingFired = false;
  function checkScaling() {
    if (scalingFired || !scalingHeader) return;
    const rect = scalingHeader.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.78) {
      scalingFired = true;
      window.removeEventListener('scroll', checkScaling, { passive: true });
      showChars(scalingHeader);
      setTimeout(() => {
        if (!scalingStats) return;
        scalingStats.classList.add('is-visible');
        scalingStats.querySelectorAll('.stat-number').forEach(el => {
          animateNumber(el, el.dataset.final);
        });
        triggerScaleBars();
      }, SCALING_DONE_MS);
    }
  }
  window.addEventListener('scroll', checkScaling, { passive: true });
  checkScaling();
})();

// ── Builders section ─────────────────────────
(function () {
  const buildersText  = document.querySelector('[data-reveal-builders]');
  const buildersLogos = document.getElementById('builders-logos');
  const BUILDERS_DONE_MS = 56 * CHAR_MS + TRANS_MS;

  if (buildersText) buildChars(buildersText);

  let fired = false;
  if (buildersText) {
    new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !fired) {
          fired = true;
          showChars(buildersText);
          if (buildersLogos) {
            setTimeout(() => buildersLogos.classList.add('is-visible'), BUILDERS_DONE_MS);
          }
        }
      });
    }, { threshold: 0.3 }).observe(buildersText);
  }
})();

// ── Building photo: fade in on scroll ─────────
(function () {
  const el = document.getElementById('section-building');
  if (!el) return;
  new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) el.classList.add('is-visible'); });
  }, { threshold: 0.15 }).observe(el);
})();

// ── Footer ───────────────────────────────────
(function () {
  const el = document.getElementById('section-footer');
  if (!el) return;
  new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) el.classList.add('is-visible'); });
  }, { threshold: 0.15 }).observe(el);
})();

// ── Space compute text + groups ──────────────
(function () {
  const text   = document.getElementById('space-compute-text');
  const groups = document.getElementById('space-compute-groups');
  if (text) new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) text.classList.add('is-visible'); });
  }, { threshold: 0.2 }).observe(text);
  if (groups) new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) groups.classList.add('is-visible'); });
  }, { threshold: 0.2 }).observe(groups);
})();

// ── Mass driver video ────────────────────────
(function () {
  const section = document.getElementById('section-mass-drive');
  const video   = document.getElementById('mass-drive-video');
  if (!section || !video) return;
  function seekToStart() { video.currentTime = 50; }
  if (video.readyState >= 1) { seekToStart(); } else { video.addEventListener('loadedmetadata', seekToStart); }
  new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        section.classList.add('is-visible');
        video.play().catch(() => {});
      }
    });
  }, { threshold: 0.15 }).observe(section);
})();

// ── Chip gallery ─────────────────────────────
(function () {
  const el = document.getElementById('chip-gallery');
  if (!el) return;
  new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) el.classList.add('is-visible'); });
  }, { threshold: 0.1 }).observe(el);
})();

// ── Chips heading ────────────────────────────
(function () {
  const el = document.querySelector('[data-reveal-chips]');
  if (!el) return;
  buildChars(el);
  let fired = false;
  new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !fired) {
        fired = true;
        showChars(el);
      }
    });
  }, { threshold: 0.4 }).observe(el);
})();

// ── Two-stat section ─────────────────────────
(function () {
  const cols = document.querySelectorAll('.two-stat-col');
  if (!cols.length) return;
  cols.forEach(col => {
    const numEl = col.querySelector('.two-stat-number');
    if (numEl) numEl.innerHTML = numEl.dataset.final + '<span class="two-stat-year">/YEAR</span>';
  });
  let fired = false;
  new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && !fired) {
        fired = true;
        cols.forEach(col => col.classList.add('is-visible'));
      }
    });
  }, { threshold: 0.3 }).observe(cols[0]);
})();

// ── Scroll-to-black + aspire gate ────────────
function updateFade() {
  if (!revealSection) return;
  const rect    = revealSection.getBoundingClientRect();
  const vh      = window.innerHeight;
  const H       = revealSection.offsetHeight;
  const fadeEnd = Math.max(0, vh / 2 - H / 2);
  bgFade = Math.max(0, Math.min(1, (vh - rect.top) / (vh - fadeEnd)));
}

window.addEventListener('scroll', updateFade,       { passive: true });
window.addEventListener('scroll', tryTriggerAspire, { passive: true });
updateFade();

// ── Silicon wafer grid background ─────────────
(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');

  const SZ = 15;
  const ZX = 4, ZY = 3;

  const TEAL    = [4, 46, 58];
  const PLUM    = [38, 5, 18];
  const PALETTE = [
    [26,  6, 46],
    [ 8, 10, 60],
    [48,  3,  5],
    [12, 28, 54],
    [34,  3,  5],
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpC(c0, c1, t) {
    return [lerp(c0[0],c1[0],t), lerp(c0[1],c1[1],t), lerp(c0[2],c1[2],t)];
  }

  let mouse  = { x: -9999, y: -9999 };
  let squares = [], blobs = [];
  let W = 0, H = 0;

  function build() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    squares = [];

    const cols = Math.ceil(W / SZ) + 1;
    const rows = Math.ceil(H / SZ) + 1;

    const zones = Array.from({ length: ZY }, (_, ry) =>
      Array.from({ length: ZX }, () =>
        ry === 0 ? PLUM :
        ry === 1 ? TEAL :
        PALETTE[Math.floor(Math.random() * PALETTE.length)]
      )
    );

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c / Math.max(cols - 1, 1)) * (ZX - 1);
        const fy = (r / Math.max(rows - 1, 1)) * (ZY - 1);
        const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, ZX - 1);
        const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ZY - 1);
        const tx = fx - x0, ty = fy - y0;

        let base = lerpC(
          lerpC(zones[y0][x0], zones[y0][x1], tx),
          lerpC(zones[y1][x0], zones[y1][x1], tx),
          ty
        );

        const lit = base.map(v => Math.min(255, v * 3.2));

        const brightNoise = 0.96 + 0.04 * (
          0.55 * Math.sin(c * 0.68 + r * 0.51) +
          0.45 * Math.sin(c * 0.27 - r * 0.79)
        );

        squares.push({
          x: c * SZ, y: r * SZ,
          base, lit,
          baseAlpha: 0.28 + Math.random() * 0.10,
          brightNoise,
          flickers: Math.random() > 0.3,
          ph1: Math.random() * Math.PI * 2,
          ph2: Math.random() * Math.PI * 2,
          sp1: 0.25 + Math.random() * 0.5,
          sp2: (0.25 + Math.random() * 0.5) * 1.618,
          push: 0,
          pinPh: Math.random() * Math.PI * 2,
          pinSp: 0.0008 + Math.random() * 0.0018,
        });
      }
    }

    blobs = [
      { ph: 0,        spx: 0.000130, spy: 0.000190, pulPh: 0,             pulSp: 0.000310, x: 0, y: 0, a: 0 },
      { ph: Math.PI,  spx: 0.000170, spy: 0.000110, pulPh: Math.PI * 0.7, pulSp: 0.000240, x: 0, y: 0, a: 0 },
    ];
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    const fade = 1 - bgFade;

    for (const b of blobs) {
      b.x = W * (0.15 + 0.70 * (0.5 + 0.5 * Math.sin(t * b.spx + b.ph)));
      b.y = H * (0.15 + 0.70 * (0.5 + 0.5 * Math.cos(t * b.spy + b.ph * 1.3)));
      b.a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * b.pulSp + b.pulPh));
    }

    for (const sq of squares) {
      let flick = 1;
      if (sq.flickers) {
        flick = 0.90 + 0.07 * Math.sin(t * 0.001 * sq.sp1 + sq.ph1)
                     + 0.03 * Math.sin(t * 0.001 * sq.sp2 + sq.ph2);
      }

      const mdx  = sq.x + SZ * 0.5 - mouse.x;
      const mdy  = sq.y + SZ * 0.5 - mouse.y;
      const dist = Math.sqrt(mdx*mdx + mdy*mdy);
      const glow = Math.max(0, 1 - dist / 900) ** 1.6;

      const influence = Math.max(0, 1 - dist / 200) ** 1.8;
      const pinOsc    = Math.sin(t * sq.pinSp + sq.pinPh);
      const pushTarget = influence * ((pinOsc + 1) * 0.5);
      const lerpRate   = pushTarget > sq.push ? 0.18 : 0.09;
      sq.push += (pushTarget - sq.push) * lerpRate;

      let blobGlow = 0;
      for (const b of blobs) {
        const bdx = sq.x + SZ * 0.5 - b.x;
        const bdy = sq.y + SZ * 0.5 - b.y;
        blobGlow += Math.max(0, 1 - Math.sqrt(bdx*bdx + bdy*bdy) / 960) ** 2 * b.a;
      }
      blobGlow = Math.min(1, blobGlow) * 0.30;

      const combinedGlow = Math.min(1, glow + blobGlow + sq.push * 0.65);

      const rv = (sq.base[0] + (sq.lit[0] - sq.base[0]) * combinedGlow) | 0;
      const gv = (sq.base[1] + (sq.lit[1] - sq.base[1]) * combinedGlow) | 0;
      const bv = (sq.base[2] + (sq.lit[2] - sq.base[2]) * combinedGlow) | 0;
      const a  = Math.min(0.86, sq.baseAlpha * flick * sq.brightNoise + glow * 0.4 + blobGlow * 0.20 + sq.push * 0.35) * fade;

      if (a > 0.005) {
        ctx.fillStyle = `rgba(${rv},${gv},${bv},${a.toFixed(2)})`;
        ctx.fillRect(sq.x, sq.y, SZ, SZ);
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener('resize', build);
  build();
  requestAnimationFrame(draw);
})();

// ── Hero video: loop from 0:33 to end ─────────
(function () {
  const vid = document.getElementById('hero-bg-video');
  if (!vid) return;
  const START = 34;
  vid.addEventListener('loadedmetadata', function () {
    vid.currentTime = START;
    vid.play().catch(() => {});
  });
  vid.addEventListener('timeupdate', function () {
    if (vid.duration && vid.currentTime >= vid.duration - 0.15) {
      vid.currentTime = START;
    }
  });
})();

// ── Satellite section: shine sweeps across text in sync with video sun ──
(function () {
  const video  = document.querySelector('.space-compute-bg-video');
  const textEl = document.getElementById('space-compute-text');
  if (!video || !textEl) return;

  function update() {
    const half = video.duration ? video.duration / 2 : 1;
    const t    = video.currentTime;
    const progress = t <= half ? t / half : 1 - (t - half) / half;
    const peak = 57 + progress * 53;
    const c  = v => Math.min(100, v).toFixed(1);
    textEl.style.backgroundImage = `linear-gradient(to right,
      rgba(255,255,255,0.22)  0%,
      rgba(255,255,255,0.72) ${c(peak - 26)}%,
      rgba(255,255,255,1.00) ${c(peak)}%,
      rgba(255,255,255,0.72) ${c(peak + 20)}%,
      rgba(255,255,255,0.22) ${c(peak + 45)}%,
      rgba(255,255,255,0.22) 100%
    )`;
    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
})();
