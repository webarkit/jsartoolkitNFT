from artoolkitnft import arcontrollerNFT
import asyncio
import numpy as np
from PIL import Image

async def main():
    # Load the test image
    image_path = './pinball-demo.jpg'
    img = Image.open(image_path).convert('RGBA')
    print(f'Original image shape: {img.size}, mode: {img.mode}')
    w, h = img.size

    arnft = arcontrollerNFT.ARControllerNFT(w, h, '../examples/Data/camera_para.dat')
    nft = await arnft._initialize()
    await nft.loadNFTMarkers(['../examples/DataNFT/pinball'])
    print('nft object is: ', nft)
    
    obj = nft.trackNFTMarkerId(nft.id)
    print('obj is: ', obj)


    image_gray = img.convert('L')
    gray_data = np.array(image_gray)
    nft.setGrayData(gray_data)
    
    print(f'Input image shape: {img.size}, mode: {img.mode}')
    print(f"First pixel values: {img.getpixel((0, 0))}")
    rgba = np.ascontiguousarray(np.array(img), np.uint8)

    # Create a mock image object with the data attribute
    class MockImage:
       def __init__(self, array):
            self.data = array
            self.width = array.shape[1]  # Width of the image
            self.height = array.shape[0]  # Height of the image
            self.format = 'RGBA'  # Or the format expected by the binding (e.g., 'BGRA')

    mock_image = MockImage(rgba)

    print('mock_image type: ', type(mock_image.data))
    print('mock_image width:', mock_image.data.shape)
    
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
    for i in range(1):
        nft.process(mock_image)
    await asyncio.sleep(0)  # let event loop dispatch
    print("Image processed.")

asyncio.run(main())