export default class Utils {
    static fetchRemoteData(url: string): Promise<Uint8Array>;
    static fetchRemoteDataCallback(url: string, callback: any): Promise<any>;
    static string2Uint8Data(string: string): Uint8Array;
    static Uint8ArrayToStr(array: any): string;
    static checkZFT(url: string): boolean;
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
