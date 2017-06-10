import moment from 'moment';
import DateTimePicker from './DateTimePicker.js';
import styles from '../pivots.less';



export default function DateTimeRangePicker ({ paramUI, baseid }) {
    return (<div className={styles['pivot-timerange-param']}>
        <label>{ paramUI.label }</label>
        <div>
            <DateTimePicker baseid={baseid+"from"} placeholder={"From"}></DateTimePicker> 
            <DateTimePicker baseid={baseid+"to"} placeholder={"To"}></DateTimePicker>
        </div>
    </div>);
}

