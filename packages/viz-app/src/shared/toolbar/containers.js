import { Tool, ToolGroup } from './';
import { container } from '@graphistry/falcor-react-redux';

export const withToolbarContainer = container({
    renderLoading: false,
    fragment: (toolbar = []) => `{
        visible, ...${
            ToolGroup.fragments(toolbar)
        }
    }`,
    // map fragment to component props
    mapFragment: (toolbar = []) => ({
        toolGroups: toolbar,
        visible: toolbar.visible
    })
});

export const withToolGroupContainer = container({
    renderLoading: false,
    // map fragment to component props
    mapFragment: (tools) => ({ tools }),
    fragment: (tools) => Tool.fragments(tools)
});

export const withToolContainer = container({
    renderLoading: false,
    fragment: () => `{ id, name, selected }`,
    mapFragment: (item, { selectToolbarItem }) => ({
        ...item, onItemSelected: selectToolbarItem
    })
});
