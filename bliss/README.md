# Bliss

A physics playground for Android, built with Expo (React Native): Cloth, Water, Sand, Jelly, Fireworks and Planets.

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

- `App.js` lists the modes and switches between the home screen and a sim.
- `src/sims/` holds each simulation as a self-contained canvas page (one file per mode)
  built on `shell.js`, which provides the toolbar and the bridge to the app.
- `src/SimScreen.js` shows a sim in a WebView and handles back, haptics and tilt.
- App name, icon and package id are in `app.json`.
