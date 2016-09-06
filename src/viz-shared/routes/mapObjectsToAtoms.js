import Color from 'color';
import { atom as $atom } from '@graphistry/falcor-json-graph';

export function mapObjectsToAtoms(incoming) {
    if (incoming.isMessage) {
        return incoming;
    }
    let { path, value } = incoming;
    if (value && typeof value === 'object' && !value.$type) {
        value = $atom(value instanceof Color ?
            value.hsv() : value
        );
    }
    return { path, value };
}
