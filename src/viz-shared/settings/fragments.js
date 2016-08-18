export function SettingsFragment(settings = []) {
    return `{
        name, open, length, [0...${settings.length}]: ${
            ControlsFragment()
        }
    }`;
}

export function ControlsFragment(controls = []) {
    return `{
        id, name, length, [0...${controls.length}]: ${
            ControlFragment()
        }
    }`;
}

export function ControlFragment() {
    return `{
        id, name, type, props, value: {
            ${null}
        }
    }`
}
