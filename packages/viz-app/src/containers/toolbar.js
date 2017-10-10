import PropTypes from 'prop-types';
import getContext from 'recompose/getContext';
import hoistStatics from 'recompose/hoistStatics';
import { container } from '@graphistry/falcor-react-redux';
import { ButtonList, ButtonListItem, ButtonListItems } from 'viz-app/components/toolbar';

let Toolbar = (
  { renderPopover, popoverData, isPopoverOpen, toolbar = [], selectToolbarItem, ...props } = {}
) => {
  return (
    <ButtonList {...props}>
      {toolbar.map((items, index) => (
        <ToolbarItems
          data={items}
          popoverData={popoverData}
          renderPopover={renderPopover}
          isPopoverOpen={isPopoverOpen}
          key={`toolbar-items-${items.id}`}
          selectToolbarItem={selectToolbarItem}
        />
      ))}
    </ButtonList>
  );
};

Toolbar = container({
  renderLoading: false,
  fragment: (toolbar = []) => `{
        visible, ...${ToolbarItems.fragments(toolbar)}
    }`,
  // map fragment to component props
  mapFragment: (toolbar = []) => ({
    toolbar,
    visible: toolbar.visible
  })
})(Toolbar);

let ToolbarItems = (
  { id, name, renderPopover, popoverData, isPopoverOpen, items = [], selectToolbarItem } = {}
) => {
  return (
    <ButtonListItems id={id} name={name}>
      {items.map((item, index) => (
        <ToolbarItem
          data={item}
          groupId={id}
          popoverData={popoverData}
          renderPopover={renderPopover}
          isPopoverOpen={isPopoverOpen}
          key={`${index}: toolbar-item-${item.id}`}
          selectToolbarItem={selectToolbarItem}
        />
      ))}
    </ButtonListItems>
  );
};

ToolbarItems = container({
  renderLoading: false,
  fragment: ({ items } = {}) => `{
        id, name, items: ${ToolbarItem.fragments(items)}
    }`
})(ToolbarItems);

let ToolbarItem = container({
  renderLoading: false,
  fragment: () => `{ id, name, type, selected, items: { length } }`,
  mapFragment: (item, { selectToolbarItem }) => ({
    ...item,
    onItemSelected: selectToolbarItem,
    badgeCount: (item && item.items && item.items.length) || 0
  })
})(ButtonListItem);

ToolbarItem = hoistStatics(
  getContext({
    socket: PropTypes.object
  })
)(ToolbarItem);

export { Toolbar, ToolbarItems, ToolbarItem };
