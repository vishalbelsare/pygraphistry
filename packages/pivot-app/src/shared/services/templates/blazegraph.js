import _ from 'underscore';
import request from 'request';
import { Observable } from 'rxjs';
import {
    constructFieldString,
    encodeGraph
} from '../support/splunkMacros.js';
import logger from '../../../shared/logger.js';
const log = logger.createLogger('pivot-app', __filename);


class BlazePivot {
    constructor( pivotDescription ) {
        const {
            id, name,
            pivotParameterKeys, pivotParametersUI,
            toSplunk, connections, encodings, attributes
        } = pivotDescription;

        this.id = id;
        this.name = name;
        this.pivotParameterKeys = pivotParameterKeys;
        this.pivotParametersUI = pivotParametersUI;
        this.toSplunk = toSplunk;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
    }

    searchAndShape({ app, pivot }) {

        const get = Observable.bindNodeCallback(request.get.bind(request));
        const query = this.toSplunk(pivot.pivotParameters);
        pivot.template = this;

        return get(query)
            .map(
                ([response, body], index) => {
                    const { graph, labels } = JSON.parse(response.body);
                    pivot.results = {
                        graph: graph.map(
                            ({ src, dst, ...rest }) => ({ source: src, destination: dst, ...rest })
                        ),
                        labels: labels.map(
                            ({ community, ...rest }) => ({ community: (community) ? `Community ${community}`: undefined, ...rest})
                        )
                    }
                    return ({app, pivot})
                }
            )
            .catch((e) => {
                log.error(e);
                return Observable.throw('Failed to download dataset: ' +  e);
            })
    }
}


export const blazegraphCommunities = new BlazePivot({
    id: 'blazegraph-demo-communities',
    name: 'Blazegraph Community',
    pivotParameterKeys:['levels', 'tol', 'seed'],
    pivotParametersUI: {
        levels: {
            inputType: 'text',
            label: 'Levels',
            placeholder: 'Number between 1 and 3',
        },
        tol: {
            inputType: 'text',
            label: 'Tolerance',
            placeholder: 'String between "0.1f" and "0.00001f"'
        },
        seed: {
            inputType: 'text',
            label: 'Opt. seed IP:',
            placeholder: '1.2.3.4'
        }
    },
    toSplunk: function (pivotParameters, pivotCache) {
        const seed = pivotParameters.seed === undefined ? '' : pivotParameters.seed;
        const queryOptions = {
            url: 'http://108.48.53.144:21026/communities',
            headers: {
                'Accept': 'text/plain;charset=utf-8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            },
            qs: {
                filename: 'darpa-1998-edges-with-ports-cr.txt',
                levels: `${pivotParameters.levels}`,
                tol: `${pivotParameters.tol}`,
                seed: `${seed.trim()}`,
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        }
        return queryOptions;
    },
});

export const blazegraphExpand = new BlazePivot({
    id: 'blazegraph-demo-expand',
    name: 'Blazegraph Expand',
    pivotParameterKeys:['seed', 'maxlevels'],
    pivotParametersUI: {
        maxlevels: {
            inputType: 'text',
            label: 'Search depth',
            placeholder: 'Number between 1 and 3',
        },
        seed: {
            inputType: 'text',
            label: 'Seed IP:',
            placeholder: '1.2.3.4'
        }
    },
    toSplunk: function (pivotParameters, pivotCache) {
        const queryOptions = {
            url: 'http://108.48.53.144:21026/expand',
            headers: {
                'Accept': 'text/plain;charset=utf-8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            },
            qs: {
                filename: 'darpa-1998-edges-with-ports-cr.txt',
                maxlevels: `${pivotParameters.maxlevels}`,
                seed: `${pivotParameters.seed}`,
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        }
        return queryOptions;
    },
});
