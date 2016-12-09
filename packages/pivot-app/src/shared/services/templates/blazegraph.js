import { Observable } from 'rxjs';
import stringhash from 'string-hash';
import request from 'request';
import { PivotTemplate } from './template.js';
import logger from '../../../shared/logger.js';
const log = logger.createLogger('pivot-app', __filename);


class BlazePivot extends PivotTemplate {
    constructor( pivotDescription ) {
        super(pivotDescription);

        const { connections, encodings, attributes, fileName } = pivotDescription;
        this.fileName = fileName;
        this.connections = connections;
        this.encodings = encodings;
        this.attributes = attributes;
    }

    searchAndShape({app, pivot, rowId}) {

        const get = Observable.bindNodeCallback(request.get.bind(request));
        pivot.template = this;
        return get(`https://s3-us-west-1.amazonaws.com/graphistry.data.public/${this.fileName}`)
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

export const COMMUNITY_DETECTION = new BlazePivot({
    id: 'blazegraph-community-detection',
    name: 'Community Detection',
    tags: ['Blazegraph'],
    fileName: 'blazegraph.json',
    pivotParameterKeys: ['communities'],
    pivotParametersUI : {
        'communities': {
            inputType: 'text',
            label: 'Number of communities',
            placeholder: '2'
        }
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});

export const BLAZE_EXPAND = new BlazePivot({
    id: 'blazegraph-bfs',
    name: 'BFS',
    tags: ['Blazegraph'],
    fileName: 'darpa-1998-json-expand-two-194.027.251.021',
    pivotParameterKeys: ['ip', 'depth'],
    pivotParametersUI : {
        'ip': {
            inputType: 'text',
            label: 'Seed IP:',
            placeholder: '192.168.0.1'
        },
        'depth': {
            label: 'Maximum Depth',
            inputType: 'combo',
            options: [
                {value: 1, label: '1'},
                {value: 2, label: '2'},
                {value: 3, label: '3'},
                {value: 4, label: '4'},
                {value: 5, label: '5'},
                {value: 6, label: '6'},
                {value: 7, label: '7'},
                {value: 8, label: '8'},
                {value: 9, label: '9'},
            ]
        }


    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});
