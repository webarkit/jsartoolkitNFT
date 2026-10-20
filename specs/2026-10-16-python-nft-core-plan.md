# Python binding on ARToolKitNFTCore: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the pybind11 class in `python-bindings/ARToolKitNFT_py.cpp` into a thin adapter
over WebARKitLib's `ARToolKitNFTCore`. Add `setFiltering`, `setContinuousDetection` and
`setDetectionInterval`. Prove that a single marker tracks exactly as 0.0.14 does once the AR2
thresholds are restored to 5.0 / 0.5.

**Architecture:**
- `setup.py` compiles the core's sources into `artoolkitnft_core`.
- The adapter keeps only:
  - the numpy and `dict` conversion;
  - the `ARHandle` used by the threshold, debug and image-processing methods.
- `ARControllerNFT` gains three forwarding methods.
- Two one-off tools in `tools/compare-python/` compare the new binding, frame by frame, with
  0.0.14 (exact) and with the Node build (same found sets).

**Tech stack:**
- C++17, pybind11 and setuptools (`Pybind11Extension`), WebARKitLib 0.11.0 (submodule
  c3ede5d);
- Python 3.9+ for the package, with tests on 3.11 in CI, pytest and pytest-asyncio, numpy,
  Pillow;
- Node 24 and sharp for the Node export;
- Docker `ubuntu:24.04` with libfaketime for the comparisons.

**Spec:** `specs/2026-10-16-python-nft-core-design.md` (decisions D1–D10). The executor reads
it. Its "Recording the reasons" table is part of every task.

## Global Constraints

**Repository rules**
- PRs target `dev`. Commits follow Conventional Commits, with types
  `feat|fix|perf|doc|refactor|test|style|chore` only (`doc`, not `docs`).
- Commit bodies say "Refs #693"; only the PR body says "Closes #693".
- Commits are GPG-signed. Never bypass signing. If pinentry times out, ask the user to
  unlock the key and retry.
- End every commit message with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nothing under `emscripten/**` or `tools/makem.js` changes, so `build/` and `dist/` are not
  rebuilt. If the core itself needs a source change (a WebARKitLib patch release and a
  submodule bump), **stop and ask the user**: the spec's Build section puts that bump first,
  in a separate PR.

**What must not change**
- The Python API (G3): every existing method keeps its name, its arguments and the shape of
  what it returns.
- `example.py` and the existing tests of `test_arcontrollerNFT.py` keep passing unchanged.
  The one exception is `test_process_image`, which Task 3 rewrites.
- Package code (`src/artoolkitnft/`) keeps syntax valid on Python 3.9.
- The versions in `pyproject.toml` and `setup.py` stay at 0.0.14. The 0.1.0 bump belongs to
  the release (D8).

**Values pinned by the spec**
- The core is built with `singleThreadPreset()`: sync KPM detector and `ar2*Mod` functions,
  AR2 tracking thresh 5.0, sim thresh 0.50, search feature num 16, search size 6, template
  sizes 6 / 6.
- Defaults: filtering off, continuous detection on, detection interval 300 ms.
- `PAGES_MAX` is 20, and `MARKER_INDEX_OUT_OF_BOUNDS` is -3.
- The camera is `../examples/Data/camera_para.dat`, and the markers are
  `../examples/DataNFT/pinball` and `../examples/DataNFT/kuva`. These paths are relative to
  `python-bindings/`.

**Adapter rules**
- No bound method releases the GIL (no `py::call_guard<py::gil_scoped_release>`).
- Every reason in the spec's "Recording the reasons" table goes where that table says: a code
  comment, a docstring, the commit body, the PR description. Each task below names the ones
  it owns.

**Outward actions:** pushing the branch, opening the PR, and opening issues or PRs in this
repository or in WebARKitLib each need the user's explicit OK in chat first.

**Windows host notes**
- Use `git -c http.sslBackend=schannel` for git network commands, and `node --use-system-ca`
  for npm.
- Prefix `docker` commands that mount paths with `MSYS_NO_PATHCONV=1`.
- Shell scripts would be checked out with CRLF (`core.autocrlf=true`), so the container
  driver is a Python script.

## Review Focus

1. **Frame or luma of the wrong size** given to `passVideoData`: it returns `-1`, copies
   nothing and does not crash (test in Task 2).
2. **`detectNFTMarker()` before any frame or any marker:**
   - before markers are loaded, it returns `-1`;
   - before any frame is passed, the core searches its zeroed buffers and finds nothing;
   - nothing is reported found, `getNFTMarker(0)` without markers gives `{"error": -3}`, and
     nothing crashes (test in Task 2).
3. **Calls after `teardown()`:**
   - `getNFTMarker(0)` gives `{"error": -3}`;
   - `detectNFTMarker()` returns `-1`;
   - `getNFTData(0)` still answers with pinball's data (test in Task 2).
4. **A marker load that fails** (a path that does not exist) after a good one:
   - it returns `[]`;
   - the earlier marker keeps id 0 and still detects;
   - the next good load gets id 1 (test in Task 2).
5. **`setup()` with a width or height of 0:** it returns `-1` and no handle is created. This
   is a deliberate change from 0.0.14, which accepted it, and its reason goes in the PR table
   (test in Task 2).

---

## File structure

| File | Responsibility |
|---|---|
| `python-bindings/setup.py` | Compile the core's sources too; `NOMINMAX` on Windows for the core's sources |
| `python-bindings/ARToolKitNFT_py.h` | The adapter class: an `ARToolKitNFTCore` member plus the `ARHandle` |
| `python-bindings/ARToolKitNFT_py.cpp` | Adapter methods and the `PYBIND11_MODULE` |
| `python-bindings/src/artoolkitnft/arcontrollerNFT.py` | Three forwarding methods |
| `python-bindings/test_arcontrollerNFT.py` | Frame helpers; the new `TestCoreAdapter` class (native); the rewritten `test_process_image` and new controller tests in `TestNFT` |
| `python-bindings/README.md` | A usage section: several markers, the three settings |
| `python-bindings/test.py` | Deleted |
| `tools/compare-builds/node-frames.js` | `loadNodeFrames()`, moved out of `compare-builds.js` to be shared |
| `tools/compare-python/export-node.js` | Write the Node frames (raw RGBA) and the Node records |
| `tools/compare-python/play.py` | Drive one `artoolkitnft_core` build through the phases and write records |
| `tools/compare-python/compare.py` | Compare two record files: exact, or by found set with pose differences |
| `tools/compare-python/test_compare.py` | Unit tests of `compare.py` on synthetic records |
| `tools/compare-python/run_in_container.py` | The equivalence run inside `ubuntu:24.04` |
| `.gitignore` | `tools/compare-python/frames/`, `tools/compare-python/out/`, `tools/compare-python/ref/` |

---

### Task 1: Compile the core into the extension

**Files:**
- Modify: `python-bindings/setup.py` (the `build_ext.build_extensions` hook, `include_dirs`,
  the `sources` list)

**Interfaces:**
- Produces: an `artoolkitnft_core` that links the core's object files. The binding code is
  still 0.0.14's.
- Produces: the long-lived Docker container `nft-py`, used by every later task to build and
  test.

- [ ] **Step 1: Prepare the worktree**

Run in the worktree:
- `git -c http.sslBackend=schannel submodule update --init`;
- `node --use-system-ca "$(dirname "$(which npm)")/node_modules/npm/bin/npm-cli.js" ci`.

Expected: `git submodule status` shows `c3ede5d… emscripten/WebARKitLib` with no leading `-`,
and `node_modules/sharp` exists.

- [ ] **Step 2: Create the build container and check the baseline**

```bash
MSYS_NO_PATHCONV=1 docker run -dit --name nft-py -v "$(pwd -W)":/src -w /src/python-bindings ubuntu:24.04 bash
docker exec nft-py bash -c "apt-get update -qq && apt-get install -y -qq python3-venv python3-dev build-essential cmake curl libjpeg9 faketime unzip >/dev/null && python3 -m venv /venv && /venv/bin/pip install -q numpy setuptools wheel pybind11 pytest pytest-asyncio pillow"
docker exec nft-py bash -c "rm -rf dist && /venv/bin/python setup.py -q bdist_wheel && /venv/bin/pip install -q --force-reinstall dist/*.whl && /venv/bin/python -m pytest test_arcontrollerNFT.py -q"
```

Expected: `9 passed`. This is the build-and-test command that later tasks call "the container
test".

- [ ] **Step 3: Add the core to the build**

Change `setup.py` as follows:

- Append these five sources to the extension:
  - `../emscripten/WebARKitLib/WebARKit/WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.cpp`;
  - `…/WebARKitNFT/SyncKpmDetector.cpp`;
  - `…/WebARKitNFT/NFTClock.cpp`;
  - `…/WebARKitNFT/markerDecompress.c`;
  - `../emscripten/WebARKitLib/WebARKit/WebARKitLog.cpp`.
- Append `'../emscripten/WebARKitLib/WebARKit/include'` to `include_dirs`.
- Do not compile `ThreadedKpmDetector.cpp`, and do not define `WEBARKIT_NFT_THREADS`.
- In `patched_compile`, on `sys.platform == 'win32'`, append `'/DNOMINMAX'` to
  `extra_postargs` for sources whose path contains `WebARKitTrackers/WebARKitNFT/` or ends
  with `WebARKitLog.cpp`, comparing paths after `os.path.normpath`.
- Extend the `build_ext` docstring with a third adjustment, carrying this reason:
  `<AR/config.h>` includes `<windows.h>`, whose `max` macro breaks
  `std::numeric_limits<int>::max()` in `ARToolKitNFTCore::setup()` (MSVC C2589); the core's
  sources only, because ARToolKit's C sources do not need it.
- Next to the sources, add a comment saying the list matches `MAIN_SOURCES_IMPROVED_ES6` in
  `tools/makem.js`, without the Embind file.

- [ ] **Step 4: Run the container test**

Expected: `9 passed`. The old binding now links next to the core's objects, with no
duplicate symbols.

- [ ] **Step 5: Commit**

Commit `chore: compile ARToolKitNFTCore into the Python extension`. The body gives the
`NOMINMAX` reason and `Refs #693`.

- [ ] **Step 6: Check Windows and macOS**

Ask the user whether the branch `feat/python-nft-core` may be pushed for CI. That OK covers
the later pushes of this branch. On a yes, run
`git -c http.sslBackend=schannel push -u origin feat/python-nft-core`, and watch
`build-python.yml`.

Expected: all three jobs green. If MSVC or clang fail inside the core's sources, apply a
build-flag workaround in `setup.py` if one exists. Otherwise stop and ask the user (see
Global Constraints).

---

### Task 2: The adapter on the core

**Files:**
- Rewrite: `python-bindings/ARToolKitNFT_py.h`, `python-bindings/ARToolKitNFT_py.cpp`
- Test: `python-bindings/test_arcontrollerNFT.py` (new helpers, new class `TestCoreAdapter`,
  after `TestNFT`)

**Interfaces:**
- Consumes: `ARToolKitNFTCore` (WebARKitLib header
  `WebARKitTrackers/WebARKitNFT/ARToolKitNFTCore.h`) and `singleThreadPreset()`.
- Produces, in module `artoolkitnft_core`:
  - `ARToolKitNFT(withFiltering: bool = False)`, plus every method bound today, under the
    same Python names;
  - the new methods `setFiltering(enableFiltering: bool) -> None`,
    `setContinuousDetection(enabled: bool) -> None` and
    `setDetectionInterval(ms: float) -> None`;
  - `getNFTMarker(i) -> dict`, in exactly the shapes listed in the spec's "Native adapter"
    section;
  - the class `nftMarker`, now the core's struct, with the same four fields;
  - `NFT_MARKER = 0`.
- Produces, in `test_arcontrollerNFT.py`, these helpers, which Task 3 reuses:
  - `import artoolkitnft_core`, for the native tests;
  - `CAMERA`, `PINBALL`, `KUVA`: the relative paths from Global Constraints;
  - `KUVA_PRINT = [(1128, 380), (1705, 452), (1705, 1165), (1096, 1100)]` and
    `KUVA_FILL = (0xd9, 0xd4, 0xca, 255)`;
  - `frames() -> dict` with keys `"both"`, `"pinballOnly"` and `"blank"`:
    - each is a `(1500, 2000, 4)` uint8 RGBA array, cached with `functools.lru_cache`;
    - `both` is `pinball-demo.jpg`;
    - `pinballOnly` is the same photo with `KUVA_PRINT` filled with `KUVA_FILL`, through
      `PIL.ImageDraw`;
    - `blank` is grey 128 with alpha 255;
  - `luma(rgba) -> np.ndarray`: `(3*r + 4*g + b) >> 3` computed in uint16, returned as
    uint8 `(H, W)`. This is the Node controller's formula;
  - `new_core(*batches, withFiltering=False)`:
    - a native `ARToolKitNFT` after `loadCamera`, `setup(2000, 1500, cam)` and `setupAR2()`;
    - then one `addNFTMarkers(batch)` per batch;
    - it returns `(core, ids_per_batch)`;
  - `play(core, rgba, n) -> list`:
    - for each of `n` frames: `passVideoData(rgba.ravel(), luma(rgba).ravel())`, then
      `detectNFTMarker()`;
    - it returns, per frame, the list of `getNFTMarker(i)` for every loaded marker;
  - `assert_real_pose(pose)`: 12 finite values, not all zero, with at least one non-zero
    value among indices 3, 7 and 11.

- [ ] **Step 1: Write the failing tests** (class `TestCoreAdapter`; plain functions, no asyncio)

```python
def test_two_loads_get_distinct_ids(self):
    core, ids = new_core([PINBALL], [KUVA])
    assert ids == [[0], [1]]
    p, k = core.getNFTData(0), core.getNFTData(1)
    assert (p.id_NFT, p.width_NFT, p.height_NFT, p.dpi_NFT) == (0, 893, 1117, 120)
    assert (k.id_NFT, k.width_NFT, k.height_NFT, k.dpi_NFT) == (1, 640, 480, 72)  # kuva.iset JPEG header

def test_over_limit_load_returns_empty_and_keeps_markers(self):
    core, _ = new_core([PINBALL])
    assert core.addNFTMarkers([PINBALL] * 20) == []          # 1 + 20 > PAGES_MAX
    assert any(f[0]["found"] == 1 for f in play(core, frames()["pinballOnly"], 10))

def test_failed_load_keeps_ids(self):                         # Review Focus 4
    core, _ = new_core([PINBALL])
    assert core.addNFTMarkers(["../examples/DataNFT/missing"]) == []
    assert any(f[0]["found"] == 1 for f in play(core, frames()["pinballOnly"], 10))
    assert core.addNFTMarkers([KUVA]) == [1]

def test_marker_info_shapes(self):
    core, _ = new_core([PINBALL])
    assert core.getNFTMarker(1) == {"error": -3}
    assert core.getNFTMarker(0) == {"id": 0, "error": -1, "found": 0, "pose": [0.0] * 12}
    seen = [f[0] for f in play(core, frames()["pinballOnly"], 10) if f[0]["found"]]
    assert seen and seen[-1]["id"] == 0 and seen[-1]["error"] >= 0
    assert_real_pose(seen[-1]["pose"])

def test_get_nft_marker_only_reports(self):
    core, _ = new_core([PINBALL])
    play(core, frames()["pinballOnly"], 10)
    assert core.getNFTMarker(0) == core.getNFTMarker(0)       # 0.0.14 tracked again on each call

def test_both_markers_tracked_then_kuva_lost(self):
    core, _ = new_core([PINBALL], [KUVA])
    both = play(core, frames()["both"], 10)
    assert any(f[0]["found"] and f[1]["found"] for f in both)
    after = play(core, frames()["pinballOnly"], 5)
    assert after[-1][0]["found"] == 1 and after[-1][1]["found"] == 0

def test_continuous_detection_off_blocks_new_marker(self):
    core, _ = new_core([PINBALL], [KUVA])
    core.setContinuousDetection(False)
    assert play(core, frames()["pinballOnly"], 10)[-1][0]["found"] == 1
    assert all(f[1]["found"] == 0 for f in play(core, frames()["both"], 5))
    core.setContinuousDetection(True); core.setDetectionInterval(0)
    assert any(f[1]["found"] for f in play(core, frames()["both"], 10))

def test_detection_interval_blocks_new_marker(self):
    core, _ = new_core([PINBALL], [KUVA])
    core.setDetectionInterval(60000)
    assert play(core, frames()["pinballOnly"], 10)[-1][0]["found"] == 1
    assert all(f[1]["found"] == 0 for f in play(core, frames()["both"], 5))

def test_filtering_keeps_tracking(self):
    for core in (new_core([PINBALL], withFiltering=True)[0], new_core([PINBALL])[0]):
        core.setFiltering(True)
        seen = [f[0] for f in play(core, frames()["pinballOnly"], 10) if f[0]["found"]]
        assert seen; assert_real_pose(seen[-1]["pose"])

def test_bad_frame_size_is_rejected(self):                    # Review Focus 1
    core, _ = new_core([PINBALL])
    rgba = frames()["pinballOnly"]
    assert core.passVideoData(rgba.ravel()[:-4], luma(rgba).ravel()) == -1
    assert core.passVideoData(rgba.ravel(), luma(rgba).ravel()[:-1]) == -1

def test_detect_before_markers_and_frames(self):              # Review Focus 2
    core = artoolkitnft_core.ARToolKitNFT()
    core.setup(2000, 1500, core.loadCamera(CAMERA)); core.setupAR2()
    assert core.detectNFTMarker() == -1
    assert core.getNFTMarker(0) == {"error": -3}

def test_after_teardown(self):                                # Review Focus 3
    core, _ = new_core([PINBALL])
    core.teardown()
    assert core.getNFTMarker(0) == {"error": -3}
    assert core.detectNFTMarker() == -1
    assert core.getNFTData(0).width_NFT == 893

def test_setup_rejects_empty_frame(self):                     # Review Focus 5
    core = artoolkitnft_core.ARToolKitNFT()
    assert core.setup(0, 1500, core.loadCamera(CAMERA)) == -1

def test_get_nft_data_out_of_range_raises(self):
    core, _ = new_core([PINBALL])
    with pytest.raises(IndexError):
        core.getNFTData(5)
```

**A deviation from the spec, in `test_filtering_keeps_tracking`:** it checks that filtering
is wired and keeps tracking, not that it changes the poses. Two runs in one process cannot
show that difference. `ar2SelectTemplate` reseeds the global `rand()` with `time(NULL)` every
128 calls, so the unfiltered poses of two runs already differ, and the test would pass without
proving anything. The proof that filtering changes the poses is the self-test in Task 5. It
runs in separate processes under a frozen clock, where the only difference is the filter.
State this in the test's docstring.

- [ ] **Step 2: Run the container test**

Expected: the new tests fail: `ARToolKitNFT()` takes no `withFiltering`, the setters do not
exist, and the second load returns `[0]`. The 9 old tests still pass.

- [ ] **Step 3: Rewrite the header**

Write `ARToolKitNFT_py.h` with the same public methods as today, minus the unbound
`setCamera`. On top of those:
- the constructor becomes `explicit ARToolKitNFT(bool withFiltering = false)`;
- add `void setFiltering(bool enableFiltering)`, `void setContinuousDetection(bool enabled)`
  and `void setDetectionInterval(double ms)`.

Private members:
- `void deleteARHandles()` and `int createARHandles()`;
- `ARToolKitNFTCore core`, then `int width`, `int height`, `ARHandle *arhandle`,
  `AR3DHandle *ar3DHandle` and `AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA`.

Remove the file's own `nftMarker`, `PAGES_MAX`, `cameraParams` and id counters, which the core
now provides. Include `<WebARKitLog.h>` for `webarkitLogLevel`.

- [ ] **Step 4: Rewrite the adapter**

Write `ARToolKitNFT_py.cpp` per the spec's method table, following the structure of
`emscripten/ARToolKitNFT_js.cpp`:
- `core(singleThreadPreset(), withFiltering)`;
- `deleteARHandles()` before `core.setup()` and before `core.teardown()`, and
  `createARHandles()` after `setup()` when `core.cameraParamLT()` is not null;
- in `passVideoData`, the same size checks and `ARLOGe` messages as 0.0.14, then
  `core.setVideoFrame()`, without the per-frame `ARLOGi` dumps;
- `setLogLevel` sets both `arLogLevel` and `webarkitLogLevel`, with the same `level >= 0`
  guard;
- the threshold, debug and image-processing methods are moved over unchanged.

The bindings:
- bind `py::init<bool>()` with `py::arg("withFiltering") = false`;
- keep every other `.def` name as it is today, and add the three new ones.

The code comments this task owns, all from the spec's reasons table:
- next to the core's construction, the **AR2 threshold comment**, verbatim from the design
  discussion:
  ```
  // The AR2 tracking settings come from the core's singleThreadPreset(), as in the
  // single-thread JS binding: tracking threshold 5.0, similarity threshold 0.5.
  // Up to 0.0.14 this binding used 2.0 and 0.3. They were set in 34d3bf9 ("trying
  // to debug the issue") while chasing "marker never detected" (#431). The real
  // cause was a controller size that did not match the image (fixed in 4504963),
  // and the thresholds could not have helped: they act on AR2 tracking, which only
  // starts after KPM has found the marker. 5.0 and 0.5 are the values this binding
  // had before that commit.
  ```
- in `getNFTMarkerInfo`: tracking happens once per frame in `detectNFTMarker()`, so this
  only reports, and calling it more than once per frame is harmless;
- on `addNFTMarkers`: ids continue across calls, and a load over `PAGES_MAX` returns an empty
  list instead of the old `exit(-1)`, because a library must not terminate its host;
- next to the core's construction: single-thread preset only, because 0.0.14 has no worker
  thread (D4);
- next to `PYBIND11_MODULE`: no method releases the GIL, because the core is not thread-safe
  and `ARControllerNFT` calls `loadCamera` and `addNFTMarkers` from executor threads.

- [ ] **Step 5: Run the container test**

Expected: everything passes, the 9 old tests and every test in `TestCoreAdapter`.

- [ ] **Step 6: Commit and push**

Commit `feat: port the native Python binding onto ARToolKitNFTCore`. The body lists:
- the behaviour changes and their reasons (the threshold history, ids across calls, no
  `exit(-1)`, `getNFTMarker` only reports, `teardown()` frees the markers, `setup()` rejects
  empty frames, the per-frame logs removed);
- `Refs #693`.

Push, then check that `build-python.yml` is green on all three OS.

---

### Task 3: `ARControllerNFT`, the controller tests, README and `test.py`

**Files:**
- Modify: `python-bindings/src/artoolkitnft/arcontrollerNFT.py`
- Modify: `python-bindings/test_arcontrollerNFT.py` (`TestNFT.test_process_image`, and new
  `TestNFT` tests)
- Modify: `python-bindings/README.md`
- Delete: `python-bindings/test.py`

**Interfaces:**
- Consumes: the native setters from Task 2, and the helpers `frames()`, `PINBALL`, `KUVA` and
  `assert_real_pose`.
- Produces: `ARControllerNFT.setFiltering(enable)`,
  `ARControllerNFT.setContinuousDetection(enabled)` and
  `ARControllerNFT.setDetectionInterval(ms)`. Each returns what the native call returns,
  which is `None`.

- [ ] **Step 1: Write the failing tests** (in `TestNFT`, async like the existing ones)

```python
async def test_process_image(self):        # rewritten: listener first, real asserts
    await self.asyncSetUp()
    await self.nft.loadNFTMarkers([PINBALL])
    events = []
    self.nft.add_event_listener("getNFTMarker", events.append)
    for _ in range(10):
        if events: break
        self.nft.process(MockImage(frames()["pinballOnly"]))
    assert events and events[0]["index"] == 0 and events[0]["marker"]["found"] == 1
    assert_real_pose(events[0]["marker"]["pose"])

async def test_two_loads_then_both_found(self):
    await self.asyncSetUp()
    assert await self.nft.loadNFTMarker(PINBALL) == [0]
    assert await self.nft.loadNFTMarker(KUVA) == [1]
    assert self.nft.nftMarkerCount == 2
    found = set()
    self.nft.add_event_listener("getNFTMarker", lambda ev: found.add(ev["index"]))
    for _ in range(10):
        if found == {0, 1}: break
        self.nft.process(MockImage(frames()["both"]))
    assert found == {0, 1}

async def test_settings_forward_to_native(self):
    await self.asyncSetUp()
    calls = []
    class Recorder:
        def __getattr__(self, name):
            return lambda *a: calls.append((name, a))
    self.nft.artoolkitNFT = Recorder()
    self.nft.setFiltering(True); self.nft.setContinuousDetection(False); self.nft.setDetectionInterval(250)
    assert calls == [("setFiltering", (True,)), ("setContinuousDetection", (False,)), ("setDetectionInterval", (250,))]
```

`MockImage` becomes a module-level class with a single `data` attribute, since the rewritten
test and the new one share it. The rewritten `test_process_image` gets a docstring with the
reason it was rewritten: its listener was registered after `process()`, and its asserts read
`id` and `found` at the top level of an event that carries `index` and `marker`, so it never
asserted anything.

- [ ] **Step 2: Run the container test**

Expected: `test_settings_forward_to_native` fails with `AttributeError`; the other two pass
already, through Task 2.

- [ ] **Step 3: Add the three methods to `ARControllerNFT`**

Place them after `getImageProcMode`. Their docstrings are adapted from the TSDoc of
`setFiltering`, `setContinuousDetection` and `setDetectionInterval` in
`src/ARControllerNFT.ts` (lines 860–920). They state the defaults: filtering off, continuous
detection on, interval 300 ms.

- [ ] **Step 4: Run the container test**

Expected: everything passes.

- [ ] **Step 5: README and `test.py`**

In `README.md`, add a section `## Using the API` before "## Local development", covering:
- loading several markers, in one `loadNFTMarkers` call or in several `loadNFTMarker` calls,
  with ids continuing;
- one `getNFTMarker` event per found marker, with `ev["index"]`;
- the three settings and their defaults.

Run `git rm python-bindings/test.py`.

- [ ] **Step 6: Commit and push**

Commit `feat: add pose filtering and detection settings to the Python controller`. The body
gives:
- the reason the test was rewritten: its listener was registered after `process()`, and it
  read keys the event does not have;
- the reason `test.py` is deleted: it imports `jsartoolkitNFT`, which no longer exists, calls
  an unbound method, and is not run by CI;
- `Refs #693`.

CI must be green on all three OS.

---

### Task 4: The comparison tools

**Files:**
- Create: `tools/compare-builds/node-frames.js`; modify `tools/compare-builds.js` to
  `require` it
- Create: `tools/compare-python/export-node.js`, `play.py`, `compare.py`,
  `test_compare.py`, `run_in_container.py`
- Modify: `.gitignore`

**Interfaces:**
- **`node-frames.js`:**
  - exports `loadNodeFrames(): Promise<{both, pinballOnly, blank}>`, moved unchanged from
    `compare-builds.js`;
  - it takes `WIDTH`, `HEIGHT`, `KUVA_PRINT`, `KUVA_FILL` and `BLANK_GREY` from
    `scenarios.js`.
- **`export-node.js`** is run as `node tools/compare-python/export-node.js <nodeBundle> <outDir>`.
  It writes into `<outDir>`:
  - `both.rgba`, `pinballOnly.rgba` and `blank.rgba`: raw 2000×1500×4 bytes each;
  - `node-records.json`, holding `{bundleSha256, records}`, where `records` is
    `runScenarios(...)`:
    - with the same `cameraUrl`, `markerUrls` and working directory (`examples/node`) as
      `compareNode()` in `compare-builds.js`;
    - the five `RUNS`.
- **`play.py`** is run as
  `python3 -I tools/compare-python/play.py --core-dir DIR --frames DIR --mode single|multi --out FILE [--invert-filtering]`.
  - It imports `artoolkitnft_core` from `--core-dir`, which goes first on `sys.path`.
  - It reads the three `.rgba` files.
  - It resolves the camera and the markers from the repository root, which it finds from the
    script's location: `examples/Data/camera_para.dat` and `examples/DataNFT/{pinball,kuva}`.
    These are byte-identical to the `examples/node/` copies that the Node side uses.
  - The luma is `(3r + 4g + b) >> 3`.
  - Phases: `both` 20, `pinballOnly` 20, `blank` 5, then `bothAgain` 20 on the `both` frame,
    as `PHASES` in `scenarios.js`.
  - Each run uses a fresh `ARToolKitNFT()`: `loadCamera`, `setup(2000, 1500, …)`,
    `setupAR2()`, `addNFTMarkers(markers)`.
  - On each frame: `passVideoData`, `ret = detectNFTMarker()`, then `getNFTMarker(i)` for
    each marker.
  - It writes JSON `{coreSha256, records}`. Each record is
    `{scenario, frame, ret, markers: [{found, error, pose}]}`, the record of `scenarios.js`.
  - **`single` mode:**
    - markers `[pinball]` only;
    - one run, labelled `single`, so a scenario reads `"<phase> [single]"`;
    - no settings calls (0.0.14 has none), except `setFiltering(True)` under
      `--invert-filtering`.
  - **`multi` mode:**
    - markers `[pinball, kuva]`;
    - the five runs, labelled exactly as `runLabel()` in `scenarios.js` (for example
      `"filtering on, continuous off, interval 0"`);
    - `setFiltering`, `setContinuousDetection` and `setDetectionInterval` per run.
- **`compare.py`** is run as `python3 compare.py OLD NEW --mode exact|found [--tolerance T]`.
  - **Exit 0:** prints `identical (<n> records)` for `exact`, or `same found sets (<n> records), max |Δpose| <value>` for `found`. Both also print the number of frames on which OLD found each marker.
  - **Exit 1:** prints the first difference, as `#index scenario frame: field`.
  - **Exit 2:** bad arguments or missing files, or OLD does not exercise tracking. For
    `single`, that means pinball found in `both`, `pinballOnly` and `bothAgain`, and lost in
    `blank`. For `multi`, it applies the rules of `checkExercised` in `scenarios.js`.
  - **`exact`** compares `ret`, `found`, `error` and every pose value with `==`, on floats
    parsed from JSON, which round-trip exactly.
  - **`found`** requires the same found set on every frame, and reports the largest absolute
    pose difference, separately for the translation (indices 3, 7, 11) and the rotation.
    With `--tolerance`, a larger difference exits 1.
- **`run_in_container.py`** runs inside `ubuntu:24.04` with the repository at `/src`. Its
  docstring holds the exact `docker run` line.

- [ ] **Step 1: Write the failing tests** `tools/compare-python/test_compare.py`

They run on synthetic records built by a helper `rec(scenario, frame, ret, markers)`. One
test per rule:
- `test_identical_records_exit_0`;
- `test_pose_bit_difference_exit_1_names_field`, where one pose value differs by one ulp
  through `math.nextafter` and the output contains `markers[0].pose`;
- `test_not_exercised_exit_2`, for single mode, with pinball never lost in `blank`;
- `test_found_mode_tolerates_pose_but_not_found_set`, where a pose diff of 1e-3 passes
  without `--tolerance`, fails with `--tolerance 1e-4`, and a found-flag flip fails.

The tests call `compare.main(argv) -> int` on temporary files.

- [ ] **Step 2: Run them**

Run: `python -m pytest tools/compare-python/test_compare.py -q`.
Expected: they fail, because `compare.py` does not exist yet.

- [ ] **Step 3: Implement `compare.py`, with `main(argv: list[str]) -> int`**

- [ ] **Step 4: Run them**

Run: `python -m pytest tools/compare-python/test_compare.py -q`.
Expected: `4 passed`.

- [ ] **Step 5: Move `loadNodeFrames` out**

Move it into `node-frames.js`, then run
`node tools/compare-builds.js dist/ARToolkitNFT_node.js dist/ARToolkitNFT_node.js`.
Expected: `identical (… records)` with `(byte-identical inputs)`, as before the move.

- [ ] **Step 6: Implement `export-node.js` and `play.py`, and run the export**

Implement both to the interfaces above, then run
`node tools/compare-python/export-node.js dist/ARToolkitNFT_node.js tools/compare-python/frames`.
Expected:
- three files of exactly 12,000,000 bytes;
- `node-records.json` with 5 × 65 = 325 records.

- [ ] **Step 7: Implement `run_in_container.py`**

Its steps, in order:
1. **The reference.** Copy `/src/tools/compare-python/ref/python-bindings`, which the host
   extracts with `git archive python/0.0.14 python-bindings | tar -x -C tools/compare-python/ref`,
   to `/work/ref/python-bindings`.
   - In its `ARToolKitNFT_py.cpp`, replace `ar2SetTrackingThresh(this->ar2Handle, 2.0);`
     with `…5.0);`, and `ar2SetSimThresh(this->ar2Handle, 0.3);` with `…0.50);`.
   - Assert that each replacement happened exactly once.
   - Symlink `/work/ref/emscripten` to `/src/emscripten`.
2. **The candidate.** Copy `/src/python-bindings` to `/work/new/python-bindings`, and
   symlink `/work/new/emscripten` the same way.
3. **Build** both with `/venv/bin/python setup.py build_ext --inplace`.
4. **The PyPI wheel.** Run
   `/venv/bin/pip download artoolkitnft==0.0.14 --no-deps --only-binary :all: -d /work/pypi`,
   and unzip it into `/work/pypi/site`.
5. **Record.** Run `play.py` under
   `FAKETIME="2026-01-01 00:00:00" FAKETIME_DONT_FAKE_MONOTONIC=1 LD_PRELOAD=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1`,
   writing into `/src/tools/compare-python/out/`:
   - `ref-single.json`, `new-single.json` and `pypi-single.json`;
   - `new-single-inverted.json`, with `--invert-filtering`;
   - `new-multi.json`.
6. **Compare.** Run `compare.py` and print each verdict:
   - `ref-single` vs `new-single`, `exact`;
   - `new-single` vs `new-single-inverted`, `exact`. This is the self-test: it must exit 1;
   - `pypi-single` vs `new-single`, `found`. This one is informational;
   - `frames/node-records.json` vs `new-multi`, `found`.
7. **Exit status.** Print the sha256 of the three extension modules. Exit non-zero unless
   step 6's first comparison exits 0 and its self-test exits 1.

Add `tools/compare-python/frames/`, `tools/compare-python/out/` and
`tools/compare-python/ref/` to `.gitignore`.

- [ ] **Step 8: Commit and push**

Commit `test: add tools to compare the Python binding with 0.0.14 and the Node build`. The
body says what each tool proves and why it is one-off (D6), plus `Refs #693`.

---

### Task 5: Run the comparisons and open the PR

**Files:**
- Create (scratchpad, not committed): `pr-693.md`, the PR description.

- [ ] **Step 1: Extract the reference**

```bash
git -c http.sslBackend=schannel fetch origin tag python/0.0.14
mkdir -p tools/compare-python/ref && git archive python/0.0.14 python-bindings | tar -x -C tools/compare-python/ref
```

Expected: `tools/compare-python/ref/python-bindings/ARToolKitNFT_py.cpp` contains
`ar2SetTrackingThresh(this->ar2Handle, 2.0);`.

- [ ] **Step 2: Run the equivalence**

Use the `docker run` line from the docstring of `run_in_container.py`, in a fresh
`ubuntu:24.04` container. The `nft-py` container is not reused, so that the run is
reproducible from the PR.

Expected:
- `ref-single` vs `new-single`: `identical (65 records)`, with pinball found on most frames;
- the self-test reports a difference;
- the Node comparison reports the same found sets.

If the exact comparison fails, stop. Find the first differing record, trace it to the port or
explain it, and do not loosen the check (spec, Risks).

The spec's manual check, a wheel built on Windows that imports and detects pinball, is covered
by the Windows job of `build-python.yml`. That job builds the wheel, installs it, and runs
`example.py` and the tests. Its green run is cited in the PR.

- [ ] **Step 3: Write `pr-693.md`**

It contains:
- a summary;
- the table "change vs 0.0.14 → reason → evidence", built from the spec's "Recording the
  reasons" table, plus the empty-frame `setup()` row;
- the commands of Steps 1–2;
- the sha256 of the three modules;
- each verdict, with the found counts;
- the largest pose differences from the PyPI and Node comparisons;
- the CI status;
- `Closes #693`, and the closing line
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: Ask the user, then open the PR**

Show the user `pr-693.md` and ask for the OK to open the PR. On a yes, run
`gh pr create --base dev --head feat/python-nft-core --title "feat: port the Python binding onto ARToolKitNFTCore" --body-file <scratchpad>/pr-693.md`.
Then bind it with `ccd_pr` and offer Auto-fix.

- [ ] **Step 5: Ask about the follow-ups**

Draft the text of two issues and ask the user whether to open each:
- the pure-Python-layer issue (D9): `lostNFTMarker` (seconds against 200, and `False == 0`),
  and the per-frame `print` in `_copyImageToHeap`;
- the WebARKitLib issue for `(std::numeric_limits<int>::max)()` in
  `ARToolKitNFTCore::setup()`.

Once the WebARKitLib issue exists, add its URL to the `NOMINMAX` comment in `setup.py`, and
commit that with `chore: link the upstream NOMINMAX issue`.
