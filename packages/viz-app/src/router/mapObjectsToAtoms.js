const { isArray } = Array;
import Color from 'color';
import { $atom } from '@graphistry/falcor-json-graph';

export function mapObjectsToAtoms(incoming = {}) {
  if (incoming.isMessage || incoming.invalidated) {
    return incoming;
  }
  let { value } = incoming;
  if (value !== null) {
    if (value === undefined) {
      value = $atom(value);
    } else if (typeof value === 'object') {
      if (value instanceof Color) {
        value = value.rgbaString();
      } else if (isArray(value)) {
        value = $atom(value);
      } else if (value.$type === undefined) {
        value = $atom(value);
      }
    }
  }
  return { ...incoming, value };
}

Color.prototype.toJSON = function() {
  return this.rgbaString();
};
