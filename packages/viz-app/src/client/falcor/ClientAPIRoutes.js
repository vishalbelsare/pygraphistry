import { createAppRouter } from 'viz-app/router/falcor';
import { withSchema } from '@graphistry/falcor-react-schema';

export function whitelistClientAPIRoutes(model) {
    const routes = withClientAPIRoutes(() => null)
        .schema({
            get(...paths) {
                return model.get(...paths)._toJSONG();
            },
            set(json) {
                return model.set({ json })._toJSONG();
            },
            call(path, args, suffixes, paths) {
                return model.call(path, args, suffixes, ...paths)._toJSONG();
            }
        })
        .toArray();
    const AppRouter = createAppRouter({ bufferTime: 10, streaming: true }, routes);
    return function getDataSource() {
        return new AppRouter();
    };
}

const withClientAPIRoutes = withSchema((QL, { get, set }, services) => {
    const callFn = { call: services.call };
    const readOnly = { get: services.get };
    const writeOnly = { set: services.set };
    const readWrite = { ...readOnly, ...writeOnly };
    return QL`{
        workbooks: { open: ${readOnly} },
        workbooksById: {
            [{keys: workbookIds}]: {
                id: ${readOnly},
                save: ${callFn},
                views: { current: ${readOnly} },
                viewsById: {
                    [{keys: viewIds}]: {
                        tick: ${callFn},
                        pruneOrphans: ${writeOnly},
                        ['id', 'toolbar']: ${readOnly},
                        ['columns', 'filters', 'exclusions']: {
                            add: ${callFn}
                        },
                        toolbars: {
                            [{keys}]: {
                                visible: ${writeOnly}
                            }
                        },
                        panels: {
                            ['left', 'right', 'bottom']: ${writeOnly}
                        },
                        encodings: {
                            [{keys: componentType}]: {
                                ['icon', 'size', 'color', 'axis']: ${writeOnly}
                            }
                        },
                        componentsByType: {
                            [{keys: componentType}]: {
                                rows: {
                                    filter: ${callFn}
                                }
                            }
                        },
                        ['filters', 'scene', 'labels', 'layout', 'exclusions', 'inspector', 'histograms']: {
                            controls: {
                                [{integers}]: {
                                    selected: ${writeOnly}
                                }
                            }
                        },
                        camera: {
                            zoom: ${writeOnly},
                            center: {
                                ['x', 'y', 'z']: ${writeOnly}
                            }
                        },
                        layout: { options: { [{keys}]: { [{keys}]: { value: ${writeOnly} } } } },
                        labels: {
                            ['background', 'foreground']: { color: ${writeOnly} },
                            ['opacity', 'enabled', 'poiEnabled', 'highlightEnabled']: ${writeOnly}
                        },
                        scene: {
                            renderer: {
                                showArrows: ${writeOnly},
                                background: { color: ${writeOnly} },
                                ['edges', 'points']: {
                                    ['opacity', 'scaling']: ${writeOnly}
                                }
                            }
                        }
                    }
                }
            }
        }
    }`;
});
