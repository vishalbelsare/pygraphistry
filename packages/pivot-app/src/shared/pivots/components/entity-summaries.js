import _ from 'underscore';
import styles from './pivots.less';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';

export default function EntitySummaries({ id, resultSummary }) {
    return (<div className={styles['pivot-entity-summaries']}>
        {
            _.sortBy(resultSummary.entities, (summary) => summary.name)
             .map(({name, count, color}, index)=>(
                <OverlayTrigger placement="top" overlay={
                    <Tooltip id={`tooltipEntity_${id}_${index}`}>{name}</Tooltip>
                } key={`${index}: entitySummary_${id}`}>
                <span className={styles['pivot-entity-summary']}>
                        <span style={{backgroundColor: color}} className={styles['pivot-entity-pill']}></span>
                        <span className={styles['pivot-entity-name']}>{count}</span>
                </span>
                </OverlayTrigger>))
        }
        </div>);
}
