var interpolationFactor = 24;

var trackedMatrix = {
  // for interpolation
  delta: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
  ],
  interpolated: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
  ]
};

var setMatrix = function (matrix, value) {
  var array = [];
  for (var key in value) {
      array[key] = value[key];
  }
  if (typeof matrix.elements.set === "function") {
      matrix.elements.set(array);
  } else {
      matrix.elements = [].slice.call(array);
  }
};
