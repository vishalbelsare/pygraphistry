import { constructFieldString, SplunkPivot, encodeGraph } from '../services/support/splunkMacros.js';
import { Observable } from 'rxjs'

import _ from 'underscore';
import fs from 'fs'
import stringhash from 'string-hash';
import request from 'request'

class BlazePivot {
    constructor( pivotDescription ) {
        let { name, label, kind, toSplunk, connections, encodings, fields, attributes } = pivotDescription
        this.name = name;
        this.label = label;
        this.kind = kind;
        this.toSplunk = toSplunk;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
    }

    searchAndShape({app, pivot, rowId}) {

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
                maxlevels: `2`,
                seed: `${pivotParameters['input']}`,
                ipidx: 'darpa-1998-ips_with_index.txt'
            }
        }

        return queryOptions;
    },
});

const BLAZE_EXPAND2 = new BlazePivot({
    name: 'Blaze - Expand on 2',
    label: 'Query:',
    kind: 'text',
    toSplunk: function (pivotParameters, pivotCache) {
        return 'https://s3-us-west-1.amazonaws.com/graphistry.data.public/darpa-1998-json-expand-two-194.027.251.021';
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});

export default [
    BLAZE_EXPAND, COMMUNITY_DETECTION, PAGE_RANK, BLAZE_EXPAND2
]

