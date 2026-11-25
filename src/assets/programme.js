/* Programme pages: stories tagged with this programme. */
(function () {
  'use strict';
  var W = window.WOFHRAD;
  var main = document.querySelector('[data-programme]');
  var box = document.getElementById('related');
  if (!main || !box) return;
  fetch('/api/posts?limit=3&programme=' + encodeURIComponent(main.getAttribute('data-programme')))
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (d) {
      if (!d.posts.length) return;
      var grid = box.querySelector('.story-grid');
      d.posts.forEach(function (p) { grid.appendChild(W.storyCard(p)); });
      box.hidden = false;
    }).catch(function () {});
})();
