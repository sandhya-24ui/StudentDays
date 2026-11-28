/* StudentDays app build configuration.
   production:true  -> hides prototype-only controls (Host login, Admin login, "Skip for now", demo-OTP hint).
   production:false -> full prototype behaviour for internal demos. */
window.SD_CONFIG = { production: true };
document.addEventListener('DOMContentLoaded', function () {
  if (!window.SD_CONFIG.production) document.body.classList.remove('prod');
});
