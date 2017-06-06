import React from 'react'
import moment from 'moment';
import { SingleDatePicker } from 'react-dates';
import {
    HORIZONTAL_ORIENTATION,
} from 'react-dates/constants';
import TimeInput from 'react-time-input';


class DateTimePicker extends React.Component {
    constructor(props) {
        super(props);

        const {paramUI = {}, paramValue = {} } = props;
        const defaultDuration = paramUI.default;

        const state = {
            focusedInput: null,
            date: null
        };

        if (moment(paramValue.date || null).isValid()) {
            state.date = moment(paramValue.date);
        }

        this.state = state;
        this.today = moment();

        this.onDatesChange = this.onDatesChange.bind(this);
        this.onFocusChange = this.onFocusChange.bind(this);
        this.isOutsideRange = this.isOutsideRange.bind(this);
    }

    componentWillMount() {
    //     const { props, state } = this;
    //     const { paramUI = {}, paramKey, setPivotAttributes } = props;
    //     if (paramUI.default !== undefined && setPivotAttributes) {
    //         setPivotAttributes({
    //             [`pivotParameters.${paramKey}`]: {
    //                 startDate: state.startDate.toJSON(),
    //                 endDate: state.endDate.toJSON(),
    //             }
    //         });
    //     }
    }

    onDatesChange({ startDate, endDate }) {
        // this.setState({ startDate, endDate });
        //
        // const { setPivotAttributes, paramKey } = this.props;
        //
        // setPivotAttributes({
        //     [`pivotParameters.${paramKey}`]: {
        //         startDate: startDate && startDate.toJSON() || null,
        //         endDate: endDate && endDate.toJSON() || null,
        //     }
        // });
    }

    onFocusChange(focusedInput) {
        // this.setState({ focusedInput });
    }

    render() {
        const { focusedInput, date } = this.state;
        return (
            <div>
                <SingleDatePicker
                    onDatesChange={this.onDatesChange}
                    onFocusChange={this.onFocusChange}
                    focused={false}
                    keepOpenOnDateSelect={true}
                    date={date}
                    orientation={HORIZONTAL_ORIENTATION}
                    isOutsideRange={this.isOutsideRange}
                    initialVisibleMonth={() => endDate.clone().subtract(1, 'months')}
                />
            </div>
        );
    }
}

export default DateTimePicker;
