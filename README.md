# Kangaroo

Windows tray app: shake the mouse and a larger pointer appears; it shrinks back when you stop.

## Run

Requires Node.js 18+.

```powershell
npm install
npm start
```

The app lives in the system tray and shows no main window. Open the settings window directly:

```powershell
npm start -- --settings
```

Settings open automatically on the first launch. The tray menu can enable/disable the app, open settings, or quit.

## Usage

- Shake the mouse quickly: the enlarged pointer appears and follows the cursor.
- Stop shaking: the pointer shrinks back after about half a second.
- Default trigger: 3 direction changes of at least 60°, 90 px between turns, 550 px of fast travel inside 600 ms and a 900 px/s peak. Small tremors and single flicks do not trigger; large fast circles do.

## Settings

- **Language**: English (default) or Chinese, also applied to the tray menu.
- **Start with Windows** and **Enabled**: switches in the header.
- **Trigger**:
  - Sensitivity presets: Calm / Standard / Firm.
  - Gesture monitor: shake anywhere on screen; the real cursor path, turns and thresholds are drawn live. The monitor ends automatically shortly after a trigger.
  - **Test** to see whether a gesture would trigger, **Calibrate** to derive thresholds from your own shake.
- **Pointer**: drag the handles on the preview to resize the pointer or strengthen the glow; click a colour swatch or pick a custom colour.
- **Animations**: bezier curve editor with draggable control points and presets, or a spring with stiffness/damping/mass. The preview loops continuously.
- Settings are stored in `%APPDATA%\kangaroo\config.json`.

## How it works

- The main process samples the cursor every 12 ms and detects shakes from heading changes, travel distance and speed.
- One transparent, click-through, always-on-top window per display draws the enlarged pointer as a DOM image; animations are computed by the shared easing/spring engine.
- The settings window uses Canvas for the gesture monitor, the pointer editor and the animation previews.

## Tests

```powershell
npm test
```

Covers shake detection (real shakes, tremors, circular motion, slow movement, single flicks), calibration, config migration and the animation curves/spring.

## Notes

- The enlarged pointer is drawn above the system cursor, so the original cursor stays visible inside it.
- Overlay windows only appear while the enlarged pointer is shown; they never intercept clicks.
- In development mode "Start with Windows" registers `electron.exe` plus the project path; a packaged build registers the app itself.
