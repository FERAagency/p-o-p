/* ============================================================
   Shop page (shop.html)
   - filter sidebar (availability, orientation, price, year)
   - sort dropdown
   - structured catalogue grid with prices + SOLD
   shared data / i18n / lightbox come from js/shared.js (window.PB)
   ============================================================ */

(() => {
  'use strict';

  let paintings = [];
  let openLightbox = () => {};

  const state = { availability: 'all', orientation: 'all', price: 'all', year: 'all', sort: 'featured' };

  const sidebar = document.getElementById('shop-sidebar');
  const grid = document.getElementById('shop-grid');
  const emptyEl = document.getElementById('shop-empty');
  const countEl = document.getElementById('shop-count');
  const sortSel = document.getElementById('shop-sort');

  /* ---------- price ranges (round numbers, per displayed currency) ---------- */
  const PRICE_RANGES = {
    usd: [[0, 2000], [2000, 3000], [3000, 4000], [4000, Infinity]],
    ars: [[0, 2000000], [2000000, 3000000], [3000000, 4000000], [4000000, Infinity]],
  };
  const curKey = () => (PB.getLang() === 'en' ? 'usd' : 'ars');
  const displayPriceVal = (p) => (PB.getLang() === 'en'
    ? (p.price_usd ?? p.price_ars ?? 0)
    : (p.price_ars ?? p.price_usd ?? 0));
  function rangeLabel([lo, hi]) {
    const cur = curKey() === 'usd' ? 'USD' : 'ARS';
    const loc = curKey() === 'usd' ? 'en-US' : 'es-AR';
    if (lo === 0) return '< ' + PB.fmt(hi, cur, loc);
    if (hi === Infinity) return PB.fmt(lo, cur, loc) + ' +';
    return PB.fmt(lo, cur, loc) + ' – ' + PB.fmt(hi, cur, loc);
  }

  /* ---------- filtering + sorting ---------- */
  function passes(p) {
    if (state.availability === 'available' && PB.isSold(p)) return false;
    if (state.availability === 'sold' && !PB.isSold(p)) return false;
    if (state.orientation !== 'all' && PB.orientationOf(p) !== state.orientation) return false;
    if (state.year !== 'all' && String(p.year) !== String(state.year)) return false;
    if (state.price !== 'all') {
      const [lo, hi] = PRICE_RANGES[curKey()][state.price];
      const v = displayPriceVal(p);
      if (!(v >= lo && v < hi)) return false;
    }
    return true;
  }
  function sortList(list) {
    const arr = list.slice();
    switch (state.sort) {
      case 'price_asc':  arr.sort((a, b) => PB.priceValue(a) - PB.priceValue(b)); break;
      case 'price_desc': arr.sort((a, b) => PB.priceValue(b) - PB.priceValue(a)); break;
      case 'year_desc':  arr.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
      default: break; // featured = original order
    }
    return arr;
  }

  /* ---------- sidebar ---------- */
  function buildSidebar() {
    const years = [...new Set(paintings.map((p) => p.year).filter(Boolean))].sort((a, b) => b - a);
    const ranges = PRICE_RANGES[curKey()];

    const opt = (group, value, label) =>
      `<li><button type="button" class="filter__opt${state[group] === value ? ' is-active' : ''}"
        data-group="${group}" data-value="${value}">${PB.esc(label)}</button></li>`;

    const section = (key, titleKey, optionsHTML) => `
      <div class="filter" data-section="${key}">
        <button type="button" class="filter__head" aria-expanded="true">
          <span data-i18n="${titleKey}">${PB.t(titleKey)}</span>
          <svg class="filter__chevron" viewBox="0 0 24 24" width="16" height="16" fill="none"
               stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <ul class="filter__list">${optionsHTML}</ul>
      </div>`;

    sidebar.innerHTML = `
      <div class="filter__title" data-i18n="f_filters">${PB.t('f_filters')}</div>
      ${section('availability', 'f_availability',
        opt('availability', 'all', PB.t('f_all')) +
        opt('availability', 'available', PB.t('f_available')) +
        opt('availability', 'sold', PB.t('f_sold')))}
      ${section('orientation', 'f_orientation',
        opt('orientation', 'all', PB.t('f_all')) +
        opt('orientation', 'horizontal', PB.t('f_horizontal')) +
        opt('orientation', 'vertical', PB.t('f_vertical')) +
        opt('orientation', 'square', PB.t('f_square')))}
      ${section('price', 'f_price',
        opt('price', 'all', PB.t('f_all')) +
        ranges.map((r, i) => opt('price', String(i), rangeLabel(r))).join(''))}
      ${years.length ? section('year', 'f_year',
        opt('year', 'all', PB.t('f_all')) +
        years.map((y) => opt('year', String(y), String(y))).join('')) : ''}
      <button type="button" class="filter__clear" id="filter-clear" data-i18n="f_clear">${PB.t('f_clear')}</button>
    `;

    // option clicks
    sidebar.querySelectorAll('.filter__opt').forEach((b) => {
      b.addEventListener('click', () => {
        const { group, value } = b.dataset;
        state[group] = group === 'price' && value !== 'all' ? Number(value) : value;
        sidebar.querySelectorAll(`.filter__opt[data-group="${group}"]`)
          .forEach((o) => o.classList.toggle('is-active', o === b));
        renderGrid();
      });
    });
    // accordion heads
    sidebar.querySelectorAll('.filter__head').forEach((h) => {
      h.addEventListener('click', () => {
        const sec = h.closest('.filter');
        const collapsed = sec.classList.toggle('is-collapsed');
        h.setAttribute('aria-expanded', String(!collapsed));
      });
    });
    // clear
    sidebar.querySelector('#filter-clear')?.addEventListener('click', () => {
      Object.assign(state, { availability: 'all', orientation: 'all', price: 'all', year: 'all' });
      buildSidebar();
      renderGrid();
    });
  }

  /* ---------- grid ---------- */
  function renderGrid() {
    if (!grid) return;
    const list = sortList(paintings.filter(passes));

    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = '';
    countEl.textContent = `${list.length} ${list.length === 1 ? PB.t('count_one') : PB.t('count_many')}`;

    if (!list.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;

    list.forEach((p) => grid.appendChild(buildCard(p)));
    observeReveal();
  }

  function buildCard(p) {
    const card = document.createElement('article');
    card.className = 'shop-card' + (PB.isSold(p) ? ' is-sold' : '');
    if (p.dominant_color) card.style.setProperty('--glow', p.dominant_color);
    if (p.width_cm && p.height_cm) card.style.setProperty('--ar', `${+p.width_cm} / ${+p.height_cm}`);

    const link = document.createElement('a');
    link.className = 'shop-card__link';
    link.href = `painting.html?id=${encodeURIComponent(p.id)}`;
    link.addEventListener('click', (e) => { e.preventDefault(); openLightbox(p, img); });

    const media = document.createElement('div');
    media.className = 'shop-card__media';
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
    link.appendChild(media);

    const meta = document.createElement('div');
    meta.className = 'shop-card__meta';
    const priceLine = PB.isSold(p)
      ? `${PB.esc(PB.mediumOf(p))} — <span class="sold">${PB.t('sold')}</span>`
      : `${PB.esc(PB.mediumOf(p))} — ${PB.esc(PB.priceOf(p))}`;
    meta.innerHTML = `
      <h3 class="shop-card__title">${PB.esc(PB.titleOf(p))}</h3>
      <p class="shop-card__dims">${PB.esc([PB.dimsOf(p), p.year].filter(Boolean).join(' · '))}</p>
      <p class="shop-card__price">${priceLine}</p>`;

    card.appendChild(link);
    card.appendChild(meta);
    return card;
  }

  /* ---------- reveal ---------- */
  let revealObs;
  function observeReveal() {
    if (PB.prefersReduced) {
      grid.querySelectorAll('.shop-card').forEach((c) => c.classList.add('is-visible'));
      return;
    }
    revealObs ||= new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObs.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    grid.querySelectorAll('.shop-card:not(.is-visible)').forEach((c) => revealObs.observe(c));
  }

  /* ---------- when language changes, rebuild sidebar (labels/currency) + grid ---------- */
  function rerenderAll() { buildSidebar(); renderGrid(); }

  sortSel.addEventListener('change', () => { state.sort = sortSel.value; renderGrid(); });

  /* ---------- init ---------- */
  (async function init() {
    grid?.setAttribute('aria-busy', 'true');
    openLightbox = PB.initLightbox();
    paintings = await PB.loadPaintings();
    PB.wireChrome(rerenderAll);  // wires nav + language; runs rerenderAll()
  })();
})();
