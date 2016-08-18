import styles from './toolbar.less';
import classNames from 'classnames';
import { Button } from 'react-bootstrap';

export function ToolbarItem({
        onItemSelected,
        id, beta, name, iFrame, selected
    } = {}) {
    return (
        <Button title={name}
           href='javascript:void(0)'
           onClick={onItemSelected}
           className={classNames({
                [styles[id]]: true,
                [styles['fa']]: true,
                [styles['toolbar-item']]: true
           })}
        />
    );
}

