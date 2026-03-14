# ── EduVision — app.py (NO THREADS) ──────────────────────────────────
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os, uuid, subprocess

load_dotenv()

app = Flask(__name__)
app.secret_key = "eduvision_secret"

CORS(app)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

from db import get_db
from stt import transcribe_audio
from retrieval import retrieve_content
from simplification import simplify_content
from quiz import generate_quiz
from engagement import run_engagement, models_ready
from qlearning import personalize, DIFFICULTY_LEVELS


# ── Health check ─────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "EduVision backend running ✅"}), 200


# ── STT ──────────────────────────────────────────────────
@app.route("/api/stt", methods=["POST"])
def stt():
    print("[STT] Request received")
    if "audio" not in request.files:
        print("[STT] ERROR: No audio file in request")
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    uid        = str(uuid.uuid4())

    raw_path = os.path.join(UPLOAD_DIR, f"{uid}_raw")
    audio_file.save(raw_path)
    print(f"[STT] Saved raw audio: {raw_path} ({os.path.getsize(raw_path)} bytes)")

    mp3_path = os.path.join(UPLOAD_DIR, f"{uid}.mp3")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", raw_path, "-ar", "16000", "-ac", "1", "-b:a", "32k", mp3_path],
            check=True, capture_output=True,
        )
        send_path = mp3_path
        print(f"[STT] Converted to mp3: {mp3_path}")
    except Exception as e:
        print(f"[STT] ffmpeg not found, sending raw file ({e})")
        send_path = raw_path

    try:
        transcript = transcribe_audio(send_path)
        print(f"[STT] Final transcript: '{transcript}'")
        return jsonify({"transcript": transcript})
    except Exception as e:
        print(f"[STT] Transcription error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        for p in [raw_path, mp3_path]:
            if os.path.exists(p): os.remove(p)


# ── CONTENT ──────────────────────────────────────────────
@app.route("/api/content", methods=["POST"])
def content():
    body  = request.get_json(silent=True) or {}
    query = body.get("query", "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    print(f"\n[Content] Query: '{query}'")
    try:
        raw, source = retrieve_content(query)
        simplified  = simplify_content(raw, query, difficulty='medium')
        return jsonify({
            "topic":      query,
            "simplified": simplified,
            "source":     source,
            "difficulty": "medium",
        })
    except Exception as e:
        print(f"[Content] ERROR: {e}")
        return jsonify({"error": str(e)}), 500


# ── QUIZ ─────────────────────────────────────────────────
@app.route("/api/quiz", methods=["POST"])
def quiz():
    body       = request.get_json(silent=True) or {}
    topic      = body.get("topic", "").strip()
    content    = body.get("content", "").strip()
    difficulty = body.get("difficulty", "medium")

    if not content:
        return jsonify({"error": "content is required"}), 400

    print(f"\n[Quiz] Topic: '{topic}' | Difficulty: {difficulty}")
    try:
        questions = generate_quiz(topic, content, difficulty)
        return jsonify({"questions": questions, "difficulty": difficulty})
    except Exception as e:
        print(f"[Quiz] ERROR: {e}")
        return jsonify({"error": str(e)}), 500


# ── ENGAGEMENT (SYNCHRONOUS) ────────────────────────────
@app.route("/api/engagement", methods=["POST"])
def engagement():
    if not models_ready():
        return jsonify({"error": "Engagement models not loaded. Check backend/models/ folder."}), 503

    video_file = request.files.get("video")
    audio_file = request.files.get("audio")

    if not video_file or not audio_file:
        return jsonify({"error": "Both 'video' and 'audio' files are required"}), 400

    task_id = str(uuid.uuid4())
    v_path  = os.path.join(UPLOAD_DIR, f"{task_id}_video.mp4")
    a_path  = os.path.join(UPLOAD_DIR, f"{task_id}_audio.wav")

    try:
        video_file.save(v_path)
        audio_file.save(a_path)

        print(f"[Engagement] Processing task {task_id} synchronously...")

        # Process engagement synchronously (blocking call)
        result = run_engagement(v_path, a_path)

        print(f"[Engagement] Task {task_id} completed: {result}")

        return jsonify({
            "success": True,
            "task_id": task_id,
            "result": result
        })

    except Exception as e:
        print(f"[Engagement] Error: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        # Clean up files after processing
        for p in [v_path, a_path]:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except:
                    pass


# ── Q-LEARNING PERSONALIZATION ───────────────────────────
@app.route("/api/personalize", methods=["POST"])
def personalize_route():
    data = request.get_json(silent=True) or {}

    quiz_score         = float(data.get("quiz_score", 0.5))
    engagement_score   = float(data.get("engagement_score", 0.5))
    current_difficulty = data.get("current_difficulty", "medium")

    if current_difficulty not in DIFFICULTY_LEVELS:
        current_difficulty = "medium"

    result = personalize(quiz_score, engagement_score, current_difficulty)
    return jsonify({"success": True, **result})


# ── SESSION SAVE ────────────────────────────────────────────
@app.route("/api/session/save", methods=["POST"])
def save_session():
    data = request.get_json(silent=True) or {}
    required = ["student_id", "topic", "quiz_score", "difficulty", "answers"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        import datetime
        db  = get_db()
        col = db["sessions"]
        doc = {
            "student_id":       data["student_id"],
            "topic":            data["topic"],
            "quiz_score":       float(data["quiz_score"]),
            "engagement_score": float(data["engagement_score"]) if data.get("engagement_score") not in (None, "null") else None,
            "engagement_state": data["engagement_state"],
            "difficulty":       data["difficulty"],
            "answers":          data["answers"],
            "num_questions":    len(data["answers"]),
            "correct_count":    sum(1 for a in data["answers"] if a.get("isRight")),
            "timestamp":        datetime.datetime.utcnow().isoformat() + "Z",
        }
        col.insert_one(doc)
        print(f"[Session] Saved — student: {data['student_id']} topic: {data['topic']} score: {data['quiz_score']:.0%}")
        return jsonify({"success": True})
    except Exception as e:
        print(f"[Session] Save error: {e}")
        return jsonify({"error": str(e)}), 500


# ── TEACHER DASHBOARD ─────────────────────────────────────
@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    try:
        from collections import defaultdict
        import datetime
        db  = get_db()
        col = db["sessions"]
        sessions = list(col.find({}, {"_id": 0}).sort("timestamp", -1))
        if not sessions:
            return jsonify({"students": [], "class_stats": {}, "topic_stats": []})

        # Per-student aggregation
        student_map = defaultdict(list)
        for s in sessions:
            student_map[s["student_id"]].append(s)

        students = []
        for sid, sess in student_map.items():
            sess_sorted = sorted(sess, key=lambda x: x["timestamp"])
            latest      = sess_sorted[-1]
            scores      = [s["quiz_score"] for s in sess_sorted]
            eng_scores  = [s["engagement_score"] for s in sess_sorted if s.get("engagement_score") not in (None, 0.5)]

            trend = "stable"
            if len(scores) >= 2:
                diff = scores[-1] - scores[-2]
                if diff >= 0.10:    trend = "improving"
                elif diff <= -0.10: trend = "declining"

            at_risk = latest["quiz_score"] < 0.40 or (
                len(scores) >= 2 and scores[-1] < 0.50 and scores[-2] < 0.50
            )

            # Clean up null/unknown engagement states for display
            eng_state = latest.get("engagement_state") or None
            if eng_state in ("unknown", "null", "", None):
                eng_state = None

            students.append({
                "student_id":        sid,
                "latest_score":      latest["quiz_score"],
                "latest_topic":      latest["topic"],
                "latest_difficulty": latest["difficulty"],
                "latest_eng_state":  eng_state,
                "latest_eng_score":  latest.get("engagement_score"),
                "avg_score":         round(sum(scores) / len(scores), 3),
                "avg_engagement":    round(sum(eng_scores) / len(eng_scores), 3) if eng_scores else None,
                "quiz_count":        len(sess_sorted),
                "at_risk":           at_risk,
                "trend":             trend,
                "sessions":          sess_sorted,
            })

        students.sort(key=lambda x: (not x["at_risk"], x["latest_score"]))

        all_scores = [s["quiz_score"]       for s in sessions]
        all_eng    = [s["engagement_score"]  for s in sessions if s.get("engagement_score")]

        class_stats = {
            "total_students": len(students),
            "avg_score":      round(sum(all_scores) / len(all_scores), 3),
            "avg_engagement": round(sum(all_eng) / len(all_eng), 3) if all_eng else None,
            "at_risk_count":  sum(1 for s in students if s["at_risk"]),
            "total_sessions": len(sessions),
        }

        topic_map = defaultdict(list)
        for s in sessions:
            topic_map[s["topic"]].append(s["quiz_score"])

        topic_stats = sorted([
            {
                "topic":     t,
                "avg_score": round(sum(sc) / len(sc), 3),
                "attempts":  len(sc),
                "min_score": round(min(sc), 3),
            }
            for t, sc in topic_map.items()
        ], key=lambda x: x["avg_score"])

        return jsonify({"students": students, "class_stats": class_stats, "topic_stats": topic_stats})

    except Exception as e:
        print(f"[Dashboard] ERROR: {e}")
        return jsonify({"error": str(e)}), 500


# ── Error Handlers ───────────────────────────────────────
@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    print(f"\n{'='*55}")
    print(f"  EduVision Backend — http://localhost:{port}")
    print(f"  Health: http://localhost:{port}/api/health")
    print(f"  Engagement processing: SYNCHRONOUS (no threads)")
    print(f"{'='*55}\n")
    app.run(debug=True, use_reloader=False, port=port, host="0.0.0.0", threaded=True)