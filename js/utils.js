function _applyMarkerData(modelViewTransform, markerData) {
    const openGLWorldMatrix = [
        modelViewTransform[0], modelViewTransform[1], modelViewTransform[2], modelViewTransform[3],
        modelViewTransform[4], modelViewTransform[5], modelViewTransform[6], modelViewTransform[7],
        modelViewTransform[8], modelViewTransform[9], modelViewTransform[10], modelViewTransform[11],
        modelViewTransform[12] + ((markerData.width / markerData.dpi) * 2.54 * 10) / 2.0, modelViewTransform[13] + ((markerData.height / markerData.dpi) * 2.54 * 10) / 2.0, modelViewTransform[14], 1
    ];
    return openGLWorldMatrix;
}