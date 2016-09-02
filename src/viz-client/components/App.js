import { PropTypes } from 'react';
import { App } from 'viz-shared/containers/app';
import { Renderer } from './renderer';
import { ExpressionEditor } from './ExpressionEditor';
import { withContext, hoistStatics } from 'recompose';

const ClientApp = hoistStatics(
    withContext(
        { Renderer: PropTypes.func,
          ExpressionEditor: PropTypes.func }, () => (
        { Renderer,
          ExpressionEditor })
    )
)(App);

export default ClientApp;
