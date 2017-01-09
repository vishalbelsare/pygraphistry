import { PivotRow } from 'pivot-shared/pivots';
import styles from 'pivot-shared/styles.less';
import { Button, Table, Tooltip, Glyphicon, OverlayTrigger } from 'react-bootstrap';

export default function PivotTable({
    id, status, pivots, templates,
    insertPivot, splicePivot, searchPivot,
    graphInvestigation, togglePivots
}) {

    const bStyle = (status && status.msgStyle) ? status.msgStyle : 'default';
    return (
        <Table>
            <thead>
                <tr>
                    <th className={styles.pivotToggle}>
                        <OverlayTrigger placement="top" overlay={
                            <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                        }>
                            <Button bsStyle={bStyle}
                                    onClick={() =>
                                        graphInvestigation({investigationId: id, length: pivots.length}
                                    )}>
                                <Glyphicon glyph="play" />
                            </Button>
                        </OverlayTrigger>
                    </th>
                </tr>
            </thead>
            <tbody>{
                pivots.map((pivot, index) => (
                    <PivotRow data={pivot}
                              pivots={pivots}
                              rowIndex={index}
                              investigationId={id}
                              templates={templates}
                              searchPivot={searchPivot}
                              splicePivot={splicePivot}
                              insertPivot={insertPivot}
                              togglePivots={togglePivots}
                              key={`${index}: ${pivot.id}`}
                              />
                ))
            }
            </tbody>
        </Table>
    );
}
