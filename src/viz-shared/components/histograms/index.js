import { renderNothing } from 'recompose';
import { ExpressionTemplates } from '../expressions';
import { ListGroup, ListGroupItem } from 'react-bootstrap';

export function HistogramsList({ id, name, templates, children = [] }) {
    return (
        <div>
            <ListGroup fill>
            {children.map((child) => (
                <ListGroupItem key={child.key}
                               style={{ paddingLeft: 0, paddingRight: 0 }}>
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
