import { get } from '@graphistry/falcor-router-saddle';

export function getHandler(lists, loader, getInitialProps) {
  return get({ lists, loader, getInitialProps });
}
