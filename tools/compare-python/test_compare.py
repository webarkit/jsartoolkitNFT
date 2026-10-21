"""Tests of compare.py on synthetic records (run: python -m pytest tools/compare-python)."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compare  # noqa: E402

POSE = [0.98, 0.16, 0.01, -182.2, 0.15, -0.92, -0.34, 64.8, -0.05, 0.34, -0.93, 584.0]
ZERO = [0.0] * 12


def rec(scenario, frame, ret, markers):
    """A record as play.py and scenarios.js write it; markers is a list of found flags."""
    return {
        "scenario": scenario,
        "frame": frame,
        "ret": ret,
        "markers": [
            {"found": 1, "error": 1.5, "pose": list(POSE)} if found
            else {"found": 0, "error": -1, "pose": list(ZERO)}
            for found in markers
        ],
    }


def single_records(found_in_blank=False):
    """Single-marker records that exercise tracking: found, lost on the blank frames, found again."""
    records = []
    for phase, found in (("both", True), ("pinballOnly", True), ("blank", found_in_blank), ("bothAgain", True)):
        for frame in range(2):
            records.append(rec(f"{phase} [single]", frame, -1 if found else 0, [found]))
    return records


def write(tmp_path, name, records):
    path = tmp_path / name
    path.write_text(json.dumps({"records": records}))
    return str(path)


def test_identical_records_exit_0(tmp_path, capsys):
    a = write(tmp_path, "a.json", single_records())
    b = write(tmp_path, "b.json", single_records())
    assert compare.main([a, b, "--mode", "exact"]) == 0
    assert "identical (8 records)" in capsys.readouterr().out


def test_pose_bit_difference_exit_1_names_field(tmp_path, capsys):
    new = single_records()
    new[3]["markers"][0]["pose"][7] = math.nextafter(POSE[7], math.inf)
    a = write(tmp_path, "a.json", single_records())
    b = write(tmp_path, "b.json", new)
    assert compare.main([a, b, "--mode", "exact"]) == 1
    out = capsys.readouterr().out
    assert "#3 pinballOnly [single] frame 1: markers[0].pose" in out


def test_not_exercised_exit_2(tmp_path, capsys):
    a = write(tmp_path, "a.json", single_records(found_in_blank=True))
    b = write(tmp_path, "b.json", single_records(found_in_blank=True))
    assert compare.main([a, b, "--mode", "exact"]) == 2
    assert "never lost" in capsys.readouterr().out


def test_found_mode_tolerates_pose_but_not_found_set(tmp_path, capsys):
    a = write(tmp_path, "a.json", single_records())
    shifted = single_records()
    shifted[0]["markers"][0]["pose"][3] += 1e-3
    b = write(tmp_path, "b.json", shifted)
    assert compare.main([a, b, "--mode", "found"]) == 0
    assert "same found sets (8 records)" in capsys.readouterr().out
    assert compare.main([a, b, "--mode", "found", "--tolerance", "1e-4"]) == 1
    flipped = single_records()
    flipped[2]["markers"][0] = {"found": 0, "error": -1, "pose": list(ZERO)}
    c = write(tmp_path, "c.json", flipped)
    assert compare.main([a, c, "--mode", "found"]) == 1
    assert "markers[0].found" in capsys.readouterr().out


def test_missing_file_exit_2(tmp_path):
    a = write(tmp_path, "a.json", single_records())
    assert compare.main([a, str(tmp_path / "missing.json"), "--mode", "exact"]) == 2
