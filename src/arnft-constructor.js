var ARnft = function (width, height, config) {
  this.width = width;
  this.height = height;
  this.root = new THREE.Object3D();
  this.root.matrixAutoUpdate = false;
  this.config = config;
  this.version = '0.4.1';
  console.log('ARnft ', this.version);
};
