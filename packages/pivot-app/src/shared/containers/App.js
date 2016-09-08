import React from 'react'
import Investigation from './Investigation.js'
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';
import { setInvestigationName } from '../actions/investigationList';
import { DropdownButton, MenuItem } from 'react-bootstrap';

function InvestigationList({ investigations = [], selectedInvestigation, setInvestigationName }) {
    if (investigations.length === 0) {
        return null;
    }
    return (
        <DropdownButton id='investigations-list-dropdown'
                        title={selectedInvestigation.name || 'Investigations'}
                        onSelect={(id, event) => setInvestigationName({ id })}>
        {investigations.map(({ id, name }, index) => (
            <MenuItem eventKey={id} key={`${index}: ${id}`}>
                {name}
            </MenuItem>
        ))}
        </DropdownButton>
    );
}

function GraphFrame({ url }) {
    return (
        <iframe src={url}
            scrolling="no"
            onWheel={(e) => {
                e.stopPropagation();
                e.preventDefault();
                return false;
            }}
            style={{
                width:'100%',
                height:'700px',
                border:'10px solid #DDD',
                boxSizing: 'border-box',
                overflow: 'hidden'
            }} />
    );
}

function renderApp({ title, investigations, selectedInvestigation = {}, setInvestigationName }) {
    return (
        <div>
            <h1>{title}</h1>
            <GraphFrame url={selectedInvestigation.url}/>
            <InvestigationList investigations={investigations}
                               selectedInvestigation={selectedInvestigation}
                               setInvestigationName={setInvestigationName}/>
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
        investigations: {
            'length',
            [0...${investigations.length}]: { name, id }
        },
        selectedInvestigation: ${Investigation.fragment(selectedInvestigation)}
    }`,
    (state) => (state),
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
    { setInvestigationName: setInvestigationName }
)(renderApp);

export default hoistStatics(connect)(App);
