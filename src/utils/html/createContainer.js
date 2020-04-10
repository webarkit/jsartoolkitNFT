function createContainer () {
  var container = document.createElement('div');
  container.id = 'app';
  var canvas = document.createElement('canvas');
  canvas.id = 'canvas';
  var video = document.createElement('video');
  video.id = 'video';
  video.setAttribute('autoplay', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  container.appendChild(video);
  container.appendChild(canvas);
  var loading = document.getElementById('loading');
  document.body.insertBefore(container, loading);
  var obj = { container: container, canvas: canvas, video: video };
  return obj;
}
