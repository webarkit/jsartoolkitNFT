var ARnft = function (width, height, config) {
  this.width = width;
  this.height = height;
  this.root = new THREE.Object3D();
  this.root.matrixAutoUpdate = false;
  this.config = config;
  this.listeners = {};
  this.version = '0.3.0';
  console.log('ARnft ', this.version);
};
