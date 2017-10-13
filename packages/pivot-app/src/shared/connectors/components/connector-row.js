import { Button } from 'react-bootstrap';

export default function ConnectorRow({ id, status, checkStatus }) {
    return (
        <Button
            bsStyle={status.level}
            onClick={() => checkStatus(id)}
            disabled={status.enabled === false}>
            Status
        </Button>
    );
}
