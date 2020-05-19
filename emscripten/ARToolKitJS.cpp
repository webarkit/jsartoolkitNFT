/*
    ** From: ar.h L:94 **
    #ifdef ARDOUBLE_IS_FLOAT
    typedef float             ARdouble;
    #else
    typedef double            ARdouble;
    #endif

    ** According to config.h ARDOUBLE_IS_FLOAT is false when compiling with emscripten. This means we are dealing with 64bit float
*/

#include <stdio.h>
#include <AR/ar.h>
#include <emscripten.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <AR/config.h>
#include <AR2/tracking.h>
#include <AR/arFilterTransMat.h>
#include <AR/paramGL.h>
#include <KPM/kpm.h>
#include "trackingMod.h"

#define PAGES_MAX               10          // Maximum number of pages expected. You can change this down (to save memory) or up (to accomodate more pages.)

struct nftMarker {
	int id_NFT;
	int width_NFT;
	int height_NFT;
	int dpi_NFT;
};

struct arController {
	int id;

	ARParam param;
	ARParamLT *paramLT = NULL;

	ARUint8 *videoFrame = NULL;
	int videoFrameSize;
	ARUint8 *videoLuma = NULL;

	int width = 0;
	int height = 0;

	ARHandle *arhandle = NULL;
	AR3DHandle* ar3DHandle;

	KpmHandle* kpmHandle;
	AR2HandleT* ar2Handle;

	#if WITH_FILTERING
	ARFilterTransMatInfo *ftmi;
	ARdouble   filterCutoffFrequency = 60.0;
	ARdouble   filterSampleRate = 120.0;
	#endif

	int detectedPage = -2;  // -2 Tracking not inited, -1 tracking inited OK, >= 0 tracking online on page.

	int surfaceSetCount = 0; // Running NFT marker id
	AR2SurfaceSetT      *surfaceSet[PAGES_MAX];
	std::unordered_map<int, AR2SurfaceSetT*> surfaceSets;
	// nftMarker struct inside arController
	nftMarker nft;

	ARdouble nearPlane = 0.0001;
	ARdouble farPlane = 1000.0;

	int patt_id = 0; // Running pattern marker id

	ARdouble cameraLens[16];
	AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA;
};

std::unordered_map<int, arController> arControllers;
std::unordered_map<int, ARParam> cameraParams;


// ============================================================================
//	Global variables
// ============================================================================

static ARdouble	gTransform[3][4];

static int gARControllerID = 0;
static int gCameraID = 0;

static int ARCONTROLLER_NOT_FOUND = -1;
static int MULTIMARKER_NOT_FOUND = -2;
static int MARKER_INDEX_OUT_OF_BOUNDS = -3;

static ARMarkerInfo gMarkerInfo;

extern "C" {

	/**
		NFT API bindings
	*/

	void matrixLerp(ARdouble src[3][4], ARdouble dst[3][4], float interpolationFactor) {
		for (int i=0; i<3; i++) {
			for (int j=0; j<4; j++) {
				dst[i][j] = dst[i][j] + (src[i][j] - dst[i][j]) / interpolationFactor;
			}
		}
	}

	int getNFTMarkerInfo(int id, int markerIndex) {
		if (arControllers.find(id) == arControllers.end()) { return ARCONTROLLER_NOT_FOUND; }
		arController *arc = &(arControllers[id]);

		if (arc->surfaceSetCount <= markerIndex) {
			return MARKER_INDEX_OUT_OF_BOUNDS;
		}

		KpmResult *kpmResult = NULL;
		int kpmResultNum = -1;

		float trans[3][4];

		#if WITH_FILTERING
		ARdouble transF[3][4];
		ARdouble transFLerp[3][4];
		memset( transFLerp, 0, 3 * 4 * sizeof(ARdouble) );
		#endif

		float err = -1;
		if (arc->detectedPage == -2) {
			kpmMatching( arc->kpmHandle, arc->videoLuma );
			kpmGetResult( arc->kpmHandle, &kpmResult, &kpmResultNum );

			#if WITH_FILTERING
			arc->ftmi = arFilterTransMatInit(arc->filterSampleRate, arc->filterCutoffFrequency);
			#endif

			int i, j, k;
			int flag = -1;
			for( i = 0; i < kpmResultNum; i++ ) {
				if (kpmResult[i].pageNo == markerIndex && kpmResult[i].camPoseF == 0 ) {
					if( flag == -1 || err > kpmResult[i].error ) { // Take the first or best result.
						flag = i;
						err = kpmResult[i].error;
					}
				}
			}

			if (flag > -1) {
				arc->detectedPage = kpmResult[0].pageNo;

				for (j = 0; j < 3; j++) {
					for (k = 0; k < 4; k++) {
						trans[j][k] = kpmResult[flag].camPose[j][k];
					}
				}
				ar2SetInitTrans(arc->surfaceSet[arc->detectedPage], trans);
			} else {
				arc->detectedPage = -2;
			}
		}

		if (arc->detectedPage >= 0) {
			int trackResult = ar2TrackingMod(arc->ar2Handle, arc->surfaceSet[arc->detectedPage], arc->videoFrame, trans, &err);

			#if WITH_FILTERING
			for (int j = 0; j < 3; j++) {
				for (int k = 0; k < 4; k++) {
					transF[j][k] = trans[j][k];
				}
			}

			bool reset;
			if (trackResult < 0) {
				reset = 1;
			} else {
				reset = 0;
			}

			if (arFilterTransMat(arc->ftmi, transF, reset) < 0) {
					ARLOGe("arFilterTransMat error with marker %d.\n", markerIndex);
			}

			matrixLerp(transF, transFLerp, 0.95);
			#endif

			if( trackResult < 0 ) {
				ARLOGi("Tracking lost. %d\n", trackResult);
				arc->detectedPage = -2;
			} else {
				ARLOGi("Tracked page %d (max %d).\n",arc->surfaceSet[arc->detectedPage], arc->surfaceSetCount - 1);
			}
		}

		if (arc->detectedPage >= 0) {
			EM_ASM_({
				var $a = arguments;
				var i = 0;
				if (!artoolkitNFT["NFTMarkerInfo"]) {
					artoolkitNFT["NFTMarkerInfo"] = ({
						id: 0,
						error: -1,
						found: 0,
						pose: [0,0,0,0, 0,0,0,0, 0,0,0,0]
					});
				}
				var markerInfo = artoolkitNFT["NFTMarkerInfo"];
				markerInfo["id"] = $a[i++];
				markerInfo["error"] = $a[i++];
				markerInfo["found"] = 1;
				markerInfo["pose"][0] = $a[i++];
				markerInfo["pose"][1] = $a[i++];
				markerInfo["pose"][2] = $a[i++];
				markerInfo["pose"][3] = $a[i++];
				markerInfo["pose"][4] = $a[i++];
				markerInfo["pose"][5] = $a[i++];
				markerInfo["pose"][6] = $a[i++];
				markerInfo["pose"][7] = $a[i++];
				markerInfo["pose"][8] = $a[i++];
				markerInfo["pose"][9] = $a[i++];
				markerInfo["pose"][10] = $a[i++];
				markerInfo["pose"][11] = $a[i++];
			},
				markerIndex,
				err,

				#if WITH_FILTERING

				transFLerp[0][0],
				transFLerp[0][1],
				transFLerp[0][2],
				transFLerp[0][3],

				transFLerp[1][0],
				transFLerp[1][1],
				transFLerp[1][2],
				transFLerp[1][3],

				transFLerp[2][0],
				transFLerp[2][1],
				transFLerp[2][2],
				transFLerp[2][3]

				#else

				trans[0][0],
				trans[0][1],
				trans[0][2],
				trans[0][3],

				trans[1][0],
				trans[1][1],
				trans[1][2],
				trans[1][3],

				trans[2][0],
				trans[2][1],
				trans[2][2],
				trans[2][3]

				#endif
			);
        } else {
			EM_ASM_({
				var $a = arguments;
				var i = 0;
				if (!artoolkitNFT["NFTMarkerInfo"]) {
					artoolkitNFT["NFTMarkerInfo"] = ({
						id: 0,
						error: -1,
						found: 0,
						pose: [0,0,0,0, 0,0,0,0, 0,0,0,0]
					});
				}
				var markerInfo = artoolkitNFT["NFTMarkerInfo"];
				markerInfo["id"] = $a[i++];
				markerInfo["error"] = -1;
				markerInfo["found"] = 0;
				markerInfo["pose"][0] = 0;
				markerInfo["pose"][1] = 0;
				markerInfo["pose"][2] = 0;
				markerInfo["pose"][3] = 0;
				markerInfo["pose"][4] = 0;
				markerInfo["pose"][5] = 0;
				markerInfo["pose"][6] = 0;
				markerInfo["pose"][7] = 0;
				markerInfo["pose"][8] = 0;
				markerInfo["pose"][9] = 0;
				markerInfo["pose"][10] = 0;
				markerInfo["pose"][11] = 0;
			},
				markerIndex
			);
        }

		return 0;
	}

	int detectNFTMarker(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

		KpmResult *kpmResult = NULL;
		int kpmResultNum = -1;
		return kpmResultNum;
	}

	KpmHandle *createKpmHandle(ARParamLT *cparamLT) {
		KpmHandle *kpmHandle;
	    kpmHandle = kpmCreateHandle(cparamLT);
		return kpmHandle;
	}

	int getKpmImageWidth(KpmHandle *kpmHandle) {
		return kpmHandleGetXSize(kpmHandle);
	}

	int getKpmImageHeight(KpmHandle *kpmHandle) {
		return kpmHandleGetYSize(kpmHandle);
	}

	int setupAR2(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

		if ((arc->ar2Handle = ar2CreateHandleMod(arc->paramLT, arc->pixFormat)) == NULL) {
			ARLOGe("Error: ar2CreateHandle.\n");
			kpmDeleteHandle(&arc->kpmHandle);
		}
		// Settings for devices with single-core CPUs.
		ar2SetTrackingThresh(arc->ar2Handle, 5.0);
		ar2SetSimThresh(arc->ar2Handle, 0.50);
		ar2SetSearchFeatureNum(arc->ar2Handle, 16);
		ar2SetSearchSize(arc->ar2Handle, 6);
		ar2SetTemplateSize1(arc->ar2Handle, 6);
		ar2SetTemplateSize2(arc->ar2Handle, 6);

		arc->kpmHandle = createKpmHandle(arc->paramLT);

		return 0;
	}

	int loadNFTMarker(arController *arc, int surfaceSetCount, const char* datasetPathname) {
		int i, pageNo, numIset;
		KpmRefDataSet *refDataSet;

		KpmHandle *kpmHandle = arc->kpmHandle;

		refDataSet = NULL;

		// Load KPM data.
		KpmRefDataSet  *refDataSet2;
		ARLOGi("Reading %s.fset3\n", datasetPathname);
		if (kpmLoadRefDataSet(datasetPathname, "fset3", &refDataSet2) < 0 ) {
			ARLOGe("Error reading KPM data from %s.fset3\n", datasetPathname);
			pageNo = -1;
			return (FALSE);
		}
		pageNo = surfaceSetCount;
		ARLOGi("  Assigned page no. %d.\n", surfaceSetCount);
		if (kpmChangePageNoOfRefDataSet(refDataSet2, KpmChangePageNoAllPages, surfaceSetCount) < 0) {
		    ARLOGe("Error: kpmChangePageNoOfRefDataSet\n");
		    return (FALSE);
		}
		if (kpmMergeRefDataSet(&refDataSet, &refDataSet2) < 0) {
		    ARLOGe("Error: kpmMergeRefDataSet\n");
		    return (FALSE);
		}
		ARLOGi("  Done.\n");

		// Load AR2 data.
		ARLOGi("Reading %s.fset\n", datasetPathname);

		if ((arc->surfaceSet[surfaceSetCount] = ar2ReadSurfaceSet(datasetPathname, "fset", NULL)) == NULL ) {
		    ARLOGe("Error reading data from %s.fset\n", datasetPathname);
		}

		numIset = arc->surfaceSet[surfaceSetCount]->surface[0].imageSet->num;
		arc->nft.width_NFT = arc->surfaceSet[surfaceSetCount]->surface[0].imageSet->scale[0]->xsize;
		arc->nft.height_NFT = arc->surfaceSet[surfaceSetCount]->surface[0].imageSet->scale[0]->ysize;
		arc->nft.dpi_NFT = arc->surfaceSet[surfaceSetCount]->surface[0].imageSet->scale[0]->dpi;

		ARLOGi("NFT num. of ImageSet: %i\n", numIset);
		ARLOGi("NFT marker width: %i\n", arc->nft.width_NFT);
		ARLOGi("NFT marker height: %i\n", arc->nft.height_NFT);
		ARLOGi("NFT marker dpi: %i\n", arc->nft.dpi_NFT);

		ARLOGi("  Done.\n");

	if (surfaceSetCount == PAGES_MAX) exit(-1);

		if (kpmSetRefDataSet(kpmHandle, refDataSet) < 0) {
		    ARLOGe("Error: kpmSetRefDataSet\n");
		    return (FALSE);
		}
		kpmDeleteRefDataSet(&refDataSet);

		ARLOGi("Loading of NFT data complete.\n");
		return (TRUE);
	}

	/***************
	 * Set Log Level
	 ****************/
	void setLogLevel(int level) {
		arLogLevel = level;
	}

	int getLogLevel() {
		return arLogLevel;
	}

	/***********
	* Teardown *
	***********/

	void deleteHandle(arController *arc) {
		if (arc->arhandle != NULL) {
			arPattDetach(arc->arhandle);
			arDeleteHandle(arc->arhandle);
			arc->arhandle = NULL;
		}
		if (arc->ar3DHandle != NULL) {
			ar3DDeleteHandle(&(arc->ar3DHandle));
			arc->ar3DHandle = NULL;
		}
		if (arc->paramLT != NULL) {
			arParamLTFree(&(arc->paramLT));
			arc->paramLT = NULL;
		}
	}

	int teardown(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

        //TODO: Fix Cleanup luma.
        // if(arc->videoLuma) {
        //     free(arc->videoLuma);
        //     arc->videoLuma = NULL;
        // }

		if (arc->videoFrame) {
			free(arc->videoFrame);
			arc->videoFrame = NULL;
			arc->videoFrameSize = 0;
		}

		deleteHandle(arc);

		arControllers.erase(id);

		delete arc;

		return 0;
	}



	/*****************
	* Camera loading *
	*****************/

	int loadCamera(std::string cparam_name) {
		ARParam param;
		if (arParamLoad(cparam_name.c_str(), 1, &param) < 0) {
			ARLOGe("loadCamera(): Error loading parameter file %s for camera.\n", cparam_name.c_str());
			return -1;
		}
		int cameraID = gCameraID++;
		cameraParams[cameraID] = param;

		return cameraID;
	}

	int setCamera(int id, int cameraID) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

		if (cameraParams.find(cameraID) == cameraParams.end()) { return -1; }

		arc->param = cameraParams[cameraID];

		if (arc->param.xsize != arc->width || arc->param.ysize != arc->height) {
			ARLOGw("*** Camera Parameter resized from %d, %d. ***\n", arc->param.xsize, arc->param.ysize);
			arParamChangeSize(&(arc->param), arc->width, arc->height, &(arc->param));
		}

		// ARLOGi("*** Camera Parameter ***\n");
		// arParamDisp(&(arc->param));

		deleteHandle(arc);

		if ((arc->paramLT = arParamLTCreate(&(arc->param), AR_PARAM_LT_DEFAULT_OFFSET)) == NULL) {
			ARLOGe("setCamera(): Error: arParamLTCreate.\n");
			return -1;
		}

		// ARLOGi("setCamera(): arParamLTCreated\n..%d, %d\n", (arc->paramLT->param).xsize, (arc->paramLT->param).ysize);

		// setup camera
		if ((arc->arhandle = arCreateHandle(arc->paramLT)) == NULL) {
			ARLOGe("setCamera(): Error: arCreateHandle.\n");
			return -1;
		}
		// AR_DEFAULT_PIXEL_FORMAT
		int set = arSetPixelFormat(arc->arhandle, arc->pixFormat);

		arc->ar3DHandle = ar3DCreateHandle(&(arc->param));
		if (arc->ar3DHandle == NULL) {
			ARLOGe("setCamera(): Error creating 3D handle");
			return -1;
		}

		arglCameraFrustumRH(&((arc->paramLT)->param), arc->nearPlane, arc->farPlane, arc->cameraLens);

		arc->kpmHandle = createKpmHandle(arc->paramLT);

		return 0;
	}

	/*****************
	* Marker loading *
	*****************/

	nftMarker addNFTMarker(int id, std::string datasetPathname) {
		nftMarker nft;
		if (arControllers.find(id) == arControllers.end()) { return nft; }
		arController *arc = &(arControllers[id]);

		// Load marker(s).
		int patt_id = arc->surfaceSetCount;
		if (!loadNFTMarker(arc, patt_id, datasetPathname.c_str())) {
			ARLOGe("ARToolKitJS(): Unable to set up NFT marker.\n");
			return nft;
		}

		arc->surfaceSetCount++;

		nft.id_NFT = patt_id;
    nft.width_NFT = arc->nft.width_NFT;
    nft.height_NFT = arc->nft.height_NFT;
    nft.dpi_NFT = arc->nft.dpi_NFT;

		return nft;
	}

	/**********************
	* Setters and getters *
	**********************/

	void setProjectionNearPlane(int id, const ARdouble projectionNearPlane) {
		if (arControllers.find(id) == arControllers.end()) { return; }
		arController *arc = &(arControllers[id]);
		arc->nearPlane = projectionNearPlane;
	}

	ARdouble getProjectionNearPlane(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);
		return arc->nearPlane;
	}

	void setProjectionFarPlane(int id, const ARdouble projectionFarPlane) {
		if (arControllers.find(id) == arControllers.end()) { return; }
		arController *arc = &(arControllers[id]);
		arc->farPlane = projectionFarPlane;
	}

	ARdouble getProjectionFarPlane(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);
		return arc->farPlane;
	}

	void setThreshold(int id, int threshold) {
		if (arControllers.find(id) == arControllers.end()) { return; }
		arController *arc = &(arControllers[id]);

		if (threshold < 0 || threshold > 255) return;
		if (arSetLabelingThresh(arc->arhandle, threshold) == 0) {
			ARLOGi("Threshold set to %d\n", threshold);
		};
		// default 100
		// arSetLabelingThreshMode
		// AR_LABELING_THRESH_MODE_MANUAL, AR_LABELING_THRESH_MODE_AUTO_MEDIAN, AR_LABELING_THRESH_MODE_AUTO_OTSU, AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE
	}

	int getThreshold(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

		int threshold;
		if (arGetLabelingThresh(arc->arhandle, &threshold) == 0) {
			return threshold;
		};

		return -1;
	}

	void setThresholdMode(int id, int mode) {
		if (arControllers.find(id) == arControllers.end()) { return; }
		arController *arc = &(arControllers[id]);

		AR_LABELING_THRESH_MODE thresholdMode = (AR_LABELING_THRESH_MODE)mode;

		if (arSetLabelingThreshMode(arc->arhandle, thresholdMode) == 0) {
			ARLOGi("Threshold mode set to %d\n", (int)thresholdMode);
		}
	}

	int getThresholdMode(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

		AR_LABELING_THRESH_MODE thresholdMode;

		if (arGetLabelingThreshMode(arc->arhandle, &thresholdMode) == 0) {
			return thresholdMode;
		}

		return -1;
	}

	int setDebugMode(int id, int enable) {
		if (arControllers.find(id) == arControllers.end()) { return NULL; }
		arController *arc = &(arControllers[id]);

		arSetDebugMode(arc->arhandle, enable ? AR_DEBUG_ENABLE : AR_DEBUG_DISABLE);
		ARLOGi("Debug mode set to %s\n", enable ? "on." : "off.");

		return enable;
	}

	int getProcessingImage(int id) {
		if (arControllers.find(id) == arControllers.end()) { return NULL; }
		arController *arc = &(arControllers[id]);

		return (int)arc->arhandle->labelInfo.bwImage;
	}

	int getDebugMode(int id) {
		if (arControllers.find(id) == arControllers.end()) { return NULL; }
		arController *arc = &(arControllers[id]);

		int enable;

		arGetDebugMode(arc->arhandle, &enable);
		return enable;
	}

	void setImageProcMode(int id, int mode) {
		if (arControllers.find(id) == arControllers.end()) { return; }
		arController *arc = &(arControllers[id]);

		int imageProcMode = mode;
		if (arSetImageProcMode(arc->arhandle, mode) == 0) {
			ARLOGi("Image proc. mode set to %d.\n", imageProcMode);
		}
	}

	int getImageProcMode(int id) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);

		int imageProcMode;
		if (arGetImageProcMode(arc->arhandle, &imageProcMode) == 0) {
			return imageProcMode;
		}

		return -1;
	}

	/*
	 * Marker processing
	 */

	void matrixCopy(ARdouble src[3][4], ARdouble dst[3][4]) {
		for (int i=0; i<3; i++) {
			for (int j=0; j<4; j++) {
				dst[i][j] = src[i][j];
			}
		}
	}

	int detectMarker(int id) {
		if (arControllers.find(id) == arControllers.end()) { return ARCONTROLLER_NOT_FOUND; }
		arController *arc = &(arControllers[id]);

		// Convert video frame to AR2VideoBufferT
    AR2VideoBufferT buff = {0};
    buff.buff = arc->videoFrame;
    buff.fillFlag = 1;

    buff.buffLuma = arc->videoLuma;


		return arDetectMarker( arc->arhandle, &buff);
	}

	/********
	* Setup *
	********/

	int setup(int width, int height, int cameraID) {
		int id = gARControllerID++;
		arController *arc = &(arControllers[id]);
		arc->id = id;

		arc->width = width;
		arc->height = height;

		arc->videoFrameSize = width * height * 4 * sizeof(ARUint8);
		arc->videoFrame = (ARUint8*) malloc(arc->videoFrameSize);
		arc->videoLuma = (ARUint8*) malloc(arc->videoFrameSize / 4);

		setCamera(id, cameraID);

		ARLOGi("Allocated videoFrameSize %d\n", arc->videoFrameSize);

		EM_ASM_({
			if (!artoolkitNFT["frameMalloc"]) {
				artoolkitNFT["frameMalloc"] = ({});
			}
			var frameMalloc = artoolkitNFT["frameMalloc"];
			frameMalloc["framepointer"] = $1;
			frameMalloc["framesize"] = $2;
			frameMalloc["camera"] = $3;
			frameMalloc["transform"] = $4;
			frameMalloc["videoLumaPointer"] = $5;
		},
			arc->id,
			arc->videoFrame,
			arc->videoFrameSize,
			arc->cameraLens,
			gTransform,
			arc->videoLuma          //$5
		);


		return arc->id;
	}



}

#include "ARBindEM.cpp"
