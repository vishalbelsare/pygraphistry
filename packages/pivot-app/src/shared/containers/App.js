import React from 'react'
import Investigation from './Investigation.js'
import InvestigationDropdown from './InvestigationDropdown.js'
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';
import { setInvestigationName } from '../actions/investigationList';

function GraphFrame({ url }) {
    return (
        <iframe src={url} scrolling="no" style={{
            width:'100%',
            height:'700px',
            border:'10px solid #DDD',
            boxSizing: 'border-box',
            overflow: 'hidden'
        }} />
    );
}

function renderApp({ title, investigations, setInvestigationName, selectedInvestigation = {} }) {
    return (
        <div>
            <h1>{title}</h1>
            <GraphFrame url={selectedInvestigation.url}/>
            <InvestigationDropdown data={investigations}
                                   setInvestigationName={setInvestigationName}
                                   selectedInvestigation={selectedInvestigation}/>
            {selectedInvestigation ?
                <Investigation data={selectedInvestigation}/>
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
            InvestigationDropdown.fragment()
        },
        selectedInvestigation: ${Investigation.fragment(selectedInvestigation)}
    }`,
    (state) => state,
    { setInvestigationName: setInvestigationName }
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
