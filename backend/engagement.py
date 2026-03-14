# ── EduVision — engagement.py ───────────────────────────────────────────────
# Loads both .h5 models once at startup.
# Exposes run_engagement(video_path, audio_path) → dict
#
# Models expected at:
#   backend/models/final_optimized_cremad_model.h5   (audio)
#   backend/models/resnet_bilstm_attention_48_2.h5   (video)
#   backend/models/scaler.pkl
#   backend/models/pca.pkl

import os
import numpy as np

# ── Lazy imports so Flask still starts if TF not installed ──────────────────
_audio_model = None
_video_model = None
_resnet      = None
_scaler      = None
_pca         = None
_loaded      = False


def _load_models():
    global _audio_model, _video_model, _resnet, _scaler, _pca, _loaded
    if _loaded:
        return

    try:
        import tensorflow as tf
        import h5py, json
        import joblib

        # Always use tf.keras (not tf_keras) for building — avoids DTypePolicy issues
        from tensorflow.keras.applications import ResNet50
        from tensorflow.keras import layers, models

        base        = os.path.join(os.path.dirname(__file__), "models")
        audio_path  = os.path.join(base, "final_optimized_cremad_model.h5")
        video_path  = os.path.join(base, "resnet_bilstm_attention_48_2.h5")
        scaler_path = os.path.join(base, "scaler.pkl")
        pca_path    = os.path.join(base, "pca.pkl")

        for p in [audio_path, video_path, scaler_path, pca_path]:
            if not os.path.exists(p):
                raise FileNotFoundError(f"Missing: {p}")

        # ── Helper: sanitise model config stored in h5 ────────────────────
        def sanitise_config(cfg_str: str) -> str:
            """
            Fix three known cross-version issues in the JSON config:
            1. DTypePolicy object  → plain "float32" string
            2. batch_shape         → batch_input_shape
            3. Keras 3 inbound_nodes format → Keras 2 format
            """
            data = json.loads(cfg_str)

            def fix_layer(layer):
                cfg = layer.get('config', {})

                # Fix 1: DTypePolicy → plain string everywhere in config
                def fix_dtype(obj):
                    if isinstance(obj, dict):
                        if (obj.get('class_name') == 'DTypePolicy'
                                and 'config' in obj
                                and 'name' in obj['config']):
                            return obj['config']['name']
                        return {k: fix_dtype(v) for k, v in obj.items()}
                    if isinstance(obj, list):
                        return [fix_dtype(i) for i in obj]
                    return obj

                layer['config'] = fix_dtype(cfg)

                # Fix 2: batch_shape → batch_input_shape in InputLayer
                if layer.get('class_name') == 'InputLayer':
                    c = layer['config']
                    if 'batch_shape' in c:
                        c['batch_input_shape'] = c.pop('batch_shape')
                    c.pop('sparse', None)
                    c.pop('ragged', None)

                # Fix 3: Convert Keras 3 inbound_nodes to Keras 2 format
                # Keras 3: [{"args": [{"class_name": "__keras_tensor__",
                #            "config": {"keras_history": [layer_name, node_idx, tensor_idx]}}],
                #            "kwargs": {...}}]
                # Keras 2: [[layer_name, node_idx, tensor_idx, {}]]
                new_nodes = []
                for node in layer.get('inbound_nodes', []):
                    if isinstance(node, dict) and 'args' in node:
                        # Keras 3 format → convert each arg
                        node_connections = []
                        for arg in node.get('args', []):
                            if (isinstance(arg, dict)
                                    and arg.get('class_name') == '__keras_tensor__'):
                                hist = arg['config']['keras_history']
                                # hist = [layer_name, node_idx, tensor_idx]
                                node_connections.append(
                                    [hist[0], hist[1], hist[2], {}]
                                )
                        if node_connections:
                            new_nodes.append(node_connections)
                    else:
                        new_nodes.append(node)  # already Keras 2 format

                if new_nodes:
                    layer['inbound_nodes'] = new_nodes

                return layer

            # Walk all layers
            layers = data.get('config', {}).get('layers', [])
            data['config']['layers'] = [fix_layer(l) for l in layers]

            # Fix output_layers / input_layers if present (also Keras 3 format)
            for key in ('output_layers', 'input_layers'):
                if key in data.get('config', {}):
                    fixed = []
                    for item in data['config'][key]:
                        if isinstance(item, dict) and 'config' in item:
                            hist = item['config'].get('keras_history', [item.get('name',''), 0, 0])
                            fixed.append([hist[0], hist[1], hist[2]])
                        else:
                            fixed.append(item)
                    data['config'][key] = fixed

            return json.dumps(data)

        # ── Custom Attention layer ─────────────────────────────────────────
        class Attention(layers.Layer):
            def build(self, input_shape):
                self.W = self.add_weight("att_weight", shape=(input_shape[-1], 1), initializer="normal")
                self.b = self.add_weight("att_bias",   shape=(input_shape[1],  1), initializer="zeros")
                super().build(input_shape)
            def call(self, x):
                e = tf.keras.backend.tanh(tf.keras.backend.dot(x, self.W) + self.b)
                a = tf.keras.backend.softmax(e, axis=1)
                return tf.keras.backend.sum(x * a, axis=1)
            def get_config(self):
                return super().get_config()

        # ── Load model from h5: read config, sanitise, build, load weights ──
        def load_fixed_model(h5_path, custom_objects=None):
            with h5py.File(h5_path, 'r') as f:
                cfg_str = f.attrs.get('model_config', None)
                if cfg_str is None:
                    raise ValueError(f"No model_config in {h5_path}")
                if isinstance(cfg_str, bytes):
                    cfg_str = cfg_str.decode('utf-8')

            cfg_str_fixed = sanitise_config(cfg_str)

            co = {"Attention": Attention}
            if custom_objects:
                co.update(custom_objects)

            model = models.model_from_json(cfg_str_fixed, custom_objects=co)
            model.load_weights(h5_path)
            return model

        print("[Engagement] Loading audio model…")
        _audio_model = load_fixed_model(audio_path)

        print("[Engagement] Loading video model…")
        _video_model = load_fixed_model(video_path)

        print("[Engagement] Loading ResNet50…")
        _resnet = ResNet50(weights="imagenet", include_top=False, pooling="avg")

        _scaler = joblib.load(scaler_path)
        _pca    = joblib.load(pca_path)

        print("[Engagement] ✅ All models loaded successfully")
        _loaded = True

    except Exception as e:
        import traceback
        print(f"[Engagement] ❌ Model loading failed: {e}")
        traceback.print_exc()
        _loaded = False


def models_ready() -> bool:
    _load_models()
    return _loaded and all(m is not None for m in [_audio_model, _video_model, _resnet, _scaler, _pca])


def run_engagement(video_path: str, audio_path: str) -> dict:
    """
    Run both models and return fused engagement result.

    Returns:
        {
          "video_score":      float,
          "vocal_score":      float,
          "fused_score":      float,
          "engagement_state": str,   # "Highly Engaged" | "Engaged" | "Partially Engaged" | "Disengaged"
          "video_probs":      list,
          "audio_probs":      dict,
          "emotion":          str,
        }
    """
    if not models_ready():
        raise RuntimeError("Engagement models are not loaded.")

    import numpy as np
    from utils.video_utils import video_to_frames
    from utils.audio_utils  import predict_audio_emotion
    from utils.fusion_utils import map_vocal_to_engagement, compute_video_engagement, fuse_engagement

    # ── VIDEO ────────────────────────────────────────────────────────────────
    frames = video_to_frames(video_path, num_frames=16)
    if not frames:
        raise ValueError("No frames extracted from video.")

    frame_features = []
    try:
        import cv2
    except ImportError:
        cv2 = None

    for frame in frames:
        from tensorflow.keras.applications.resnet50 import preprocess_input
        frame_f = frame.astype("float32")
        frame_f = preprocess_input(np.expand_dims(frame_f, axis=0))
        feat    = _resnet.predict(frame_f, verbose=0)
        frame_features.append(feat.flatten())

    res_feats = np.vstack(frame_features)  # (16, 2048)

    # Pad/trim to exactly 16 frames
    if res_feats.shape[0] < 16:
        res_feats = np.vstack([res_feats, np.zeros((16 - res_feats.shape[0], res_feats.shape[1]))])
    else:
        res_feats = res_feats[:16]

    res_feats_scaled = _scaler.transform(res_feats)
    res_feats_pca    = _pca.transform(res_feats_scaled)
    Xv               = res_feats_pca.reshape(1, 16, -1)

    v_preds     = _video_model.predict(Xv, verbose=0)
    eng_probs   = v_preds[0][0] if isinstance(v_preds, (list, tuple)) else v_preds[0]
    video_score = compute_video_engagement(eng_probs)

    # ── AUDIO ────────────────────────────────────────────────────────────────
    audio_result = predict_audio_emotion(audio_path, _audio_model)
    vocal_score  = map_vocal_to_engagement(audio_result["probabilities"])

    # ── FUSION ───────────────────────────────────────────────────────────────
    state, fused = fuse_engagement(video_score, vocal_score)

    print(f"[Engagement] Video={video_score:.3f}  Vocal={vocal_score:.3f}  "
          f"Fused={fused:.3f}  State={state}")

    return {
        "video_score":      float(video_score),
        "vocal_score":      float(vocal_score),
        "fused_score":      float(fused),
        "engagement_state": state,
        "video_probs":      [float(p) for p in eng_probs],
        "audio_probs":      audio_result["probabilities"],
        "emotion":          audio_result["emotion"],
    }