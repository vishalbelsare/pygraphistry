import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue
} from 'falcor-json-graph';

import { Observable } from 'rxjs';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from './support';

export function investigations({ loadInvestigationsById, loadPivotsById, searchPivot, uploadGraph }) {

    const getInvestigationsHandler = getHandler(['investigation'], loadInvestigationsById);

    return [{
        returns: `Number`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['length']`
    }, {
        returns: `String`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['id','name', 'value', 'url']`
    }, {
        returns: `pivots`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}][{integers}]`
    }, {
        route: `investigationsById[{keys}].searchPivot`,
        call: searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot, uploadGraph })
    //}, {
        //returns: `String | Number`,
        //get: getInvestigationsHandler,
        //route: `investigationsById[{keys}][{integers}]['name']`
    }];
}

function searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot, uploadGraph }) {
    return function searchPivotCall(path, args) {
        const id = path[1];
        const index = args[0];
        return loadInvestigationsById({investigationIds: id})
            .mergeMap(
            ({app, investigation}) => searchPivot({ app, investigation, index }),
        )
        .mergeMap(
            ({app, investigation, pivot, index}) => uploadGraph(app),
            ({app, investigation, pivot, index}, name) => ({
                app, index, name, investigation, pivot
            })
        ) 
        .mergeMap(({ app, investigation, pivot, index, name }) => {
            investigation.url = 'https://labs.graphistry.com/graph/graph.html?type=vgraph&dataset=' + name;
            console.log('Upload finished investigation')
            const values = [
                //$pathValue(`pivots[${index}].enabled`, pivots[index].enabled),
                //$pathValue(`pivots[${index}].resultCount`, pivots[index].resultCount),
                $pathValue(`investigationsById['${id}'].url`, investigation.url),
            ];

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
}
