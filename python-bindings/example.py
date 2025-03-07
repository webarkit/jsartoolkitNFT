from artoolkitnft import arcontrollerNFT
import asyncio
import numpy as np
from PIL import Image

async def main():
    arnft = arcontrollerNFT.ARControllerNFT(1920, 1021, '../examples/Data/camera_para.dat')
    nft = await arnft._initialize()
    await nft.loadNFTMarkers(['../examples/DataNFT/pinball'])
    print(nft)
    
    nft.trackNFTMarkerId(nft.id)

    # Load the test image
    image_path = './pinball-test.png'
    image = Image.open(image_path)
    image = image.convert('RGBA')
    
    # Flip the image vertically
    #image = image.transpose(Image.FLIP_TOP_BOTTOM)
    
    image_data = np.array(image)
    print('image_data:', image_data)

    # Create a mock image object with the data attribute
    class MockImage:
        def __init__(self, data):
            self.data = data

    mock_image = MockImage(image_data)
    
    # Add event listener for detecting NFT marker
    def on_get_nft_marker(ev):
        print("getNFTMarker", ev)
        info = ev
        print('info:', info)
        #assert "id" in info
        #assert info["id"] == 0
        #assert info["found"] == 1

    arnft.add_event_listener("getNFTMarker", on_get_nft_marker)

    # Process the image
    print("Processing image...")
    nft.process(mock_image)
    print("Image processed.")

asyncio.run(main())