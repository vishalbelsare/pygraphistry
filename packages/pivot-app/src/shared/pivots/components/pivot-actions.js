import styles from './pivots.less';
import {
    Tooltip, Popover,
    Button, ButtonGroup, ButtonToolbar,
    Glyphicon, OverlayTrigger
} from 'react-bootstrap';

const tooltipDelayShow = 750;
const tooltipRunStep = <Tooltip id='tooltipActionPlay'>Run step</Tooltip>;
const tooltipDeleteStep = <Tooltip id='tooltipActionDelete'>Delete step</Tooltip>;
const tooltipInsertStep = <Tooltip id='tooltipActionInsert'>Insert new step after</Tooltip>;

export default function PivotActions({
    status, numRows, index,
    pivotId, investigationId,
    splicePivot, searchPivot, insertPivot
}) {

    if (!status) {
        return null;
    }

    return (
        <ButtonToolbar>
            <OverlayTrigger rootClose placement="top" delayShow={tooltipDelayShow} overlay={tooltipDeleteStep}>
                <Button bsSize='xsmall' disabled={index === 0 && numRows === 1}
                        onClick={() => splicePivot({ index })}>
                    <Glyphicon glyph="trash" />
                </Button>
            </OverlayTrigger>
            <ButtonGroup bsSize='xsmall' className={styles['run-insert-button-group']}>
                <OverlayTrigger rootClose placement="top" delayShow={tooltipDelayShow} overlay={tooltipRunStep}>
                    <Button disabled={status.searching}
                            onClick={() => searchPivot({ index, pivotId, investigationId })}>
                        <Glyphicon className='fa-fw' glyph={status.searching ? "hourglass" : "play"}/>
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger rootClose placement="top" delayShow={tooltipDelayShow} overlay={tooltipInsertStep}>
                    <Button onClick={() => insertPivot({ index })}>
                        <Glyphicon className='fa-fw' glyph="plus-sign" />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
        {status.ok ? undefined :
            <ButtonGroup bsSize='xsmall' className={styles['status-button-group']}>
                <OverlayTrigger rootClose placement="top" trigger="click"
                                key={`${index}: entityRowAction-error${index}`}
                                overlay={
                                    <Popover title={status.title}
                                             className={styles[`pivot-error-tooltip`]}
                                             id={`tooltipActionStatus-error-${index}`}>
                                        <pre className={styles.message}>
                                            {status.message}
                                        </pre>
                                    </Popover>
                                }>
                    <Button bsStyle="danger">
                        <Glyphicon className='fa-fw' glyph="warning-sign" />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
        }
        {status.info !== true ? undefined :
            <ButtonGroup bsSize='xsmall' className={styles['status-button-group']}>
                <OverlayTrigger placement="top" trigger="click" rootClose
                                key={`${index}: entityRowAction-info${index}`}
                                overlay={
                                    <Popover title={status.title}
                                             className={styles[`pivot-info-tooltip`]}
                                             id={`tooltipActionStatus-info-${index}`}>
                                        <span className={styles.message}>
                                            {status.message}
                                        </span>
                                    </Popover>
                                }>
                    <Button bsStyle="info">
                        <Glyphicon className='fa-fw' glyph="info-sign" />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
        }
        </ButtonToolbar>
    );
}
