import { PropTypes } from 'react';
import { App } from 'viz-shared/containers/app';
import { Renderer } from './renderer';
import { withContext, hoistStatics } from 'recompose';
import { Editor as ExpressionEditor } from './expressions';

const ClientApp = hoistStatics(
    withContext(
        { Renderer: PropTypes.func,
          ExpressionEditor: PropTypes.func }, () => (
        { Renderer,
          ExpressionEditor })
    )
)(App);

export default ClientApp;
