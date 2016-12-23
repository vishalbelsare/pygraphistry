import React from 'react'
import moment from 'moment';
import { DateRangePicker } from 'react-dates';
import {
    HORIZONTAL_ORIENTATION,
} from 'react-dates/constants';


class DateRangePickerWrapper extends React.Component {
    constructor(props) {
        super(props);

        const {paramUI = {}, paramValue = {}, setPivotAttributes, paramKey } = props;
        const defaultDuration = paramUI.default;

        const state = {
            focusedInput: null,
            startDate: null,
            endDate: null,
        };

        if (moment(paramValue.startDate || null).isValid() && moment(paramValue.endDate || null).isValid()) {
            state.startDate = moment(paramValue.startDate);
            state.endDate = moment(paramValue.endDate);
        } else if (defaultDuration !== undefined) {
            state.startDate = moment().subtract(moment.duration(defaultDuration));
            state.endDate = moment();

            setPivotAttributes({
                [`pivotParameters.${paramKey}`]: {
                    startDate: state.startDate.toJSON(),
                    endDate: state.endDate.toJSON(),
                }
            });
        }

        this.state = state;
        this.today = moment();

        this.onDatesChange = this.onDatesChange.bind(this);
        this.onFocusChange = this.onFocusChange.bind(this);
        this.isOutsideRange = this.isOutsideRange.bind(this);
    }

    onDatesChange({ startDate, endDate }) {
        this.setState({ startDate, endDate });

        const { setPivotAttributes, paramKey } = this.props;

        setPivotAttributes({
            [`pivotParameters.${paramKey}`]: {
                startDate: startDate && startDate.toJSON() || null,
                endDate: endDate && endDate.toJSON() || null,
            }
        });
    }

    onFocusChange(focusedInput) {
        this.setState({ focusedInput });
    }

    isOutsideRange(a) {
        return !(a.isBefore(this.today) || a.isSame(this.today, 'day'));
    }

    render() {
        const { focusedInput, startDate, endDate } = this.state;
        return (
            <div>
                <DateRangePicker
                    {...this.props}
                    onDatesChange={this.onDatesChange}
                    onFocusChange={this.onFocusChange}
                    focusedInput={focusedInput}
                    startDate={startDate}
                    endDate={endDate}
                    orientation={HORIZONTAL_ORIENTATION}
                    isOutsideRange={this.isOutsideRange}
                    minimumNights={0}
                    initialVisibleMonth={() => endDate.clone().subtract(1, 'months')}
                />
            </div>
        );
    }
}

export default DateRangePickerWrapper;
