import React from 'react'
import InvestigationList from './InvestigationList'
import TableBody from './TableBody.js'
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from 'reaxtor-redux';
import { setInvestigationName } from '../actions/investigationList';


function renderApp({ title, investigations, selectedInvestigation, setInvestigationName }) {
    return (
        <div>
            <h1>{title}</h1>
            <div className='investigation-list-comp'> { investigations ?
                <select onChange = {
                    function(ev) {
                        const selectedId = ev.target.options[ev.target.selectedIndex].value;
                        return ev.preventDefault() || setInvestigationName({id: selectedId});
                    }
                }>
                    { investigations.map((investigation, index) =>
                        <option
                            value={`${investigation.id}`}
                            key={`${index}: ${investigation.name}`}>
                            {investigation.name}
                        </option>
                    )}
                </select> :
                null}
            </div>
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
        investigations: {
            'length',
            [0...${investigations.length}]: { name, id }
        },
        selectedInvestigation: {
            'name',
            'pivots': { length }
        }
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
