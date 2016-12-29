import React from 'react';
import { container } from '@graphistry/falcor-react-redux';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

import { switchScreen } from '../../actions/app.js';
import navStyles from '../MainNav/styles.less';
import styles from './styles.less';


function NavButton ({activeScreen, switchScreen, tip, screen, faIcon}) {

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


function renderSidebar(props) {
    return (
        <div className={`
                sidebar
                ${navStyles['left-nav']}
                ${styles['left-nav']}`}
             data-color="blue" id="left-nav">

            <div className={styles.logo}>
                <div>
                    <img src="img/logo.png"/>
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

export default container(
    () => `{title}`,
    (state) => state,
    {
        switchScreen: switchScreen
    }
)(renderSidebar);
