/* Stories list: search, year, programme filter and "Load more". Each story has its own page. */
(function () {
  'use strict';
  var W = window.WOFHRAD;
  var params = new URLSearchParams(location.search);

  // Old links (stories.html?id=...) go to the story's own page.
  var oldId = params.get('id');
  if (oldId) { location.replace('/stories/' + encodeURIComponent(oldId)); return; }

  var PAGE = 12;
  var grid = document.getElementById('story-grid');
  var state = document.getElementById('list-state');
  var more = document.getElementById('load-more');
  var filters = document.getElementById('filters');
  var q = document.getElementById('q');
  var yearSel = document.getElementById('year');
  var programme = W.PROGRAMMES[params.get('programme')] ? params.get('programme') : '';
  var offset = 0, seq = 0, yearsFilled = false;
  q.value = params.get('q') || '';

  function syncUrl() {
    var u = new URL(location.href);
    [['programme', programme], ['q', q.value.trim()], ['year', yearSel.value]].forEach(function (p) {
      if (p[1]) u.searchParams.set(p[0], p[1]); else u.searchParams.delete(p[0]);
    });
    history.replaceState(null, '', u);
  }
  function restart() { grid.textContent = ''; offset = 0; syncUrl(); load(); }

  function chip(value, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'filter-chip'; b.textContent = label;
    b.setAttribute('aria-pressed', value === programme ? 'true' : 'false');
    b.addEventListener('click', function () {
      programme = value;
      filters.querySelectorAll('.filter-chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      restart();
    });
    return b;
  }
  filters.appendChild(chip('', 'All programmes'));
  Object.keys(W.PROGRAMMES).forEach(function (k) { filters.appendChild(chip(k, W.PROGRAMMES[k])); });

  var timer;
  q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(restart, 300); });
  document.getElementById('story-search').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); restart(); });
  yearSel.addEventListener('change', restart);

  function load() {
    var mine = ++seq;
    more.hidden = true;
    state.hidden = false;
    state.textContent = 'Loading stories…';
    var query = '/api/posts?limit=' + PAGE + '&offset=' + offset +
      (programme ? '&programme=' + encodeURIComponent(programme) : '') +
      (q.value.trim() ? '&q=' + encodeURIComponent(q.value.trim()) : '') +
      (yearSel.value ? '&year=' + encodeURIComponent(yearSel.value) : '');
    fetch(query).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (data) {
      if (mine !== seq) return; // a newer search has started
      if (!yearsFilled && !programme && !q.value.trim()) {
        data.years.forEach(function (y) { var o = document.createElement('option'); o.value = y; o.textContent = y; yearSel.appendChild(o); });
        yearSel.value = params.get('year') || '';
        yearsFilled = true;
      }
      data.posts.forEach(function (p) { grid.appendChild(W.storyCard(p)); });
      offset += data.posts.length;
      if (!offset) {
        state.textContent = (q.value.trim() || yearSel.value || programme)
          ? 'No stories match. Try a different search or "All programmes".'
          : 'No stories yet. Please check back soon.';
      } else {
        state.textContent = 'Showing ' + offset + ' of ' + data.total + ' stories.';
      }
      more.hidden = offset >= data.total;
    }).catch(function () {
      if (mine === seq) state.textContent = 'Stories could not be loaded right now. Please try again later.';
    });
  }
  more.addEventListener('click', load);
  if (params.get('year')) { var o = document.createElement('option'); o.value = params.get('year'); o.textContent = params.get('year'); yearSel.appendChild(o); yearSel.value = o.value; }
  load();
})();
