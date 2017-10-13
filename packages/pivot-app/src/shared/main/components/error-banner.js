import { Alert, Button } from 'react-bootstrap';
import styles from './styles.less';

export default function ErrorBanner({ serverStatus }) {
    const title = serverStatus.title ? (
        <h4>
            <b>{serverStatus.title}</b>
        </h4>
    ) : null;

    return (
        <Alert bsStyle="danger" className={styles['server-status-alert']}>
            {title}
            <p>{serverStatus.message}</p>
            <Button bsStyle="danger" onClick={() => window.location.reload()}>
                Reload page
            </Button>
        </Alert>
    );
}
