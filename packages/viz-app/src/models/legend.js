import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';
import { createLogger } from '@graphistry/common/logger';

export function legend(view) {
    return {
        legend: {
            visible: true,
            controls: [
                {
                    selected: true,
                    id: 'toggle-legend',
                    name: 'Toggle Node Legend'
                }
            ],
            legendHistogram: $ref(`${view}.histogramsById.legendHistogram`)
        }
    };
}
