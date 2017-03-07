import Color from 'color';
import d3Scale from 'd3-scale';
import RcSwitch from 'rc-switch';
import styles from './styles.less';
import RcColorPicker from 'rc-color-picker';
import RcSlider from '@graphistry/rc-slider';
import { Panel } from 'react-bootstrap';
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

const controlsById = {
    // 'display-time-zone': TimeZoneInput
};

const controlsByType = {
    'text': TextInput,
    'bool': ToggleButton,
    'color': ColorPicker,
    'discrete': Slider,
    'continuous': Slider
};

export function OptionControl({ id, type, ...rest } = {}) {
    const Control = controlsById[id] || controlsByType[type];
    return Control && (
        <Control id={id} type={type} {...rest}/>
    ) || null;
}

export default OptionControl;

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
                          min={props.min}
                          max={props.max}
                          step={props.step}
                          defaultValue={value}
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
