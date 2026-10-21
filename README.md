# Form — AI Human Pose Studio

A Real-time webcam movement tracker built with Python, Flask, OpenCV, and MediaPipe Holistic. It detects 33 body landmarks, 478 facial points, and 21 landmarks on each hand, draws a detailed live overlay, and Reports alignment, confidence, movement state, and session statistics. In local mode, frames are processed by the Python service on your Computer. The lightweight holistic model is included under `models/`.

## run locally

Python 3.10–3.12 is recommended.

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in a modern browser and allow camera access. Camera access works on `localhost`; frames are sent to the local Flask server for pose analysis.

## Features

- Live camera capture, camera switching, pause/resume, and fullscreen view.
- 33 MediaPipe pose landmarks with a connected, visibility-aware skeleton overlay.
- Holistic tracking adds 478 facial landmarks and 21 landmarks on each hand for clearer face and finger detail.
- Live body alignment, detection confidence, landmark count, and movement metrics.
- Session duration, analyzed frame count, pose detections, and average confidence.
- Responsive dark dashboard for desktop and mobile.
- No accounts or API keys are needed for local use.

## Deploy

See [DEPLOY.md](DEPLOY.md) for Docker-based hosting steps. A deployed version needs HTTPS for webcam access and sends camera frames to the server you deploy. The free server plan may not have enough memory for MediaPipe; use at least 2 GB RAM for reliable hosted inference.

## API

- `GET /api/health` — service status and model metadata.
- `POST /api/pose` — accepts JSON `{ "image": "data:image/jpeg;base64,..." }` and returns landmark coordinates and posture metrics.

## Project layout

```text
app.py                 Flask routes and MediaPipe inference
templates/index.html   Dashboard interface
static/style.css       Responsive visual design
static/app.js          Webcam capture and skeleton rendering
models/                MediaPipe Holistic Landmarker model
Dockerfile             Production container configuration
requirements.txt       Python dependencies
```
