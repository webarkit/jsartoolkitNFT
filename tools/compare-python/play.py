#!/usr/bin/env python3
"""Plays the compare-builds frame sequences through one build of the Python binding.

    python3 -I tools/compare-python/play.py --core-dir DIR --frames DIR \\
        --mode single|multi --out FILE [--invert-filtering]

It imports artoolkitnft_core from --core-dir (first on sys.path) and drives the native
class directly, not ARControllerNFT, so the comparison covers the binding alone. The
frames are the raw RGBA files of export-node.js; the luma is (3r + 4g + b) >> 3, the Node
controller's formula, so every build gets byte-identical input.

Phases, as PHASES in tools/compare-builds/scenarios.js: "both" 20 frames, "pinballOnly"
20, "blank" 5, then "bothAgain" 20 on the "both" frame. Each run uses a fresh ARToolKitNFT:
loadCamera, setup(2000, 1500), setupAR2, addNFTMarkers, then per frame passVideoData,
ret = detectNFTMarker() and getNFTMarker(i) for each marker.

--mode single: pinball only, one run labelled "single", no settings calls (0.0.14 has
               none), except setFiltering(True) with --invert-filtering, the self-test.
--mode multi:  pinball and kuva, the five runs of scenarios.js with their labels and
               settings, to compare with the Node records.

Writes {coreSha256, records}; a record is {scenario, frame, ret, markers: [{found, error,
pose}]}. ar2SelectTemplate reseeds rand() with time(NULL), so run it under a frozen clock
(libfaketime) to compare two builds frame by frame; see run_in_container.py.
"""
import argparse
import hashlib
import json
import os
import sys

WIDTH, HEIGHT = 2000, 1500
PHASES = (("both", "both", 20), ("pinballOnly", "pinballOnly", 20),
          ("blank", "blank", 5), ("bothAgain", "both", 20))
# As RUNS and runLabel() in tools/compare-builds/scenarios.js.
RUNS = (
    {"filtering": False, "continuous": True, "interval": 0},
    {"filtering": True, "continuous": True, "interval": 0},
    {"filtering": False, "continuous": False, "interval": 0},
    {"filtering": True, "continuous": False, "interval": 0},
    {"filtering": False, "continuous": True, "interval": 60000},
)

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAMERA = os.path.join(REPO, "examples", "Data", "camera_para.dat")
PINBALL = os.path.join(REPO, "examples", "DataNFT", "pinball")
KUVA = os.path.join(REPO, "examples", "DataNFT", "kuva")


def run_label(run):
    return (f"filtering {'on' if run['filtering'] else 'off'}, "
            f"continuous {'on' if run['continuous'] else 'off'}, "
            f"interval {run['interval']}")


def load_frames(frames_dir, np):
    """The three frames as flat uint8 arrays, each with its luma."""
    frames = {}
    for name in ("both", "pinballOnly", "blank"):
        rgba = np.fromfile(os.path.join(frames_dir, f"{name}.rgba"), dtype=np.uint8)
        if rgba.size != WIDTH * HEIGHT * 4:
            raise SystemExit(f"{name}.rgba has {rgba.size} bytes, expected {WIDTH * HEIGHT * 4}")
        px = rgba.reshape(-1, 4).astype(np.uint16)
        luma = ((3 * px[:, 0] + 4 * px[:, 1] + px[:, 2]) >> 3).astype(np.uint8)
        frames[name] = (rgba, luma)
    return frames


def snapshot(info):
    return {"found": info["found"], "error": info["error"], "pose": list(info["pose"])}


def play_run(core_module, frames, markers, label, settings):
    core = core_module.ARToolKitNFT()
    camera = core.loadCamera(CAMERA)
    core.setup(WIDTH, HEIGHT, camera)
    core.setupAR2()
    ids = core.addNFTMarkers(markers)
    if len(ids) != len(markers):
        raise SystemExit(f"addNFTMarkers({markers}) gave ids {ids}")
    settings(core)
    records = []
    for phase, frame_name, count in PHASES:
        rgba, luma = frames[frame_name]
        for frame in range(count):
            core.passVideoData(rgba, luma)
            ret = core.detectNFTMarker()
            records.append({
                "scenario": f"{phase} [{label}]",
                "frame": frame,
                "ret": ret,
                "markers": [snapshot(core.getNFTMarker(i)) for i in ids],
            })
    core.teardown()
    return records


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--core-dir", required=True)
    parser.add_argument("--frames", required=True)
    parser.add_argument("--mode", choices=("single", "multi"), required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--invert-filtering", action="store_true")
    args = parser.parse_args(argv)

    sys.path.insert(0, os.path.abspath(args.core_dir))
    import numpy as np
    import artoolkitnft_core as core_module

    module_file = os.path.abspath(core_module.__file__)
    if os.path.dirname(module_file) != os.path.abspath(args.core_dir):
        raise SystemExit(f"artoolkitnft_core came from {module_file}, not from {args.core_dir}")
    with open(module_file, "rb") as f:
        core_sha256 = hashlib.sha256(f.read()).hexdigest()

    frames = load_frames(args.frames, np)
    records = []
    if args.mode == "single":
        def settings(core):
            if args.invert_filtering:
                core.setFiltering(True)
        records += play_run(core_module, frames, [PINBALL], "single", settings)
    else:
        for run in RUNS:
            def settings(core, run=run):
                core.setFiltering(run["filtering"] != args.invert_filtering)
                core.setContinuousDetection(run["continuous"])
                core.setDetectionInterval(run["interval"])
            records += play_run(core_module, frames, [PINBALL, KUVA], run_label(run), settings)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"coreSha256": core_sha256, "records": records}, f)
    print(f"{module_file}: sha256 {core_sha256}, {len(records)} records -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
