import styles from './toolbar.less';

export function ToolbarItems({ children = [] } = {}) {
    return (
        <div title={name} className={styles['toolbar-group']}>
        {children.reduce((toolbarItems, toolbarItem, index, children) => (
            toolbarItems.concat((index === children.length - 1) ?
                toolbarItem : [
                toolbarItem, <div className={styles['divide-line']}/>
            ])
        ), [])}
        </div>
    );
}

