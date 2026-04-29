(function () {
  'use strict';

  /* ── Contexte extrait de l'URL ──────────────────────────────────────────── */
  var m = location.pathname.match(/\/tasks\/([0-9]+)\/jobs\/([0-9]+)/);
  if (!m) return;
  var taskId = m[1];
  var jobId  = m[2];
  var appReturn = new URLSearchParams(location.search).get('appReturn');

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function csrf() {
    var c = document.cookie.match(/csrftoken=([^;]+)/);
    return c ? c[1] : '';
  }

  function setStatus(text, cls) {
    var el = document.getElementById('ocean-label-status');
    if (!el) return;
    el.textContent = text;
    el.className = cls || '';
  }

  function cvat_headers() {
    return {
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.cvat+json',
      'X-CSRFToken':   csrf(),
    };
  }

  /* ── Sauvegarde CVAT (Ctrl+S) ───────────────────────────────────────────── */
  async function cvatSave() {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', code: 'KeyS', ctrlKey: true, bubbles: true,
    }));
    await sleep(2000);
  }

  /* ── Injection de la barre ─────────────────────────────────────────────── */
  function injectBar() {
    if (document.getElementById('ocean-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'ocean-bar';

    /* Formulaire d'ajout de label */
    var form = document.createElement('div');
    form.id = 'ocean-label-form';

    var icon = document.createElement('span');
    icon.id = 'ocean-label-icon';
    icon.textContent = '🏷';

    var input = document.createElement('input');
    input.id          = 'ocean-label-input';
    input.type        = 'text';
    input.placeholder = 'Nouveau label (espèce…)';
    input.autocomplete = 'off';

    var addBtn = document.createElement('button');
    addBtn.id        = 'ocean-label-add';
    addBtn.textContent = '+ Ajouter';

    var status = document.createElement('span');
    status.id = 'ocean-label-status';

    form.appendChild(icon);
    form.appendChild(input);
    form.appendChild(addBtn);
    form.appendChild(status);

    /* Spacer */
    var spacer = document.createElement('div');
    spacer.id = 'ocean-spacer';

    /* Bouton de validation */
    var valBtn = document.createElement('button');
    valBtn.id          = 'ocean-val-btn';
    valBtn.textContent = 'Valider et terminer';

    bar.appendChild(form);
    bar.appendChild(spacer);
    bar.appendChild(valBtn);
    document.body.insertBefore(bar, document.body.firstChild);

    /* Événements */
    addBtn.addEventListener('click', handleAddLabel);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleAddLabel();
    });
    valBtn.addEventListener('click', handleValidate);
  }

  /* ── Ajout de label en live ─────────────────────────────────────────────── */
  async function handleAddLabel() {
    var input  = document.getElementById('ocean-label-input');
    var addBtn = document.getElementById('ocean-label-add');
    var name   = input.value.trim();
    if (!name) { input.focus(); return; }

    addBtn.disabled = true;
    setStatus('Sauvegarde en cours…');

    /* 1. Sauvegarder les annotations courantes avant le rechargement */
    await cvatSave();
    setStatus('Ajout du label…');

    try {
      /* 2. Ajouter le label via PATCH /api/tasks/{id}
            CVAT fait un merge : les labels sans ID sont créés,
            les existants (identifiés par ID) sont conservés. */
      var resp = await fetch('/api/tasks/' + taskId, {
        method:      'PATCH',
        credentials: 'include',
        headers:     cvat_headers(),
        body:        JSON.stringify({ labels: [{ name: name }] }),
      });

      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      setStatus('✓ Label ajouté — rechargement…', 'success');
      await sleep(900);
      /* 3. Recharger la page pour que CVAT intègre le nouveau label */
      location.reload();

    } catch (e) {
      setStatus('Erreur : ' + e.message, 'error');
      addBtn.disabled = false;
    }
  }

  /* ── Validation du job ──────────────────────────────────────────────────── */
  async function handleValidate() {
    var btn = document.getElementById('ocean-val-btn');
    btn.disabled      = true;
    btn.textContent   = 'Sauvegarde…';

    /* 1. Sauvegarder */
    await cvatSave();

    /* 2. Marquer le job "completed" */
    try {
      await fetch('/api/jobs/' + jobId, {
        method:      'PATCH',
        credentials: 'include',
        headers:     cvat_headers(),
        body:        JSON.stringify({ state: 'completed' }),
      });
    } catch (e) {
      console.warn('[ocean] job state update failed:', e);
    }

    /* 3. Retour à l'application */
    btn.textContent = 'Terminé !';
    await sleep(700);
    if (appReturn) {
      window.location.href = decodeURIComponent(appReturn);
    } else {
      window.close();
    }
  }

  /* ── Blocage de la navigation SPA hors du studio ────────────────────────── */
  var studioPattern = /^\/tasks\/[0-9]+\/jobs\/[0-9]+/;
  var _push    = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);
  history.pushState    = function (s, t, u) { if (!u || studioPattern.test(String(u))) _push(s, t, u); };
  history.replaceState = function (s, t, u) { if (!u || studioPattern.test(String(u))) _replace(s, t, u); };

  /* ── Attente du rendu CVAT (canvas visible) ─────────────────────────────── */
  var canvasSelectors = ['.cvat-canvas-container', '[class*=cvat-canvas]'];

  var observer = new MutationObserver(function () {
    var ready = canvasSelectors.some(function (sel) { return document.querySelector(sel); });
    if (ready) {
      injectBar();
      observer.disconnect();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  /* Fallback si le canvas n'est pas détecté dans les 8 s */
  setTimeout(injectBar, 8000);
})();
