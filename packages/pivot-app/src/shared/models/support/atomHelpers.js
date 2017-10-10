import { atom as $atom } from '@graphistry/falcor-json-graph';

export function deatomify(atom) {
  if (typeof atom === 'object' && atom.$type === 'atom') {
    return atom.value;
  } else {
    return atom;
  }
}

export function atomify(object) {
  return typeof object === 'object' ? $atom(object) : object;
}
