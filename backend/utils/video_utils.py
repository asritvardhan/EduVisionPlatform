# ── EduVision — utils/video_utils.py ────────────────────────────────────────
import cv2
import numpy as np
from tensorflow.keras.applications.resnet50 import preprocess_input


def video_to_frames(video_path, num_frames=16, size=(224, 224)):
    """Extract uniformly sampled frames from a video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[Video] ❌ Cannot open: {video_path}")
        return []

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total == 0:
        cap.release()
        return []

    indices = np.linspace(0, total - 1, num_frames).astype(int)
    frames  = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue
        frame = cv2.resize(frame, size)
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frames.append(frame)

    cap.release()
    return frames


def extract_resnet_features(frames, resnet_model):
    """Extract ResNet50 features from a list of frames."""
    frames = np.array(frames).astype("float32")
    frames = preprocess_input(frames)
    return resnet_model.predict(frames, verbose=0)