/* Single story page: "Copy link", "Print" and more stories. Everything else is already in the HTML. */
(function () {
  'use strict';
  var W = window.WOFHRAD;
  var copy = document.getElementById('copy-link');
  if (copy) {
    copy.hidden = false;
    copy.addEventListener('click', function () {
      var url = copy.getAttribute('data-url');
      var done = function () { copy.textContent = 'Link copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
      else window.prompt('Copy this link:', url);
    });
  }
  var printBtn = document.getElementById('print-story');
  if (printBtn && window.print) { printBtn.hidden = false; printBtn.addEventListener('click', function () { window.print(); }); }

  // More stories: from the same programme first, then the latest.
  var main = document.querySelector('[data-story]');
  var box = document.getElementById('related');
  if (!main || !box || !main.getAttribute('data-story')) return;
  var id = main.getAttribute('data-story'), programme = main.getAttribute('data-programme');
  var get = function (q) { return fetch('/api/posts?limit=3&exclude=' + encodeURIComponent(id) + q).then(function (r) { return r.ok ? r.json() : { posts: [] }; }); };
  (programme ? get('&programme=' + encodeURIComponent(programme)) : Promise.resolve({ posts: [] })).then(function (a) {
    if (a.posts.length >= 3) return a.posts;
    return get('').then(function (b) {
      var seen = {}; a.posts.forEach(function (p) { seen[p.id] = 1; });
      return a.posts.concat(b.posts.filter(function (p) { return !seen[p.id]; })).slice(0, 3);
    });
  }).then(function (list) {
    if (!list.length) return;
    var grid = box.querySelector('.story-grid');
    list.forEach(function (p) { grid.appendChild(W.storyCard(p)); });
    box.hidden = false;
  }).catch(function () {});
})();
