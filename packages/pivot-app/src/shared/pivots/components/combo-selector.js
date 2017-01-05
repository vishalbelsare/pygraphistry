import React from 'react';
import {
    Form,
    FormGroup,
    FormControl,
    ControlLabel
} from 'react-bootstrap';

export default class ComboSelector extends React.Component {
    constructor(props, context) {
        super(props, context)
    }

    setParam(value) {
        const {fldKey} = this.props;
        return this.props.setPivotAttributes({
            [`pivotParameters.${fldKey}`]: value
        });
    }

    componentWillMount() {
        const {fldValue, options} = this.props;
        if (!fldValue) {
            this.setParam(options[0].value);
        }
    }

    render() {
        const {
            pivotId,
            fldKey,
            fldValue,
            options,
            paramUI,
        } = this.props;
        return (
            <Form inline>
                <FormGroup controlId={'inputSelector'}>
                    <ControlLabel>{ paramUI.label }</ControlLabel>
                    <FormControl
                        componentClass="select"
                        placeholder="select"
                        value={fldValue}
                        onChange={(ev) =>
                            ev.preventDefault() || this.setParam(ev.target.value)
                        }
                    >
                        {
                            options.map(({value, label}, index) => (
                                <option
                                    key={`comboselector-${pivotId}-${fldKey}-${index}`}
                                    value={value}
                                >
                                    { label }
                                </option>
                            ))
                        }
                    </FormControl>
                </FormGroup>
            </Form>
        )
    }

}
