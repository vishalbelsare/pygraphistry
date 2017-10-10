import _ from 'underscore';
import styles from './pivots.less';
import FontAwesome from 'react-fontawesome';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';

export default function EntitySummaries({ id, resultSummary }) {
  return (
    <div className={styles['pivot-entity-summaries']}>
      {_.sortBy(
        resultSummary.entities,
        summary => summary.name
      ).map(({ name, count, color, icon = '' }, index) => (
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip id={`tooltipEntity_${id}_${index}`}>{name}</Tooltip>}
          key={`${index}: entitySummary_${id}`}>
          <span className={styles['pivot-entity-summary']}>
            <FontAwesome name={icon === '' ? 'question-circle' : icon} size="2x" />
            <span style={{ backgroundColor: color }} className={styles['pivot-entity-pill']} />
            <span className={styles['pivot-entity-count']}>{count}</span>
          </span>
        </OverlayTrigger>
      ))}
    </div>
  );
}
