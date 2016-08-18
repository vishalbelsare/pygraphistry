import styles from './toolbar.less';

export function Toolbar({ children = [] } = {}) {
    return (
        <div className={styles['toolbar']}>
            {children}
        </div>
    );
}
