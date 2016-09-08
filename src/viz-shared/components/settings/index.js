import d3 from 'd3';
import styles from './styles.less';
import React from 'react';
import Color from 'color';
import RcSlider from '@graphistry/rc-slider';
import RcSwitch from 'rc-switch';
import RcColorPicker from 'rc-color-picker';
import { FormControl } from 'react-bootstrap';
import { Grid, Row, Col, ControlLabel } from 'react-bootstrap';

const scales = {
    log: d3.scale.log().domain([.1, 10]).range([1, 100]),
    none: d3.scale.linear().domain([0, 100]).range([0, 100]),
    percent: d3.scale.linear().domain([0, 1]).range([0, 100])
};

const tooltipFormatters = {
    log: (x) => x,
    none: (x) => x,
    percent: (x) => `${x}%`
};

export function Slider({
    id, name, type, props = {},
    state = 0, setValue, ...rest } = {}) {
    const { scale = 'none' } = props;
    const tipFormatter = tooltipFormatters[scale];
    state = scales[scale](state);
    if (isNaN(state)) {
        state = props.min || 0;
    }
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcSlider min={props.min} max={props.max}
                          step={props.step} defaultValue={state}
                          tipFormatter={tipFormatter}
                          tipTransitionName='rc-slider-tooltip-zoom-down'
                          onChange={(newState) => setValue({
                              id, type, ...rest,
                              state: scales[scale].invert(newState)
                          })}
                          {...rest}/>
            </Col>
        </Row>
    );
}

export function TextInput({
    id, name, type, props,
    state = '', setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <input type='text' defaultValue={state}
                       onChange={(ev) => setValue({
                           id, type, ...rest, state: ev.target.value
                       })}
                       {...rest}/>
            </Col>
        </Row>
    );
}

export function ToggleButton({
    id, name, type, props,
    state = false, setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcSwitch defaultChecked={state}
                          checkedChildren={'On'}
                          unCheckedChildren={'Off'}
                          onChange={(newState) => setValue({
                              id, type, ...rest, state: newState
                          })}/>
            </Col>
        </Row>
    );
}

export function ColorPicker({
    id, name, type, props,
    state = 0, setValue, ...rest } = {}) {
    state = new Color(state);
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcColorPicker animation='slide-up'
                               color={state.hexString()}
                               alpha={state.alpha() * 100}
                               onChange={({ color, alpha }) => setValue({
                                   id, type, ...rest,
                                   state: new Color(color)
                                       .alpha(alpha * .01)
                                       .rgbaString()
                               })}/>
            </Col>
        </Row>
    );
}
