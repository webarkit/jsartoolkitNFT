export default class Utils {
    static fetchRemoteData(url: string): Promise<Uint8Array>;
    static fetchRemoteDataCallback(url: string, callback: any): Promise<any>;
    static string2Uint8Data(string: string): Uint8Array;
}
