import _ from 'underscore';
import styles from 'pivot-shared/styles.less';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';

export default function EntitySummaries({ id, resultSummary }) {
    return (<div className={styles.pivotEntitySummaries}>
        {
            _.sortBy(resultSummary.entities, (summary) => summary.name)
             .map(({name, count, color}, index)=>(
                <OverlayTrigger placement="top" overlay={
                    <Tooltip id={`tooltipEntity_${id}_${index}`}>{name}</Tooltip>
                } key={`${index}: entitySummary_${id}`}>
                <span className={styles.pivotEntitySummary}>
                        <span style={{backgroundColor: color}} className={styles.pivotEntityPill}></span>
                        <span className={styles.pivotEntityName}>{count}</span>
                </span>
                </OverlayTrigger>))
        }
        </div>);
}
