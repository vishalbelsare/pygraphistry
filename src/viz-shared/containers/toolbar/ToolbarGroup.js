import React from 'react'
import { connect } from 'reaxtor-redux';
import ToolbarGroupItem from './ToolbarGroupItem';
import { ButtonGroup, ButtonToolbar } from 'react-bootstrap';

function ToolbarItems({ name, tools = [] } = []) {
    return (
        <ButtonToolbar>
            <ButtonGroup vertical>
                {tools.map((tool) => (
                    <ToolbarGroupItem key={tool.key}
                                 falcor={tool}/>
                ))}
            </ButtonGroup>
        </ButtonToolbar>
    );
}

function mapStateToFragment({ tools = [] } = {}) {
    return `{
        name, length, [0...${tools.length}]: ${
            ToolbarGroupItem.fragment()
        }
    }`;
}

function mapFragmentToProps(tools) {
    return { name: tools.name, tools: tools }
}

export default connect(
    mapStateToFragment,
    mapFragmentToProps
)(ToolbarItems);
