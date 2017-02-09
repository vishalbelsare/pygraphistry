import styles from './pivots.less';
import {
    Tooltip, Popover,
    Button, ButtonGroup, ButtonToolbar,
    Glyphicon, OverlayTrigger
} from 'react-bootstrap';

export default function PivotActions({ index, investigationId, splicePivot, searchPivot, insertPivot, status, numRows }) {

    if (!status) {
        return null;
    }

    return (
        <div>
        <ButtonToolbar>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionDelete_${index}`}>Delete step</Tooltip>
            } key={`${index}: entityRowActionDelete_${index}`}>
                <Button bsSize='small' disabled={index === 0 && numRows === 1} onClick={() => splicePivot({ index })}><Glyphicon glyph="trash" /></Button>
            </OverlayTrigger>
            <ButtonGroup style={{float: 'right'}}>
                <OverlayTrigger placement="top" overlay={
                    <Tooltip id={`tooltipActionPlay_${index}`}>Run step</Tooltip>
                } key={`${index}: entityRowActionPlay_${index}`}>
                    <Button bsSize='small' onClick={() => searchPivot({ index, investigationId })} disabled={status.searching}>
                        <Glyphicon glyph={status.searching ? "hourglass" : "play"}/>
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger placement="top" overlay={
                    <Tooltip id={`tooltipActionAdd_${index}`}>Insert new step after</Tooltip>
                } key={`${index}: entityRowActionAdd_${index}`}>
                    <Button bsSize='small' onClick={() => insertPivot({index})}><Glyphicon glyph="plus-sign" /></Button>
                </OverlayTrigger>
            </ButtonGroup>
        {
            status.ok ? null
                :
                <ButtonGroup style={{marginLeft: '0.7em'}}>
                    <OverlayTrigger placement="top" trigger="click" rootClose overlay={
                        <Popover id={`tooltipActionError_${index}`} title={status.title} className={styles['pivot-error-tooltip']}>
                            <span style={{color: 'red'}}>{status.message}</span>
                        </Popover>
                    } key={`${index}: entityRowAction_${index}`}>
                        <Button bsSize='small' bsStyle="danger">
                            <Glyphicon glyph="warning-sign" />
                        </Button>
                    </OverlayTrigger>
                </ButtonGroup>
        }{
            status.info === true ?
                <ButtonGroup style={{marginLeft: '0.7em'}}>
                    <OverlayTrigger placement="top" trigger="click" rootClose overlay={
                        <Popover id={`tooltipActionInfo_${index}`} title={status.title} className={styles['pivot-info-tooltip']}>
                            <span>{ status.message }</span>
                        </Popover>
                    } key={`${index}: entityRowAction_${index}`}>
                        <Button bsSize='small' bsStyle="info">
                            <Glyphicon glyph="info-sign" />
                        </Button>
                    </OverlayTrigger>
                </ButtonGroup>
                : null
        }
    </ButtonToolbar>
    </div>
    );
}
