import { Tool } from '../';
import { ButtonGroup, ButtonToolbar } from 'react-bootstrap';

const toolGroupStyle = { marginLeft: 0 };

function ToolGroup({ tools = [], selectToolbarItem, ...props }) {
    return (
        <ButtonToolbar style={toolGroupStyle} {...props}>
            <ButtonGroup vertical>
            {tools.map((tool, index) => (
                <Tool data={tool}
                      key={`${index}: tool-bar-tool-${tool.id}`}
                      selectToolbarItem={selectToolbarItem}/>
            ))}
            </ButtonGroup>
        </ButtonToolbar>
    );

}

export { ToolGroup };
export default ToolGroup;
