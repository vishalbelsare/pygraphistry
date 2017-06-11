import moment from 'moment';
import { SingleDatePicker } from 'react-dates';

import React from 'react';
import ReactDom from 'react-dom';
import { TimePickerWrapper, FORMAT } from './TimePickerWrapper.js';
import TimezonePicker from 'react-bootstrap-timezone-picker';

import {
    HORIZONTAL_ORIENTATION,
} from 'react-dates/constants';


export default class DateTimePicker extends React.Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            focused: false,
            date: null, // momentPropTypes.momentObj or null
            time: moment("12:00:00 AM", "hh:mm:ss a"),
            timezone: "America/Los_Angeles"
        };
    }

    render () {
        
        const { baseid, placeholder } = this.props;
        
        return (<div>
            <SingleDatePicker
                id={`sdp_${baseid}`}      

                date={this.state.date}
                onDateChange={date => this.setState({ date })}
                
                focused={ this.state.focused }
                onFocusChange={ ({ focused }) => this.setState({ focused }) }
                
                isOutsideRange={ () => false }
                showClearDate={ true }
                orientation={HORIZONTAL_ORIENTATION}
                showDefaultInputIcon={true}
                withPortal={true}
                keepOpenOnDateSelect

                displayFormat={ () => {
                    const hasDate = this.state.date | false;
                    if (hasDate) {
                        const date = this.state.date.format(moment.localeData().longDateFormat('L'));
                        const time = this.state.time.format(FORMAT);
                        return `[${date} ${time}]`;
                    } else {
                        return `[${placeholder}]`;
                    }
                } }

                renderCalendarInfo={ () => <span
                        onClick={ (event) => event.stopPropagation() }
                    >
                        <TimePickerWrapper 
                            value={ this.state.time }
                            onChange={ ({ time }) => this.setState({ time }) }
                        />
                        <TimezonePicker
                          absolute={false}
                          value={ this.state.timezone }
                          placeholder="Select timezone..."
                          onChange={ (timezone) => this.setState({ timezone }) }
                        />
                    </span> }

                placeholder={ placeholder }
            />            
        </div>);
    }

};


