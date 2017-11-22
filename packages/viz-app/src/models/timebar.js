import { ref as $ref } from '@graphistry/falcor-json-graph';
import { createLogger } from '@graphistry/common/logger';

export function timebar(view) {
    return {
        timebar: {
            controls: [
                {
                    selected: false,
                    id: 'toggle-timebar',
                    name: 'Toggle Timebar'
                }
            ],
            timebarHistogram: $ref(`${view}.histogramsById.timebarHistogram`)
        }
    };
}
