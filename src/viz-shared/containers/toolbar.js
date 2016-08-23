import { connect } from 'reaxtor-redux';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';
import { ButtonList,
         ButtonListItem,
         ButtonListItems
} from 'viz-shared/components/toolbar';

export const Toolbar = connect(
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

export const ToolbarItems = connect(
    // toolbar items fragment
    (items = []) => `{
        length, [0...${items.length}]: ${
            ToolbarItem.fragment()
        }
    }`,
    // map fragment to component props
    (items) => ({ items })
)(renderToolbarItems);

export const ToolbarItem = connect(
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
        let selected = false;
        if (type === 'toggle') {
            let panel = props[stateKey];
            if (value && Array.isArray(value)) {
                selected = panel && value[value.length - 1] === panel.id;
            } else if (value) {
                selected = true;
            }
        }
        return { ...item, type, value, state, stateKey, selected };
    },
    // bind action creators
    { onItemSelected: selectToolbarItem }
)(ButtonListItem);

function renderToolbar({ toolbar = [], left, right, bottom, ...props } = {}) {
    return (
        <ButtonList {...props}>
        {toolbar.map((items) => (
            <ToolbarItems key={items.key} falcor={items}
                          {...{ left, right, bottom }}/>
        ))}
        </ButtonList>
    );
}

function renderToolbarItems({ items = [], left, right, bottom, ...props } = {}) {
    return (
        <ButtonListItems {...props}>
        {items.map((item) => (
            <ToolbarItem key={item.key} falcor={item}
                         {...{ left, right, bottom }}/>
        ))}
        </ButtonListItems>
    );
}
