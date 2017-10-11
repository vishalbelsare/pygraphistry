import Select from 'react-select';
import styles from './investigation-header.less';
import {
  Grid,
  Row,
  Col,
  Button,
  ButtonGroup,
  Glyphicon,
  OverlayTrigger,
  Tooltip
} from 'react-bootstrap';

const tooltipDelayShow = 750;
const saveInvestigationTooltip = (
  <Tooltip id="saveInvestigationTooltip">Save Investigation</Tooltip>
);
const copyInvestigationTooltip = (
  <Tooltip id="copyInvestigationTooltip">Duplicate Investigation</Tooltip>
);
const createInvestigationTooltip = (
  <Tooltip id="createInvestigationTooltip">Create New Investigation</Tooltip>
);

export default function InvestigationHeader({
  id,
  user,
  children,
  investigations = [],
  saveInvestigation,
  createInvestigation,
  copyInvestigation,
  selectInvestigation
}) {
  return (
    <Grid fluid className={styles['investigation-header']}>
      <Row
        style={{ height: 41 }}
        className={`${styles['investigation-header-row']} ${styles['investigation-header-nav']}`}>
        <Col className={styles['investigation-header-col']} xs={8} sm={8} md={8} lg={8}>
          <Select
            name="investigation-selector"
            className={styles['investigation-selector']}
            clearable={false}
            value={id}
            options={investigations.map(investigation => ({
              value: investigation.id,
              label: investigation.name
            }))}
            onChange={selection => selectInvestigation(selection.value)}
          />
        </Col>
        <Col className={styles['investigation-header-btns']} xs={4} sm={4} md={4} lg={4}>
          <ButtonGroup justified className={styles['investigation-header-nav-items']}>
            <OverlayTrigger
              placement="bottom"
              delayShow={tooltipDelayShow}
              overlay={createInvestigationTooltip}>
              <Button onClick={() => createInvestigation(user.id)}>
                <Glyphicon glyph="plus" />
              </Button>
            </OverlayTrigger>
            <OverlayTrigger
              placement="bottom"
              delayShow={tooltipDelayShow}
              overlay={copyInvestigationTooltip}>
              <Button onClick={() => copyInvestigation(id)}>
                <Glyphicon glyph="duplicate" />
              </Button>
            </OverlayTrigger>
            <OverlayTrigger
              placement="bottom"
              delayShow={tooltipDelayShow}
              overlay={saveInvestigationTooltip}>
              <Button onClick={() => saveInvestigation(id)}>
                <Glyphicon glyph="floppy-disk" />
              </Button>
            </OverlayTrigger>
          </ButtonGroup>
        </Col>
      </Row>
      {(children &&
        children.length &&
        children.map(
          (child, index) =>
            (child && (
              <Row key={`row-${index}`} className={styles['investigation-header-row']}>
                <Col xs={12} sm={12} md={12} lg={12}>
                  {child}
                </Col>
              </Row>
            )) ||
            undefined
        )) ||
        undefined}
    </Grid>
  );
}
