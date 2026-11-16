# Ragdoll Lab

A 2D physics sandbox for Android: spawn ragdolls and props, then throw, slice, pin and blow them up.

## Get the APK

Every push that touches `ragdoll-lab/` runs the **Build Ragdoll Lab APK** GitHub Action, which:

- uploads `RagdollLab.apk` as a workflow artifact, and
- publishes it to the **`ragdoll-lab-latest`** release, so you can download it straight from your phone.

Open the release on your phone, download `RagdollLab.apk` and install it (allow "Install unknown apps" for your browser).

Build it yourself with the Android SDK installed:

```bash
cd ragdoll-lab
./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
```

You can also play in a desktop browser: open `app/src/main/assets/index.html`.

## How to play

| Tool | What it does |
|------|--------------|
| ✋ Drag | Grab any object and fling it |
| ➕ Spawn | Tap to place a Human, Crate, Ball, Plank, Bomb (3 s fuse) or explosive Barrel |
| 🔪 Cut | Swipe across limbs to sever them |
| 💥 Blast | Tap to set off an explosion |
| 📌 Pin | Tap a part to nail it in place (tap again to release) |
| 📏 Wall | Drag to draw solid walls and ramps |
| 💉 Heal | Tap a ragdoll to restore its health |
| 🧽 Erase | Tap an object or wall to delete it |

Top bar: Pause, Slow motion, Zero-gravity, Clean (removes blood) and Clear (resets the lab).

Ragdolls keep their balance while conscious. Hard impacts, explosions and blood loss hurt them,
joints tear under too much strain, and losing the head or torso is fatal.

## Layout

- `app/src/main/assets/` — the game (`index.html`, `game.js`: Verlet physics, ragdolls, rendering, UI)
- `app/src/main/java/.../MainActivity.java` — full-screen landscape WebView that hosts the game
- `.github/workflows/build-apk.yml` (repo root) — CI build
