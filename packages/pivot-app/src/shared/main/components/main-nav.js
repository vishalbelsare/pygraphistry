import React from 'react';
import Sidebar from './sidebar.js';
import styles from './styles.less';

export default function MainNav({ activeScreen, switchScreen, children }) {
  return (
    <div className={`${styles.wrapper}`}>
      <Sidebar activeScreen={activeScreen} switchScreen={switchScreen} />
      <div className={`${styles['main-panel']}`}>{children}</div>
    </div>
  );
}
