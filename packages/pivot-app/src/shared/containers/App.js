import React from 'react'
import InvestigationList from './InvestigationList'
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from 'reaxtor-redux';

function renderApp({ title, investigations }) {
    return (
        <div>
            <h1>{title}</h1>
            {investigations ? 
                <InvestigationList data={investigations}/> 
                : null
            }
            <DevTools/>
        </div>
    );
}

const App = container(
    ({ cols = [], pivots = [], investigations = [] } = {}) => `{
        title,
        investigations: ${
            InvestigationList.fragment(investigations)
        }
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
