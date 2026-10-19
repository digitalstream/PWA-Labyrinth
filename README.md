# Labyrinth

A mobile-first marble maze with tilt controls, eight procedurally generated boards, and offline play. Built with native JavaScript and Canvas, with no runtime dependencies or build step.

**[Play Labyrinth](https://labyrinth.bettermediahub.com/)**

## Features

- Eight generated boards, targeting a 5–10 minute Balanced journey.
- Tilt controls for phones and tablets, a touch direction pad, and keyboard controls on desktop.
- Gentle, Balanced, and Tough maze settings, with separate marble speed and tilt sensitivity.
- Holes along the route with checked clearance to steer past them; hints show the gaps.
- Gold checkpoints that turn green when saved, unlimited retries, and saved personal bests.
- Installable PWA with offline caching and locally bundled assets.
- An About panel in Settings, with a technical overview and project links.

## Run locally

Install Node.js, then run:

```powershell
node scripts/serve.mjs
```

Open <http://localhost:4173>. Run the checks with:

```powershell
node --test
```

The equivalent npm shortcuts are `npm run dev` and `npm test`. No dependency installation is needed to play, serve, or test the game.

## Controls

- Arrow keys or WASD to roll; P or Escape to pause.
- Hold the direction buttons on touch screens; hold two for diagonal movement.
- On a phone or tablet, tap **Begin the journey** to set up tilt and request motion access if needed. Hold the device comfortably to establish its neutral position. Recalibrate or retry access in settings.
- The direction pad remains available if motion permission is declined or a sensor is unavailable.
- **Show path** reveals the safe route for 4.5 seconds and adds five seconds to your time.

Motion permission requires a user gesture in browsers that prompt, so it is requested from the start tap rather than page load. Test real-device tilt over HTTPS.

## Journey and difficulty

The generator selects a connected maze near each stage's target route length. Balanced and Tough add hazards along the solution as well as in dead ends. Route hazards require a deviation from the ordinary centre line, while leaving clearance for the whole marble between the cell's openings. They are spaced apart and kept away from the start, finish, and checkpoints.

Gentle has smaller boards and no holes. Balanced starts with a hazard-free board. Tough introduces route hazards immediately, with more on later boards. Its internal setting key remains `intricate` for compatibility with existing preferences.

Boards four through eight have a midpoint checkpoint. Roll over the gold diamond to activate it; it turns green and shows SAVED. A fall returns you to that checkpoint, or to the start if none is active. Retries keep the same maze. Pauses, background tabs, and results stop the timer. Restarting a board keeps journey time and falls.

Three stars require no falls and a finish within the board's target time. Two stars allow up to two falls; one star recognises completion. There is no countdown that blocks progress. Settings and best times are saved locally per maze difficulty; different random boards and speed settings affect times.

## Deploy and package

Deploy the runtime files to a static HTTPS host. Root domains and subfolders are supported. The included `web.config` preserves the existing IIS configuration. The complete app is cached after the first successful visit.

To create a deployment ZIP, install Python and run:

```powershell
python scripts/package-release.py
```

The packager checks the offline asset list and JavaScript imports, then creates the ZIP in `artifacts/`. Development files and local QA pages are excluded.

Increment the cache version in `service-worker.js` whenever cached runtime files change. Updates wait for existing game windows to close: visit once online, close the site's tabs and installed app, then reopen to activate the new version.

## Verification

Automated checks cover maze connectivity, deterministic retries, wall collisions, finish and checkpoint flows, motion-permission fallbacks, and physical traversal around route hazards at every speed setting. Physical phones and tablets remain the place to judge tilt feel, installed-app behaviour, and session pacing.
