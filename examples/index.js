let sourceVideo;
let targetCanvas;

async function initCamera() {

  const constraints = {
    audio: false,
    video: {
      // using the "environment" rear camera
      facingMode: "environment",
      // using the "user" front camera
      // facingMode: "user",
      width: 640,
      height: 480
    }
  };

  // initialize video source
  const video = document.querySelector("#video");
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
};

function initTargetCanvas() {
  // target canvas should overlap source video
  targetCanvas = document.querySelector("#canvas");
  targetCanvas.width = sourceVideo.width;
  targetCanvas.height = sourceVideo.height;
}
