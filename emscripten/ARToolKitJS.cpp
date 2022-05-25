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
#include <time.h> 
#include <unordered_map>
#include <AR/config.h>
#include <AR2/tracking.h>
#include <AR/arFilterTransMat.h>
#include <AR/paramGL.h>
#include <KPM/kpm.h>
#include <WebARKit/WebARKitLog.h>
#include <WebARKit/WebARKitOEF.h>
#include "trackingMod.h"

const int PAGES_MAX = 20;         // Maximum number of pages expected. You can change this down (to save memory) or up (to accomodate more pages.)

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
    std::vector<nftMarker> nftMarkers;

	ARdouble nearPlane = 0.0001;
	ARdouble farPlane = 1000.0;

	int patt_id = 0; // Running pattern marker id

	ARdouble cameraLens[16];
	AR_PIXEL_FORMAT pixFormat = AR_PIXEL_FORMAT_RGBA;
	OEF::OneEuroFilter f{60, 0.1, 0.1, 2};
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

		float trans[3][4];

		#if WITH_FILTERING
		ARdouble transF[3][4];
		ARdouble transFLerp[3][4];
		memset( transFLerp, 0, 3 * 4 * sizeof(ARdouble) );
		#endif

		float err = -1;
		if (arc->detectedPage == markerIndex) {
			
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
					webarkitLOGe("arFilterTransMat error with marker %d.", markerIndex);
			}

			matrixLerp(transF, transFLerp, 0.95);
			#endif

		    ARdouble transOEF[3][4];

			for (int j = 0; j < 3; j++) {
				for (int k = 0; k < 4; k++) {
					transOEF[j][k] = trans[j][k];
				}
			}

			if(arc->f.filterMat2(transOEF, (ARdouble (*)[4])trans, clock()) < 0) {
				webarkitLOGe("Error with filterMat2!");
			};		

			if( trackResult < 0 ) {
				webarkitLOGi("Tracking lost. %d", trackResult);
				arc->detectedPage = -2;
			} else {
				ARLOGi("Tracked page %d (max %d).\n",arc->surfaceSet[arc->detectedPage], arc->surfaceSetCount - 1);
			}
		}

		if (arc->detectedPage == markerIndex) {
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

		if (arc->detectedPage == -2) {
            kpmMatching( arc->kpmHandle, arc->videoLuma );
            kpmGetResult( arc->kpmHandle, &kpmResult, &kpmResultNum );

			#if WITH_FILTERING
			arc->ftmi = arFilterTransMatInit(arc->filterSampleRate, arc->filterCutoffFrequency);
			#endif

			for(int i = 0; i < kpmResultNum; i++ ) {
				if (kpmResult[i].camPoseF == 0 ) {

                    float trans[3][4];
                    arc->detectedPage = kpmResult[i].pageNo;
                    for (int j = 0; j < 3; j++) {
                        for (int k = 0; k < 4; k++) {
                            trans[j][k] = kpmResult[i].camPose[j][k];
                        }
                    }
                    ar2SetInitTrans(arc->surfaceSet[arc->detectedPage], trans);
                }
            }
        }
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
			webarkitLOGe("Error: ar2CreateHandle.");
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

	nftMarker getNFTData(int id, int index) {
		if (arControllers.find(id) == arControllers.end()) { return {}; }
		arController *arc = &(arControllers[id]);
		// get marker(s) nft data.
		return arc->nftMarkers.at(index);
	}

	/****************
	 * Set OEF filter
     ****************/
	int setOEF(int id, double freq, double mincutoff, double beta, double dcutoff) {
		if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);
		arc->f = {freq, mincutoff, beta, dcutoff};
		return 0;
	}

	int filterOEF(int id, double value, double timestamp) {
       if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);
		arc->f.filter(value, timestamp);
		return 0;
	}
 
	int filterMatOEF(int id, ARdouble mat[3][4], double timestamp) {
       if (arControllers.find(id) == arControllers.end()) { return -1; }
		arController *arc = &(arControllers[id]);
		arc->f.filterMat(mat, timestamp);
		return 0;
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

		arc->f = NULL;

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
			webarkitLOGe("loadCamera(): Error loading parameter file %s for camera.", cparam_name.c_str());
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
			webarkitLOGe("setCamera(): Error: arParamLTCreate.");
			return -1;
		}

		// ARLOGi("setCamera(): arParamLTCreated\n..%d, %d\n", (arc->paramLT->param).xsize, (arc->paramLT->param).ysize);

		// setup camera
		if ((arc->arhandle = arCreateHandle(arc->paramLT)) == NULL) {
			webarkitLOGe("setCamera(): Error: arCreateHandle.");
			return -1;
		}
		// AR_DEFAULT_PIXEL_FORMAT
		int set = arSetPixelFormat(arc->arhandle, arc->pixFormat);

		arc->ar3DHandle = ar3DCreateHandle(&(arc->param));
		if (arc->ar3DHandle == NULL) {
			webarkitLOGe("setCamera(): Error creating 3D handle");
			return -1;
		}

		arglCameraFrustumRH(&((arc->paramLT)->param), arc->nearPlane, arc->farPlane, arc->cameraLens);

		arc->kpmHandle = createKpmHandle(arc->paramLT);

		return 0;
	}

	/*****************
	* Marker loading *
	*****************/

	std::vector<int> addNFTMarkers(int id, std::vector<std::string> &datasetPathnames) {
		if (arControllers.find(id) == arControllers.end()) { return {}; }
		arController *arc = &(arControllers[id]);

        KpmHandle *kpmHandle = arc->kpmHandle;

        KpmRefDataSet *refDataSet;
        refDataSet = NULL;

        if (datasetPathnames.size() >= PAGES_MAX) {
            webarkitLOGe("Error exceed maximum pages.");
            exit(-1);
        }

        std::vector<int> markerIds = {};

        for (int i = 0; i < datasetPathnames.size(); i++) {
			webarkitLOGi("datasetPathnames size: %i", datasetPathnames.size());
            webarkitLOGi("add NFT marker-> '%s'", datasetPathnames[i].c_str());

            const char* datasetPathname = datasetPathnames[i].c_str();
            int pageNo = i;
            markerIds.push_back(i);

            // Load KPM data.
            KpmRefDataSet  *refDataSet2;
            webarkitLOGi("Reading %s.fset3", datasetPathname);
            if (kpmLoadRefDataSet(datasetPathname, "fset3", &refDataSet2) < 0 ) {
                webarkitLOGe("Error reading KPM data from %s.fset3", datasetPathname);
                return {};
            }
            webarkitLOGi("Assigned page no. %d.", pageNo);
            if (kpmChangePageNoOfRefDataSet(refDataSet2, KpmChangePageNoAllPages, pageNo) < 0) {
                webarkitLOGe("Error: kpmChangePageNoOfRefDataSet");
                return {};
            }
            if (kpmMergeRefDataSet(&refDataSet, &refDataSet2) < 0) {
                webarkitLOGe("Error: kpmMergeRefDataSet");
                return {};
            }
            webarkitLOGi("Done.");

            // Load AR2 data.
            webarkitLOGi("Reading %s.fset", datasetPathname);

            if ((arc->surfaceSet[i] = ar2ReadSurfaceSet(datasetPathname, "fset", NULL)) == NULL ) {
                webarkitLOGe("Error reading data from %s.fset", datasetPathname);
                return {};
            }

			int surfaceSetCount = arc->surfaceSetCount;
			int numIset = arc->surfaceSet[i]->surface[0].imageSet->num;
			arc->nft.width_NFT = arc->surfaceSet[i]->surface[0].imageSet->scale[0]->xsize;
			arc->nft.height_NFT = arc->surfaceSet[i]->surface[0].imageSet->scale[0]->ysize;
			arc->nft.dpi_NFT = arc->surfaceSet[i]->surface[0].imageSet->scale[0]->dpi;

			webarkitLOGi("NFT num. of ImageSet: %i", numIset);
			webarkitLOGi("NFT marker width: %i", arc->nft.width_NFT);
			webarkitLOGi("NFT marker height: %i", arc->nft.height_NFT);
			webarkitLOGi("NFT marker dpi: %i", arc->nft.dpi_NFT);

			arc->nft.id_NFT = i;
		    arc->nft.width_NFT = arc->nft.width_NFT;
		    arc->nft.height_NFT = arc->nft.height_NFT;
		    arc->nft.dpi_NFT = arc->nft.dpi_NFT;
			arc->nftMarkers.push_back(arc->nft);

            webarkitLOGi("Done.");
			surfaceSetCount++;
        }

        if (kpmSetRefDataSet(kpmHandle, refDataSet) < 0) {
            webarkitLOGe("Error: kpmSetRefDataSet");
            return {};
        }
        kpmDeleteRefDataSet(&refDataSet);

        webarkitLOGi("Loading of NFT data complete.");

		arc->surfaceSetCount += markerIds.size();

        return markerIds;
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
			webarkitLOGi("Threshold set to %d", threshold);
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
			webarkitLOGi("Threshold mode set to %d", (int)thresholdMode);
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
		webarkitLOGi("Debug mode set to %s", enable ? "on." : "off.");

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
			webarkitLOGi("Image proc. mode set to %d.", imageProcMode);
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

		webarkitLOGi("Allocated videoFrameSize %d", arc->videoFrameSize);

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
