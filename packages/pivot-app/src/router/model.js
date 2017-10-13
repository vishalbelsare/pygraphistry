import { Model } from '@graphistry/falcor';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

const initialModels = {
    connectors: req => getInitialModel(req, 'connectors'),
    home: req => getInitialModel(req, 'home'),
    investigation: req => getInitialModel(req, 'investigation')
};

function getInitialModel(req, screenName) {
    const userId = req.user.userId;
    const cache = {
        currentUser: $ref(`usersById['${userId}']`),
        usersById: {
            [userId]: {
                activeScreen: screenName
            }
        }
    };

    const { investigationId } = req.params;
    if (investigationId !== undefined && investigationId !== '') {
        const investigationRef = $ref(`investigationsById['${investigationId}']`);
        cache.usersById[userId].activeInvestigation = investigationRef;
    }

    return cache;
}

export function configureFalcorModelFactory(getDataSource) {
    return function getFalcorModel(req) {
        const getCache = initialModels[req.params.activeScreen] || initialModels.home;

        return new Model({
            cache: getCache(req),
            source: getDataSource(req),
            recycleJSON: true,
            treatErrorsAsValues: true
        });
    };
}

export default configureFalcorModelFactory;
