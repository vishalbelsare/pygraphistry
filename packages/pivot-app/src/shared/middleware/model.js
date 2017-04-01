import { Model } from '@graphistry/falcor';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


const initialModels = {
    'connectors': (req) => getInitialModel(req, 'connectors'),
    'home': (req) => getInitialModel(req, 'home'),
    'investigation': (req) => getInitialModel(req, 'investigation')
}

function getInitialModel(req, screenName) {
    const userId = req.user.userId;
    const model = {
        currentUser: $ref(`usersById['${userId}']`),
        usersById: {
            [userId]: {
                activeScreen: screenName
            }
        }
    };


    let { investigationId } = req.params;
    if (investigationId !== undefined && investigationId !== '') {
        const investigationRef = $ref(
            `investigationsById['${investigationId}']`
        );
        model.usersById[userId].activeInvestigation = investigationRef;
    }

    return model;
}


export function falcorModelFactory(getDataSource) {
    return function getFalcorModel(req) {
        const getModel = initialModels[req.params.activeScreen] || initialModels['home'];

        return new Model({
            cache: getModel(req),
            source: getDataSource(req),
            recycleJSON: true,
            treatErrorsAsValues: true
        });
    }
}
