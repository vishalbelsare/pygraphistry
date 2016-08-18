export function FiltersFragment(filters = []) {
    return `{
        name, open, length, [0...${filters.length}]: ${
            FilterFragment()
        }
    }`;
}

export function FilterFragment() {
    return `{
        id, title, attribute, level, query
    }`
}
