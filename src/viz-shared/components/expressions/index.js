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

import Select from 'viz-shared/components/tethered-select';

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


    const sortedTemplates = templates.slice(0);
    // sortedTemplates.sort((a,b) => {
    //     const aLower = a.attribute.toLowerCase();
    //     const bLower = b.attribute.toLowerCase();
    //     return aLower === bLower ? 0
    //         : aLower < bLower ? -1
    //         : 1;
    // });

    return  (<Select
        id='add-expression-dropdown'
        title={`Add ${name.slice(0, -1)}`}
        placeholder="Select attribute to filter..."
        onChange={ ({value}) => addExpression(sortedTemplates[value]) }
        optionRenderer={
          ({componentType, name, dataType}) => (
              <span>
                  <span>{componentType}:</span>
                  <label>{name}</label>
                  <span style={{'fontStyle': 'italic', 'marginLeft': '5px' }}>{dataType}</span>
              </span>
            )
        }
        options={
            sortedTemplates.map(({ name, dataType, identifier, componentType }, index) => {
                return {
                    value: index,
                    label: `${identifier} (${dataType})`,
                    dataType: dataType,
                    identifier: identifier,
                    name: name,
                    componentType: componentType
                };
        }) }
      />);
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
