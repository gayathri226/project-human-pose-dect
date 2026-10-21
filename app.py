"""AI-based real-time human pose estimation web application."""

from __future__ import annotations

import base64
import logging
import os
import threading
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 3 * 1024 * 1024
_INFERENCE_SIZE = (960, 540)

_pose_lock = threading.Lock()
_model_path = Path(__file__).parent / "models" / "holistic_landmarker.task"
_landmark_names = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye",
    "right_eye_outer", "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder",
    "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_pinky",
    "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb", "left_hip",
    "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel",
    "right_heel", "left_foot_index", "right_foot_index",
]
_pose = None
if _model_path.exists():
    _options = mp.tasks.vision.HolisticLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(_model_path)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        min_face_detection_confidence=0.5,
        min_pose_detection_confidence=0.55,
        min_hand_landmarks_confidence=0.45,
        min_face_landmarks_confidence=0.5,
    )
    _pose = mp.tasks.vision.HolisticLandmarker.create_from_options(_options)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    ready = _pose is not None
    return jsonify({"status": "ok" if ready else "model_missing", "engine": "MediaPipe Holistic Landmarker", "landmarks": 553})


@app.post("/api/pose")
def analyze_pose():
    if _pose is None:
        return jsonify({"error": f"Pose model not found: {_model_path}"}), 503
    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image", "")
    if not isinstance(image_data, str) or "," not in image_data:
        return jsonify({"error": "Send a webcam frame as a base64 data URL."}), 400
    try:
        raw = base64.b64decode(image_data.split(",", 1)[1], validate=True)
        if len(raw) > 2_500_000:
            return jsonify({"error": "Frame is too large."}), 413
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        source_height, source_width = rgb.shape[:2]
        scale = min(_INFERENCE_SIZE[0] / source_width, _INFERENCE_SIZE[1] / source_height)
        resized_width = max(1, round(source_width * scale))
        resized_height = max(1, round(source_height * scale))
        offset_x = (_INFERENCE_SIZE[0] - resized_width) // 2
        offset_y = (_INFERENCE_SIZE[1] - resized_height) // 2
        resized = cv2.resize(rgb, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
        normalized = np.zeros((_INFERENCE_SIZE[1], _INFERENCE_SIZE[0], 3), dtype=np.uint8)
        normalized[offset_y:offset_y + resized_height, offset_x:offset_x + resized_width] = resized
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=normalized)
        with _pose_lock:
            result = _pose.detect(image)
        pose = result.pose_landmarks
        landmarks = [
            {"id": index, "name": _landmark_names[index], **_pack_point(point, index, offset_x, offset_y,
                                                                          resized_width, resized_height)}
            for index, point in enumerate(pose)
        ]
        face = [_pack_point(point, index, offset_x, offset_y, resized_width, resized_height)
                for index, point in enumerate(result.face_landmarks)]
        left_hand = [_pack_point(point, index, offset_x, offset_y, resized_width, resized_height)
                     for index, point in enumerate(result.left_hand_landmarks)]
        right_hand = [_pack_point(point, index, offset_x, offset_y, resized_width, resized_height)
                      for index, point in enumerate(result.right_hand_landmarks)]
        metrics = _measure_pose(landmarks) if landmarks else None
        return jsonify({"detected": bool(pose or face or left_hand or right_hand), "landmarks": landmarks,
                        "face": face, "left_hand": left_hand, "right_hand": right_hand, "metrics": metrics})
    except (ValueError, TypeError, cv2.error) as exc:
        return jsonify({"error": f"Invalid frame: {exc}"}), 400
    except RuntimeError:
        app.logger.exception("MediaPipe holistic inference failed")
        return jsonify({"error": "Pose analysis failed. Restart the app and try again."}), 500


def _measure_pose(points: Any) -> dict[str, Any]:
    """Return a few stable, easy-to-read posture measurements."""
    left_shoulder, right_shoulder = points[11], points[12]
    left_hip, right_hip = points[23], points[24]
    left_knee, right_knee = points[25], points[26]
    shoulder_tilt = abs(left_shoulder["y"] - right_shoulder["y"])
    hip_tilt = abs(left_hip["y"] - right_hip["y"])
    confidence = float(np.mean([p["visibility"] for p in (left_shoulder, right_shoulder, left_hip, right_hip)]))
    score = max(0, min(100, round(100 - (shoulder_tilt + hip_tilt) * 240)))
    return {
        "alignment": score,
        "confidence": round(confidence * 100),
        "shoulder_tilt": round(float(shoulder_tilt * 100), 1),
        "hip_tilt": round(float(hip_tilt * 100), 1),
        "stance": "Standing" if abs(left_knee["y"] - right_knee["y"]) < 0.12 else "Moving",
    }


def _pack_point(point: Any, index: int, offset_x: int, offset_y: int,
                resized_width: int, resized_height: int) -> dict[str, Any]:
    x = (point.x * _INFERENCE_SIZE[0] - offset_x) / resized_width
    y = (point.y * _INFERENCE_SIZE[1] - offset_y) / resized_height
    return {"id": index, "x": x, "y": y, "z": point.z,
            "visibility": float(point.visibility or 0)}


if __name__ == "__main__":
    if _pose is None:
        raise RuntimeError(f"Holistic model not found at {_model_path}. See README.md to download it.")
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")), debug=False, threaded=True)
