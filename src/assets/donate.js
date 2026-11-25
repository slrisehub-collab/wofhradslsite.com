/* Donate page: payment methods set by the team in the admin panel, and the pledge form. */
(function () {
  'use strict';
  var W = window.WOFHRAD;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- payment methods from /api/settings ---------- */
  function method(title, text, linkHref, linkText) {
    var box = document.createElement('div'); box.className = 'pay-method';
    var h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
    if (text) { var p = document.createElement('p'); p.textContent = text; box.appendChild(p); }
    if (linkHref) {
      var a = document.createElement('a'); a.className = 'btn btn-donate'; a.href = linkHref;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = linkText; box.appendChild(a);
    }
    return box;
  }
  fetch('/api/settings').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (s) {
    var list = $('pay-methods'); var n = 0;
    if (s.donateLink) { list.appendChild(method('Give online by card', 'Secure payment through our payment provider.', s.donateLink, 'Donate online')); n++; }
    if (s.orangeMoney) { list.appendChild(method('Orange Money', s.orangeMoney)); n++; }
    if (s.afrimoney) { list.appendChild(method('Afrimoney', s.afrimoney)); n++; }
    if (s.bankDetails) { list.appendChild(method('Bank transfer', s.bankDetails)); n++; }
    if (n) $('pay-box').hidden = false;
    if (s.registrationNumber) {
      $('reg-line').textContent = 'WOFHRAD-SL is a registered organisation in Sierra Leone. Registration number: ' + s.registrationNumber + '.';
      $('reg-line').hidden = false;
    }
  }).catch(function () { /* no settings: the pledge form still works */ });

  /* ---------- pledge form ---------- */
  var presets = {
    SLE: { symbol: 'Le', amounts: [100, 250, 500, 1000] },
    USD: { symbol: '$', amounts: [10, 25, 50, 100] },
    GBP: { symbol: '£', amounts: [10, 25, 50, 100] },
    EUR: { symbol: '€', amounts: [10, 25, 50, 100] }
  };
  var freq = 'one-time', currency = 'SLE', amount = null;
  var grid = $('amount-grid'), custom = $('custom-amount'), summary = $('donate-summary'), submit = $('donate-submit'), msg = $('donate-msg');
  var fmt = function (n) { return Number(n).toLocaleString('en-GB'); };

  function renderAmounts() {
    var p = presets[currency];
    grid.textContent = '';
    p.amounts.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'amount-btn' + (amount === a ? ' active' : '');
      b.textContent = p.symbol + ' ' + fmt(a);
      b.setAttribute('aria-pressed', amount === a ? 'true' : 'false');
      b.addEventListener('click', function () { amount = a; custom.value = ''; update(); });
      grid.appendChild(b);
    });
    $('custom-symbol').textContent = p.symbol;
  }
  function update() {
    renderAmounts();
    var p = presets[currency];
    if (amount && amount > 0) {
      summary.textContent = 'Your ' + (freq === 'monthly' ? 'monthly' : 'one-time') + ' gift: ' + p.symbol + ' ' + fmt(amount);
      submit.disabled = false;
    } else {
      summary.textContent = 'Select an amount to continue.';
      submit.disabled = true;
    }
  }
  document.querySelectorAll('.freq-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      freq = btn.getAttribute('data-freq');
      document.querySelectorAll('.freq-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      update();
    });
  });
  $('currency').addEventListener('change', function (e) { currency = e.target.value; amount = null; custom.value = ''; update(); });
  custom.addEventListener('input', function () { var v = parseFloat(custom.value); amount = v > 0 ? Math.round(v * 100) / 100 : null; update(); });

  $('pledge-form').addEventListener('submit', function (e) {
    e.preventDefault();
    msg.className = 'donate-msg';
    var name = $('donor-name').value.trim(), email = $('donor-email').value.trim();
    if (!amount) { msg.textContent = 'Please choose an amount.'; msg.classList.add('err'); return; }
    if (!name) { msg.textContent = 'Please enter your name.'; msg.classList.add('err'); $('donor-name').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Please enter a valid email address so we can reply.'; msg.classList.add('err'); $('donor-email').focus(); return; }
    submit.disabled = true;
    msg.textContent = 'Sending…';
    W.postJson('/api/contact', {
      reason: 'donation', name: name, email: email, phone: $('donor-phone').value.trim(),
      pledge: { amount: amount, currency: currency, frequency: freq },
      website: document.querySelector('#pledge-form [name=website]').value
    }).then(function (r) {
      if (r.ok) {
        msg.textContent = 'Thank you, ' + name + '. We have received your pledge and will contact you at ' + email + ' with payment details.';
        msg.classList.add('ok');
        amount = null; custom.value = ''; update();
      } else {
        msg.textContent = r.data.error || 'Sorry, your pledge could not be sent. Please try again or email us.';
        msg.classList.add('err');
        submit.disabled = false;
      }
    }).catch(function () {
      msg.textContent = 'We could not reach the server. Please try again, or email or call us using the details below.';
      msg.classList.add('err');
      submit.disabled = false;
    });
  });
  update();
})();
