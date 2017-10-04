import Select from "react-select";
import { layouts } from "../../services/layouts";
import { pathValue as $value } from "@graphistry/falcor-json-graph";
import styles from "./investigation-details.less";
import mapPropsStream from "recompose/mapPropsStream";
import createEventHandler from "recompose/createEventHandler";
import shallowEqual from "recompose/shallowEqual";
import {
  DateTimeRangePicker,
  DescriptionFormControl
} from "pivot-shared/components";
import {
  Col,
  Panel,
  ControlLabel,
  Form,
  FormGroup //, FormControl
} from "react-bootstrap";

import logger from "pivot-shared/logger";
const log = logger.createLogger(__filename);

const cellLabelCols = {
  // xs: 3,
  sm: 3,
  md: 3,
  lg: 3
};
const cellContentCols = {
  // xs: 9,
  sm: 9,
  md: 9,
  lg: 9
};
const cellFullCols = {
  // xs: cellLabelCols.xs + cellContentCols.xs,
  sm: cellLabelCols.sm + cellContentCols.sm,
  md: cellLabelCols.md + cellContentCols.md,
  lg: cellLabelCols.lg + cellContentCols.lg
};

const dateRangeTimePickerProps = { className: styles["global-time-picker"] };

const withInvalidationLogic = mapPropsStream(propsStream => {
  const { handler: rangeChanged, stream: rangeChanges } = createEventHandler();
  return propsStream.switchMap(props => {
    return rangeChanges
      .distinctUntilChanged(shallowEqual)
      .switchMap(range =>
        props.$falcor.withoutDataSource().set(
          $value("status", {
            msgStyle: "warning",
            ok: false,
            message: "Please re-run pivots to reflect date changes."
          })
        )
      )
      .startWith(props)
      .mapTo({ rangeChanged, ...props });
  });
});

const InvalidatingDateTimeRangePicker = withInvalidationLogic(
  DateTimeRangePicker
);

export function InvestigationDetails({
  layout,
  saveLayout,
  $falcor,
  description = "",
  time = {}
}) {
  return (
    <Panel
      collapsible
      defaultExpanded={true}
      className={styles["investigation-details"]}
      header={
        <p className={styles["investigation-details-header"]}>
          <span>
            Investigation Details
            <i className={`fa fa-fw ${styles["fa-caret"]}`} />
          </span>
        </p>
      }
    >
      <Form horizontal>
        <FormGroup controlId="investigation-description">
          <Col componentClass={ControlLabel} {...cellLabelCols}>
            Description:
          </Col>
          <Col {...cellFullCols}>
            <DescriptionFormControl
              $falcor={$falcor}
              description={description}
            />
          </Col>
        </FormGroup>
        <FormGroup controlId="investigation-layout">
          <Col componentClass={ControlLabel} {...cellLabelCols}>
            Graph Layout:
          </Col>
          <Col {...cellContentCols}>
            <Select
              value={layout}
              clearable={false}
              name="layout-selector"
              className={styles["layout-picker"]}
              onChange={({ value }) => saveLayout({ layoutType: value })}
              options={layouts.map(({ id, friendlyName }) => ({
                value: id,
                className: id,
                label: friendlyName
              }))}
            />
          </Col>
        </FormGroup>
        <InvalidatingDateTimeRangePicker
          range={time}
          timeKey="time"
          $falcor={$falcor}
          baseid="global_time"
          labelColumns={cellLabelCols}
          contentColumns={cellContentCols}
          toProps={dateRangeTimePickerProps}
          fromProps={dateRangeTimePickerProps}
          controlId="investigation-time-picker"
          className={styles["investigation-date-range"]}
        />
      </Form>
    </Panel>
  );
}
