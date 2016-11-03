import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import _ from 'underscore';
import { shallowEqual } from 'recompose';
import { Scheduler } from 'rxjs/Scheduler';
import { Observable } from 'rxjs/Observable';
import { decodeGpuIndex } from 'viz-client/streamGL/picking';
import { animationFrame } from 'rxjs/scheduler/animationFrame';
import {
    curPoints, vboUpdates,
    isAnimating, hitmapUpdates,
    labelSettings, cameraChanges,
} from 'viz-client/legacy';

// 0--1: the closer to 1, the more likely that unsampled points disappear
const APPROX = 0.5;
const MAX_LABELS = 20;
const TIME_BETWEEN_SAMPLES = 300; // ms

export function labels(action$) {
    return labelSettings
        .combineLatest(cameraChanges, vboUpdates, (props, camera, vboUpdate) => ({
            ...props, vboUpdate, zoom: camera.zoom
        }))
        .debounceTime(350)
        .combineLatest(
            isAnimating, hitmapUpdates.map(() => Scheduler.now()),
            (props, animating, hitMapUpdateTime) => ({
                ...props, hitMapUpdateTime, forceResample: !animating
            })
        )
        .filter(({ enabled, poiEnabled }) => enabled && poiEnabled)
        .distinctUntilChanged((prev, { zoom, vboUpdate, forceResample, hitMapUpdateTime }) => (
            zoom === prev.zoom && (
            hitMapUpdateTime === prev.hitMapUpdateTime) && (
            vboUpdate === prev.vboUpdate || vboUpdate !== 'received') && (
            forceResample === prev.forceResample || forceResample === false)
        ))
        .scan(scanResampleLabelHits, {})
        .distinctUntilChanged(({ hits }, { hits: newHits, didResample }) =>
            !didResample && shallowEqual(hits, newHits)
        )
        .switchMap(setLabelHitReferences)
        .ignoreElements();
}

function scanResampleLabelHits(
    { lastResampleTime = 0, hits, ...memo },
    { renderState, forceResample, ...props }) {

    const t = Scheduler.now();
    let didResample = false;

    if (!hits || forceResample || (t - lastResampleTime > TIME_BETWEEN_SAMPLES)) {
        didResample = true;
        lastResampleTime = t;
        hits = sortHits(markHits(
                renderState['pixelreads']
                    ['pointHitmapDownsampled']));
        // console.log(`hit resample time ${(Scheduler.now() - t)|0}ms`);
        // console.log(`resampled label hits: ${JSON.stringify(hits)}`);
    }

    return {
        ...memo,
        ...props,
        didResample,
        forceResample,
        lastResampleTime,
        hits, renderState,
    };
}

function setLabelHitReferences({ falcor, hits }) {

    let index = 0;
    let { length } = hits;
    length = Math.min(length, MAX_LABELS);

    const vals = { point: { length }};
    const path = falcor._path.slice(0, 4);
    const invs = length < MAX_LABELS && { point: {} } || undefined;

    while (index < length) {
        vals.point[index] = $ref(path.concat(
            'labelsByType', 'point', hits[index++]
        ));
    }

    while (index < MAX_LABELS) {
        invs.point[index++] = true;
    }

    if (invs) {
        falcor.invalidate({ json: invs });
    }

    return falcor.set({ json: vals });
}

function sortHits (hits) {
    const indicies = _.keys(hits)
        .sort((a, b) => hits[b] - hits[a])
        .map((x) => parseInt(x));
    return indicies.slice(0, Math.min(
        indicies.length, MAX_LABELS
    ));
}

function markHits ({ buffer }) {

    // Approach two (straight count + incr)
    // O(N), but slams memory

    // for (let i = 0; i < samples32.length; i++) {
    //     idx = decodeGpuIndex(samples32[i]);
    //     hits[idx] = hits[idx] ? hits[idx] + 1 : 1;
    // }

    // Approach one (sort -> count)
    // O(NlogN), but less slamming memory
    const hits = Object.create(null);
    const samples = Array.prototype.sort.call(
        new Uint32Array(buffer),
        (a, b) => a - b
    );

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
