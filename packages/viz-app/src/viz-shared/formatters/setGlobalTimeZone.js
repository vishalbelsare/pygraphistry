import moment from 'moment-timezone';

const debug = require('debug')('graphistry:viz-app:setGlobalTimeZone');

// TODO: Wrap this up into a formatter object instead of a global here.
// Initialize with moment's best guess at timezone.
export let displayTimezone = moment.tz.guess();

export function setGlobalTimeZone (newTimezone) {
    // Treat empty string as reset (because this comes from a text input)
    if (newTimezone === '') {
        displayTimezone = moment.tz.guess();
        return;
    }

    const zoneObj = moment.tz.zone(newTimezone);
    if (zoneObj) {
        debug('Setting timezone from '+ displayTimezone + ' to: ' + newTimezone);
        displayTimezone = newTimezone;
    } else {
        debug('Attempted to set timezone to invalid value: ' + newTimezone);
    }
}
