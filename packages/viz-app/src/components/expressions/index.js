import RcSwitch from 'rc-switch';
import Select from 'react-select';
import styles from './styles.less';
import classNames from 'classnames';
import renderNothing from 'recompose/renderNothing';
import { Editor as ExpressionEditor } from './editor';
import {
    Col, Row, Grid,
    Panel, Popover,
    ListGroup, ListGroupItem,
    Button, Tooltip, MenuItem,
    DropdownButton, OverlayTrigger,
} from 'react-bootstrap';

const expressionTooltip = (
    <Tooltip id='expression-tooltip'>Expression</Tooltip>
);

const expressionEnabledTooltip = (
    <Tooltip id='expression-enabled-tooltip'>Enabled</Tooltip>
);

const deleteExpressionTooltip = (
    <Tooltip id='delete-expression-tooltip'>Delete Expression</Tooltip>
);

export function HistogramsList({ style, ...props }) {
    return (
        <Panel className={props.className}
               header={<ExpressionTemplates {...props}/>}
               style={{ ...style, margin: 0, display: `block` }}>
            <ExpressionsListGroup fill {...props}/>
        </Panel>
    );
}

export function ExpressionsList({
    id, name, side, loading, style,
    children, templates, addExpression, ...props
}) {
    return (
        <Popover title={name}
                 id={`${id}-popover`}
                 style={{ ...style, padding: 0, minWidth: `400px` }}
                 {...props}>
            <ExpressionsListGroup style={{ marginBottom: 0 }} {...props}>
                {children}
            </ExpressionsListGroup>
            <div style={{ margin: `9px 14px`, backgroundColor: `#f7f7f7`, minWidth: `372px` }}>
                <ExpressionTemplates loading={loading}
                                     templates={templates}
                                     addExpression={addExpression}
                                     {...props}/>
            </div>
        </Popover>
    );

}

export function ExpressionsListGroup({ style, fill, side = 'left', children = [] }) {
    return (
        <ListGroup style={side === 'left' &&
            { ...style, maxHeight: '300px', 'overflowY': 'scroll' } || style}>
        {children.map((child) => (
            <ListGroupItem key={child.key} style={child.props.style}>
            {child}
            </ListGroupItem>
        ))}
        </ListGroup>
    );
}

export function ExpressionTemplates({ name = 'Expressions', templates = [],
                                      placeholder = "Select attribute for new entry...",
                                      loading = false, showDataTypes = true, addExpression }) {

    templates = templates.slice(0);

    return (
        <Select isLoading={loading}
                placeholder={placeholder}
                id='add-expression-dropdown'
                title={`Add ${name.slice(0, -1)}`}
                className={styles['expression-select']}
                onChange={ ({value}) => addExpression(templates[value]) }
                optionRenderer={({componentType, name, dataType}) => (
                    <span>
                        <span>{componentType}:</span>
                        <label>{name}</label>
                        {showDataTypes &&
                        <span style={{'fontStyle': 'italic', 'marginLeft': '5px' }}>{dataType}</span> }
                    </span>
                )}
                options={
                    templates.map(({ name, dataType, identifier, componentType }, index) => ({
                        name, dataType, identifier, componentType,
                        value: index, label: `${identifier} (${dataType})`
                    }))
                }/>
    );
}

export function ExpressionItem({
    id, input, level,
    readOnly, dataType, expressionType,
    name, enabled, attribute, templates,
    removeExpression, updateExpression,
    setExpressionEnabled, cancelUpdateExpression
}) {
    const isSystem = level === 'system';
    return (
        <Grid fluid style={{ padding: 0 }}>
        <Row className={styles['expression-row']}>
            <Col xs={12} md={12} lg={12}
                 style={!isSystem && { paddingRight: 0 } || undefined}>
                <OverlayTrigger placement='top' trigger={!readOnly ? ['hover'] : []} overlay={expressionTooltip}>
                    <div className={classNames({ [styles['read-only']]: readOnly })}
                         style={{ border: `1px solid #cccccc`, borderRadius: `3px`, minWidth: 250 }}>
                        <ExpressionEditor width='100%'
                                          value={input}
                                          templates={templates}
                                          name={`expression-${id}`}
                                          readOnly={readOnly || isSystem}
                                          onChange={(input) => cancelUpdateExpression({ id })}
                                          onUpdate={(input) => updateExpression({ id, input })}/>
                    </div>
                </OverlayTrigger>
            </Col>
        {!isSystem &&
            <Col xs={4} md={4} lg={4} className={styles['expression-row']} style={{ padding: 0, transform: 'scale(0.9)' }}>
                <Col xs={6} md={6} lg={6}>
                    <OverlayTrigger placement='top' overlay={expressionEnabledTooltip}>
                        <RcSwitch checked={enabled}
                                  checkedChildren={'On'}
                                  unCheckedChildren={'Off'}
                                  onChange={(newEnabled) => setExpressionEnabled({
                                      id, enabled: newEnabled
                                  })}/>
                    </OverlayTrigger>
                </Col>
                <Col xs={6} md={6} lg={6} style={{ paddingRight: 0 }}>
                    <OverlayTrigger placement='right' overlay={deleteExpressionTooltip}>
                        <Button href='javascript:void(0)'
                                className={classNames({
                                    'fa': true,
                                    'fa-close': true
                                })}
                                onClick={() => removeExpression({ id })}/>
                    </OverlayTrigger>
                </Col>
            </Col>
        }
        </Row>
        </Grid>
    );
}
