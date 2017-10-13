import d3Scale from 'd3-scale';
import styles from './styles.less';
import React from 'react';
import Color from 'color';
import ReactDOM from 'react-dom';
import RcSwitch from 'rc-switch';
import RcColorPicker from 'rc-color-picker';
import { Popover } from 'react-bootstrap';
import { FormControl } from 'react-bootstrap';
import { Grid, Row, Col } from 'react-bootstrap';
import RcSliderBase, { createSliderWithTooltip } from 'rc-slider/lib';
const RcSlider = createSliderWithTooltip(RcSliderBase);

const scales = {
    log: d3Scale
        .log()
        .domain([0.1, 10])
        .range([1, 100]),
    none: d3Scale
        .linear()
        .domain([0, 100])
        .range([0, 100]),
    percent: d3Scale
        .linear()
        .domain([0, 1])
        .range([0, 100])
};

const tooltipFormatters = {
    log: x => x,
    none: x => x,
    percent: x => `${x}%`
};

export function SettingsList({ id, name, side, loading, style, children = [], ...props } = {}) {
    return (
        <Popover
            title={name}
            id={`${id}-popover`}
            style={{ ...style, minWidth: `300px` }}
            {...props}>
            {children}
        </Popover>
    );
}

export function ControlsList({ name, children = [], ...props } = {}) {
    return (
        <Grid fluid style={{ padding: 0 }}>
            {name && (
                <Row style={{ margin: 0 }}>
                    <Col xs={12} sm={12} md={12} lg={12}>
                        <h5 style={{ marginTop: 0 }}>{name}</h5>
                    </Col>
                </Row>
            )}
            {children}
        </Grid>
    );
}

export function Slider({ id, name, type, props = {}, value = 0, setValue, ...rest } = {}) {
    const { scale = 'none' } = props;
    const tipFormatter = tooltipFormatters[scale];
    value = scales[scale](value);
    if (isNaN(value)) {
        value = props.min || 0;
    }
    return (
        <Row className={styles['control-row']}>
            <Col xs={12} sm={12} md={12} lg={12}>
                <Grid fluid>
                    <Row>
                        <Col xs={7} sm={7} md={7} lg={7} className={styles['control-label']}>
                            <span>{name}</span>
                        </Col>
                    </Row>
                    <Row className={styles['slider-row']}>
                        <Col xs={12} sm={12} md={12} lg={12}>
                            <RcSlider
                                key={`${id}-slider`}
                                min={props.min}
                                max={props.max}
                                step={props.step}
                                defaultValue={value}
                                tipFormatter={tipFormatter}
                                tipProps={{
                                    animation: 'zoom-down'
                                }}
                                onChange={newState =>
                                    setValue({
                                        id,
                                        type,
                                        ...rest,
                                        value: (value = scales[scale].invert(newState))
                                    })}
                                {...rest}
                            />
                        </Col>
                    </Row>
                </Grid>
            </Col>
        </Row>
    );
}

export function ToggleButton({ id, name, type, props, value = false, setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={7} sm={7} md={7} lg={7} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={5} sm={5} md={5} lg={5} className={styles['control']}>
                <RcSwitch
                    key={`${id}-toggle`}
                    defaultChecked={value}
                    checkedChildren={'On'}
                    unCheckedChildren={'Off'}
                    onChange={newState =>
                        setValue({
                            id,
                            type,
                            ...rest,
                            value: (value = newState)
                        })}
                />
            </Col>
        </Row>
    );
}

export function ColorPicker({ id, name, type, props, value = 0, setValue, ...rest } = {}) {
    let rowRef,
        val = new Color(value);
    return (
        <Row className={styles['control-row']} ref={r => (rowRef = r)}>
            <Col xs={7} sm={7} md={7} lg={7} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={5} sm={5} md={5} lg={5} className={styles['control']}>
                <RcColorPicker
                    key={`${id}-colors`}
                    animation="slide-up"
                    color={val.hexString()}
                    alpha={val.alpha() * 100}
                    // Fun hack to force the color-picker panel to be a
                    // child of this DOM tree, so that it plays nice w/
                    // react-bootstrap's rootClose Overlay behavior. No
                    // idea why they called the prop getCalendarContainer though.
                    getCalendarContainer={() => ReactDOM.findDOMNode(rowRef)}
                    onChange={({ color, alpha }) =>
                        setValue({
                            id,
                            type,
                            ...rest,
                            value: (val = new Color(color).alpha(alpha * 0.01)).rgbaString()
                        })}
                />
            </Col>
        </Row>
    );
}
