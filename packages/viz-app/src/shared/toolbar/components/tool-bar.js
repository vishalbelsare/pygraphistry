import { ToolGroup } from '../';
import styles from './styles.less';
import { ListGroup, ListGroupItem } from 'react-bootstrap';

const itemsWrapperStyle = {
    padding: `2px 0px`,
    background: `transparent`,
    borderColor: `rgba(0,0,0,0)`
};

function Toolbar({ visible, toolGroups = [], selectToolbarItem, ...props }) {

    if (!visible) {
        return null;
    }

    return (
        <ListGroup className={styles['tool-bar']} {...props}>
        {toolGroups.map((group, index) => (
            <ListGroupItem key={`tool-bar-group-${index}`} style={itemsWrapperStyle}>
                <ToolGroup data={group} selectToolbarItem={selectToolbarItem}/>
            </ListGroupItem>
        ))}
        </ListGroup>
    );
}

export { Toolbar };
export default Toolbar;
