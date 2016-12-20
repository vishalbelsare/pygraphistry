import React from 'react';
import { container } from '@graphistry/falcor-react-redux';
import Select from 'react-select';

import styles from './styles.less';


function renderInvestigationDropdown({ investigations, activeInvestigation, selectInvestigation }) {
    return (<span className={styles['investigations-dropdownbutton']}>
                <Select
                name="form-field-name"
                clearable={false}
                backspaceRemoves={false}
                value={{value: activeInvestigation.id, label: activeInvestigation.name}}
                options={
                    investigations.map(({id, name}) => {
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
