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
import { NFTLoadError } from "./NFTLoadError";

export default class Utils {
  /**
   * Fetches a file as bytes. Uses fetch alone (no module needed) so it can be
   * unit-tested and reused. A non-OK response is an "http" NFTLoadError; a
   * rejected fetch is "network", except an abort, which propagates unchanged so
   * callers can tell cancellation from failure.
   */
  static async fetchBinary(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new NFTLoadError("network", `Network error fetching ${url}`, {
        url,
        cause,
      });
    }
    if (!response.ok) {
      throw new NFTLoadError(
        "http",
        `HTTP ${response.status} fetching ${url}`,
        { url, status: response.status },
      );
    }
    return Utils.readBody(response, url, signal);
  }

  /**
   * Reads a response body as bytes. The connection can still fail after the
   * headers arrived (a reset mid-download); that is a "network" NFTLoadError
   * too, so a Promise-style failure is always an NFTLoadError or the abort
   * reason, as documented. An abort propagates unchanged.
   */
  static async readBody(
    response: Response,
    url: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new NFTLoadError("network", `Network error reading ${url}`, {
        url,
        cause,
      });
    }
  }

  /**
   * Decodes ASCII hex (two digits per byte, either case) straight to bytes.
   * Replaces Uint8ArrayToStr + match(/.{1,2}/g) + parseInt, which built two
   * intermediate strings and an array of pair strings per descriptor file.
   */
  static hexToBytes(hex: Uint8Array): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new RangeError("hexToBytes: odd number of hex digits");
    }
    const nibble = (c: number): number => {
      if (c >= 48 && c <= 57) return c - 48; // 0-9
      if (c >= 97 && c <= 102) return c - 87; // a-f
      if (c >= 65 && c <= 70) return c - 55; // A-F
      throw new RangeError(`hexToBytes: invalid hex digit (byte ${c})`);
    };
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = (nibble(hex[2 * i]) << 4) | nibble(hex[2 * i + 1]);
    }
    return out;
  }

  static string2Uint8Data(string: string): Uint8Array {
    const data = new Uint8Array(string.length);
    for (let i = 0; i < data.length; i++) {
      data[i] = string.charCodeAt(i) & 0xff;
    }
    return data;
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
