# Kangaroo

Windows tray app: move the mouse quickly and a larger pointer appears; it shrinks back after you slow down.

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

- Move the mouse quickly: the enlarged pointer appears and follows the cursor.
- The faster the movement, the larger the pointer. Size comes from the peak speed of the current movement.
- A sudden flick shows the pointer immediately, before the smoothed speed reaches the Start value. The size still follows the speed curve.
- Slow down or stop: the pointer stays for about 0.4 seconds, then shrinks back.
- Only speed matters; the path you take and changes of direction are ignored.

## Settings

- **Language**: English (default) or Chinese, also applied to the tray menu.
- **Start with Windows** and **Enabled**: switches in the header.
- **Speed**:
  - **Start**: speed in px/s where magnification begins.
  - **Full**: speed in px/s that reaches the configured pointer size.
  - **Accel**: acceleration in px/s² that shows the pointer before the speed reaches Start. Set it to 0 to disable the pre-trigger.
  - Curve editor: maps the speed between Start and Full to the extra size. Drag the two handles or pick a preset (linear, smooth, responsive, late).
  - The live line shows the current cursor speed, acceleration and the resulting zoom.
- **Pointer**: drag the handles on the preview to resize the pointer or strengthen the glow; click a colour swatch or pick a custom colour; adjust opacity.
- **Animations**: bezier curve editor with draggable control points and presets, or a spring with stiffness/damping/mass. Grow plays when the pointer appears, shrink when it retracts. The preview loops continuously.
- Settings are stored in `%APPDATA%\kangaroo\config.json`.

## How it works

- The main process samples the cursor every 12 ms, smooths the movement speed, and maps it through the speed curve to a strength between 0 and 1.
- A large acceleration (a sudden flick) activates the overlay early; the size still comes from the speed curve, so the pre-trigger only removes the reaction delay.
- The strongest speed of the current movement is held for 0.4 s before the pointer retracts, so it stays visible right after a fast flick.
- One transparent, click-through, always-on-top window per display draws the enlarged pointer as a DOM image; grow/shrink animations come from the shared easing/spring engine.
- The settings window uses Canvas for the speed curve, the pointer editor and the animation previews.

## Tests

```powershell
npm test
```

Covers speed smoothing and the curve mapping, the acceleration pre-trigger, the peak hold and retraction, trajectory independence, config migration and the animation curves/spring.

## Notes

- Windows has no API that magnifies only the pointer: the system pointer size is a global, static accessibility setting, and the Magnification API enlarges screen content rather than the cursor. The app therefore draws the enlarged pointer itself.
- The enlarged pointer is drawn above the system cursor, so the original cursor stays visible inside it.
- Overlay windows only appear while the enlarged pointer is shown; they never intercept clicks.
- In development mode "Start with Windows" registers `electron.exe` plus the project path; a packaged build registers the app itself.
