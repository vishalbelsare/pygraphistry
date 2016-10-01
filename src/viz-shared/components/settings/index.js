import d3 from 'd3';
import styles from './styles.less';
import React from 'react';
import Color from 'color';
import RcSwitch from 'rc-switch';
import classNames from 'classnames';
import RcColorPicker from 'rc-color-picker';
import RcSlider from '@graphistry/rc-slider';
import { Panel } from 'react-bootstrap';
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

export function SettingsList({ id, name, children = [], ...props } = {}) {
    return (
        <Panel header={name} style={{ minWidth: `350px` }}>
            {children}
        </Panel>
    );
}

export function ControlsList({ name, children = [], ...props } = {}) {
    return (
        <Grid fluid style={{ padding: 0 }}>
        {name &&
            <Row>
                <Col xs={12} sm={12} md={12} lg={12}>
                    <h5>{name}</h5>
                </Col>
            </Row>}
            {children}
        </Grid>
    );
}

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
                <RcSlider key={`${id}-slider`}
                          min={props.min} max={props.max}
                          step={props.step} defaultValue={state}
                          tipFormatter={tipFormatter}
                          tipTransitionName='rc-slider-tooltip-zoom-down'
                          onChange={(newState) => setValue({
                              id, type, ...rest,
                              state: state = scales[scale].invert(newState)
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
                <input key={`${id}-input`} type='text' defaultValue={state}
                       onChange={(ev) => setValue({
                           id, type, ...rest, state: state = ev.target.value
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
                <RcSwitch key={`${id}-toggle`}
                          checked={state}
                          checkedChildren={'On'}
                          unCheckedChildren={'Off'}
                          onChange={(newState) => setValue({
                              id, type, ...rest, state: state = newState
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
                <RcColorPicker key={`${id}-colors`}
                               animation='slide-up'
                               color={state.hexString()}
                               alpha={state.alpha() * 100}
                               onChange={({ color, alpha }) => setValue({
                                   id, type, ...rest,
                                   state: state = new Color(color)
                                       .alpha(alpha * .01)
                                       .rgbaString()
                               })}/>
            </Col>
        </Row>
    );
}
