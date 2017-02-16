import styles from './styles.less';
import { TrackInitProgress } from './track-init-progress';
import { Col, Row, Grid, Modal, ProgressBar } from 'react-bootstrap';

const InitGridProgressBar = TrackInitProgress()(GridProgressBar);

export function Session({ status = 'primary', message = '', progress = 100 }) {

    console.log('session update', JSON.stringify({ status, message, progress }));

    if (typeof progress !== 'number') {
        progress = 100;
    }

    if (status === 'init') {
        status = progress === 100 ? 'success' : 'primary';
    }

    return (
        <Modal autoFocus={false}
               className={styles['session']}
               animation={progress !== 100} backdrop='static'
               show={status !== 'success' || progress !== 100}>
            <Modal.Body style={{ backgroundColor: 'transparent' }}>
                <InitGridProgressBar status={status} message={message} progress={progress}/>
            </Modal.Body>
        </Modal>
    );
}

function GridProgressBar({ status = 'primary', reload, progress = 100,
                           message = `Locating Graphistry's farm` }) {
    return (
        <Grid fluid onClick={reload}>
            <Row>
                <Col xs={12} md={6} mdOffset={3} lg={6} lgOffset={3}>
                    <ProgressBar style={{ cursor: reload && 'pointer' || 'initial' }}
                                 active now={progress} bsStyle={status} label={message}/>
                </Col>
            </Row>
        </Grid>
    );
}
