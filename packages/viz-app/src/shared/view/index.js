import View from './components/view';
import withViewSchema from './schema';
import compose from 'recompose/compose';
import { withViewContainer } from './containers';

const ViewContainer = compose(
    withViewSchema, withViewContainer
)(View);

export { ViewContainer as View };
export default ViewContainer;
