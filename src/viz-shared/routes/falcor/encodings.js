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
    return function encodings({ loadViewsById, getEncodingOptions, setEncoding, getEncoding }) {


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
            route: `${base}.encodings.options[{keys:graphTypes}][{keys:encodingTypes}]`
        },
        {
            // {variant} -> encodingSpec={variant, legend: [color]}
            get: getEncodingRoute.bind(null, {loadViewsById, getEncoding}),
            set: setEncodingRoute.bind(null, {loadViewsById, setEncoding}),
            route: `${base}.encodings[{keys:graphTypes}][{keys:encodingTypes}]`
        }];

        function getEncodings ({loadViewsById, getEncodingOptions}, path) {

            const basePath = path.slice(0, path.length - 2);
            const { graphTypes, encodingTypes } = path;
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);

            const encodings = [].concat(
                ...graphTypes.map((graphType) =>
                    encodingTypes.map((encodingType) =>
                        ({graphType, encodingType}))));

            return loadViewsById({
                    workbookIds, viewIds
                })
                .mergeMap(({ workbook, view }) =>
                    encodings
                        .map(({graphType, encodingType}) =>
                            $value(
                                basePath.concat(graphType, encodingType),
                                $atom(getEncodingOptions({view, encoding: {graphType, encodingType}})))))
                .do(function (o) { console.log({msg: '===GET_ENCODINGS', o})});
        }

        function getEncodingRoute ({loadViewsById, getEncoding}, path) {

            const basePath = path.slice(0, path.length - 2);
            const { graphTypes, encodingTypes } = path;
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);

            const encodings = [].concat(
                ...graphTypes.map((graphType) =>
                    encodingTypes.map((encodingType) =>
                        ({graphType, encodingType}))));

            return loadViewsById({
                    workbookIds, viewIds
                })
                .mergeMap(({ workbook, view }) =>
                    encodings.map(({graphType, encodingType}) =>
                        $value(
                            basePath.concat(graphType, encodingType),
                            $atom((getEncoding({
                                    view, encoding: {graphType, encodingType}
                                })||{})
                                .encodingSpec))))
                .do(function (o) { console.log({msg: '===GET_ENCODING', o})});
        }

        //{variant, attribute} -> ()
        function setEncodingRoute({loadViewsById, setEncoding}, jsonGraphArg) {

            console.log({msg: '=====setEncodingRoute', jsonGraphArg});

            const workbookIds = Object.keys(jsonGraphArg.workbooksById);
            const viewIds =
                [].concat(...workbookIds.map( (workbookId) =>
                        Object.keys(jsonGraphArg.workbooksById[workbookId].viewsById)));

            if (workbookIds.length > 1 || viewIds.length > 1) {
                return Observable.throw('setEncodingRoute does not support workbook batching');
            }

            return loadViewsById({
                    workbookIds, viewIds
                })
                .mergeMap(({ workbook, view }) => {

                    const top = jsonGraphArg.workbooksById[workbookIds[0]].viewsById[viewIds[0]];
                    const nestedConfigs =
                        Object.keys(top.encodings)
                            .map((graphType) =>
                                Object.keys(top.encodings[graphType])
                                    .map((encodingType) => ({encodingType, graphType})));
                    const configs = [].concat(...nestedConfigs);

                    const encodingSpecs =
                        configs.map( ({graphType, encodingType}) => {
                            const encoding = top.encodings[graphType][encodingType];
                            return setEncoding({
                                    view, encoding: {graphType, encodingType, ...encoding}
                                })
                                .map((encodingSpec) => $value(
                                    path.slice(0, path.length - 2).concat(graphType, encodingType),
                                    $atom(encodingSpec)));
                        });
                    return Observable.merge(...encodingSpecs);
                })
                .do(function (o) { console.log({msg: '===SET_ENCODING', o})});

        }
    }
}
