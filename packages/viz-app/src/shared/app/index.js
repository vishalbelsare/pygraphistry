import withAppSchema from './schema';
import App from './components/app';
import compose from 'recompose/compose';
import { withAppContainer } from './containers';
import { connect } from '@graphistry/falcor-react-redux';
import * as Scheduler from 'rxjs/scheduler/animationFrame';

const AppContainer = compose(
    (App) => connect(App, Scheduler.animationFrame),
    withAppSchema, withAppContainer
)(App);

export { AppContainer as App };
export default AppContainer;
