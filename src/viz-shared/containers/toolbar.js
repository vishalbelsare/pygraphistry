import { container } from '@graphistry/falcor-react-redux';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';
import { ButtonList,
         ButtonListItem,
         ButtonListItems
} from 'viz-shared/components/toolbar';

let Toolbar = ({ toolbar = [], ...props } = {}) => {
    return (
        <ButtonList {...props}>
        {toolbar.map((items, index) => (
            <ToolbarItems data={items} key={index}/>
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

let ToolbarItems = ({ items = [], ...props } = {}) => {
    return (
        <ButtonListItems {...props}>
        {items.map((item, index) => (
            <ToolbarItem data={item}
                         key={`${index}: ${item.id}`}/>
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
    // toolbar item fragment
    ({ type } = {}) => {
        if (!type || type === 'call') {
            return `{ id, name, type, value }`;
        }
        return `{ id, name, type, value, values }`;
    },
    ({ type, value, values ,...rest }, props) => ({
        selected: (type === 'toggle') && value !== 0,
        type, value, values, ...rest
    }),
    // bind action creators
    { onItemSelected: selectToolbarItem }
)(ButtonListItem);

export { Toolbar, ToolbarItems, ToolbarItem };
