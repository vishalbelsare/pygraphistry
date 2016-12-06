import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';
import { SELECT_TOOLBAR_ITEM } from 'viz-shared/actions/toolbar';

export function toolbar(action$, store) {
    return selectToolbarItem(action$, store).ignoreElements();
}

const reducers = {
    'zoom-in': zoomIn,
    'zoom-out': zoomOut,
    'center-camera': centerCamera,
    'open-workbook': openWorkbook,
    'fork-workbook': forkWorkbook,
    'save-workbook': saveWorkbook,
    'embed-workbook': embedWorkbook,
    'fullscreen-workbook': fullscreenWorkbook,
    'toggle-filters': toggleFilters,
    'toggle-timebar': toggleTimebar,
    'toggle-inspector': toggleInspector,
    'toggle-histograms': toggleHistograms,
    'toggle-exclusions': toggleExclusions,
    'toggle-simulating': toggleSimulating,
    'toggle-select-nodes': toggleSelectNodes,
    'toggle-window-nodes': toggleWindowNodes,
    'toggle-label-settings': toggleLabelSettings,
    'toggle-scene-settings': toggleSceneSettings,
    'toggle-layout-settings': toggleLayoutSettings
};

function selectToolbarItem(action$, store) {
    return action$
        .ofType(SELECT_TOOLBAR_ITEM)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ id, ...props }) => reducers[id]({
                id, ...props
            })
        ));
}

function zoomIn({ falcor }) {
    return falcor
        .getValue(`camera.zoom`)
        .mergeMap((zoom) => falcor.set($value(
            `camera.zoom`, zoom * (1 / 1.25)
        )))
}

function zoomOut({ falcor }) {
    return falcor
        .getValue(`camera.zoom`)
        .mergeMap((zoom) => falcor.set($value(
            `camera.zoom`, zoom * (1.25)
        )))
}

function centerCamera({ falcor }) {
    return falcor.set(
        $value(`camera.zoom`, $atom(1, { $timestamp: Date.now() })),
        $value(`camera.center['x', 'y', 'z']`, $atom(0, { $timestamp: Date.now() })),
    );
}

function toggleSimulating({ stop, center, falcor, socket, selected }) {
    if (selected) {
        return falcor.set(
            $value(`scene.simulating`, false),
            $value(`scene.controls[0].selected`, false),
        );
    } else {
        return Observable.merge(
            falcor.set(
                $value(`scene.simulating`, true),
                $value(`scene.controls[0].selected`, true),
            ),
            !socket &&
                Observable.empty() ||
                Observable.interval(40).do(() => {
                    socket.emit('interaction', { play: true, layout: true });
                })
                .let((source) => !center ?
                    source :
                    source.exhaustMap((x, index) => {
                        if ((index % 2 && index <= 10) ||
                            (index % 20 === 0 && index <= 100) ||
                            (index % 100 === 0)) {
                            return centerCamera({ falcor }).startWith(x);
                        }
                        return Observable.of(x);
                    })
                )
                .let((source) => !stop ?
                    source : source
                        .takeUntil(stop)
                        .concat(toggleSimulating({
                            falcor, socket, selected: true
                        }))
                        .concat(centerCamera({ falcor }))
                )
        );
    }
}

function toggleFilters({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.left`, undefined),
            $value(`filters.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`filters.controls[0].selected`, true),
            $value(`scene.controls[1].selected`, false),
            $value(`labels.controls[0].selected`, false),
            $value(`layout.controls[0].selected`, false),
            $value(`exclusions.controls[0].selected`, false),
            $value(`panels.left`, $ref(falcor._path.concat(`filters`)))
        );
    }
}

function toggleExclusions({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.left`, undefined),
            $value(`exclusions.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`exclusions.controls[0].selected`, true),
            $value(`scene.controls[1].selected`, false),
            $value(`labels.controls[0].selected`, false),
            $value(`layout.controls[0].selected`, false),
            $value(`filters.controls[0].selected`, false),
            $value(`panels.left`, $ref(falcor._path.concat(`exclusions`)))
        );
    }
}

function toggleHistograms({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.right`, undefined),
            $value(`highlight.darken`, false),
            $value(`histograms.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`histograms.controls[0].selected`, true),
            $value(`panels.right`, $ref(falcor._path.concat(`histograms`)))
        );
    }
}

function toggleTimebar({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.bottom`, undefined),
            $value(`timebar.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`timebar.controls[0].selected`, true),
            $value(`inspector.controls[0].selected`, false),
            $value(`panels.bottom`, $ref(falcor._path.concat(`timebar`)))
        );
    }
}

function toggleInspector({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.bottom`, undefined),
            $value(`inspector.controls[0].selected`, false),
        );
    } else {
        return falcor.set(
            $value(`inspector.controls[0].selected`, true),
            $value(`timebar.controls[0].selected`, false),
            $value(`panels.bottom`, $ref(falcor._path.concat(`inspector`)))
        );
    }
}

function toggleLabelSettings({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.left`, undefined),
            $value(`labels.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`labels.controls[0].selected`, true),
            $value(`scene.controls[1].selected`, false),
            $value(`layout.controls[0].selected`, false),
            $value(`filters.controls[0].selected`, false),
            $value(`exclusions.controls[0].selected`, false),
            $value(`panels.left`, $ref(falcor._path.concat(`labels`)))
        );
    }
}

function toggleSceneSettings({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.left`, undefined),
            $value(`scene.controls[1].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`scene.controls[1].selected`, true),
            $value(`labels.controls[0].selected`, false),
            $value(`layout.controls[0].selected`, false),
            $value(`filters.controls[0].selected`, false),
            $value(`exclusions.controls[0].selected`, false),
            $value(`panels.left`, $ref(falcor._path.concat(`scene`)))
        );
    }
}

function toggleLayoutSettings({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`panels.left`, undefined),
            $value(`layout.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`layout.controls[0].selected`, true),
            $value(`scene.controls[1].selected`, false),
            $value(`labels.controls[0].selected`, false),
            $value(`filters.controls[0].selected`, false),
            $value(`exclusions.controls[0].selected`, false),
            $value(`panels.left`, $ref(falcor._path.concat(`layout`)))
        );
    }
}

function toggleSelectNodes({ falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selection.type`, null),
            $value(`selection.controls[0].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`selection.type`, 'select'),
            $value(`selection.controls[0].selected`, true),
            $value(`selection.controls[1].selected`, false),
        );
    }
}

function toggleWindowNodes({ falcor, selected }) {
    if (selected) {
        falcor.invalidate(`selection.histogramsById`);
        return falcor.set(
            $value(`selection['mask', 'type']`, null),
            $value(`selection.controls[1].selected`, false)
        );
    } else {
        return falcor.set(
            $value(`selection.type`, 'window'),
            $value(`selection.controls[1].selected`, true),
            $value(`selection.controls[0].selected`, false),
            $value(`histograms.controls[0].selected`, true),
            $value(`panels.right`, $ref(falcor._path.concat(`histograms`)))
        );
    }
}

function openWorkbook({ falcor, selected }) {
    return Observable.defer( () => {
        const url = window.location.origin + window.location.pathname + window.location.search;
        window.open(url);
    });
}

function forkWorkbook({ falcor, selected }) {
    return Observable.empty();
}

function saveWorkbook({ falcor }) {
    const wbFalcor = falcor._clone({_path: falcor._path.slice(0, -2)});
    return wbFalcor.call(['save']);
}

function embedWorkbook({ falcor, selected }) {
    return Observable.empty();
}

function fullscreenWorkbook({ falcor, selected }) {
    return Observable.defer( () => {

        const isFullscreen = function () {
            return !((document.fullScreenElement && document.fullScreenElement !== null) ||
            (!document.mozFullScreen && !document.webkitIsFullScreen));
        };

        // http://stackoverflow.com/questions/3900701/onclick-go-full-screen
        if (isFullscreen()) {
            if (document.cancelFullScreen) {
                document.cancelFullScreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
        } else {
            const documentElement = document.documentElement;
            if (documentElement.requestFullScreen) {
                documentElement.requestFullScreen();
            } else if (documentElement.mozRequestFullScreen) {
                documentElement.mozRequestFullScreen();
            } else if (documentElement.webkitRequestFullScreen) {
                documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        }
    });
}
