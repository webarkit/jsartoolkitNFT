from artoolkitnft import arcontrollerNFT
import numpy as np
import pytest
import numpy.testing as npt

@pytest.mark.asyncio
class TestNFT:
    async def asyncSetUp(self):
        self.nft = arcontrollerNFT.ARControllerNFT(640, 480, '../examples/Data/camera_para.dat')
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

    @pytest.mark.asyncio
    async def test_get_camera_lens(self):
        await self.asyncSetUp()
        expected_lens = np.array([
            1.90724698e+00, 0.00000000e+00, 0.00000000e+00, 0.00000000e+00,
            0.00000000e+00, 2.53244770e+00, 0.00000000e+00, 0.00000000e+00,
            -1.23565148e-02, -7.90590035e-03, -1.00000020e+00, -1.00000000e+00,
            0.00000000e+00, 0.00000000e+00, -2.00000020e-04, 0.00000000e+00
        ])
        npt.assert_allclose(self.nft.artoolkitNFT.getCameraLens(), expected_lens, rtol=1e-5, atol=1e-8)

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

if __name__ == '__main__':
    pytest.main()