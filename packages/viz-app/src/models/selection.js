import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function selection(view) {
  return {
    highlight: {
      edge: [],
      point: [],
      label: null,
      darken: false
    },
    selection: {
      edge: [],
      point: [],
      type: null,
      mask: null,
      label: null,
      darken: true,
      cursor: 'auto',
      histogramsById: {},
      controls: [
        {
          selected: false,
          id: 'toggle-select-nodes',
          name: 'Select nodes'
        },
        {
          selected: false,
          id: 'toggle-window-nodes',
          name: 'Data brush'
        }
      ]
    }
  };
}
