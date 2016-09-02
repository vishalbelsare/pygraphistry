import RcSwitch from 'rc-switch';
import styles from './styles.less';
import classNames from 'classnames';
import { PropTypes } from 'react';
import { getContext } from 'recompose';
import {
    Panel,
    Button,
    Popover,
    Tooltip,
    MenuItem,
    OverlayTrigger,
    DropdownButton
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
    templates = [], addExpression, children, name, ...props
}) {
    return (
        <Popover {...props} className={styles['expressions-list']}>
            <Panel style={{ margin: 0 }} footer={
                <ExpressionTemplates name={name}
                                     templates={templates}
                                     addExpression={addExpression}/>
                }>
                {children}
            </Panel>
        </Popover>
    );
}

export function ExpressionTemplates({ name = 'Expression', templates = [], addExpression }) {
    return (
        <DropdownButton bsStyle='link' id='add-expression-dropdown' title={`Add ${name}`}>
        {templates.map(({ name, dataType }, index) => (
            <MenuItem key={`${index}: ${name}`}
                      onSelect={() => addExpression({
                          name, dataType
                      })}>
                {`${name} (${dataType})`}
            </MenuItem>
        ))}
        </DropdownButton>
    );
}

export const ExpressionItem = getContext(
    { ExpressionEditor: PropTypes.func }
)(function ExpressionItem({
    ExpressionEditor,
    id, type, input, level,
    query, title, enabled, attribute,
    removeExpression, updateExpression, setExpressionEnabled
}) {
    return (
        <div>
            <OverlayTrigger
                placement='top'
                overlay={expressionTooltip}>
                <div style={{ border: `1px solid gray`, borderRadius: `3px` }}>
                    <ExpressionEditor name={`expression-${id}`}
                                      value={input}
                                      onChange={updateExpression}
                                      readOnly={level !== 'system'}
                                      width='100%'/>
                </div>
            </OverlayTrigger>
            {level !== 'system' &&
            <div>
                <OverlayTrigger placement='top'
                                overlay={expressionEnabledTooltip}>
                    <RcSwitch checked={enabled}
                              checkedChildren={'On'}
                              unCheckedChildren={'Off'}
                              onChange={(newEnabled) => setExpressionEnabled({
                                  enabled: newEnabled
                              })}/>
                </OverlayTrigger>
                <OverlayTrigger placement='right'
                                overlay={deleteExpressionTooltip}>
                    <Button href='javascript:void(0)'
                            className={classNames({
                                [styles['fa']]: true,
                                [styles['fa-close']]: true
                            })}
                            onClick={() => removeExpression({ id })}/>
                </OverlayTrigger>
            </div> || null}
        </div>
    );
});
