import { Observable } from 'rxjs';
import { $ref, $atom, $value, $invalidate } from '@graphistry/falcor-json-graph';
import { getHandler, setHandler } from 'viz-app/router';

const encodingGraphType = 'point';
const tabNewEncodings = {
    legendTypeTab: { icon: 'legendtypeicon', size: 'legendtypesize', color: 'legendtypecolor' },
    legendPivotTab: { icon: 'legendpivoticon', size: 'legendpivotsize', color: 'legendpivotcolor' }
};

export function legend(path, base) {
    return function legend({ loadViewsById, getDefaultEncoding, setDefaultEncoding }) {
        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setActiveTabAndChangeEncodings = setHandler(
            path,
            loadViewsById,
            (
                legendNode,
                legendActiveTabKey,
                legendNewActiveTab,
                legendPath,
                { workbook, view }
            ) => {
                // first set the value locally
                legendNode[legendActiveTabKey] = legendNewActiveTab;
                const falcorTabUpdate = Observable.of($value(legendPath, legendNewActiveTab));

                // now set new encodings!
                const newEncodings = tabNewEncodings[legendNewActiveTab];
                const newSetEncodings = Object.keys(newEncodings).map(k => {
                    const e = getDefaultEncoding({
                        view,
                        encoding: { graphType: encodingGraphType, encodingType: newEncodings[k] }
                    });
                    if (!e) return Observable.empty();
                    return setDefaultEncoding({
                        view,
                        encoding: { ...e, encodingType: k }
                    }).map(encodingSpec =>
                        $invalidate(legendPath.slice(0, -2).concat(['encodings', e.graphType, k]))
                    );
                });
                return falcorTabUpdate.merge(...newSetEncodings);
            }
        );

        return [
            {
                get: getValues,
                set: setValues,
                route: `${base}['legend'][{keys}]`
            },
            {
                set: setActiveTabAndChangeEncodings,
                route: `${base}['legend'].activeTab`
            },
            {
                get: getValues,
                route: `${base}['legend'].controls[{keys}]`
            },
            {
                get: getValues,
                set: setValues,
                route: `${base}['legend'].controls[{keys}][{keys}]`
            }
        ];
    };
}
