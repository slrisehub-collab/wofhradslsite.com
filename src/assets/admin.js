/* WOFHRAD-SL admin panel. All text from the server is inserted with textContent, never as HTML. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var session = {};
  try { session = JSON.parse(sessionStorage.getItem('wofhrad_admin') || '{}') || {}; } catch (e) { session = {}; }
  var token = session.token || '';
  var editing = null;      // story being edited (null = new)
  var cover = null;        // image id
  var more = [];           // image ids
  var fresh = [];          // ids uploaded in this editing session and not yet saved
  var stories = [];
  var msgFilter = '';
  var REASONS = { general: 'General', partnership: 'Partnership', internship: 'Internship', volunteering: 'Volunteering', donation: 'Donation', media: 'Media' };
  var SYMBOLS = { SLE: 'Le', USD: '$', GBP: '£', EUR: '€' };

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, token ? { Authorization: 'Bearer ' + token } : {});
    return fetch(path, opts).then(function (res) {
      if (res.status === 401 && token && path !== '/api/login') { logout('Your session ended. Please log in again.'); throw new Error('Please log in again.'); }
      return res;
    });
  }
  function jsonOrError(res) {
    return res.json().catch(function () { return {}; }).then(function (d) {
      if (!res.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
      return d;
    });
  }
  function postJson(path, body, method) {
    return api(path, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(jsonOrError);
  }
  function say(el, text, kind) { el.textContent = text; el.className = 'msg' + (kind ? ' ' + kind : ''); }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
  function fmtTime(iso) { return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function imgUrl(id) { return '/api/image?id=' + encodeURIComponent(id); }
  var isAdmin = function () { return session.role === 'admin'; };

  /* ---------- login / logout ---------- */
  var isEditor = function () { return session.role === 'admin' || session.role === 'editor'; };
  function showApp() {
    $('login-view').classList.add('hidden');
    $('setup-view').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('logout').classList.remove('hidden');
    var roleName = { admin: 'administrator', editor: 'editor', staff: 'staff' }[session.role] || session.role;
    $('who').textContent = 'Signed in as ' + session.name + ' (' + roleName + ')';
    $('who').classList.remove('hidden');
    document.querySelectorAll('.admin-only').forEach(function (el) { el.classList.toggle('hidden', !isAdmin()); });
    document.querySelectorAll('.editor-only').forEach(function (el) { el.classList.toggle('hidden', !isEditor()); });
    document.querySelectorAll('.staff-only').forEach(function (el) { el.classList.toggle('hidden', session.kind !== 'staff'); });
    if (isEditor()) { loadStories(); openTab('stories'); } else { openTab('me'); }
  }
  function logout(message) {
    token = ''; session = {}; sessionStorage.removeItem('wofhrad_admin');
    $('app').classList.add('hidden'); $('logout').classList.add('hidden'); $('who').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('password').value = '';
    say($('login-msg'), message || '', message ? 'err' : '');
  }
  $('logout').addEventListener('click', function () { logout(''); });

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('login-btn'); btn.disabled = true; say($('login-msg'), 'Checking…', '');
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('login-name').value.trim(), password: $('password').value }) })
      .then(jsonOrError)
      .then(function (d) {
        token = d.token; session = { token: d.token, name: d.name, role: d.role, kind: d.kind, id: d.id };
        sessionStorage.setItem('wofhrad_admin', JSON.stringify(session));
        say($('login-msg'), '', ''); showApp();
      })
      .catch(function (err) {
        say($('login-msg'), err.message === 'Failed to fetch' ? 'Cannot reach the server. Please check your connection and try again.' : err.message, 'err');
      })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- tabs ---------- */
  var panels = { stories: 'tab-stories', editor: 'tab-editor-panel', msgs: 'tab-msgs', docs: 'tab-docs', team: 'tab-team', subs: 'tab-subs', news: 'tab-news', settings: 'tab-settings', activity: 'tab-activity', me: 'tab-me' };
  var loaders = {
    msgs: function () { loadMsgs(); }, docs: function () { loadDocs(); }, subs: function () { loadSubs(); },
    news: function () { fillStoryPicker(); loadCampaigns(); }, settings: function () { loadSettings(); }, activity: function () { loadActivity(); },
    team: function () { loadTeam(); }, me: function () { loadMe(); }
  };
  function openTab(name) {
    Object.keys(panels).forEach(function (k) { $(panels[k]).classList.toggle('hidden', k !== name); });
    document.querySelectorAll('.tabs .tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (loaders[name]) loaders[name]();
  }
  document.querySelectorAll('.tabs .tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var name = t.getAttribute('data-tab');
      if (name === 'editor') { startEditor(null); return; }
      if (!$('tab-editor-panel').classList.contains('hidden')) discardFresh();
      openTab(name);
    });
  });

  /* ---------- stories list ---------- */
  function loadStories() {
    api('/api/posts?all=1&limit=1000').then(jsonOrError).then(function (d) {
      stories = d.posts; renderStories();
    }).catch(function (err) { $('story-list').textContent = err.message; });
  }
  function renderStories() {
    var box = $('story-list'); box.textContent = '';
    if (!stories.length) { box.appendChild(mk('p', 'muted', 'No stories yet. Press "New story" to write your first one.')); return; }
    stories.forEach(function (s) {
      var row = mk('div', 'row');
      var left = mk('div');
      var t = mk('div', 'row-title');
      t.appendChild(mk('span', 'badge ' + (s.archive ? 'archive' : s.status === 'published' ? 'pub' : 'draft'), s.archive ? 'From old website' : s.status === 'published' ? 'Published' : 'Draft'));
      t.appendChild(document.createTextNode(s.title));
      left.appendChild(t);
      left.appendChild(mk('div', 'row-meta', fmtDate(s.date)));
      var actions = mk('div', 'row-actions');
      if (s.status === 'published') {
        var v = mk('a', 'btn btn-ghost btn-small', 'View'); v.href = '/stories/' + encodeURIComponent(s.id); v.target = '_blank'; v.rel = 'noopener';
        actions.appendChild(v);
      }
      if (s.archive) {
        actions.appendChild(mk('span', 'row-meta', 'Edit in content/stories/' + s.id + '.md'));
        row.appendChild(left); row.appendChild(actions); box.appendChild(row);
        return;
      }
      var ed = mk('button', 'btn btn-ghost btn-small', 'Edit'); ed.type = 'button';
      ed.addEventListener('click', function () { editStory(s.id); });
      var del = mk('button', 'btn btn-danger', 'Delete'); del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Delete "' + s.title + '"? This cannot be undone.')) return;
        api('/api/posts?id=' + encodeURIComponent(s.id), { method: 'DELETE' }).then(jsonOrError).then(loadStories).catch(function (err) { alert(err.message); });
      });
      actions.appendChild(ed); actions.appendChild(del);
      row.appendChild(left); row.appendChild(actions);
      box.appendChild(row);
    });
  }
  $('new-story').addEventListener('click', function () { startEditor(null); });

  /* ---------- editor ---------- */
  function counter(input, out, max) { out.textContent = input.value.length + '/' + max; }
  $('title').addEventListener('input', function () { counter($('title'), $('title-count'), 150); });
  $('excerpt').addEventListener('input', function () { counter($('excerpt'), $('excerpt-count'), 300); });

  function thumb(id, onRemove) {
    var w = mk('div', 'thumb');
    var im = document.createElement('img'); im.src = imgUrl(id) + '&size=sm'; im.alt = 'Uploaded photo';
    var x = mk('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove photo');
    x.addEventListener('click', onRemove);
    w.appendChild(im); w.appendChild(x);
    return w;
  }
  function renderThumbs() {
    var c = $('cover-thumb'); c.textContent = '';
    if (cover) { var w = thumb(cover, function () { removeImage(cover); cover = null; renderThumbs(); }); w.appendChild(mk('span', null, 'Cover')); c.appendChild(w); }
    var m = $('more-thumbs'); m.textContent = '';
    more.forEach(function (id) { m.appendChild(thumb(id, function () { removeImage(id); more = more.filter(function (x) { return x !== id; }); renderThumbs(); })); });
  }
  function removeImage(id) {
    var i = fresh.indexOf(id);
    if (i > -1) { fresh.splice(i, 1); api('/api/image?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(function () {}); }
  }
  function discardFresh() {
    fresh.splice(0).forEach(function (id) { api('/api/image?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(function () {}); });
  }
  // Photos uploaded but never saved are also removed by the daily clean-up on the server.
  window.addEventListener('beforeunload', function (e) {
    if (!$('tab-editor-panel').classList.contains('hidden') && ($('body').value.trim() || fresh.length)) { e.preventDefault(); e.returnValue = ''; }
  });

  function startEditor(story) {
    discardFresh();
    editing = story;
    $('editor-title').textContent = story ? 'Edit story' : 'New story';
    $('title').value = story ? story.title : '';
    $('excerpt').value = story ? story.excerpt || '' : '';
    $('body').value = story ? story.body : '';
    $('programme').value = story && story.programme ? story.programme : '';
    cover = story ? story.cover || null : null;
    more = story ? (story.images || []).filter(function (i) { return i !== story.cover; }) : [];
    document.querySelector('input[name=status][value=' + (story && story.status === 'draft' ? 'draft' : 'published') + ']').checked = true;
    $('cover-file').value = ''; $('more-files').value = '';
    say($('editor-msg'), '', ''); $('upload-note').textContent = '';
    counter($('title'), $('title-count'), 150); counter($('excerpt'), $('excerpt-count'), 300);
    renderThumbs(); openTab('editor');
    $('title').focus();
  }
  function editStory(id) {
    api('/api/posts?id=' + encodeURIComponent(id)).then(jsonOrError).then(startEditor).catch(function (err) { alert(err.message); });
  }

  /* Shrink photos in the browser first so uploads are fast on mobile data. */
  function shrink(file, maxSide) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('"' + file.name + '" is not a JPG, PNG or WebP photo.'));
    var load = window.createImageBitmap ? createImageBitmap(file) : new Promise(function (ok, no) {
      var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = URL.createObjectURL(file);
    });
    return load.then(function (bmp) {
      var w = bmp.width, h = bmp.height, s = Math.min(1, maxSide / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (ok, no) { c.toBlob(function (b) { b ? ok(b) : no(new Error('Could not prepare the photo.')); }, 'image/jpeg', 0.8); });
    });
  }
  // Uploads the photo (1600 px) and a small copy (640 px) used on story cards.
  function upload(file) {
    var send = function (blob, q) { return api('/api/image' + (q || ''), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).then(jsonOrError); };
    return shrink(file, 1600).then(function (big) { return send(big); }).then(function (d) {
      fresh.push(d.id);
      return shrink(file, 640).then(function (small) { return send(small, '?thumbFor=' + encodeURIComponent(d.id)); })
        .catch(function () { /* the full photo is used if the small copy fails */ })
        .then(function () { return d.id; });
    });
  }
  $('cover-file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    $('upload-note').textContent = 'Uploading cover photo…';
    upload(f).then(function (id) { if (cover) removeImage(cover); cover = id; renderThumbs(); $('upload-note').textContent = ''; })
      .catch(function (err) { $('upload-note').textContent = err.message; })
      .then(function () { e.target.value = ''; });
  });
  $('more-files').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files); if (!files.length) return;
    var room = 11 - more.length;
    if (files.length > room) { $('upload-note').textContent = 'Only ' + room + ' more photo(s) can be added.'; files = files.slice(0, Math.max(room, 0)); }
    var chain = Promise.resolve(); var errors = [];
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        $('upload-note').textContent = 'Uploading photo ' + (i + 1) + ' of ' + files.length + '…';
        return upload(f).then(function (id) { more.push(id); renderThumbs(); }).catch(function (err) { errors.push(err.message); });
      });
    });
    chain.then(function () { $('upload-note').textContent = errors.join(' '); e.target.value = ''; });
  });

  $('cancel-edit').addEventListener('click', function () { discardFresh(); openTab('stories'); });

  $('story-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var status = document.querySelector('input[name=status]:checked').value;
    var payload = { title: $('title').value.trim(), excerpt: $('excerpt').value.trim(), body: $('body').value, status: status, cover: cover, images: more, programme: $('programme').value || null };
    if (!payload.title) { say($('editor-msg'), 'Please add a title.', 'err'); $('title').focus(); return; }
    if (!payload.body.trim()) { say($('editor-msg'), 'Please write the story.', 'err'); $('body').focus(); return; }
    if (editing) payload.expectedUpdatedAt = editing.updatedAt;
    var btn = $('save-btn'); btn.disabled = true; say($('editor-msg'), 'Saving…', '');
    var url = '/api/posts' + (editing ? '?id=' + encodeURIComponent(editing.id) : '');
    postJson(url, payload, editing ? 'PUT' : 'POST')
      .then(function () { fresh = []; $('body').value = ''; say($('editor-msg'), '', ''); loadStories(); openTab('stories'); })
      .catch(function (err) { say($('editor-msg'), err.message, 'err'); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- messages ---------- */
  (function () {
    var box = $('msg-filters');
    [['', 'All']].concat(Object.keys(REASONS).map(function (k) { return [k, REASONS[k]]; })).forEach(function (r) {
      var b = mk('button', 'tab' + (r[0] === '' ? ' active' : ''), r[1]); b.type = 'button';
      b.addEventListener('click', function () {
        msgFilter = r[0];
        box.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === b); });
        loadMsgs();
      });
      box.appendChild(b);
    });
  })();
  function loadMsgs() {
    say($('msgs-msg'), '', '');
    api('/api/messages').then(jsonOrError).then(function (d) {
      var list = d.messages.filter(function (m) { return !msgFilter || (m.reason || 'general') === msgFilter; });
      $('msg-count').textContent = list.length;
      var box = $('msg-list'); box.textContent = '';
      if (!list.length) { box.appendChild(mk('p', 'muted', 'No messages here yet.')); return; }
      list.forEach(function (m) {
        var row = mk('div', 'row');
        var left = mk('div'); left.style.flex = '1 1 380px'; left.style.minWidth = '0';
        var title = mk('div', 'row-title');
        title.appendChild(mk('span', 'badge reason', REASONS[m.reason || 'general'] || 'General'));
        if (m.pledge) title.appendChild(mk('span', 'badge pledge', (SYMBOLS[m.pledge.currency] || '') + ' ' + Number(m.pledge.amount).toLocaleString('en-GB') + ' ' + m.pledge.currency + ' · ' + m.pledge.frequency));
        title.appendChild(document.createTextNode(m.subject || (m.pledge ? 'Donation pledge' : '(no subject)')));
        left.appendChild(title);
        var meta = mk('div', 'row-meta');
        meta.appendChild(document.createTextNode(m.name + ' · '));
        var mail = mk('a', null, m.email);
        mail.href = 'mailto:' + encodeURIComponent(m.email).replace('%40', '@') + '?subject=' + encodeURIComponent('Re: ' + (m.subject || (m.pledge ? 'Your donation to WOFHRAD-SL' : 'Your message to WOFHRAD-SL')));
        meta.appendChild(mail);
        if (m.phone) {
          meta.appendChild(document.createTextNode(' · '));
          var tel = mk('a', null, m.phone); tel.href = 'tel:' + m.phone.replace(/[^0-9+]/g, ''); meta.appendChild(tel);
        }
        meta.appendChild(document.createTextNode(' · ' + fmtTime(m.receivedAt)));
        left.appendChild(meta);
        if (m.message) {
          var text = mk('p', 'muted', m.message); text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere'; text.style.margin = '.6rem 0 0';
          left.appendChild(text);
        }
        var rm = mk('button', 'btn btn-danger', 'Delete'); rm.type = 'button';
        rm.addEventListener('click', function () {
          if (!confirm('Delete this message from ' + m.name + '?')) return;
          api('/api/messages?id=' + encodeURIComponent(m.id), { method: 'DELETE' }).then(jsonOrError).then(loadMsgs).catch(function (err) { say($('msgs-msg'), err.message, 'err'); });
        });
        row.appendChild(left); row.appendChild(rm); box.appendChild(row);
      });
    }).catch(function (err) { $('msg-list').textContent = err.message; });
  }
  $('refresh-msgs').addEventListener('click', loadMsgs);

  /* ---------- reports (documents) ---------- */
  function loadDocs() {
    api('/api/documents').then(jsonOrError).then(function (d) {
      var box = $('doc-list'); box.textContent = '';
      if (!d.documents.length) { box.appendChild(mk('p', 'muted', 'No documents published yet.')); return; }
      d.documents.forEach(function (doc) {
        var row = mk('div', 'row');
        var left = mk('div');
        left.appendChild(mk('div', 'row-title', doc.title));
        left.appendChild(mk('div', 'row-meta', [doc.year, Math.max(1, Math.round(doc.size / 1024)) + ' KB', 'added ' + fmtDate(doc.uploadedAt) + ' by ' + doc.uploadedBy].filter(Boolean).join(' · ')));
        var actions = mk('div', 'row-actions');
        var v = mk('a', 'btn btn-ghost btn-small', 'Open'); v.href = '/api/documents?id=' + encodeURIComponent(doc.id); actions.appendChild(v);
        var rm = mk('button', 'btn btn-danger', 'Remove'); rm.type = 'button';
        rm.addEventListener('click', function () {
          if (!confirm('Remove "' + doc.title + '" from the website?')) return;
          api('/api/documents?id=' + encodeURIComponent(doc.id), { method: 'DELETE' }).then(jsonOrError).then(loadDocs).catch(function (err) { say($('doc-msg'), err.message, 'err'); });
        });
        actions.appendChild(rm);
        row.appendChild(left); row.appendChild(actions); box.appendChild(row);
      });
    }).catch(function (err) { $('doc-list').textContent = err.message; });
  }
  $('doc-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = $('doc-file').files[0], title = $('doc-title').value.trim();
    if (!title) { say($('doc-msg'), 'Please give the document a title.', 'err'); return; }
    if (!f) { say($('doc-msg'), 'Please choose a PDF file.', 'err'); return; }
    if (f.size > 5 * 1024 * 1024) { say($('doc-msg'), 'That file is larger than 5 MB. Please compress the PDF and try again.', 'err'); return; }
    var btn = $('doc-btn'); btn.disabled = true; say($('doc-msg'), 'Uploading…', '');
    api('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Title': encodeURIComponent(title), 'X-Year': encodeURIComponent($('doc-year').value.trim()) }, body: f })
      .then(jsonOrError)
      .then(function () { say($('doc-msg'), 'Published.', 'ok'); $('doc-form').reset(); loadDocs(); })
      .catch(function (err) { say($('doc-msg'), err.message, 'err'); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- subscribers ---------- */
  function loadSubs() {
    say($('subs-msg'), '', '');
    api('/api/subscribers').then(jsonOrError).then(function (d) {
      $('sub-count').textContent = d.count;
      $('sub-summary').textContent = 'newsletter subscribers: ' + d.confirmed + ' confirmed, ' + d.pending + ' waiting to confirm';
      var box = $('sub-list'); box.textContent = '';
      if (!d.subscribers.length) { box.appendChild(mk('p', 'muted', 'No one has subscribed yet.')); return; }
      d.subscribers.forEach(function (s) {
        var row = mk('div', 'row');
        var left = mk('div');
        var t = mk('div', 'row-title');
        t.appendChild(mk('span', 'badge ' + s.status, s.status === 'confirmed' ? 'Confirmed' : 'Pending'));
        t.appendChild(document.createTextNode(s.email));
        left.appendChild(t);
        left.appendChild(mk('div', 'row-meta', 'Subscribed ' + fmtDate(s.subscribedAt) + (s.confirmedAt ? ' · confirmed ' + fmtDate(s.confirmedAt) : '')));
        var rm = mk('button', 'btn btn-danger', 'Remove'); rm.type = 'button';
        rm.addEventListener('click', function () {
          if (!confirm('Remove ' + s.email + ' from the newsletter?')) return;
          api('/api/subscribers?email=' + encodeURIComponent(s.email), { method: 'DELETE' }).then(jsonOrError).then(loadSubs).catch(function (err) { say($('subs-msg'), err.message, 'err'); });
        });
        row.appendChild(left); row.appendChild(rm); box.appendChild(row);
      });
    }).catch(function (err) { $('sub-list').textContent = err.message; });
  }
  $('send-confirms').addEventListener('click', function () {
    var btn = $('send-confirms'); btn.disabled = true; var total = 0;
    var step = function () {
      return postJson('/api/subscribers', { action: 'send-confirmations' }).then(function (r) {
        total += r.sent;
        say($('subs-msg'), 'Sent ' + total + ' confirmation email(s)' + (r.remaining ? ', ' + r.remaining + ' to go…' : '.'), r.remaining ? '' : 'ok');
        if (r.remaining && r.sent) return step();
      });
    };
    say($('subs-msg'), 'Sending…', '');
    step().then(loadSubs).catch(function (err) { say($('subs-msg'), err.message, 'err'); }).then(function () { btn.disabled = false; });
  });
  $('export-csv').addEventListener('click', function () {
    api('/api/subscribers?format=csv').then(function (res) {
      if (!res.ok) throw new Error('Could not download the list.');
      return res.blob();
    }).then(function (blob) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wofhrad-subscribers.csv';
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (err) { say($('subs-msg'), err.message, 'err'); });
  });

  /* ---------- newsletter ---------- */
  function fillStoryPicker() {
    var sel = $('n-story'); sel.length = 1;
    stories.filter(function (s) { return s.status === 'published'; }).slice(0, 60).forEach(function (s) {
      var o = document.createElement('option'); o.value = s.id; o.textContent = s.title; sel.appendChild(o);
    });
  }
  $('n-story').addEventListener('change', function () {
    var id = $('n-story').value; if (!id) return;
    var s = stories.filter(function (x) { return x.id === id; })[0];
    var link = 'Read the full story: ' + location.origin + '/stories/' + id;
    var m = $('n-message'); m.value = (m.value.trim() ? m.value.trim() + '\n\n' : '') + (s ? s.title + '\n' : '') + link;
    if (!$('n-subject').value.trim() && s) $('n-subject').value = s.title;
    $('n-story').value = '';
  });
  function showProgress(c) {
    $('send-progress').classList.remove('hidden');
    var done = c.sent + c.skipped;
    $('progress-bar').style.width = (c.total ? Math.round(done / c.total * 100) : 100) + '%';
    $('progress-text').textContent = 'Sent ' + c.sent + ' of ' + c.total + (c.skipped ? ' (' + c.skipped + ' skipped: unsubscribed since)' : '') + '.';
  }
  // Keeps asking the server to send the next batches until the campaign is finished.
  function drive(c) {
    showProgress(c);
    if (c.status === 'sent') { say($('news-msg'), 'Finished: sent to ' + c.sent + ' subscriber' + (c.sent === 1 ? '' : 's') + '.', 'ok'); return Promise.resolve(c); }
    if (c.status === 'paused') { say($('news-msg'), 'Paused: ' + (c.error || 'the email service reported a problem') + ' You can resume it below.', 'err'); return Promise.resolve(c); }
    say($('news-msg'), 'Sending… please keep this page open.', '');
    return postJson('/api/newsletter', { action: 'continue', id: c.id }).then(drive);
  }
  function runCampaign(promise) {
    var btn = $('send-btn'); btn.disabled = true;
    return promise.then(drive).catch(function (err) {
      say($('news-msg'), err.message + ' Progress is saved: you can resume from the list below.', 'err');
    }).then(function () { btn.disabled = false; loadCampaigns(); });
  }
  $('news-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var subject = $('n-subject').value.trim(), message = $('n-message').value.trim();
    if (!subject || !message) { say($('news-msg'), 'Please add a subject and a message.', 'err'); return; }
    api('/api/subscribers').then(jsonOrError).then(function (d) {
      if (!d.confirmed) throw new Error('There are no confirmed subscribers yet.');
      if (!confirm('Send "' + subject + '" to ' + d.confirmed + ' confirmed subscriber' + (d.confirmed === 1 ? '' : 's') + '? This cannot be undone.')) return;
      return runCampaign(postJson('/api/newsletter', { subject: subject, message: message }).then(function (c) {
        $('n-subject').value = ''; $('n-message').value = ''; return c;
      }));
    }).catch(function (err) { say($('news-msg'), err.message, 'err'); });
  });
  function loadCampaigns() {
    api('/api/newsletter').then(jsonOrError).then(function (d) {
      var box = $('campaign-list'); box.textContent = '';
      if (!d.campaigns.length) { box.appendChild(mk('p', 'muted', 'No newsletters sent yet.')); return; }
      d.campaigns.forEach(function (c) {
        var row = mk('div', 'row');
        var left = mk('div');
        var t = mk('div', 'row-title');
        t.appendChild(mk('span', 'badge ' + (c.status === 'sent' ? 'pub' : 'draft'), c.status === 'sent' ? 'Sent' : 'Not finished'));
        t.appendChild(document.createTextNode(c.subject));
        left.appendChild(t);
        left.appendChild(mk('div', 'row-meta', fmtTime(c.createdAt) + ' by ' + c.createdBy + ' · ' + c.sent + ' of ' + c.total + ' sent' + (c.error ? ' · last problem: ' + c.error : '')));
        row.appendChild(left);
        if (c.status !== 'sent') {
          var go = mk('button', 'btn btn-small', 'Resume sending'); go.type = 'button';
          go.addEventListener('click', function () { runCampaign(postJson('/api/newsletter', { action: 'continue', id: c.id })); });
          row.appendChild(go);
        }
        box.appendChild(row);
      });
    }).catch(function (err) { $('campaign-list').textContent = err.message; });
  }

  /* ---------- settings ---------- */
  var SETTINGS = ['donateLink', 'orangeMoney', 'afrimoney', 'bankDetails', 'whatsapp', 'registrationNumber'];
  function loadSettings() {
    say($('settings-msg'), '', '');
    fetch('/api/settings', { cache: 'no-store' }).then(jsonOrError).then(function (s) {
      SETTINGS.forEach(function (k) { $('s-' + k).value = s[k] || ''; });
    }).catch(function (err) { say($('settings-msg'), err.message, 'err'); });
  }
  $('settings-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {}; SETTINGS.forEach(function (k) { body[k] = $('s-' + k).value.trim(); });
    var btn = $('settings-btn'); btn.disabled = true; say($('settings-msg'), 'Saving…', '');
    postJson('/api/settings', body, 'PUT')
      .then(function () { say($('settings-msg'), 'Saved. The Donate and Reports pages now show these details.', 'ok'); })
      .catch(function (err) { say($('settings-msg'), err.message, 'err'); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- activity ---------- */
  function loadActivity() {
    api('/api/activity').then(jsonOrError).then(function (d) {
      var box = $('activity-list'); box.textContent = '';
      if (!d.items.length) { box.appendChild(mk('p', 'muted', 'Nothing recorded yet.')); return; }
      d.items.forEach(function (a) {
        var row = mk('div', 'row');
        var left = mk('div');
        left.appendChild(mk('div', 'row-title', a.user + ': ' + a.action));
        left.appendChild(mk('div', 'row-meta', fmtTime(a.at) + (a.detail ? ' · ' + a.detail : '')));
        row.appendChild(left); box.appendChild(row);
      });
    }).catch(function (err) { $('activity-list').textContent = err.message; });
  }
  $('refresh-activity').addEventListener('click', loadActivity);

  /* ---------- photos for profiles: square crop, uploaded with a small copy ---------- */
  function squarePhoto(file, side) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('Please choose a JPG, PNG or WebP photo.'));
    var load = window.createImageBitmap ? createImageBitmap(file) : new Promise(function (ok, no) {
      var im = new Image(); im.onload = function () { ok(im); }; im.onerror = no; im.src = URL.createObjectURL(file);
    });
    return load.then(function (bmp) {
      var w = bmp.width, h = bmp.height, s0 = Math.min(w, h);
      var c = document.createElement('canvas'); c.width = Math.min(side, s0); c.height = c.width;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, (w - s0) / 2, (h - s0) / 4, s0, s0, 0, 0, c.width, c.height); // keep faces: crop slightly towards the top
      return new Promise(function (ok, no) { c.toBlob(function (b) { b ? ok(b) : no(new Error('Could not prepare the photo.')); }, 'image/jpeg', 0.85); });
    });
  }
  function uploadPortrait(file) {
    var send = function (blob, q) { return api('/api/image' + (q || ''), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).then(jsonOrError); };
    return squarePhoto(file, 800).then(function (b) { return send(b); }).then(function (d) {
      return squarePhoto(file, 240).then(function (b) { return send(b, '?thumbFor=' + encodeURIComponent(d.id)); }).catch(function () {}).then(function () { return d.id; });
    });
  }
  function setPreview(box, url, name) {
    box.textContent = '';
    if (url) { var im = document.createElement('img'); im.src = url; im.alt = ''; box.appendChild(im); }
    else box.textContent = (name || '').split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join('');
  }

  /* ---------- my profile ---------- */
  var me = null, mePhoto;
  function loadMe() {
    say($('me-msg'), '', ''); say($('pw-msg'), '', '');
    api('/api/staff?me=1').then(jsonOrError).then(function (d) {
      me = d.profile;
      if (!me) { $('me-form').classList.add('hidden'); return; }
      mePhoto = undefined;
      $('me-view').href = '/team/' + encodeURIComponent(me.slug);
      var facts = $('me-facts'); facts.textContent = '';
      [['Name', me.name], ['Login email', me.email], ['Job title', me.title], ['On the website', me.visible ? 'Shown' : 'Hidden by an administrator']].forEach(function (f) {
        var div = mk('div'); div.appendChild(mk('dt', null, f[0])); div.appendChild(mk('dd', null, f[1] || '')); facts.appendChild(div);
      });
      $('me-bio').value = me.bio || ''; counter($('me-bio'), $('me-bio-count'), 4000);
      setPreview($('me-photo'), me.photoUrl, me.name);
    }).catch(function (err) { say($('me-msg'), err.message, 'err'); });
  }
  $('me-bio').addEventListener('input', function () { counter($('me-bio'), $('me-bio-count'), 4000); });
  $('me-photo-file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    say($('me-msg'), 'Uploading photo…', '');
    uploadPortrait(f).then(function (id) { mePhoto = id; setPreview($('me-photo'), '/api/image?id=' + id + '&size=sm'); say($('me-msg'), 'Photo ready. Press "Save my profile" to use it.', ''); })
      .catch(function (err) { say($('me-msg'), err.message, 'err'); }).then(function () { e.target.value = ''; });
  });
  $('me-photo-remove').addEventListener('click', function () { mePhoto = null; setPreview($('me-photo'), null, me && me.name); say($('me-msg'), 'Press "Save my profile" to remove your photo.', ''); });
  $('me-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { bio: $('me-bio').value }; if (mePhoto !== undefined) body.photo = mePhoto;
    var btn = $('me-save'); btn.disabled = true; say($('me-msg'), 'Saving…', '');
    postJson('/api/staff?me=1', body, 'PUT').then(function (d) { me = d.profile; mePhoto = undefined; say($('me-msg'), 'Saved. Your public profile is updated.', 'ok'); })
      .catch(function (err) { say($('me-msg'), err.message, 'err'); }).then(function () { btn.disabled = false; });
  });
  $('pw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('pw-btn'); btn.disabled = true; say($('pw-msg'), 'Saving…', '');
    postJson('/api/staff?action=password', { current: $('pw-current').value, next: $('pw-new').value })
      .then(function () { $('pw-form').reset(); logout('Password changed. Please log in with your new password.'); })
      .catch(function (err) { say($('pw-msg'), err.message, 'err'); }).then(function () { btn.disabled = false; });
  });

  /* ---------- team (administrators) ---------- */
  var team = [], editingStaff = null, sfPhoto;
  var STATUS = { profile: 'No account', invited: 'Invited', active: 'Active' };
  function showInvite(name, r) {
    if (!r) return;
    $('invite-box').classList.remove('hidden');
    $('invite-text').textContent = r.emailed
      ? 'Invitation emailed to ' + name + '. You can also send them this link (it works once, for 7 days):'
      : 'Email is not set up, so nothing was emailed. Send ' + name + ' this link by WhatsApp or in person (it works once, for 7 days):';
    $('invite-url').value = r.url;
  }
  $('invite-copy').addEventListener('click', function () {
    var v = $('invite-url').value;
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { $('invite-copy').textContent = 'Copied'; setTimeout(function () { $('invite-copy').textContent = 'Copy link'; }, 2000); });
    else { $('invite-url').select(); }
  });
  function loadTeam() {
    say($('team-msg'), '', '');
    api('/api/staff?all=1').then(jsonOrError).then(function (d) {
      team = d.staff;
      var active = team.filter(function (s) { return s.status === 'active'; }).length;
      $('team-summary').textContent = team.length + ' people · ' + active + ' with active accounts';
      var box = $('team-list'); box.textContent = '';
      team.forEach(function (s) {
        var row = mk('div', 'row');
        var left = mk('div', 'staff-row-left');
        var ph = s.photoUrl ? document.createElement('img') : mk('span', null, s.name.split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join(''));
        ph.className = 'staff-row-photo'; if (s.photoUrl) { ph.src = s.photoUrl; ph.alt = ''; }
        left.appendChild(ph);
        var info = mk('div');
        var t = mk('div', 'row-title');
        t.appendChild(mk('span', 'badge ' + s.status, STATUS[s.status]));
        if (!s.visible) t.appendChild(mk('span', 'badge hiddenp', 'Hidden'));
        t.appendChild(document.createTextNode(s.name));
        info.appendChild(t);
        info.appendChild(mk('div', 'row-meta', [s.title, s.email || 'no email', s.status !== 'profile' ? ({ admin: 'Administrator', editor: 'Editor', staff: 'Staff' })[s.role] : '', s.lastLoginAt ? 'last login ' + fmtDate(s.lastLoginAt) : ''].filter(Boolean).join(' · ')));
        left.appendChild(info);
        var actions = mk('div', 'row-actions');
        var view = mk('a', 'btn btn-ghost btn-small', 'View'); view.href = '/team/' + encodeURIComponent(s.slug); view.target = '_blank'; view.rel = 'noopener';
        if (s.visible) actions.appendChild(view);
        var ed = mk('button', 'btn btn-ghost btn-small', 'Edit'); ed.type = 'button'; ed.addEventListener('click', function () { openStaffForm(s); });
        actions.appendChild(ed);
        if (s.email) {
          var inv = mk('button', 'btn btn-ghost btn-small', s.status === 'active' ? 'Send reset link' : s.status === 'invited' ? 'Resend invitation' : 'Invite');
          inv.type = 'button';
          inv.addEventListener('click', function () {
            inv.disabled = true;
            postJson('/api/staff?id=' + encodeURIComponent(s.id) + '&action=invite', {}).then(function (r) { showInvite(s.name, r); loadTeam(); })
              .catch(function (err) { say($('team-msg'), err.message, 'err'); }).then(function () { inv.disabled = false; });
          });
          actions.appendChild(inv);
        }
        var rm = mk('button', 'btn btn-danger', 'Remove'); rm.type = 'button';
        rm.addEventListener('click', function () {
          if (!confirm('Remove ' + s.name + ' from the team?\n\nTheir profile disappears from the website and their account stops working straight away. This cannot be undone.')) return;
          api('/api/staff?id=' + encodeURIComponent(s.id), { method: 'DELETE' }).then(jsonOrError).then(function () { say($('team-msg'), s.name + ' has been removed.', 'ok'); loadTeam(); })
            .catch(function (err) { say($('team-msg'), err.message, 'err'); });
        });
        actions.appendChild(rm);
        row.appendChild(left); row.appendChild(actions); box.appendChild(row);
      });
    }).catch(function (err) { $('team-list').textContent = err.message; });
  }
  function openStaffForm(s) {
    editingStaff = s || null; sfPhoto = undefined;
    $('staff-form').classList.remove('hidden');
    $('staff-form-title').textContent = s ? 'Edit ' + s.name : 'Add a staff member';
    $('sf-name').value = s ? s.name : ''; $('sf-email').value = s ? s.email || '' : ''; $('sf-title').value = s ? s.title || '' : '';
    $('sf-role').value = s ? s.role : 'staff'; $('sf-leader').checked = s ? s.leader : false; $('sf-visible').checked = s ? s.visible : true;
    $('sf-invite-wrap').classList.toggle('hidden', Boolean(s)); $('sf-invite').checked = true;
    $('sf-edit-only').classList.toggle('hidden', !s);
    if (s) { $('sf-order').value = s.order; $('sf-bio').value = s.bio || ''; setPreview($('sf-photo'), s.photoUrl, s.name); }
    say($('sf-msg'), '', '');
    $('sf-name').focus();
  }
  $('team-add-open').addEventListener('click', function () { openStaffForm(null); });
  $('sf-cancel').addEventListener('click', function () { $('staff-form').classList.add('hidden'); });
  $('sf-photo-file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    say($('sf-msg'), 'Uploading photo…', '');
    uploadPortrait(f).then(function (id) { sfPhoto = id; setPreview($('sf-photo'), '/api/image?id=' + id + '&size=sm'); say($('sf-msg'), 'Photo ready. Press Save to use it.', ''); })
      .catch(function (err) { say($('sf-msg'), err.message, 'err'); }).then(function () { e.target.value = ''; });
  });
  $('sf-photo-remove').addEventListener('click', function () { sfPhoto = null; setPreview($('sf-photo'), null, $('sf-name').value); });
  $('staff-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { name: $('sf-name').value.trim(), email: $('sf-email').value.trim(), title: $('sf-title').value.trim(), role: $('sf-role').value, leader: $('sf-leader').checked, visible: $('sf-visible').checked };
    if (!body.name) { say($('sf-msg'), 'Please enter their full name.', 'err'); $('sf-name').focus(); return; }
    if (!body.title) { say($('sf-msg'), 'Please enter their job title.', 'err'); $('sf-title').focus(); return; }
    var url = '/api/staff', method = 'POST';
    if (editingStaff) { url += '?id=' + encodeURIComponent(editingStaff.id); method = 'PUT'; body.order = $('sf-order').value; body.bio = $('sf-bio').value; if (sfPhoto !== undefined) body.photo = sfPhoto; }
    else { body.invite = $('sf-invite').checked && Boolean(body.email); }
    if (!editingStaff && $('sf-invite').checked && !body.email) { say($('sf-msg'), 'Add their email address to send an invitation, or untick "Send invitation now".', 'err'); return; }
    var btn = $('sf-save'); btn.disabled = true; say($('sf-msg'), 'Saving…', '');
    postJson(url, body, method).then(function (d) {
      $('staff-form').classList.add('hidden');
      if (d.invite) showInvite(body.name, d.invite); else $('invite-box').classList.add('hidden');
      say($('team-msg'), (editingStaff ? 'Saved changes to ' : 'Added ') + body.name + '.', 'ok');
      loadTeam();
    }).catch(function (err) { say($('sf-msg'), err.message, 'err'); }).then(function () { btn.disabled = false; });
  });

  /* ---------- forgot password, and invitation / reset links ---------- */
  $('forgot-open').addEventListener('click', function () { $('forgot-form').classList.toggle('hidden'); $('forgot-email').value = $('login-name').value.indexOf('@') > 0 ? $('login-name').value : ''; $('forgot-email').focus(); });
  $('forgot-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('forgot-btn'); btn.disabled = true; say($('forgot-msg'), 'Sending…', '');
    fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'forgot', email: $('forgot-email').value.trim() }) })
      .then(jsonOrError).then(function (d) { say($('forgot-msg'), d.message, 'ok'); })
      .catch(function (err) { say($('forgot-msg'), err.message, 'err'); }).then(function () { btn.disabled = false; });
  });
  var setupToken = new URLSearchParams(location.search).get('setup');
  if (setupToken) {
    history.replaceState(null, '', location.pathname); // keep the one-time link out of the address bar
    $('login-view').classList.add('hidden'); $('setup-view').classList.remove('hidden');
    fetch('/api/account?t=' + encodeURIComponent(setupToken)).then(jsonOrError).then(function (d) {
      $('setup-title').textContent = d.purpose === 'reset' ? 'Choose a new password' : 'Welcome to the team, ' + d.name.split(/\s+/)[0];
      $('setup-name').textContent = d.name; $('setup-email').textContent = d.email; $('setup-job').textContent = d.title || '';
    }).catch(function (err) {
      $('setup-details').classList.add('hidden');
      say($('setup-msg'), err.message, 'err');
    });
    $('setup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if ($('setup-pw').value !== $('setup-pw2').value) { say($('setup-msg'), 'The two passwords are different. Please type them again.', 'err'); return; }
      var btn = $('setup-btn'); btn.disabled = true; say($('setup-msg'), 'Saving…', '');
      fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setup', t: setupToken, password: $('setup-pw').value }) })
        .then(jsonOrError).then(function (d) {
          token = d.token; session = { token: d.token, name: d.name, role: d.role, kind: d.kind, id: d.id };
          sessionStorage.setItem('wofhrad_admin', JSON.stringify(session));
          say($('setup-msg'), '', ''); showApp(); openTab('me');
        }).catch(function (err) { say($('setup-msg'), err.message, 'err'); }).then(function () { btn.disabled = false; });
    });
  }

  if (token && !setupToken) showApp();
})();
