import styles from './styles.less';
import classNames from 'classnames';
import { Button, Tooltip, OverlayTrigger } from 'react-bootstrap';

function ToolTooltip(name) {
    return (
        <Tooltip id='button-list-item-tooltip'>{name}</Tooltip>
    );
}

function Tool({ onItemSelected, ...props }) {

    const { id, name, selected } = props;

    return (
        <OverlayTrigger trigger={['hover']} placement='right' overlay={ToolTooltip(name)}>
            <Button id={id} href='#'
                    active={selected}
                    onClick={(e) => e.preventDefault() || onItemSelected(props)}
                    className={classNames({
                         fa: true,
                         'fa-fw': true,
                         [styles[id]]: true,
                         [styles['tool']]: true,
                         [styles['selected']]: selected
                    })}
            />
        </OverlayTrigger>
    );
}

export { Tool };
export default Tool;
