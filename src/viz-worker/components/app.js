import { PropTypes } from 'react';
import { App } from 'viz-shared/containers/app';
import {
    withContext,
    hoistStatics,
    renderNothing
} from 'recompose';

const ServerApp = hoistStatics(
    withContext(
        { ExpressionEditor: PropTypes.func }, () => (
        { ExpressionEditor: renderNothing() })
    )
)(App);

export default ServerApp;
