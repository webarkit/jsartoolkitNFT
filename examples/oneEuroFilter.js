class LowPassFilter {
  constructor(alpha) {
    this.setAlpha(alpha);
    this.y = null;
    this.s = null;
  }

  setAlpha(alpha) {
    if (alpha <= 0 || alpha > 1.0) {
      throw new Error();
    }
    this.alpha = alpha;
  }

  filter(value, timestamp, alpha) {
    if (alpha) {
      this.setAlpha(alpha);
    }
    let s;
    if (!this.y) {
      s = value;
    } else {
      s = this.alpha * value + ( 1.0 - this.alpha ) * this.s;
    }
    this.y = value;
    this.s = s;
    return s;
  }

  lastValue() {
    return this.y;
  }
}

class OneEuroFilter {
  constructor(freq, minCutOff=1.0, beta=0.0, dCutOff=1.0) {
    if (freq <= 0 || minCutOff <= 0 || dCutOff <= 0) {
      throw new Error();
    }
    this.freq = freq;
    this.minCutOff = minCutOff;
    this.beta = beta;
    this.dCutOff = dCutOff;
    this.x = new LowPassFilter(this.alpha(this.minCutOff));
    this.dx = new LowPassFilter(this.alpha(this.dCutOff));
    this.lasttime = null;
  }

  alpha(cutOff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / ( 2 * Math.PI * cutOff );
    return 1.0 / ( 1.0 + tau / te );
  }

  filter(x, timestamp=null) {
    if (this.lasttime && timestamp) {
      this.freq = 1.0 / ( timestamp - this.lasttime );
    }
    this.lasttime = timestamp;
    const prevX = this.x.lastValue();
    const dx = (!prevX) ? 0.0 : ( x - prevX ) * this.freq;
    const edx = this.dx.filter(dx, timestamp, this.alpha(this.dCutOff));
    const cutOff = this.minCutOff + this.beta * Math.abs(edx);
    return this.x.filter(x, timestamp, this.alpha(cutOff));
  }
}
