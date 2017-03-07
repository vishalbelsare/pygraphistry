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

export function ExpressionsList({
    loading = false, showDataTypes = true,
    id, templates = [], addExpression,
    showHeader = true, header,
    dropdownPlacement = 'bottom',
    side='left', placeholder,
    style = {}, itemStyle = {},
    children, name, ...props
}) {

    const dropdown = (
        <ExpressionTemplates name={name}
                             loading={loading}
                             templates={templates}
                             placeholder={placeholder}
                             showDataTypes={showDataTypes}
                             addExpression={addExpression}/>
    );

    const title = !showHeader ? undefined : (header ? header : name);
    const top = dropdownPlacement === 'top'
        ? <div>{title}{dropdown}</div>
        : title;
    const bottom = dropdownPlacement === 'bottom' ? dropdown : undefined;

    return (
        <Panel header={top} footer={bottom}
               style={{ ...style, display: `block`, margin: 0 }}
               {...props}>
            <ListGroup fill style={side==='left' ? {maxHeight: '300px', 'overflowY': 'scroll'} : {}}>
            {children.map((child) => (
                <ListGroupItem key={child.key} style={{
                                   paddingLeft: 0, paddingRight: 0, ...child.props.style
                               }}>
                    {child}
                </ListGroupItem>
            ))}
            </ListGroup>
        </Panel>
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
                <OverlayTrigger placement='top' overlay={!readOnly && expressionTooltip || <renderNothing id='nothing'/>}>
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
