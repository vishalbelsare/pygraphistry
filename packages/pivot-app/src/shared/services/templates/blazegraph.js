import { Observable } from 'rxjs';
import stringhash from 'string-hash';
import request from 'request';

class BlazePivot {
    constructor( pivotDescription ) {
        let { id, name,
              pivotParameterKeys, pivotParametersUI,
              connections, encodings, attributes } = pivotDescription;

        this.id = id;
        this.name = name;
        this.pivotParameterKeys = pivotParameterKeys;
        this.pivotParametersUI = pivotParametersUI;
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

export const COMMUNITY_DETECTION = new BlazePivot({
    id: 'blazegraph-community-detection-2',
    name: 'Community Detection 2',
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
