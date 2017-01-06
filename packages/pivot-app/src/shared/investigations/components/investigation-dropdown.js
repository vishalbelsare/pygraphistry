import Select from 'react-select';
import styles from 'pivot-shared/styles.less';


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
