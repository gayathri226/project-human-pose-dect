# Deploy the pose tracker

This project runs MediaPipe Holistic inference in a Flask service. The steps below use Render as an example; any host that builds a Dockerfile and supports HTTPS can use the same container.

## 1. Put the project in a Git repository

Create a private or public GitHub repository, then push the project files. From the project directory, run:

```powershell
git init
git add .
git commit -m "Add holistic pose tracking app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Keep `.venv/`, `_tmp/`, and local log files out of Git; the ignore files already exclude them. Include `models/holistic_landmarker.task`.

## 2. Create the Render service

In Render, select **New → Blueprint**, connect the GitHub repository, and select this repository. Render reads `render.yaml`, which configures a Docker web service and the `/api/health` health check.

The Blueprint selects Render's free plan (512 MB RAM). The vision model may exceed that memory limit and fail to start. For reliable hosted inference, use a paid plan with at least 2 GB RAM; check [Render pricing](https://render.com/pricing) before creating one. The Docker command uses one worker to avoid loading multiple copies of the model into memory.

## 3. Open the HTTPS URL

After the host finishes building, open its HTTPS URL, choose **Start camera**, and allow camera access. Browsers require HTTPS (or `localhost`) for webcam access. The container accepts the host's `PORT` value and binds to `0.0.0.0` through Gunicorn.

## Data flow

In local mode, frames go from the browser to your computer's local Flask process. When hosted, the browser sends camera frames to the deployed service for inference. The app does not save those frames.

## Verify the deployment

Open `https://YOUR-SERVICE-URL/api/health`. A healthy response includes `"status":"ok"`, `"engine":"MediaPipe Holistic Landmarker"`, and `"landmarks":553`. Then load the root URL and test the camera from a well-lit scene with your face, hands, and body visible.
