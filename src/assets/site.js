/* Shared behaviour for every public page: menu, scroll effects, newsletter forms. */
(function () {
  'use strict';
  var W = (window.WOFHRAD = window.WOFHRAD || {});

  W.fmtDate = function (iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  // POST JSON and resolve to { ok, status, data } without ever throwing on a bad body.
  W.postJson = function (url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      });
  };

  W.PROGRAMMES = {
    'icsp': "Women's Empowerment (ICSP)",
    'girls-circle': 'Girls Circle Collective',
    'people-to-people': 'People to People',
    'gesa': 'Gender Equality & Accountability',
    'peacebuilding': 'Peacebuilding'
  };
  W.storyUrl = function (p) { return '/stories/' + encodeURIComponent(p.id); };
  W.imgUrl = function (id, small) { return '/api/image?id=' + encodeURIComponent(id) + (small ? '&size=sm' : ''); };

  // One story card, built with textContent so story text can never inject HTML.
  W.storyCard = function (p) {
    var a = document.createElement('a');
    a.className = 'story-card';
    a.href = p.url || W.storyUrl(p);
    var cover = p.coverUrl || (p.cover ? W.imgUrl(p.cover, true) : null);
    if (cover) {
      var img = document.createElement('img');
      img.className = 'story-thumb';
      img.loading = 'lazy';
      img.alt = '';
      img.width = 640; img.height = 400;
      img.src = cover;
      a.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'story-thumb-empty';
      ph.textContent = 'WOFHRAD-SL';
      a.appendChild(ph);
    }
    var body = document.createElement('div');
    body.className = 'story-body';
    var meta = document.createElement('div'); meta.className = 'story-meta-line';
    var d = document.createElement('span'); d.textContent = W.fmtDate(p.date); meta.appendChild(d);
    if (p.readingMinutes) { var m0 = document.createElement('span'); m0.className = 'mins'; m0.textContent = p.readingMinutes + ' min read'; meta.appendChild(m0); }
    if (p.programme && W.PROGRAMMES[p.programme]) {
      var t = document.createElement('span'); t.className = 'story-tag'; t.textContent = W.PROGRAMMES[p.programme]; meta.appendChild(t);
    }
    var h = document.createElement('h3'); h.textContent = p.title;
    var x = document.createElement('p'); x.textContent = p.excerpt;
    var m = document.createElement('span'); m.className = 'story-more'; m.textContent = 'Read story →';
    body.appendChild(meta); body.appendChild(h); body.appendChild(x); body.appendChild(m);
    a.appendChild(body);
    return a;
  };

  /* Years since founding, and the copyright year, stay right without a redeploy. */
  var now = new Date().getFullYear();
  document.querySelectorAll('[data-years-since]').forEach(function (el) {
    var y = parseInt(el.getAttribute('data-years-since'), 10);
    if (y) el.textContent = String(now - y);
  });
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(now); });

  /* Navbar, progress bar, back-to-top and floating donate button */
  var navbar = document.getElementById('navbar');
  var progress = document.getElementById('scroll-progress');
  var backTop = document.getElementById('back-top');
  var floatDonate = document.getElementById('float-donate');
  function onScroll() {
    var y = window.scrollY || 0;
    if (navbar) navbar.classList.toggle('scrolled', y > 60);
    if (backTop) backTop.classList.toggle('visible', y > 400);
    if (floatDonate) floatDonate.classList.toggle('visible', y > 400);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (backTop) backTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var main = document.getElementById('main'); if (main) main.focus({ preventScroll: true });
  });

  /* Mobile menu */
  var burger = document.getElementById('hamburger');
  var menu = document.getElementById('mobile-menu');
  function setMenu(open) {
    if (!burger || !menu) return;
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.hidden = !open;
    menu.classList.toggle('open', open);
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('click', function (e) { if (navbar && !navbar.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); burger.focus(); }
    });
  }

  /* Scroll reveal. Without IntersectionObserver, show everything at once. */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  /* Partner logo strip: visible pause control */
  document.querySelectorAll('.marquee-toggle').forEach(function (btn) {
    var wrap = document.getElementById(btn.getAttribute('aria-controls'));
    if (!wrap) return;
    btn.addEventListener('click', function () {
      var paused = wrap.classList.toggle('paused');
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.textContent = paused ? 'Play logos' : 'Pause logos';
    });
  });

  /* Highlight the homepage section in view */
  var sectionLinks = document.querySelectorAll('.nav-links a[href^="/#"]');
  if (sectionLinks.length && (location.pathname === '/' || /index\.html$/.test(location.pathname))) {
    var sections = document.querySelectorAll('main section[id]');
    window.addEventListener('scroll', function () {
      var pos = window.scrollY + 120;
      sections.forEach(function (sec) {
        if (pos >= sec.offsetTop && pos < sec.offsetTop + sec.offsetHeight) {
          sectionLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '/#' + sec.id); });
        }
      });
    }, { passive: true });
  }

  /* Newsletter forms: <form data-subscribe> */
  document.querySelectorAll('form[data-subscribe]').forEach(function (form) {
    var msg = form.querySelector('.subscribe-msg');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      msg.className = 'subscribe-msg';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Please enter a valid email address.'; msg.classList.add('err'); form.elements.email.focus(); return;
      }
      btn.disabled = true;
      msg.textContent = 'Subscribing…';
      W.postJson('/api/subscribe', { email: email, website: form.elements.website ? form.elements.website.value : '' })
        .then(function (r) {
          if (r.ok) {
            msg.textContent = r.data.confirm
              ? 'Nearly done. We have sent you an email: please click the link in it to confirm.'
              : 'Thank you! You are now subscribed to our newsletter.';
            msg.classList.add('ok');
            form.reset();
          } else {
            msg.textContent = r.data.error || 'Sorry, we could not subscribe you. Please try again.';
            msg.classList.add('err');
          }
        })
        .catch(function () {
          msg.textContent = 'We could not reach the server. Please try again in a moment.';
          msg.classList.add('err');
        })
        .then(function () { btn.disabled = false; });
    });
  });

  /* Photo galleries: open photos in an accessible lightbox instead of leaving the page. */
  var galleries = document.querySelectorAll('[data-lightbox]');
  if (galleries.length && typeof HTMLDialogElement === 'function') {
    var dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Photo viewer');
    dlg.innerHTML = '<div class="lightbox-inner"><img alt="" /><p></p>' +
      '<button type="button" class="lb-close" aria-label="Close">×</button>' +
      '<button type="button" class="lb-prev" aria-label="Previous photo">‹</button>' +
      '<button type="button" class="lb-next" aria-label="Next photo">›</button></div>';
    document.body.appendChild(dlg);
    var lbImg = dlg.querySelector('img'), lbText = dlg.querySelector('p'), items = [], at = 0, opener = null;
    var show = function (i) {
      at = (i + items.length) % items.length;
      var link = items[at], alt = link.querySelector('img').alt;
      lbImg.src = link.getAttribute('href'); lbImg.alt = alt;
      lbText.textContent = alt + ' (' + (at + 1) + ' of ' + items.length + ')';
    };
    dlg.querySelector('.lb-close').addEventListener('click', function () { dlg.close(); });
    dlg.querySelector('.lb-prev').addEventListener('click', function () { show(at - 1); });
    dlg.querySelector('.lb-next').addEventListener('click', function () { show(at + 1); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(at - 1);
      if (e.key === 'ArrowRight') show(at + 1);
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.classList.contains('lightbox-inner')) dlg.close(); });
    dlg.addEventListener('close', function () { if (opener) opener.focus(); });
    galleries.forEach(function (g) {
      var links = Array.prototype.slice.call(g.querySelectorAll('a.gallery-item'));
      links.forEach(function (link, i) {
        link.addEventListener('click', function (e) {
          if (!dlg.showModal) return; // very old browsers just open the photo
          e.preventDefault();
          items = links; opener = link; show(i); dlg.showModal();
        });
      });
    });
  }

  /* WhatsApp: shown only when the team has saved a number in the admin settings. */
  var waLinks = document.querySelectorAll('[data-whatsapp]');
  if (waLinks.length) {
    fetch('/api/settings').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (s) {
      var n = String(s.whatsapp || '').replace(/[^0-9]/g, '');
      if (n.length < 8) return;
      waLinks.forEach(function (a) { a.href = 'https://wa.me/' + n; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.hidden = false; });
      document.querySelectorAll('[data-whatsapp-wrap]').forEach(function (el) { el.hidden = false; });
    }).catch(function () {});
  }

  /* Offline support: keeps pages you have visited available without a connection. */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();
