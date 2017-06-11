import moment from 'moment';
import TimePicker from 'time-input';

import styles from '../pivots.less';


export const FORMAT = "hh:mm:ss a";
    
export class TimePickerWrapper extends React.Component {

    constructor(props, context) {
        super(props, context);
    }

    render () {        

        const { value, onChange } = this.props;

        return (<span className={styles['pivot-timepicker']} >
            <TimePicker 
                value={ value.format(FORMAT) }
                onChange={ (time) =>  onChange({ time: moment(time, FORMAT) }) }
            />
        </span>);
    }

};


