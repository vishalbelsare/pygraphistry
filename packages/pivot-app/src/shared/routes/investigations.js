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

export function investigations({ loadInvestigationsById }) {

    const getInvestigationsHandler = getHandler(['investigation'], loadInvestigationsById);

    return [{
        returns: `Number`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['length']`
    }, {
        returns: `String`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['id','name', 'value']`
    }, {
        returns: `pivots`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}][{integers}]`
    //}, {
        //returns: `String | Number`,
        //get: getInvestigationsHandler,
        //route: `investigationsById[{keys}][{integers}]['name']`
    }];
}

