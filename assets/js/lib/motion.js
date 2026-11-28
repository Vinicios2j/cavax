// Camada de movimento do site da CAVAX.
// Regras: só transform/opacity/clip-path; nada bloqueia leitura, scroll ou clique;
// tudo para fora da tela e em prefers-reduced-motion; sem dependências externas.
const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hasIO = 'IntersectionObserver' in window;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Revelação no scroll (elementos escolhidos, não a página toda) ---------- */
const REVEAL = '.reveal, .clip-reveal, [data-reveal]';
function inViewport(el) {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}
if (reduce || !hasIO) {
  document.querySelectorAll(REVEAL).forEach((el) => el.classList.add('visible'));
} else {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      io.unobserve(entry.target);
    }),
    { threshold: 0.18, rootMargin: '0px 0px -6% 0px' }
  );
  // O que já está na tela aparece de imediato: nada pisca nem some antes de revelar.
  document.querySelectorAll(REVEAL).forEach((el) => (inViewport(el) ? el.classList.add('visible') : io.observe(el)));
  root.classList.add('motion-ready');
}

/* Pausa animações contínuas de um bloco enquanto ele está fora da tela. */
function pauseOffscreen(el, onChange) {
  if (!hasIO || !el) return;
  new IntersectionObserver(([entry]) => {
    el.classList.toggle('is-offscreen', !entry.isIntersecting);
    onChange?.(entry.isIntersecting);
  }).observe(el);
}

/* ---------- Hero: montagem da cena 3D, parallax do ponteiro e do scroll ---------- */
const stage = document.querySelector('.hero-stage');
if (stage) {
  const hero = stage.closest('.hero');
  const rig = stage.querySelector('.rig');
  const painted = performance.getEntriesByType?.('paint').some((p) => p.name === 'first-contentful-paint');
  if (reduce || painted) {
    stage.dataset.scene = 'in';
  } else {
    stage.dataset.scene = 'pre';
    requestAnimationFrame(() => requestAnimationFrame(() => (stage.dataset.scene = 'in')));
  }

  if (!reduce) {
    const BASE_X = 57;
    const BASE_Z = -38;
    let tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, frame = 0, visible = true;
    const tick = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      rig.style.transform = `rotateX(${(BASE_X - cy * 7).toFixed(2)}deg) rotateZ(${(BASE_Z + cx * 9).toFixed(2)}deg)`;
      stage.style.transform = `translate3d(0, ${sy.toFixed(1)}px, 0)`;
      frame = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!frame && visible) frame = requestAnimationFrame(tick);
    };
    if (finePointer) {
      hero.addEventListener('pointermove', (e) => {
        tx = e.clientX / window.innerWidth - 0.5;
        ty = e.clientY / window.innerHeight - 0.5;
        kick();
      }, { passive: true });
      hero.addEventListener('pointerleave', () => {
        tx = 0;
        ty = 0;
        kick();
      });
    }
    // Parallax suave: a cena sobe mais devagar que o texto enquanto o hero sai da tela.
    window.addEventListener('scroll', () => {
      if (!visible) return;
      sy = clamp(window.scrollY * 0.12, 0, 120);
      kick();
      if (!frame) frame = requestAnimationFrame(tick);
    }, { passive: true });
    pauseOffscreen(stage, (on) => (visible = on));
  }
}

/* ---------- Tilt 3D discreto (ponteiro fino apenas) ---------- */
function bindTilt(el, max = 4) {
  if (el.dataset.tiltBound) return;
  el.dataset.tiltBound = '1';
  let tx = 0, ty = 0, cx = 0, cy = 0, frame = 0;
  const tick = () => {
    cx += (tx - cx) * 0.12;
    cy += (ty - cy) * 0.12;
    el.style.transform = `perspective(1100px) rotateX(${(-cy * max).toFixed(2)}deg) rotateY(${(cx * max).toFixed(2)}deg)`;
    if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) frame = requestAnimationFrame(tick);
    else {
      frame = 0;
      if (!tx && !ty) el.style.transform = '';
    }
  };
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2;
    ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2;
    if (!frame) frame = requestAnimationFrame(tick);
  });
  el.addEventListener('pointerleave', () => {
    tx = 0;
    ty = 0;
    if (!frame) frame = requestAnimationFrame(tick);
  });
}
if (finePointer && !reduce) {
  document.querySelectorAll('[data-tilt]').forEach((el) => bindTilt(el, Number(el.dataset.tilt) || 4));
  // Cartões montados depois pela API (portfólio): liga na primeira passagem do ponteiro.
  document.addEventListener('pointerover', (e) => {
    const card = e.target.closest?.('.portfolio-card');
    if (card) bindTilt(card, 3);
  });
}

/* ---------- Soluções: o diagrama muda de forma para explicar cada serviço ---------- */
const diagram = document.querySelector('.diagram');
const items = [...document.querySelectorAll('.sol-item')];
if (diagram && items.length) {
  const C = [240, 240];
  const SHAPES = {
    hub: [[240, 74], [406, 240], [240, 406], [74, 240]],
    flow: [[66, 240], [414, 104], [414, 240], [414, 376]],
    ring: [[112, 112], [368, 112], [368, 368], [112, 368]],
    shield: [[240, 58], [422, 240], [240, 422], [58, 240]]
  };
  // Todos os caminhos usam a mesma estrutura (M … C …) para que o navegador consiga interpolar.
  const curve = (shape, [x, y], i) => {
    if (shape === 'flow') {
      if (i === 0) return `M ${x} ${y} C ${x + 60} ${y}, ${C[0] - 60} ${C[1]}, ${C[0]} ${C[1]}`;
      return `M ${C[0]} ${C[1]} C ${C[0] + 90} ${C[1]}, ${x - 90} ${y}, ${x} ${y}`;
    }
    const mx = (C[0] + x) / 2;
    const my = (C[1] + y) / 2;
    return `M ${C[0]} ${C[1]} C ${mx} ${my}, ${mx} ${my}, ${x} ${y}`;
  };
  const nodes = [...diagram.querySelectorAll('.n')];
  const links = [...diagram.querySelectorAll('.link')];
  const flows = [...diagram.querySelectorAll('.flow')];
  const coreLabel = diagram.querySelector('.core-label');
  let active = null;
  let swapTimer = 0;

  const apply = (item) => {
    const shape = SHAPES[item.dataset.shape] ? item.dataset.shape : 'hub';
    const tags = [...item.querySelectorAll('.sol-tags li')].map((li) => li.textContent.trim());
    diagram.dataset.shape = shape;
    coreLabel.textContent = item.dataset.core || '';
    SHAPES[shape].forEach((point, i) => {
      const [x, y] = point;
      const g = nodes[i];
      g.style.transform = `translate(${x}px, ${y}px)`;
      const label = g.querySelector('text');
      label.textContent = tags[i] || '';
      const anchor = x < 150 ? 'start' : x > 330 ? 'end' : 'middle';
      label.setAttribute('text-anchor', anchor);
      label.setAttribute('x', anchor === 'start' ? -12 : anchor === 'end' ? 12 : 0);
      // Nós laterais levam o rótulo acima da linha para não cobrir o núcleo.
      label.setAttribute('y', y < 150 ? -18 : y > 330 ? 32 : anchor === 'middle' ? 32 : -46);
      const d = `path("${curve(shape, point, i)}")`;
      links[i].style.d = d;
      flows[i].style.d = d;
      // Navegadores sem suporte a "d" em CSS (Safari) recebem o atributo diretamente.
      if (!CSS.supports('d', 'path("M0 0")')) {
        links[i].setAttribute('d', curve(shape, point, i));
        flows[i].setAttribute('d', curve(shape, point, i));
      }
    });
  };

  const setActive = (item) => {
    if (item === active) return;
    active?.classList.remove('is-active');
    active = item;
    item.classList.add('is-active');
    if (reduce) return apply(item);
    clearTimeout(swapTimer);
    diagram.classList.add('is-swapping');
    swapTimer = setTimeout(() => {
      apply(item);
      diagram.classList.remove('is-swapping');
    }, 180);
  };

  apply(items[0]);
  active = items[0];
  items[0].classList.add('is-active');
  items.forEach((item) => {
    item.addEventListener('pointerenter', () => setActive(item));
    item.addEventListener('focusin', () => setActive(item));
  });
  // Ao rolar, o item que cruza o meio da tela comanda o diagrama.
  if (hasIO) {
    const mid = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setActive(entry.target)),
      { rootMargin: '-48% 0px -48% 0px' }
    );
    items.forEach((item) => mid.observe(item));
  }
  pauseOffscreen(diagram.closest('.solutions-diagram'));
}

// Diagramas estáticos (heróis das páginas de serviço): só pausam os pulsos fora da tela.
document.querySelectorAll('.service-diagram').forEach((el) => pauseOffscreen(el));

/* ---------- Manifesto: as palavras acendem conforme a leitura avança ---------- */
const manifesto = document.querySelector('.manifesto-section');
if (manifesto && !reduce && hasIO) {
  const words = [...manifesto.querySelectorAll('.w')];
  const outline = manifesto.querySelector('.manifesto-word');
  let on = false, frame = 0;
  const update = () => {
    frame = 0;
    const r = manifesto.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 quando o topo da seção entra pela base; 1 quando o centro passa de 45% da tela.
    const p = clamp((vh * 0.92 - r.top) / (vh * 0.92 - (vh * 0.45 - r.height / 2)), 0, 1);
    const lit = Math.round(p * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < lit));
    if (outline) outline.style.setProperty('--py', `${((r.top + r.height / 2 - vh / 2) * -0.12).toFixed(1)}px`);
  };
  const onScroll = () => {
    if (on && !frame) frame = requestAnimationFrame(update);
  };
  new IntersectionObserver(([entry]) => {
    on = entry.isIntersecting;
    if (on) onScroll();
  }).observe(manifesto);
  window.addEventListener('scroll', onScroll, { passive: true });
} else if (manifesto) {
  manifesto.querySelectorAll('.w').forEach((w) => w.classList.add('on'));
}
