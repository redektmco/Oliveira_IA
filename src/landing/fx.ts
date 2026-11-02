import Lenis from 'lenis';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export type Fx = { scrollTo: (target: string | number) => void; lock: (on: boolean) => void; destroy: () => void };

/** Motion engine da landing: scroll suave, reveals, parallax, cursor, botões magnéticos, contadores. */
export function startFx(root: HTMLElement): Fx {
  const cleanups: (() => void)[] = [];
  const isReduced = reduced();
  document.documentElement.classList.add('lp-on');
  cleanups.push(() => document.documentElement.classList.remove('lp-on'));

  // ---------- scroll suave
  let lenis: Lenis | null = null;
  let velocity = 0;
  if (!isReduced) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
    lenis.on('scroll', (e: { velocity: number }) => { velocity = e.velocity; });
  }

  // ---------- reveals
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        if ((e.target as HTMLElement).dataset.count) countUp(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  root.querySelectorAll('[data-reveal],[data-count]').forEach((el) => io.observe(el));
  cleanups.push(() => io.disconnect());

  function countUp(el: HTMLElement) {
    const target = Number(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    if (isReduced) { el.textContent = `${prefix}${target}${suffix}`; return; }
    const t0 = performance.now(), dur = 1700;
    const tick = (t: number) => {
      const p = clamp((t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- scroll-linked
  const bar = root.querySelector<HTMLElement>('[data-progress]');
  const nav = root.querySelector<HTMLElement>('[data-nav]');
  const parallax = [...root.querySelectorAll<HTMLElement>('[data-parallax]')];
  const fills = [...root.querySelectorAll<HTMLElement>('[data-fill]')].map((el) => ({ el, words: [...el.querySelectorAll<HTMLElement>('.fw')] }));
  const stages = [...root.querySelectorAll<HTMLElement>('[data-stage]')];
  const lines = [...root.querySelectorAll<HTMLElement>('[data-line]')];
  const marquees = [...root.querySelectorAll<HTMLElement>('[data-marquee]')];
  const hscroll = [...root.querySelectorAll<HTMLElement>('[data-hscroll]')];
  let lastY = window.scrollY, navHidden = false, mx = 0, my = 0, marqueePos = new Map<HTMLElement, number>();

  let raf = 0;
  const frame = (time: number) => {
    lenis?.raf(time);
    const y = window.scrollY, vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (nav) {
      nav.classList.toggle('scrolled', y > 40);
      const hide = y > lastY && y > 300;
      if (hide !== navHidden && Math.abs(y - lastY) > 4) { navHidden = hide; nav.classList.toggle('hide', hide); }
    }
    lastY = y;

    if (!isReduced) {
      for (const el of parallax) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const speed = Number(el.dataset.parallax);
        el.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * speed).toFixed(1)}px`);
      }
      for (const { el, words } of fills) {
        const r = el.getBoundingClientRect();
        const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.35));
        const n = p * words.length;
        words.forEach((w, i) => w.style.setProperty('--o', String(clamp(n - i + 0.4, 0.14, 1).toFixed(2))));
      }
      for (const el of stages) {
        const r = el.getBoundingClientRect();
        const p = clamp((vh - r.top) / (vh * 0.9));
        el.style.setProperty('--sp', p.toFixed(3));
      }
      for (const el of lines) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--lp', clamp((vh * 0.75 - r.top) / r.height).toFixed(3));
      }
      for (const el of hscroll) {
        const r = el.getBoundingClientRect();
        const track = el.querySelector<HTMLElement>('[data-track]');
        if (!track) continue;
        const dist = track.scrollWidth - el.clientWidth;
        const p = clamp(-r.top / (r.height - vh));
        el.style.setProperty('--hp', p.toFixed(3));
        if (dist > 0 && window.innerWidth > 900) track.style.transform = `translate3d(${(-dist * p).toFixed(1)}px,0,0)`;
        else track.style.transform = '';
      }
      for (const el of marquees) {
        const inner = el.firstElementChild as HTMLElement | null;
        if (!inner) continue;
        const dir = el.dataset.marquee === 'rev' ? -1 : 1;
        let pos = marqueePos.get(el) || 0;
        pos -= dir * (0.6 + Math.min(Math.abs(velocity), 40) * 0.35);
        const half = inner.scrollWidth / 2;
        if (half > 0) { if (pos <= -half) pos += half; if (pos > 0) pos -= half; }
        marqueePos.set(el, pos);
        inner.style.translate = `${pos.toFixed(1)}px 0`;
      }
      root.style.setProperty('--skew', `${clamp(velocity * -0.12, -4, 4).toFixed(2)}deg`);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  cleanups.push(() => { cancelAnimationFrame(raf); lenis?.destroy(); });

  // ---------- cursor, tilt, magnetic, spotlight (só com mouse)
  if (fine() && !isReduced) {
    const cur = root.querySelector<HTMLElement>('[data-cursor]');
    const label = cur?.querySelector<HTMLElement>('span');
    let cx = 0, cy = 0, tx = 0, ty = 0, craf = 0;
    const loop = () => {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      if (cur) cur.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      craf = requestAnimationFrame(loop);
    };
    craf = requestAnimationFrame(loop);
    cleanups.push(() => cancelAnimationFrame(craf));

    const move = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      mx = (e.clientX / window.innerWidth - 0.5) * 2; my = (e.clientY / window.innerHeight - 0.5) * 2;
      root.style.setProperty('--mx', mx.toFixed(3)); root.style.setProperty('--my', my.toFixed(3));
      root.style.setProperty('--gx', `${e.clientX}px`); root.style.setProperty('--gy', `${e.clientY}px`);
      cur?.classList.toggle('show', root.contains(e.target as Node));
      const t = (e.target as HTMLElement).closest<HTMLElement>('a,button,[data-hover],[data-cursor-label]');
      const lbl = t?.closest<HTMLElement>('[data-cursor-label]')?.dataset.cursorLabel || '';
      cur?.classList.toggle('big', Boolean(t));
      cur?.classList.toggle('label', Boolean(lbl));
      if (label) label.textContent = lbl;

      // spotlight dos cards
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--sx', `${e.clientX - r.left}px`);
        card.style.setProperty('--sy', `${e.clientY - r.top}px`);
      }
      // tilt
      for (const s of root.querySelectorAll<HTMLElement>('[data-tilt]')) {
        const r = s.getBoundingClientRect();
        if (e.clientY < r.top - 100 || e.clientY > r.bottom + 100) { s.style.setProperty('--tx', '0'); s.style.setProperty('--ty', '0'); continue; }
        s.style.setProperty('--tx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
        s.style.setProperty('--ty', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
      }
    };
    const leave = () => cur?.classList.remove('show');
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    cleanups.push(() => { window.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); });

    // magnéticos
    for (const el of root.querySelectorAll<HTMLElement>('[data-magnetic]')) {
      const strength = Number(el.dataset.magnetic) || 0.35;
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mgx', `${((e.clientX - (r.left + r.width / 2)) * strength).toFixed(1)}px`);
        el.style.setProperty('--mgy', `${((e.clientY - (r.top + r.height / 2)) * strength).toFixed(1)}px`);
      };
      const onLeave = () => { el.style.setProperty('--mgx', '0px'); el.style.setProperty('--mgy', '0px'); };
      el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave);
      cleanups.push(() => { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); });
    }
  }

  return {
    lock: (on) => { if (on) lenis?.stop(); else lenis?.start(); },
    scrollTo: (target) => {
      if (lenis) lenis.scrollTo(target as never, { offset: -70, duration: 1.4 });
      else if (typeof target === 'string') document.querySelector(target)?.scrollIntoView({ behavior: 'auto' });
      else window.scrollTo(0, target);
    },
    destroy: () => cleanups.forEach((fn) => fn()),
  };
}
