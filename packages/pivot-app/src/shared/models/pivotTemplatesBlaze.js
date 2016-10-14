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
        pivot.template = this;
        return get('https://s3-us-west-1.amazonaws.com/graphistry.data.public/blazegraph.json')
            .map(
                ([response, body], index) => {
                    const { graph, labels } = JSON.parse(body)
                    pivot.results = {
                        graph: graph.map(({src, dst}) => ({ source: src, destination: dst })),
                        labels: labels
                    }
                    return ({app, pivot})
                }
            )
            .catch((e) => {
                console.error(e);
                return Observable.throw('Failed to download dataset ' +  e )
            })
    }
}

const COMMUNITY_DETECTION = new BlazePivot({
    name: 'Community Detection',
    label: 'Query:',
    kind: 'text',
    toSplunk: function (pivotParameters, pivotCache) {
        return `search ${pivotParameters['input']} ${constructFieldString(this)} | head 500`;
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
    COMMUNITY_DETECTION
]

