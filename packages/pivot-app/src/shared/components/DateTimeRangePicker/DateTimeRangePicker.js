import moment from 'moment';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';


import DateTimePicker from './DateTimePicker.js';
import styles from '../../pivots/components/pivots.less';


const withTime = mapPropsStream((props) => {
    const { handler: onChangeInternal, stream: changes } = createEventHandler();

    return props.switchMap(({ range = {}, onChange, ...props }) => {
        const ranges = 
            changes
                .scan((acc, {dir, val}) => ({ 
                        ...acc, 
                        [dir]: { 
                            ...(acc[dir]||{}), 
                            ...val }
                    }), 
                    range);
        return ranges
            .merge(
                ranges
                    .debounceTime(200)
                    .do((range) => onChange(range)) //TODO make work on $falcor
                    .filter(() => false))
            .map((range) => ({ range, onChange: onChangeInternal, ...props }))
            .startWith({ range, onChange: onChangeInternal, ...props })
    });

});


const DateTimeRangePicker = withTime(({ label, range = {}, baseid, onChange }) => {

    function getTimeProps(dir, defaultTime) {

        const base = range[dir] || {};

        return {
            date: base.date,
            time: base.time || defaultTime,
            timezone: base.timezone || "America/Los_Angeles"
        };
    }

    return (<div className={styles['pivot-timerange-param']}>
        <label>{ label }</label>
        <div>
            <DateTimePicker
                onValueChange={ (val) => onChange({dir: 'from', val }) } 
                {...getTimeProps('from', moment("12:00:00 AM", "hh:mm:ss a").toJSON())}
                baseid={baseid+"from"} 
                placeholder={"default from"} />
            <DateTimePicker
                onValueChange={ (val) => onChange({dir: 'to', val }) } 
                {...getTimeProps('to', moment("11:59:59 PM", "hh:mm:ss a").toJSON())}
                baseid={baseid+"to"} 
                placeholder={"default to"} />
        </div>
    </div>);
});

export { withTime, DateTimeRangePicker };