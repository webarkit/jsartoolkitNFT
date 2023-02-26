#include "ARToolKitNFT_js.h"

KpmHandle * ARToolKitNFT::createKpmHandle(ARParamLT *cparamLT)
{
    KpmHandle *kpmHandle;
    kpmHandle = kpmCreateHandle(cparamLT);
    return kpmHandle;
}

int ARToolKitNFT::setup(int width, int height, int cameraID)
{
    int id = gARControllerID++;
    this->id = id;

    this->width = width;
    this->height = height;

    this->videoFrameSize = width * height * 4 * sizeof(ARUint8);
    this->videoFrame = (ARUint8 *)malloc(this->videoFrameSize);
    this->videoLuma = (ARUint8 *)malloc(this->videoFrameSize / 4);

    setCamera(id, cameraID);

    webarkitLOGi("Allocated videoFrameSize %d", this->videoFrameSize);

    return this->id;
}

void ARToolKitNFT::deleteHandle()
{
    if (this->arhandle != NULL)
    {
        arPattDetach(this->arhandle);
        arDeleteHandle(this->arhandle);
        this->arhandle = NULL;
    }
    if (this->ar3DHandle != NULL)
    {
        ar3DDeleteHandle(&(this->ar3DHandle));
        this->ar3DHandle = NULL;
    }
    if (this->paramLT != NULL)
    {
        arParamLTFree(&(this->paramLT));
        this->paramLT = NULL;
    }
}

int ARToolKitNFT::setCamera(int id, int cameraID)
{

    if (cameraParams.find(cameraID) == cameraParams.end())
    {
        return -1;
    }

    this->param = cameraParams[cameraID];

    if (this->param.xsize != this->width || this->param.ysize != this->height)
    {
        ARLOGw("*** Camera Parameter resized from %d, %d. ***\n", this->param.xsize, this->param.ysize);
        arParamChangeSize(&(this->param), this->width, this->height, &(this->param));
    }

    // ARLOGi("*** Camera Parameter ***\n");
    // arParamDisp(&(this->param));

    deleteHandle();

    if ((this->paramLT = arParamLTCreate(&(this->param), AR_PARAM_LT_DEFAULT_OFFSET)) == NULL)
    {
        webarkitLOGe("setCamera(): Error: arParamLTCreate.");
        return -1;
    }

    // ARLOGi("setCamera(): arParamLTCreated\n..%d, %d\n", (this->paramLT->param).xsize, (this->paramLT->param).ysize);

    // setup camera
    if ((this->arhandle = arCreateHandle(this->paramLT)) == NULL)
    {
        webarkitLOGe("setCamera(): Error: arCreateHandle.");
        return -1;
    }
    // AR_DEFAULT_PIXEL_FORMAT
    int set = arSetPixelFormat(this->arhandle, this->pixFormat);

    this->ar3DHandle = ar3DCreateHandle(&(this->param));
    if (this->ar3DHandle == NULL)
    {
        webarkitLOGe("setCamera(): Error creating 3D handle");
        return -1;
    }

    arglCameraFrustumRH(&((this->paramLT)->param), this->nearPlane, this->farPlane, this->cameraLens);

    this->kpmHandle = createKpmHandle(this->paramLT);

    return 0;
}

int ARToolKitNFT::loadCamera(std::string cparam_name)
{
    ARParam param;
    if (arParamLoad(cparam_name.c_str(), 1, &param) < 0)
    {
        webarkitLOGe("loadCamera(): Error loading parameter file %s for camera.", cparam_name.c_str());
        return -1;
    }
    int cameraID = gCameraID++;
    cameraParams[cameraID] = param;

    return cameraID;
}



#include "ARToolkitNFT_js_bindings.cpp"