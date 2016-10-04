import { container } from '@graphistry/falcor-react-redux';
import { DropdownButton, MenuItem } from 'react-bootstrap';
import styles from './styles.less';


function renderInvestigationDropdown({ investigations, selectedInvestigation, selectInvestigation }) {
    if (investigations.length === 0) {
        return null;
    }

    return (
        <div className={styles.dropdownbutton}>
            <DropdownButton id='investigations-list-dropdown'
                            title={selectedInvestigation.name || 'Investigations'}
                            onSelect={(id, event) => selectInvestigation({ id })}>
            {investigations.map(({ id, name }, index) => (
                <MenuItem eventKey={id} key={`${index}: ${id}`}>
                    {name}
                </MenuItem>
            ))}
            </DropdownButton>
        </div>
    );
}

function mapStateToFragment(investigations = []) {
    return `{
        'length',
        [0...${investigations.length}]: { id, name }
    }`;
}

export default container(
    mapStateToFragment,
    investigations => ({investigations: investigations})
)(renderInvestigationDropdown);
