/* Newsletter sign-up forms and the "Latest stories" block. */
(function () {
  'use strict';

  var fmtDate = function (iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  window.WOFHRAD = window.WOFHRAD || {};
  window.WOFHRAD.fmtDate = fmtDate;

  /* Newsletter forms: <form data-subscribe> */
  document.querySelectorAll('form[data-subscribe]').forEach(function (form) {
    var msg = form.querySelector('.subscribe-msg');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      msg.className = 'subscribe-msg';
      if (!email) { msg.textContent = 'Please enter your email address.'; msg.classList.add('err'); return; }
      btn.disabled = true;
      msg.textContent = 'Subscribing...';
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, website: form.elements.website ? form.elements.website.value : '' })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.ok) {
            msg.textContent = 'Thank you! You are now subscribed to our newsletter.';
            msg.classList.add('ok');
            form.reset();
          } else {
            msg.textContent = data.error || 'Sorry, we could not subscribe you. Please try again.';
            msg.classList.add('err');
          }
        });
      }).catch(function () {
        msg.textContent = 'We could not reach the server. Please try again in a moment.';
        msg.classList.add('err');
      }).then(function () { btn.disabled = false; });
    });
  });

  /* Latest stories on the homepage */
  var box = document.getElementById('latest-stories');
  if (box) {
    var grid = box.querySelector('.story-grid');
    fetch('/api/posts?limit=3').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (data) {
      if (!data.posts || !data.posts.length) return;
      data.posts.forEach(function (p) {
        var a = document.createElement('a');
        a.className = 'story-card';
        a.href = 'stories.html?id=' + encodeURIComponent(p.id);
        if (p.cover) {
          var img = document.createElement('img');
          img.className = 'story-thumb';
          img.loading = 'lazy';
          img.alt = '';
          img.src = '/api/image?id=' + encodeURIComponent(p.cover);
          a.appendChild(img);
        } else {
          var ph = document.createElement('div');
          ph.className = 'story-thumb-empty';
          ph.textContent = 'WOFHRAD-SL';
          a.appendChild(ph);
        }
        var body = document.createElement('div');
        body.className = 'story-body';
        var d = document.createElement('span'); d.className = 'story-date'; d.textContent = fmtDate(p.date);
        var h = document.createElement('h3'); h.textContent = p.title;
        var t = document.createElement('p'); t.textContent = p.excerpt;
        var m = document.createElement('span'); m.className = 'story-more'; m.textContent = 'Read story \u2192';
        body.appendChild(d); body.appendChild(h); body.appendChild(t); body.appendChild(m);
        a.appendChild(body);
        grid.appendChild(a);
      });
      box.hidden = false;
    }).catch(function () { /* no stories or no server: keep the section hidden */ });
  }
})();
