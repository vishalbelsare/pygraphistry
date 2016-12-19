import { set } from '@graphistry/falcor-router-saddle';

export function setHandler(lists, loader, mapValue,
                           valueKeys = {},
                           getInitialProps,
                           unboxAtoms = false,
                           unboxRefs = false,
                           unboxErrors = false) {
    return set({
        lists, loader,
        getInitialProps,
        mapValue, valueKeys,
        unboxAtoms, unboxRefs, unboxErrors
    });
}

