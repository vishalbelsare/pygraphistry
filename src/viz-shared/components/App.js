import styles from './app.less';
import Logo from '../containers/Logo';

export function App({ children = [] } = {}) {
    return (
        <div className={styles['app']}>
            {children}
        </div>
    );
}

/*
export class App extends Component {
    loadProps(model) {
        return model.get(...[
            `release.current.date`,
            `workbooks.open.views.length`,
            `workbooks.open.views.current['id', 'title']`,
            // `workbooks.open.views.current['background', 'foreground'].color`,
            // `workbooks.open.views.current.labels['background', 'foreground'].color`,
            // `workbooks.open.views.current['labels', 'inspector', 'histograms'].active.length`,
            // `workbooks.open.views.current.legend['open', 'title', 'subtitle', 'nodes', 'edges']`,
            // `workbooks.open.views.current.labels['enabled', 'opacity', 'timeZone', 'poiEnabled']`,
            `workbooks.open.views.current['sets', 'filters', 'settings', 'histograms']['name', 'open']`,
            `workbooks.open.views.current['sets', 'filters', 'settings', 'histograms', 'toolbar', 'panels'].length`,
            // `workbooks.open.views.current['labels', 'inspector', 'histograms']['name', 'open', 'selection']`,

            // `workbooks.open.views.current.scene[
            //     'buffers', 'textures', 'highlight', 'selection',
            //     'targets', 'programs', 'arcHeight', 'triggers',
            //     'items', 'modes', 'render', 'models', 'uniforms',
            //     'numRenderedSplits', 'clientMidEdgeInterpolation'
            // ]`,
            // `workbooks.open.views.current.scene.settings.length`,
            // `workbooks.open.views.current.scene.server['buffers', 'textures']`,
            // `workbooks.open.views.current.scene.options[
            //     'enable', 'disable', 'depthFunc', 'clearColor',
            //     'lineWidth', 'blendFuncSeparate', 'blendEquationSeparate'
            // ]`,
            // `workbooks.open.views.current.scene.hints['edges', 'points']`,
            // `workbooks.open.views.current.scene.camera['edges', 'points']['scaling', 'opacity']`,
            // `workbooks.open.views.current.scene.camera['type', 'nearPlane', 'farPlane']`,
            // `workbooks.open.views.current.scene.camera.bounds['top', 'left', 'bottom', 'right']`,
        ]);
    }
    observe(models, depth) {

        const logo = new Logo({
            models, index: 5, depth: depth + 1,
            path: `release.current`
        });

        const toolbar = new Toolbar({
            models, index: 4, depth: depth + 1,
            path: `workbooks.open.views.current.toolbar`
        });

        const settings = new Settings({
            models, index: 2, depth: depth + 1,
            path: `workbooks.open.views.current.settings`
        });

        return [toolbar, settings, logo];

        const canvas = new Canvas({
            models, index: 0, depth: depth + 1,
            path: `workbooks.open.views.current.scene`,
        });

        const inspector = new Marquee({
            models, index: 1, depth: depth + 1,
            id: 'marquee', canDrag: false,
            path: 'workbooks.open.views.current.inspector'
        });

        const histogram = new Marquee({
            models, index: 2, depth: depth + 1,
            id: 'brush', canDrag: true,
            path: 'workbooks.open.views.current.histograms'
        });

        const highlight = new Highlight({
            models, index: 3, depth: depth + 1,
            path: 'workbooks.open.views.current.scene'
        });

        return [canvas, inspector, histogram, highlight, toolbar, logo];
    }
    render(state, ...childVDoms) {
        return [[state, (
            <div id='app' key_={styles['app']} class_={{ [styles['app']]: true }}>{
                childVDoms
            }</div>
        )]];
    }
}
*/
