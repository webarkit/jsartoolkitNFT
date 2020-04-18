ARnft._teardownVideo = function (video) {
    video.srcObject.getVideoTracks()[0].stop();
    video.srcObject = null;
    video.src = null;
};
