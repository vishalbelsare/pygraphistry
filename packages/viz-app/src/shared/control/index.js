import compose from 'recompose/compose';
import withControlSchema from './schema';
import Control from './components/control';
import { withControlContainer } from './containers';

const ControlContainer = compose(
    withControlSchema, withControlContainer
)(Control);

export { ControlContainer as Control };
export default ControlContainer;
