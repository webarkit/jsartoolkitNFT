/*
 *  CommonInterfaces.ts
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

export interface IImageObj extends HTMLCanvasElement {
  videoWidth: number;
  width: number;
  videoHeight: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface INFTMarker {
  inPrevious: boolean;
  inCurrent: boolean;
  matrix: Float64Array;
  matrixGL_RH: Float64Array;
  markerWidth: number;
}

export interface INFTMarkerInfo {
  error: number;
  found: number;
  id: number;
  pose: Float64Array;
}

// Minimal type definition for nftMarkers property
export interface NftMarker {
  id: number;
  name: string;
  data?: any; // Replace with more specific type if known
}

export type NftMarkers = NftMarker[];

// Emscripten File System interface
// Based on Emscripten's FS API: https://emscripten.org/docs/api_reference/Filesystem-API.html
export interface EmscriptenFS {
  readFile(
    path: string,
    opts?: { encoding?: "binary" | "utf8"; flags?: string },
  ): Uint8Array | string;
  writeFile(
    path: string,
    data: string | ArrayBufferView,
    opts?: { flags?: string; encoding?: string },
  ): void;
  unlink(path: string): void;
  // Add more methods as needed: mkdir, rmdir, readdir, stat, etc.
  [key: string]: any; // Allow other FS methods not explicitly typed
}

// Emscripten embind StringList (std::vector<std::string> wrapper)
export interface EmscriptenStringList {
  size(): number;
  get(index: number): string;
  push_back(value: string): void;
  delete(): void;
  // Add more vector methods as needed
  [key: string]: any; // Allow other methods not explicitly typed
}

// StringList constructor type
export interface EmscriptenStringListConstructor {
  new (): EmscriptenStringList;
}

// ARToolKitNFT WASM instance interface (the raw Emscripten class instance)
// This represents the low-level WASM instance created by: new instance.ARToolKitNFT()
// Note: This is different from IARToolkitNFT which is the TypeScript wrapper class
export interface IARToolKitNFTInstance {
  // Setup and teardown
  setup(width: number, height: number, cameraId: number): number;
  teardown(): void;
  setupAR2(): void;

  // Video data processing
  passVideoData(
    videoFrame: Uint8ClampedArray,
    videoLuma: Uint8Array,
    lumaInternal: boolean,
  ): void;

  // NFT Marker detection and tracking
  detectNFTMarker(): number;
  getNFTMarker(markerIndex: number): any; // Returns INFTMarkerInfo
  getNFTData(index: number): object;
  _addNFTMarkers(markers: EmscriptenStringList): number;

  // Camera operations
  _loadCamera(cameraParam: string): number;
  getCameraLens(): any;
  recalculateCameraLens(): void;

  // Projection planes
  setProjectionNearPlane(value: number): void;
  getProjectionNearPlane(): number;
  setProjectionFarPlane(value: number): void;
  getProjectionFarPlane(): number;

  // Threshold settings
  setThresholdMode(mode: number): number;
  getThresholdMode(): number;
  setThreshold(threshold: number): number;
  getThreshold(): number;

  // Image processing
  setImageProcMode(mode: number): number;
  getImageProcMode(): number;
  getProcessingImage(): number;

  // Debug and logging
  setDebugMode(mode: boolean): number;
  getDebugMode(): boolean;
  setLogLevel(mode: boolean): number;
  getLogLevel(): number;

  // Filtering
  setFiltering(enableFiltering: boolean): void;

  // ZFT decompression
  _decompressZFT(prefix: string, prefixTemp: string): number;

  [key: string]: any; // Allow for any additional methods
}

// ARToolKitNFT WASM constructor interface
export interface IARToolKitNFTInstanceConstructor {
  new (): IARToolKitNFTInstance;
  new (withFiltering: boolean): IARToolKitNFTInstance;
}

// Type definition for the Emscripten Module returned by ARToolkitNFT factory
export interface ARToolkitNFTModule {
  ARToolKitNFT: IARToolKitNFTInstanceConstructor;
  FS: EmscriptenFS;
  StringList: EmscriptenStringListConstructor;
  nftMarkers: NftMarkers;
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
