import {
    hitmapUpdates,
    brushOn, anyMarqueeOn,
    simulateOn, isAnimating,
    curPoints, vboUpdates, vboVersions,
    marqueeOn, marqueeDone, marqueeActive,
    selectedEdgeIndexes, selectedPointIndexes
} from 'viz-app/client/legacy';

import { PropTypes } from 'react';
import { Observable, Subject } from 'rxjs';
import withContext from 'recompose/withContext';
import hoistStatics from 'recompose/hoistStatics';

export function setupLegacyInterop(document, options) {

    const simulation = getSimulationCanvas(document);

    let {
        socket,
        handleVboUpdates,
        top, left, right, bottom,
        play, opacity, pixelRatio,
        ['mix-blend-mode']: mixBlendMode = undefined,
        ['background-image']: simBackgroundImage = 'none'
    } = options;

    const simCameraBounds = { top, left, right, bottom };

    pixelRatio = pixelRatio || window.devicePixelRatio || 1;

    if (typeof opacity !== 'undefined' && !(
        isNaN(opacity = Math.abs(parseFloat(opacity))))) {
        if (opacity > 1) {
            opacity = opacity / Math.pow(10, Math.ceil(Math.log10(opacity)));
        }
        simulation.style.opacity = opacity;
    }

    if (typeof mixBlendMode !== 'undefined') {
        simulation.style['mix-blend-mode'] = mixBlendMode;
    }

    simulation.style.top = 0;
    simulation.style.left = 0;
    simulation.style.right = 0;
    simulation.style.bottom = 0;
    simulation.style.width = `100%`;
    simulation.style.height =`100%`;
    simulation.style.position =`absolute`;

    brushOn.next(false);
    marqueeOn.next(false);
    simulateOn.next(true);
    isAnimating.next(false);
    marqueeDone.next(false);
    anyMarqueeOn.next(false);
    marqueeActive.next(false);

    return hoistStatics(withContext(
        { play: PropTypes.number,
          socket: PropTypes.object,
          pixelRatio: PropTypes.number,
          simulation: PropTypes.object,
          onLabelsUpdated: PropTypes.func,
          simCameraBounds: PropTypes.object,
          handleVboUpdates:   PropTypes.func,
          simBackgroundImage: PropTypes.string }, () => (
        { play,
          socket,
          pixelRatio,
          simulation,
          onLabelsUpdated,
          simCameraBounds,
          handleVboUpdates,
          simBackgroundImage }
    )));
}

function getSimulationCanvas(document, simulation) {
    return simulation = (
        document.getElementById('simulation') || ((simulation =
        document.createElement('canvas')) && (
            simulation.id = 'simulation') && (
            simulation)
        )
    );
}

function onLabelsUpdated(labels) {
    parent.postMessage({ type: 'labels-update', labels }, '*');
}

