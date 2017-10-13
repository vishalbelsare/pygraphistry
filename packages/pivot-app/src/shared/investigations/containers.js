import { Pivot } from 'pivot-shared/pivots';
import { Template } from 'pivot-shared/templates';
import { Investigation } from 'pivot-shared/investigations';
import { container } from '@graphistry/falcor-react-redux';

import {
    saveLayout,
    splicePivot,
    insertPivot,
    searchPivot,
    dismissAlert,
    togglePivots,
    graphInvestigation
} from 'pivot-shared/actions/investigation';

import {
    copyInvestigation,
    saveInvestigation,
    createInvestigation
} from 'pivot-shared/actions/investigationScreen';

export const investigationContainer = container({
    fragment: ({ pivots } = {}) => `{
        id, name, status, datasetType, datasetName, eventTable, controls, modifiedOn, description, time, tags, url, layout, axes, edgeOpacity,
        pivots: ${Pivot.fragments(pivots)}
    }`,
    mapFragment: (
        {
            id,
            name,
            pivots,
            status,
            datasetName,
            datasetType,
            controls,
            eventTable,
            layout,
            axes,
            edgeOpacity,
            description,
            time
        } = {},
        props,
        $falcor
    ) => ({
        id,
        name,
        pivots,
        status,
        datasetName,
        datasetType,
        controls,
        eventTable,
        layout,
        axes,
        edgeOpacity,
        description,
        time,
        $falcor
    }),
    dispatchers: {
        saveLayout,
        splicePivot,
        insertPivot,
        searchPivot,
        dismissAlert,
        togglePivots,
        saveInvestigation,
        graphInvestigation
    }
});

export const investigationScreenContainer = container({
    renderLoading: false,
    fragment: ({ templates, investigations, activeInvestigation } = {}) => `{
        activeScreen,
        graphistryHost,
        templates: ${Template.fragments(templates)},
        investigations: ${Investigation.fragments(investigations)},
        activeInvestigation: ${Investigation.fragment(activeInvestigation)}
    }`,
    mapFragment: (user = {}) => ({
        user,
        ...user,
        investigations: ((user && user.investigations) || []).filter(Boolean)
    }),
    dispatchers: {
        copyInvestigation,
        createInvestigation
    }
});
