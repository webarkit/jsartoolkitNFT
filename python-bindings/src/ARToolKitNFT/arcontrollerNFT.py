import ARToolKitNFT_core
import time
import asyncio

class EventDispatcher:
    def __init__(self):
        self.listeners = {}

    def add_event_listener(self, event_name, callback):
        if event_name not in self.listeners:
            self.listeners[event_name] = []
        self.listeners[event_name].append(callback)

    def remove_event_listener(self, event_name, callback):
        if event_name in self.listeners:
            self.listeners[event_name].remove(callback)

    def dispatch_event(self, event_name, event_data=None):
        if event_name in self.listeners:
            for callback in self.listeners[event_name]:
                callback(event_data)

class ARControllerNFT(EventDispatcher):
    NFT_MARKER = ARToolKitNFT_core.NFT_MARKER

    def __init__(self, width=None, height=None, cameraParam=None):
        super().__init__()
        self.id = -1
        self._width = width
        self._height = height
        self._cameraParam = cameraParam
        self.cameraId = -1

        self.artoolkitNFT = None

        self.nftMarkers = []

        self.transform_mat = [0.0] * 16
        self.transformGL_RH = [0.0] * 16
        self.camera_mat = [0.0] * 16

        self.videoWidth = width
        self.videoHeight = height
        self.videoSize = self.videoWidth * self.videoHeight if width and height else 0

        self.framesize = None
        self.videoLuma = None
        self.grayscaleEnabled = False
        self.grayscaleSource = None

        self.nftMarkerFound = False
        self.nftMarkerFoundTime = 0
        self.nftMarkerCount = 0
        self.defaultMarkerWidth = 1

        self._bwpointer = None

    def process(self, image):
        self._copyImageToHeap(image)

        for k in self.nftMarkers:
            o = self.nftMarkers[k]
            o['inPrevious'] = o['inCurrent']
            o['inCurrent'] = False

        nftMarkerCount = self.nftMarkerCount
        self.detectNFTMarker()

        MARKER_LOST_TIME = 200

        for i in range(nftMarkerCount):
            nftMarkerInfo = self.getNFTMarker(i)
            markerType = ARToolKitNFT_core.NFT_MARKER

            if nftMarkerInfo['found']:
                self.nftMarkerFound = i
                self.nftMarkerFoundTime = time.time()

                visible = self.trackNFTMarkerId(i)
                visible['matrix'] = nftMarkerInfo['pose']
                visible['inCurrent'] = True
                self.transMatToGLMat(visible['matrix'], self.transform_mat)
                self.transformGL_RH = self.arglCameraViewRHf(self.transform_mat)
                self.dispatch_event('getNFTMarker', {
                    'index': i,
                    'type': markerType,
                    'marker': nftMarkerInfo,
                    'matrix': self.transform_mat,
                    'matrixGL_RH': self.transformGL_RH,
                })
            elif self.nftMarkerFound == i:
                if time.time() - self.nftMarkerFoundTime > MARKER_LOST_TIME:
                    self.nftMarkerFound = False
                    self.dispatch_event('lostNFTMarker', {
                        'index': i,
                        'type': markerType,
                        'marker': nftMarkerInfo,
                        'matrix': self.transform_mat,
                        'matrixGL_RH': self.transformGL_RH,
                    })

    def detectNFTMarker(self):
        return self.artoolkitNFT.detectNFTMarker()

    def trackNFTMarkerId(self, id, markerWidth=None):
        obj = self.nftMarkers.get(id)
        if not obj:
            self.nftMarkers[id] = obj = {
                'inPrevious': False,
                'inCurrent': False,
                'matrix': [0.0] * 12,
                'matrixGL_RH': [0.0] * 12,
                'markerWidth': markerWidth or self.defaultMarkerWidth,
            }
        if markerWidth:
            obj['markerWidth'] = markerWidth
        return obj

    def getNFTMarker(self, markerIndex):
        return self.artoolkitNFT.getNFTMarker(markerIndex)

    def getNFTData(self, index):
        return self.artoolkitNFT.getNFTData(index)

    def debugSetup(self):
        self.setDebugMode(True)
        self._bwpointer = self.getProcessingImage()

    def transMatToGLMat(self, transMat, glMat=None, scale=None):
        if glMat is None:
            glMat = [0.0] * 16

        glMat[0] = transMat[0]
        glMat[1] = transMat[1]
        glMat[2] = transMat[2]
        glMat[3] = transMat[3]
        glMat[4] = transMat[4]
        glMat[5] = transMat[5]
        glMat[6] = transMat[6]
        glMat[7] = transMat[7]
        glMat[8] = transMat[8]
        glMat[9] = transMat[9]
        glMat[10] = transMat[10]
        glMat[11] = transMat[11]
        glMat[12] = 0.0
        glMat[13] = 0.0
        glMat[14] = 0.0
        glMat[15] = 1.0

        if scale is not None and scale != 0.0:
            glMat[12] *= scale
            glMat[13] *= scale
            glMat[14] *= scale

        return glMat

    def arglCameraViewRHf(self, glMatrix, glRhMatrix=None, scale=None):
        if glRhMatrix is None:
            glRhMatrix = [0.0] * 16

        glRhMatrix[0] = glMatrix[0]
        glRhMatrix[4] = glMatrix[4]
        glRhMatrix[8] = glMatrix[8]
        glRhMatrix[12] = glMatrix[12]
        glRhMatrix[1] = -glMatrix[1]
        glRhMatrix[5] = -glMatrix[5]
        glRhMatrix[9] = -glMatrix[9]
        glRhMatrix[13] = -glMatrix[13]
        glRhMatrix[2] = -glMatrix[2]
        glRhMatrix[6] = -glMatrix[6]
        glRhMatrix[10] = -glMatrix[10]
        glRhMatrix[14] = -glMatrix[14]
        glRhMatrix[3] = 0
        glRhMatrix[7] = 0
        glRhMatrix[11] = 0
        glRhMatrix[15] = 1

        if scale is not None and scale != 0.0:
            glRhMatrix[12] *= scale
            glRhMatrix[13] *= scale
            glRhMatrix[14] *= scale

        return glRhMatrix

    def getTransformationMatrix(self):
        return self.transform_mat

    def getCameraMatrix(self):
        return self.camera_mat

    def setDebugMode(self, mode):
        return self.artoolkitNFT.setDebugMode(mode)

    def getDebugMode(self):
        return self.artoolkitNFT.getDebugMode()

    def getProcessingImage(self):
        return self.artoolkitNFT.getProcessingImage()

    def setLogLevel(self, mode):
        return self.artoolkitNFT.setLogLevel(mode)

    def getLogLevel(self):
        return self.artoolkitNFT.getLogLevel()

    def setProjectionNearPlane(self, value):
        return self.artoolkitNFT.setProjectionNearPlane(value)

    def getProjectionNearPlane(self):
        return self.artoolkitNFT.getProjectionNearPlane()

    def setProjectionFarPlane(self, value):
        return self.artoolkitNFT.setProjectionFarPlane(value)

    def getProjectionFarPlane(self):
        return self.artoolkitNFT.getProjectionFarPlane()

    def setThresholdMode(self, mode):
        return self.artoolkitNFT.setThresholdMode(mode)

    def getThresholdMode(self):
        return self.artoolkitNFT.getThresholdMode()

    def setThreshold(self, threshold):
        return self.artoolkitNFT.setThreshold(threshold)

    def getThreshold(self):
        return self.artoolkitNFT.getThreshold()

    def setImageProcMode(self, mode):
        return self.artoolkitNFT.setImageProcMode(mode)

    def getImageProcMode(self):
        return self.artoolkitNFT.getImageProcMode()

    def setGrayData(self, data):
        self.grayscaleEnabled = True
        self.grayscaleSource = data

    def _copyImageToHeap(self, sourceImage):
        if not sourceImage:
            print("Error: no provided imageData to ARControllerNFT")
            return

        data = sourceImage.data if sourceImage.data else None

        if self.videoLuma:
            if not self.grayscaleEnabled:
                q = 0
                for p in range(self.videoSize):
                    r = data[q + 0]
                    g = data[q + 1]
                    b = data[q + 2]
                    self.videoLuma[p] = (r + r + r + b + g + g + g + g) >> 3
                    q += 4
            else:
                self.videoLuma = self.grayscaleSource

        if self.videoLuma:
            self.artoolkitNFT.passVideoData(data, self.videoLuma)
            return True

        return False

    async def _initialize(self):
        self.artoolkitNFT = ARToolKitNFT_core.ARToolKitNFT()

        print("[ARControllerNFT]", "ARToolkitNFT initialized")

        self.cameraId = await self.async_load_camera(self._cameraParam)
        print("[ARControllerNFT]", "Camera params loaded with ID", self.cameraId)

        self.id = self.artoolkitNFT.setup(self._width, self._height, self.cameraId)
        print("[ARControllerNFT]", "Got ID from setup", self.id)

        self._initNFT()

        self.framesize = self._width * self._height
        self.videoLuma = [0] * self.framesize
        self.camera_mat = self.artoolkitNFT.getCameraLens()

        self.setProjectionNearPlane(0.1)
        self.setProjectionFarPlane(1000)

        return self

    def _initNFT(self):
        self.artoolkitNFT.setupAR2()

    async def async_load_camera(self, cparam_name):
        loop = asyncio.get_event_loop()
        camera_id = await loop.run_in_executor(None, self.artoolkitNFT.loadCamera, cparam_name)
        return camera_id

    @staticmethod
    def some_static_method(arg1, arg2):
        return arg1 + arg2