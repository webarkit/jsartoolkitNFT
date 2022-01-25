export default class GrayScale {
    private _canvas;
    private _width;
    private _height;
    private _flipImageProg;
    private _grayscaleProg;
    glReady: boolean;
    private gl;
    private flipLocation;
    private pixelBuf;
    private grayBuf;
    constructor(context: WebGLRenderingContext, width: number, height: number);
    initGL(vertShaderSource: any, fragShaderSource: any): void;
    getFrame(data: any): Uint8Array;
}
