/* ============================================================
   Pablo Odriozola — admin panel logic
   Auth:  Supabase Auth (one login for Pablo). The logged-in user's
          JWT authorises every read/write via RLS — no service-role
          key in the browser.
   Does:  list all paintings (incl. drafts), add / edit / delete,
          set status, drag-to-reorder, upload images straight to
          Supabase Storage (downscaled + WebP), compute dominant_color.
   ============================================================ */

(() => {
  'use strict';

  const cfg = window.PABLO_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">Falta configuración de Supabase (js/config.js).</p>';
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const BUCKET = 'paintings';
  const MAX_EDGE = 2000;          // px — longest side after downscale
  const WEBP_QUALITY = 0.85;
  // Minimum pixel "spread" a processed image must have. A real painting varies
  // a lot pixel-to-pixel (spread ~30+); a near-zero spread means the browser
  // neutered the <canvas> (privacy / "resist fingerprinting"), so the upload
  // would be a blank colour block. Below this we refuse the image.
  const MIN_IMAGE_SPREAD = 4;

  /* ---------- element refs ---------- */
  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const adminView = $('admin-view');
  const loginForm = $('login-form');
  const loginError = $('login-error');
  const loginBtn = $('login-btn');
  const listEl = $('paint-list');
  const listStatus = $('list-status');
  const countEl = $('paint-count');
  const userEl = $('admin-user');

  const modal = $('edit-modal');
  const form = $('paint-form');
  const modalTitle = $('modal-title');
  const formError = $('form-error');
  const saveBtn = $('save-btn');
  const deleteBtn = $('delete-btn');
  const imgInput = $('f-image');
  const imgPreview = $('img-preview');
  const imgNote = $('img-note');

  const FIELDS = ['title_es', 'title_en', 'medium_es', 'medium_en',
    'width_cm', 'height_cm', 'year', 'price_usd', 'price_ars', 'status', 'category'];

  let paintings = [];
  let pendingImage = null;   // { blob, dominant_color, previewUrl } or null
  let editingId = null;      // null = adding new

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const STATUS_LABEL = { draft: 'Borrador', available: 'Disponible', reserved: 'Reservado', sold: 'Vendido' };

  function priceLabel(p) {
    const parts = [];
    if (p.price_usd != null && p.price_usd !== '') parts.push('US$' + Number(p.price_usd).toLocaleString('en-US'));
    if (p.price_ars != null && p.price_ars !== '') parts.push('$' + Number(p.price_ars).toLocaleString('es-AR'));
    return parts.join(' · ') || '—';
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  /* ============================================================
     AUTH
     ============================================================ */
  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    session ? enterAdmin(session) : showLogin();

    sb.auth.onAuthStateChange((_event, sess) => {
      if (!sess) showLogin();
    });
  }

  function showLogin() {
    adminView.hidden = true;
    loginView.hidden = false;
  }

  async function enterAdmin(session) {
    loginView.hidden = true;
    adminView.hidden = false;
    userEl.textContent = session.user?.email || '';
    await loadList();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(loginError, '');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando…';
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';
    if (error) { showError(loginError, 'No se pudo iniciar sesión. Revisá email y contraseña.'); return; }
    enterAdmin(data.session);
  });

  $('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    showLogin();
  });

  /* ============================================================
     CHANGE PASSWORD
     ============================================================ */
  const pwModal = $('password-modal');
  const pwForm = $('password-form');
  const pwError = $('pw-error');
  const pwSuccess = $('pw-success');
  const pwSave = $('pw-save');

  function openPwModal() {
    pwForm.reset();
    showError(pwError, '');
    pwSuccess.hidden = true;
    pwModal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('pw-current').focus();
  }
  function closePwModal() {
    pwModal.hidden = true;
    document.body.style.overflow = '';
  }

  $('password-btn').addEventListener('click', openPwModal);
  $('pw-close').addEventListener('click', closePwModal);
  $('pw-cancel').addEventListener('click', closePwModal);
  $('pw-backdrop').addEventListener('click', closePwModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pwModal.hidden) closePwModal(); });

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(pwError, '');
    pwSuccess.hidden = true;

    const current = $('pw-current').value;
    const next = $('pw-new').value;
    const confirm = $('pw-confirm').value;

    if (next.length < 8) { showError(pwError, 'La contraseña nueva debe tener al menos 8 caracteres.'); return; }
    if (next !== confirm) { showError(pwError, 'Las contraseñas nuevas no coinciden.'); return; }

    const { data: { session } } = await sb.auth.getSession();
    const email = session?.user?.email;
    if (!email) { showError(pwError, 'Tu sesión expiró. Iniciá sesión de nuevo.'); return; }
    if (current === next) { showError(pwError, 'La contraseña nueva debe ser distinta de la actual.'); return; }

    pwSave.disabled = true;
    pwSave.textContent = 'Guardando…';
    try {
      // Re-authenticate first: confirm the person knows the current password
      // before letting an open session change it.
      const { error: authErr } = await sb.auth.signInWithPassword({ email, password: current });
      if (authErr) { showError(pwError, 'La contraseña actual no es correcta.'); return; }

      const { error: upErr } = await sb.auth.updateUser({ password: next });
      if (upErr) { showError(pwError, 'No se pudo cambiar la contraseña: ' + upErr.message); return; }

      pwForm.reset();
      pwSuccess.textContent = 'Contraseña actualizada correctamente.';
      pwSuccess.hidden = false;
    } finally {
      pwSave.disabled = false;
      pwSave.textContent = 'Guardar';
    }
  });

  /* ============================================================
     LIST
     ============================================================ */
  async function loadList() {
    listStatus.hidden = false;
    listStatus.textContent = 'Cargando…';
    const { data, error } = await sb
      .from('paintings').select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) { listStatus.textContent = 'Error al cargar: ' + error.message; return; }
    paintings = data || [];
    listStatus.hidden = true;
    render();
  }

  function render() {
    countEl.textContent = paintings.length ? `(${paintings.length})` : '';
    listEl.innerHTML = '';
    if (!paintings.length) {
      listStatus.hidden = false;
      listStatus.textContent = 'Todavía no hay obras. Agregá la primera con “+ Nueva obra”.';
      return;
    }
    paintings.forEach((p) => listEl.appendChild(buildRow(p)));
  }

  function buildRow(p) {
    const li = document.createElement('li');
    li.className = 'prow';
    li.dataset.id = p.id;
    li.draggable = true;

    const title = (p.title_es || p.title_en)
      ? esc(p.title_es || p.title_en)
      : '<em>Sin título</em>';
    const meta = [
      (p.width_cm && p.height_cm) ? `${+p.width_cm}×${+p.height_cm} cm` : '',
      p.year || '',
    ].filter(Boolean).join(' · ');

    li.innerHTML = `
      <span class="prow__grip" aria-hidden="true" title="Arrastrar para reordenar">⠿</span>
      <div class="prow__thumb">
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : '<span>—</span>'}
      </div>
      <div class="prow__info">
        <div class="prow__title">${title}</div>
        <div class="prow__meta">${esc(meta)}</div>
      </div>
      <div class="prow__pill-cell"><span class="pill pill--${p.status}">${STATUS_LABEL[p.status] || p.status}</span></div>
      <div class="prow__price">${esc(priceLabel(p))}</div>
      <button type="button" class="btn btn--ghost prow__edit">Editar</button>
    `;

    li.querySelector('.prow__edit').addEventListener('click', () => openModal(p));
    wireDrag(li);
    return li;
  }

  /* ============================================================
     DRAG-TO-REORDER
     ============================================================ */
  let dragId = null;

  function wireDrag(li) {
    li.addEventListener('dragstart', (e) => {
      dragId = li.dataset.id;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      listEl.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (li.dataset.id !== dragId) li.classList.add('is-drop-target');
    });
    li.addEventListener('dragleave', () => li.classList.remove('is-drop-target'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('is-drop-target');
      if (!dragId || li.dataset.id === dragId) return;
      reorder(dragId, li.dataset.id);
    });
  }

  async function reorder(fromId, toId) {
    const from = paintings.findIndex((p) => p.id === fromId);
    const to = paintings.findIndex((p) => p.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = paintings.splice(from, 1);
    paintings.splice(to, 0, moved);
    render();

    // Persist new sort_order for the whole list (simple + reliable).
    const updates = paintings.map((p, i) => ({ id: p.id, sort_order: i }));
    paintings.forEach((p, i) => { p.sort_order = i; });
    const { error } = await sb.from('paintings').upsert(updates, { onConflict: 'id' });
    if (error) {
      listStatus.hidden = false;
      listStatus.textContent = 'No se pudo guardar el orden: ' + error.message;
    }
  }

  /* ============================================================
     MODAL: add / edit
     ============================================================ */
  $('add-btn').addEventListener('click', () => openModal(null));
  $('modal-close').addEventListener('click', closeModal);
  $('cancel-btn').addEventListener('click', closeModal);
  $('modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  function openModal(p) {
    editingId = p?.id || null;
    pendingImage = null;
    showError(formError, '');
    form.reset();
    modalTitle.textContent = editingId ? 'Editar obra' : 'Nueva obra';
    deleteBtn.hidden = !editingId;

    FIELDS.forEach((f) => {
      const el = $('f-' + f);
      if (el) el.value = p && p[f] != null ? p[f] : '';
    });
    if (!editingId) $('f-status').value = 'draft';

    // image preview
    imgNote.textContent = 'Se optimiza automáticamente (máx. 2000 px, WebP) antes de subir.';
    imgPreview.innerHTML = (p && p.image_url)
      ? `<img src="${esc(p.image_url)}" alt="">`
      : '<span class="imgfield__placeholder">Sin imagen</span>';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    pendingImage = null;
  }

  /* ---------- image: downscale + WebP + dominant colour ---------- */
  imgInput.addEventListener('change', async () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    imgNote.textContent = 'Procesando imagen…';
    try {
      const processed = await processImage(file);
      if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
      pendingImage = processed;
      imgPreview.innerHTML = `<img src="${processed.previewUrl}" alt="">`;
      const kb = Math.round(processed.blob.size / 1024);
      imgNote.textContent = `Lista para subir · WebP · ${kb} KB`;
    } catch (err) {
      imgPreview.innerHTML = '<span class="imgfield__placeholder">Sin imagen</span>';
      if (err?.message === 'FLAT_CANVAS') {
        imgNote.textContent = 'Tu navegador bloqueó el procesamiento de la imagen (protección de canvas / “resist fingerprinting”). Desactivála para este sitio o subí desde otro navegador.';
      } else {
        imgNote.textContent = 'No se pudo procesar la imagen. Probá con un archivo JPG o PNG.';
      }
      console.error(err);
    }
  });

  async function processImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);

    const { color: dominant_color, spread } = imageStats(ctx, w, h);
    // Guard against a browser-neutered canvas: if the pixels barely vary, the
    // image came back blank and uploading it would store a flat colour block.
    if (spread < MIN_IMAGE_SPREAD) throw new Error('FLAT_CANVAS');

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', WEBP_QUALITY));
    if (!blob) throw new Error('toBlob failed');
    bitmap.close?.();

    return { blob, dominant_color, previewUrl: URL.createObjectURL(blob) };
  }

  // Downsample, then return the average colour (LQIP/glow seed) and how much the
  // pixels vary (spread). Near-zero spread = a flat/blank canvas.
  function imageStats(ctx, w, h) {
    const sw = Math.max(1, Math.min(32, w));
    const sh = Math.max(1, Math.min(32, h));
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const sctx = small.getContext('2d');
    sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
    const { data } = sctx.getImageData(0, 0, sw, sh);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    const mr = r / n, mg = g / n, mb = b / n;
    let vr = 0, vg = 0, vb = 0;
    for (let i = 0; i < data.length; i += 4) {
      vr += (data[i] - mr) ** 2; vg += (data[i + 1] - mg) ** 2; vb += (data[i + 2] - mb) ** 2;
    }
    const spread = (Math.sqrt(vr / n) + Math.sqrt(vg / n) + Math.sqrt(vb / n)) / 3;
    const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
    return { color: '#' + hex(mr) + hex(mg) + hex(mb), spread };
  }

  /* ---------- save ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(formError, '');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    try {
      await save();
      closeModal();
      await loadList();
    } catch (err) {
      showError(formError, err.message || 'No se pudo guardar.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  });

  function numOrNull(id) {
    const v = $('f-' + id).value.trim();
    return v === '' ? null : Number(v);
  }
  function textOrNull(id) {
    const v = $('f-' + id).value.trim();
    return v === '' ? null : v;
  }

  async function save() {
    const row = {
      title_es: textOrNull('title_es'),
      title_en: textOrNull('title_en'),
      medium_es: textOrNull('medium_es'),
      medium_en: textOrNull('medium_en'),
      width_cm: numOrNull('width_cm'),
      height_cm: numOrNull('height_cm'),
      year: numOrNull('year'),
      price_usd: numOrNull('price_usd'),
      price_ars: numOrNull('price_ars'),
      status: $('f-status').value,
      category: textOrNull('category'),
    };

    // Require a real image. `pendingImage` is only set when processing succeeded
    // (a flat/blocked canvas throws before this), so this also stops blank
    // uploads — and stops saving a new painting with no image at all.
    const existing = editingId ? paintings.find((p) => p.id === editingId) : null;
    if (!pendingImage && !existing?.image_url) {
      throw new Error('Elegí una imagen para la obra antes de guardar.');
    }

    // upload image first (if a new one was chosen)
    if (pendingImage) {
      const path = `${crypto.randomUUID()}.webp`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, pendingImage.blob, {
        contentType: 'image/webp', upsert: false,
      });
      if (upErr) throw new Error('Error al subir imagen: ' + upErr.message);
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      row.image_url = pub.publicUrl;
      row.dominant_color = pendingImage.dominant_color;
    }

    if (editingId) {
      const { error } = await sb.from('paintings').update(row).eq('id', editingId);
      if (error) throw new Error(error.message);
    } else {
      // new paintings go to the end of the gallery order
      const maxSort = paintings.reduce((m, p) => Math.max(m, p.sort_order ?? 0), -1);
      row.sort_order = maxSort + 1;
      const { error } = await sb.from('paintings').insert(row);
      if (error) throw new Error(error.message);
    }
  }

  /* ---------- delete ---------- */
  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    const p = paintings.find((x) => x.id === editingId);
    const name = p?.title_es || p?.title_en || 'esta obra';
    if (!confirm(`¿Eliminar “${name}”? Esta acción no se puede deshacer.`)) return;
    deleteBtn.disabled = true;
    const { error } = await sb.from('paintings').delete().eq('id', editingId);
    deleteBtn.disabled = false;
    if (error) { showError(formError, 'No se pudo eliminar: ' + error.message); return; }
    closeModal();
    await loadList();
  });

  /* ---------- go ---------- */
  init();
})();
