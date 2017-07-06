import * as moment from 'moment';
import { VectorGraph } from '../vgraph';
const { StringAttributeVector } = VectorGraph;

const [
    doesNameIndicateTimeColumn,
    doesNameIndicateDateColumn
] = [/time/i, /date/i].map((r) => r.test.bind(r));

export function isDateTimeColumn(name, type) {
    return type === 'time' ||
           type === 'date' ||
           type === 'datetime' ||
           type === 'timestamp' ||
           doesNameIndicateTimeColumn(name) ||
           doesNameIndicateDateColumn(name);
}

export function dateTimeVectorMapping({ vector, encoder, format, type }) {
    return { format: format || '', type: 'timestamp' };
}

export {
    convertNumber as float,
    convertNumber as int32,
    convertNumber as double,
    convertNumber as uint32,
    convertString as string,
};

function convertNumber(format?: string) {
    return format === 'unix'
        ? convertUnix
        : !format ? convertAny
        : convertWithFormat(format);
}

function convertString(format?: string) {
    return !format
        ? convertAny
        : convertWithFormat(format);
}

// mapd TIME format: HH:mm:ss
// mapd DATE format: YYYY-MM-DD
// mapd TIMESTAMP format: YYYY-MM-DD HH:mm:ss

const TIMESTAMP = `YYYY-MM-DD HH:mm:ss`;
const invalidDate = 'Invalid date';
const specialConverters = [
    convertUTC,
    convertWithFormat([
        'MM-DD-YYYY', 'DD-MM-YYYY',
        'YYYY-MM-DD', 'YYYY-DD-MM',
        'DD-MMM-YYYY', 'MMM-DD-YYYY',
        'YYYY-DD-MMM', 'YYYY-MMM-DD'
    ]),
];

export function convertAny(value: any) {
    for (let m, i = -1, n = specialConverters.length; ++i < n;) {
        if ((m = specialConverters[i](value)) !== invalidDate) {
            return m;
        }
    }
    return null;
}

export function convertUTC(value: any) {
    return moment.utc(value).format(TIMESTAMP);
}

export function convertUnix(value: number) {
    return moment.unix(value).format(TIMESTAMP);
}

export function convertWithFormat(format: string | string[]) {
    return function convert(value: any) {
        return moment.utc(value, format).format(TIMESTAMP);
    }
}
