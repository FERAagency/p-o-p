/* ============================================================
   Contact page (contact.html)
   - validates name / email / message in the browser
   - POSTs to the Netlify Function at /api/contact
   - shared i18n / chrome come from js/shared.js (window.PB)
   The honeypot field ("company") must stay empty; bots fill it.
   ============================================================ */

(() => {
  'use strict';

  const form = document.getElementById('contact-form');
  if (!form) return;

  const nameEl = document.getElementById('cf-name');
  const emailEl = document.getElementById('cf-email');
  const messageEl = document.getElementById('cf-message');
  const companyEl = document.getElementById('cf-company');   // honeypot
  const submitEl = document.getElementById('cf-submit');
  const statusEl = document.getElementById('cf-status');

  const fields = [
    { el: nameEl, errId: 'cf-name-error', key: 'err_name', ok: (v) => v.trim().length > 0 },
    { el: emailEl, errId: 'cf-email-error', key: 'err_email', ok: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) },
    { el: messageEl, errId: 'cf-message-error', key: 'err_message', ok: (v) => v.trim().length > 0 },
  ];

  function showError(f, show) {
    const err = document.getElementById(f.errId);
    if (show) {
      err.textContent = PB.t(f.key);
      err.hidden = false;
      f.el.setAttribute('aria-invalid', 'true');
      f.el.setAttribute('aria-describedby', f.errId);
    } else {
      err.hidden = true;
      f.el.removeAttribute('aria-invalid');
      f.el.removeAttribute('aria-describedby');
    }
  }

  // Clear a field's error as soon as the visitor fixes it.
  fields.forEach((f) => {
    f.el.addEventListener('input', () => { if (f.ok(f.el.value)) showError(f, false); });
  });

  function setStatus(kind, msgKey) {
    statusEl.hidden = false;
    statusEl.className = 'contact__status is-' + kind;
    statusEl.textContent = PB.t(msgKey);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate; focus the first invalid field.
    let firstBad = null;
    fields.forEach((f) => {
      const valid = f.ok(f.el.value);
      showError(f, !valid);
      if (!valid && !firstBad) firstBad = f.el;
    });
    if (firstBad) { firstBad.focus(); return; }

    submitEl.disabled = true;
    const sendLabel = PB.t('contact_send');
    submitEl.textContent = PB.t('contact_sending');
    statusEl.hidden = true;

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameEl.value.trim(),
          email: emailEl.value.trim(),
          message: messageEl.value.trim(),
          company: companyEl ? companyEl.value : '',   // honeypot
          lang: PB.getLang(),
        }),
      });
      if (!res.ok) throw new Error('Request failed: ' + res.status);

      setStatus('success', 'contact_success');
      form.reset();
    } catch (err) {
      console.warn('[Pablo] contact submit failed:', err.message);
      setStatus('error', 'contact_error');
    } finally {
      submitEl.disabled = false;
      submitEl.textContent = sendLabel;
    }
  });

  // Wire nav + language toggle. Re-running render on language change keeps the
  // status message (if shown) and submit button label in the current language.
  PB.wireChrome(() => {
    submitEl.textContent = PB.t('contact_send');
    if (!statusEl.hidden) {
      const kind = statusEl.classList.contains('is-success') ? 'success' : 'error';
      setStatus(kind, kind === 'success' ? 'contact_success' : 'contact_error');
    }
  });
})();
