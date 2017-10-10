import moment from 'moment';
import DateTimePicker from './DateTimePicker';
import mapPropsStream from 'recompose/mapPropsStream';
import { $atom } from '@graphistry/falcor-json-graph';
import createEventHandler from 'recompose/createEventHandler';
import { Col, Row, ControlLabel, FormGroup } from 'react-bootstrap';

const defaultToTime = '11:59:59 PM';
const defaultFromTime = '12:00:00 AM';
const timePickerPlaceholder = 'Select a date';

function getTimeProps(range, baseid, dir, defaultTime) {
  const base = range[dir] || {};

  return {
    date: base.date,
    baseid: `${baseid}_${dir || ''}`,
    placeholder: timePickerPlaceholder,
    timezone: base.timezone || 'America/Los_Angeles',
    time: base.time || moment.utc(defaultTime, 'hh:mm:ss a').toJSON()
  };
}

export const withTimeRanges = mapPropsStream(propsStream => {
  const { handler: onToChange, stream: toChanges } = createEventHandler();
  const { handler: onFromChange, stream: fromChanges } = createEventHandler();

  const changes = toChanges.merge(fromChanges);
  const handleToChange = val => onToChange({ val, dir: 'to' });
  const handleFromChange = val => onFromChange({ val, dir: 'from' });

  return propsStream.switchMap(
    ({ $falcor, baseid, range = {}, rangeChanged = () => {}, timeKey = 'time', ...props }) => {
      const ranges = changes
        .scan(
          (acc, { dir, val }) => ({
            ...acc,
            [dir]: { ...acc[dir], ...val }
          }),
          range
        )
        .do(rangeChanged);
      const rangesCommitted = ranges.switchMap(
        range =>
          $falcor
            .set({
              json: {
                [timeKey]: $atom(range)
              }
            })
            .progressively(),
        (range, { json }) => json[timeKey]
      );
      return rangesCommitted.startWith(range).map(range => ({
        ...props,
        toProps: {
          ...getTimeProps(range, baseid, 'to', defaultToTime),
          ...props.toProps,
          onValueChange: handleToChange
        },
        fromProps: {
          ...getTimeProps(range, baseid, 'from', defaultFromTime),
          ...props.fromProps,
          onValueChange: handleFromChange
        }
      }));
    }
  );
});

const defaultLabelColumns = { xs: 4, sm: 4, md: 4, lg: 4 };
const defaultContentColumns = { xs: 8, sm: 8, md: 8, lg: 8 };

export const DateTimeRangePicker = withTimeRanges(function DateTimeRange({
  label,
  fromProps,
  toProps,
  labelColumns = defaultLabelColumns,
  contentColumns = defaultContentColumns,
  ...formGroupProps
}) {
  return (
    <FormGroup {...formGroupProps}>
      {label === null || label === undefined || label === '' ? (
        undefined
      ) : (
        <Row>
          <Col componentClass={ControlLabel} {...labelColumns}>
            {label}
          </Col>
        </Row>
      )}
      <Col componentClass={ControlLabel} {...labelColumns}>
        Start Date:
      </Col>
      <Col componentClass={DateTimePicker} {...fromProps} {...contentColumns} />
      <Col componentClass={ControlLabel} {...labelColumns}>
        End Date:
      </Col>
      <Col componentClass={DateTimePicker} {...toProps} {...contentColumns} />
    </FormGroup>
  );
});
