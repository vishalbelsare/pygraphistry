import { set } from '@graphistry/falcor-router-saddle';

export function setHandler(
  lists,
  loader,
  mapValue,
  valueKeys = {},
  getInitialProps,
  unboxAtoms = true,
  unboxRefs = false,
  unboxErrors = true
) {
  return set({
    lists,
    loader,
    getInitialProps,
    mapValue,
    valueKeys,
    unboxAtoms,
    unboxRefs,
    unboxErrors
  });
}
