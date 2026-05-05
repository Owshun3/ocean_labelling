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

  async function cvatSave() {
    var opts = { key: 's', code: 'KeyS', keyCode: 83, which: 83, ctrlKey: true, bubbles: true, cancelable: true };
    document.body.dispatchEvent(new KeyboardEvent('keydown', opts));
    await sleep(2000);
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

  var KEEP_CONTROLS = ['cvat-cursor-control', 'cvat-draw-rectangle-control'];

  function customizeStudioUI() {
    var sidebar = document.querySelector('aside.cvat-canvas-controls-sidebar');
    if (sidebar) {
      sidebar.style.setProperty('flex', '0 0 72px', 'important');
      sidebar.style.setProperty('max-width', '72px', 'important');
      sidebar.style.setProperty('min-width', '72px', 'important');
      sidebar.style.setProperty('width', '72px', 'important');
    }

    document.querySelectorAll('aside.cvat-canvas-controls-sidebar .ant-layout-sider-children > div').forEach(function (div) {
      var span = div.querySelector(':scope > span.anticon');
      var keep = span && KEEP_CONTROLS.some(function (cls) { return span.classList.contains(cls); });
      if (!keep) {
        div.style.setProperty('display', 'none', 'important');
        return;
      }
      div.style.setProperty('display', 'flex', 'important');
      div.style.setProperty('align-items', 'center', 'important');
      div.style.setProperty('justify-content', 'center', 'important');
      div.style.setProperty('margin', '8px', 'important');
      div.style.setProperty('padding', '12px', 'important');
      div.style.setProperty('border-radius', '10px', 'important');
      div.style.setProperty('background', getVar('--ocean-background-card', '#FFFFFF'), 'important');
      div.style.setProperty('border', '1px solid ' + getVar('--ocean-border', '#C6C6C8'), 'important');
      div.style.setProperty('box-shadow', '0 1px 3px rgba(0,0,0,0.08)', 'important');
      div.style.setProperty('cursor', 'pointer', 'important');
      div.style.setProperty('transition', 'all 0.15s ease', 'important');
      if (span.classList.contains('cvat-active-canvas-control')) {
        div.style.setProperty('background', getVar('--ocean-primary', '#007AFF'), 'important');
        div.style.setProperty('border-color', getVar('--ocean-primary', '#007AFF'), 'important');
        div.style.setProperty('box-shadow', '0 2px 6px rgba(0,122,255,0.3)', 'important');
      }
    });

    document.querySelectorAll('aside.cvat-canvas-controls-sidebar .ant-layout-sider-children > hr, aside.cvat-canvas-controls-sidebar .ant-layout-sider-children > .cvat-extra-controls-control').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('.ant-tabs-tab[data-node-key="labels"], .ant-tabs-tab[data-node-key="issues"], [role="tabpanel"][id$="-panel-labels"], [role="tabpanel"][id$="-panel-issues"]').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
    });

    document.querySelectorAll('aside.cvat-canvas-controls-sidebar span.cvat-cursor-control').forEach(function (span) {
      span.style.setProperty('font-size', '26px', 'important');
      var active = span.classList.contains('cvat-active-canvas-control');
      var color = active ? getVar('--ocean-text-inverse', '#FFFFFF') : getVar('--ocean-text-primary', '#000000');
      var svg = span.querySelector('svg path');
      if (svg) svg.setAttribute('fill', color);
    });

    var rectBtn = document.querySelector('aside.cvat-canvas-controls-sidebar span.cvat-draw-rectangle-control');
    if (rectBtn) {
      rectBtn.style.setProperty('position', 'relative', 'important');
      rectBtn.style.setProperty('display', 'inline-block', 'important');
      rectBtn.style.setProperty('width', '32px', 'important');
      rectBtn.style.setProperty('height', '32px', 'important');
      var svg = rectBtn.querySelector('svg');
      if (svg) svg.style.setProperty('visibility', 'hidden', 'important');
      if (!rectBtn.dataset.oceanIconified) {
        rectBtn.dataset.oceanIconified = '1';
        var pen = document.createElement('span');
        pen.id = 'ocean-rect-icon';
        pen.textContent = '✎';
        pen.style.cssText = 'position:absolute !important;top:50% !important;left:50% !important;transform:translate(-50%,-50%) !important;font-size:26px !important;pointer-events:none !important;line-height:1 !important;';
        rectBtn.appendChild(pen);
      }
      var pen = rectBtn.querySelector('#ocean-rect-icon');
      if (pen) {
        var active = rectBtn.classList.contains('cvat-active-canvas-control');
        pen.style.setProperty('color', active ? getVar('--ocean-text-inverse', '#FFFFFF') : getVar('--ocean-primary', '#007AFF'), 'important');
      }
    }
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
    setStatus('Application du label…');

    var savePromise = cvatSave();

    try {
      var labelsResp = await fetch('/api/labels?task_id=' + taskId + '&page_size=100', {
        credentials: 'include',
        headers: { Accept: 'application/vnd.cvat+json', 'X-CSRFToken': csrf() },
      });
      if (!labelsResp.ok) throw new Error('HTTP ' + labelsResp.status + ' (lecture labels)');
      var labelsData = await labelsResp.json();
      var existingLabels = labelsData.results || [];

      if (existingLabels.some(function (l) { return l.name === name; })) {
        setStatus('Le label "' + name + '" existe déjà', 'error');
        addBtn.disabled = false;
        css(addBtn, { background: getVar('--ocean-primary', '#007AFF'), cursor: 'pointer' });
        return;
      }

      var itemLabel = existingLabels.find(function (l) { return l.name === 'item'; });
      var patchBody = itemLabel
        ? { labels: [{ id: itemLabel.id, name: name }] }
        : { labels: [{ name: name }] };

      var resp = await fetch('/api/tasks/' + taskId, {
        method: 'PATCH', credentials: 'include',
        headers: apiHeaders(),
        body: JSON.stringify(patchBody),
      });

      if (!resp.ok) {
        var errText = await resp.text().catch(function () { return ''; });
        throw new Error('HTTP ' + resp.status + (errText ? ' : ' + errText.slice(0, 80) : ''));
      }

      await savePromise;
      setStatus('✓ Rechargement…', 'success');
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

    await cvatSave();
    await pruneUnusedLabels();

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

  /* ── Contrainte : 1 annotation max par frame ─────────────────────────────── */
  async function getJob() {
    if (!window.cvat || !window.cvat.jobs || !window.cvat.jobs.get) return null;
    try {
      var jobs = await window.cvat.jobs.get({ jobID: parseInt(jobId, 10) });
      return (jobs && jobs[0]) || null;
    } catch (_) { return null; }
  }

  var enforceRunning = false;
  async function enforceMaxOneAnnotation() {
    if (enforceRunning) return;
    enforceRunning = true;
    try {
      var job = await getJob();
      if (!job) return;
      var startFrame = job.startFrame != null ? job.startFrame : job.start_frame;
      var stopFrame  = job.stopFrame  != null ? job.stopFrame  : job.stop_frame;
      if (startFrame == null || stopFrame == null) return;
      var deleted = false;
      for (var f = startFrame; f <= stopFrame; f++) {
        var states = await job.annotations.get(f);
        if (!states || states.length <= 1) continue;
        states.sort(function (a, b) { return (b.clientID || 0) - (a.clientID || 0); });
        var toRemove = states.slice(1);
        for (var i = 0; i < toRemove.length; i++) {
          try {
            if (typeof toRemove[i].delete === 'function') {
              await toRemove[i].delete(f, true);
              deleted = true;
            }
          } catch (_) {}
        }
      }
      if (deleted) {
        try { await job.annotations.save(); } catch (_) {}
        try { await job.annotations.clear({ reload: true }); } catch (_) {}
      }
    } catch (_) {} finally {
      enforceRunning = false;
    }
  }

  async function pruneUnusedLabels() {
    var job = await getJob();
    if (!job) return;
    try {
      var startFrame = job.startFrame != null ? job.startFrame : job.start_frame;
      var stopFrame  = job.stopFrame  != null ? job.stopFrame  : job.stop_frame;
      if (startFrame == null || stopFrame == null) return;
      var usedLabelIds = new Set();
      for (var f = startFrame; f <= stopFrame; f++) {
        var states = await job.annotations.get(f);
        for (var i = 0; i < states.length; i++) {
          if (states[i].label && states[i].label.id != null) usedLabelIds.add(states[i].label.id);
        }
      }
      if (usedLabelIds.size === 0) return;
      var resp = await fetch('/api/labels?task_id=' + taskId + '&page_size=100', {
        credentials: 'include',
        headers: { Accept: 'application/vnd.cvat+json', 'X-CSRFToken': csrf() },
      });
      if (!resp.ok) return;
      var data = await resp.json();
      var unused = (data.results || []).filter(function (l) { return !usedLabelIds.has(l.id); });
      if (unused.length === 0) return;
      var body = { labels: unused.map(function (l) { return { id: l.id, deleted: true }; }) };
      await fetch('/api/tasks/' + taskId, {
        method: 'PATCH', credentials: 'include',
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
    } catch (e) { console.warn('[ocean] prune labels failed:', e); }
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
      setInterval(enforceMaxOneAnnotation, 500);

      var customizeScheduled = false;
      function scheduleCustomize() {
        if (customizeScheduled) return;
        customizeScheduled = true;
        requestAnimationFrame(function () {
          customizeScheduled = false;
          try { customizeStudioUI(); } catch (e) { console.warn('[ocean] customize failed:', e); }
        });
      }

      scheduleCustomize();
      new MutationObserver(function () {
        hideHeader();
        scheduleCustomize();
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
  });

  var start = function () { mainObs.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  setTimeout(function () { injectBar(); hideHeader(); }, 8000);
})();
