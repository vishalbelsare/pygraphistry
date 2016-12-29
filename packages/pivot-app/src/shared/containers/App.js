import React from 'react';
import InvestigationScreen from './InvestigationScreen.js';
import ConnectorScreen from './ConnectorScreen.js'
import HomeScreen from './HomeScreen.js';
import { UrlHistory } from './UrlHistory';
import { switchScreen } from '../actions/app.js';
import { selectInvestigation } from '../actions/investigationScreen';
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';
import { Alert, Button } from 'react-bootstrap';
import styles from './styles.less';

function renderErrorBanner(serverStatus) {
    const title = serverStatus.title ? (<h4><b>{ serverStatus.title }</b></h4>) : null

    return (
        <Alert bsStyle='danger' className={styles.serverStatusAlert}>
            { title }
            <p>
                { serverStatus.message }
            </p>
            <Button bsStyle='danger' onClick={() => window.location.reload()}>
                Reload page
            </Button>
        </Alert>
    );
}

function renderApp({ currentUser, serverStatus, app, switchScreen, selectInvestigation}) {
    const screens = {
        'undefined': (<HomeScreen data={app}/>),
        'home': (<HomeScreen data={app}/>),
        'investigation': (<InvestigationScreen data={app}/>),
        'connectors': (<ConnectorScreen data={app}/>)
    }

    const navState = {
        activeScreen: currentUser.activeScreen,
        activeInvestigation: currentUser.activeInvestigation
    };

    return (
        <div>
            <UrlHistory navState={navState}
                        switchScreen={switchScreen}
                        selectInvestigation={selectInvestigation} />
            { serverStatus && !serverStatus.ok && renderErrorBanner(serverStatus) }
            { currentUser && screens[currentUser.activeScreen] }
            <DevTools/>
        </div>
    );
}



const App = container({
    renderLoading: false,
    fragment: () =>
    `{
        currentUser: {
            activeScreen,
            activeInvestigation
        },
        serverStatus
    }`,
    mapFragment: app => ({app: app, ...app}),
    dispatchers: {
        switchScreen: switchScreen,
        selectInvestigation: selectInvestigation
    }
})(renderApp);

export default hoistStatics(connect)(App);
