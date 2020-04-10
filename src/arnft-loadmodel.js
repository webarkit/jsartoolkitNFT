ARnft.prototype.loadModel = function (url, x, y, z, scale) {
  var root = this.root;
  var model;

  /* Load Model */
  var threeGLTFLoader = new THREE.GLTFLoader();

  threeGLTFLoader.load(url, function (gltf) {
    model = gltf.scene;
    model.scale.set(scale, scale, scale);
    model.rotation.x = Math.PI / 2;
    model.position.x = x;
    model.position.y = y;
    model.position.z = z;

    model.matrixAutoUpdate = false;
    root.add(model);
  });
};
