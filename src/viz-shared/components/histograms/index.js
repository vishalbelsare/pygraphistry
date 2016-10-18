export * from './sparkline';
import styles from './styles.less';
import classNames from 'classnames';
import {
    Col, Row, Grid,
    Panel, Popover,
    ListGroup, ListGroupItem,
    Button, Tooltip, MenuItem,
    DropdownButton, OverlayTrigger,
} from 'react-bootstrap';

export function HistogramsList({ id, name, children = [] }) {
    return (
        <ListGroup fill>
        {children.map((child) => (
            <ListGroupItem key={child.key}
                           style={{ paddingLeft: 0, paddingRight: 0 }}>
                {child}
            </ListGroupItem>
        ))}
        </ListGroup>
    );
}

export function HistogramTemplates({ name = 'Histograms', templates = [], addHistogram }) {
    return (
        <DropdownButton bsStyle='link' id='add-histogram-dropdown' title={`Add ${name.slice(0, -1)}`}>
        {templates.map(({ name, dataType, attribute, componentType }, index) => (
            <MenuItem key={`${index}: ${name}`}
                      onSelect={() => addHistogram({
                          name, dataType, attribute, componentType
                      })}>
                {`${attribute} (${dataType})`}
            </MenuItem>
        ))}
        </DropdownButton>
    );
}
