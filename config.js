/* StudentDays app build configuration.
   production:true  -> hides prototype-only controls (Host login, Admin login, "Skip for now").
   apiBase  -> your StudentDays backend address.
     ''                          = DEMO MODE (fake data, no server)
     'https://api.yourdomain.in' = LIVE MODE (real sign-up, trips, booking, payment, tickets). Must be https on the phone.
     'same-origin'               = desktop testing only
   minAge   -> must match MIN_AGE on the server.
   showBuild:true shows a small status line at the bottom of the screen (build stamp + LIVE/DEMO). Set false before store release. */
window.SD_CONFIG = { production: true, apiBase: 'https://studentsdays-api.onrender.com', minAge: 18, showBuild: true };
window.SD_BUILD = '2026-11-28-b';

document.addEventListener('DOMContentLoaded', function () {
  if (!window.SD_CONFIG.production) document.body.classList.remove('prod');
});

/* Status line: tells you exactly which version is installed and whether it is talking to the server. */
(function () {
  var errs = [];
  window.addEventListener('error', function (e) { errs.push((e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (window.SD_CONFIG.showBuild === false) return;
      var want = window.SD_CONFIG.apiBase, host = String(want || '').replace(/^https?:\/\//, '');
      var t = 'Build ' + window.SD_BUILD + ' \u2022 ' + (window.SD_LIVE ? 'LIVE ' + host : want ? 'LIVE FAILED: ' + (errs[0] || 'live.js did not run') : 'DEMO MODE (apiBase is empty)');
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:2px;text-align:center;font:10px/1.2 sans-serif;color:rgba(255,255,255,.6);z-index:99999;pointer-events:none;padding:0 8px;text-shadow:0 0 3px #000';
      d.textContent = t; document.body.appendChild(d);
    }, 400);
  });
})();
