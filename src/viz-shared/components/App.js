import { Component } from 'reaxtor';
// import stringify from 'json-stable-stringify';
import { render as renderApp } from '../views/graph.jsx';

export class App extends Component {
    loadProps(model) {
        return model.get(
            `release.current.date`,
            `workbooks.open.views.length`,
            `workbooks.open.views.current['id', 'title']`,
            `workbooks.open.views.current['background', 'foreground'].color`,
            `workbooks.open.views.current.labels['background', 'foreground'].color`,
            `workbooks.open.views.current['sets', 'filters', 'settings']['name', 'open']`,
            `workbooks.open.views.current.legend['open', 'title', 'subtitle', 'nodes', 'edges']`,
            `workbooks.open.views.current.labels['enabled', 'opacity', 'timeZone', 'poiEnabled']`,
            `workbooks.open.views.current['sets', 'panels', 'filters', 'settings'].length`,

            `workbooks.open.views.current.scene[
                'targets', 'programs', 'arcHeight', 'triggers',
                'items', 'modes', 'render', 'models', 'uniforms',
                'numRenderedSplits', 'clientMidEdgeInterpolation'
            ]`,
            `workbooks.open.views.current.scene.settings.length`,
            `workbooks.open.views.current.scene['buffers', 'textures']`,
            `workbooks.open.views.current.scene.server['buffers', 'textures']`,
            `workbooks.open.views.current.scene.options[
                'enable', 'disable', 'depthFunc', 'clearColor',
                'lineWidth', 'blendFuncSeparate', 'blendEquationSeparate'
            ]`,
            `workbooks.open.views.current.scene.hints['edges', 'points']`,
            `workbooks.open.views.current.scene.camera['edges', 'points']['scaling', 'opacity']`,
            `workbooks.open.views.current.scene.camera['type', 'nearPlane', 'farPlane']`,
            `workbooks.open.views.current.scene.camera.bounds['top', 'left', 'bottom', 'right']`,
        );
    }
    render(model, state) {
        return [[ state, renderApp(state) ]];
    }
}
