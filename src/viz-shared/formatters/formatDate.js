import { castToMoment } from './castToMoment';
import { displayTimezone } from './setGlobalTimeZone';

export function formatDate (value, short = false) {
    const momentVal = castToMoment(value);

    if (!momentVal.isValid()) {
        return 'Invalid Date';
    }

    // If user has specified a timezone, use that to format the time.
    if (displayTimezone) {
        momentVal.tz(displayTimezone);
    }

    return momentVal.format(short ? 'MMM D YY, h:mm:ss a' : 'MMM D YYYY, h:mm:ss a z');
}

