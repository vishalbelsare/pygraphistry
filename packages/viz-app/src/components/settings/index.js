import d3Scale from 'd3-scale';
import styles from './styles.less';
import React from 'react';
import Color from 'color';
import RcSwitch from 'rc-switch';
import RcColorPicker from 'rc-color-picker';
import RcSlider from '@graphistry/rc-slider';
import { Popover } from 'react-bootstrap';
import { FormControl } from 'react-bootstrap';
import { Grid, Row, Col } from 'react-bootstrap';

const scales = {
    log: d3Scale.log().domain([.1, 10]).range([1, 100]),
    none: d3Scale.linear().domain([0, 100]).range([0, 100]),
    percent: d3Scale.linear().domain([0, 1]).range([0, 100])
};

const tooltipFormatters = {
    log: (x) => x,
    none: (x) => x,
    percent: (x) => `${x}%`
};

export function SettingsList({ id, name, side, loading, style, children = [], ...props } = {}) {
    return (
        <Popover title={name} id={`${id}-popover`}
                 style={{ ...style, minWidth: `300px` }} {...props}>
            {children}
        </Popover>
    );
}

export function ControlsList({ name, children = [], ...props } = {}) {
    return (
        <Grid fluid style={{ padding: 0 }}>
        {name &&
            <Row>
                <Col xs={12} sm={12} md={12} lg={12}>
                    <h5 style={{ marginTop: 0 }}>{name}</h5>
                </Col>
            </Row>}
            {children}
        </Grid>
    );
}

export function Slider({
    id, name, type, props = {},
    value = 0, setValue, ...rest } = {}) {
    const { scale = 'none' } = props;
    const tipFormatter = tooltipFormatters[scale];
    value = scales[scale](value);
    if (isNaN(value)) {
        value = props.min || 0;
    }
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcSlider key={`${id}-slider`}
                          min={props.min} max={props.max}
                          step={props.step} defaultValue={value}
                          tipFormatter={tipFormatter}
                          tipTransitionName='rc-slider-tooltip-zoom-down'
                          onChange={(newState) => setValue({
                              id, type, ...rest,
                              value: value = scales[scale].invert(newState)
                          })}
                          {...rest}/>
            </Col>
        </Row>
    );
}

export function TextInput({
    id, name, type, props,
    value = '', setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <input key={`${id}-input`} type='text' defaultValue={value}
                       onChange={(ev) => setValue({
                           id, type, ...rest, value: value = ev.target.value
                       })}
                       {...rest}/>
            </Col>
        </Row>
    );
}

export function ToggleButton({
    id, name, type, props,
    value = false, setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcSwitch key={`${id}-toggle`}
                          checked={value}
                          checkedChildren={'On'}
                          unCheckedChildren={'Off'}
                          onChange={(newState) => setValue({
                              id, type, ...rest, value: value = newState
                          })}/>
            </Col>
        </Row>
    );
}

export function ColorPicker({
    id, name, type, props,
    value = 0, setValue, ...rest } = {}) {
    value = new Color(value);
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcColorPicker key={`${id}-colors`}
                               animation='slide-up'
                               color={value.hexString()}
                               alpha={value.alpha() * 100}
                               onChange={({ color, alpha }) => setValue({
                                   id, type, ...rest,
                                   value: (value = new Color(color)
                                       .alpha(alpha * .01))
                                       .rgbaString()
                               })}/>
            </Col>
        </Row>
    );
}
