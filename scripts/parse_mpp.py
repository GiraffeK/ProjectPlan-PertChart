#!/usr/bin/env python3
import sys
import os
import json
from pathlib import Path
from datetime import datetime

# Ensure mpp_parser can be imported
script_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(script_dir / "mpp_parser"))

try:
    from mpp_reader import MPPReader
    from msp_export import project_to_dict
except ImportError as e:
    sys.stderr.write(f"ImportError: {e}\n")
    sys.exit(1)

def parse_mpp(mpp_file_path: str):
    p = Path(mpp_file_path)
    if not p.exists():
        sys.stderr.write(f"File not found: {mpp_file_path}\n")
        sys.exit(1)

    reader = MPPReader(str(p))
    project_obj = reader.read()
    data = project_to_dict(project_obj)

    project_meta = data.get("project", {})
    project_name = project_meta.get("title") or p.stem or "Imported Project"
    
    # Start date
    start_date = None
    if project_meta.get("start_date"):
        try:
            start_date = project_meta["start_date"][:10]
        except Exception:
            pass
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")

    raw_tasks = data.get("tasks", [])
    raw_predecessors = data.get("predecessors", [])

    # Map tasks
    # Determine ID mapping
    task_map = {}
    id_to_tid = {}

    for t in raw_tasks:
        tid_num = t.get("id") or t.get("unique_id")
        tid = f"T{tid_num}"
        id_to_tid[t.get("id")] = tid
        id_to_tid[t.get("unique_id")] = tid

        # Duration in days (MS Project duration is in minutes, 480 mins = 1 day)
        dur_mins = t.get("duration_minutes", 0.0)
        dur_days = round(dur_mins / 480.0, 1)
        if dur_days <= 0:
            # Try to calculate from start & finish if available
            s_str = t.get("start")
            f_str = t.get("finish")
            if s_str and f_str:
                try:
                    s_dt = datetime.fromisoformat(s_str)
                    f_dt = datetime.fromisoformat(f_str)
                    diff = (f_dt - s_dt).days
                    if diff > 0:
                        dur_days = float(diff)
                except Exception:
                    pass
        if dur_days <= 0:
            dur_days = 1.0

        task_entry = {
            "id": tid,
            "uid": t.get("unique_id") or t.get("id"),
            "name": t.get("name") or f"Task {tid_num}",
            "duration": dur_days,
            "category": f"Level {t.get('outline_level')}" if t.get("outline_level", 0) > 0 else "General",
            "predecessors": [],
            "startDate": t.get("start")[:10] if t.get("start") else None,
            "finishDate": t.get("finish")[:10] if t.get("finish") else None,
        }
        task_map[tid] = task_entry

    # Add predecessors
    for p_link in raw_predecessors:
        succ_tid = id_to_tid.get(p_link.get("successor_task_id"))
        pred_tid = id_to_tid.get(p_link.get("predecessor_task_id"))

        if succ_tid and pred_tid and succ_tid in task_map and pred_tid in task_map:
            if pred_tid not in task_map[succ_tid]["predecessors"] and pred_tid != succ_tid:
                task_map[succ_tid]["predecessors"].append(pred_tid)

    tasks_list = list(task_map.values())

    result = {
        "projectName": project_name,
        "startDate": start_date,
        "tasks": tasks_list
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python parse_mpp.py <file.mpp>\n")
        sys.exit(1)
    parse_mpp(sys.argv[1])
