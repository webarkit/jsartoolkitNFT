import { INFTMarkerInfo } from "./CommonInterfaces";
export interface IARToolkitNFT {
  getCameraLens: (cameraId: number) => any;
  setup: {
    (width: number, height: number, cameraId: number): number;
  };
  setupAR2: {
    (id: number): void;
  };
  setDebugMode: (id: number, mode: boolean) => number;
  getDebugMode: (id: number) => boolean;
  getProcessingImage: (id: number) => number;
  setLogLevel: (mode: boolean) => number;
  getLogLevel: () => number;
  NFTMarkerInfo: INFTMarkerInfo;
  loadCamera: (cameraParam: string) => Promise<number>;
  setProjectionNearPlane: {
    (id: number, value: number): void;
  };
  getProjectionNearPlane: (id: number) => number;
  setProjectionFarPlane: (id: number, value: number) => void;
  getProjectionFarPlane: (id: number) => number;
  setThresholdMode: (id: number, mode: number) => number;
  getThresholdMode: (id: number) => number;
  setThreshold: (id: number, threshold: number) => number;
  getThreshold: (id: number) => number;
  addNFTMarkers: (
    arId: number,
    urls: Array<string>,
    callback: (ids: number[]) => void,
    onError2: (errorNumber: number) => void
  ) => Array<number>;
  detectMarker: (id: number, videoFrame: Uint8ClampedArray, videoLuma: Uint8Array) => number;
  detectNFTMarker: (arId: number, videoLuma: Uint8Array) => void;
  getNFTMarker: (id: number, markerIndex: number, videoFrame: Uint8ClampedArray) => INFTMarkerInfo;
  getNFTData: (id: number, index: number) => object;
  setImageProcMode: (id: number, mode: number) => number;
  getImageProcMode: (id: number) => number;
}
