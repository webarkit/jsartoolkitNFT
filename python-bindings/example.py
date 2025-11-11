from artoolkitnft import arcontrollerNFT
import asyncio
import numpy as np
from PIL import Image

async def main():
    arnft = arcontrollerNFT.ARControllerNFT(1637, 2048, '../examples/Data/camera_para.dat')
    nft = await arnft._initialize()
    await nft.loadNFTMarkers(['../examples/DataNFT/pinball'])
    print(nft)
    
    obj = nft.trackNFTMarkerId(nft.id)
    print('obj is: ', obj)

    # Load the test image
    image_path = './pinball-test.png'

    image = Image.open(image_path)
    print(f'Original image shape: {image.size}, mode: {image.mode}')
    image = image.convert('RGBA')
    image_gray = image.convert('L')
    gray_data = np.array(image_gray)
    nft.setGrayData(gray_data)
    # image = image.transpose(Image.Transpose.ROTATE_90)
    # image = image.transpose(Image.Transpose.ROTATE_270)
    # image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    # image = image.transpose(Image.Transpose.ROTATE_90)
    # image = image.resize((640, 480), Image.Resampling.LANCZOS)
    # image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # image.show()
    print(f'Input image shape: {image.size}, mode: {image.mode}')
    print(f"First pixel values: {image.getpixel((0, 0))}")
    rgba = np.ascontiguousarray(np.array(image), np.uint8)
    # rgba = np.transpose(rgba, (1, 0, 2))  # Swap height and width dimensions
    # rgba = np.transpose(rgba)
    # Flip the image vertically
    # image = image.transpose(Image.FLIP_TOP_BOTTOM)

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