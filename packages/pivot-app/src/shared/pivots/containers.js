import { Template } from 'pivot-shared/templates';
import { container } from '@graphistry/falcor-react-redux';
import { setPivotAttributes } from 'pivot-shared/actions/pivotRow';

export const pivotContainer = container({
    renderLoading: false,
    fragment: ({ pivotTemplate = {} } = {}) => {
        const { pivotParameterKeys = [] } = pivotTemplate;
        if (pivotParameterKeys.length === 0) {
            return `{
                id, status, enabled, description,
                resultCount, resultSummary,
                pivotTemplate: ${
                    Template.fragment(pivotTemplate)
                }
            }`
        }
        return `{
            id, status, enabled, description,
            resultCount, resultSummary,
            pivotParameters: {
                ${ pivotParameterKeys }
            },
            pivotTemplate: ${
                Template.fragment(pivotTemplate)
            }
        }`;
    },
    mapFragment: (pivot = {}) => {
        return {
            id: pivot.id,
            status: pivot.status,
            enabled: pivot.enabled,
            description: pivot.description,
            resultCount: pivot.resultCount,
            resultSummary: pivot.resultSummary,
            pivotTemplate: pivot.pivotTemplate,
            pivotParameters: pivot.pivotParameters || {}
        };
    },
    dispatchers: {
        setPivotAttributes: setPivotAttributes,
    }
});
