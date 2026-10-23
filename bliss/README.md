# Bliss

A blank Android/iOS app built with Expo (React Native).

## Get it on an Android phone

Every push that changes `bliss/` runs the **Build Bliss (Android)** workflow, which
compiles a release APK and publishes it as a GitHub Release.

1. On your phone, open the repo's **Releases** page and pick the newest "Bliss (build N)".
2. Tap **Bliss.apk** to download it, then open it.
3. If Android asks, allow your browser to install unknown apps, then tap **Install**.

New builds install over the old one.

## Work on it

```bash
npm install
npx expo start
```

The screen lives in `App.js`. App name, icon and package id are in `app.json`.
