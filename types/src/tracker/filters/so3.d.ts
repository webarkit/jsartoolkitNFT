/**
 * Rotations for the oneEuro pose filter (#766), which smooths a rotation's step in its tangent
 * space instead of its 9 matrix entries. A 3×3 matrix is a column-major Float64Array(9):
 * `m[c * 3 + r]`, the layout of the pose's upper 3×3. A rotation vector is a Float64Array(3):
 * the axis times the angle in radians. Every function writes into an array the caller owns, so
 * filtering allocates nothing.
 */
/**
 * The rotation vector of `m`, with its angle in [0, π]. `m` should be a rotation; for any
 * other matrix the result is finite but meaningless.
 */
export declare function logSO3(m: Float64Array, out: Float64Array): Float64Array;
/** The rotation of vector `w` (Rodrigues), into `out` (9 values). */
export declare function expSO3(w: Float64Array, out: Float64Array): Float64Array;
/**
 * One Newton iteration towards the nearest rotation, in place: `m ← (m + m⁻ᵀ) / 2`. A rotation
 * is a fixed point; the filter applies one step per update so that rounding cannot accumulate
 * into scale or shear over a long run. A singular matrix is left as it is.
 */
export declare function polarStep(m: Float64Array): Float64Array;
