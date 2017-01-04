import React from 'react';
import createHistory from 'history/createBrowserHistory';
import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);

export default class UrlHistory extends React.Component {
    constructor(props) {
        super(props);

        const { switchScreen, selectInvestigation } = this.props;
        const history = createHistory();

        history.listen(({ state }) => {
            log.debug(`Back/Forward button pressed, jumping to ${state}`)
            const { activeScreen, activeInvestigation } = state;
            switchScreen(activeScreen);
            selectInvestigation(activeInvestigation.id);
        });

        this.state = {
            history: history
        };
    }

    _getPath(activeScreen, activeInvestigation) {
        if (activeScreen === 'investigation') {
            return `/${activeScreen}/${activeInvestigation.id}`
        } else {
            return `/${activeScreen || 'home'}`;
        }
    }

    render() {
        return null;
    }

    componentDidUpdate() {
        const { history } = this.state;
        const { activeScreen, activeInvestigation } = this.props;
        const pathname = this._getPath(activeScreen, activeInvestigation);

        if (history.location.pathname !== pathname) {
            log.debug(`Pushing new path ${pathname}`);
            history.push({
                pathname, state: {
                    activeScreen, activeInvestigation
                }
            });
        }
    }
}
