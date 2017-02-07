import React from 'react';
import createHistory from 'history/createBrowserHistory';
import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);

export default class UrlHistory extends React.Component {
    constructor(props) {
        super(props);

        const history = createHistory();

        history.listen(({ state }, action) => {
            if (action === 'POP' && state !== undefined) {
                log.debug({navState: state}, `Back/Forward button pressed, jumping`)
                const { activeScreen, activeInvestigation } = state;
                this._setServerState(activeScreen, activeInvestigation);
            }
        });

        this.state = {
            history: history
        };
    }

    _getPath(activeScreen, activeInvestigation) {
        if (activeScreen === 'investigation') {
            return `/pivot/${activeScreen}/${activeInvestigation.id}`
        } else {
            return `/pivot/${activeScreen || 'home'}`;
        }
    }

    _setServerState(activeScreen, activeInvestigation) {
        const { switchScreen, selectInvestigation } = this.props;

        switchScreen(activeScreen);
        if (activeInvestigation.id) {
            selectInvestigation(activeInvestigation.id);
        }
    }

    render() {
        return null;
    }

    componentWillMount() {
        const { activeScreen, activeInvestigation } = this.props;
        const { history } = this.state;

        this._setServerState(activeScreen, activeInvestigation);

        const pathname = this._getPath(activeScreen, activeInvestigation);
        history.push({
            pathname, state: {
                activeScreen, activeInvestigation
            }
        });
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
