from ARToolKitNFT import arcontrollerNFT
import asyncio

#arnft = arcontrollerNFT.ARControllerNFT()
#artoolkitNFT.setup()
#print(arnft)

async def main():
    arnft = arcontrollerNFT.ARControllerNFT(640, 480, '../examples/Data/camera_para.dat')
    nft = await arnft._initialize()
    print(nft)

asyncio.run(main())

#rnft = arcontrollerNFT.ARControllerNFT(640, 480, '../examples/Data/camera_para.dat')
#nft = arnft._initialize()
#print(nft)