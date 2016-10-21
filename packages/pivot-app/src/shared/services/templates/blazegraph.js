import {
    constructFieldString,
    encodeGraph
} from '../support/splunkMacros.js';
import { Observable } from 'rxjs'
import _ from 'underscore';
import fs from 'fs'
import stringhash from 'string-hash';
import request from 'request'


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
                console.error(e);
                if (e.stack) { console.error(e.stack); }
                return Observable.throw('Failed to download dataset ' +  e )
            })
    }
}

/*
const COMMUNITY_DETECTION = new BlazePivot({
    name: 'Darpa/communityDetection',
    label: 'Number of communities:',
    kind: 'text',

    toSplunk: function (pivotParameters, pivotCache) {
        const queryOptions = {
            url: 'http://108.48.53.144:21026/communities',
            headers: {
                'Accept': 'text/plain;charset=utf-8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            },
            qs: {
                filename: 'darpa-1998-edges-with-ports-cr.txt',
                levels: `${pivotParameters['input']}`,
                tol:'0.0001f',
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        };

        return queryOptions;
    },
});

const PAGE_RANK = new BlazePivot({
    name: 'Darpa/pageRank',
    label: 'level',
    kind: 'text',
    toSplunk: function (pivotParameters, pivotCache) {
        const queryOptions = {
            url: 'http://108.48.53.144:21026/communities',
            headers: {
                'Accept': 'text/plain;charset=utf-8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            },
            qs: {
                filename: 'netflow140_unique_src_dest_pairs_port_pagerank_indexed.txt',
                levels: `${pivotParameters['input']}`,
                tol:'0.0001f',
                ipidx: '140idx.txt'
            }
        }

        return queryOptions;
    },
});

const BLAZE_EXPAND = new BlazePivot({
    name: 'Darpa/expandOn',
    label: 'Query:',
    kind: 'text',
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
                maxlevels: `1`,
                seed: `${pivotParameters['input']}`,
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        }

        return queryOptions;
    },
});

const BLAZE_EXPAND2 = new BlazePivot({
    name: 'Darpa/expandOn2',
    label: 'Query:',
    kind: 'text',
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
                maxlevels: `2`,
                seed: `${pivotParameters['input']}`,
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        }

        return queryOptions;
    },
});

const BLAZE_EXPAND3 = new BlazePivot({
    name: 'Darpa/expandOn3',
    label: 'Query:',
    kind: 'text',
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
                maxlevels: `3`,
                seed: `${pivotParameters['input']}`,
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        }

        return queryOptions;
    },
});
*/

export const blazegraphCommunities = new BlazePivot({
    id: 'blazegraph-demo-communities',
    name: 'Blazegraph Community',
    pivotParameterKeys:['levels', 'tol'],
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
        }
    },
    toSplunk: function (pivotParameters, pivotCache) {
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
            label: 'IP address:',
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


