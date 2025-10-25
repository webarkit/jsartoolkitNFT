/*
 *  initARToolkitNFT_td.ts
 *  JSARToolKitNFT
 *
 *  This file is part of JSARToolKitNFT - WebARKit.
 *
 *  JSARToolKitNFT is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  JSARToolKitNFT is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with JSARToolKitNFT.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2020 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

import ARToolkitNFT from "../../build/artoolkitNFT_ES6_wasm_td";

// Type definition for the Emscripten Module returned by ARToolkitNFT factory
interface ARToolkitNFTModule {
  ARToolKitNFT: any;
  FS: any;
  StringList: any;
  nftMarkers: any;
  ERROR_MARKER_INDEX_OUT_OF_BOUNDS: number;
  AR_DEBUG_DISABLE: number;
  AR_DEBUG_ENABLE: number;
  AR_DEFAULT_DEBUG_MODE: number;
  AR_DEFAULT_LABELING_THRESH: number;
  AR_IMAGE_PROC_FRAME_IMAGE: number;
  AR_IMAGE_PROC_FIELD_IMAGE: number;
  AR_DEFAULT_IMAGE_PROC_MODE: number;
  AR_MAX_LOOP_COUNT: number;
  AR_LOOP_BREAK_THRESH: number;
  AR_LOG_LEVEL_DEBUG: number;
  AR_LOG_LEVEL_INFO: number;
  AR_LOG_LEVEL_WARN: number;
  AR_LOG_LEVEL_ERROR: number;
  AR_LOG_LEVEL_REL_INFO: number;
  AR_LABELING_THRESH_MODE_MANUAL: number;
  AR_LABELING_THRESH_MODE_AUTO_MEDIAN: number;
  AR_LABELING_THRESH_MODE_AUTO_OTSU: number;
  AR_LABELING_THRESH_MODE_AUTO_ADAPTIVE: number;
  AR_MARKER_INFO_CUTOFF_PHASE_NONE: number;
  AR_MARKER_INFO_CUTOFF_PHASE_PATTERN_EXTRACTION: number;
  AR_MARKER_INFO_CUTOFF_PHASE_MATCH_GENERIC: number;
  AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONTRAST: number;
  AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_NOT_FOUND: number;
  AR_MARKER_INFO_CUTOFF_PHASE_MATCH_BARCODE_EDC_FAIL: number;
  AR_MARKER_INFO_CUTOFF_PHASE_MATCH_CONFIDENCE: number;
  AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR: number;
  AR_MARKER_INFO_CUTOFF_PHASE_POSE_ERROR_MULTI: number;
  AR_MARKER_INFO_CUTOFF_PHASE_HEURISTIC_TROUBLESOME_MATRIX_CODES: number;
}

export async function initARToolkitNFT(): Promise<ARToolkitNFTModule> {
  return await ARToolkitNFT() as ARToolkitNFTModule;
}
