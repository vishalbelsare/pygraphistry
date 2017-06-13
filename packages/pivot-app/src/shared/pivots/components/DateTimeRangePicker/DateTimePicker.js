import moment from 'moment';
import { SingleDatePicker } from 'react-dates';
import { HORIZONTAL_ORIENTATION } from 'react-dates/constants';
import React from 'react';
import TimePicker from 'time-input';
import TimezonePicker from 'react-bootstrap-timezone-picker';
import classNames from 'classnames';

import styles from '../pivots.less';


export const FORMAT = "hh:mm:ss a";

const dateParser = {
    pickle: function (date) {
        return date ? date.toJSON() : null;
    },
    unpickle: function (json) {
        return json ? moment(json) : moment();
    }
};

const timeParser = {
    pickle: function (time) {
        return time ? moment(time, FORMAT).toJSON() : null;
    },
    unpickle: function (json) {
        return moment(json).format(FORMAT);
    }
};


export default class DateTimePicker extends React.Component {

    constructor(props, context) {
        super(props, context);

        this.state = { focused: false };
    }


    render () {
        
        const { baseid, placeholder, date, time, timezone, onValueChange } = this.props;
        
        return (<div className={classNames({
                    [styles['pivot-datetimepicker-container']]: true,
                    [styles['is-default']]: !date
                })}
            >
            <SingleDatePicker
                id={`sdp_${baseid}`}      

                date={ dateParser.unpickle(date) }
                onDateChange={ date => onValueChange({ date: dateParser.pickle(date) }) }
                
                focused={ this.state.focused }
                onFocusChange={ ({ focused }) => this.setState({ focused }) }
                
                isOutsideRange={ () => false }
                showClearDate={ true }
                orientation={HORIZONTAL_ORIENTATION}
                showDefaultInputIcon={true}
                withPortal={true}
                keepOpenOnDateSelect
                hideKeyboardShortcutsPanel={true}

                displayFormat={ () => {
                    const hasDate = Boolean(date);
                    if (hasDate) {
                        const dateFormatted = moment(date).format(moment.localeData().longDateFormat('L'));
                        const timeFormatted = moment(time).format(FORMAT);
                        return `[${dateFormatted} ${timeFormatted}]`;
                    } else {
                        return `[${placeholder}]`;
                    }
                } }

                renderCalendarInfo={ () => <span
                        onClick={ (event) => event.stopPropagation() }
                    >
                        <div className={styles['pivot-timepicker-container']}>
                            <span className={styles['pivot-timepicker']} >
                                <TimePicker 
                                    value={ timeParser.unpickle(time) }
                                    onChange={ (time) => onValueChange({ time: timeParser.pickle(time) }) }
                                />
                            </span>                            
                            <TimezonePicker
                              absolute={true}
                              value={ timezone }
                              placeholder="Select timezone..."
                              onChange={ (timezone) => onValueChange({ timezone }) }
                            />
                        </div>
                    </span> 
                }

                placeholder={ placeholder }
            />            
        </div>);
    }

}