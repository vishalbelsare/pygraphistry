import appSchema from './schema';
import App from './components/app';
import compose from 'recompose/compose';
import MainScreen from './components/main-screen';
import { connect } from '@graphistry/falcor-react-redux';
import { appContainer, mainScreenContainer } from './containers';

const MainScreenContainer = mainScreenContainer(MainScreen);
const AppContainer = compose(
    connect, appSchema, appContainer
)((props) => <App {...props}/>);

export { AppContainer as App };
export { MainScreenContainer as MainScreen };
