/**
 * Calculate significant figures on this as a radix.
 * @param {Number} v
 * @param {Number} significantFigures
 * @returns {String}
 */
export function maybePrecise(v, significantFigures) {
  if (v === Math.floor(v)) {
    return v.toString();
  }
  let remainder = Math.abs(v),
    precision = significantFigures;
  while (remainder > 1 && precision > 0) {
    remainder /= 10;
    precision--;
  }
  // Cut out trailing zeroes beyond the decimal point:
  let printed = v.toFixed(precision),
    printedOneLessDigit = v.toFixed(precision - 1);
  while (precision > 1 && Number(printedOneLessDigit) === Number(printed)) {
    printed = printedOneLessDigit;
    precision--;
    printedOneLessDigit = v.toFixed(precision - 1);
  }
  return printed;
}
