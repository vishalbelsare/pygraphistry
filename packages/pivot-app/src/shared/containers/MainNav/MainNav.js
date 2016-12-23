import React from 'react';
import Sidebar from '../Sidebar/Sidebar.js';
import styles from './styles.less';


export default function renderMainNav({activeScreen, children}) {
    return (
        <div className={`${styles.wrapper}`}>
            <Sidebar activeScreen={activeScreen}/>
            <div className={`${styles['main-panel']}`}>{
                children
            }</div>
        </div>
    );
}
