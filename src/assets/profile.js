/* Staff profile page: stories this person wrote. */
(function () {
  'use strict';
  var W = window.WOFHRAD;
  var main = document.querySelector('[data-person]');
  var box = document.getElementById('related');
  if (!main || !box) return;
  fetch('/api/posts?limit=3&author=' + encodeURIComponent(main.getAttribute('data-person')))
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (d) {
      if (!d.posts.length) return;
      var grid = box.querySelector('.story-grid');
      d.posts.forEach(function (p) { grid.appendChild(W.storyCard(p)); });
      box.hidden = false;
    }).catch(function () {});
})();
