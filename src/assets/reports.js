/* Reports page: documents and registration number, both managed in the admin panel. */
(function () {
  'use strict';
  var list = document.getElementById('doc-list');
  var state = document.getElementById('doc-state');
  fetch('/api/documents').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) {
    if (!d.documents.length) { state.textContent = 'Our reports will be published here soon. Please contact us if you need one now.'; return; }
    state.hidden = true;
    d.documents.forEach(function (doc) {
      var li = document.createElement('li'); li.className = 'doc-item';
      var left = document.createElement('div');
      var h = document.createElement('h3'); h.textContent = doc.title; left.appendChild(h);
      var p = document.createElement('p'); p.textContent = [doc.year, 'PDF', Math.max(1, Math.round(doc.size / 1024)) + ' KB'].filter(Boolean).join(' · '); left.appendChild(p);
      var a = document.createElement('a'); a.className = 'btn btn-outline-blue'; a.href = '/api/documents?id=' + encodeURIComponent(doc.id);
      a.textContent = 'Download'; a.setAttribute('aria-label', 'Download ' + doc.title + ' (PDF)');
      li.appendChild(left); li.appendChild(a); list.appendChild(li);
    });
  }).catch(function () { state.textContent = 'Reports could not be loaded right now. Please try again later.'; });

  fetch('/api/settings').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (s) {
    if (s.registrationNumber) {
      document.getElementById('reg-number').textContent = s.registrationNumber;
      document.getElementById('reg-row').hidden = false;
    }
  }).catch(function () {});
})();
