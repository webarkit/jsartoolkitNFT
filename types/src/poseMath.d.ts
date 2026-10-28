/**
 * Converts the given 3x4 marker transformation matrix in the 12-element transMat array
 * into a 4x4 WebGL matrix and writes the result into the 16-element glMat array.
 * If scale parameter is given, scales the transform of the glMat by the scale parameter.
 * @param {Float64Array} transMat The 3x4 marker transformation matrix.
 * @param {Float64Array} [glMat] The 4x4 GL transformation matrix.
 * @param {number} [scale] The scale for the transform.
 * @return {Float64Array} the modified matrix
 */
export declare function transMatToGLMat(transMat: Float64Array, glMat?: Float64Array, scale?: number): Float64Array;
/**
 * Converts the given 4x4 openGL matrix in the 16-element transMat array
 * into a 4x4 OpenGL Right-Hand-View matrix and writes the result into the 16-element glMat array.
 * If scale parameter is given, scales the transform of the glMat by the scale parameter.
 * @param {Float64Array} glMatrix The 4x4 marker transformation matrix.
 * @param {Float64Array} [glRhMatrix] The 4x4 GL right hand transformation matrix.
 * @param {number} [scale] The scale for the transform.
 * @return {Float64Array} the modified gl matrix
 */
export declare function arglCameraViewRHf(glMatrix: Float64Array, glRhMatrix?: Float64Array, scale?: number): Float64Array;
