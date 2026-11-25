/* Single story page: the "Copy link" button. Everything else is already in the HTML. */
(function () {
  'use strict';
  var btn = document.getElementById('copy-link');
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    var url = btn.getAttribute('data-url');
    var done = function () { btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = 'Copy link'; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
    else window.prompt('Copy this link:', url);
  });
})();
