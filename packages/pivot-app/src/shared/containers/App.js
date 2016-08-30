import React from 'react'
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from 'reaxtor-redux';

function renderApp({ title, total }) {
    return (
        <div>
            <h1>{title} - {total}</h1>
            <DevTools/>
        </div>
    );
}

const App = container(
    ({ cols = [], pivots = [], investigations = [] } = {}) => `{
        title
    }`
    /* todo:
        url, total, urls, urlIndex,
        cols: ${
            TableHeader.fragment(cols)
        },
        pivots: ${
            TableBody.fragment(pivots)
        },
        investigations: ${
            InvestigationList.fragment(investigations)
        }
    */
)(renderApp);

export default hoistStatics(connect)(App);
