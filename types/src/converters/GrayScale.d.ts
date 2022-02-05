export default class GrayScale {
    private _flipImageProg;
    private _grayscaleProg;
    glReady: boolean;
    private gl;
    private flipLocation;
    private pixelBuf;
    private grayBuf;
    constructor(context: WebGLRenderingContext);
    initGL(vertShaderSource: any, fragShaderSource: any): void;
    getFrame(data: any): Uint8Array;
}
