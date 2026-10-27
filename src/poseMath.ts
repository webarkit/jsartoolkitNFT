/*
 *  poseMath.ts
 *  JSARToolKitNFT
 *
 *  Pure pose-matrix conversions, shared by both controllers and the tracker
 *  facade (#720).
 *
 *  Why one copy (#720 D9): the facade must return the same GL matrix as the
 *  controller's `matrixGL_RH` event field, and the anti-goal is that the two
 *  APIs' poses match. A second copy of these bodies could drift apart silently.
 *  The bodies below were moved from ARControllerNFTBase / ARControllerNFT_node
 *  unchanged; the controllers keep their public methods as one-line delegates.
 */

/**
 * Converts the given 3x4 marker transformation matrix in the 12-element transMat array
 * into a 4x4 WebGL matrix and writes the result into the 16-element glMat array.
 * If scale parameter is given, scales the transform of the glMat by the scale parameter.
 * @param {Float64Array} transMat The 3x4 marker transformation matrix.
 * @param {Float64Array} [glMat] The 4x4 GL transformation matrix.
 * @param {number} [scale] The scale for the transform.
 * @return {Float64Array} the modified matrix
 */
export function transMatToGLMat(
  transMat: Float64Array,
  glMat?: Float64Array,
  scale?: number,
): Float64Array {
  if (glMat == undefined) {
    glMat = new Float64Array(16);
  }

  glMat[0 + 0 * 4] = transMat[0]; // R1C1
  glMat[0 + 1 * 4] = transMat[1]; // R1C2
  glMat[0 + 2 * 4] = transMat[2];
  glMat[0 + 3 * 4] = transMat[3];
  glMat[1 + 0 * 4] = transMat[4]; // R2
  glMat[1 + 1 * 4] = transMat[5];
  glMat[1 + 2 * 4] = transMat[6];
  glMat[1 + 3 * 4] = transMat[7];
  glMat[2 + 0 * 4] = transMat[8]; // R3
  glMat[2 + 1 * 4] = transMat[9];
  glMat[2 + 2 * 4] = transMat[10];
  glMat[2 + 3 * 4] = transMat[11];
  glMat[3 + 0 * 4] = 0.0;
  glMat[3 + 1 * 4] = 0.0;
  glMat[3 + 2 * 4] = 0.0;
  glMat[3 + 3 * 4] = 1.0;

  if (scale != undefined && scale !== 0.0) {
    glMat[12] *= scale;
    glMat[13] *= scale;
    glMat[14] *= scale;
  }
  return glMat;
}

/**
 * Converts the given 4x4 openGL matrix in the 16-element transMat array
 * into a 4x4 OpenGL Right-Hand-View matrix and writes the result into the 16-element glMat array.
 * If scale parameter is given, scales the transform of the glMat by the scale parameter.
 * @param {Float64Array} glMatrix The 4x4 marker transformation matrix.
 * @param {Float64Array} [glRhMatrix] The 4x4 GL right hand transformation matrix.
 * @param {number} [scale] The scale for the transform.
 * @return {Float64Array} the modified gl matrix
 */
export function arglCameraViewRHf(
  glMatrix: Float64Array,
  glRhMatrix?: Float64Array,
  scale?: number,
): Float64Array {
  let m_modelview;
  if (glRhMatrix == undefined) {
    m_modelview = new Float64Array(16);
  } else {
    m_modelview = glRhMatrix;
  }

  // x
  m_modelview[0] = glMatrix[0];
  m_modelview[4] = glMatrix[4];
  m_modelview[8] = glMatrix[8];
  m_modelview[12] = glMatrix[12];
  // y
  m_modelview[1] = -glMatrix[1];
  m_modelview[5] = -glMatrix[5];
  m_modelview[9] = -glMatrix[9];
  m_modelview[13] = -glMatrix[13];
  // z
  m_modelview[2] = -glMatrix[2];
  m_modelview[6] = -glMatrix[6];
  m_modelview[10] = -glMatrix[10];
  m_modelview[14] = -glMatrix[14];

  // 0 0 0 1
  m_modelview[3] = 0;
  m_modelview[7] = 0;
  m_modelview[11] = 0;
  m_modelview[15] = 1;

  if (scale != undefined && scale !== 0.0) {
    m_modelview[12] *= scale;
    m_modelview[13] *= scale;
    m_modelview[14] *= scale;
  }

  glRhMatrix = m_modelview;

  return glRhMatrix;
}
