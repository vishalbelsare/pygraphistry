import Color from 'color';
import { atom as $atom } from '@graphistry/falcor-json-graph';

export function mapObjectsToAtoms(incoming) {
    if (incoming.isMessage) {
        return incoming;
    }
    let { path, value, ...rest } = incoming;
    if (value instanceof Color) {
        value = value.rgbaString();
    } else if (value && typeof value === 'object' && !value.$type) {
        value = $atom(value);
    }
    return { path, value, ...rest };
}
