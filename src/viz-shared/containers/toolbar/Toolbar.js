import React from 'react'
import { connect } from 'reaxtor-redux';
import ToolbarGroup from './ToolbarGroup';
import { ListGroup, ListGroupItem } from 'react-bootstrap';

function Toolbar({ visible, groups = [] } = {}) {
    if (!visible) {
        return null;
    }
    return (
        <ListGroup>
        {groups.map((group) => (
            <ListGroupItem key={group.key}
                           style={{
                                padding: `2px 0px`,
                                background: `transparent`,
                                borderColor: `rgba(0,0,0,0)`
                            }}>
                <ToolbarGroup falcor={group}/>
            </ListGroupItem>
        ))}
        </ListGroup>
    );
}

function mapStateToFragment(toolbar = []) {
    return `{
        visible, length, [0...${toolbar.length}]: ${
            ToolbarGroup.fragment()
        }
    }`;
}

function mapFragmentToProps(toolbar) {
    return { visible: toolbar.visible, groups: toolbar };
}

export default connect(
    mapStateToFragment,
    mapFragmentToProps
)(Toolbar);

