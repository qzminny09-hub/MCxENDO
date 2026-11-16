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
| ✋ Drag | Grab any object and fling it. Quick-tap a weapon to fire it |
| 👆 Use | Tap a weapon or explosive to fire / trigger it |
| ➕ Spawn | Pick an item from the bar at the bottom, then tap the scene |
| 🔪 Cut | Swipe across limbs to sever them |
| 💥 Blast | Tap to set off an explosion |
| 📌 Pin | Tap a part to nail it in place (tap again to release) |
| 📏 Wall | Drag to draw solid walls and ramps |
| 💉 Heal | Tap a ragdoll to restore its health |
| 🧽 Erase | Tap an object or wall to delete it |

Top bar: Pause, Slow motion, Zero-gravity, Clean (removes blood) and Clear (resets the lab).

### Things to spawn

- **Props:** Human, Crate, Ball, Plank, explosive Barrel
- **Weapons:** Pistol, Rifle (tap to toggle full auto), Shotgun, Rocket launcher, Sword (tap to swing, or fling it)
- **Explosives:** Grenade (shrapnel), Bomb, Landmine
- **Traps:** Spikes (impale things that fall on them), spinning Saw blade. Traps stay where you put them; drag to move.

Ragdolls keep their balance while conscious, and their knees and elbows only bend the natural way.
Bullets leave wounds that bleed in time with the heartbeat and can pass through limbs. Hard impacts,
blades, explosions and blood loss hurt them. Joints tear under strain, big blasts and repeated
headshots blow body parts apart, and losing the head or torso is fatal. Blood pools on the floor,
drips down walls and stays until you press Clean.

The APK is signed with `app/ragdoll-lab.keystore`, a key that lives in this repo so each new build
installs over the previous one. It is not secret: use your own keystore if you ever publish the game.

## Layout

- `app/src/main/assets/` — the game: `index.html` plus `js/physics.js` (Verlet solver, collisions, joints),
  `js/gore.js` (blood, stains, gibs, explosions, bullets), `js/entities.js` (ragdolls, props),
  `js/weapons.js` (guns, sword, explosives, traps) and `js/main.js` (rendering, input, UI, loop)
- `app/src/main/java/.../MainActivity.java` — full-screen landscape WebView that hosts the game
- `.github/workflows/build-apk.yml` (repo root) — CI build
