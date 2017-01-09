import { Alert, Panel } from 'react-bootstrap';
import styles from 'pivot-shared/containers/MainNav/styles.less';

export default function InvestigationPlaceholder({ switchScreen }) {
    return (
        <div className={styles["main-panel"]} style={{width: 'calc(100% - 90px)', height: '100%'}}>
            <Panel>
                <Alert bsStyle="danger">
                    <h4>No Investigation to Open!</h4>
                    <p>
                        Please&nbsp;
                            <a onClick={() => switchScreen('home')}>create an investigation</a>
                        &nbsp;first.
                    </p>
                </Alert>
            </Panel>
        </div>
    );
}

