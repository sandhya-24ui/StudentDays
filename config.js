/* StudentDays app build configuration.
   production:true  -> hides prototype-only controls (Host login, Admin login, "Skip for now", demo-OTP hint).
   production:false -> full prototype behaviour for internal demos.

   apiBase  -> the address of your StudentDays backend.
     ''                          = DEMO MODE. Fake in-memory data, no server needed (what you have installed now).
     'https://api.yourdomain.in' = LIVE MODE. Real sign-up, trips, booking, payment, tickets. Must be https for the phone app.
     'same-origin'               = desktop testing only, when the backend itself serves this folder (see backend README).
   minAge   -> minimum sign-up age. Must match MIN_AGE on the server (PRD AUTH-04 is still [TBC]). */
window.SD_CONFIG = { production: true, apiBase:'https://studentdays-api.onrender.com', minAge: 18 };
document.addEventListener('DOMContentLoaded', function () {
  if (!window.SD_CONFIG.production) document.body.classList.remove('prod');
});
