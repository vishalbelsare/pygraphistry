import { castToMoment } from './castToMoment';

export function formatDate(value, short = false) {
  const momentVal = castToMoment(value);

  if (!momentVal.isValid()) {
    return 'Invalid Date';
  }

  return momentVal.format(short ? 'MMM D YY, h:mm:ss a' : 'MMM D YYYY, h:mm:ss a z');
}
