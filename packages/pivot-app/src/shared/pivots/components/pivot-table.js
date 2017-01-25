import { PivotRow } from 'pivot-shared/pivots';
import styles from './pivots.less';
import { Accordion, Panel } from 'react-bootstrap';

export default function PivotTable({
    id, pivots, templates,
    insertPivot, splicePivot, searchPivot,
    togglePivots
}) {
    
    return (
        <div className={styles['pivot-table']}>
            <Accordion>
                {
                    pivots.map((pivot, index) => (
                        <Panel 
                            header={
                                <div> 
                                    <span>
                                        { `${index}. ` }
                                    </span>
                                    <span>
                                        { pivot.pivotTemplate.name }
                                    </span>
                                </div>
                            } 
                            key={index} 
                            eventKey={`Pivot:${index}`}
                        >
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
                        </Panel>
                    ))
                }
            </Accordion>
        </div>
    );
}
