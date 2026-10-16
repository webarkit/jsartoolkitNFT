#!/usr/bin/env python3
"""Compares the tracking records of two builds, as written by play.py or export-node.js.

    python3 compare.py OLD NEW --mode exact|found [--tolerance T]

A record is {scenario, frame, ret, markers: [{found, error, pose}]}, one per frame, the
record of tools/compare-builds/scenarios.js. A file holds {"records": [...]} (play.py
and export-node.js add the sha256 of what they ran).

--mode exact   every record identical: ret, found, error and the 12 pose values, compared
               with == on the floats JSON gives back, which round-trip exactly. This is the
               check that the Python binding on ARToolKitNFTCore tracks as 0.0.14 did.
--mode found   the same found set on every frame; the poses may differ (another rand() or
               another compiler), and the largest difference is reported, translation
               (pose indices 3, 7, 11) and rotation separately. With --tolerance, a larger
               difference fails.

Exit 0 with a verdict line and, per marker, the frames on which OLD found it; exit 1 with
the first difference, as "#index scenario frame N: field"; exit 2 for bad arguments, a
missing file, or OLD records that do not exercise tracking (two builds that track nothing
compare identical). Single-marker records must find the marker in "both", "pinballOnly"
and "bothAgain" and lose it in "blank"; multi-marker records follow checkExercised in
scenarios.js.
"""
import argparse
import json
import re
import sys

TRANSLATION = (3, 7, 11)
MUST_FIND = ("both", "bothAgain")


def load(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data["records"] if isinstance(data, dict) else data


def parse_scenario(scenario):
    """Splits "phase [run]" into (phase, run), as parseScenario in scenarios.js."""
    match = re.match(r"^(\w+) \[(.*)\]$", scenario)
    return (match.group(1), match.group(2)) if match else ("", scenario)


def exercised_problems(records):
    """Why the records do not show tracking at work; empty when they do."""
    if not records:
        return ["no records"]
    runs = {}
    for record in records:
        phase, run = parse_scenario(record["scenario"])
        entry = runs.setdefault(run, {"markers": 0, "ret": False, "phases": {}})
        entry["markers"] = max(entry["markers"], len(record["markers"]))
        entry["ret"] = entry["ret"] or record["ret"] is not None
        states = entry["phases"].setdefault(phase, {"found": set(), "lost": set()})
        for i, marker in enumerate(record["markers"]):
            states["found" if marker["found"] else "lost"].add(i)

    problems = []
    empty = {"found": set(), "lost": set()}
    for run, entry in runs.items():
        n = entry["markers"]
        phases = entry["phases"]
        if n == 0:
            problems.append(f"[{run}]: no markers")
            continue
        if not entry["ret"]:
            problems.append(f"[{run}]: detectNFTMarker() never observed")
        must_find = MUST_FIND + (("pinballOnly",) if n == 1 else ())
        for phase in must_find:
            for i in range(n):
                if i not in phases.get(phase, empty)["found"]:
                    problems.append(f"{phase} [{run}]: marker {i} never found")
        if n > 1:
            pinball_only = phases.get("pinballOnly", empty)
            if not pinball_only["lost"]:
                problems.append(f"pinballOnly [{run}]: no marker lost")
            if not pinball_only["found"]:
                problems.append(f"pinballOnly [{run}]: no marker found")
        for i in range(n):
            if i not in phases.get("blank", empty)["lost"]:
                problems.append(f"blank [{run}]: marker {i} never lost")
    return problems


def record_difference(a, b, compare_poses=True):
    """The first field in which two records differ, or None."""
    if a["scenario"] != b["scenario"] or a["frame"] != b["frame"]:
        return "scenario/frame"
    if compare_poses and a["ret"] != b["ret"]:
        return "ret"
    if len(a["markers"]) != len(b["markers"]):
        return "markers.length"
    for i, (ma, mb) in enumerate(zip(a["markers"], b["markers"])):
        if ma["found"] != mb["found"]:
            return f"markers[{i}].found"
        if not compare_poses:
            continue
        if ma["error"] != mb["error"]:
            return f"markers[{i}].error"
        if ma["pose"] != mb["pose"]:
            return f"markers[{i}].pose"
    return None


def found_counts(records):
    counts = {}
    for record in records:
        for i, marker in enumerate(record["markers"]):
            counts[i] = counts.get(i, 0) + (1 if marker["found"] else 0)
    return ", ".join(f"marker {i} on {c}/{len(records)} frames" for i, c in sorted(counts.items()))


def max_pose_difference(old, new):
    """The largest |Δ| over frames where both found a marker: (translation, rotation)."""
    worst_t = worst_r = 0.0
    for a, b in zip(old, new):
        for ma, mb in zip(a["markers"], b["markers"]):
            if not (ma["found"] and mb["found"]):
                continue
            for k, (x, y) in enumerate(zip(ma["pose"], mb["pose"])):
                d = abs(x - y)
                if k in TRANSLATION:
                    worst_t = max(worst_t, d)
                else:
                    worst_r = max(worst_r, d)
    return worst_t, worst_r


def report_difference(index, field, a, b):
    print(f"#{index} {a['scenario'] if a else b['scenario']} frame {(a or b)['frame']}: {field}")
    print(f"  old: {json.dumps(a)}")
    print(f"  new: {json.dumps(b)}")


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("old")
    parser.add_argument("new")
    parser.add_argument("--mode", choices=("exact", "found"), required=True)
    parser.add_argument("--tolerance", type=float)
    try:
        args = parser.parse_args(argv)
    except SystemExit:
        return 2
    try:
        old, new = load(args.old), load(args.new)
    except (OSError, ValueError, KeyError) as e:
        print(f"cannot read the records: {e}")
        return 2

    problems = exercised_problems(old)
    if problems:
        print("OLD does not exercise tracking, so no verdict:")
        for p in problems:
            print(f"  {p}")
        return 2

    for index in range(max(len(old), len(new))):
        a = old[index] if index < len(old) else None
        b = new[index] if index < len(new) else None
        field = "missing record" if a is None or b is None else record_difference(
            a, b, compare_poses=args.mode == "exact")
        if field:
            report_difference(index, field, a, b)
            return 1

    if args.mode == "exact":
        print(f"identical ({len(old)} records)")
    else:
        worst_t, worst_r = max_pose_difference(old, new)
        print(f"same found sets ({len(old)} records), max |Δpose| "
              f"translation {worst_t:.6g}, rotation {worst_r:.6g}")
        if args.tolerance is not None and max(worst_t, worst_r) > args.tolerance:
            print(f"pose difference above the tolerance {args.tolerance:g}")
            return 1
    print(f"old found: {found_counts(old)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
