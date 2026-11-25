/* Homepage: contact form and "Latest stories". */
(function () {
  'use strict';
  var W = window.WOFHRAD;

  /* ---------- contact form ---------- */
  var form = document.getElementById('contact-form');
  if (form) {
    var submitBtn = document.getElementById('form-submit');
    var okBox = document.getElementById('form-success');
    var errBox = document.getElementById('form-error');
    var reasonSel = document.getElementById('f-reason');
    var REASONS = ['general', 'partnership', 'internship', 'volunteering', 'donation', 'media'];

    // Links such as /?reason=internship#contact pre-select the topic.
    var wanted = new URLSearchParams(location.search).get('reason');
    if (wanted && REASONS.indexOf(wanted) > -1) reasonSel.value = wanted;

    var showError = function (text, field) {
      errBox.textContent = text;
      errBox.style.display = 'block';
      if (field) {
        var el = document.getElementById(field);
        el.setAttribute('aria-invalid', 'true');
        el.focus();
      }
    };
    form.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      okBox.style.display = 'none';
      okBox.textContent = '';
      errBox.style.display = 'none';
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var name = v('f-name'), email = v('f-email'), message = v('f-message');
      if (!name) { showError('Please enter your name.', 'f-name'); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('Please enter a valid email address.', 'f-email'); return; }
      if (!message) { showError('Please write a message.', 'f-message'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      W.postJson('/api/contact', {
        reason: reasonSel.value, name: name, email: email, phone: v('f-phone'), subject: v('f-subject'), message: message,
        website: form.elements.website ? form.elements.website.value : ''
      }).then(function (r) {
        if (r.ok) {
          form.reset();
          okBox.textContent = '✓ Thank you! Your message has been received. We’ll be in touch soon.';
          okBox.style.display = 'block';
        } else {
          showError(r.data.error || 'Sorry, your message could not be sent. Please try again.');
        }
      }).catch(function () {
        showError('We could not send your message right now. Please email ' + document.querySelector('a[href^="mailto:"]').textContent + ' instead.');
      }).then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
      });
    });
  }

  /* ---------- latest stories ---------- */
  var box = document.getElementById('latest-stories');
  if (box) {
    var grid = box.querySelector('.story-grid');
    fetch('/api/posts?limit=3').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (data) {
      if (!data.posts || !data.posts.length) return;
      data.posts.forEach(function (p) { grid.appendChild(W.storyCard(p)); });
      box.hidden = false;
    }).catch(function () { /* no stories or no server: keep the section hidden */ });
  }
})();
