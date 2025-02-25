import jsartoolkitNFT
import numpy as np
import unittest
import numpy.testing as npt

class TestNFT(unittest.TestCase):
    def setUp(self):
        self.nft = jsartoolkitNFT.ARToolKitNFT()
        self.cameraId = self.nft.loadCamera('../examples/Data/camera_para.dat')
        self.id = self.nft.setup(640, 480, self.cameraId)
        print('id:', self.id)
        self.nearPlane = 0.1
        self.farPlane = 1000

    def test_load_camera(self):
        self.assertEqual(self.cameraId, 2) 
 
    def test_setup(self):
        self.assertEqual(self.id, 5)
    
    def test_setupAR2(self): 
        self.assertEqual(self.nft.setupAR2(), 0)

    def test_get_camera_lens(self):
        expected_lens = np.array([
            1.90724698e+00, 0.00000000e+00, 0.00000000e+00, 0.00000000e+00,
            0.00000000e+00, 2.53244770e+00, 0.00000000e+00, 0.00000000e+00,
            -1.23565148e-02, -7.90590035e-03, -1.00000020e+00, -1.00000000e+00,
            0.00000000e+00, 0.00000000e+00, -2.00000020e-04, 0.00000000e+00
        ])
        npt.assert_allclose(self.nft.getCameraLens(), expected_lens, rtol=1e-5, atol=1e-8)

    def test_set_projection_near_plane(self):
        self.nft.setProjectionNearPlane(self.nearPlane)
        self.assertEqual(self.nft.getProjectionNearPlane(), self.nearPlane)

    def test_set_projection_far_plane(self):
        self.nft.setProjectionFarPlane(self.farPlane)
        self.assertEqual(self.nft.getProjectionFarPlane(), self.farPlane)

    def test_add_nft_markers(self):
        self.assertEqual(self.nft.addNFTMarkers(['../examples/DataNFT/pinball']), [0])

    def test_get_nft_data(self):
        nftData = self.nft.getNFTData(self.id)
        self.assertEqual(nftData.width_NFT, 80)
        self.assertEqual(nftData.height_NFT, 60)
        self.assertEqual(nftData.dpi_NFT, 96) 

if __name__ == '__main__':
    unittest.main()