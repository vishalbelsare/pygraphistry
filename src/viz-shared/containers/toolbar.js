import { PropTypes } from 'react';
import { getContext, hoistStatics } from 'recompose';
import { container } from '@graphistry/falcor-react-redux';
import { ButtonList,
         ButtonListItem,
         ButtonListItems
} from 'viz-shared/components/toolbar';

let Toolbar = ({ toolbar = [], selectToolbarItem, ...props } = {}) => {
    return (
        <ButtonList {...props}>
        {toolbar.map((items, index) => (
            <ToolbarItems data={items} key={index}
                          selectToolbarItem={selectToolbarItem}/>
        ))}
        </ButtonList>
    );
};

Toolbar = container(
    // toolbar fragment
    ({ length = 0 } = {}) => `{
        visible, length, [0...${length}]: ${
            ToolbarItems.fragment()
        }
    }`,
    // map fragment to component props
    (toolbar = []) => ({
        toolbar, visible: toolbar.visible
    })
)(Toolbar);

let ToolbarItems = ({ items = [], selectToolbarItem, ...props } = {}) => {
    return (
        <ButtonListItems {...props}>
        {items.map((item, index) => (
            <ToolbarItem data={item}
                         key={`${index}: ${item.id}`}
                         selectToolbarItem={selectToolbarItem}/>
        ))}
        </ButtonListItems>
    );
}

ToolbarItems = container(
    // toolbar items fragment
    ({ length = 0 } = {}) => `{
        length, [0...${length}]: ${
            ToolbarItem.fragment()
        }
    }`,
    // map fragment to component props
    (items) => ({ items })
)(ToolbarItems);

let ToolbarItem = container(
    () => `{ id, name, selected }`,
    (item, { selectToolbarItem }) => ({
        ...item, onItemSelected: selectToolbarItem
    })
)(ButtonListItem);

ToolbarItem = hoistStatics(
    getContext({
        socket: PropTypes.object
    })
)(ToolbarItem);

export { Toolbar, ToolbarItems, ToolbarItem };
