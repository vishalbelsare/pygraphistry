import moment from 'moment';

// Suppress moment deprecation warnings
moment.suppressDeprecationWarnings = true;

function validMVal(momentVal) {
    return momentVal.isValid() && momentVal.year() < 5000 && momentVal.year() > -5000;
}

//sample -> value -> int
//Generate utc to-int-milliseconds converter that fast-paths based on a sample
export function dateToUTCGenerator(sample) {
    if (typeof sample === 'number') {
        const momentVal = moment.unix(sample); //guess sample is in seconds
        if (validMVal(momentVal)) {
            return function(value) {
                const mVal = moment.unix(value);
                return (validMVal(mVal) ? mVal : moment(value)).valueOf();
            };
        } else {
            return function(value) {
                return moment(value).valueOf();
            };
        }
    } else {
        if (!isNaN(new Date(sample).getTime())) {
            return function(value) {
                const v = new Date(value).getTime();
                return !isNaN(v) ? v : moment(value).valueOf();
            };
        } else {
            const format = moment(sample).creationData().format;
            return function(value) {
                const mVal = moment(value, format);
                return (mVal.isValid() ? mVal : moment(value)).valueOf();
            };
        }
    }
}
