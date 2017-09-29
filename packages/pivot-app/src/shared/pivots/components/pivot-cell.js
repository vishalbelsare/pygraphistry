import { Observable } from 'rxjs';
import Select from 'react-select';
import RcSwitch from 'rc-switch';
import styles from './pivots.less';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';
import { DateTimeRangePicker } from 'pivot-shared/components';
import { Col, FormGroup, FormControl, ControlLabel } from 'react-bootstrap';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

const allPivotsIdValue = 'all-pivots';
const cellLabelCols = {
    // xs: 3,
    sm: 3,
    md: 3,
    lg: 3
};
const cellContentCols = {
    // xs: 9, xsOffset: 0,
    sm: 9,
    md: 9,
    lg: 9,
};
const cellFullCols = {
    style: { textAlign: 'left' },
    // xs: cellLabelCols.xs + cellContentCols.xs,
    sm: cellLabelCols.sm + cellContentCols.sm,
    md: cellLabelCols.md + cellContentCols.md,
    lg: cellLabelCols.lg + cellContentCols.lg,
};

const createPivotCellOnChangeContainer = (changeHandler) => mapPropsStream((propsStream) => {
    const { handler: onChange, stream: changes } = createEventHandler();
    return propsStream.switchMap((props) => {
        const { handlers = {} } = props;
        const { setPivotAttributes } = handlers;
        return (!props.paramKey || !setPivotAttributes
            ? Observable.empty()
            : changes.do(changeHandler(props, setPivotAttributes))
        )
        .ignoreElements()
        .startWith(props)
        .mapTo({ ...props, onChange });
    });
});

const setPivotCellAttributes = createPivotCellOnChangeContainer(
    ({ paramKey }, setPivotAttributes) => (event) =>
        event.preventDefault && event.preventDefault() || setPivotAttributes({
            [`pivotParameters.${paramKey}`]: event.target.value
        })
);

const setPivotCellMultiAttributes = createPivotCellOnChangeContainer(
    ({ paramKey }, setPivotAttributes) => (values) =>
        setPivotAttributes({
            [`pivotParameters.${paramKey}`]: values.map(({ id }) => id)
        })
);

const setPivotComboAttributes = createPivotCellOnChangeContainer(
    ({ paramKey, previousPivots }, setPivotAttributes) => (event) =>
        event.preventDefault && event.preventDefault() || setPivotAttributes({
            [`pivotParameters.${paramKey}`]: event.target.value === allPivotsIdValue
                ? previousPivots.map(({ id }) => id)
                : previousPivots.map(({ id }) => id)
                    .filter((id) => id === event.target.value)
                    .slice(0, 1)
        })
);

const componentsByInputType = {
    label: Label,
    bool: BoolCell,
    daterange: DateRange,
    text: setPivotCellAttributes(TextCell),
    number: setPivotCellAttributes(TextCell),
    textarea: setPivotCellAttributes(TextareaCell),
    combo: setPivotCellAttributes(ComboCell),
    multi: setPivotCellMultiAttributes(MultiCell),
    pivotCombo: setPivotComboAttributes(PivotCombo),
};

export default function PivotCell({ paramUI, ...props }) {
    const PivotCellComponent = componentsByInputType[paramUI.inputType];
    const shouldNotRender = !PivotCellComponent || ('isVisible' in paramUI && !paramUI.isVisible);
    return shouldNotRender ? null : (
        <PivotCellComponent paramUI={paramUI} {...props}/>
    );
}

function Label({ id, paramUI, paramKey }) {
    return (
        <FormGroup className={styles['pivot-label-param']}
                   controlId={`pivot-label-param-${id}-${paramKey}`}>
            <Col componentClass={ControlLabel} {...cellFullCols}>
                {paramUI.label}
            </Col>
        </FormGroup>
     );
}


function TextCell({ id, paramKey, paramValue, paramUI, onChange }) {
    return (
        <FormGroup className={styles['pivot-text-param']}
                   controlId={`pivot-text-param-${id}-${paramKey}`}>
            <Col componentClass={ControlLabel} {...cellLabelCols}>
                {paramUI.label}
            </Col>
            <Col {...cellContentCols}>
                <FormControl type='text'
                             onChange={onChange}
                             componentClass='input'
                             defaultValue={paramValue}
                             placeholder={paramUI.placeholder}/>
            </Col>
        </FormGroup>
    );
}

function TextareaCell({ id, paramKey, paramValue, paramUI, onChange }) {
    return (
        <FormGroup className={styles['pivot-textarea-param']}
                   controlId={`pivot-textarea-param-${id}-${paramKey}`}>
            <Col componentClass={ControlLabel} {...cellLabelCols}>
                {paramUI.label}
            </Col>
            <Col {...cellFullCols}>
                <FormControl onChange={onChange}
                             componentClass='textarea'
                             defaultValue={paramValue}
                             placeholder={paramUI.placeholder}/>
            </Col>
        </FormGroup>
    );
}

// The combo box compenents only handles string values. We stringify the default value
// and the list of options and parse then back when updating the falcor model.
function PivotCombo({ id, paramKey, paramValue, paramUI, previousPivots, onChange }) {

    let options, selectedPivotId;
    if (!paramValue || !paramValue[0]) {
        selectedPivotId = '';
    } else if (paramValue.length === 1) {
        selectedPivotId = paramValue[0];
    } else {
        selectedPivotId = allPivotsIdValue;
    }

    options = (previousPivots || []).map(({ id, pivotTemplate }, index) => ({
        value: id, label: `Pivot ${index + 1} (${pivotTemplate.name})`
    }));

    if (options.length > 1) {
        options = [{ value: allPivotsIdValue, label: 'All Pivots' }, ...options];
    }

    return (
        <ComboCell id={id}
                   onChange={onChange}
                   paramKey={paramKey}
                   paramValue={selectedPivotId}
                   paramUI={{ options, ...paramUI }}/>
    );
}

function ComboCell({ id, paramKey, paramValue, paramUI, onChange }) {
    if (!paramValue && paramUI.options && paramUI.options[0]) {
        setTimeout(() => onChange({ target: { value: paramUI.options[0].value }}));
    }
    return (
        <FormGroup className={styles['pivot-select-param']}
                   controlId={`pivot-select-param-${id}-${paramKey}`}>
            <Col componentClass={ControlLabel} {...cellLabelCols}>
                {paramUI.label}
            </Col>
            <Col {...cellContentCols}>
                <FormControl value={paramValue}
                             onChange={onChange}
                             componentClass='select'
                             placeholder={paramUI.placeholder}>
                {(paramUI.options || []).map(({ value, label }, index) => (
                    <option value={value} key={`select-option-${id}-${paramKey}-${index}`}>
                        {label}
                    </option>
                ))}
                </FormControl>
            </Col>
        </FormGroup>
    );
}

function BoolCell({ id, paramKey, paramValue, paramUI, onChange }) {
    return (
        <FormGroup className={styles['pivot-bool-param']}
                   controlId={`pivot-bool-param-${id}-${paramKey}`}>
            <Col {...cellFullCols}>
                <RcSwitch onChange={onChange}
                          defaultChecked={paramValue}
                          checkedChildren={paramUI.label}
                          unCheckedChildren={paramUI.label}/>
            </Col>
        </FormGroup>
    );
}

function MultiCell({ id, paramKey, paramValue, paramUI, onChange }) {

    const options = paramUI.options || [];
    const optionIds = options.reduce((ids, { id }) => ({
        ...ids, [id]: true
    }), {});

    const multiOptions = options.concat(
        (paramValue || [])
            .filter((id) => !optionIds.hasOwnProperty(id))
            .map((id) => ({ id, name: id }))
    );

    return (
        <FormGroup className={styles['pivot-multi-param']}
                   controlId={`pivot-multi-param-${id}-${paramKey}`}>
            <Col componentClass={ControlLabel} {...cellLabelCols}>
                {paramUI.label}
            </Col>
            <Col {...cellFullCols}>
                <Select.Creatable multi={true}
                                  clearable={true}
                                  joinValues={true}
                                  value={paramValue}
                                  onChange={onChange}
                                  options={multiOptions}
                                  labelKey='name' valueKey='id'
                                  name={`multi-select-${id}-${paramKey}`}/>
            </Col>
        </FormGroup>
    );
}

const dateRangeTimePickerProps = { className: styles['pivot-date-range-param'] };

function DateRange({ $falcor, id, paramKey, paramValue }) {
    return (
        <DateTimeRangePicker baseid={id}
                             $falcor={$falcor}
                             timeKey={paramKey}
                             range={paramValue}
                             labelColumns={cellLabelCols}
                             contentColumns={cellContentCols}
                             toProps={dateRangeTimePickerProps}
                             fromProps={dateRangeTimePickerProps}
                             className={styles['pivot-date-range-param']}
                             controlId={`pivot-date-range-param-${id}-${paramKey}`}/>
    );
}
