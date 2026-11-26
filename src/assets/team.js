/* About page: the team, from the staff profiles managed in the admin panel.
   Each photo and name links to that person's profile page. */
(function () {
  'use strict';
  var leaders = document.getElementById('team-leaders');
  var grid = document.getElementById('team-grid');
  var state = document.getElementById('team-state');
  if (!leaders || !grid) return;
  function initials(name) { return name.split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join(''); }
  function photo(p, size) {
    if (!p.photoUrl) { var d = document.createElement('span'); d.className = 'team-initials'; d.setAttribute('aria-hidden', 'true'); d.textContent = initials(p.name); return d; }
    var img = document.createElement('img'); img.src = p.photoUrl; img.alt = ''; img.loading = 'lazy'; img.width = size; img.height = size; return img;
  }
  fetch('/api/staff').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
    d.staff.forEach(function (p) {
      var href = '/team/' + encodeURIComponent(p.slug);
      if (p.leader) {
        var card = document.createElement('a'); card.className = 'leader-card reveal visible'; card.href = href;
        card.appendChild(photo(p, 110));
        var t = document.createElement('div');
        var h = document.createElement('h3'); h.textContent = p.name;
        var r = document.createElement('p'); r.textContent = p.title;
        var more = document.createElement('span'); more.className = 'team-more'; more.textContent = 'Read profile →';
        t.appendChild(h); t.appendChild(r); t.appendChild(more); card.appendChild(t);
        leaders.appendChild(card);
      } else {
        var li = document.createElement('li'); li.className = 'team-member';
        var a = document.createElement('a'); a.href = href; a.className = 'team-link';
        a.appendChild(photo(p, 90));
        var n = document.createElement('h3'); n.className = 'team-name'; n.textContent = p.name;
        var j = document.createElement('p'); j.textContent = p.title;
        a.appendChild(n); a.appendChild(j); li.appendChild(a); grid.appendChild(li);
      }
    });
    state.hidden = true;
  }).catch(function () { state.textContent = 'The team list could not be loaded right now. Please try again later.'; });
})();
