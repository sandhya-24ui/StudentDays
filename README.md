# StudentDays Android app (Capacitor)

Your prototype, wrapped as a native Android project. The intro video, welcome screen, sign-up, city picker and the **logo reveal animation** run exactly as in the prototype (it is the same code, assets moved out of the HTML into `www/assets/`).

## Fastest way – no Android Studio needed (GitHub Actions)
1. Create a free GitHub repo, upload this folder's contents, push to `main`.
2. Open **Actions → Build Android → Run workflow**. In ~10 min download `studentdays-debug-apk` and install on a phone to test.
3. For the Play Store build, create a keystore once:
   `keytool -genkey -v -keystore release.jks -alias studentdays -keyalg RSA -keysize 2048 -validity 10000`
   Keep it safe (losing it = cannot update the app). Add repo secrets: `KEYSTORE_BASE64` (`base64 -w0 release.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Re-run → download `studentdays-release-aab`.
4. Play Console → create app → upload the `.aab` (enrol in Play App Signing).

## On your own computer
Needs Node 22+, JDK 21, Android Studio (Otter or newer).
```
npm install
npx cap add android
npm run assets      # icon + splash from resources/
npx cap sync android
npm run open        # opens Android Studio → Build → Generate Signed Bundle
```
New Play apps must target API 36 – Capacitor 8 (used here) does that.

## Config
`www/config.js` → `production:true` hides Host login, Admin login, "Skip for now" and the demo-OTP hint. Set `false` for internal demos.
App id: `co.studentdays.app` (change in `capacitor.config.json` **before** first upload; it can never change after).
