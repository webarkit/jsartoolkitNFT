// code taken from ARController.getUserMedia from https://github.com/artoolkitx/jsartoolkit5/
function getUserMedia (container, markerUrl, video, canvas, root, statsObj, configData) {

  var facing = configData.videoSettings.facingMode || 'environment';

  var onError = configData.onError || function (err) { console.error("ARnft internal getUserMedia", err); };

  var readyToPlay = false;
  var eventNames = [
    'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'click', 'mousedown', 'mouseup', 'mousemove',
    'keydown', 'keyup', 'keypress', 'scroll'
  ];
  var play = function () {
    if (readyToPlay) {
      video.play().then(function () {

      start(
          container,
          markerUrl,
          video,
          video.videoWidth,
          video.videoHeight,
          canvas,
          function () {
            if (statsObj.stats) {
              statsObj.statsMain.update();
            }
          },
          function () {
            if (statsObj.stats) {
              statsObj.statsWorker.update();
            }
          },
          root,
          configData
        );
      }).catch(function (error) {
        onError(error);
        ARnft._teardownVideo(video);
      });
      if (!video.paused) {
        eventNames.forEach(function (eventName) {
          window.removeEventListener(eventName, play, true);
        });
      }
    }
  };
  eventNames.forEach(function (eventName) {
    window.addEventListener(eventName, play, true);
  });

  var success = function (stream) {
    // DEPRECATED: don't use window.URL.createObjectURL(stream) any longer it might be removed soon. Only there to support old browsers src: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
    if (window.URL.createObjectURL) {
      // Need to add try-catch because iOS 11 fails to createObjectURL from stream. As this is deprecated  we should remove this soon
      try {
        video.srcObject = stream; // DEPRECATED: this feature is in the process to being deprecated
      }
      catch (ex) {
        // Nothing todo, the purpose of this is to remove an error from the console on iOS 11
      }
    }
    video.srcObject = stream; // This should be used instead. Which has the benefit to give us access to the stream object
    readyToPlay = true;
    video.autoplay = true;
    video.playsInline = true;
    play(); // Try playing without user input, should work on non-Android Chrome
  };

  var constraints = {};
  var mediaDevicesConstraints = {};
  if (configData.videoSettings.width) {
    mediaDevicesConstraints.width = configData.videoSettings.width;
    if (typeof configData.videoSettings.width === 'object') {
      if (configData.videoSettings.width.max) {
        constraints.maxWidth = configData.videoSettings.width.max;
      }
      if (configData.videoSettings.width.min) {
        constraints.minWidth = configData.videoSettings.width.min;
      }
    } else {
      constraints.maxWidth = configData.videoSettings.width;
    }
  }

  if (configData.videoSettings.height) {
    mediaDevicesConstraints.height = configData.videoSettings.height;
    if (typeof configData.videoSettings.height === 'object') {
      if (configData.videoSettings.height.max) {
        constraints.maxHeight = configData.videoSettings.height.max;
      }
      if (configData.videoSettings.height.min) {
        constraints.minHeight = configData.videoSettings.height.min;
      }
    } else {
      constraints.maxHeight = configData.videoSettings.height;
    }
  }

  mediaDevicesConstraints.facingMode = facing;
  mediaDevicesConstraints.deviceId = configData.videoSettings.deviceId;

  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  var hdConstraints = {
    audio: false,
    video: constraints
  };

  if (navigator.mediaDevices || window.MediaStreamTrack.getSources) {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: mediaDevicesConstraints
      }).then(success, onError);
    } else {
      // This function of accessing the media device is deprecated and outdated and shouldn't be used anymore.
      window.MediaStreamTrack.getSources(function (sources) {
        var facingDir = mediaDevicesConstraints.facingMode;
        if (facing && facing.exact) {
          facingDir = facing.exact;
        }
        for (var i = 0; i < sources.length; i++) {
          if (sources[i].kind === 'video' && sources[i].facing === facingDir) {
            hdConstraints.video.mandatory.sourceId = sources[i].id;
            break;
          }
        }
        if (facing && facing.exact && !hdConstraints.video.mandatory.sourceId) {
          onError('Failed to get camera facing the wanted direction');
        } else {
          if (navigator.getUserMedia) {
            navigator.getUserMedia(hdConstraints, success, onError);
          } else {
            onError('navigator.getUserMedia is not supported on your browser');
          }
        }
      });
    }
  } else {
    if (navigator.getUserMedia) {
      navigator.getUserMedia(hdConstraints, success, onError);
    } else {
      onError('navigator.getUserMedia is not supported on your browser');
    }
  }
}
