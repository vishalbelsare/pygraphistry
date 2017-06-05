import PropTypes from 'prop-types';
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
                          key={`toolbar-items-${items.id}`}
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

let ToolbarItems = ({ id, name, popover, items = [], selectToolbarItem } = {}) => {
    return (
        <ButtonListItems id={id} name={name}>
        {items.map((item, index) => (
            <ToolbarItem data={item} popover={popover} groupId={id}
                         key={`${index}: toolbar-item-${item.id}`}
                         selectToolbarItem={selectToolbarItem}/>
        ))}
        </ButtonListItems>
    );
}

ToolbarItems = container({
    renderLoading: false,
    fragment: ({ items } = {}) => `{
        id, name, items: ${
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
