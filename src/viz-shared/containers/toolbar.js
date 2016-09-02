import { container } from 'reaxtor-redux';
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
    ({ type, stateKey } = {}) => {
        if (type === 'call') {
            return `{ id, name, type, value }`;
        } else if (!stateKey) {
            return `{ id, name, type, value, values, stateKey }`;
        } else if (type !== 'toggle') {
            return `{
                id, name, type, value, stateKey, state: { ${stateKey} }
            }`;
        }
        return `{
            id, name, type, value, values, stateKey, state: { ${stateKey} }
        }`;
    },
    ({ stateKey, state, value, type, ...item }, props) => {
        state = state && state[stateKey];
        let selected = false, overlay;
        if (type === 'toggle') {
            if (Array.isArray(value)) {
                let panel = props[stateKey];
                if (panel && value[value.length - 1] === panel.id) {
                    selected = true;
                    overlay = props[`${stateKey}Overlay`];
                }
            } else if (value) {
                selected = true;
            }
        }
        return { ...item, type, value, state, overlay, stateKey, selected };
    },
    // bind action creators
    { onItemSelected: selectToolbarItem }
)(ButtonListItem);

function renderToolbar({ toolbar = [], leftOverlay, left, right, bottom, ...props } = {}) {
    return (
        <ButtonList {...props}>
        {toolbar.map((items, index) => (
            <ToolbarItems data={items} key={index}
                          left={left} leftOverlay={leftOverlay}
                          right={right} bottom={bottom}/>
        ))}
        </ButtonList>
    );
}

function renderToolbarItems({ items = [], leftOverlay, left, right, bottom, ...props } = {}) {
    return (
        <ButtonListItems {...props}>
        {items.map((item, index) => (
            <ToolbarItem data={item}
                         key={`${index}: ${item.id}`}
                         left={left} leftOverlay={leftOverlay}
                         right={right} bottom={bottom}/>
        ))}
        </ButtonListItems>
    );
}
