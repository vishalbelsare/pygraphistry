import { container } from '@graphistry/falcor-react-redux';
import { ButtonGroup, Button, Glyphicon } from 'react-bootstrap';
import InvestigationDropdown from './InvestigationDropdown.js';
import {
    selectInvestigation,
    createInvestigation,
    setInvestigationName,
    saveInvestigation,
    copyInvestigation
} from '../actions/app';


function renderInvestigationHeader({investigations, selectedInvestigation, createInvestigation,
                                    selectInvestigation, setInvestigationName, copyInvestigation,
                                    saveInvestigation}) {
    return (
        <nav className="navbar navbar-default navbar-fixed" style={{height: '61px'}}>
            <div className="container-fluid">
                <div className="navbar-header">
                    <button type="button" className="navbar-toggle" data-toggle="collapse">
                        <span className="sr-only">Toggle navigation</span>
                        <span className="icon-bar"></span>
                        <span className="icon-bar"></span>
                        <span className="icon-bar"></span>
                    </button>

                    <span className="simple-text" style={{display: 'inline-block', float: 'left'}}>
                        { investigations === undefined ?
                            null :
                            <InvestigationDropdown data={investigations}
                                selectInvestigation={selectInvestigation}
                                selectedInvestigation={selectedInvestigation} />
                        }
                    </span>

                    <input key={selectedInvestigation.id + 'setInvestigationNameTextBox'}
                        className="navbar-brand on" type='text' value={selectedInvestigation.name}
                        readOnly={false} disabled={false} onChange={
                            (ev) => ev.preventDefault() || setInvestigationName(ev.target.value)
                        }
                    />
                </div>

                <div className="collapse navbar-collapse">
                    <ButtonGroup>
                        <Button onClick={createInvestigation}>
                            <Glyphicon glyph="plus" />
                            </Button>
                        <Button onClick={(e) => copyInvestigation(selectedInvestigation.id)}>
                            <Glyphicon glyph="duplicate" />
                        </Button>
                        <Button onClick={(e) => saveInvestigation(selectedInvestigation.id)}>
                            <Glyphicon glyph="floppy-disk" />
                        </Button>
                    </ButtonGroup>
                </div>
            </div>
        </nav>
    );
}

export default container(
    ({ investigations = [] } = {}) =>
    `{
        investigations: ${
            InvestigationDropdown.fragment()
        }
    }`,
    (state) => state,
    {
        selectInvestigation: selectInvestigation,
        createInvestigation: createInvestigation,
        setInvestigationName: setInvestigationName,
        saveInvestigation: saveInvestigation,
        copyInvestigation: copyInvestigation
    }

)(renderInvestigationHeader);
