import React from 'react'

export function Panel({ dock, open = false }) {
    return (
        <div className={styles["sim-container"]}>
            {children}
        </div>
    );
}
