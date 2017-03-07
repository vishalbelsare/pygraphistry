export * from './setupLegacyInterop';

import { Observable, ReplaySubject } from 'rxjs';

export const toggleZoomIn = new ReplaySubject(1);
export const toggleCenter = new ReplaySubject(1);
export const toggleZoomOut = new ReplaySubject(1);

export const vboUpdates = new ReplaySubject(1);
export const vboVersions = new ReplaySubject(1);
export const hitmapUpdates = new ReplaySubject(1);
export const cameraChanges = new ReplaySubject(1);
export const viewConfigChanges = new ReplaySubject(1);
export const isAnimating = new ReplaySubject(1);
export const labelHover = new ReplaySubject(1);
export const labelSettings = new ReplaySubject(1);
export const labelRequests = new ReplaySubject(1);
export const marqueeOn = new ReplaySubject(1);
export const marqueeActive = new ReplaySubject(1);
export const marqueeDone = new ReplaySubject(1);
export const simulateOn = new ReplaySubject(1);
export const brushOn = new ReplaySubject(1);
export const anyMarqueeOn = new ReplaySubject(1);

// Declare implicit dependencies that we're currently hard-coded to anyway.
export const curPoints = new ReplaySubject(1);
export const pointSizes = new ReplaySubject(1);
export const pointColors = new ReplaySubject(1);
export const edgeColors = new ReplaySubject(1);
export const selectedEdgeIndexes = new ReplaySubject(1);
export const selectedPointIndexes = new ReplaySubject(1);

export const isAnimatingOrSimulating = Observable.combineLatest(
    isAnimating, simulateOn, (x, y) => x || y
);
