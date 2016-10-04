import InvestigationScreen from './InvestigationScreen.js';
import HomeScreen from './HomeScreen.js';
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';


function renderApp({ title }) {
    return (
        <div>
            <InvestigationScreen/>
            <DevTools/>
        </div>
    );
}

const App = container(
    () => `{
        title
    }`,
    (state) => state,
    {}
)(renderApp);

export default hoistStatics(connect)(App);
