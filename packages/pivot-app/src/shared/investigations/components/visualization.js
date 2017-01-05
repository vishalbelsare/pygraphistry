import { ThreeBounce } from 'better-react-spinkit';
import { Col, Row, Grid, Image } from 'react-bootstrap';
import { GraphistryIframe } from './graphistry-iframe';
import styles from 'pivot-shared/styles.less';


export default function VisualizationPanel({ investigation }) {
    const loadingGraph = (
        <div>
            Loading graph <ThreeBounce size={10}/>
        </div>
    );

    const runPivot = (
        <div className={styles.placeholderMessage}>
            To get started, create and run a pivot!
        </div>
    );

    const placeholder = (
        <div className={styles.placeholderWrapper}>
             <div className={styles.placeholderLogo}>
                <Grid>
                    <Row>
                        <Col>
                            <Image src="/img/logo.png" responsive />
                        </Col>
                    </Row><Row>
                        <Col>
                        {
                            investigation.status.etling ? loadingGraph : runPivot
                        }
                        </Col>
                    </Row>
                </Grid>
            </div>
        </div>
    );

    return (
        investigation.url ?
            <GraphistryIframe src={investigation.url} />
            : placeholder
    );
}
