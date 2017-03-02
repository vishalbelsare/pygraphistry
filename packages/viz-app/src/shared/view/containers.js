import {
    sceneMouseMove,
    sceneTouchStart,
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
} from 'viz-app/actions/scene';
import { selectLabel } from 'viz-app/actions/labels';
import { selectToolbarItem } from 'viz-app/actions/toolbar';
import { selectInspectorRow } from 'viz-app/actions/inspector';

export const withViewContainer = container({
    renderLoading: true,
    fragment: ({ scene, layout, toolbar, session, panels = {} } = {}) => {
        return `{
            pruneOrphans,
            scene: ${ Scene.fragment(scene) },
            layout: ${ Settings.fragment(layout) },
            toolbar: ${ Toolbar.fragment(toolbar) },
            session: ${ Session.fragment(session) },
            panels: {
                left: ${ Panel.fragment(panels.left, { side: 'left' }) },
                right: ${ Panel.fragment(panels.right, { side: 'right' }) },
                bottom: ${ Panel.fragment(panels.bottom, { side: 'bottom' }) }
            }
        }`
    },
    dispatchers: {
        selectLabel,
        sceneMouseMove,
        sceneTouchStart,
        selectToolbarItem,
        selectInspectorRow,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
    }
});
