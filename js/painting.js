/* ============================================================
   Single painting detail page (painting.html?id=…)
   - reads the painting by id (reuses PB.loadPaintings + local sample)
   - shows full image + title / medium / dimensions / year / price
   - NO checkout yet: sales are parked until a payment processor is
     chosen (see CLAUDE.md "Payment flows"). When that lands, the buy /
     inquire action goes in the .painting__actions slot below.
   shared data / i18n come from js/shared.js (window.PB)
   ============================================================ */

(() => {
  'use strict';

  const root = document.getElementById('painting');

  // page-specific strings (kept here so we don't touch the shared T object)
  const PT = {
    es: {
      back: '← Volver a la tienda',
      not_found: 'No encontramos esta obra.',
      not_found_cta: 'Ver todas las obras',
      year: 'Año',
      dims: 'Medidas',
      medium: 'Técnica',
      sold_note: 'Esta obra ya fue vendida.',
    },
    en: {
      back: '← Back to the shop',
      not_found: 'We couldn’t find this work.',
      not_found_cta: 'See all works',
      year: 'Year',
      dims: 'Size',
      medium: 'Medium',
      sold_note: 'This work has been sold.',
    },
  };
  const pt = (k) => (PT[PB.getLang()] || PT.es)[k];

  let painting = null;

  function getId() {
    return new URLSearchParams(location.search).get('id');
  }

  function renderNotFound() {
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = `
      <div class="painting__missing">
        <p>${PB.esc(pt('not_found'))}</p>
        <a class="btn-outline" href="shop.html">${PB.esc(pt('not_found_cta'))}</a>
      </div>`;
  }

  function render() {
    if (!painting) { renderNotFound(); return; }
    const p = painting;

    // keep the browser tab + (client-side) meta in sync
    document.title = `${PB.titleOf(p)} — Pablo Odriozola`;

    const sold = PB.isSold(p);
    const priceBlock = sold
      ? `<p class="painting__sold">${PB.esc(PB.t('sold'))}</p>
         <p class="painting__sold-note">${PB.esc(pt('sold_note'))}</p>`
      : `<p class="painting__price">${PB.esc(PB.priceOf(p))}</p>`;

    const specs = [
      p.medium_es || p.medium_en ? [pt('medium'), PB.mediumOf(p)] : null,
      PB.dimsOf(p) ? [pt('dims'), PB.dimsOf(p)] : null,
      p.year ? [pt('year'), p.year] : null,
    ].filter(Boolean)
      .map(([label, val]) => `
        <div class="painting__spec">
          <dt>${PB.esc(label)}</dt><dd>${PB.esc(val)}</dd>
        </div>`)
      .join('');

    root.setAttribute('aria-busy', 'false');
    root.style.setProperty('--glow', p.dominant_color || '#8a7a55');
    root.innerHTML = `
      <a class="painting__back" href="shop.html">${PB.esc(pt('back'))}</a>

      <div class="painting__layout">
        <figure class="painting__figure${sold ? ' is-sold' : ''}">
          ${sold ? `<span class="painting__tag">${PB.esc(PB.t('sold'))}</span>` : ''}
          <img class="painting__img"
               src="${PB.esc(p.image_url || '')}"
               srcset="${PB.esc(p.srcset || '')}"
               alt="${PB.esc(`${PB.titleOf(p)} — ${PB.mediumOf(p)}`.trim())}"
               decoding="async" />
        </figure>

        <aside class="painting__info">
          <h1 class="painting__title">${PB.esc(PB.titleOf(p))}</h1>
          <dl class="painting__specs">${specs}</dl>
          ${priceBlock}
          <!-- .painting__actions: buy / inquire button goes here once payments are decided -->
        </aside>
      </div>`;
  }

  /* ---------- init ---------- */
  (async function init() {
    const id = getId();
    if (!id) { renderNotFound(); PB.wireChrome(render); return; }
    const all = await PB.loadPaintings();
    painting = all.find((p) => String(p.id) === String(id)) || null;
    // wireChrome runs render() now and again whenever the language changes
    PB.wireChrome(render);
  })();
})();
