import { container } from '@graphistry/falcor-react-redux';
import { DropdownButton, MenuItem } from 'react-bootstrap';
import Select from 'react-select';

import styles from './styles.less';


function renderInvestigationDropdown({ investigations, selectedInvestigation, selectInvestigation }) {
    return (<span className={styles['investigations-dropdownbutton']}>
                <Select
                name="form-field-name"
                value="one"
                clearable={false}
                backspaceRemoves={false}
                value={{value: selectedInvestigation.id, label: selectedInvestigation.name}}
                options={
                    investigations.map(({id, name}, index) => {
                        return {value: id, label: name};
                    })
                }
                onChange={ ({value}) => { selectInvestigation(value); } }
            /></span>);
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
