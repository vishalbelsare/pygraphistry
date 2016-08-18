import React from 'react'
import styles from './views.less';

export function Views({ children, current } = {}) {
    return (
        <div className={styles["sim-container"]}>
            {children}
        </div>
    );
}
