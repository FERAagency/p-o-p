/* ============================================================
   Pablo Odriozola — shared site code (used by every page)
   Exposes one global: window.PB
   - prefersReduced / isMobile flags
   - translations (T) + language state (localStorage)
   - data layer: loadPaintings() with a local sample fallback
   - formatting helpers (title/medium/price/dims…)
   - wireChrome(): language toggle, mobile menu, footer year, i18n
   - initLightbox(): the click-to-expand viewer (View Transitions)
   ============================================================ */

window.PB = (() => {
  'use strict';

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(max-width: 760px)').matches;

  /* ---------- Translations ---------- */
  const T = {
    es: {
      tagline: 'Pintura al óleo',
      nav_shop: 'Tienda de arte', nav_about: 'Sobre',
      nav_exhibitions: 'Exposiciones', nav_contact: 'Contacto',
      skip_to_gallery: 'Saltar a la galería',
      gallery_title: 'La obra',
      gallery_statement: 'Óleo sobre tela. Cada pieza es única.',
      gallery_empty: 'Pronto habrá obra disponible.',
      view_shop: 'Ver la tienda de arte',
      nav_works: 'La obra',
      sold: 'Vendido',
      // shop page
      shop_title: 'Tienda de arte',
      shop_intro: 'Obra original al óleo sobre tela. Cada pieza es única; una vez vendida, no se repite.',
      f_filters: 'Filtros',
      f_availability: 'Disponibilidad', f_available: 'Disponible', f_sold: 'Vendido',
      f_orientation: 'Orientación', f_horizontal: 'Horizontal', f_vertical: 'Vertical', f_square: 'Cuadrado',
      f_price: 'Precio', f_year: 'Año', f_all: 'Todo', f_clear: 'Limpiar filtros',
      sort_label: 'Ordenar',
      sort_featured: 'Destacado', sort_price_asc: 'Precio: menor a mayor',
      sort_price_desc: 'Precio: mayor a menor', sort_year_desc: 'Año: más reciente',
      count_one: 'obra', count_many: 'obras',
      // contact page
      skip_to_contact: 'Saltar al formulario',
      contact_title: 'Contacto',
      contact_intro: '¿Una consulta sobre una obra, un encargo o un envío? Escribime y te respondo a la brevedad.',
      f_name: 'Nombre', f_email: 'Email', f_message: 'Mensaje',
      contact_send: 'Enviar', contact_sending: 'Enviando…',
      contact_success: 'Gracias, recibí tu mensaje. Te respondo pronto.',
      contact_error: 'No se pudo enviar. Probá de nuevo o escribí directamente por email.',
      err_name: 'Ingresá tu nombre.',
      err_email: 'Ingresá un email válido.',
      err_message: 'Escribí un mensaje.',
      // static pages
      skip_to_content: 'Saltar al contenido',
      about_title: 'Sobre el artista',
      cv_title: 'Exposiciones y CV',
      nav_privacy: 'Privacidad',
      nav_terms: 'Términos',
    },
    en: {
      tagline: 'Oil painting',
      nav_shop: 'Shop Art', nav_about: 'About',
      nav_exhibitions: 'Exhibitions', nav_contact: 'Contact',
      skip_to_gallery: 'Skip to gallery',
      gallery_title: 'The work',
      gallery_statement: 'Oil on canvas. Each piece is one of a kind.',
      gallery_empty: 'Work will be available soon.',
      view_shop: 'Shop art',
      nav_works: 'The work',
      sold: 'Sold',
      // shop page
      shop_title: 'Shop Art',
      shop_intro: 'Original oil on canvas. Each piece is one of a kind; once sold, it is gone.',
      f_filters: 'Filters',
      f_availability: 'Availability', f_available: 'Available', f_sold: 'Sold',
      f_orientation: 'Orientation', f_horizontal: 'Horizontal', f_vertical: 'Vertical', f_square: 'Square',
      f_price: 'Price', f_year: 'Year', f_all: 'All', f_clear: 'Clear filters',
      sort_label: 'Sort',
      sort_featured: 'Featured', sort_price_asc: 'Price: low to high',
      sort_price_desc: 'Price: high to low', sort_year_desc: 'Year: newest',
      count_one: 'work', count_many: 'works',
      // contact page
      skip_to_contact: 'Skip to the form',
      contact_title: 'Contact',
      contact_intro: 'A question about a painting, a commission, or shipping? Send a note and I’ll get back to you shortly.',
      f_name: 'Name', f_email: 'Email', f_message: 'Message',
      contact_send: 'Send', contact_sending: 'Sending…',
      contact_success: 'Thanks — your message came through. I’ll reply soon.',
      contact_error: 'Couldn’t send. Please try again, or email me directly.',
      err_name: 'Please enter your name.',
      err_email: 'Please enter a valid email.',
      err_message: 'Please write a message.',
      // static pages
      skip_to_content: 'Skip to content',
      about_title: 'About the artist',
      cv_title: 'Exhibitions & CV',
      nav_privacy: 'Privacy',
      nav_terms: 'Terms',
    },
  };

  let lang = localStorage.getItem('lang') || 'es';
  const t = (k) => (T[lang] && T[lang][k]) || k;
  const getLang = () => lang;

  /* ---------- Formatting helpers ---------- */
  const titleOf  = (p) => (lang === 'es' ? p.title_es : p.title_en) || p.title_es || p.title_en || 'Untitled';
  const mediumOf = (p) => (lang === 'es' ? p.medium_es : p.medium_en) || '';
  const isSold   = (p) => p.status === 'sold';

  function fmt(amount, currency, locale) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  }
  function priceOf(p) {
    const { price_usd: usd, price_ars: ars } = p;
    // Distinguish currencies the way the admin does: USD as "US$", pesos as "$"
    // (both currencies otherwise render with a bare "$" and become ambiguous).
    const usdStr = usd != null ? 'US$' + Number(usd).toLocaleString('en-US') : '';
    const arsStr = ars != null ? 'ARS ' + Number(ars).toLocaleString('es-AR') : '';
    // Show both when available, ordered by active language
    // (ES → pesos first, EN → USD first). Falls back to whichever exists.
    const parts = lang === 'en' ? [usdStr, arsStr] : [arsStr, usdStr];
    return parts.filter(Boolean).join(' · ');
  }
  // a stable USD number for sorting/filtering regardless of language
  const priceValue = (p) => (p.price_usd != null ? +p.price_usd : (p.price_ars != null ? +p.price_ars : 0));

  function dimsOf(p) {
    return (p.width_cm && p.height_cm) ? `${+p.width_cm} × ${+p.height_cm} cm` : '';
  }
  function orientationOf(p) {
    if (!p.width_cm || !p.height_cm) return null;
    const r = +p.width_cm / +p.height_cm;
    if (r > 1.1) return 'horizontal';
    if (r < 0.9) return 'vertical';
    return 'square';
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ---------- Data ---------- */
  async function loadPaintings() {
    const cfg = window.PABLO_CONFIG || {};
    try {
      if (window.supabase && cfg.SUPABASE_URL) {
        const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        const { data, error } = await client
          .from('paintings').select('*')
          .neq('status', 'draft')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (data && data.length) return data;
      }
    } catch (err) {
      console.warn('[Pablo] Supabase fetch failed, using local sample:', err.message);
    }
    return SAMPLE;
  }

  /* ---------- Language + chrome wiring ---------- */
  let pageRender = null;
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      if (T[lang][k]) el.textContent = T[lang][k];
    });
    // Long-form bilingual content blocks (About / Exhibitions): show only the
    // block for the current language. The language-toggle buttons also carry
    // data-lang, so they're excluded here.
    document.querySelectorAll('[data-lang]:not(.lang-toggle__btn)').forEach((el) => {
      el.hidden = el.getAttribute('data-lang') !== lang;
    });
    document.querySelectorAll('.lang-toggle__btn').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.lang === lang));
    if (pageRender) pageRender();
  }
  function setLang(next) {
    if (next === lang) return;
    lang = next;
    localStorage.setItem('lang', lang);
    applyI18n();
  }

  // Wire nav/footer behaviours common to every page. `renderCb` re-renders
  // the page's dynamic content when the language changes.
  function wireChrome(renderCb) {
    pageRender = renderCb || null;

    document.querySelectorAll('.lang-toggle__btn').forEach((b) =>
      b.addEventListener('click', () => setLang(b.dataset.lang)));

    const menuToggle = document.getElementById('menu-toggle');
    const navLinks = document.getElementById('nav-links');
    menuToggle?.addEventListener('click', () => {
      const open = navLinks.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(open));
    });
    navLinks?.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('is-open');
        menuToggle?.setAttribute('aria-expanded', 'false');
      }
    });

    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    applyI18n();
  }

  /* ---------- Lightbox (shared by home + shop) ---------- */
  function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return () => {};
    const lbImg = document.getElementById('lightbox-img');
    const lbCaption = document.getElementById('lightbox-caption');
    const lbClose = document.getElementById('lightbox-close');
    const lbBackdrop = document.getElementById('lightbox-backdrop');
    const supportsVT = !!document.startViewTransition && !prefersReduced;
    let lastFocus = null;

    function fill(p) {
      lbImg.src = p.image_url || '';
      lbImg.alt = `${titleOf(p)} — ${mediumOf(p)}`.trim();
      const price = isSold(p)
        ? `<span class="lb-price is-sold">${t('sold')}</span>`
        : `<span class="lb-price">${esc(priceOf(p))}</span>`;
      lbCaption.innerHTML = `
        <div class="lb-title">${esc(titleOf(p))}</div>
        <div class="lb-sub">${esc([mediumOf(p), dimsOf(p), p.year].filter(Boolean).join(' · '))}</div>
        ${price}`;
    }
    function reveal() {
      lightbox.hidden = false;
      requestAnimationFrame(() => lightbox.classList.add('is-open'));
      document.body.style.overflow = 'hidden';
      lbClose.focus();
    }
    function open(p, sourceImg) {
      lastFocus = document.activeElement;
      fill(p);
      if (supportsVT && sourceImg) {
        sourceImg.style.viewTransitionName = 'lb';
        const vt = document.startViewTransition(() => {
          sourceImg.style.viewTransitionName = '';
          reveal();
          lbImg.style.viewTransitionName = 'lb';
        });
        vt.finished.finally(() => { lbImg.style.viewTransitionName = ''; });
      } else { reveal(); }
    }
    function close() {
      const done = () => {
        lightbox.classList.remove('is-open');
        lightbox.hidden = true;
        document.body.style.overflow = '';
        lbImg.style.viewTransitionName = '';
        lastFocus?.focus?.();
      };
      if (supportsVT) {
        lbImg.style.viewTransitionName = 'lb';
        const vt = document.startViewTransition(() => { done(); });
        vt.finished.finally(() => { lbImg.style.viewTransitionName = ''; });
      } else { done(); }
    }
    lbClose.addEventListener('click', close);
    lbBackdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) close();
    });
    return open;
  }

  /* ============================================================
     LOCAL SAMPLE DATA — dev-only preview fallback.
     Used only when Supabase returns no rows. Images come from the
     gitignored pic/ folder, so this previews locally but never ships.
     ============================================================ */
  function s(es, en, year, w, h, usd, ars, color, file, status = 'available') {
    return {
      id: file.replace(/\W+/g, '-').toLowerCase(),
      title_es: es, title_en: en, year,
      medium_es: 'Óleo sobre tela', medium_en: 'Oil on canvas',
      width_cm: w, height_cm: h, price_usd: usd, price_ars: ars,
      status, dominant_color: color, category: null, sort_order: 0,
      image_url: 'pic/' + encodeURIComponent(file),
    };
  }
  const SAMPLE = [
    s('Dónde', 'Where', 2021, 80, 100, 3200, 2900000, '#7a6a3c', 'Donde.png'),
    s('Ese lugar', 'That place', 2020, 90, 70, 2800, 2500000, '#5f5a46', 'Ese Lugai.png'),
    s('Hay algo', 'There is something', 2021, 100, 80, 3600, 3200000, '#6a6253', 'Hay Algo.png'),
    s('Pompeya', 'Pompeii', 2019, 70, 90, 2600, 2300000, '#7a5a2e', 'Pompeio.png'),
    s('Retumbo', 'Rumble', 2022, 120, 90, 4200, 3800000, '#9b6a3c', 'Retumbo.png'),
    s('Sí', 'Yes', 2020, 60, 60, 1900, 1700000, '#6e5f57', 'Si.png', 'sold'),
    s('Sudeste', 'Southeast', 2021, 100, 75, 3100, 2800000, '#8a7a55', 'Sudeste.png'),
    s('Te encuentro', 'I find you', 2022, 85, 110, 3400, 3050000, '#6a5952', 'Te Encuentio.png'),
  ];

  return {
    prefersReduced, isMobile, T, t, getLang, setLang,
    titleOf, mediumOf, priceOf, priceValue, dimsOf, orientationOf, isSold, fmt, esc,
    loadPaintings, wireChrome, applyI18n, initLightbox,
  };
})();
