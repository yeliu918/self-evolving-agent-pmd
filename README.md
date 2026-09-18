# Self-Evolving Agents site + MemCurator demo

Landing page (`index.html`) keeps the **Evolution Playground** and **Publications**
tabs (PMD, VPD). The MemCurator interactive demo is embedded in the Playground
tab. A full-page demo is also at `memcurator.html`.

## Quick Start

```bash
# Navigate to this directory
cd ui

# Start a local server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080/            # landing + tabs + embedded demo
open http://localhost:8080/#publications
open http://localhost:8080/memcurator.html
open http://localhost:8080/papers/pmd/
```

Or with Node.js:
```bash
npx serve .
# Then visit http://localhost:3000/
```

## Demo Features

### Timeline Controls
- **Play/Pause**: Animate through all 111 tasks
- **Speed**: 1x, 2x, or 4x playback
- **Slider**: Jump to any task index

### Panel A: Trajectory Bank (Left)
- Task tree grouped by type (5 categories)
- Click task type header to expand/collapse
- Click individual task to view its trajectory
- Shows step-by-step: action → env_feedback → reward

### Panel B: Memory Curator (Right)
- **Current Query**: The task description
- **Retrieved Skills**: What the RAG system found (or "cold start" if empty)
- **Curation Operation**: INSERT / UPDATE / DELETE badges
- **Result**: Success or failure with step count

### Panel C: Evaluation (Bottom)
- **Success Rate Chart**: Toggle between cumulative, rolling average (10), or by task type
- **Task Summary**: Total/success/failed counts + breakdown by type
- **Skill Bank Evolution**: How the skill count changes over time

### Case Study Section
Pre-configured sequence showing fail→success learning:
- **val:0000**: Cold start success (no memory)
- **val:0001**: Failure (lamp on dresser, bowl on desk — not co-located)
- **val:0002**: Success with updated skill (both on same desk)

Click "Show Case Study" or click individual cards to navigate.

## Data

The demo uses preprocessed data from:
```
data/skillos_valid_seen_gpt-5.6-luna_20260911_201846
```

Processed into `data/demo_data.json` containing:
- 111 task results with metadata
- Full trajectories (step-by-step actions)
- Curation operations (skill insertions/updates/deletions)

### Task Types & Success Rates
| Type | Success Rate |
|------|-------------|
| look_at_obj_in_light | 12/13 (92%) |
| pick_and_place | 28/35 (80%) |
| pick_clean_then_place | 14/27 (52%) |
| pick_cool_then_place | 10/25 (40%) |
| pick_heat_then_place | 0/11 (0%) |

## Regenerating Data

If you need to regenerate `demo_data.json` from source:

```python
import json
import os

base_path = "./data/skillos_valid_seen_gpt-5.6-luna_20260911_201846"
output_path = "./data"

# Load and process results.jsonl, curation.jsonl, and predictions/
# See the data processing script below
```

### Data Processing Script

```python
import json
import os

base_path = "./data/skillos_valid_seen_gpt-5.6-luna_20260911_201846"
output_path = "./data"

# Load results
results = []
with open(f"{base_path}/results.jsonl") as f:
    for line in f:
        results.append(json.loads(line))

# Load curation
curation = []
with open(f"{base_path}/curation.jsonl") as f:
    for line in f:
        curation.append(json.loads(line))

# Load trajectories
trajectories = {}
for r in results:
    traj_path = f"{base_path}/predictions/{r['id']}/conversation.json"
    if os.path.exists(traj_path):
        with open(traj_path) as f:
            trajectories[r['id']] = json.load(f)

# Create condensed demo data
demo_data = {
    "metadata": {
        "experiment": os.path.basename(base_path),
        "total_tasks": len(results),
        "executor": "gpt-5.6-luna"
    },
    "results": [],
    "trajectories": {},
    "curation": []
}

# Process results
for r in results:
    demo_data["results"].append({
        "id": r["id"],
        "task_type": r.get("task_type", ""),
        "task_description": r.get("task_description", ""),
        "success": r.get("hard", 0) == 1,
        "n_turns": r.get("n_turns", 0),
        "fail_reason": r.get("fail_reason", ""),
        "retrieved_skills": r.get("retrieved_skills", []),
        "repo_size_before": r.get("repo_size_before", 0),
        "repo_size_after": r.get("repo_size_after", 0),
        "judge_rationale": r.get("judge_rationale", ""),
        "env_success": r.get("env_success", 0),
        "judge_success": r.get("judge_success", 0)
    })

# Process curation
for c in curation:
    demo_data["curation"].append({
        "id": c["id"],
        "success": c.get("success", False),
        "ops": c.get("ops", [])
    })

# Include trajectories (condensed)
for task_id, traj in trajectories.items():
    demo_data["trajectories"][task_id] = [
        {
            "step": t["step"],
            "action": t["action"],
            "reasoning": t.get("reasoning", "")[:200],
            "env_feedback": t.get("env_feedback", ""),
            "reward": t.get("reward", 0),
            "done": t.get("done", False)
        }
        for t in traj
    ]

# Save
os.makedirs(output_path, exist_ok=True)
with open(f"{output_path}/demo_data.json", "w") as f:
    json.dump(demo_data, f, indent=2)

print(f"Created demo_data.json with {len(demo_data['results'])} tasks")
```

## File Structure

```
ui/
├── index.html          # Main demo page
├── css/
│   └── demo.css        # Dark theme styling
├── js/
│   └── demo.js         # Visualization logic + Chart.js
├── data/
│   └── demo_data.json  # Preprocessed experiment data
└── README.md           # This file
```

## Dependencies

- **Chart.js** (loaded via CDN) — for success rate and skill bank charts
- No build step required — vanilla HTML/CSS/JS

## Notes

- Current data is `valid_seen` (IID test) only
- No holdout/OOD (`valid_unseen`) data available yet
- The demo works offline once loaded (no API calls)
