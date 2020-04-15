let markW, markH, dpi, m_obj;

var ARnft = function (width, height, config) {
  this.width = width;
  this.height = height;
  this.root = new THREE.Object3D();
  this.root.matrixAutoUpdate = false;
  this.listeners = {};
  this.markerNFTwidth = 0;
  this.markerNFTheigth = 0;
  this.markerNFTdpi = 0;
  this.obj = {};
  this.config = config;
};
