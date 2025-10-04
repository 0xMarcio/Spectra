# Turbulence Energy Spectra

![Spectra airflow demo](spectra.gif)

Spectra is a lightweight, browser-based visualisation that streams particles across a fixed STL model and colours them by velocity & vorticity once they collide with the geometry. The app highlights the full downstream path of disturbed particles so you can see how the car’s curved surfaces sculpt the wake.

## Running locally

```bash
python3 -m http.server 8001
# open http://127.0.0.1:8001/
```

Use the on-screen sliders to tune wind speed, particle density, turbulence intensity, the minimum deflection threshold, and the rendered trail length in real time.

## Controls

- **Orbit**: drag with left mouse
- **Zoom/Pan**: standard OrbitControls gestures
- **Move model**: arrow keys (hold Shift for fore/aft motion)
- **Toggle flow**: pause/resume & reset buttons in the HUD

## Development

- `main.js` contains all Three.js setup, STL loading, particle physics, and UI bindings.
- `index.html` defines the minimal HUD and loads the app as an ES module.
