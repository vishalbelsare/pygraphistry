import React from 'react';
import createHistory from 'history/createBrowserHistory';
import logger from '../logger.js';
const log = logger.createLogger(__filename);

export class UrlHistory extends React.Component {
    constructor(props) {
        super(props);

        const { switchScreen, selectInvestigation } = this.props;
        const history = createHistory();

        history.listen((location) => {
            log.debug(`Back/Forward button pressed, jumping to ${location.state}`)
            const {activeScreen, activeInvestigation} = location.state;

            switchScreen(activeScreen);
            selectInvestigation(activeInvestigation[1]);
        });

        this.state = {
            history: history
        };
    }

    _getPath({activeScreen, activeInvestigation}) {
        if (activeScreen === 'investigation') {
            return `/${activeScreen}/${activeInvestigation[1]}`
        } else {
            return `/${activeScreen}`;
        }
    }

    render() {
        const { navState } = this.props;
        const history = this.state.history;
        const currentPath = this._getPath(navState);

        if (history.location.pathname !== currentPath) {
            log.debug(`Pushing new path ${currentPath}`);
            history.push({
                pathname: currentPath,
                state: navState
            });
        }

        return null;
    }
}
