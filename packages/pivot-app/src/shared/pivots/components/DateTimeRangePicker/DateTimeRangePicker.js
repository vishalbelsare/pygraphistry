import moment from 'moment';
import DateTimePicker from './DateTimePicker.js';
import styles from '../pivots.less';


export default function DateTimeRangePicker ({ paramUI, paramKey, paramValue, setPivotAttributes, baseid }) {
    
    function updatePivotParameters (dir, update) {

        const dirOther = dir === 'from' ? 'to' : 'from';
        return setPivotAttributes({
             [`pivotParameters.${paramKey}`]: {
                [dir]: {
                    ...(paramValue ? paramValue[dir] : {}),
                    ...update
                },
                [dirOther]: paramValue ? paramValue[dirOther] : null
            }
        }); 
    }

    function getTimeProps(dir) {

        const base = paramValue && paramValue[dir] ? paramValue[dir] : {};

        return {
            date: typeof(base.date) === "string" ? moment(base.date) : (base.date || null),
            time: typeof(base.time) === "string" ? moment(base.time) 
                    : base.time || moment(dir === 'from' ? "12:00:00 AM" : "11:59:59 PM", "hh:mm:ss a"),
            timezone: base.timezone || "America/Los_Angeles"
        };
    }

    return (<div className={styles['pivot-timerange-param']}>
        <label>{ paramUI.label }</label>
        <div>
            <DateTimePicker
                onValueChange={ (update) => updatePivotParameters('from', update) } 
                {...getTimeProps('from')}
                baseid={baseid+"from"} 
                placeholder={"default from"} />
            <DateTimePicker
                onValueChange={ (update) => updatePivotParameters('to', update) } 
                {...getTimeProps('to')}
                baseid={baseid+"to"} 
                placeholder={"default to"} />
        </div>
    </div>);
}

