import { PropTypes } from 'react';
import getContext from 'recompose/getContext';
import hoistStatics from 'recompose/hoistStatics';
import { container } from '@graphistry/falcor-react-redux';
import { ButtonList,
         ButtonListItem,
         ButtonListItems
} from 'viz-app/components/toolbar';

let Toolbar = ({ toolbar = [], selectToolbarItem, ...props } = {}) => {
    return (
        <ButtonList {...props}>
        {toolbar.map((items, index) => (
            <ToolbarItems data={items}
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

let ToolbarItems = ({ items = [], selectToolbarItem, ...props } = {}) => {
    return (
        <ButtonListItems {...props}>
        {items.map((item, index) => (
            <ToolbarItem data={item}
                         key={`${index}: toolbar-item-${item.id}`}
                         selectToolbarItem={selectToolbarItem}/>
        ))}
        </ButtonListItems>
    );
}

ToolbarItems = container({
    renderLoading: false,
    fragment: (toolbarItems) =>
        ToolbarItem.fragments(toolbarItems),
    // map fragment to component props
    mapFragment: (items) => ({ items })
})(ToolbarItems);

let ToolbarItem = container({
    renderLoading: false,
    fragment: () => `{ id, name, selected }`,
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
