export default class Utils {
    /**
     * Fetches a file as bytes. Uses fetch alone (no module needed) so it can be
     * unit-tested and reused. A non-OK response is an "http" NFTLoadError; a
     * rejected fetch is "network", except an abort, which propagates unchanged so
     * callers can tell cancellation from failure.
     */
    static fetchBinary(url: string, signal?: AbortSignal): Promise<Uint8Array>;
    /**
     * Reads a response body as bytes. The connection can still fail after the
     * headers arrived (a reset mid-download); that is a "network" NFTLoadError
     * too, so a Promise-style failure is always an NFTLoadError or the abort
     * reason, as documented. An abort propagates unchanged.
     */
    static readBody(response: Response, url: string, signal?: AbortSignal): Promise<Uint8Array>;
    /**
     * Decodes ASCII hex (two digits per byte, either case) straight to bytes.
     * Replaces Uint8ArrayToStr + match(/.{1,2}/g) + parseInt, which built two
     * intermediate strings and an array of pair strings per descriptor file.
     */
    static hexToBytes(hex: Uint8Array): Uint8Array;
    static string2Uint8Data(string: string): Uint8Array;
    /**
     * Stores data in the Emscripten filesystem.
     * Note: FS is provided by emscripten and valid data must be in binary format encoded as Uint8Array
     * @param {Uint8Array} data - The binary data to store.
     * @param {string} target - The target file path in the Emscripten filesystem.
     * @param {any} instance - The instance of the class containing the FS object.
     * @return {void}
     */
    static _storeDataFile(data: Uint8Array, target: string, instance: any): void;
}
