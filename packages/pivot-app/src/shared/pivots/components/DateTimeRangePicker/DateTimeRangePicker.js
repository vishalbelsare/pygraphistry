import React from 'react'
import moment from 'moment';
import { DateTimePicker } from './DateTimePicker';

class DateTimeRangePicker extends React.Component {
    constructor(props) {
        super(props);

        const {paramUI = {}, paramValue = {} } = props;
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
        }

        this.state = state;
        this.today = moment();

        this.onStartDateTimeChange = this.onStartDateTimeChange.bind(this);
        this.onEndDateTimeChange = this.onEndDateTimeChange.bind(this);
        this.onFocusChange = this.onFocusChange.bind(this);
        this.isOutsideRange = this.isOutsideRange.bind(this);
    }

    componentWillMount() {
        const { props, state } = this;
        const { paramUI = {}, paramKey, setPivotAttributes } = props;
        if (paramUI.default !== undefined && setPivotAttributes) {
            setPivotAttributes({
                [`pivotParameters.${paramKey}`]: {
                    startDate: state.startDate.toJSON(),
                    endDate: state.endDate.toJSON(),
                }
            });
        }
    }


    onStartDateTimeChange({startDate}) {
        this.setState({ startDate });

        const { setPivotAttributes, paramKey } = this.props;

        setPivotAttributes({
            [`pivotParameters.${paramKey}`]: {
                startDate: startDate && startDate.toJSON() || null
            }
        });
    }


    onEndDateTimeChange({endDate}) {
        this.setState({ endDate });

        const { setPivotAttributes, paramKey } = this.props;

        setPivotAttributes({
            [`pivotParameters.${paramKey}`]: {
                endDate: endDate && endDate.toJSON() || null
            }
        });
    }


    isOutsideRange(a) {
        return !(a.isBefore(this.today) || a.isSame(this.today, 'day'));
    }


    onFocusChange(focusedInput) {
        this.setState({ focusedInput });
    }


    render() {
        const { focusedInput, startDate, endDate } = this.state;
        return (
            <DateTimePicker
                {...this.props}
                date={startDate}
                onDateTimeChange={this.onStartDateTimeChange}
                focused={false}
                isOutsideRange={this.isOutsideRange}
            />
        );

        //         <SingleDatePicker
        //            {...this.props}
        //             onDatesChange={this.onDatesChange}
        //             onFocusChange={this.onFocusChange}
        //             focused={false}
        //             keepOpenOnDateSelect={true}
        //             date={startDate}
        //             orientation={HORIZONTAL_ORIENTATION}
        //             isOutsideRange={this.isOutsideRange}
        //             initialVisibleMonth={() => endDate.clone().subtract(1, 'months')}
        //         />
            // </div>
    }
}


export default DateTimeRangePicker;
