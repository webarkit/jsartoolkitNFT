/*
 *  ARToolkitNFT_td.ts
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
import { initARToolkitNFT } from "./factoryFunctions/initARToolkitNFT_td";
import { ARToolkitNFTBase } from "./ARToolkitNFTBase";

// The WASM wrapper of the threaded build. All of its code is in ARToolkitNFTBase;
// this class only picks the build (#734). A plain comment, not JSDoc, so the
// published documentation of ARToolkitNFT stays as it was.
// Declare no instance fields here: with ESNext class fields, a field declared in
// a subclass is reset to `undefined` after the base constructor has set it.
export class ARToolkitNFT extends ARToolkitNFTBase {
  /**
   * The ARToolkitNFT constructor. It has no arguments.
   * These properties are initialized:
   * - instance
   * - markerNFTCount
   * - cameraCount
   * - version
   * A message is displayed in the browser console during the intitialization, for example:
   * "ARToolkitNFT 1.5.0"
   */
  constructor() {
    // No withFiltering argument, as this build has always constructed it: the
    // threaded binding does not filter poses, so the argument would have no
    // effect (ARToolKitNFT_js_td.cpp), but changing it is not part of #734 (D7).
    super(ARToolkitNFT, initARToolkitNFT);
  }
}
