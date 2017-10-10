import { ref as $ref } from '@graphistry/falcor-json-graph';

export function axis(view) {
  return {
    axis: {
      id: 'axis',
      name: 'Axis',
      encodings: $ref(`${view}.encodings`)
    }
  };
}
