import { PivotRow } from 'pivot-shared/pivots';
import styles from './pivots.less';

export default function PivotTable({
    id, pivots, templates,
    insertPivot, splicePivot, searchPivot,
    togglePivots
}) {
    
    return (
        <div className={styles['pivot-table']}>
        {
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
        </div>
    );
}
