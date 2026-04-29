(function () {
  'use strict';

  /* ── Contexte URL ────────────────────────────────────────────────────────── */
  var m = location.pathname.match(/\/tasks\/([0-9]+)\/jobs\/([0-9]+)/);
  if (!m) return;
  var taskId    = m[1];
  var jobId     = m[2];
  var appReturn = new URLSearchParams(location.search).get('appReturn');

  /* ── Helpers généraux ────────────────────────────────────────────────────── */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function csrf() {
    var c = document.cookie.match(/csrftoken=([^;]+)/);
    return c ? c[1] : '';
  }

  function apiHeaders() {
    return { 'Content-Type': 'application/json', 'Accept': 'application/vnd.cvat+json', 'X-CSRFToken': csrf() };
  }

  function cvatSave() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true }));
  }

  /* ── Lecture des CSS custom properties du thème Ocean ───────────────────── */
  /* Appelée une seule fois après que ocean-theme.css est chargé.             */
  /* getComputedStyle lit les variables définies sur :root.                   */
  function getVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (_) { return fallback; }
  }

  /* ── Application de styles inline avec priorité maximale ────────────────── */
  /* element.style.setProperty(p, v, 'important') écrase tout CSS externe,   */
  /* y compris les !important injectés après coup par le bundle CVAT.         */
  function css(el, props) {
    Object.keys(props).forEach(function (p) {
      el.style.setProperty(p, props[p], 'important');
    });
  }

  /* ── Masquage du header CVAT ─────────────────────────────────────────────── */
  var HEADER_SEL = ['.cvat-header', '.ant-layout-header', '[class*="cvat-header"]'];

  function hideHeader() {
    HEADER_SEL.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        css(el, { display: 'none', height: '0', 'min-height': '0', overflow: 'hidden' });
      });
    });
  }

  /* ── Construction et stylisation de la barre ────────────────────────────── */
  var BAR_H = '52px';

  function styledEl(tag, id) {
    var el = document.createElement(tag);
    if (id) el.id = id;
    return el;
  }

  function injectBar() {
    if (document.getElementById('ocean-bar')) return;

    /* Lecture des tokens thème (ocean-theme.css déjà chargé à ce stade) */
    var T = {
      bgCard:     getVar('--ocean-background-card', '#FFFFFF'),
      bgMain:     getVar('--ocean-background-main', '#F2F2F7'),
      border:     getVar('--ocean-border',           '#C6C6C8'),
      primary:    getVar('--ocean-primary',           '#007AFF'),
      success:    getVar('--ocean-success',           '#34C759'),
      textPri:    getVar('--ocean-text-primary',      '#000000'),
      textSec:    getVar('--ocean-text-secondary',    '#666666'),
      textInv:    getVar('--ocean-text-inverse',      '#FFFFFF'),
      textPh:     getVar('--ocean-text-placeholder',  '#A0A0A0'),
      font:       getVar('--ocean-font-family',       'Roboto, sans-serif'),
      sizeBody:   getVar('--ocean-font-size-body',    '14px'),
      sizeCap:    getVar('--ocean-font-size-caption', '12px'),
      wMedium:    getVar('--ocean-font-weight-h2',    '600'),
      spSm:       getVar('--ocean-spacing-sm',        '8px'),
      spMd:       getVar('--ocean-spacing-md',        '16px'),
      radius:     getVar('--ocean-spacing-sm',        '8px'),
    };

    /* ── Barre principale ── */
    var bar = styledEl('div', 'ocean-bar');
    css(bar, {
      position:        'fixed',
      top:             '0',
      left:            '0',
      right:           '0',
      height:          BAR_H,
      'min-height':    BAR_H,
      'z-index':       '99999',
      display:         'flex',
      'align-items':   'center',
      'flex-direction':'row',
      'flex-wrap':     'nowrap',
      gap:             T.spSm,
      padding:         '0 ' + T.spMd,
      'box-sizing':    'border-box',
      background:      T.bgCard,
      'border-bottom': '1px solid ' + T.border,
      'box-shadow':    '0 2px 8px rgba(0,0,0,0.10)',
      'font-family':   T.font,
      'font-size':     T.sizeBody,
      color:           T.textPri,
      margin:          '0',
    });

    /* ── Formulaire ajout de label ── */
    var form = styledEl('div', 'ocean-label-form');
    css(form, { display: 'flex', 'align-items': 'center', gap: T.spSm, 'flex-shrink': '0', margin: '0', padding: '0' });

    var icon = styledEl('span', 'ocean-label-icon');
    icon.textContent = '🏷';
    css(icon, { 'font-size': T.sizeBody, color: T.primary, 'flex-shrink': '0', 'line-height': '1' });

    var input = styledEl('input', 'ocean-label-input');
    input.type        = 'text';
    input.placeholder = 'Nouveau label (espèce…)';
    input.autocomplete = 'off';
    css(input, {
      width:          '200px',
      height:         '32px',
      padding:        '0 ' + T.spSm,
      margin:         '0',
      background:     T.bgMain,
      border:         '1px solid ' + T.border,
      'border-radius': T.radius,
      color:          T.textPri,
      'font-size':    T.sizeBody,
      'font-family':  T.font,
      outline:        'none',
      'box-shadow':   'none',
      'box-sizing':   'border-box',
      appearance:     'none',
    });
    /* Placeholder via feuille de style dynamique (setProperty ne gère pas ::placeholder) */
    var placeholderStyle = document.createElement('style');
    placeholderStyle.textContent = '#ocean-label-input::placeholder { color: ' + T.textPh + ' !important; }' +
      '#ocean-label-input:focus { border-color: ' + T.primary + ' !important; background: ' + T.bgCard + ' !important; }';
    document.head.appendChild(placeholderStyle);

    var addBtn = styledEl('button', 'ocean-label-add');
    addBtn.type        = 'button';
    addBtn.textContent = '+ Ajouter';
    css(addBtn, {
      height:          '32px',
      padding:         '0 ' + T.spMd,
      margin:          '0',
      background:      T.primary,
      color:           T.textInv,
      border:          'none',
      'border-radius': T.radius,
      'font-size':     T.sizeBody,
      'font-weight':   T.wMedium,
      'font-family':   T.font,
      cursor:          'pointer',
      'white-space':   'nowrap',
      display:         'inline-flex',
      'align-items':   'center',
      'box-sizing':    'border-box',
      'box-shadow':    'none',
    });
    addBtn.addEventListener('mouseenter', function () { if (!addBtn.disabled) css(addBtn, { opacity: '0.85' }); });
    addBtn.addEventListener('mouseleave', function () { css(addBtn, { opacity: '1' }); });

    var status = styledEl('span', 'ocean-label-status');
    css(status, {
      'font-size':   T.sizeCap,
      color:         T.textSec,
      'font-family': T.font,
      'min-width':   '130px',
      margin:        '0',
      padding:       '0',
    });

    form.append(icon, input, addBtn, status);

    /* ── Spacer ── */
    var spacer = styledEl('div', 'ocean-spacer');
    css(spacer, { flex: '1' });

    /* ── Bouton validation ── */
    var valBtn = styledEl('button', 'ocean-val-btn');
    valBtn.type        = 'button';
    valBtn.textContent = 'Valider et terminer';
    css(valBtn, {
      height:          '32px',
      padding:         '0 ' + T.spMd,
      margin:          '0',
      background:      T.success,
      color:           T.textInv,
      border:          'none',
      'border-radius': T.radius,
      'font-size':     T.sizeBody,
      'font-weight':   T.wMedium,
      'font-family':   T.font,
      cursor:          'pointer',
      'white-space':   'nowrap',
      'flex-shrink':   '0',
      display:         'inline-flex',
      'align-items':   'center',
      'box-sizing':    'border-box',
      'box-shadow':    'none',
    });
    valBtn.addEventListener('mouseenter', function () { if (!valBtn.disabled) css(valBtn, { opacity: '0.85' }); });
    valBtn.addEventListener('mouseleave', function () { css(valBtn, { opacity: '1' }); });

    bar.append(form, spacer, valBtn);
    document.body.insertBefore(bar, document.body.firstChild);

    /* Décaler le contenu CVAT sous la barre */
    css(document.body, { 'padding-top': BAR_H, 'padding-bottom': '0' });

    addBtn.addEventListener('click', handleAddLabel);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleAddLabel(); });
    valBtn.addEventListener('click', handleValidate);
  }

  /* ── Gestion du statut ───────────────────────────────────────────────────── */
  function setStatus(text, state) {
    var el = document.getElementById('ocean-label-status');
    if (!el) return;
    el.textContent = text;
    var T = {
      success: getVar('--ocean-success', '#34C759'),
      error:   getVar('--ocean-danger',  '#FF3B30'),
      neutral: getVar('--ocean-text-secondary', '#666666'),
    };
    css(el, { color: state === 'success' ? T.success : state === 'error' ? T.error : T.neutral });
  }

  /* ── Ajout de label ──────────────────────────────────────────────────────── */
  async function handleAddLabel() {
    var input  = document.getElementById('ocean-label-input');
    var addBtn = document.getElementById('ocean-label-add');
    var name   = (input.value || '').trim();
    if (!name) { input.focus(); return; }

    addBtn.disabled = true;
    css(addBtn, { background: getVar('--ocean-border', '#C6C6C8'), cursor: 'not-allowed' });
    setStatus('Sauvegarde + ajout…');

    cvatSave(); /* en parallèle */

    try {
      var resp = await fetch('/api/tasks/' + taskId, {
        method: 'PATCH', credentials: 'include',
        headers: apiHeaders(),
        body: JSON.stringify({ labels: [{ name: name }] }),
      });

      if (!resp.ok) {
        var errMsg = 'HTTP ' + resp.status;
        if (resp.status === 400) {
          try {
            var bodyText = await resp.text();
            if (/already exist/i.test(bodyText)) {
              errMsg = 'Le label "' + name + '" existe déjà';
            } else {
              /* Extraire le premier message lisible du JSON si possible */
              try {
                var body = JSON.parse(bodyText);
                var flat = [].concat.apply([], Object.values(body || {}));
                var first = flat.find(function (v) { return typeof v === 'string'; });
                if (first) errMsg = first;
              } catch (_) { /* corps non JSON */ }
            }
          } catch (_) { /* lecture impossible */ }
        }
        throw new Error(errMsg);
      }

      setStatus('✓ Rechargement…', 'success');
      await sleep(1800); /* laisser le Ctrl+S se terminer (2 s depuis le début) */
      location.reload();
    } catch (e) {
      setStatus(e.message, 'error');
      addBtn.disabled = false;
      css(addBtn, { background: getVar('--ocean-primary', '#007AFF'), cursor: 'pointer' });
    }
  }

  /* ── Validation du job ───────────────────────────────────────────────────── */
  async function handleValidate() {
    var btn = document.getElementById('ocean-val-btn');
    btn.disabled = true;
    css(btn, { background: getVar('--ocean-border', '#C6C6C8'), cursor: 'not-allowed' });
    btn.textContent = 'Sauvegarde…';

    cvatSave();
    await sleep(2000);

    try {
      await fetch('/api/jobs/' + jobId, {
        method: 'PATCH', credentials: 'include',
        headers: apiHeaders(),
        body: JSON.stringify({ state: 'completed' }),
      });
    } catch (e) { console.warn('[ocean] job update failed:', e); }

    btn.textContent = 'Terminé !';
    await sleep(700);
    if (appReturn) window.location.href = decodeURIComponent(appReturn);
    else window.close();
  }

  /* ── Blocage navigation SPA ──────────────────────────────────────────────── */
  var studioPattern = /^\/tasks\/[0-9]+\/jobs\/[0-9]+/;
  var _push    = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);
  history.pushState    = function (s, t, u) { if (!u || studioPattern.test(String(u))) _push(s, t, u); };
  history.replaceState = function (s, t, u) { if (!u || studioPattern.test(String(u))) _replace(s, t, u); };

  /* ── Attente canvas + masquage header continu ───────────────────────────── */
  var CANVAS_SEL  = ['.cvat-canvas-container', '[class*=cvat-canvas]'];
  var canvasReady = false;

  var mainObs = new MutationObserver(function () {
    hideHeader();
    if (canvasReady) return;
    if (CANVAS_SEL.some(function (s) { return !!document.querySelector(s); })) {
      canvasReady = true;
      mainObs.disconnect();
      injectBar();
      /* Observer permanent pour masquer le header lors des re-rendus CVAT */
      new MutationObserver(hideHeader)
        .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
  });

  var start = function () { mainObs.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  setTimeout(function () { injectBar(); hideHeader(); }, 8000);
})();
