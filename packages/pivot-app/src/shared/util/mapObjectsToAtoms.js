const { isArray } = Array;
import { atom as $atom } from '@graphistry/falcor-json-graph';

export function mapObjectsToAtoms(incoming = {}) {
    if (incoming.isMessage) {
        return incoming;
    }
    let { value } = incoming;
    if (value !== null) {
        if (value === undefined) {
            value = $atom(value);
        } else if (typeof value === 'object') {
            if (isArray(value)) {
                value = $atom(value);
            } else if (value.$type === undefined) {
                value = $atom(value);
            }
        }
    }
    return { ...incoming, value };
}
