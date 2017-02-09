import { container } from '@graphistry/falcor-react-redux';
import { switchScreen } from 'pivot-shared/actions/app';
import {
    copyInvestigation,
    createInvestigation,
    selectInvestigation,
    deleteInvestigations,
    setInvestigationParams,
} from 'pivot-shared/actions/investigationScreen';

import { MainScreen } from 'pivot-shared/main';
import { Template } from 'pivot-shared/templates';
import { ConnectorScreen } from 'pivot-shared/connectors';
import { Investigation, InvestigationScreen } from 'pivot-shared/investigations';

const getActiveScreenComponent = (function() {
    let screens;
    let lastScreen = 'home';
    return function getActiveScreenComponent({ activeScreen = lastScreen }) {
        lastScreen = activeScreen;
        return (screens || (screens = {
            'home': MainScreen,
            'undefined': MainScreen,
            'connectors': ConnectorScreen,
            'investigation': InvestigationScreen,
        }))[activeScreen];
    }
})();

export const appContainer = container({
    renderLoading: true,
    fragment: ({ currentUser = {} } = {}) => {
        const ActiveScreen = getActiveScreenComponent(currentUser);
        return `{
            serverStatus,
            currentUser: {
                activeScreen, activeInvestigation: {
                    id, name
                },
                ... ${ ActiveScreen.fragment(currentUser) }
            }
        }`;
    },
    mapFragment: ({ serverStatus, currentUser = {} } = {}) => ({
        serverStatus, currentUser,
        ActiveScreen: getActiveScreenComponent(currentUser)
    }),
    dispatchers: {
        switchScreen,
        selectInvestigation
    }
});

export const mainScreenContainer = container({
    renderLoading: false,
    fragment: ({ templates, investigations } = {}) => `{
        id, name,
        templates: ${
            Template.fragments(templates)
        },
        investigations: ${
            Investigation.fragments(investigations)
        }
    }`,
    mapFragment: (user = {}) => ({
        ...user, user,
        numTemplates: user.templates &&
                      user.templates.length || 0
    }),
    dispatchers: {
        copyInvestigation,
        createInvestigation,
        deleteInvestigations,
        setInvestigationParams
    }
});
