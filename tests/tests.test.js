describe('ARControllerNFT', () => {
    let arController;

    // Use a single, unified beforeAll hook to handle all asynchronous setup.
    // This eliminates race conditions and ensures everything is initialized in the correct order.
    beforeAll((done) => {
        // 1. Poll until the Emscripten runtime is ready.
        const interval = setInterval(() => {
            if (window.artoolkitNFT && window.artoolkitNFT.setup) {
                clearInterval(interval);

                // 2. Once the runtime is ready, create the ARControllerNFT instance.
                arController = new ARControllerNFT(640, 480, './examples/Data/camera_para.dat');

                // 3. Wait for the controller's internal onload event.
                arController.onload = () => {
                    // 4. Signal that all setup is complete.
                    done();
                };

                arController.onerror = (err) => {
                    fail(err);
                    done();
                };
            }
        }, 100);
    }, 20000); // A generous 20-second timeout for the entire setup process.

    // Dispose of the single controller instance at the very end.
    afterAll(() => {
        if (arController) {
            arController.dispose();
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

    it('event listeners should work correctly', () => {
        let eventFired = false;

        const testCallback = (event) => {
            eventFired = true;
            expect(event.name).toBe('testEvent');
            expect(event.target).toBe(arController);
        };

        arController.addEventListener('testEvent', testCallback);
        arController.dispatchEvent({ name: 'testEvent', target: arController });

        expect(eventFired).toBe(true);

        arController.removeEventListener('testEvent', testCallback);
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

    it('debug mode should be toggleable', () => {
        arController.setDebugMode(true);
        expect(arController.getDebugMode()).toBeTruthy();

        arController.setDebugMode(false);
        expect(arController.getDebugMode()).toBeFalsy();
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
