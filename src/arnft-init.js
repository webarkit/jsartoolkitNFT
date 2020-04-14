ARnft.prototype.init = function (markerUrl, stats) {
  var cameraParam = this.cameraPara;
  var root = this.root;
  var config = this.config;
  var data = jsonParser(config);
  var obj = {};

  data.then(function (configData) {
    createLoading(configData);
    createStats(stats);
    var containerObj = createContainer();
    var container = containerObj.container;
    var canvas = containerObj.canvas;
    var video = containerObj.video;

    if (stats) {
      var statsMain = new Stats();
      statsMain.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      document.getElementById('stats1').appendChild(statsMain.dom);

      var statsWorker = new Stats();
      statsWorker.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      document.getElementById('stats2').appendChild(statsWorker.dom);
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      var hint = {
        audio: false,
        video: true
      };

      if (window.innerWidth < 800) {
        hint = {
          audio: false,
          video: {
            width: { ideal: this.width },
            height: { ideal: this.height },
            facingMode:
              {
                exact:
                  'environment'
              }
          }
        };
      }

      navigator.mediaDevices.getUserMedia(hint).then(function (stream) {
        video.srcObject = stream;
        video.addEventListener('loadedmetadata', function () {
          video.play();

        obj = start(
            container,
            markerUrl,
            video,
            video.videoWidth,
            video.videoHeight,
            canvas,
            function () {
              if (stats) {
                statsMain.update();
              }
            },
            function () {
              if (stats) {
                statsWorker.update();
              }
            },
            root,
            configData
          )
          console.log(m_obj);
          this.obj = m_obj;
          console.log(this.obj);
        });

      }).catch(function (err) {
        console.log(err.name + ': ' + err.message);
      });
    }
  });
  return obj;
};
