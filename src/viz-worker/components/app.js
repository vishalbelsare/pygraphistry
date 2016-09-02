import { PropTypes } from 'react';
import { App } from 'viz-shared/containers/app';
import { Renderer } from 'viz-shared/containers/scene'
import {
    withContext,
    hoistStatics,
    renderNothing
} from 'recompose';

const ServerApp = hoistStatics(
    withContext(
        { Renderer: PropTypes.func,
          ExpressionEditor: PropTypes.func }, () => (
        { Renderer: Renderer,
          ExpressionEditor: renderNothing() })
    )
)(App);

export default ServerApp;
