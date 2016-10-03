import {
    ref as $ref,
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

function zoomIn({ view, falcor }) {
    return falcor
        .getValue(`view.camera.zoom`)
        .mergeMap((zoom) => falcor.set($value(
            `view.camera.zoom`, zoom * (1 / 1.25)
        )))
}

function zoomOut({ view, falcor }) {
    return falcor
        .getValue(`view.camera.zoom`)
        .mergeMap((zoom) => falcor.set($value(
            `view.camera.zoom`, zoom * (1.25)
        )))
}

function centerCamera({ view, falcor }) {
    return falcor.set(
        $value(`view.camera.zoom`, 1),
        $value(`view.camera.center['x', 'y', 'z']`, 0),
    );
}

function toggleSimulating({ view, falcor, socket, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.scene.simulating`, false)
        );
    } else {
        return Observable.merge(
            falcor.set(
                $value(`selected`, true),
                $value(`view.scene.simulating`, true)
            ),
            !socket &&
                Observable.empty() ||
                Observable.interval(40).do(() => {
                    socket.emit('interaction', { play: true, layout: true });
                })
        );
    }
}

function toggleFilters({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.left`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.scene.controls[1].selected`, false),
            $value(`view.labels.controls[0].selected`, false),
            $value(`view.layout.controls[0].selected`, false),
            $value(`view.exclusions.controls[0].selected`, false),
            $value(`view.panels.left`, $ref(view.concat(`filters`)))
        );
    }
}

function toggleExclusions({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.left`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.scene.controls[1].selected`, false),
            $value(`view.labels.controls[0].selected`, false),
            $value(`view.layout.controls[0].selected`, false),
            $value(`view.filters.controls[0].selected`, false),
            $value(`view.panels.left`, $ref(view.concat(`exclusions`)))
        );
    }
}

function toggleHistograms({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.right`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.panels.right`, $ref(view.concat(`histograms`)))
        );
    }
}

function toggleTimebar({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.bottom`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.inspector.controls[0].selected`, false),
            $value(`view.panels.bottom`, $ref(view.concat(`timebar`)))
        );
    }
}

function toggleInspector({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.bottom`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.timebar.controls[0].selected`, false),
            $value(`view.panels.bottom`, $ref(view.concat(`inspector`)))
        );
    }
}

function toggleLabelSettings({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.left`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.scene.controls[1].selected`, false),
            $value(`view.layout.controls[0].selected`, false),
            $value(`view.filters.controls[0].selected`, false),
            $value(`view.exclusions.controls[0].selected`, false),
            $value(`view.panels.left`, $ref(view.concat(`labels`)))
        );
    }
}

function toggleSceneSettings({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.left`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.labels.controls[0].selected`, false),
            $value(`view.layout.controls[0].selected`, false),
            $value(`view.filters.controls[0].selected`, false),
            $value(`view.exclusions.controls[0].selected`, false),
            $value(`view.panels.left`, $ref(view.concat(`scene`)))
        );
    }
}

function toggleLayoutSettings({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.panels.left`, undefined)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.scene.controls[1].selected`, false),
            $value(`view.labels.controls[0].selected`, false),
            $value(`view.filters.controls[0].selected`, false),
            $value(`view.exclusions.controls[0].selected`, false),
            $value(`view.panels.left`, $ref(view.concat(`layout`)))
        );
    }
}

function toggleSelectNodes({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.selection.type`, null)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.selection.type`, 'select'),
            $value(`view.timebar.controls[0].selected`, false),
            $value(`view.inspector.controls[0].selected`, true),
            $value(`view.selection.controls[1].selected`, false),
            $value(`view.panels.bottom`, $ref(view.concat(`inspector`))),
        );
    }
}

function toggleWindowNodes({ view, falcor, selected }) {
    if (selected) {
        return falcor.set(
            $value(`selected`, false),
            $value(`view.selection.type`, null)
        );
    } else {
        return falcor.set(
            $value(`selected`, true),
            $value(`view.selection.type`, 'window'),
            $value(`view.timebar.controls[0].selected`, false),
            $value(`view.inspector.controls[0].selected`, true),
            $value(`view.selection.controls[0].selected`, false),
            $value(`view.panels.bottom`, $ref(view.concat(`inspector`))),
        );
    }
}

function openWorkbook({ falcor, selected }) {
    return Observable.empty();
}

function forkWorkbook({ falcor, selected }) {
    return Observable.empty();
}

function saveWorkbook({ falcor, selected }) {
    return Observable.empty();
}

function embedWorkbook({ falcor, selected }) {
    return Observable.empty();
}

function fullscreenWorkbook({ falcor, selected }) {
    return Observable.empty();
}
