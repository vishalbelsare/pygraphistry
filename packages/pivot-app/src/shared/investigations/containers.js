import { Pivot } from 'pivot-shared/pivots';
import { Template } from 'pivot-shared/templates';
import { Investigation } from 'pivot-shared/investigations';
import { container } from '@graphistry/falcor-react-redux';

import {
    splicePivot,
    insertPivot,
    searchPivot,
    dismissAlert,
    togglePivots,
    graphInvestigation,
} from 'pivot-shared/actions/investigation';

import {
    copyInvestigation,
    saveInvestigation,
    createInvestigation,
} from 'pivot-shared/actions/investigationScreen';

export const investigationContainer = container({
    fragment: ({ pivots } = {}) => `{
        id, name, status,
        url, tags, eventTable,
        modifiedOn, pivots: ${
            Pivot.fragments(pivots)
        }
    }`,
    mapFragment: ({ id, pivots, status, eventTable } = {}) => ({
        id, pivots, status, eventTable
    }),
    dispatchers: {
        splicePivot,
        insertPivot,
        searchPivot,
        dismissAlert,
        togglePivots,
        saveInvestigation,
        copyInvestigation,
        graphInvestigation,
    }
});

export const investigationScreenContainer = container({
    renderLoading: false,
    fragment: ({ templates, investigations, activeInvestigation } = {}) => `{
        templates: ${ Template.fragments(templates) },
        investigations: ${ Investigation.fragments(investigations) },
        activeInvestigation: ${ Investigation.fragment(activeInvestigation) }
    }`,
    mapFragment: (user = {}) => ({
        user, ...user
    }),
    dispatchers: {
        createInvestigation,
    }
});
