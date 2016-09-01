import React from 'react'
import InvestigationList from './InvestigationList'
import TableBody from './TableBody.js'
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from 'reaxtor-redux';

function renderApp({ title, investigations, selectedInvestigation }) {
    return (
        <div>
            <h1>{title}</h1>
            {investigations ? 
                <InvestigationList data={investigations}/> 
                : null
            }
            {selectedInvestigation ? 
                <TableBody data={selectedInvestigation}/> 
                : null
            }
            <DevTools/>
        </div>
    );
}

const App = container(
    ({ cols = [], investigations = [], selectedInvestigation } = {}) => `{
        title,
        investigations: ${
            InvestigationList.fragment(investigations)
        },
        selectedInvestigation: ${TableBody.fragment(selectedInvestigation)}
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
