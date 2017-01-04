import { ThreeBounce } from 'better-react-spinkit';
import { Col, Row, Grid, Image } from 'react-bootstrap';
import styles from 'pivot-shared/styles.less';

export default function VisualizationPanel({ investigation }) {
    const loadingGraph = (
        <div>
            Loading graph <ThreeBounce size={10}/>
        </div>
    );

    const runPivot = (
        <div>
            To get started, create and run a pivot!
        </div>
    );

    const placeholder = (
        <Grid>
            <Row>
                <Col>
                    <Image src="img/logo.png" responsive />
                </Col>
            </Row><Row>
                <Col>
                {
                    investigation.status.etling ? loadingGraph : runPivot
                }
                </Col>
            </Row>
        </Grid>
    );

    return (
        investigation.url ?
            <iframe
                allowFullScreen="true"
                scrolling="no"
                className={styles.iframe}
                src={investigation.url}
            /> :
            placeholder
    );
}
