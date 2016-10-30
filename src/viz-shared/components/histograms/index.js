import { renderNothing } from 'recompose';
import { ExpressionTemplates } from '../expressions';
import { ListGroup, ListGroupItem } from 'react-bootstrap';
import styles from './styles.less';

export function HistogramsList({ id, name, templates, children = [] }) {
    return (
        <div>
            <ListGroup fill>
            {children.map((child) => (
                <ListGroupItem key={child.key} className={styles['histogram-item']}>
                    {child}
                </ListGroupItem>
            ))}
            </ListGroup>
            <ExpressionTemplates name={name}
                                 templates={templates}
                                 addExpression={() => {}}/>
        </div>
    );
}

export const Sparkline = __SERVER__ ?
    renderNothing() :
    require('viz-client/components/histograms').Sparkline;
