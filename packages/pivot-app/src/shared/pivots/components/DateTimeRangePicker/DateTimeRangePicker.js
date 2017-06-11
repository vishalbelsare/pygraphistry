import moment from 'moment';
import DateTimePicker from './DateTimePicker.js';
import styles from '../pivots.less';



export default function DateTimeRangePicker ({ paramUI, baseid }) {
    return (<div className={styles['pivot-timerange-param']}>
        <label>{ paramUI.label }</label>
        <div>
            <DateTimePicker 
                baseid={baseid+"from"} 
                placeholder={"default from"}
                defaultTime={ moment("12:00:00 AM", "hh:mm:ss a") } />
            <DateTimePicker 
                baseid={baseid+"to"} 
                placeholder={"default to"} 
                defaultTime={ moment("11:59:59 PM", "hh:mm:ss a") }/>
        </div>
    </div>);
}

