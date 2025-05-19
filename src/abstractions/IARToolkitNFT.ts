/*
 *  IARToolkitNFT.ts
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

import { INFTMarkerInfo } from "./CommonInterfaces";
export interface IARToolkitNFT {
  getCameraLens(): any;
  passVideoData(
    videoFrame: Uint8ClampedArray,
    videoLuma: Uint8Array,
    lumaInternal: boolean,
  ): void;
  setup(width: number, height: number, cameraId: number): number;
  setupAR2(): void;
  setDebugMode(mode: boolean): number;
  getDebugMode(): boolean;
  setFiltering(enableFiltering: boolean): void;
  getProcessingImage(): number;
  setLogLevel(mode: boolean): number;
  getLogLevel(): number;
  NFTMarkerInfo: INFTMarkerInfo;
  loadCamera(cameraParam: string): Promise<number>;
  setProjectionNearPlane(value: number): void;
  getProjectionNearPlane(): number;
  setProjectionFarPlane(value: number): void;
  getProjectionFarPlane(): number;
  setThresholdMode(mode: number): number;
  getThresholdMode(): number;
  setThreshold(threshold: number): number;
  getThreshold(): number;
  addNFTMarkers(
    urls: Array<string>,
    callback: (ids: number[]) => void,
    onError2: (errorNumber: number) => void,
  ): Array<number>;
  detectNFTMarker(): number;
  getNFTMarker(markerIndex: number): INFTMarkerInfo;
  getNFTData(index: number): object;
  setImageProcMode(mode: number): number;
  getImageProcMode(): number;
  FS: any;
  StringList: any;
  nftMarkers: any;
}
