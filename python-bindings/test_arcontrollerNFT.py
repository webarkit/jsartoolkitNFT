import functools
import math
import os
import artoolkitnft_core
from artoolkitnft import arcontrollerNFT
import numpy as np
import pytest
import numpy.testing as npt
from PIL import Image, ImageDraw

# Test image used by test_process_image. The controller is configured to
# the same dimensions so that the size validation in _copyImageToHeap and
# passVideoData passes. Reading the dimensions here (rather than
# hardcoding them) keeps the tests resilient if the image is ever swapped.
TEST_IMAGE_PATH = os.path.join(os.path.dirname(__file__), 'pinball-demo.jpg')
with Image.open(TEST_IMAGE_PATH) as _img:
    TEST_IMAGE_WIDTH, TEST_IMAGE_HEIGHT = _img.size

# Paths relative to python-bindings/, where the tests run.
CAMERA = '../examples/Data/camera_para.dat'
PINBALL = '../examples/DataNFT/pinball'
KUVA = '../examples/DataNFT/kuva'

# pinball-demo.jpg is a photo of a printed sheet with both targets: pinball on the
# left, kuva on the right, rotated. Painting the kuva print over with a flat fill
# gives a frame where only pinball can be found (as tests/vitest/frames.ts does).
KUVA_PRINT = [(1128, 380), (1705, 452), (1705, 1165), (1096, 1100)]
KUVA_FILL = (0xd9, 0xd4, 0xca, 255)


@functools.lru_cache(maxsize=None)
def frames():
    """The test frames, each a (1500, 2000, 4) uint8 RGBA array.

    "both" is the photo, "pinballOnly" the photo with the kuva print painted over,
    "blank" flat grey 128 with alpha 255.
    """
    with Image.open(TEST_IMAGE_PATH) as img:
        both = img.convert('RGBA')
    pinball_only = both.copy()
    ImageDraw.Draw(pinball_only).polygon(KUVA_PRINT, fill=KUVA_FILL)
    blank = np.full((TEST_IMAGE_HEIGHT, TEST_IMAGE_WIDTH, 4), 128, dtype=np.uint8)
    blank[:, :, 3] = 255
    return {
        "both": np.ascontiguousarray(np.array(both), np.uint8),
        "pinballOnly": np.ascontiguousarray(np.array(pinball_only), np.uint8),
        "blank": blank,
    }


def luma(rgba):
    """The luma of an RGBA frame, as the Node controller computes it: (3r + 4g + b) >> 3."""
    r, g, b = (rgba[:, :, i].astype(np.uint16) for i in range(3))
    return ((3 * r + 4 * g + b) >> 3).astype(np.uint8)


def new_core(*batches, withFiltering=False):
    """A native ARToolKitNFT set up for the test photo, with one addNFTMarkers() call per batch.

    Returns (core, ids_per_batch).
    """
    core = artoolkitnft_core.ARToolKitNFT(withFiltering=withFiltering)
    camera = core.loadCamera(CAMERA)
    core.setup(TEST_IMAGE_WIDTH, TEST_IMAGE_HEIGHT, camera)
    core.setupAR2()
    return core, [core.addNFTMarkers(list(batch)) for batch in batches]


def play(core, rgba, n):
    """Feed one frame n times; return, per frame, getNFTMarker(i) of every loaded marker."""
    frame, frame_luma = rgba.ravel(), luma(rgba).ravel()
    count = 0
    while core.getNFTMarker(count) != {"error": -3}:
        count += 1
    results = []
    for _ in range(n):
        core.passVideoData(frame, frame_luma)
        core.detectNFTMarker()
        results.append([core.getNFTMarker(i) for i in range(count)])
    return results


class MockImage:
    """What ARControllerNFT.process() takes: an object with an RGBA ndarray as `data`."""

    def __init__(self, data):
        self.data = data


def assert_real_pose(pose):
    """A pose from a real detection: 12 finite values, not all zero, a non-zero translation."""
    assert len(pose) == 12
    assert all(math.isfinite(v) for v in pose)
    assert any(v != 0 for v in pose)
    assert any(pose[i] != 0 for i in (3, 7, 11))

@pytest.mark.asyncio
class TestNFT:
    async def asyncSetUp(self):
        self.nft = arcontrollerNFT.ARControllerNFT(
            TEST_IMAGE_WIDTH, TEST_IMAGE_HEIGHT,
            '../examples/Data/camera_para.dat',
        )
        await self.nft._initialize()
        self.nearPlane = 0.1
        self.farPlane = 1000

    @pytest.mark.asyncio
    async def test_load_camera(self):
        await self.asyncSetUp()
        assert self.nft.cameraId == 0

    @pytest.mark.asyncio
    async def test_setup(self):
        await self.asyncSetUp()
        assert self.nft.id == 1

    @pytest.mark.asyncio
    async def test_setupAR2(self):
        await self.asyncSetUp()
        assert self.nft._initNFT() == None

    # @pytest.mark.asyncio
    # async def test_get_camera_lens(self):
    #     await self.asyncSetUp()
    #     expected_lens = np.array([
    #         1.90724698e+00, 0.00000000e+00, 0.00000000e+00, 0.00000000e+00,
    #         0.00000000e+00, 2.53244770e+00, 0.00000000e+00, 0.00000000e+00,
    #         -1.23565148e-02, -7.90590035e-03, -1.00000020e+00, -1.00000000e+00,
    #         0.00000000e+00, 0.00000000e+00, -2.00000020e-04, 0.00000000e+00
    #     ])
    #     npt.assert_allclose(self.nft.artoolkitNFT.getCameraLens(), expected_lens, rtol=1e-5, atol=1e-8)

    @pytest.mark.asyncio
    async def test_set_projection_near_plane(self):
        await self.asyncSetUp()
        self.nft.setProjectionNearPlane(self.nearPlane)
        assert self.nft.getProjectionNearPlane() == self.nearPlane

    @pytest.mark.asyncio
    async def test_set_projection_far_plane(self):
        await self.asyncSetUp()
        self.nft.setProjectionFarPlane(self.farPlane)
        assert self.nft.getProjectionFarPlane() == self.farPlane

    @pytest.mark.asyncio
    async def test_add_nft_markers(self):
        await self.asyncSetUp()
        marker_ids = await self.nft.loadNFTMarker('../examples/DataNFT/pinball')
        print('marker_ids:', marker_ids)
        assert marker_ids == [0]

    @pytest.mark.asyncio
    async def test_get_nft_data(self):
        await self.asyncSetUp()
        marker_ids = await self.nft.loadNFTMarker('../examples/DataNFT/pinball')
        print('marker_ids:', marker_ids)
        if marker_ids:
            nftData = self.nft.getNFTData(marker_ids[0])
            print('nftData:', nftData)
            assert nftData.width_NFT == 893
            assert nftData.height_NFT == 1117
            assert nftData.dpi_NFT == 120
        else:
            pytest.fail("No NFT markers were added.")

    @pytest.mark.asyncio
    async def test_detect_nft_marker(self):
        await self.asyncSetUp()
        await self.nft.loadNFTMarkers(['../examples/DataNFT/pinball'])
        self.nft.detectNFTMarker()
        info = self.nft.getNFTMarker(0)
        print('info:', info)
        assert "id" in info
        assert info["id"] == 0
        assert info["error"] == -1
        assert info["found"] == 0
        assert info["pose"] == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    @pytest.mark.asyncio
    async def test_process_image(self):
        """process() reports pinball through a getNFTMarker event with a real pose.

        Rewritten: the old version registered its listener after process(), and its
        asserts read "id" and "found" at the top level of an event that carries
        "index" and "marker", so it never asserted anything.
        """
        await self.asyncSetUp()
        await self.nft.loadNFTMarkers([PINBALL])
        events = []
        self.nft.add_event_listener("getNFTMarker", events.append)
        for _ in range(10):
            if events:
                break
            self.nft.process(MockImage(frames()["pinballOnly"]))
        assert events and events[0]["index"] == 0 and events[0]["marker"]["found"] == 1
        assert_real_pose(events[0]["marker"]["pose"])

    @pytest.mark.asyncio
    async def test_two_loads_then_both_found(self):
        await self.asyncSetUp()
        assert await self.nft.loadNFTMarker(PINBALL) == [0]
        assert await self.nft.loadNFTMarker(KUVA) == [1]
        assert self.nft.nftMarkerCount == 2
        found = set()
        self.nft.add_event_listener("getNFTMarker", lambda ev: found.add(ev["index"]))
        for _ in range(10):
            if found == {0, 1}:
                break
            self.nft.process(MockImage(frames()["both"]))
        assert found == {0, 1}

    @pytest.mark.asyncio
    async def test_settings_forward_to_native(self):
        await self.asyncSetUp()
        calls = []

        class Recorder:
            def __getattr__(self, name):
                return lambda *a: calls.append((name, a))

        self.nft.artoolkitNFT = Recorder()
        self.nft.setFiltering(True)
        self.nft.setContinuousDetection(False)
        self.nft.setDetectionInterval(250)
        assert calls == [
            ("setFiltering", (True,)),
            ("setContinuousDetection", (False,)),
            ("setDetectionInterval", (250,)),
        ]


class TestCoreAdapter:
    """The native class on ARToolKitNFTCore, driven directly (no ARControllerNFT).

    Kept after TestNFT: its first tests expect the process-wide camera and controller
    ids to start at 0.
    """

    def test_two_loads_get_distinct_ids(self):
        core, ids = new_core([PINBALL], [KUVA])
        assert ids == [[0], [1]]
        p, k = core.getNFTData(0), core.getNFTData(1)
        assert (p.id_NFT, p.width_NFT, p.height_NFT, p.dpi_NFT) == (0, 893, 1117, 120)
        # kuva.iset's first image: 640 x 480 at 72 dpi (its JPEG header).
        assert (k.id_NFT, k.width_NFT, k.height_NFT, k.dpi_NFT) == (1, 640, 480, 72)

    def test_over_limit_load_returns_empty_and_keeps_markers(self):
        core, _ = new_core([PINBALL])
        # 1 + 20 markers would pass PAGES_MAX (20); 0.0.14 called exit(-1) here.
        assert core.addNFTMarkers([PINBALL] * 20) == []
        assert any(f[0]["found"] == 1 for f in play(core, frames()["pinballOnly"], 10))

    def test_failed_load_keeps_ids(self):
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
        # 0.0.14 tracked again on every call, so two calls in one frame could differ.
        assert core.getNFTMarker(0) == core.getNFTMarker(0)

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
        core.setContinuousDetection(True)
        core.setDetectionInterval(0)
        assert any(f[1]["found"] for f in play(core, frames()["both"], 10))

    def test_detection_interval_blocks_new_marker(self):
        core, _ = new_core([PINBALL], [KUVA])
        core.setDetectionInterval(60000)
        assert play(core, frames()["pinballOnly"], 10)[-1][0]["found"] == 1
        assert all(f[1]["found"] == 0 for f in play(core, frames()["both"], 5))

    def test_filtering_keeps_tracking(self):
        """Filtering is wired and tracking still works with it on.

        This does not check that filtering changes the poses: two runs in one process
        cannot show it. ar2SelectTemplate reseeds the global rand() with time(NULL)
        every 128 calls, so the unfiltered poses of two runs already differ. The proof
        is the self-test of tools/compare-python (separate processes, frozen clock).
        """
        for core in (new_core([PINBALL], withFiltering=True)[0], new_core([PINBALL])[0]):
            core.setFiltering(True)
            seen = [f[0] for f in play(core, frames()["pinballOnly"], 10) if f[0]["found"]]
            assert seen
            assert_real_pose(seen[-1]["pose"])

    def test_bad_frame_size_is_rejected(self):
        core, _ = new_core([PINBALL])
        rgba = frames()["pinballOnly"]
        assert core.passVideoData(rgba.ravel()[:-4], luma(rgba).ravel()) == -1
        assert core.passVideoData(rgba.ravel(), luma(rgba).ravel()[:-1]) == -1

    def test_detect_before_markers_and_frames(self):
        core = artoolkitnft_core.ARToolKitNFT()
        core.setup(TEST_IMAGE_WIDTH, TEST_IMAGE_HEIGHT, core.loadCamera(CAMERA))
        core.setupAR2()
        assert core.detectNFTMarker() == -1
        assert core.getNFTMarker(0) == {"error": -3}

    def test_after_teardown(self):
        core, _ = new_core([PINBALL])
        core.teardown()
        assert core.getNFTMarker(0) == {"error": -3}
        assert core.detectNFTMarker() == -1
        assert core.getNFTData(0).width_NFT == 893

    def test_teardown_logs_no_error(self, capfd):
        # NFT never attaches a pattern to the ARHandle, so a failed arPattDetach() is
        # not an error; 0.0.14 did not report it either.
        core, _ = new_core([PINBALL])
        capfd.readouterr()
        core.teardown()
        out, err = capfd.readouterr()
        assert "Error detaching pattern" not in out + err

    def test_setup_rejects_empty_frame(self):
        core = artoolkitnft_core.ARToolKitNFT()
        assert core.setup(0, TEST_IMAGE_HEIGHT, core.loadCamera(CAMERA)) == -1

    def test_get_nft_data_out_of_range_raises(self):
        core, _ = new_core([PINBALL])
        with pytest.raises(IndexError):
            core.getNFTData(5)


if __name__ == '__main__':
    pytest.main()