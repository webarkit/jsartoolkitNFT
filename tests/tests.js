QUnit.module('ARCameraParaNFT');
QUnit.test('Create object and load camera parameter', function (assert) {
  const cParaUrl = './camera_para.dat';
  const done = assert.async();
  const success = function () {
    assert.ok(true, 'Successfully loaded camera para');
    done();
  }
  const error = function () {
    assert.ok(false, 'Failed loading camera para');
    done();
  }
  const cameraPara = new ARCameraParamNFT(cParaUrl, success, error, false);
  assert.equal(cameraPara.src, cParaUrl, 'Camera para URL is equal to: ' + cParaUrl);
});
QUnit.test('Create object and fail to load camera parameter', function (assert) {
  const cParaUrl = './camera_para_error.dat';
  const done = assert.async();
  const success = function () {
    assert.ok(false, 'Successfully loaded camera para');
    done();
  }
  const error = function () {
    assert.ok(true, 'Failed loading camera para');
    done();
  }
  const cameraPara = new ARCameraParamNFT(cParaUrl, success, error, false);
});
QUnit.test('Try to load twice', assert => {
  const cParaUrl = './camera_para_error.dat';
  const success = function () {
  }
  const error = function () {
  }
  const cameraPara = new ARCameraParamNFT(cParaUrl, success, error);

  assert.throws(() => { cameraPara.load('./camera_para.dat') }, 'Throws an error that calibration tried to load twice');
});
QUnit.test('Try to load twice but empty existing ARCameraParamNFT before loading', assert => {
  const cParaUrl = './camera_para_error.dat';
  const success = function () {
  }
  const error = function () {
  }
  const cameraPara = new ARCameraParamNFT(cParaUrl, success, error);
  cameraPara.dispose();
  assert.deepEqual('', cameraPara.src);

  const cameraParaString = './camera_para.dat';
  cameraPara.load(cameraParaString);
  assert.deepEqual(cameraParaString, cameraPara.src, 'load after dispose should work');
});

/* #### ARController Module #### */
QUnit.module('ARControllerNFT', {
  beforeEach: assert => {
    this.timeout = 5000;
    this.cleanUpTimeout = 500;
    this.cParaUrl = './camera_para.dat';
    this.checkDefault = (arController) => {
      assert.ok(arController);
      assert.deepEqual(arController.orientation, 'landscape', 'Check the default values: landscape');
      assert.deepEqual(arController.listeners, {}, 'Check the default values: listeners');
      assert.deepEqual(arController.transform_mat, new Float32Array(16), 'Check the default values: transform_mat');
      assert.ok(arController.canvas, 'Check the default values: canvas');
      assert.ok(arController.ctx, 'Check the default values: ctx');
    }
  }
});
QUnit.test('Create ARControllerNFT default', assert => {
  const videoWidth = 640; const videoHeight = 480;
  const done = assert.async();
  assert.timeout(this.timeout);
  const success = () => {
    const arController = new ARControllerNFT(videoWidth, videoHeight, cameraPara);
    this.checkDefault(arController);

    arController.onload = (err) => {
      assert.notOk(err, 'no error');
      assert.ok(true, 'successfully loaded');

      assert.deepEqual(arController.cameraParam, cameraPara, 'Check the default values: cameraPara');
      assert.deepEqual(arController.videoWidth, videoWidth, 'Check the default values: videoWidth');
      assert.deepEqual(arController.videoHeight, videoHeight, 'Check the default values: videoHeight');
      assert.notOk(arController.image, 'Check the default values: image === undefined');

      assert.deepEqual(arController.canvas.width, videoWidth, 'Check the default values: canvas.width');
      assert.deepEqual(arController.canvas.height, videoHeight, 'Check the default values: canvas.height');
      setTimeout(() => {
        arController.dispose();
        done();
      }
      , this.cleanUpTimeout);
    };
  }
  const error = function () {
    assert.ok(false);
  }
  const cameraPara = new ARCameraParamNFT(this.cParaUrl, success, error);
});
