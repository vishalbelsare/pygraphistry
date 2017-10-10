import _ from 'underscore';
import shallowEqual from 'recompose/shallowEqual';
import { Scheduler } from 'rxjs/Scheduler';
import { Observable } from 'rxjs/Observable';
import { decodeGpuIndex } from '../support/picking';
import { $ref } from '@graphistry/falcor-json-graph';
import {
  vboUpdates,
  isAnimating,
  hitmapUpdates,
  labelSettings,
  cameraChanges
} from 'viz-app/client/legacy';

// 0--1: the closer to 1, the more likely that unsampled points disappear
const APPROX = 0.5;
const MAX_LABELS = 5;
const TIME_BETWEEN_SAMPLES = 300; // ms

export function pickPointsOfInterest(action$) {
  return labelSettings
    .combineLatest(cameraChanges, vboUpdates, (props, camera, vboUpdate) => ({
      ...props,
      vboUpdate,
      zoom: camera.zoom
    }))
    .debounceTime(350)
    .combineLatest(
      isAnimating,
      hitmapUpdates.map(() => Scheduler.now()),
      (props, animating, hitMapUpdateTime) => ({
        ...props,
        hitMapUpdateTime,
        canResample: !animating
      })
    )
    .filter(({ poiEnabled }) => poiEnabled)
    .distinctUntilChanged(
      (prev, { zoom, vboUpdate, canResample, hitMapUpdateTime }) =>
        zoom === prev.zoom &&
        hitMapUpdateTime === prev.hitMapUpdateTime &&
        (vboUpdate === prev.vboUpdate || vboUpdate !== 'received') &&
        (canResample === prev.canResample || canResample === false)
    )
    .scan(scanResampleLabelHits, {})
    .distinctUntilChanged(
      ({ hits }, { hits: newHits, didResample }) =>
        !didResample && (!newHits || shallowEqual(hits, newHits))
    )
    .map(setLabelHitReferences);
}

function scanResampleLabelHits(memo, props) {
  let didResample = false;
  const t = Scheduler.now();
  const { falcor, renderState, canResample } = props;
  let { hits, lastResampleTime = Scheduler.now() } = memo;

  if (canResample && (!hits || t - lastResampleTime > TIME_BETWEEN_SAMPLES)) {
    const { pixelreads = {} } = renderState;
    const { pointHitmapDownsampled } = pixelreads;
    if (pointHitmapDownsampled) {
      // console.log(`time since last resample ${(t - lastResampleTime)|0}ms`);
      didResample = true;
      lastResampleTime = t;
      hits = sortHits(markHits(pointHitmapDownsampled));
      // console.log(`hit resample time ${(Scheduler.now() - t)|0}ms`);
      // console.log(``);
      // console.log(`resampled label hits: ${JSON.stringify(hits)}`);
    }
  }

  return { ...memo, hits, falcor, didResample, lastResampleTime };
}

function setLabelHitReferences({ falcor, hits }) {
  let index = 0;
  let { length } = hits || [];
  length = Math.min(length, MAX_LABELS);

  const vals = { point: { length } };
  const path = falcor.getPath().slice(0, 4);
  const invs = (length < MAX_LABELS && { point: {} }) || undefined;

  while (index < length) {
    vals.point[index] = $ref(path.concat('labelsByType', 'point', hits[index++]));
  }

  while (index < MAX_LABELS) {
    invs.point[index++] = true;
  }

  return {
    falcor,
    values: [{ json: vals }],
    invalidations: (invs && [{ json: invs }]) || []
  };
}

function sortHits(hits) {
  return _.keys(hits)
    .sort((a, b) => hits[b] - hits[a])
    .slice(0, MAX_LABELS);
}

function markHits({ buffer }) {
  // Approach two (straight count + incr)
  // O(N), but slams memory

  // for (let i = 0; i < samples32.length; i++) {
  //     idx = decodeGpuIndex(samples32[i]);
  //     hits[idx] = hits[idx] ? hits[idx] + 1 : 1;
  // }

  // Approach one (sort -> count)
  // O(NlogN), but less slamming memory
  const hits = Object.create(null);
  const samples = Array.prototype.sort.call(new Uint32Array(buffer), (a, b) => a - b);

  let left = -1;
  let score = 0;
  let right = -1;
  let count = -1;
  let { length } = samples;

  while (++count < length) {
    // Exclude misses (-1)
    // (conditions are faster than hash sets)
    if (~(right = decodeGpuIndex(samples[count]))) {
      if (right === left) {
        score++;
      } else if (~left === 0) {
        score = 1;
        left = right;
      } else {
        hits[left] = score;
        left = right;
        score = 1;
      }
    }
  }

  if (~left) {
    hits[left] = score;
  }

  return hits;
}
