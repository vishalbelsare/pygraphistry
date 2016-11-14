import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { Observable } from 'rxjs';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function encodings(path, base) {
    return function encodings({ loadViewsById, getEncodingOptions }) {


        //TODO set to server
        //TODO convenience route of encodings.attribute['point']['color'][{keys}]...

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            get: getValues,
            set: setValues,
            route: `${base}.encodings[{keys}]`,
        },
        {
            //returns: $atom([{variant, legend: [color]}])
            get: getEncodings.bind(null, {loadViewsById, getEncodingOptions}),
            set: setValues,
            route: `${base}.encodings.options[{keys:graphTypes}].color`
        },
        /* TODO: create, delete encoding */
        {
            get: getValues,
            set: setValues,
            route: `${base}.encodings['point','edge']['size','color','weight'][{keys}]`
        },
        {
            get: getValues,
            set: setValues,
            route: `${base}.encodings['point','edge']['size','color','weight'].legend[{keys}]`
        }];

        function getEncodings ({loadViewsById, getEncodingOptions}, path) {
            const { graphTypes } = path;
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            return loadViewsById({
                    workbookIds, viewIds
                })
                .mergeMap(({ workbook, view }) => {

                    const returns =
                        graphTypes.map((graphType) =>
                                getEncodingOptions(
                                    {view, encoding: {graphType, encodingType: 'color'}}));

                    returns.map( (returns) =>
                        console.log({msg: 'RETURNS ========', returns}));

                    const formatted =
                        returns.map((option, i) =>
                            [$value(
                                path.slice(0, path.length - 2).concat([ graphTypes[i], 'color']),
                                'hello')]);
                                //$atom(option))]);

                    formatted.map((arr) =>
                        console.log({msg: 'PATH====', path: arr[0].path, val: arr[0].value}));

                    return Observable.from(formatted);
                });
        }
    }
}