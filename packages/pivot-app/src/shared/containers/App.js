import InvestigationScreen from './InvestigationScreen.js';
import HomeScreen from './HomeScreen.js';
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';


function renderApp({ currentUser }) {
    const screens = {
        'undefined': (<HomeScreen/>),
        'home': (<HomeScreen/>),
        'investigation': (<InvestigationScreen/>)
    }

    return (
        <div>
            { screens[currentUser.activeScreen] }
            <DevTools/>
        </div>
    );
}

const App = container({
    fragment: () => `{
        currentUser: {
            activeScreen
        }
    }`
})(renderApp);

export default hoistStatics(connect)(App);
