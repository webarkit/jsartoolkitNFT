/*
 *  Utils.ts
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
import axios, { AxiosResponse } from "axios";

export default class Utils {
  static async fetchRemoteData(url: string): Promise<Uint8Array> {
    try {
      const response: AxiosResponse<any> = await axios.get(url, {
        responseType: "arraybuffer",
      });
      return new Uint8Array(response.data);
    } catch (error) {
      throw new Error("Error in Utils.fetchRemoteData: ", error);
    }
  }

  static async fetchRemoteDataCallback(
    url: string,
    callback: any,
  ): Promise<any> {
    try {
      const response: any = await axios
        .get(url, { responseType: "arraybuffer" })
        .then((response: any) => {
          const data = new Uint8Array(response.data);
          callback(response);
        });
      return response;
    } catch (error) {
      throw new Error("Error in Utils.fetchRemoteDataCallback: ", error);
    }
  }

  static string2Uint8Data(string: string): Uint8Array {
    const data = new Uint8Array(string.length);
    for (let i = 0; i < data.length; i++) {
      data[i] = string.charCodeAt(i) & 0xff;
    }
    return data;
  }

  static Uint8ArrayToStr(array: any): string {
    let out, i, len, c;
    let char2, char3;

    out = "";
    len = array.length;
    i = 0;
    while (i < len) {
      c = array[i++];
      switch (c >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
          // 0xxxxxxx
          out += String.fromCharCode(c);
          break;
        case 12:
        case 13:
          // 110x xxxx   10xx xxxx
          char2 = array[i++];
          out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
          break;
        case 14:
          // 1110 xxxx  10xx xxxx  10xx xxxx
          char2 = array[i++];
          char3 = array[i++];
          out += String.fromCharCode(
            ((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0),
          );
          break;
      }
    }

    return out;
  }

  static checkZFT(url: string): boolean {
    const request = new XMLHttpRequest();
    request.open("GET", url, false); // `false` makes the request synchronous
    request.send(null);

    if (request.status === 200) {
      return true;
    } else if (request.status === 404) {
      return false;
    }
    return false;
  }
  /**
   * Stores data in the Emscripten filesystem.
   * Note: FS is provided by emscripten and valid data must be in binary format encoded as Uint8Array
   * @param {Uint8Array} data - The binary data to store.
   * @param {string} target - The target file path in the Emscripten filesystem.
   * @param {any} instance - The instance of the class containing the FS object.
   * @return {void}
   */
  static _storeDataFile(data: Uint8Array, target: string, instance: any) {
    instance.FS.writeFile(target, data, {
      encoding: "binary",
    });
  }
}
