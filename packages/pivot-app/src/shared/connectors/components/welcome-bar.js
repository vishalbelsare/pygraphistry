import mainStyles from 'pivot-shared/styles.less';
import { Col, Row, Grid, Media, Panel } from 'react-bootstrap';

export default function WelcomeBar({ connectors = [] }) {
  return (
    <Grid>
      <Row className={mainStyles['welcome-bar']}>
        <Col md={6}>
          <Panel>
            <Media.Body>
              <Media.Heading className={mainStyles['user-greeting-heading']}>
                Connectors!
              </Media.Heading>
              <span>Manage your data connections</span>
            </Media.Body>
          </Panel>
        </Col>
        <Col md={6}>
          <Panel>
            <h2 className="text-center">{connectors.length}</h2>
            <div className="text-center">Number of Connectors</div>
          </Panel>
        </Col>
      </Row>
    </Grid>
  );
}
