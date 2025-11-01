describe("ARControllerNFT", () => {
  let arController;

  // Create a single ARControllerNFT instance for the entire test suite.
  // This avoids re-initialization issues with the Emscripten runtime.
  beforeAll((done) => {
    window.addEventListener("artoolkitNFT-loaded", () => {
      arController = new ARControllerNFT(
        640,
        480,
        "./examples/Data/camera_para.dat",
      );
      arController.onload = () => {
        done();
      };
      arController.onerror = (err) => {
        fail(err);
        done();
      };
    });
  }, 15000); // 15-second timeout for loading the module and controller

  // Dispose of the single controller instance at the very end.
  afterAll(() => {
    if (arController) {
      arController.dispose();
    }
  });

  it("should be initialized", () => {
    expect(arController).toBeDefined();
    expect(arController.id).toBeGreaterThanOrEqual(0);
  });

  it("should have all expected methods", () => {
    expect(typeof arController.process).toBe("function");
    expect(typeof arController.detectNFTMarker).toBe("function");
    expect(typeof arController.trackNFTMarkerId).toBe("function");
    expect(typeof arController.loadNFTMarker).toBe("function");
    expect(typeof arController.loadNFTMarkers).toBe("function");
    expect(typeof arController.addEventListener).toBe("function");
    expect(typeof arController.removeEventListener).toBe("function");
    expect(typeof arController.dispatchEvent).toBe("function");
    expect(typeof arController.getNFTMarker).toBe("function");
    expect(typeof arController.getNFTData).toBe("function");
    expect(typeof arController.getTransformationMatrix).toBe("function");
    expect(typeof arController.getCameraMatrix).toBe("function");
    expect(typeof arController.setDebugMode).toBe("function");
    expect(typeof arController.getDebugMode).toBe("function");
    expect(typeof arController.setLogLevel).toBe("function");
    expect(typeof arController.getLogLevel).toBe("function");
    expect(typeof arController.dispose).toBe("function");
  });

  it("event listeners should work correctly", () => {
    let eventFired = false;

    const testCallback = (event) => {
      eventFired = true;
      expect(event.name).toBe("testEvent");
      expect(event.target).toBe(arController);
    };

    arController.addEventListener("testEvent", testCallback);
    arController.dispatchEvent({ name: "testEvent", target: arController });

    expect(eventFired).toBe(true);

    arController.removeEventListener("testEvent", testCallback);
  });

  it("getCameraMatrix should return a valid matrix", () => {
    const cameraMatrix = arController.getCameraMatrix();

    expect(cameraMatrix).toBeTruthy();
    // The Emscripten binding returns a plain Array for this function.
    expect(Array.isArray(cameraMatrix)).toBe(true);
    expect(cameraMatrix.length).toBe(16);
  });

  it("getTransformationMatrix should return a valid matrix", () => {
    const transformMatrix = arController.getTransformationMatrix();

    expect(transformMatrix).toBeTruthy();
    // Use a more robust type check for arrays from different script contexts
    expect(Object.prototype.toString.call(transformMatrix)).toBe(
      "[object Float32Array]",
    );
    expect(transformMatrix.length).toBe(16);
  });

  it("debug mode should be toggleable", () => {
    arController.setDebugMode(true);
    // The C++ module returns 1/0 for booleans, so we use truthy/falsy checks.
    expect(arController.getDebugMode()).toBeTruthy();

    arController.setDebugMode(false);
    expect(arController.getDebugMode()).toBeFalsy();
  });
});
