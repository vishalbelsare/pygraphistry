import React from 'react'
import styles from './views.less';

export function View({ current }) {
    return (
        <div className={styles["sim-container"]}>
            {children}
        </div>
    );
}
