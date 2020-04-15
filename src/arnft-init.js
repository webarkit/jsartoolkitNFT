ARnft.prototype.init = function (markerUrl, stats) {
  var cameraParam = this.cameraPara;
  var root = this.root;
  var config = this.config;
  var data = jsonParser(config);

  data.then(function (configData) {
    createLoading(configData);
    createStats(stats);
    var containerObj = createContainer();
    var container = containerObj.container;
    var canvas = containerObj.canvas;
    var video = containerObj.video;

    var statsMain, statsWorker;

    if (stats) {
      statsMain = new Stats();
      statsMain.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      document.getElementById('stats1').appendChild(statsMain.dom);

      statsWorker = new Stats();
      statsWorker.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      document.getElementById('stats2').appendChild(statsWorker.dom);
    }

    var statsObj = {
      statsMain: statsMain,
      statsWorker: statsWorker,
      stats: stats
    };

    getUserMedia (container, markerUrl, video, canvas, root, statsObj, configData)
  });
};
