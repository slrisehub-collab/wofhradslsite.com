/* Stories list: programme filter and "Load more". Each story has its own page at /stories/<id>. */
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
  var programme = W.PROGRAMMES[params.get('programme')] ? params.get('programme') : '';
  var offset = 0;

  function chip(value, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'filter-chip'; b.textContent = label;
    b.setAttribute('aria-pressed', value === programme ? 'true' : 'false');
    b.addEventListener('click', function () {
      programme = value;
      filters.querySelectorAll('.filter-chip').forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      var u = new URL(location.href);
      if (value) u.searchParams.set('programme', value); else u.searchParams.delete('programme');
      history.replaceState(null, '', u);
      grid.textContent = ''; offset = 0; load();
    });
    return b;
  }
  filters.appendChild(chip('', 'All stories'));
  Object.keys(W.PROGRAMMES).forEach(function (k) { filters.appendChild(chip(k, W.PROGRAMMES[k])); });

  function load() {
    more.hidden = true;
    state.hidden = false;
    state.textContent = 'Loading stories…';
    var q = '/api/posts?limit=' + PAGE + '&offset=' + offset + (programme ? '&programme=' + encodeURIComponent(programme) : '');
    fetch(q).then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (data) {
      data.posts.forEach(function (p) { grid.appendChild(W.storyCard(p)); });
      offset += data.posts.length;
      if (!offset) {
        state.textContent = programme
          ? 'No stories from this programme yet. Try "All stories".'
          : 'No stories yet. Please check back soon.';
      } else {
        state.textContent = 'Showing ' + offset + ' of ' + data.total + ' stories.';
      }
      more.hidden = offset >= data.total;
    }).catch(function () {
      state.textContent = 'Stories could not be loaded right now. Please try again later.';
    });
  }
  more.addEventListener('click', load);
  load();
})();
