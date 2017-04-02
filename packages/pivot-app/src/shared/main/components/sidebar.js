import React from 'react';
import styles from './styles.less';
import classNames from 'classnames';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

function NavButton({activeScreen, switchScreen, tip, screen, faIcon}) {
    return (
        <li className={activeScreen === screen ? 'active' : ''}>
            <OverlayTrigger
                    placement="right"
                    overlay={
                        <Tooltip id={`sidebar-${screen}`}>{tip}</Tooltip>
                    }>
                <a onClick={() => switchScreen(screen)}>
                    <i className={`fa ${faIcon}`}></i>
                </a>
            </OverlayTrigger>
        </li>
    );
}

export default function Sidebar(props) {
    const { switchScreen } = props;
    return (
        <div className={classNames({
                sidebar: true,
                [styles['left-nav']]: true
            })}
             data-color="blue" id="left-nav">

            <div onClick={() => switchScreen('home')} className={styles.logo}>
                <div>
                    <img src="/pivot/img/logo.png"/>
                </div>
            </div>

            <ul className={`nav ${styles.nav}`}>
                <NavButton {...props} tip="Home" screen="home" faIcon="fa-folder-open"/>
                <NavButton {...props} tip="Most recent investigation" screen="investigation" faIcon="fa-eye"/>
                <NavButton {...props} tip="Connectors" screen="connectors" faIcon="fa-plug"/>
            </ul>
        </div>
    );
}
