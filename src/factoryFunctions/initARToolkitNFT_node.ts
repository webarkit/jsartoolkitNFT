/*
 *  initARToolkitNFT.ts
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

import Module from "../../build/artoolkitNFT_node_wasm";
export async function initARToolkitNFT() {
  return new Promise((resolve) => {
    const artoolkitNFT = {
      UNKNOWN_MARKER: -1,
      NFT_MARKER: 0, // 0,
    };

    const FUNCTIONS = [
      "setup",
      "teardown",

      "setupAR2",

      "setLogLevel",
      "getLogLevel",

      "setDebugMode",
      "getDebugMode",

      "getProcessingImage",

      "detectMarker",
      "detectNFTMarker",
      "getNFTMarker",
      "getNFTData",

      "setProjectionNearPlane",
      "getProjectionNearPlane",

      "setProjectionFarPlane",
      "getProjectionFarPlane",

      "setThresholdMode",
      "getThresholdMode",

      "setThreshold",
      "getThreshold",

      "setImageProcMode",
      "getImageProcMode",

      "getCameraLens",
      "passVideoData",
    ];

    function runWhenLoaded() {
      FUNCTIONS.forEach(function (n) {
        //@ts-ignore
        artoolkitNFT[n] = Module[n];
      });

      for (const m in Module) {
        //@ts-ignore
        if (m.match(/^AR/)) artoolkitNFT[m] = Module[m];
      }
    }

    Module.onRuntimeInitialized = async function () {
      runWhenLoaded();
      // need to wrap this in an object
      // otherwise it will cause Chrome to crash
      resolve(this);
    };
  });
}
