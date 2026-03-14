# ── EduVision — qlearning.py ────────────────────────────────────────────────
# Q-Learning personalization engine.
# State  = (engagement_level 0-4) x (performance_level 0-4)  → 25 states
# Actions = [-2, -1, 0, +1, +2] difficulty change            →  5 actions
# Triggered after every quiz with quiz_score + latest engagement score.

import numpy as np
import os, json
from dotenv import load_dotenv

load_dotenv()

# ── Constants ────────────────────────────────────────────────────────────────
DIFFICULTY_LEVELS = ['beginner', 'easy', 'medium', 'hard', 'advanced']
N_STATES          = 25   # 5 engagement x 5 performance
N_ACTIONS         = 5    # -2, -1, 0, +1, +2

ALPHA   = 0.2    # learning rate
GAMMA   = 0.9    # discount factor
EPSILON = 0.1    # exploration rate

# Q-table persisted per-session in a JSON file
QTABLE_PATH = os.path.join(os.path.dirname(__file__), "models", "qtable.json")


# ── State encoding ───────────────────────────────────────────────────────────

def _discretize(score: float, n: int = 5) -> int:
    """Map 0-1 score to 0-(n-1) bucket."""
    return min(n - 1, int(score * n))


def get_state(engagement_score: float, performance_score: float) -> int:
    """
    State index = engagement_level * 5 + performance_level
    Both inputs are 0-1 floats.
    """
    e = _discretize(float(engagement_score))
    p = _discretize(float(performance_score))
    return e * 5 + p


# ── Q-table I/O ──────────────────────────────────────────────────────────────

def load_qtable() -> np.ndarray:
    if os.path.exists(QTABLE_PATH):
        try:
            with open(QTABLE_PATH, 'r') as f:
                data = json.load(f)
            qt = np.array(data, dtype=np.float64)
            if qt.shape == (N_STATES, N_ACTIONS):
                return qt
        except Exception as e:
            print(f"[QLearning] Could not load Q-table: {e}")
    return np.zeros((N_STATES, N_ACTIONS), dtype=np.float64)


def save_qtable(qt: np.ndarray):
    os.makedirs(os.path.dirname(QTABLE_PATH), exist_ok=True)
    try:
        with open(QTABLE_PATH, 'w') as f:
            json.dump(qt.tolist(), f)
    except Exception as e:
        print(f"[QLearning] Could not save Q-table: {e}")


# ── Reward function ──────────────────────────────────────────────────────────

def compute_reward(quiz_score: float, engagement_score: float,
                   prev_difficulty: int, new_difficulty: int) -> float:
    """
    Reward signal:
    +2  if quiz_score >= 0.8  (student aced it)
    +1  if quiz_score >= 0.6
     0  if quiz_score >= 0.4
    -1  if quiz_score <  0.4  (too hard)
    +0.5 bonus if engagement is high (>= 0.6)
    -0.5 penalty if difficulty increased when engagement was low (< 0.35)
    """
    if quiz_score >= 0.8:
        r = 2.0
    elif quiz_score >= 0.6:
        r = 1.0
    elif quiz_score >= 0.4:
        r = 0.0
    else:
        r = -1.0

    if engagement_score >= 0.6:
        r += 0.5
    if engagement_score < 0.35 and new_difficulty > prev_difficulty:
        r -= 0.5

    return float(r)


# ── Action selection ─────────────────────────────────────────────────────────

def choose_action(qt: np.ndarray, state: int, explore: bool = True) -> int:
    if explore and np.random.random() < EPSILON:
        return int(np.random.randint(N_ACTIONS))
    return int(np.argmax(qt[state]))


def action_to_delta(action: int) -> int:
    """Map action index to difficulty delta: 0→-2, 1→-1, 2→0, 3→+1, 4→+2"""
    return action - 2


# ── Q-value update (Bellman) ─────────────────────────────────────────────────

def update_qtable(qt: np.ndarray, state: int, action: int,
                  reward: float, next_state: int) -> np.ndarray:
    old_q     = qt[state, action]
    max_next  = float(np.max(qt[next_state]))
    qt[state, action] = old_q + ALPHA * (reward + GAMMA * max_next - old_q)
    return qt


# ── Main entry point ─────────────────────────────────────────────────────────

def personalize(quiz_score: float, engagement_score: float,
                current_difficulty: str) -> dict:
    """
    Run one Q-learning update step and return the new difficulty.

    Args:
        quiz_score:        0-1  (correct / total)
        engagement_score:  0-1  (fused score from engagement module)
        current_difficulty: one of DIFFICULTY_LEVELS

    Returns:
        {
          "new_difficulty":  str,
          "prev_difficulty": str,
          "changed":         bool,
          "delta":           int,   # -2 to +2
          "reward":          float,
          "state":           int,
          "action":          int,
        }
    """
    qt = load_qtable()

    prev_idx = DIFFICULTY_LEVELS.index(current_difficulty) \
               if current_difficulty in DIFFICULTY_LEVELS else 2

    state  = get_state(engagement_score, quiz_score)
    action = choose_action(qt, state)
    delta  = action_to_delta(action)

    # Clamp new difficulty within [0, 4]
    new_idx = max(0, min(4, prev_idx + delta))
    new_difficulty = DIFFICULTY_LEVELS[new_idx]

    reward     = compute_reward(quiz_score, engagement_score, prev_idx, new_idx)
    next_state = get_state(engagement_score, quiz_score)   # simplified: same observation

    qt = update_qtable(qt, state, action, reward, next_state)
    save_qtable(qt)

    changed = new_idx != prev_idx

    print(f"[QLearning] eng={engagement_score:.2f} quiz={quiz_score:.2f} "
          f"| {current_difficulty} → {new_difficulty} (δ={delta:+d}, r={reward:.1f})")

    return {
        "new_difficulty":  new_difficulty,
        "prev_difficulty": current_difficulty,
        "changed":         changed,
        "delta":           int(delta),
        "reward":          float(reward),
        "state":           int(state),
        "action":          int(action),
    }
