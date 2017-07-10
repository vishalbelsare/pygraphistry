import _ from 'underscore';
import Select from 'react-select';
import ComboSelector from './combo-selector';
import { DateTimeRangePicker } from 'pivot-shared/components/DateTimeRangePicker/DateTimeRangePicker.js';
import styles from './pivots.less';

import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);


const componentsByInputType = {
    text: TextCell,
    number: TextCell,
    textarea: TextareaCell,
    combo: ComboCell,
    multi: MultiCell,
    daterange: DateRange,
    pivotCombo: PivotCombo,
    label: Label
};

export default function PivotCell({ paramUI, ...props }) {
    const Component = componentsByInputType[paramUI.inputType];
    if (!Component) {
        throw new Error('Unknown pivot cell type:' + paramUI.inputType);
    }
    return <div className={styles['pivot-cell']}
        style={'isVisible' in paramUI && !paramUI.isVisible ? {display: 'none'} : {}}>
        <Component paramUI={paramUI} {...props}/>
    </div>
}

function Label({ paramUI }) {
    return (
        <div className={styles['pivot-label-param']}>
            <p>{ paramUI.label }</p>
        </div>
     );
}

function TextCell({ id, paramKey, paramValue, paramUI, handlers }) {
     return (
         <div className={styles['pivot-text-param']} key={`pcell-${id}-${paramKey}`}>
            <label>{ paramUI.label }</label>
            <input
                type='th'
                defaultValue={paramValue}
                placeholder={paramUI.placeholder}
                readOnly={false}
                disabled={false}
                onChange={ev => ev.preventDefault() ||
                    handlers.setPivotAttributes({
                        [`pivotParameters.${paramKey}`]: ev.target.value
                    })
                }
            />
        </div>
     );
}

function TextareaCell({ id, paramKey, paramValue, paramUI, handlers }) {
     return (
         <div className={styles['pivot-textarea-param']} key={`pcell-${id}-${paramKey}`}>
            <label>{ paramUI.label }</label>
            <textarea
                type='th'
                defaultValue={paramValue}
                placeholder={paramUI.placeholder}
                readOnly={false}
                disabled={false}
                onChange={ev => ev.preventDefault() ||
                    handlers.setPivotAttributes({
                        [`pivotParameters.${paramKey}`]: ev.target.value
                    })
                }
            />
        </div>
     );
}

// The combo box compenents only handles string values. We stringify the default value
// and the list of options and parse then back when updating the falcor model.
function PivotCombo({ id, paramKey, paramValue, paramUI, previousPivots, handlers }) {
    let options =
        [
            {
                value: JSON.stringify(previousPivots.map(({ id }) => id)),
                label: previousPivots.length > 1 ? 'All Pivots': 'Pivot 1'
            }
        ];

    if (previousPivots.length > 1) {
        options = options.concat(
            previousPivots.map((pivot, index) =>
                ({
                    value: JSON.stringify([ pivot.id ]),
                    label: `Pivot ${index + 1}`
                })
            )
        );
    }

    // Wrap setPivotAttributes to parse back the selected item.
    const originalSPA = handlers.setPivotAttributes;
    const stringifiedSPA = (params, investId) => {
        return originalSPA(
            _.mapObject(params, stringifiedArray => JSON.parse(stringifiedArray)
            ), investId
        );
    };

    return (
        <ComboCell id={id}
                   paramKey={paramKey}
                   paramValue={JSON.stringify(paramValue)}
                   paramUI={{ options, ...paramUI }}
                   handlers={{ setPivotAttributes: stringifiedSPA }}
                   />
    );
}

function ComboCell({ id, paramKey, paramValue, paramUI, handlers }) {
    return (
        <div className={styles['pivot-combo-param']} key={`pcell-${id}-${paramKey}`}>
            <ComboSelector pivotId={id}
                           fldKey={paramKey}
                           paramUI={paramUI}
                           fldValue={paramValue}
                           options={paramUI.options}
                           key={`pcell-${id}-${paramKey}`}
                           setPivotAttributes={handlers.setPivotAttributes}
            />
        </div>
    );
}

function MultiCell({ id, paramKey, paramValue, paramUI, handlers }) {

    const rawOptions = paramUI.options || [];
    const options = rawOptions.concat(
            (paramValue||[])
                .filter((value) => 
                    rawOptions.filter((opt) => opt.id === value).length === 0)
                .map((value) =>
                    ({id: value, name: value})));

    return (
        <div key={`pcell-${id}-${paramKey}`}
            className={styles['pivot-multi-param']}>
            <label>{ paramUI.label }</label>
            <Select.Creatable id={`selector-${id}-${paramKey}`}
                    name={`selector-${id}-${paramKey}`}
                    clearable={true}
                    labelKey="name"
                    valueKey="id"
                    value={paramValue}
                    options={options}
                    multi={true}
                    joinValues={true}
                    onChange={ (selected) =>
                        handlers.setPivotAttributes({
                            [`pivotParameters.${paramKey}`]: _.pluck(selected, 'id')
                        })
                    }/>
            </div>
    )
}

function DateRange({ $falcor, id, paramKey, paramValue, paramUI }) {
    return (
			<div className={styles['pivot-date-range-param']} key={`pcell-${id}-${paramKey}`}>
            <div className={styles['pivotDate']}><DateTimeRangePicker
                getKey={ () => paramKey }
                $falcor={$falcor}
                baseid={id}
                range={paramValue}
            /></div>
        </div>
    );
}
