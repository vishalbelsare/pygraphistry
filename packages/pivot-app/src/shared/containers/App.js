import InvestigationScreen from './InvestigationScreen.js';
import HomeScreen from './HomeScreen.js';
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';
import { Alert, Button } from 'react-bootstrap';


function renderErrorBanner(serverStatus) {
    const title = serverStatus.title ? (<h4><b>{ serverStatus.title }</b></h4>) : null

    return (
        <Alert bsStyle='danger' closeLabel='test'>
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

function renderApp({ currentUser, serverStatus }) {
    const screens = {
        'undefined': (<HomeScreen/>),
        'home': (<HomeScreen/>),
        'investigation': (<InvestigationScreen/>)
    }

    const errorBanner = serverStatus && !serverStatus.ok
    return (
        <div>
            { serverStatus && !serverStatus.ok && renderErrorBanner(serverStatus) }
            { currentUser && screens[currentUser.activeScreen] }
            <DevTools/>
        </div>
    );
}



const App = container({
    fragment: () =>
    `{
        currentUser: {
            activeScreen
        },
        serverStatus
    }`
})(renderApp);

export default hoistStatics(connect)(App);
