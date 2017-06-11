import moment from 'moment';
import DateTimePicker from './DateTimePicker.js';
import styles from '../pivots.less';



export default function DateTimeRangePicker ({ paramUI, baseid }) {
    return (<div className={styles['pivot-timerange-param']}>
        <label>{ paramUI.label }</label>
        <div>
            <DateTimePicker baseid={baseid+"from"} placeholder={"default"}></DateTimePicker> 
            <DateTimePicker baseid={baseid+"to"} placeholder={"default"}></DateTimePicker>
        </div>
    </div>);
}

