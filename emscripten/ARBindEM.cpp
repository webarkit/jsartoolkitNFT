#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(constant_bindings) {

	function("setup", &setup);
	function("teardown", &teardown);

	function("setupAR2", &setupAR2);

	function("_addNFTMarker", &addNFTMarker);

	function("_loadCamera", &loadCamera);

	function("detectMarker", &detectMarker);
	function("detectNFTMarker", &detectNFTMarker);
	function("getNFTMarker", &getNFTMarkerInfo);

	/* nft marker struct */
	value_object<nftMarker>("nftMarker")
	.field("id", &nftMarker::id_NFT)
  .field("width", &nftMarker::width_NFT)
  .field("height", &nftMarker::height_NFT)
  .field("dpi", &nftMarker::dpi_NFT);

	/* AR Toolkit C APIS */
	function("setDebugMode", &setDebugMode);
	function("getDebugMode", &getDebugMode);

	function("getProcessingImage", &getProcessingImage);

	function("setLogLevel", &setLogLevel);
	function("getLogLevel", &getLogLevel);

	function("setProjectionNearPlane", &setProjectionNearPlane);
	function("getProjectionNearPlane", &getProjectionNearPlane);

	function("setProjectionFarPlane", &setProjectionFarPlane);
	function("getProjectionFarPlane", &getProjectionFarPlane);

	function("setThresholdMode", &setThresholdMode);
	function("getThresholdMode", &getThresholdMode);

	function("setThreshold", &setThreshold);
	function("getThreshold", &getThreshold);

	function("setImageProcMode", &setImageProcMode);
	function("getImageProcMode", &getImageProcMode);

	/* errors */
	constant("ERROR_ARCONTROLLER_NOT_FOUND", ARCONTROLLER_NOT_FOUND);
	constant("ERROR_MULTIMARKER_NOT_FOUND", MULTIMARKER_NOT_FOUND);
	constant("ERROR_MARKER_INDEX_OUT_OF_BOUNDS", MARKER_INDEX_OUT_OF_BOUNDS);

	/* arDebug */
	constant("AR_DEBUG_DISABLE", AR_DEBUG_DISABLE);
	constant("AR_DEBUG_ENABLE", AR_DEBUG_ENABLE);
	constant("AR_DEFAULT_DEBUG_MODE", AR_DEFAULT_DEBUG_MODE);

	/* for arlabelingThresh */
	constant("AR_DEFAULT_LABELING_THRESH", AR_DEFAULT_LABELING_THRESH);

	/* for arImageProcMode */
	constant("AR_IMAGE_PROC_FRAME_IMAGE", AR_IMAGE_PROC_FRAME_IMAGE);
	constant("AR_IMAGE_PROC_FIELD_IMAGE", AR_IMAGE_PROC_FIELD_IMAGE);
	constant("AR_DEFAULT_IMAGE_PROC_MODE", AR_DEFAULT_IMAGE_PROC_MODE);

	/* for arGetTransMat */
	constant("AR_MAX_LOOP_COUNT", AR_MAX_LOOP_COUNT);
	constant("AR_LOOP_BREAK_THRESH", AR_LOOP_BREAK_THRESH);

	/* Enums */
	constant("AR_LOG_LEVEL_DEBUG", AR_LOG_LEVEL_DEBUG + 0);
	constant("AR_LOG_LEVEL_INFO", AR_LOG_LEVEL_INFO + 0);
	constant("AR_LOG_LEVEL_WARN", AR_LOG_LEVEL_WARN + 0);
	constant("AR_LOG_LEVEL_ERROR", AR_LOG_LEVEL_ERROR + 0);
	constant("AR_LOG_LEVEL_REL_INFO", AR_LOG_LEVEL_REL_INFO + 0);

	constant("AR_LABELING_THRESH_MODE_MANUAL", AR_LABELING_THRESH_MODE_MANUAL + 0);
	constant("AR_LABELING_THRESH_MODE_AUTO_MEDIAN", AR_LABELING_THRESH_MODE_AUTO_MEDIAN + 0);
	constant("AR_LABELING_THRESH_MODE_AUTO_OTSU", AR_LABELING_THRESH_MODE_AUTO_OTSU + 0);
	constant("AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE", AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE + 0);

	constant("AR_MARKER_INFO_CUTOFF_PHASE_NONE", AR_MARKER_INFO_CUTOFF_PHASE_NONE + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION", AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC", AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST", AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND", AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL", AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE", AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR", AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI", AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI + 0);
	constant("AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES", AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES + 0);
}
