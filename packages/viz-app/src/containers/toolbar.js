import { PropTypes } from 'react';
import getContext from 'recompose/getContext';
import hoistStatics from 'recompose/hoistStatics';
import { container } from '@graphistry/falcor-react-redux';
import { ButtonList,
         ButtonListItem,
         ButtonListItems
} from 'viz-app/components/toolbar';

let Toolbar = ({ children, toolbar = [], selectToolbarItem, ...props } = {}) => {
    return (
        <ButtonList {...props}>
        {toolbar.map((items, index) => (
            <ToolbarItems data={items}
                          popover={children}
                          key={`toolbar-items-${index}`}
                          selectToolbarItem={selectToolbarItem}/>
        ))}
        </ButtonList>
    );
};

Toolbar = container({
    renderLoading: false,
    fragment: (toolbar = []) => `{
        visible, ...${
            ToolbarItems.fragments(toolbar)
        }
    }`,
    // map fragment to component props
    mapFragment: (toolbar = []) => ({
        toolbar, visible: toolbar.visible
    })
})(Toolbar);

let ToolbarItems = ({ name, popover, items = [], selectToolbarItem, ...props } = {}) => {
    return (
        <ButtonListItems name={name} {...props}>
        {items.map((item, index) => (
            <ToolbarItem data={item} popover={popover}
                         key={`${index}: toolbar-item-${item.id}`}
                         selectToolbarItem={selectToolbarItem}/>
        ))}
        </ButtonListItems>
    );
}

ToolbarItems = container({
    renderLoading: false,
    fragment: ({ items } = {}) => `{
        name, items: ${
            ToolbarItem.fragments(items)
        }
    }`
})(ToolbarItems);

let ToolbarItem = container({
    renderLoading: false,
    fragment: () => `{ id, name, type, selected }`,
    mapFragment: (item, { selectToolbarItem }) => ({
        ...item, onItemSelected: selectToolbarItem
    })
})(ButtonListItem);

ToolbarItem = hoistStatics(
    getContext({
        socket: PropTypes.object
    })
)(ToolbarItem);

export { Toolbar, ToolbarItems, ToolbarItem };
