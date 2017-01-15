import Select from 'react-select';
import styles from './investigations.less';


export default function InvestigationDropdown({ investigations, activeInvestigation, selectInvestigation }) {
    return (
        <span className={styles['investigations-dropdownbutton']}>
            <Select name="form-field-name"
                    clearable={false}
                    backspaceRemoves={false}
                    onChange={ ({value}) => { selectInvestigation(value); } }
                    value={{value: activeInvestigation.id, label: activeInvestigation.name}}
                    options={
                        investigations.map(({id, name}) => {
                            return {value: id, label: name};
                        })
                    }
            />
        </span>
    );
}
