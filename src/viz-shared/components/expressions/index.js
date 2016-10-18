import RcSwitch from 'rc-switch';
import styles from './styles.less';
import classNames from 'classnames';
import ExpressionEditor from './editor';
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

export function ExpressionsList({
    id, templates = [], addExpression,
    className = '', style = {}, children, name, ...props
}) {
    return (
        <Panel header={name} style={{ ...style, display: `block`, margin: 0 }}
               className={classNames({
                   [className]: !!className,
                   [styles['expressions-list']]: true,
               })}
               footer={(
                   <ExpressionTemplates name={name}
                                        templates={templates}
                                        addExpression={addExpression}/>
               )}>
            <ListGroup fill>
            {children.map((child) => (
                <ListGroupItem key={child.key}
                               style={{ paddingLeft: 0, paddingRight: 0 }}>
                    {child}
                </ListGroupItem>
            ))}
            </ListGroup>
        </Panel>
    );
}

export function ExpressionTemplates({ name = 'Expressions', templates = [], addExpression }) {
    return (
        <DropdownButton bsStyle='link' id='add-expression-dropdown' title={`Add ${name.slice(0, -1)}`}>
        {templates.map(({ name, dataType, attribute, componentType }, index) => (
            <MenuItem key={`${index}: ${name}`}
                      onSelect={() => addExpression({
                          name, dataType, attribute, componentType
                      })}>
                {`${attribute} (${dataType})`}
            </MenuItem>
        ))}
        </DropdownButton>
    );
}

export function ExpressionItem({
    id, input, level,
    dataType, expressionType,
    name, enabled, attribute, templates,
    removeExpression, updateExpression,
    setExpressionEnabled, cancelUpdateExpression
}) {
    const isSystem = level === 'system';
    return (
        <Grid fluid style={{ padding: 0 }}>
        <Row className={styles['expression-row']}>
            <Col xs={12} md={12} lg={12}
                 style={ isSystem ? {} : { paddingRight: 0 }}>
                <OverlayTrigger
                    placement='top'
                    overlay={expressionTooltip}>
                    <div style={{ border: `1px solid gray`, borderRadius: `3px` }}>
                        <ExpressionEditor name={`expression-${id}`} width='100%'
                                          value={input} templates={templates} readOnly={isSystem}
                                          onChange={(input) => cancelUpdateExpression({ id })}
                                          onUpdate={(input) => updateExpression({ id, input })}/>
                    </div>
                </OverlayTrigger>
            </Col>
            {!isSystem &&
            <Col xs={4} md={4} lg={4} className={styles['expression-row']} style={{ paddingLeft: 0 }}>
                <Col xs={6} md={6} lg={6} style={{ paddingRight: 0 }}>
                    <OverlayTrigger placement='top'
                                    overlay={expressionEnabledTooltip}>
                        <RcSwitch checked={enabled}
                                  checkedChildren={'On'}
                                  unCheckedChildren={'Off'}
                                  onChange={(newEnabled) => setExpressionEnabled({
                                      id, enabled: newEnabled
                                  })}/>
                    </OverlayTrigger>
                </Col>
                <Col xs={6} md={6} lg={6} style={{ paddingRight: 0 }}>
                    <OverlayTrigger placement='right'
                                    overlay={deleteExpressionTooltip}>
                        <Button href='javascript:void(0)'
                                className={classNames({
                                    [styles['fa']]: true,
                                    [styles['fa-close']]: true
                                })}
                                onClick={() => removeExpression({ id })}/>
                    </OverlayTrigger>
                </Col>
            </Col>}
        </Row>
        </Grid>
    );
}
