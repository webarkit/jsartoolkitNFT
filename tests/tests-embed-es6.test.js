// Import the factory function from the ES6 module.
import ARToolkitNFT from '../build/artoolkitNFT_embed_ES6_wasm.js';

describe('ARControllerNFT (ES6 Embed)', () => {
    let artoolkit;
    let arController;

    // 1. Get the module object once before all tests.
    beforeAll(async () => {
        artoolkit = await ARToolkitNFT();
    }, 20000);

    // 2. Create a new controller before each test using the correct async flow.
    beforeEach((done) => {
        const cameraParam = new artoolkit.ARCameraParamNFT('./examples/Data/camera_para.dat', () => {
            arController = new artoolkit.ARControllerNFT(640, 480, cameraParam);
            done();
        }, (err) => {
            fail(err);
            done();
        });
    });

    afterEach(() => {
        if (arController && typeof arController.dispose === 'function') {
            arController.dispose();
            arController = null;
        }
    });
    it('should be initialized', () => {
        expect(arController).toBeDefined();
        expect(arController.id).toBeGreaterThanOrEqual(0);
    });

    it('should have all expected methods', () => {
        expect(typeof arController.process).toBe('function');
        expect(typeof arController.detectNFTMarker).toBe('function');
        expect(typeof arController.trackNFTMarkerId).toBe('function');
        expect(typeof arController.loadNFTMarker).toBe('function');
        expect(typeof arController.loadNFTMarkers).toBe('function');
        expect(typeof arController.addEventListener).toBe('function');
        expect(typeof arController.removeEventListener).toBe('function');
        expect(typeof arController.dispatchEvent).toBe('function');
        expect(typeof arController.getNFTMarker).toBe('function');
        expect(typeof arController.getNFTData).toBe('function');
        expect(typeof arController.getTransformationMatrix).toBe('function');
        expect(typeof arController.getCameraMatrix).toBe('function');
        expect(typeof arController.setDebugMode).toBe('function');
        expect(typeof arController.getDebugMode).toBe('function');
        expect(typeof arController.setLogLevel).toBe('function');
        expect(typeof arController.getLogLevel).toBe('function');
        expect(typeof arController.dispose).toBe('function');
    });

    it('getCameraMatrix should return a valid matrix', () => {
        const cameraMatrix = arController.getCameraMatrix();
        expect(cameraMatrix).toBeTruthy();
        expect(Array.isArray(cameraMatrix)).toBe(true);
        expect(cameraMatrix.length).toBe(16);
    });

    it('getTransformationMatrix should return a valid matrix', () => {
        const transformMatrix = arController.getTransformationMatrix();
        expect(transformMatrix).toBeTruthy();
        expect(Object.prototype.toString.call(transformMatrix)).toBe('[object Float32Array]');
        expect(transformMatrix.length).toBe(16);
    });

    it('should allow setting and getting the projection near plane', () => {
        const nearPlane = 123.45;
        arController.setProjectionNearPlane(nearPlane);
        expect(arController.getProjectionNearPlane()).toBeCloseTo(nearPlane, 2);
    });

    it('should allow setting and getting the projection far plane', () => {
        const farPlane = 543.21;
        arController.setProjectionFarPlane(farPlane);
        expect(arController.getProjectionFarPlane()).toBeCloseTo(farPlane, 2);
    });
});
