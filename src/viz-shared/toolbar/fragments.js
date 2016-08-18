export function ToolbarFragment(toolbar = []) {
    return `{
        visible, length, [0...${toolbar.length}]: ${
            ToolbarGroupFragment()
        }
    }`;
}

export function ToolbarGroupFragment(tools = []) {
    return `{
        name, length, [0...${tools.length}]: ${
            ToolbarGroupItemFragment()
        }
    }`;
}

export function ToolbarGroupItemFragment(toolbarItem) {
    return `{
        id, beta, name, panel, iFrame, selected
    }`;
}
