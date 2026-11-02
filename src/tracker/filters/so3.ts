/**
 * Rotations for the oneEuro pose filter (#766), which smooths a rotation's step in its tangent
 * space instead of its 9 matrix entries. A 3×3 matrix is a column-major Float64Array(9):
 * `m[c * 3 + r]`, the layout of the pose's upper 3×3. A rotation vector is a Float64Array(3):
 * the axis times the angle in radians. Every function writes into an array the caller owns, so
 * filtering allocates nothing.
 */

/** Below this angle, `logSO3` returns `sin θ · axis` as the vector: exact to about 1e-13. */
const SMALL_LOG = 1e-6;
/** Below this angle, `expSO3` uses the series of `sin θ / θ` and `(1 − cos θ) / θ²`. */
const SMALL_EXP = 1e-4;

/**
 * The rotation vector of `m`, with its angle in [0, π]. `m` should be a rotation; for any
 * other matrix the result is finite but meaningless.
 */
export function logSO3(m: Float64Array, out: Float64Array): Float64Array {
  const c = Math.min(1, Math.max(-1, (m[0] + m[4] + m[8] - 1) / 2));
  // The antisymmetric part: sin θ times the axis.
  const vx = (m[5] - m[7]) / 2;
  const vy = (m[6] - m[2]) / 2;
  const vz = (m[1] - m[3]) / 2;
  const s = Math.hypot(vx, vy, vz);
  const angle = Math.atan2(s, c);
  if (angle < SMALL_LOG) {
    out[0] = vx;
    out[1] = vy;
    out[2] = vz;
  } else if (c > 0) {
    const k = angle / s;
    out[0] = vx * k;
    out[1] = vy * k;
    out[2] = vz * k;
  } else {
    // From π/2 to π, sin θ loses the axis; the symmetric part keeps it:
    // (m + mᵀ) / 2 = c·I + (1 − c)·a·aᵀ. Take the largest component first, for precision.
    const d = 1 - c;
    const diag = [m[0], m[4], m[8]];
    let k = 0;
    if (diag[1] > diag[k]) k = 1;
    if (diag[2] > diag[k]) k = 2;
    const a = [0, 0, 0];
    a[k] = Math.sqrt(Math.max(0, (diag[k] - c) / d));
    for (let j = 0; j < 3; j++) {
      // (m_jk + m_kj) / 2 = (1 − c) a_j a_k
      if (j !== k) a[j] = (m[k * 3 + j] + m[j * 3 + k]) / (2 * d * a[k]);
    }
    // The symmetric part fixes the axis up to its sign; sin θ · axis fixes the sign.
    const sign = a[0] * vx + a[1] * vy + a[2] * vz < 0 ? -1 : 1;
    const n = Math.hypot(a[0], a[1], a[2]);
    for (let j = 0; j < 3; j++) out[j] = (sign * angle * a[j]) / n;
  }
  // A matrix that is not a rotation can give 0 / 0: keep the result finite.
  if (!(
    Number.isFinite(out[0]) &&
    Number.isFinite(out[1]) &&
    Number.isFinite(out[2])
  )) {
    out[0] = out[1] = out[2] = 0;
  }
  return out;
}

/** The rotation of vector `w` (Rodrigues), into `out` (9 values). */
export function expSO3(w: Float64Array, out: Float64Array): Float64Array {
  const x = w[0];
  const y = w[1];
  const z = w[2];
  const t2 = x * x + y * y + z * z;
  const t = Math.sqrt(t2);
  let a: number;
  let b: number;
  if (t < SMALL_EXP) {
    a = 1 - t2 / 6;
    b = 0.5 - t2 / 24;
  } else {
    a = Math.sin(t) / t;
    b = (1 - Math.cos(t)) / t2;
  }
  // R = I + a·[w]× + b·[w]×², with [w]×² = w·wᵀ − |w|²·I.
  out[0] = 1 + b * (x * x - t2);
  out[1] = a * z + b * x * y;
  out[2] = -a * y + b * x * z;
  out[3] = -a * z + b * x * y;
  out[4] = 1 + b * (y * y - t2);
  out[5] = a * x + b * y * z;
  out[6] = a * y + b * x * z;
  out[7] = -a * x + b * y * z;
  out[8] = 1 + b * (z * z - t2);
  return out;
}

/**
 * One Newton iteration towards the nearest rotation, in place: `m ← (m + m⁻ᵀ) / 2`. A rotation
 * is a fixed point; the filter applies one step per update so that rounding cannot accumulate
 * into scale or shear over a long run. A singular matrix is left as it is.
 */
export function polarStep(m: Float64Array): Float64Array {
  // det · m⁻ᵀ has the columns c1 × c2, c2 × c0, c0 × c1.
  const c00 = m[4] * m[8] - m[5] * m[7];
  const c01 = m[5] * m[6] - m[3] * m[8];
  const c02 = m[3] * m[7] - m[4] * m[6];
  const c10 = m[7] * m[2] - m[8] * m[1];
  const c11 = m[8] * m[0] - m[6] * m[2];
  const c12 = m[6] * m[1] - m[7] * m[0];
  const c20 = m[1] * m[5] - m[2] * m[4];
  const c21 = m[2] * m[3] - m[0] * m[5];
  const c22 = m[0] * m[4] - m[1] * m[3];
  const det = m[0] * c00 + m[1] * c01 + m[2] * c02;
  if (!(Math.abs(det) > 0) || !Number.isFinite(det)) return m;
  const h = 0.5 / det;
  m[0] = m[0] / 2 + c00 * h;
  m[1] = m[1] / 2 + c01 * h;
  m[2] = m[2] / 2 + c02 * h;
  m[3] = m[3] / 2 + c10 * h;
  m[4] = m[4] / 2 + c11 * h;
  m[5] = m[5] / 2 + c12 * h;
  m[6] = m[6] / 2 + c20 * h;
  m[7] = m[7] / 2 + c21 * h;
  m[8] = m[8] / 2 + c22 * h;
  return m;
}
