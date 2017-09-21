import RcSwitch from 'rc-switch';
import Select from 'react-select';
import styles from './styles.less';
import classNames from 'classnames';
import { AutoSizer } from 'react-virtualized';
import renderNothing from 'recompose/renderNothing';
import {
    Col, Row, Grid,
    Panel, Popover,
    ListGroup, ListGroupItem,
    Button, Tooltip, MenuItem,
    DropdownButton, OverlayTrigger,
} from 'react-bootstrap';

let ExpressionEditor = renderNothing();

if (__CLIENT__) {
    ExpressionEditor = require('./editor').Editor;
}

const expressionTooltip = (
    <Tooltip id='expression-tooltip'>Expression</Tooltip>
);

const expressionEnabledTooltip = (
    <Tooltip id='expression-enabled-tooltip'>Enabled</Tooltip>
);

const deleteExpressionTooltip = (
    <Tooltip id='delete-expression-tooltip'>Delete Expression</Tooltip>
);

export function HistogramsList({ style, children, ...props }) {
    return (
        <Panel className={props.className}
               header={<ExpressionTemplates {...props}/>}
               style={{ ...style, margin: 0, display: `block` }}>
            <ListGroup fill>
            {children.map((child) => (
                <ListGroupItem key={child.key} style={child.props.style}>
                {child}
                </ListGroupItem>
            ))}
            </ListGroup>
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
                 style={{ ...style, width: `400px`, minWidth: `400px` }}
                 {...props}>
            <Grid fluid style={{ ...style, overflowY: 'auto', maxHeight: 300, padding: 0 }}>
                {children}
            </Grid>
            <div style={{
                padding: '9px 14px',
                backgroundColor: '#f7f7f7',
                borderBottomLeftRadius: '5px',
                borderBottomRightRadius: '5px',
                borderTop: '1px solid #ebebeb',
            }}>
                <ExpressionTemplates loading={loading}
                                     templates={templates}
                                     addExpression={addExpression}
                                     {...props}/>
            </div>
        </Popover>
    );
}

function TemplateOptionRenderer({ name, dataType, componentType, showDataTypes }) {
    return (
        <span>
            <span>{componentType}:</span>
            <label>{name}</label>
            {showDataTypes &&
            <span style={{'fontStyle': 'italic', 'marginLeft': '5px' }}>{dataType}</span> }
        </span>
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
                optionRenderer={TemplateOptionRenderer}
                onChange={({ value }) => addExpression(templates[value])}
                options={
                    templates.map(({ name, dataType, identifier, componentType }, index) => ({
                        value: index, label: `${identifier} (${dataType})`,
                        name, dataType, identifier, componentType, showDataTypes
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
        <Row className={styles['expression-row'] + ' ' + styles['expression-item']}>
            <Col xs={12} md={12} lg={12}
                 style={!isSystem && { paddingRight: 0 } || undefined}>
                <OverlayTrigger placement='top' trigger={!readOnly ? ['hover'] : []} overlay={expressionTooltip}>
                    <div className={classNames({ [styles['read-only']]: readOnly })}
                         style={{ border: `1px solid #cccccc`, borderRadius: `3px`, minWidth: 250 }}>
                        <ExpressionEditor name={`expression-${id}`}
                                          width='100%' height='100%'
                                          readOnly={readOnly || isSystem}
                                          value={input} templates={templates}
                                          onChange={(input) => cancelUpdateExpression({ id })}
                                          onUpdate={(input) => updateExpression({ id, input })}/>
                    </div>
                </OverlayTrigger>
            </Col>
        {!isSystem &&
            <Col xs={4} md={4} lg={4} className={styles['expression-row']} style={{ padding: 0, transform: 'scale(0.9)' }}>
                <Col xs={6} md={6} lg={6}>
                    <OverlayTrigger placement='top' overlay={expressionEnabledTooltip}>
                        <RcSwitch defaultChecked={enabled}
                                  checkedChildren={'On'}
                                  unCheckedChildren={'Off'}
                                  key={`expression-${id}-checked`}
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
    );
}
