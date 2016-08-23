import styles from './styles.less';
import Color from 'color';
import RcSlider from 'rc-slider';
import RcSwitch from 'rc-switch';
import RcColorPicker from 'rc-color-picker';
import { FormControl } from 'react-bootstrap';
import { Grid, Row, Col, ControlLabel } from 'react-bootstrap';

export function Slider({
    id, name, type, props,
    state, setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcSlider defaultValue={state || 1} step={props.step}
                          max={props.max} min={props.min}
                          onChange={(newState) => setValue(
                              id, type, newState
                          )}
                          {...rest}/>
            </Col>
        </Row>
    );
}

export function TextInput({
    id, name, type, props,
    state, setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <input type='text'
                       defaultValue={state}
                       onChange={(ev) => setValue(
                            id, type, ev.target.value
                       )}
                       {...rest}/>
            </Col>
        </Row>
    );
}

export function ToggleButton({
    id, name, type, props,
    state, setValue, ...rest } = {}) {
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcSwitch defaultChecked={state}
                          checkedChildren={'On'}
                          unCheckedChildren={'Off'}
                          onChange={(newState) => setValue(
                              id, type, newState
                          )}/>
            </Col>
        </Row>
    );
}

export function ColorPicker({
    id, name, type, props,
    state, setValue, ...rest } = {}) {
    state = new Color(state);
    return (
        <Row className={styles['control-row']}>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control-label']}>
                <span>{name}</span>
            </Col>
            <Col xs={6} sm={6} md={6} lg={6} className={styles['control']}>
                <RcColorPicker defaultColor={state.hexString()}
                               defaultAlpha={state.alpha() * 100}
                               onChange={({ hsv }) => setValue(
                                    id, type, hsv
                               )}/>
            </Col>
        </Row>
    );
}
