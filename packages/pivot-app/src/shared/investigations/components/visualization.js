import { ThreeBounce } from 'better-react-spinkit';
import { Col, Row, Grid, Image } from 'react-bootstrap';
import { GraphistryIframe } from './graphistry-iframe';
import styles from './investigations.less';


export default function VisualizationPanel({ investigation }) {
    const loadingGraph = (
        <span>
            Loading graph <ThreeBounce size={10}/>
        </span>
    );

    const runPivot = (
        <span>
            To get started, create and run a pivot!
        </span>
    );

    const placeholder = (
        <div className={styles['placeholder-wrapper']}>
             <div className={styles['placeholder-logo']}>
                <Grid>
                    <Row>
                        <Col>
                            <Image src="/pivot/img/logo.png" responsive />
                        </Col>
                    </Row><Row>
                        <Col>
                            <div className={styles['placeholder-message']}>
                                {
                                    (investigation.status && investigation.status.etling) ? 
                                        loadingGraph : 
                                        runPivot
                                }
                            </div>
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
