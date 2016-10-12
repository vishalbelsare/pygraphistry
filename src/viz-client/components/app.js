import { PropTypes } from 'react';
import { App } from 'viz-shared/containers/app';
import { withContext, hoistStatics } from 'recompose';
import { Editor as ExpressionEditor } from './expressions';

const ClientApp = hoistStatics(
    withContext(
        { ExpressionEditor: PropTypes.func }, () => (
        { ExpressionEditor })
    )
)(App);

export default ClientApp;
