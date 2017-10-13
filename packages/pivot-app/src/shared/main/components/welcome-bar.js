import styles from 'pivot-shared/styles.less';
import { Col, Row, Grid, Panel, Image, Media } from 'react-bootstrap';

export default function WelcomeBar({ user, investigations = [], numTemplates }) {
    return (
        <Grid>
            <Row className={styles['welcome-bar']}>
                <Col md={4}>
                    <Panel>
                        <Media.Left align="middle">
                            <Image
                                width={84}
                                height={84}
                                src="/pivot/img/abstract-user-flat-3.svg"
                                className={styles['user-icon']}
                                circle
                            />
                        </Media.Left>
                        <Media.Body>
                            <Media.Heading className={styles['user-greeting-heading']}>
                                Greetings!
                            </Media.Heading>
                            <span className={styles['user-greeting-message']}>
                                Welcome, {user.name}!
                            </span>
                        </Media.Body>
                    </Panel>
                </Col>
                <Col md={4}>
                    <Panel>
                        <h2 className="text-center">{investigations.length}</h2>
                        <div className="text-center">Ongoing Investigations</div>
                    </Panel>
                </Col>
                <Col md={4}>
                    <Panel>
                        <h2 className="text-center">{numTemplates}</h2>
                        <div className="text-center">Templates</div>
                    </Panel>
                </Col>
            </Row>
        </Grid>
    );
}
