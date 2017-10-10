import { sprintf } from 'sprintf-js';
import { maybePrecise } from './maybePrecise';

export function formatNumber(value, short = false, precision = 4) {
  if (!short) {
    return sprintf('%.4f', value);
  }
  const abs = Math.abs(value);
  if (abs > 1e12 || (value !== 0 && abs < 1e-5)) {
    return String(value.toExponential(precision));
  } else if (abs > 1e9) {
    return maybePrecise(value / 1e9, precision) + 'B';
  } else if (abs > 1e6) {
    return maybePrecise(value / 1e6, precision) + 'M';
  } else if (abs > 1e3) {
    return maybePrecise(value / 1e3, precision) + 'K';
  } else if (abs > Math.pow(10, -precision) && abs < 1) {
    return value.toFixed(precision);
  } else {
    value = Math.round(value * 1e6) / 1e6; // Kill rounding errors
    return String(value);
  }
}
