import jsartoolkitNFT
import numpy as np

nft = jsartoolkitNFT.ARToolKitNFT()
cameraId = nft.loadCamera('../examples/Data/camera_para.dat')
width = 640
height = 480
id = nft.setup(width, height, cameraId)
nft.setupAR2()
camera_mat = nft.getCameraLens()
print(camera_mat)
framesize = width * height
videoLuma = np.zeros((height, width, 1), dtype=np.uint8)

nft.setProjectionNearPlane(0.1)
nft.setProjectionFarPlane(1000)

marker = nft.addNFTMarkers(['../examples/DataNFT/pinball'])

nftData = nft.getNFTData(id)
print(nftData)
print(f"Width: {nftData.width_NFT}")
print(f"Height: {nftData.height_NFT}")
print(f"DPI: {nftData.dpi_NFT}")

nft.detectNFTMarker()

info = nft.getNFTMarkerInfo(id)
print(info)
print(info["id"])