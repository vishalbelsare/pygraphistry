import { container } from '@graphistry/falcor-react-redux';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';
import { ButtonList,
         ButtonListItem,
         ButtonListItems
} from 'viz-shared/components/toolbar';

export const Toolbar = container(
    // toolbar fragment
    (toolbar = []) => `{
        visible, length, [0...${toolbar.length}]: ${
            ToolbarItems.fragment()
        }
    }`,
    // map fragment to component props
    (toolbar = []) => ({
        toolbar, visible: toolbar.visible
    })
)(renderToolbar);

export const ToolbarItems = container(
    // toolbar items fragment
    (items = []) => `{
        length, [0...${items.length}]: ${
            ToolbarItem.fragment()
        }
    }`,
    // map fragment to component props
    (items) => ({ items })
)(renderToolbarItems);

export const ToolbarItem = container(
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

function renderToolbar({ toolbar = [], ...props } = {}) {
    return (
        <ButtonList {...props}>
        {toolbar.map((items, index) => (
            <ToolbarItems data={items} key={index}/>
        ))}
        </ButtonList>
    );
}

function renderToolbarItems({ items = [], ...props } = {}) {
    return (
        <ButtonListItems {...props}>
        {items.map((item, index) => (
            <ToolbarItem data={item} key={`${index}: ${item.id}`}/>
        ))}
        </ButtonListItems>
    );
}
