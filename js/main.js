/* ============================================================
   Home page (index.html)
   - hero "Ken Burns" glide is pure CSS (see .hero__media)
   - shows a small FEATURED preview of paintings, linking to shop.html
   - shared data / i18n / lightbox come from js/shared.js (window.PB)
   ============================================================ */

(() => {
  'use strict';
  const FEATURED_COUNT = 6;
  // Fixed landing/hero image. When set, it wins over the first painting.
  // Served from Supabase Storage (paintings bucket).
  const HERO_IMAGE = 'https://qolptrdezliegxpyieoy.supabase.co/storage/v1/object/public/paintings/Avenidas_cercanas_200x200cm_acrilico.webp';

  let paintings = [];
  let openLightbox = () => {};

  const grid = document.getElementById('gallery-grid');
  const emptyEl = document.getElementById('gallery-empty');

  /* ---------- render the featured preview ---------- */
  function render() {
    if (!grid) return;
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = '';

    const list = paintings.slice(0, FEATURED_COUNT);
    if (!list.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;

    list.forEach((p, i) => grid.appendChild(buildCard(p, i)));
    observeReveal();
  }

  function buildCard(p, i) {
    const card = document.createElement('article');
    card.className = 'card' + (PB.isSold(p) ? ' is-sold' : '');
    if (p.dominant_color) card.style.setProperty('--glow', p.dominant_color);
    if (p.width_cm && p.height_cm) card.style.setProperty('--ar', `${+p.width_cm} / ${+p.height_cm}`);

    const link = document.createElement('a');
    link.className = 'card__link';
    link.href = `painting.html?id=${encodeURIComponent(p.id)}`;

    const inner = document.createElement('div');
    inner.className = 'card__inner';
    if (!PB.prefersReduced) inner.style.setProperty('--float-delay', `${(i % 5) * -1.3}s`);

    const media = document.createElement('div');
    media.className = 'card__media';
    if (PB.isSold(p)) {
      const tag = document.createElement('span');
      tag.className = 'card__sold';
      tag.textContent = PB.t('sold');
      media.appendChild(tag);
    }

    const img = document.createElement('img');
    img.alt = `${PB.titleOf(p)} — ${PB.mediumOf(p)}`.trim();
    img.loading = 'lazy';
    img.decoding = 'async';
    if (p.srcset) img.srcset = p.srcset;
    img.src = p.image_url || '';
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    if (img.complete) img.classList.add('is-loaded');
    media.appendChild(img);

    // Click expands into the lightbox; the href stays for new-tab / SEO.
    link.addEventListener('click', (e) => { e.preventDefault(); openLightbox(p, img); });

    const meta = document.createElement('div');
    meta.className = 'card__meta';
    // Home keeps a gallery feel: no price on the cards (prices live in the
    // shop + painting detail). Only the SOLD status is shown, like a label.
    meta.innerHTML = `
      <h3 class="card__title">${PB.esc(PB.titleOf(p))}</h3>
      <p class="card__sub">${PB.esc([PB.mediumOf(p), p.year].filter(Boolean).join(' · '))}</p>
      ${PB.isSold(p) ? `<p class="card__price is-sold">${PB.t('sold')}</p>` : ''}`;

    inner.appendChild(media);
    link.appendChild(inner);
    card.appendChild(link);
    card.appendChild(meta);
    return card;
  }

  /* ---------- scroll reveal ---------- */
  let revealObs;
  function observeReveal() {
    if (PB.prefersReduced) {
      grid.querySelectorAll('.card').forEach((c) => c.classList.add('is-visible'));
      return;
    }
    revealObs ||= new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObs.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    grid.querySelectorAll('.card:not(.is-visible)').forEach((c) => revealObs.observe(c));
  }

  /* ---------- hero image ---------- */
  function setHero() {
    const heroMedia = document.getElementById('hero-media');
    if (!heroMedia) return;
    if (HERO_IMAGE) { heroMedia.style.backgroundImage = `url("${HERO_IMAGE}")`; return; }
    if (!paintings.length) return;
    const hero = paintings.find((p) => p.image_url) || paintings[0];
    if (hero?.image_url) heroMedia.style.backgroundImage = `url("${hero.image_url}")`;
  }

  /* ---------- nav: solidify after the hero ---------- */
  const header = document.getElementById('site-header');
  const onScroll = () => header.classList.toggle('is-solid', window.scrollY > window.innerHeight * 0.6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Lenis smooth scroll (no hero transform — that's CSS) ---------- */
  function initSmoothScroll() {
    if (PB.prefersReduced || PB.isMobile || !window.Lenis) return;
    const lenis = new window.Lenis({ lerp: 0.1 });
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  /* ---------- init ---------- */
  (async function init() {
    grid?.setAttribute('aria-busy', 'true');
    openLightbox = PB.initLightbox();
    paintings = await PB.loadPaintings();
    setHero();
    PB.wireChrome(render);   // wires nav + language, runs render()
    initSmoothScroll();
  })();
})();
